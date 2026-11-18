/* ============================================================
   ui.js — 화면 UI의 움직임 (D137 · D138, 2026-11-18). 맨 마지막에 로드(다른 파일이 만든 버튼 · 값을 지켜봄)
   · 세그먼트: 고른 칸 뒤의 흰 칸(.seg-thumb)이 액체처럼 '쑝' — 새 칸 쪽으로 가로로 늘어나고 세로로 살짝 얇아지며 빠르게 미끄러지고, 도착하면 살짝 지나쳤다
     튕겨 돌아오며 원래 모양으로 눌려 멈춤(스프링). 움직이는 동안만 살짝 커지고 흰 채움이 옅어져 유리처럼, 멈추면 다시 흰색. 0.35 ~ 0.45초.
     고르는 코드(setMode · setLight · renderScenario …)는 aria-pressed만 바꾸고, 여기서 그 변화를 지켜보다 움직인다(MutationObserver)
   · 켬/끔 스위치: aria-pressed로 켜고 끄는 버튼(세그먼트 · 질문 고르기가 아닌 것 — 지금은 'HUD 설명 보기')에 iOS식 스위치를 넣음. 누르는 순간 손잡이가 옆으로 늘어나고,
     켜짐/꺼짐이 바뀌면 반대쪽으로 미끄러지며 살짝 넘쳤다 돌아옴. 바탕은 손잡이를 따라 파랑으로 차오름. 버튼 · aria-pressed · 키보드(Space · Enter)는 그대로
   · 움직임은 transform · opacity만(Web Animations — 스프링을 미리 계산한 키프레임, 합성 단계에서 돎). 크기는 scale로(폭을 움직이지 않음)
   · 주행 테스트 · 시연이 돌아가는 동안(<html class="driving">, main.js uiMode) · prefers-reduced-motion이면 움직임 없이 바로 그 자리
   · 리퀴드 글래스 굴절: 크롬 계열이면 유리 면마다 SVG 변위 필터(#lgR1 · 2 · 3, 그 면의 px 크기)를 넣고 <html class="refract"> — styles.css가 유리의 뒤 흐림 앞에 씀
   · 기록 수 배지: 숫자가 늘었고 화면에 보일 때 한 번 톡
   ============================================================ */
