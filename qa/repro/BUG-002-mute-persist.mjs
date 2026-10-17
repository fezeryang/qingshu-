// BUG-002 repro: ?mute=1 is persisted to localStorage, so later normal loads are silent.
// Run: node qa/repro/BUG-002-mute-persist.mjs   (uses the shared browser lock via tools/browser.mjs)
import { withGame } from '../../tools/browser.mjs';
await withGame(async (page, { url }) => {
  const base = url.split('?')[0];
  await page.goto(`${base}?lowfx=1&mute=1`);
  await page.waitForFunction(() => window.__qs?.ready === true);
  await page.waitForTimeout(1500);
  const stored = await page.evaluate(() => localStorage.getItem('qingshu.settings'));
  await page.goto(`${base}?lowfx=1`);
  await page.waitForFunction(() => window.__qs?.ready === true);
  const mv = await page.evaluate(() => window.__qs.ctx.settings.masterVolume);
  console.log({ storedAfterMuteBoot: stored, masterVolumeOnNormalReload: mv, bug: mv === 0 });
}, { query: 'lowfx=1', waitReady: false });
