/* ==========================================================================
   Interactive tools inside case studies.
   A project opts in with  tool: { type: "magnetic" | "mood" | "flow", at: 2 }
   Each tool returns a clean-up function so it stops when you leave the page.
   ========================================================================== */
(() => {
const T = {};
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = c => "#" + c.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("").toUpperCase();
const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

function head(title, hint) { return `<div class="th2"><b>${title}</b><span>${hint}</span></div>` }
function slider(c) {
  return `<label class="ctrl"><span class="lbl"><span>${c.label}</span><output id="o-${c.id}"></output></span>
    <input type="range" id="t-${c.id}" min="${c.min}" max="${c.max}" step="${c.step || 1}" value="${c.val}"></label>`;
}
function bindSliders(el, defs, onChange) {
  const v = {};
  defs.forEach(c => {
    const i = el.querySelector("#t-" + c.id), o = el.querySelector("#o-" + c.id);
    const set = init => { v[c.id] = +i.value; o.textContent = c.fmt ? c.fmt(+i.value) : i.value; if (init !== true && onChange) onChange(c.id) };
    i.addEventListener("input", set); set(true);
  });
  return v;
}
// Runs a frame loop only while the tool is on screen.
function runner(el, frame) {
  let raf = 0, on = false, last = performance.now();
  const tick = now => { const dt = Math.min(50, now - last); last = now; frame(now, dt); raf = on ? requestAnimationFrame(tick) : 0 };
  const io = new IntersectionObserver(es => es.forEach(e => { on = e.isIntersecting; if (on && !raf) { last = performance.now(); raf = requestAnimationFrame(tick) } }), { threshold: .05 });
  io.observe(el);
  return () => { on = false; cancelAnimationFrame(raf); io.disconnect() };
}
function fitCanvas(cv, scale = Math.min(2, devicePixelRatio || 1)) {
  const r = cv.getBoundingClientRect();
  cv.width = Math.max(1, Math.round(r.width * scale)); cv.height = Math.max(1, Math.round(r.height * scale));
  return { w: r.width, h: r.height, s: scale };
}

/* ------------------------------------------------------------------
   Ford Electric: a field of lines that turns towards your cursor     */
T.magnetic = (el, o) => {
  const defs = [
    { id: "scale", label: "Scale", min: 14, max: 56, val: 26 },
    { id: "weight", label: "Weight", min: .5, max: 5, step: .1, val: 1.6 },
    { id: "reach", label: "Reach", min: 60, max: 600, step: 10, val: 260 },
    { id: "twist", label: "Pull ↔ Orbit", min: 0, max: 100, val: 0, fmt: v => v + "%" }
  ];
  el.innerHTML = head("Ford EV graphic", "Move across it, then tweak it.") +
    `<div class="stage" style="background:#08152B"><canvas aria-label="Interactive Ford EV graphic"></canvas></div>
     <div class="ctrls">${defs.map(slider).join("")}</div>`;
  const cv = el.querySelector("canvas"), ctx = cv.getContext("2d"), stage = el.querySelector(".stage");
  const v = bindSliders(el, defs);
  let dim = fitCanvas(cv), mx = dim.w / 2, my = dim.h / 2, tx = mx, ty = my, lastMove = -1e9;
  const ro = new ResizeObserver(() => { dim = fitCanvas(cv) }); ro.observe(stage);
  const move = e => { const r = stage.getBoundingClientRect(); tx = e.clientX - r.left; ty = e.clientY - r.top; lastMove = performance.now() };
  stage.addEventListener("pointermove", move); stage.addEventListener("pointerdown", move);
  const blue = [77, 163, 255], white = [236, 240, 248];
  const draw = (now) => {
    if (now - lastMove > 2200) { const t = now / 1000; tx = dim.w * (.5 + .32 * Math.sin(t * .7)); ty = dim.h * (.5 + .28 * Math.sin(t * 1.1 + 1)) }
    mx += (tx - mx) * .12; my += (ty - my) * .12;
    const { w, h, s } = dim; ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.fillStyle = "#08152B"; ctx.fillRect(0, 0, w, h);
    const sp = v.scale, R = v.reach, tw = v.twist / 100 * Math.PI / 2;
    ctx.lineCap = "round";
    for (let y = sp / 2; y < h; y += sp) for (let x = sp / 2; x < w; x += sp) {
      const dx = x - mx, dy = y - my, d2 = dx * dx + dy * dy, f = Math.exp(-d2 / (R * R));
      const a = Math.atan2(dy, dx) + tw, len = sp * .42 * (.35 + 1.05 * f);
      const c = mix(white, blue, f);
      ctx.strokeStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${.22 + .78 * f})`;
      ctx.lineWidth = v.weight * (.6 + .9 * f);
      const ca = Math.cos(a) * len / 2, sa = Math.sin(a) * len / 2;
      ctx.beginPath(); ctx.moveTo(x - ca, y - sa); ctx.lineTo(x + ca, y + sa); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(77,163,255,.9)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.stroke();
  };
  if (o.reduce) { draw(0); return () => ro.disconnect() }
  const stop = runner(el, draw);
  return () => { stop(); ro.disconnect() };
};

/* ------------------------------------------------------------------
   Compass Pathways: a gradient that follows your mood                 */
T.mood = (el, o) => {
  const corners = { // top-left, top-right, bottom-left, bottom-right: bright, saturated moods
    Calm:     ["#00D1B2", "#2F80FF", "#8C6CFF", "#5CF2D0"],
    Joyful:   ["#FF5A1F", "#FF2E93", "#FFD000", "#FF7AC8"],
    Low:      ["#1F3BFF", "#5B2EFF", "#00A3FF", "#140E6B"],
    Restless: ["#FF1744", "#B000FF", "#FF8A00", "#5A00D6"]
  };
  const defs = [{ id: "grain", label: "Grain", min: 0, max: 100, val: 22, fmt: x => x + "%" }];
  const noise = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .9 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>');
  el.innerHTML = head("Mood gradient", "Drag the dot to set a mood.") +
    `<div class="stage"><canvas width="96" height="54" style="image-rendering:auto"></canvas>
      <div class="grain" style="position:absolute;inset:0;background:url('${noise}');mix-blend-mode:overlay;pointer-events:none"></div>
      <span class="mood"></span>
      <div class="pad" role="slider" aria-label="Mood" tabindex="0"><small style="left:8px;top:6px">Calm</small><small style="right:8px;top:6px">Joyful</small><small style="left:8px;bottom:6px">Low</small><small style="right:8px;bottom:6px">Restless</small><span class="dot"></span></div>
    </div>
    <div class="ctrls"><div class="swatches"></div>${slider(defs[0])}<button class="chip" data-shuffle>Shuffle</button></div>`;
  const cv = el.querySelector("canvas"), ctx = cv.getContext("2d"), pad = el.querySelector(".pad"), dot = el.querySelector(".dot");
  const label = el.querySelector(".mood"), sw = el.querySelector(".swatches"), grain = el.querySelector(".grain");
  const v = bindSliders(el, defs, () => grain.style.opacity = v.grain / 100);
  grain.style.opacity = v.grain / 100;
  let px = .18, py = .2, ex = px, ey = py, seed = Math.random() * 100;
  const C = Object.fromEntries(Object.entries(corners).map(([k, a]) => [k, a.map(hex)]));
  // lean towards the nearest mood so blends stay vivid rather than going grey
  const palette = () => {
    const w = [(1 - ex) * (1 - ey), ex * (1 - ey), (1 - ex) * ey, ex * ey].map(v => Math.pow(v, 2.6)), s = w.reduce((a, b) => a + b, 0) || 1;
    const K = [C.Calm, C.Joyful, C.Low, C.Restless];
    return [0, 1, 2, 3].map(i => [0, 1, 2].map(ch => K.reduce((acc, k, j) => acc + k[i][ch] * w[j] / s, 0)));
  };
  const name = () => {
    const d = Math.hypot(ex - .5, ey - .5); if (d < .16) return "Steady";
    return ey < .5 ? (ex < .5 ? "Calm" : "Joyful") : (ex < .5 ? "Low" : "Restless");
  };
  const setDot = () => { dot.style.left = px * 100 + "%"; dot.style.top = py * 100 + "%" };
  const drag = e => { const r = pad.getBoundingClientRect(); px = clamp((e.clientX - r.left) / r.width); py = clamp((e.clientY - r.top) / r.height); setDot() };
  pad.addEventListener("pointerdown", e => { pad.setPointerCapture(e.pointerId); drag(e) });
  pad.addEventListener("pointermove", e => { if (e.buttons) drag(e) });
  pad.addEventListener("keydown", e => { const k = { ArrowLeft: [-.05, 0], ArrowRight: [.05, 0], ArrowUp: [0, -.05], ArrowDown: [0, .05] }[e.key]; if (k) { e.preventDefault(); px = clamp(px + k[0]); py = clamp(py + k[1]); setDot() } });
  el.querySelector("[data-shuffle]").onclick = () => { seed = Math.random() * 100 };
  setDot();
  let lastName = "", swT = 0;
  const draw = (now, dt) => {
    ex += (px - ex) * .06; ey += (py - ey) * .06;
    const pal = palette(), t = now / 1000 * (.12 + ex * .8), jit = ex * ey;
    const W = cv.width, H = cv.height;
    ctx.fillStyle = toHex(pal[3]); ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 5; i++) {
      const c = pal[i % 3], k = seed + i * 1.7;
      const x = W * (.5 + .42 * Math.sin(t * (.6 + i * .13) + k) + jit * .05 * Math.sin(now / 90 + i));
      const y = H * (.5 + .4 * Math.cos(t * (.5 + i * .11) + k * 1.3));
      const r = W * (.38 + .14 * Math.sin(t + i));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${c.map(Math.round).join(",")},.95)`); g.addColorStop(1, `rgba(${c.map(Math.round).join(",")},0)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    const n = name(); if (n !== lastName) { lastName = n; label.textContent = n }
    const lum = pal.reduce((s, c) => s + (.2126 * c[0] + .7152 * c[1] + .0722 * c[2]), 0) / 4;
    label.style.color = lum < 120 ? "#F4F4F0" : "#141414";
    swT -= dt; if (swT <= 0) { swT = 200; sw.innerHTML = pal.map(c => `<span><i style="background:${toHex(c)}"></i>${toHex(c)}</span>`).join("") }
  };
  if (o.reduce) { ex = px; ey = py; draw(0, 999); const h = () => { ex = px; ey = py; draw(0, 999) }; pad.addEventListener("pointermove", h); pad.addEventListener("pointerdown", h); return () => {} }
  return runner(el, draw);
};

/* ------------------------------------------------------------------
   Scottish Widows: Flowmotion, from pragmatic to expressive           */
T.flow = (el, o) => {
  const PRAG = [.4, 0, .2, 1], EXPR = [.75, -.45, .2, 1.55];
  el.innerHTML = head("Flowmotion", "Slide from pragmatic to expressive. Try your own words.") +
    `<div class="stage flowstage" title="Click to replay">
      <svg class="rib" preserveAspectRatio="none" aria-hidden="true"><path fill="#D9262E"/></svg>
      <div class="flowtext" aria-live="polite"></div></div>
     <div class="ctrls">
      <input class="tin" id="t-text" maxlength="60" value="Looking forward, to looking forward." aria-label="Your words">
      ${slider({ id: "exp", label: "Pragmatic ↔ Expressive", min: 0, max: 100, val: 65, fmt: x => x + "%" })}
      <span class="curve"><svg viewBox="-10 -40 120 180"><path fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></svg><code></code></span>
      <button class="chip" data-replay>Replay</button>
     </div>`;
  const box = el.querySelector(".flowtext"), stage = el.querySelector(".flowstage"), rib = el.querySelector(".rib"), ribP = rib.querySelector("path");
  const input = el.querySelector("#t-text"), curveP = el.querySelector(".curve path"), code = el.querySelector(".curve code");
  let chars = [], start = performance.now(), e = .65, bz = PRAG, total = 1000;
  const v = bindSliders(el, [{ id: "exp", fmt: x => x + "%" }], () => { e = v.exp / 100; setCurve(); replay() });
  function bez(x1, y1, x2, y2) { // returns easing(t)
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = t => ((ax * t + bx) * t + cx) * t, sy = t => ((ay * t + by) * t + cy) * t, dx = t => (3 * ax * t + 2 * bx) * t + cx;
    return x => { let t = x; for (let i = 0; i < 6; i++) { const d = dx(t); if (Math.abs(d) < 1e-6) break; t -= (sx(t) - x) / d } return sy(clamp(t)) };
  }
  let ease = bez(...PRAG);
  function setCurve() {
    bz = PRAG.map((p, i) => lerp(p, EXPR[i], e)); ease = bez(...bz);
    curveP.setAttribute("d", `M0 100 C ${bz[0] * 100} ${100 - bz[1] * 100} ${bz[2] * 100} ${100 - bz[3] * 100} 100 0`);
    code.textContent = `cubic-bezier(${bz.map(n => n.toFixed(2)).join(", ")})`;
  }
  function build() {
    const words = (input.value.trim() || "Flow").split(/\s+/);
    box.innerHTML = words.map(w => `<span class="w">${[...w].map(c => `<span class="ch">${c.replace(/[&<>]/g, "")}</span>`).join("")}</span>`).join(" ");
    chars = [...box.querySelectorAll(".ch")];
  }
  function replay() { start = performance.now() }
  input.addEventListener("input", () => { build(); replay() });
  stage.addEventListener("click", replay);
  el.querySelector("[data-replay]").onclick = replay;
  build(); e = v.exp / 100; setCurve();
  const frame = now => {
    const stagger = lerp(10, 48, e), dur = lerp(520, 1300, e);
    total = chars.length * stagger + dur;
    const t = now - start;
    if (t > total + 1800) replay();
    chars.forEach((c, i) => {
      const p = clamp((t - i * stagger) / dur), k = ease(p), inv = 1 - k;
      const y = inv * lerp(.35, 1.2, e), rot = inv * lerp(0, -16, e) * (i % 2 ? 1 : .6), sy = 1 + inv * lerp(0, .7, e), sk = inv * lerp(0, -14, e);
      c.style.transform = `translateY(${y}em) rotate(${rot}deg) skewX(${sk}deg) scaleY(${sy})`;
      c.style.opacity = clamp(p * 3.2);
    });
    // the cloak: a ribbon that sweeps across as the words arrive
    const r = stage.getBoundingClientRect(), W = r.width, H = r.height;
    rib.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const g = clamp(t / (total * .9)), head = lerp(-W * .2, W * 2.4, ease(g)), tail = head - W * lerp(.4, 1.1, e), A = H * .16 * e, band = H * lerp(.04, .22, e);
    let top = "", bot = "";
    for (let x = Math.max(0, tail); x <= Math.min(W, head); x += 6) {
      const ph = x / W * Math.PI * 2.2 + now / 900;
      const u = clamp((x - tail) / (head - tail)), th = band * Math.pow(Math.sin(Math.PI * u), .8) / 2, cy = H * .55 + A * Math.sin(ph);
      top += `${top ? "L" : "M"}${x.toFixed(1)} ${(cy - th).toFixed(1)}`;
      bot = `L${x.toFixed(1)} ${(cy + th + A * .25 * Math.sin(ph * 1.7 + e)).toFixed(1)}` + bot;
    }
    ribP.setAttribute("d", top ? top + bot + "Z" : "");
    ribP.style.opacity = lerp(.15, 1, e);
  };
  if (o.reduce) { start = -1e9; frame(0); return () => {} }
  return runner(el, frame);
};

window.TOOLS = T;
})();
