// STUB — to be replaced by the ui-designer agent. Contract: docs/CONTRACTS.md §4.7
export async function install(ctx) {
  const { time } = ctx;
  const root = document.getElementById('ui-root');
  const layer = (html) => {
    const el = document.createElement('div');
    el.className = 'stub-layer';
    el.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;pointer-events:auto;font:20px sans-serif;color:#fff;background:rgba(0,0,0,.45)';
    el.innerHTML = html;
    root.appendChild(el);
    return el;
  };
  let chooser = null;
  const hudEl = document.createElement('div');
  hudEl.style.cssText = 'position:fixed;left:12px;top:12px;color:#fff;font:16px monospace;text-shadow:0 1px 2px #000;white-space:pre';
  root.appendChild(hudEl);
  const sayEl = document.createElement('div');
  sayEl.style.cssText = 'position:fixed;left:50%;bottom:40px;transform:translateX(-50%);color:#fff;background:rgba(0,0,0,.6);padding:10px 16px;font:18px sans-serif;display:none';
  root.appendChild(sayEl);

  const ui = {
    title() {
      return new Promise((resolve) => {
        const el = layer('<h1>情书抛物线</h1><div><button data-g="m">我是男生</button> <button data-g="f">我是女生</button></div>');
        el.querySelectorAll('button').forEach((b) => b.onclick = () => { ctx.audio.unlock(); el.remove(); resolve({ action: 'start', playerGender: b.dataset.g }); });
      });
    },
    letterEditor({ presets }) {
      return new Promise((resolve) => {
        const el = layer(presets.map((p, i) => `<button data-i="${i}">${p.title}</button>`).join(''));
        el.querySelectorAll('button').forEach((b) => b.onclick = () => { el.remove(); const p = presets[+b.dataset.i]; resolve({ text: p.text, presetId: p.id }); });
      });
    },
    async crumple() { await time.waitUI(0.2); },
    hud: {
      show() {}, setObjective() {}, setSuspicion() {}, setPower() {}, setTimer() {}, setTeacherState() {}, prompt() {}, setWillpower() {},
    },
    async say(speaker, text) {
      sayEl.style.display = 'block';
      sayEl.textContent = `${speaker}：${text}`;
      await time.waitUI(1.2 + text.length * 0.05);
      sayEl.style.display = 'none';
    },
    async bubble() {},
    async caption(text) { await ui.say('', text); },
    async letterReveal(text) { await ui.say('情书', text); },
    endingCard(ending, info) {
      return new Promise((resolve) => {
        const el = layer(`<h2>${ending.title}</h2><p>${info.unlocked}/${info.total}</p><div><button data-c="retry">再来一局</button> <button data-c="title">回到标题</button></div>`);
        chooser = (c) => { chooser = null; el.remove(); resolve(c); };
        el.querySelectorAll('button').forEach((b) => b.onclick = () => chooser(b.dataset.c));
      });
    },
    gallery() { return Promise.resolve(); },
    toast() {},
    closeAll() { root.querySelectorAll('.stub-layer').forEach((e) => e.remove()); },
    debugChoose(c) { chooser?.(c); },
  };
  ctx.engine.onUpdate(() => {
    const r = ctx.round;
    if (!r) return;
    hudEl.textContent = `phase ${ctx.flow.phase}  time ${r.timeLeft.toFixed(0)}  suspicion ${(r.suspicion * 100).toFixed(0)}%  teacher ${ctx.ai.teacher.state}  power ${(ctx.gameplay.aim.power * 100).toFixed(0)}`;
  }, ctx.engine.ORDER.UI);
  ctx.ui = ui;
}
