"""edge-tts worker for tools/voices/build.mjs (owner: qs-audio-composer).

Reads a jobs JSON file: [{hash, text, voice, rate, pitch}], renders each line with Microsoft neural
voices (edge-tts), trims leading silence and transcodes to mono 24 kHz ~32 kbps MP3 with ffmpeg,
writing <outdir>/<hash>.mp3. Prints one JSON result per line: {hash, ok, dur, err}.
Throttled (small concurrency + delay) and retried with exponential backoff.
"""
import asyncio, json, os, subprocess, sys, tempfile, random

import edge_tts

CONCURRENCY = 3
RETRIES = 5


def transcode(src, dst):
    subprocess.run([
        'ffmpeg', '-y', '-loglevel', 'error', '-i', src,
        '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:start_duration=0.02,areverse,'
               'silenceremove=start_periods=1:start_threshold=-45dB:start_duration=0.02,areverse,'
               'afade=t=in:d=0.01',
        '-ac', '1', '-ar', '24000', '-b:a', '32k', dst,
    ], check=True)
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dst],
                         check=True, capture_output=True, text=True).stdout.strip()
    return round(float(out or 0), 3)


async def one(job, outdir, sem):
    async with sem:
        last = None
        for attempt in range(RETRIES):
            tmp = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False).name
            try:
                comm = edge_tts.Communicate(job['text'], job['voice'], rate=job['rate'], pitch=job['pitch'])
                await comm.save(tmp)
                if os.path.getsize(tmp) < 500:
                    raise RuntimeError('empty audio')
                dst = os.path.join(outdir, job['hash'] + '.mp3')
                dur = await asyncio.to_thread(transcode, tmp, dst)
                print(json.dumps({'hash': job['hash'], 'ok': True, 'dur': dur}), flush=True)
                await asyncio.sleep(0.15 + random.random() * 0.2)  # throttle
                return
            except Exception as e:  # network hiccups, rate limits
                last = repr(e)
                await asyncio.sleep(min(20, 1.5 * 2 ** attempt) + random.random())
            finally:
                try: os.unlink(tmp)
                except OSError: pass
        print(json.dumps({'hash': job['hash'], 'ok': False, 'err': last}), flush=True)


async def main():
    jobs = json.load(open(sys.argv[1], encoding='utf-8'))
    outdir = sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    sem = asyncio.Semaphore(CONCURRENCY)
    await asyncio.gather(*(one(j, outdir, sem) for j in jobs))


if __name__ == '__main__':
    asyncio.run(main())
