# Frame Pacing Optimization

## Measured bottlenecks

A Chromium CPU profile of a seeded classroom round identified repeated curtain vertex/normal
reconstruction, character matrix traversal, face canvas painting, and charge-preview simulation.
The baseline repainted faces even when only an invisible tear-animation counter changed.

Normal-quality measurements at 960 × 540, seed 31, shadows enabled, with sequential browser runs:

| CPU work | Before | After |
| --- | ---: | ---: |
| Aim tick, mean (600 frames) | 4.10 ms | 1.99 ms |
| Aim tick, p95 | 9.50 ms | 4.40 ms |
| Charging tick, mean (90 frames) | 5.32 ms | 3.42 ms |
| Face repaints during 10 s of aim | 2329 | 671 |

These are CPU tick timings, excluding rendering. Cosmetic randomness and host scheduling affect
individual runs. Headless Chromium uses SwiftShader; these numbers do **not** predict a player's
GPU frame rate. Render samples in the raw baseline and final report use different phases and
must not be compared. Raw evidence: `qa/data/performance-optimization.json`.

## Implementation

- Curtains use GPU vertex deformation and analytic normals. The depth shader uses the same
  displacement, preserving moving shadows without per-frame geometry uploads.
- Face textures repaint only for visible state changes. Internal character queries reuse world
  matrices after FK/IK; external head/hand queries retain their live-transform behavior.
- Charging previews update at 30 Hz. Input, power, release calculations, public prediction and
  flight physics retain their existing update cadence and precision.
- Normal rendering caps DPR at 1.5 and the initial buffer at 1920 × 1080 pixels. Persistent frame
  times over 20 ms lower the resolution scale by 0.1, down to 0.6. Eight healthy seconds below
  17.5 ms allow one recovery step. CSS/HUD resolution and camera aspect never change. Lowfx keeps
  its existing DPR 1 and disabled shadows.
- The default framebuffer is no longer preserved between frames. Buffer resizing performs one
  allocation and skips unchanged sizes. Hidden tabs suspend automatic ticks/renders; pause and
  visibility changes reset timing history. Manual tests never adapt resolution.

`engine.performance.scale` and `.frameMs` expose the current scale and last sampling-window mean
for debugging. Frame-budget sampling/reset methods are engine internals. They use real RAF timing,
not scaled game time, so slow motion does not request a lower resolution.

## Reproduction

```sh
node --test dev/perf/budget.test.mjs
node tools/shot.mjs --script dev/perf/measure.js --query 'mute=1&round=300' --out dev/perf/shots/measure
node tools/shot.mjs --script dev/perf/regression.js --query 'mute=1&round=300' --out dev/perf/shots/regression
node tools/shot.mjs --script dev/perf/resolution.js --query 'mute=1&round=300' --out dev/perf/shots/resolution
npm test -- --only B3,B4,B6,F3,I1,I2 --no-shots
npm run check -- --smoke
```

Run timing benchmarks without other browser tests in parallel. The browser regressions verify
face invalidation, static curtain buffers, shader compilation, immediate charge cancellation and
release, 30 Hz preview updates, DPR adaptation, buffer allocations, CSS layout and PiP rendering.

## Final validation

All six focused acceptance specs passed: B3, B4, B6, F3, I1 and I2. The final I2 run, after the
selective collider refresh, averaged **1.87 ms** overall (aim 1.609 ms, flight 3.504 ms, ending
1.629 ms); all phase averages were under 4 ms. Normal-mode I1 peaked at 177 draw calls and 547k
triangles. Static checks (101 files), the full-round smoke test, and seven unit tests passed.

The collider regression matched a full hierarchy update in 96 cases, including 72 raised-arm
cases. The same-gender ending replay reached its card after classroom → cherry path → canteen →
classroom, with both punishment actors correctly framed and no errors. Screenshots reviewed:
`dev/perf/shots/regression/{classroom,flight-pip,curtain-gust}.png`,
`dev/perf/shots/resolution/adaptive-pip.png`, and `dev/perf/shots/ending/m-punishment.png`.
