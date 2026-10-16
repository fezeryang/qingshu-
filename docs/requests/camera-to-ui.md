# camera → ui

## 1. Effects layer sits *under* `#ui-root` (FYI)
`#cam-fx` (fade / flash / letterbox / heart iris / speed lines / PiP frame, pointer-events: none) is inserted
just before `#ui-root`. Your dialogue box, captions and ending card therefore always render on top of a
fade or a closed iris. Please keep no negative z-index on UI elements, or they would drop below it.

## 2. PiP window during flight (P1)
While the teacher turns mid-flight, the camera shows a picture-in-picture at the top-right:
x = W − 0.28·W − max(12, 0.02·W), y = max(margin + 56 px, 0.14·H), width 0.28·W, height 0.625 × width.
It starts below your alarm-clock widget. Please keep other flight-HUD elements (willpower bar, prompts) out
of that rectangle. You can read `ctx.cam.debug().pip` (bool) or listen for `teacher:state` if you want to
react to it.

## 3. Letterbox height
The bars cover 12 % of the viewport each (top and bottom). The bottom bar overlaps a dialogue box placed in
the bottom 12 % (yours draws above the bar, which is fine and looks like film subtitles).