(() => {
  const html = document.documentElement, RM = matchMedia('(prefers-reduced-motion: reduce)');
  const still = () => RM.matches || html.classList.contains('driving');   // 움직임 없이 바로

  /* ---------- 스프링 ----------
     x'' = -K(x − X) − Dx'. K 520 · D 26 → 감쇠비 0.57: 약 11% 지나쳤다 돌아오고 0.35 ~ 0.42초에 멈춤.
     모양 q(늘어남 정도)는 속도를 따라가는 두 번째 스프링 — 빨리 갈수록 늘어나고, 멈출 때 속도가 갑자기 줄면 0 아래로 넘어가 '눌림'(가로 짧게 · 세로 길게)이 됨 */
  const K = 520, D = 26, QK = 900, QD = 30, DT = 1/240;
  function spring(x0, v0, X, q0 = 0, qv0 = 0, opt = {}){
    const vs = opt.vScale || 900, maxT = .6, out = [];
    let x = x0, v = v0, q = q0, qv = qv0, t = 0;
    for(;;){
      out.push({t, x, v, q});
      if(t > .12 && Math.abs(x - X) < .25 && Math.abs(v) < 6 && Math.abs(q) < .004 && Math.abs(qv) < .05) break;
      if(t >= maxT) break;
      const a = -K*(x - X) - D*v; v += a*DT; x += v*DT;
      const qt = Math.min(.45, Math.abs(v)/vs); const qa = -QK*(q - qt) - QD*qv; qv += qa*DT; q += qv*DT;
      t += DT;
    }
    out.push({t:t + DT, x:X, v:0, q:0});
    return {pts:out, T:out[out.length - 1].t, state:tt => { const i = Math.min(out.length - 1, Math.max(0, Math.round(tt/DT))); const p = out[i], n = out[Math.min(out.length - 1, i + 1)]; return {x:p.x, v:p.v, q:p.q, qv:(n.q - p.q)/DT}; }};
  }
  // 키프레임으로(약 120fps 간격). make(p) → {transform, ...}
  const frames = (sim, make, step = 1/120) => { const f = []; for(let t = 0; t < sim.T; t += step){ f.push({...make(sim.state(t), t/sim.T), offset:t/sim.T}); } f.push({...make({x:sim.pts[sim.pts.length - 1].x, v:0, q:0, qv:0}, 1), offset:1}); return f; };

  /* ---------- 세그먼트의 흰 칸 ---------- */
  // 칸의 가운데 · 폭(소수점까지 — offsetLeft · offsetWidth는 정수로 반올림돼 0.5px 어긋남)
  const geo = (seg, b) => { const s = seg.getBoundingClientRect(), r = b.getBoundingClientRect(); return {cx:r.left - s.left - seg.clientLeft + r.width/2, w:r.width}; };
  function measure(seg){
    const th = seg._thumb, b = seg.querySelector('button[aria-pressed="true"]') || seg.querySelector('button');
    if(!b || !seg.offsetWidth) return null;
    if(!seg._w){ seg._w = geo(seg, b).w; th.style.width = seg._w + 'px'; }   // 폭은 자리 잡을 때(처음 · 크기 바뀜)만 — 칸마다 폭이 다르면 scale로
    return b;
  }
  const thumbTf = (seg, cx, sx = 1, sy = 1) => `translateX(${(cx - seg._w/2).toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
  function jump(seg, b){
    const th = seg._thumb; if(seg._anim){ seg._anim.cancel(); seg._fillAnim && seg._fillAnim.cancel(); seg._anim = null; }
    const gb = geo(seg, b); seg._x = gb.cx; seg._sx = gb.w/seg._w;
    th.style.opacity = 1; th.style.transform = thumbTf(seg, seg._x, seg._sx, 1); seg._sim = null;
  }
  function place(seg, instant){
    const th = seg._thumb;
    if(!seg.contains(th)) seg.prepend(th);   // renderScenario가 목적지 세그먼트를 innerHTML로 다시 채우면 다시 넣음
    if(!seg.querySelector('button[aria-pressed="true"]')){ th.style.opacity = 0; seg._x = null; return; }
    const b = measure(seg); if(!b){ th.style.opacity = 0; seg._x = null; return; }
    const gb = geo(seg, b), X = gb.cx, SX = gb.w/seg._w;
    if(instant || seg._x === null || seg._x === undefined || still()){ jump(seg, b); return; }
    if(Math.abs(X - seg._x) < .5 && !seg._anim) return;
    // 움직이는 중이면 지금 자리 · 속도에서 이어서
    let x0 = seg._x, v0 = 0, q0 = 0, qv0 = 0, sx0 = seg._sx || 1;
    if(seg._anim && seg._sim){ const st = seg._sim.state((performance.now() - seg._t0)/1000); x0 = st.x; v0 = st.v; q0 = st.q; qv0 = st.qv; }
    if(seg._anim){ seg._anim.cancel(); seg._fillAnim && seg._fillAnim.cancel(); }
    const sim = spring(x0, v0, X, q0, qv0, {vScale:Math.max(700, Math.abs(X - x0)*5)}), dist = Math.max(1, Math.abs(X - x0));
    const mk = (p, k) => { const sp = Math.min(1, Math.abs(p.v)/(dist*4.5)), grow = 1 + .07*sp, w = sx0 + (SX - sx0)*Math.min(1, Math.abs(p.x - x0)/dist);
      return {transform:thumbTf(seg, p.x, grow*(1 + p.q)*w, grow*(1 - .32*p.q))}; };
    const fill = frames(sim, (p, k) => ({opacity:(1 - .55*Math.min(1, Math.abs(p.v)/(dist*3.2))).toFixed(3)}));
    seg._sim = sim; seg._t0 = performance.now(); seg._x = X; seg._sx = SX;
    th.style.opacity = 1; th.style.transform = thumbTf(seg, X, SX, 1);   // 끝 자리(움직임이 끝나면 이 값)
    seg._anim = th.animate(frames(sim, mk), {duration:sim.T*1000, easing:'linear'});
    seg._fillAnim = th.firstChild.animate(fill, {duration:sim.T*1000, easing:'linear'});
    seg._anim.onfinish = () => { seg._anim = null; seg._sim = null; };
  }
  $$('.seg').forEach(seg => {
    const th = document.createElement('i'); th.className = 'seg-thumb'; th.setAttribute('aria-hidden', 'true'); th.appendChild(document.createElement('i'));
    seg._thumb = th; seg.prepend(th); seg.classList.add('has-thumb');
    new MutationObserver(() => place(seg)).observe(seg, {subtree:true, childList:true, attributes:true, attributeFilter:['aria-pressed']});
    new ResizeObserver(() => { seg._w = 0; place(seg, true); }).observe(seg);
    place(seg, true);
  });

  /* ---------- 켬/끔 스위치 ---------- */
  const KNOB = 24, TRAVEL = 20;   // styles.css .sw(48 × 28) · .sw-knob(24) — 손잡이가 움직이는 거리
  function makeSwitch(btn){
    const label = document.createElement('span'); label.className = 'sw-label'; label.textContent = btn.textContent.trim();
    const sw = document.createElement('span'); sw.className = 'sw'; sw.setAttribute('aria-hidden', 'true');
    sw.innerHTML = '<i class="sw-fill"></i><i class="sw-knob"><i></i></i>';
    btn.textContent = ''; btn.append(label, sw); btn.classList.add('switch-row');
    const knob = sw.querySelector('.sw-knob'), fillEl = sw.querySelector('.sw-fill'), core = knob.firstChild;
    let on = btn.getAttribute('aria-pressed') === 'true', press = 0, anims = [];
    const kTf = (x, sx = 1, origin = 0) => `translateX(${(x + (origin ? KNOB*(1 - sx) : 0)).toFixed(2)}px) scaleX(${sx.toFixed(4)})`;   // origin 1 = 오른쪽 끝을 붙잡고 늘어남
    const fTf = p => `translateX(${((p - 1)*100).toFixed(2)}%)`;
    const stop = () => { anims.forEach(a => a.cancel()); anims = []; };
    // 누르는 순간: 손잡이가 갈 쪽으로 늘어남(0.12초)
    btn.addEventListener('pointerdown', e => { if(btn.disabled || e.button !== 0 || still()) return; stop(); press = 1;
      anims.push(knob.animate([{transform:kTf(on ? TRAVEL : 0)}, {transform:kTf(on ? TRAVEL : 0, 1.32, on ? 1 : 0)}], {duration:120, easing:'cubic-bezier(.22,1,.36,1)', fill:'forwards'})); });
    const release = () => { if(!press) return; press = 0; if(btn.getAttribute('aria-pressed') === String(on)){ stop(); } };   // 바뀌지 않고 떼면(끌어서 벗어남) 원래 모양
    btn.addEventListener('pointerup', () => setTimeout(release, 0)); btn.addEventListener('pointerleave', release); btn.addEventListener('pointercancel', release);
    // 켜짐/꺼짐이 바뀌면: 반대쪽으로 '쑝' — 늘어난 모양에서 시작해 미끄러지며 살짝 넘쳤다 돌아옴, 바탕이 따라 차오름, 움직이는 동안 손잡이는 유리처럼
    new MutationObserver(() => {
      const now = btn.getAttribute('aria-pressed') === 'true'; if(now === on) return;
      const from = on ? TRAVEL : 0, to = now ? TRAVEL : 0, stretched = press ? 1.32 : 1; on = now; press = 0; stop();
      if(still()) return;   // CSS가 끝 모양(aria-pressed)을 바로 보여 줌
      const sim = spring(from, 0, to, stretched - 1, 0, {vScale:260});
      const dir = to > from ? 0 : 1;   // 오른쪽으로 갈 때는 왼쪽 끝 기준으로 늘어남, 왼쪽으로 갈 때는 오른쪽 끝 기준
      anims.push(knob.animate(frames(sim, p => ({transform:kTf(p.x, 1 + Math.min(.32, Math.max(-.12, p.q)), dir)})), {duration:sim.T*1000, easing:'linear'}));
      anims.push(core.animate(frames(sim, p => ({opacity:(1 - .5*Math.min(1, Math.abs(p.v)/180)).toFixed(3)})), {duration:sim.T*1000, easing:'linear'}));
      anims.push(fillEl.animate(frames(sim, p => ({transform:fTf(Math.max(0, Math.min(1, p.x/TRAVEL)))})), {duration:sim.T*1000, easing:'linear'}));   // 파랑의 오른쪽 끝 = 손잡이 가운데
    }).observe(btn, {attributes:true, attributeFilter:['aria-pressed']});
  }
  $$('button[aria-pressed]').filter(b => !b.closest('.seg, .rate, .choice')).forEach(makeSwitch);

  /* ---------- 리퀴드 글래스 굴절 (크롬 계열만) ----------
     변위 지도: 가운데는 그대로(128 = 안 움직임), 가장자리 띠(BAND px)에서 안쪽으로 당김 — 왼쪽 끝 R↑ · 오른쪽 끝 R↓ · 위 끝 G↑ · 아래 끝 G↓.
     뒤 흐림 앞에 걸려 가장자리에서 뒤가 살짝 휘어 보임. backdrop-filter 안에서는 지도 그림이 요소 크기로 늘어나지 않으므로(그 밖은 0 → 뒤 전체가 밀림)
     유리 면마다 필터를 따로 두고 그 면의 px 크기로 지도를 다시 만든다(ResizeObserver). styles.css가 var(--refract)로 씀 */
  const chromium = !!(navigator.userAgentData && navigator.userAgentData.brands && navigator.userAgentData.brands.some(b => /Chromium/.test(b.brand)));
  if(chromium && CSS.supports('backdrop-filter', 'blur(1px)')){
    const NS = 'http://www.w3.org/2000/svg', BAND = 18, SCALE = 24, host = document.createElementNS(NS, 'svg');
    host.setAttribute('width', 0); host.setAttribute('height', 0); host.setAttribute('aria-hidden', 'true'); host.style.position = 'absolute'; document.body.appendChild(host);
    const mapOf = (w, h) => { const bx = Math.min(.45, BAND/w), by = Math.min(.45, BAND/h);
      return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><defs>`
        + `<linearGradient id='x' x1='0' x2='1'><stop offset='0' stop-color='rgb(255,0,0)'/><stop offset='${bx}' stop-color='rgb(128,0,0)'/><stop offset='${1 - bx}' stop-color='rgb(128,0,0)'/><stop offset='1' stop-color='rgb(0,0,0)'/></linearGradient>`
        + `<linearGradient id='y' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='rgb(0,255,0)'/><stop offset='${by}' stop-color='rgb(0,128,0)'/><stop offset='${1 - by}' stop-color='rgb(0,128,0)'/><stop offset='1' stop-color='rgb(0,0,0)'/></linearGradient>`
        + `</defs><rect width='${w}' height='${h}' fill='url(#x)'/><rect width='${w}' height='${h}' fill='url(#y)' style='mix-blend-mode:screen'/></svg>`); };
    [['#intro > .card', 'lgR1'], ['#sess > .card', 'lgR2'], ['#drawer', 'lgR3']].forEach(([sel, id]) => {
      const el = $(sel); if(!el) return;
      const f = document.createElementNS(NS, 'filter'); f.id = id; f.setAttribute('filterUnits', 'userSpaceOnUse'); f.setAttribute('primitiveUnits', 'userSpaceOnUse'); f.setAttribute('color-interpolation-filters', 'sRGB');
      f.innerHTML = `<feImage x="0" y="0" preserveAspectRatio="none" result="m"/><feDisplacementMap in="SourceGraphic" in2="m" scale="${SCALE}" xChannelSelector="R" yChannelSelector="G"/>`;
      host.appendChild(f); const img = f.firstChild;
      const fit = () => { const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight); if(!w || !h) return;
        [['x', 0], ['y', 0], ['width', w], ['height', h]].forEach(([k, v]) => { f.setAttribute(k, v); img.setAttribute(k, v); }); img.setAttribute('href', mapOf(w, h)); };
      new ResizeObserver(fit).observe(el); fit(); el.style.setProperty('--refract', `url(#${id})`);
    });
    html.classList.add('refract');
  }

  /* ---------- 기록 수 배지 ---------- */
  const badge = $('#logCount'), app = $('#app');
  const shown = () => app.dataset.screen !== 'drive';
  let seen = +badge.textContent || 0;
  function check(){
    const n = +badge.textContent || 0;
    if(!shown()) return;
    if(n > seen && !still()){ badge.classList.remove('pop'); void badge.offsetWidth; badge.classList.add('pop'); }
    seen = n;
  }
  badge.addEventListener('animationend', () => badge.classList.remove('pop'));
  new MutationObserver(check).observe(badge, {childList:true, characterData:true, subtree:true});
  new MutationObserver(check).observe(app, {attributes:true, attributeFilter:['data-screen']});
})();
