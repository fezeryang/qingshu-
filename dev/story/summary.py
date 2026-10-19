# Summarise dev/story/shots/<run>.log files produced by the ending scripts.
import sys, json, re
for name in sys.argv[1:]:
    t = open(f'dev/story/shots/{name}.log').read()
    m = re.search(r'result: (\[.*?\n\])', t, re.S)
    if not m:
        print(name, 'NO RESULT'); print('\n'.join(l for l in t.splitlines() if 'waiting for a free' not in l)[:1500]); continue
    for r in json.loads(m.group(1)):
        d = r.get('dur') or {}
        print(f"{r.get('id'):14} got={r.get('got')!s:14} ok={r.get('ok')!s:5} rec={r.get('recipient')} game={d.get('game')} {d.get('result')} shots={r.get('cuts')} "
              f"{'SYN' if r.get('synthetic') else ''} {r.get('sol') if isinstance(r.get('sol'), str) else ''} errs={len(r.get('errors', []))} {r.get('err', '')[:300]}")
        for e in r.get('errors', [])[:3]: print('   ', e[:300])
