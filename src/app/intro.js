/* ============================================================
   intro.js — 주행 테스트 안내 모션그래픽 (TOUR)
   · 주행 테스트의 첫 단계(session.js buildSteps의 {kind:'tour'}). 장면 6개: 시작 → 조작 → 직접 눌러 보기 → 할 일 → 기록 → 준비
   · 2026-11-18 다시 디자인(D135 · D136, 사용자 지시): 흰 바탕 하나 + 포인트 파랑 하나, 상자(알약 · 카드 · 패널 · 둥근 틀) 대신 큰 글자 · 가는 선 · 점 · 원 · 막대.
     3D 영상 · 그림은 쓰지 않고 전부 SVG + JS. 모든 장면에 같은 '내 차'(위에서 본 세단, 파랑 단계)가 나오고 다른 차는 같은 모양을 회색 단계로.
     색은 아래 C 넷과, 그 넷을 섞은 음영 단계(TONE · KEYTONE)만. 빛은 늘 왼쪽 위에서 — 그림자 · 빛 번짐 필터는 차와 키에만.
     HUD 신호색(청록 · 초록 · 주황 · 빨강)은 쓰지 않는다 — 안내가 그 색에 뜻을 붙이면 HUD 비교가 흐려진다. 파랑도 '길 안내 · 위험' 같은 뜻 없이 꾸밈 · 강조에만
   · 움직임: 글자는 빠르고 단단하게(막대가 밀려 들어오며 드러남 · 짧게 떠오름), 도형 · 차 · 키는 탄력 있게(넘쳤다 돌아옴). 장면이 바뀔 때는 파란 막대가 쓸고 지나가며 다음 장면이 드러난다.
     한 순간에 움직이는 것은 세 개 안팎. 조작 · 눌러 보기의 빠르기 표현(뒤로 풀리는 선 · 회색 빛줄기 · 길어지는 차선 · 숫자)은 모두 '지금 속도' 하나에서 계산
   · HUD의 표시(색 · 꺾쇠 · 점 등)가 무슨 뜻인지는 **알려 주지 않는다** — 두 HUD를 비교하는 실험이라 한쪽 뜻을 미리 가르치면 결과가 흐려진다. 조작 · 할 일 · 기록 항목만
   · 방향키는 '직접 눌러 보기' 장면이 쓰므로 넘기기는 버튼 · Enter(다음) · Backspace(이전)
   · 문장은 [가정 — 사용자 확인 대기]. 기록 항목은 session.js HEAD(엑셀 '기록' 시트)와 맞춘다(자동 급제동은 알려 줄지 사용자 결정 대기 — 넣지 않음)
   ============================================================ */
const TOUR = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  /* 색 — 이 넷뿐. intro.css는 이 값을 CSS 변수(--t-*)로 받는다 */
  const C = {bg:'#FFFFFF', point:'#3182F6', ink:'#191F28', mute:'#B0B8C1'};
  const svg = (tag, a = {}, parent) => { const e = document.createElementNS(NS, tag); for(const k in a) e.setAttribute(k, a[k]); if(parent) parent.appendChild(e); return e; };
  const txt = (parent, x, y, s, cls, a = {}) => { const e = svg('text', {x, y, class:cls, ...a}, parent); e.textContent = s; return e; };
  // 강조 단어 하나만 파랑: parts = ['키보드로 ', ['여섯 번'], ' 운전합니다'] — 배열로 감싼 조각이 강조
  const rich = (parent, x, y, parts, cls, a = {}) => { const e = svg('text', {x, y, class:cls, ...a}, parent); parts.forEach(p => { const s = svg('tspan', Array.isArray(p) ? {class:'em'} : {}, e); s.textContent = Array.isArray(p) ? p[0] : p; }); return e; };
  const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a)*k;
  const ss = t => { t = cl(t); return t*t*(3 - 2*t); };
  const seg = (t, a, b) => cl((t - a)/(b - a));
  const eo = t => 1 - Math.pow(1 - cl(t), 3);                                        // 글자: 빠르고 단단하게
  const back = (t, s = 1.9) => { t = cl(t); const u = t - 1; return 1 + u*u*((s + 1)*u + s); };   // 도형: 넘쳤다 돌아옴
  const wob = tau => tau <= 0 ? 0 : Math.exp(-7*tau)*Math.sin(13*tau);                // 멈춘 뒤 한 번 출렁(눌림 · 회전 넘침)
  const line = (parent, x1, y1, x2, y2, col = C.ink, w = 1.5, a = {}) => svg('line', {x1, y1, x2, y2, stroke:col, 'stroke-width':w, 'stroke-linecap':'round', ...a}, parent);
  const rnd = (i, k = 1) => { const x = Math.sin(i*127.1 + k*311.7)*43758.5453; return x - Math.floor(x); };   // 고정된 난수(장면마다 같은 배치)

  /* ---------- 음영 단계 — 새 색 없이 C의 파랑 · 회색을 흰색 · 먹색과 섞은 단계만 (D136). 빛은 늘 왼쪽 위에서 ---------- */
  const mix = (a, b, k) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16)*(1 - k) + parseInt(b.slice(i, i + 2), 16)*k).toString(16).padStart(2, '0')).join('');
  const TONE = {
    point:{l2:mix(C.point, C.bg, .42), l1:mix(C.point, C.bg, .2), m:C.point, d1:mix(C.point, C.ink, .28), tail:mix(C.point, C.ink, .68), glow:mix(C.point, C.bg, .55)},
    gray:{l2:mix(C.mute, C.bg, .62), l1:mix(C.mute, C.bg, .38), m:mix(C.mute, C.bg, .12), d1:mix(C.mute, C.ink, .2), tail:mix(C.mute, C.ink, .5), glow:mix(C.mute, C.bg, .5)}
  };
  const KEYTONE = {top:C.bg, topEnd:mix(C.mute, C.bg, .82), rim:mix(C.mute, C.bg, .72), side:mix(C.mute, C.bg, .55)};
  // 그림자 · 빛 번짐 필터(차와 키에만): 그 SVG의 defs에 한 번만
  function defsOf(el){
    const root = el.ownerSVGElement || el; let d = root.querySelector(':scope > defs'); if(!d){ d = svg('defs', {}); root.insertBefore(d, root.firstChild); }
    if(!d.querySelector('#tourSoft')){ const f = svg('filter', {id:'tourSoft', x:'-30%', y:'-30%', width:'160%', height:'160%'}, d); svg('feGaussianBlur', {stdDeviation:5}, f);
      const f2 = svg('filter', {id:'tourGlow', x:'-100%', y:'-100%', width:'300%', height:'300%'}, d); svg('feGaussianBlur', {stdDeviation:2.2}, f2); }
    return d;
  }
  let uid = 0;

  /* ---------- 부품 ---------- */
  /* 차 하나: 위에서 본 모양(앞 = 위), 길이 : 폭 = 2.5 : 1. 부분 — 그림자 · 바퀴 넷 · 몸통(앞은 좁고 둥글게, 뒤는 조금 각지게, 바퀴 자리가 볼록) ·
     앞유리 · 뒷유리(먹색 반투명) · 지붕(한 단계 밝게) · 사이드미러 둘 · 전조등(흰 선) · 꼬리등(진한 남색, 브레이크 때 밝은 파랑으로 빛남 — 빨강 금지).
     tone 'point' = 내 차(파랑 단계), 'gray' = 다른 차(회색 단계). 몸통 음영은 왼쪽 위가 밝고 오른쪽 아래가 어둡다 — 차가 돌아도 빛은 화면의 왼쪽 위(그라데이션을 반대로 돌림).
     그림자는 화면에서 오른쪽 아래로. 얼굴은 그리지 않는다.
     돌려줌: {g, at(x, y, 방향°), body(앞뒤 sy, 옆 sx, 앞뒤로 밀림 dy — 앞 = 음수), blink(쪽, 켬), brake(0 ~ 1), speed(0 ~ 1 — 뒤쪽이 가는 선 여러 가닥으로 풀려 끌림)} */
  const BODY = 'M0 -55.5 C10 -55.5 16.6 -52.6 18.4 -46 L20.6 -38 Q22.4 -33 21.4 -27 L20.9 22 Q22.5 28 21.6 34 L21.2 49 Q20.8 55.5 13.5 55.8 L-13.5 55.8 Q-20.8 55.5 -21.2 49 L-21.6 34 Q-22.5 28 -20.9 22 L-21.4 -27 Q-22.4 -33 -20.6 -38 L-18.4 -46 C-16.6 -52.6 -10 -55.5 0 -55.5 Z';
  function car(parent, s = 1, tone = 'point'){
    const T = TONE[tone], d = defsOf(parent), id = 'tc' + (++uid);
    const lg = svg('linearGradient', {id, gradientUnits:'userSpaceOnUse', x1:-30, y1:-48, x2:30, y2:48}, d);
    svg('stop', {offset:0, 'stop-color':T.l1}, lg); svg('stop', {offset:.5, 'stop-color':T.m}, lg); svg('stop', {offset:1, 'stop-color':T.d1}, lg);
    const rg = svg('linearGradient', {id:id + 'r', gradientUnits:'userSpaceOnUse', x1:-20, y1:-16, x2:20, y2:26}, d); svg('stop', {offset:0, 'stop-color':T.l2}, rg); svg('stop', {offset:1, 'stop-color':T.l1}, rg);   // 지붕: 몸통보다 한 단계 밝게
    // 빠르기: 뒤쪽을 옅게(마스크) + 뒤로 끌리는 가는 선(끝은 투명)
    const mk = svg('mask', {id:id + 'm', maskUnits:'userSpaceOnUse', x:-60, y:-80, width:120, height:320}, d), mg = svg('linearGradient', {id:id + 'mg', gradientUnits:'userSpaceOnUse', x1:0, y1:-56, x2:0, y2:58}, d);
    svg('stop', {offset:0, 'stop-color':'#fff'}, mg); svg('stop', {offset:.45, 'stop-color':'#fff'}, mg); const mEnd = svg('stop', {offset:1, 'stop-color':'#fff', 'stop-opacity':1}, mg);
    svg('rect', {x:-60, y:-80, width:120, height:320, fill:`url(#${id}mg)`}, mk);
    const sgr = svg('linearGradient', {id:id + 's', gradientUnits:'userSpaceOnUse', x1:0, y1:10, x2:0, y2:200}, d); svg('stop', {offset:0, 'stop-color':T.m, 'stop-opacity':.9}, sgr); svg('stop', {offset:1, 'stop-color':T.m, 'stop-opacity':0}, sgr);
    const g = svg('g', {}, parent), shG = svg('g', {}, g), sh = svg('g', {}, shG), mv = svg('g', {}, g), sc = svg('g', {transform:`scale(${s})`}, mv), tr = svg('g', {}, sc), body = svg('g', {mask:`url(#${id}m)`}, sc);
    const shR = svg('rect', {x:-21, y:-54, width:42, height:110, rx:17, fill:C.ink, opacity:.17, filter:'url(#tourSoft)'}, sh);
    const strands = Array.from({length:9}, (_, i) => line(tr, -17 + i*4.25, 12, -17 + i*4.25, 12, `url(#${id}s)`, 1.1 + 1.1*rnd(i, 3), {opacity:0}));
    for(const [x, y] of [[-19.4, -32], [19.4, -32], [-19.4, 30], [19.4, 30]]) svg('rect', {x:x - 3, y:y - 7.5, width:6, height:15, rx:2.2, fill:C.ink}, body);   // 바퀴: 몸통 밖으로 아주 조금
    svg('path', {d:BODY, fill:`url(#${id})`}, body);
    for(const sx of [-1, 1]) svg('path', {d:`M${sx*19.5} -24 l${sx*4.6} -2.4 l${sx*.8} 3.6 l${-sx*5} 1.6 Z`, fill:T.d1, 'stroke-linejoin':'round'}, body);   // 사이드미러
    svg('path', {d:'M-16.5 -30 Q0 -36.5 16.5 -30 L14.4 -13.5 Q0 -15.8 -14.4 -13.5 Z', fill:C.ink, opacity:.58}, body);   // 앞유리
    svg('path', {d:'M-14.2 -11.6 Q0 -13.8 14.2 -11.6 L14.4 21.4 Q0 23.4 -14.4 21.4 Z', fill:`url(#${id}r)`, 'stroke-linejoin':'round'}, body);   // 지붕(앞 · 뒷유리 사이)
    svg('path', {d:'M-14.4 23.4 Q0 25.6 14.4 23.4 L15.6 36 Q0 40 -15.6 36 Z', fill:C.ink, opacity:.5}, body);           // 뒷유리
    for(const sx of [-1, 1]) svg('path', {d:`M${sx*12.8} -49 Q${sx*9} -51.8 ${sx*5} -52.8`, fill:'none', stroke:C.bg, 'stroke-width':2.4, 'stroke-linecap':'round'}, body);   // 전조등
    const tailGlow = [-1, 1].map(sx => svg('path', {d:`M${sx*15.2} 52.2 L${sx*8} 53.6`, fill:'none', stroke:T.glow, 'stroke-width':10, 'stroke-linecap':'round', opacity:0, filter:'url(#tourGlow)'}, body));
    const tails = [-1, 1].map(sx => svg('path', {d:`M${sx*15.2} 52.2 L${sx*8} 53.6`, fill:'none', stroke:T.tail, 'stroke-width':3, 'stroke-linecap':'round'}, body));
    const dots = {'-1':svg('circle', {cx:-33, cy:-40, r:4.2, fill:C.point, opacity:0}, sc), '1':svg('circle', {cx:33, cy:-40, r:4.2, fill:C.point, opacity:0}, sc)};   // 깜빡이: 옆에 점 하나
    let last = {x:0, y:0, r:0};
    const o = {g,
      at:(x, y, r = 0) => { last = {x, y, r}; mv.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${r.toFixed(2)})`); shG.setAttribute('transform', `translate(${(x + 5*s).toFixed(1)} ${(y + 7*s).toFixed(1)}) rotate(${r.toFixed(2)}) scale(${s})`); lg.setAttribute('gradientTransform', `rotate(${(-r).toFixed(1)})`); rg.setAttribute('gradientTransform', `rotate(${(-r).toFixed(1)})`); },
      body:(sy = 1, sx = 1, dy = 0) => { body.setAttribute('transform', `translate(0 ${dy.toFixed(2)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)})`); shR.setAttribute('y', (-54 + dy).toFixed(2)); },
      blink:(side, on) => { for(const k of [-1, 1]) dots[k].setAttribute('opacity', on && k === side ? 1 : 0); },
      brake:k => { k = cl(+k); tails.forEach(e => e.setAttribute('stroke', k > .02 ? mix(T.tail, T.glow, k) : T.tail)); tailGlow.forEach(e => e.setAttribute('opacity', k.toFixed(2))); },
      // k: 0 ~ 1(지금 속도에서 계산). 가닥마다 길이 · 진하기가 다르고(고정 난수), 뒤쪽 몸통은 그만큼 옅어져 선으로 풀리는 것처럼
      speed:(k, ph = 0) => { k = cl(k); mEnd.setAttribute('stop-opacity', (1 - .62*k).toFixed(3));
        strands.forEach((e, i) => { const L = k*(36 + 120*rnd(i, 7))*(.85 + .15*Math.sin(ph*9 + i*1.7)); e.setAttribute('y1', (10 + 14*rnd(i, 5)).toFixed(1)); e.setAttribute('y2', (12 + 30*k + L).toFixed(1)); e.setAttribute('opacity', (k > .01 ? (.35 + .65*rnd(i, 9))*Math.min(1, k*1.6) : 0).toFixed(3)); }); },
      pos:() => last};
    o.at(0, 0, 0); return o;
  }
  const other = (parent, s = 1) => car(parent, s, 'gray');   // 다른 차: 같은 모양을 회색 단계로
  /* 키캡: 흰 바탕 위의 흰 키. 윗면(왼쪽 위가 밝음) 안에 살짝 오목한 면(한 단계 밝게, 오목해서 음영이 거꾸로) · 아래쪽에 얇은 두께 면(옅은 회색) · 그 밑에 옅은 그림자(오른쪽 아래).
     글자는 먹색, 작게. set(눌림 -0.25 ~ 1, 차오름 0 ~ 1): 눌리면 내려가며 두께 면 · 그림자가 줄고, 윗면이 파랑으로 차오른다(음수 = 뗀 뒤 탄력으로 살짝 솟음). place(x, y, 크기) */
  function key(parent, x, y, label, w = 88, h = 88, fs = 26){
    const d = defsOf(parent), id = 'tk' + (++uid), th = 7;
    if(!d.querySelector('#tourKeyTop')){
      const a = svg('linearGradient', {id:'tourKeyTop', x1:0, y1:0, x2:1, y2:1}, d); svg('stop', {offset:0, 'stop-color':KEYTONE.top}, a); svg('stop', {offset:1, 'stop-color':KEYTONE.topEnd}, a);
      const b = svg('linearGradient', {id:'tourKeyDish', x1:0, y1:0, x2:1, y2:1}, d); svg('stop', {offset:0, 'stop-color':KEYTONE.topEnd}, b); svg('stop', {offset:.55, 'stop-color':KEYTONE.top}, b); svg('stop', {offset:1, 'stop-color':KEYTONE.top}, b);
      const c = svg('linearGradient', {id:'tourKeyLit', x1:0, y1:0, x2:1, y2:1}, d); svg('stop', {offset:0, 'stop-color':TONE.point.l1}, c); svg('stop', {offset:1, 'stop-color':C.point}, c);
      const e = svg('linearGradient', {id:'tourKeyLitDish', x1:0, y1:0, x2:1, y2:1}, d); svg('stop', {offset:0, 'stop-color':TONE.point.d1}, e); svg('stop', {offset:.6, 'stop-color':C.point}, e); svg('stop', {offset:1, 'stop-color':TONE.point.l1}, e); }
    const g = svg('g', {transform:`translate(${x} ${y})`}, parent), shadow = svg('rect', {x:-w/2 + 3, y:-h/2 + 9, width:w, height:h, rx:15, fill:C.ink, opacity:.13, filter:'url(#tourSoft)'}, g);
    const side = svg('rect', {x:-w/2, y:-h/2 + th, width:w, height:h, rx:15, fill:KEYTONE.side}, g), top = svg('g', {}, g);
    const clip = svg('clipPath', {id}, d), rise = svg('rect', {x:-w/2 - 2, y:h/2, width:w + 4, height:0}, clip);   // 파랑이 아래에서 위로 차오르는 높이
    svg('rect', {x:-w/2, y:-h/2, width:w, height:h, rx:15, fill:'url(#tourKeyTop)', stroke:KEYTONE.rim, 'stroke-width':1}, top);
    svg('rect', {x:-w/2 + 9, y:-h/2 + 8, width:w - 18, height:h - 19, rx:11, fill:'url(#tourKeyDish)'}, top);
    const lit = svg('g', {'clip-path':`url(#${id})`}, top); svg('rect', {x:-w/2, y:-h/2, width:w, height:h, rx:15, fill:'url(#tourKeyLit)'}, lit); svg('rect', {x:-w/2 + 9, y:-h/2 + 8, width:w - 18, height:h - 19, rx:11, fill:'url(#tourKeyLitDish)'}, lit);
    const t = txt(top, 0, -2 + fs*.36, label, 't-key', {'text-anchor':'middle', 'font-size':fs});
    return {g,
      set:(press, fillK = press) => { press = cl(press, -.25, 1); const lk = cl(fillK);
        top.setAttribute('transform', `translate(0 ${(th*.8*press).toFixed(2)})`); side.setAttribute('height', (h - th*.8*press).toFixed(2));
        shadow.setAttribute('opacity', (.13*(1 - .7*cl(press))).toFixed(3)); shadow.setAttribute('y', (-h/2 + 9 - 5*press).toFixed(2));
        rise.setAttribute('y', (h/2 + 2 - (h + 4)*lk).toFixed(1)); rise.setAttribute('height', ((h + 4)*lk).toFixed(1)); t.style.fill = lk > .55 ? C.bg : C.ink; },
      place:(px, py, k = 1) => g.setAttribute('transform', `translate(${px.toFixed(1)} ${py.toFixed(1)}) scale(${k.toFixed(3)})`)};
  }
  /* 키보드 하나(조작 · 눌러 보기 · 준비가 같이 씀): Q E + 방향키(역 T). 가운데 (cx, cy), 키 한 변 u.
     unfold(u 0 ~ 1): 키들이 가운데 한 덩어리로 모여 있다가 이음매를 따라 갈라지며 제자리로 펼쳐진다(넘쳤다 돌아옴, 왼쪽 키부터 조금씩 늦게, 0.8초 안팎) */
  function keyboard(parent, cx, cy, u = 88, gap = 12){
    const g = svg('g', {transform:`translate(${cx} ${cy})`}, parent), p = u + gap, K = {}, home = {};
    const lay = {q:[-3.6*p, .5*p, 'Q'], e:[-2.6*p, .5*p, 'E'], left:[-p, .5*p, '←'], down:[0, .5*p, '↓'], up:[0, -.5*p, '↑'], right:[p, .5*p, '→']};
    const ox = -1.3*p;   // 덩어리의 가운데(키보드 가운데쯤)
    Object.entries(lay).forEach(([k, [x, y, l]]) => { K[k] = key(g, x, y, l, u, u, u*.24); home[k] = [x, y]; K[k].g.dataset.k = k; K[k].g.dataset.home = `${x.toFixed(1)},${y.toFixed(1)}`; });   // data-*: 검사용(펼쳐진 뒤 제자리인지)
    const order = Object.keys(lay);
    return {g, K, home,
      unfold:v => { order.forEach((k, j) => { const [hx, hy] = home[k], loc = (v*.8 - j*.045)/.55, q = back(loc, 2.1), gx = ox + (hx - ox)*.16, gy = hy*.16;
        K[k].place(lerp(gx, hx, q), lerp(gy, hy, q), lerp(.78, 1, cl(q))); K[k].g.setAttribute('opacity', cl(v*6).toFixed(2)); }); }};
  }
  // 위에서 내려다본 차로: 가장자리 실선 + 가운데 점선(회색). flow(거리, 0 ~ 1 빠르기): 빠를수록 점선이 길게 이어져 선이 된다
  function lanes(parent, x0, y0, y1, n = 3, lw = 104){
    const g = svg('g', {}, parent), dash = [];
    line(g, x0, y0, x0, y1); line(g, x0 + n*lw, y0, x0 + n*lw, y1);
    for(let i = 1; i < n; i++) dash.push(line(g, x0 + i*lw, y0, x0 + i*lw, y1, C.mute, 1.5, {'stroke-dasharray':'22 26', 'stroke-linecap':'butt'}));
    return {g, lanes:Array.from({length:n}, (_, i) => x0 + (i + .5)*lw), x0, lw, edges:[x0, x0 + n*lw],
      flow:(d, k = 0) => { const a = 22 + 74*k, b = Math.max(1, 26*(1 - .96*k)); dash.forEach(e => { e.setAttribute('stroke-dasharray', `${a.toFixed(1)} ${b.toFixed(1)}`); e.setAttribute('stroke-dashoffset', (-(d % (a + b))).toFixed(1)); }); }};
  }
  // 차 주변 회색 빛줄기(진행 방향으로 지나감): 개수 ≤ 40, 길이 · 진하기는 빠르기 k 하나에서
  function streaks(parent, x0, x1, n = 36){
    const es = Array.from({length:n}, (_, i) => line(parent, 0, 0, 0, 0, C.mute, .6 + 1.1*rnd(i, 2), {opacity:0}));
    return (d, k) => es.forEach((e, i) => { const show = k*n > i*(.6 + .4*rnd(i, 4)); if(!show){ e.setAttribute('opacity', 0); return; }
      const x = lerp(x0, x1, rnd(i, 1)), L = k*(40 + 150*rnd(i, 6)), y = ((rnd(i, 8)*780 + d*(.8 + .7*rnd(i, 10))) % 800) - 40;
      e.setAttribute('x1', x.toFixed(1)); e.setAttribute('x2', x.toFixed(1)); e.setAttribute('y1', y.toFixed(1)); e.setAttribute('y2', (y - L).toFixed(1)); e.setAttribute('opacity', (k*(.25 + .55*rnd(i, 12))).toFixed(3)); });
  }
  // 점 여럿: 돌려줌 {es, set(i, 채움, 색), pop(i, 0 ~ 1 넘쳤다 돌아오는 크기)}
  const dots = (parent, x, y, n, gap = 26, r = 7) => { const es = Array.from({length:n}, (_, i) => svg('circle', {cx:x + i*gap, cy:y, r, fill:C.ink, stroke:C.ink, 'stroke-width':1.5}, parent));
    return {es, set:(i, on, col = C.ink) => { es[i].setAttribute('fill', on ? col : C.bg); es[i].setAttribute('stroke', on ? col : C.ink); }, pop:(i, k) => es[i].setAttribute('r', (r*k).toFixed(2))}; };

  /* ---------- 글자 · 선의 등장 (요소마다 다르게) ---------- */
  // 막대가 밀려 들어오며 글자를 드러냄(레퍼런스 2): 앞 45% 동안 파란 막대가 글자 너비만큼 자라고, 뒤 55% 동안 막대가 오른쪽으로 빠지며 그 뒤로 글자가 드러남. 제목 · 큰 낱말에
  function barText(parent, x, y, parts, cls, fs, a = {}){
    const g = svg('g', {}, parent), id = 'tr' + (++uid), d = defsOf(parent);
    const cp = svg('clipPath', {id}, d), cr = svg('rect', {x, y:y - fs*1.1, width:0, height:fs*1.45}, cp);
    const tg = svg('g', {'clip-path':`url(#${id})`}, g); let el = null, W = 0;
    const bar = svg('rect', {x, y:y - fs*.84, width:0, height:fs*1.0, fill:C.point}, g);
    const set = p => { if(el) el.remove(); el = Array.isArray(p) ? rich(tg, x, y, p, cls, a) : txt(tg, x, y, p, cls, a); W = 0; };
    set(parts);
    const f = (t, t0, dur = .62) => {
      if(!W){ try{ W = el.getComputedTextLength(); }catch(e){} }   // 화면에 안 보일 때(숨김)는 0 — 그때는 어림값을 쓰고 저장하지 않음
      const w = W || (el.textContent || '').length*fs*.92;
      const anc = a['text-anchor'], x0 = anc === 'middle' ? x - w/2 : anc === 'end' ? x - w : x, u = (t - t0)/dur;
      if(u <= 0){ cr.setAttribute('width', 0); bar.setAttribute('width', 0); return; }
      if(u >= 1){ cr.setAttribute('x', x0 - 30); cr.setAttribute('width', w + 80); bar.setAttribute('width', 0); return; }
      const L = u < .45 ? x0 : x0 + w*eo((u - .45)/.55), R = u < .45 ? x0 + w*eo(u/.45) : x0 + w;
      bar.setAttribute('x', L.toFixed(1)); bar.setAttribute('width', Math.max(0, R - L).toFixed(1));
      cr.setAttribute('x', x0 - 30); cr.setAttribute('width', u < .45 ? 0 : Math.max(0, L - x0 + 30).toFixed(1)); };
    f.set = set; f.g = g; return f;
  }
  // 짧게 떠오름(문장 · 작은 글자): 0.3초, 단단하게
  const rise = (el, t, t0, dur = .32, dy = 10) => { const k = eo((t - t0)/dur); el.setAttribute('opacity', k.toFixed(3)); el.setAttribute('transform', `translate(0 ${((1 - k)*dy).toFixed(1)})`); };
  // 선 · 원이 그려짐(pathLength 1)
  const drawn = (el, k) => { el.setAttribute('stroke-dasharray', '1 1'); el.setAttribute('stroke-dashoffset', (1 - cl(k)).toFixed(4)); };
  // 큰 숫자 · 도형이 튀어 오름: (cx, cy) 기준으로 작게 → 넘쳤다 → 제자리
  const popAt = (el, cx, cy, k, from = .4) => { const s = lerp(from, 1, back(k, 2.4)); el.setAttribute('transform', `translate(${cx} ${cy}) scale(${s.toFixed(3)}) translate(${-cx} ${-cy})`); el.setAttribute('opacity', cl(k*3).toFixed(2)); };
  // 각본으로 누르는 키: 누른 구간 [시작, 끝] 목록 → 눌림(빠르게 내려감 · 떼면 탄력 있게 올라와 살짝 솟음) · 차오름(누르는 동안 파랑, 떼면 빠르게 빠짐)
  const keyAt = (spans, t) => { let p = 0, l = 0; for(const [a, b] of spans){ if(t < a) continue; if(t <= b){ p = eo((t - a)/.09); l = eo((t - a)/.14); break; } const tau = t - b; if(tau < 1.2){ p = Math.exp(-9*tau)*Math.cos(15*tau); l = cl(1 - tau/.2); } }
    return [p, l]; };

  /* ---------- 장면 ---------- */
  const KEYS6 = [['left', 'ArrowLeft', '핸들 왼쪽'], ['right', 'ArrowRight', '핸들 오른쪽'], ['up', 'ArrowUp', '가속'], ['down', 'ArrowDown', '브레이크'], ['q', 'KeyQ', '왼쪽 깜빡이'], ['e', 'KeyE', '오른쪽 깜빡이']];
  const scenes = [
    /* 1. 시작: 제목이 막대에 밀려 들어오며 · 도로 한 줄 위로 내 차가 들어와 서고 깜빡이 한 번 · 큰 6 + 점 여섯 · 가는 원 위 바늘 한 바퀴 · 번호 + 가는 선 목록 */
    { id:'start', name:'시작', dur:7, build(g){
        const title = barText(g, 96, 214, '주행 테스트 안내', 't-hero', 92);
        const road = line(g, 0, 640, 1280, 640, C.ink, 1.5, {pathLength:1});
        const six = svg('g', {}, g); txt(six, 88, 470, '6', 't-big');
        const sixD = dots(g, 106, 506, 6, 22, 6); sixD.es.forEach((_, i) => sixD.set(i, true));
        const c1 = svg('g', {}, g); rich(c1, 96, 556, ['키보드로 ', ['여섯 번'], ' 운전합니다'], 't-small');
        const ring = svg('circle', {cx:640, cy:418, r:70, fill:'none', stroke:C.ink, 'stroke-width':1.5, pathLength:1, transform:'rotate(-90 640 418)'}, g);
        const hand = line(g, 640, 418, 640, 356, C.point, 3), hub = svg('circle', {cx:640, cy:418, r:4, fill:C.ink}, g);
        const c2 = svg('g', {}, g); rich(c2, 640, 556, ['한 번에 ', ['1분'], ' 안팎'], 't-small', {'text-anchor':'middle'});
        const top = line(g, 900, 344, 1184, 344, C.mute, 1, {pathLength:1});
        const rows = [['01', '조작'], ['02', '할 일'], ['03', '기록']].map(([n, s], i) => { const y = 382 + i*58, q = svg('g', {}, g);
          return {n:txt(q, 900, y, n, 't-idx'), b:barText(q, 950, y, s, 't-item', 28), l:line(q, 900, y + 20, 1184, y + 20, C.mute, 1, {pathLength:1}), q}; });
        const me = car(g, .62);
        return t => { title(t, .15, .7); drawn(road, eo(seg(t, .35, 1.0)));
          // 내 차: 왼쪽에서 들어와 서며 앞으로 한 번 눌림 → 깜빡이 한 번 → 숨쉬기
          const u = seg(t, .9, 2.6), x = -90 + 650*eo(u), dip = u >= 1 ? -5*wob(t - 2.6) : -2.4*Math.sin(Math.PI*u)*u;
          me.at(x, 610, 90); me.body(1 + (t > 3.6 ? .012*Math.sin((t - 3.6)*2.4) : 0), 1, dip); me.blink(-1, t > 2.9 && t < 3.9 && Math.floor((t - 2.9)/.25) % 2 === 0);
          popAt(six, 160, 410, seg(t, 1.2, 1.7)); sixD.es.forEach((_, i) => sixD.pop(i, back(seg(t, 1.5 + i*.06, 1.85 + i*.06), 2.6))); rise(c1, t, 1.9);
          drawn(ring, eo(seg(t, 2.0, 2.6))); hub.setAttribute('opacity', cl((t - 2.3)*5)); hand.setAttribute('opacity', cl((t - 2.3)*5));
          hand.setAttribute('transform', `rotate(${(360*back(seg(t, 2.6, 4.6), 1.1)).toFixed(1)} 640 418)`); rise(c2, t, 2.5);
          drawn(top, eo(seg(t, 2.8, 3.3))); rows.forEach((r, i) => { const s0 = 3.0 + i*.28; r.n.setAttribute('opacity', cl((t - s0)*4)); r.b(t, s0 + .05, .5); drawn(r.l, eo(seg(t, s0 + .1, s0 + .6))); }); };
    }},
    /* 2. 조작: 왼쪽 차로 + 내 차, 오른쪽 키보드(펼쳐지며 등장) · 동작 하나씩 크게 · 속도 숫자 아주 크게. 시간 식(T · 속도)은 예전 그대로.
          빠르기 표현은 전부 '지금 속도' v 하나에서: k = (v − 45) ÷ 35 → 뒤로 풀리는 선 · 회색 빛줄기 · 차선 길이 · 숫자. 출발 · 제동 순간의 눌림은 가속도의 변화에서 */
    { id:'keys', name:'조작', dur:14.2, build(g){
        const R = lanes(g, 150, 40, 680, 3, 108), sk = svg('g', {}, g), fx = streaks(sk, 100, 530, 36), me = car(g, 1.05);
        const steps = [['핸들', ''], ['가속', '누르는 동안 빨라집니다'], ['브레이크', '길게 누를수록 세게'], ['손을 떼면', '정해진 속도로 스스로 갑니다'], ['깜빡이', '차로 옮기기 전에']];
        const pos = dots(g, 626, 92, 5, 20, 4.5);
        const kb = keyboard(g, 918, 196, 64, 10), K = kb.K;   // Q의 왼쪽 끝 = 글자 왼쪽(620)
        const verb = barText(g, 620, 420, '', 't-verb', 120), sub = svg('g', {}, g), subT = txt(sub, 624, 466, '', 't-small');
        const num = txt(g, 1184, 646, '50', 't-speed', {'text-anchor':'end'}); txt(g, 1184, 676, 'km/h', 't-unit', {'text-anchor':'end'});
        const T = [.6, 3.0, 5.4, 7.8, 10.2, 13.4], D0 = T[1] - .2 - T[0];
        const SP = {right:[[T[0], T[0] + .326*D0], [T[0] + .674*D0, T[0] + D0]], left:[[T[0] + .326*D0, T[0] + .674*D0]], up:[[T[1], T[2] - .3]], down:[[T[2], T[3] - .5]], e:[[T[4], T[4] + .55]], q:[]};
        const V = t => t < T[1] ? 50 : t < T[2] ? 50 + 30*ss(seg(t, T[1] + .2, T[2] - .3)) : t < T[3] ? 80 - 58*ss(seg(t, T[2] + .1, T[3] - .5)) : 22 + 28*ss(seg(t, T[3] + .2, T[4] - .3));
        const A = t => (V(t + .04) - V(t - .04))/.08;   // 가속도(km/h/s)
        const X = t => { const u = seg(t, T[0], T[1] - .2), sway = Math.sin(ss(u)*Math.PI*2); return R.lanes[1] + sway*32 + (R.lanes[2] - R.lanes[1])*ss(seg(t, T[4] + 1.0, T[5] - .6)); };   // 처음 · 끝에서 옆으로 가는 빠르기 0
        const dist = t => { let d = 0; for(let s = 0; s < t; s += .05) d += V(s)*.05*5.2; return d; };   // 지나온 거리(속도의 적분)
        let lastStep = -1;
        return t => { t = Math.max(0, t);
          const step = t < T[1] ? 0 : t < T[2] ? 1 : t < T[3] ? 2 : t < T[4] ? 3 : 4, v = V(t), k = cl((v - 45)/35), d = dist(t);
          if(step !== lastStep){ verb.set(steps[step][0]); subT.textContent = steps[step][1]; lastStep = step; }
          const s0 = step === 0 ? 0 : T[step]; verb(t, s0 + (step === 0 ? .35 : .05), .55); rise(sub, t, s0 + .3);
          for(let i = 0; i < 5; i++){ pos.set(i, i === step, i === step ? C.point : C.ink); pos.pop(i, i === step ? lerp(1, 1.5, back(seg(t, s0, s0 + .35), 2.5)) - .5*seg(t, s0 + .35, s0 + .6) : 1); }
          kb.unfold(seg(t, 0, 1.1));
          Object.entries(SP).forEach(([kk, sp]) => { const [p, l] = keyAt(sp, t); K[kk].set(p, l); });
          // 빠르기: 차선 · 빛줄기 · 뒤로 풀리는 선 · 숫자 — 모두 v에서
          R.flow(d, k); fx(d, k); me.speed(k, t); num.textContent = String(Math.round(v));
          // 차: 핸들 = 몸통이 조금 늦게 따라 돌며 넘쳤다 돌아옴(진행 방향의 늦은 기울기) · 눌림 = 가속도의 변화(출발 순간 뒤로, 제동 순간 앞으로)
          const yaw = Math.atan2(X(t - .07) - X(t - .12), .05*360)*180/Math.PI + (t > T[5] - .6 ? -4*wob(t - (T[5] - .6)) : 0);
          const dy = cl(.22*(A(t) - A(t - .3)), -7, 7);
          me.at(X(t), 470, yaw); me.body(1, 1, dy); me.brake(step === 2 && t < T[3] - .5 ? 1 : 0); me.blink(1, step === 4 && t > T[4] + .2 && t < T[5] - .3 && Math.floor(t/.32) % 2 === 0); };
    }},
    /* 3. 눌러 보기: 왼쪽 키보드(펼쳐지며 등장), 오른쪽 짧은 3차로 도로와 내 차. 키를 누르고 있는 동안 계속 반응하고 떼면 돌아온다.
          ← → 핸들(그쪽으로 기울며 옆으로, 도로 밖으로는 못 감, 떼면 곧게) · ↑ 가속(조작 장면과 같은 빠르기 표현 · 숫자) · ↓ 브레이크(앞으로 눌림 · 꼬리등 · 도로가 느려짐) · Q E 깜빡이.
          손을 떼면 정해진 속도(50)로 돌아온다. '여섯 개 한 번씩 누르면 다음' 판정 · 점 여섯 개는 그대로 */
    { id:'try', name:'눌러 보기', dur:Infinity, hold:true, build(g, api){
        const title = barText(g, 96, 150, '직접 눌러 보세요', 't-title', 64), sub = svg('g', {}, g); rich(sub, 98, 200, ['여섯 개 키를 ', ['한 번씩'], ' 누르면 넘어갑니다'], 't-small');
        const cnt = dots(g, 106, 262, 6, 28, 7.5);
        const wait = svg('g', {transform:'translate(330 262)'}, g), half = svg('path', {d:'M-12 0 A12 12 0 0 1 12 0 Z', fill:C.ink}, wait), d1 = svg('circle', {cx:-32, cy:0, r:4.5, fill:C.ink}, wait), d2 = svg('circle', {cx:32, cy:0, r:4.5, fill:C.point}, wait);
        const kb = keyboard(g, 520, 486, 92, 12), K = kb.K, CAP = {left:'핸들 왼쪽', right:'핸들 오른쪽', up:'가속', down:'브레이크', q:'왼쪽 깜빡이', e:'오른쪽 깜빡이'};
        const caps = Object.entries(CAP).map(([k, s]) => { const [hx, hy] = kb.home[k]; return txt(g, 520 + hx, 486 + hy + (k === 'up' ? -66 : 72), s, 't-cap', {'text-anchor':'middle'}); });
        const R = lanes(g, 904, 40, 680, 3, 100), sk = svg('g', {}, g), fx = streaks(sk, 880, 1230, 30), me = car(g, .86);
        const num = txt(g, 868, 660, '50', 't-speed2', {'text-anchor':'end'}); txt(g, 868, 686, 'km/h', 't-unit', {'text-anchor':'end'});
        const held = {}, got = {}, st = {};
        const reset = () => { for(const o of [held, got]) for(const k in o) delete o[k]; Object.assign(st, {v:50, x:R.lanes[1], yaw:0, yv:0, dy:0, dyv:0, aS:0, d:0, last:null, blink:{side:0, until:-1}, prs:{}, done:null}); KEYS6.forEach(([k]) => st.prs[k] = {p:0, pv:0, l:0}); };
        reset();
        const onDown = e => { const k = KEYS6.find(q => q[1] === e.code); if(!k || !api.active('try')) return; e.preventDefault(); e.stopPropagation();
          if(got[k[0]] === undefined) got[k[0]] = api.t(); held[k[0]] = true; if(k[0] === 'q' || k[0] === 'e') st.blink = {side:k[0] === 'q' ? -1 : 1, until:Infinity}; };
        const onUp = e => { const k = KEYS6.find(q => q[1] === e.code); if(!k || !api.active('try')) return; e.preventDefault(); e.stopPropagation(); held[k[0]] = false;
          if((k[0] === 'q' || k[0] === 'e') && st.blink.until === Infinity) st.blink.until = api.t() + 1.6; };   // 깜빡이: 떼고도 1.6초 더
        addEventListener('keydown', onDown, true); addEventListener('keyup', onUp, true); addEventListener('blur', () => { for(const k in held) held[k] = false; });
        // 한 걸음: 속도 · 옆 자리 · 기울기(늦게 따라 돌며 넘침) · 눌림 · 키
        const step = h => {
          const up = held.up, dn = held.down, steer = (held.right ? 1 : 0) - (held.left ? 1 : 0), v0 = st.v;
          st.v = up ? Math.min(98, st.v + 24*h) : dn ? Math.max(6, st.v - 44*h) : st.v + (50 - st.v)*(1 - Math.exp(-1.3*h));
          const a = (st.v - v0)/h; st.aS += (a - st.aS)*(1 - Math.exp(-h/.3));
          st.dyv += (cl(.2*(a - st.aS), -7, 7) - st.dy)*260*h - st.dyv*16*h; st.dy += st.dyv*h;
          const L = R.lanes[0] - 26, Rr = R.lanes[2] + 26, atEdge = (st.x <= L + .5 && steer < 0) || (st.x >= Rr - .5 && steer > 0);
          const yawT = atEdge ? 0 : steer*13; st.yv += (yawT - st.yaw)*150*h - st.yv*13*h; st.yaw += st.yv*h;
          st.x = cl(st.x + Math.sin(st.yaw*Math.PI/180)*st.v*5.2*h*.9, L, Rr); st.d += st.v*5.2*h;
          KEYS6.forEach(([k]) => { const s = st.prs[k], on = !!held[k]; s.pv += ((on ? 1 : 0) - s.p)*700*h - s.pv*24*h; s.p += s.pv*h; s.l = on ? Math.min(1, s.l + h/.12) : Math.max(0, s.l - h/.2); }); };
        return Object.assign(t => {
          const dt = st.last === null || t < st.last || t - st.last > .5 ? 0 : t - st.last; st.last = t;
          for(let n = Math.ceil(dt/(1/120)), i = 0; i < n; i++) step(dt/n);
          title(t, .1, .62); rise(sub, t, .45); kb.unfold(seg(t, .2, 1.3));
          const n = KEYS6.filter(([k]) => got[k] !== undefined).length;
          KEYS6.forEach(([k], i) => { K[k].set(st.prs[k].p, st.prs[k].l); cnt.set(i, i < n, C.point); });
          if(n === 6 && st.done === null) st.done = t;
          for(let i = 0; i < 6; i++) cnt.pop(i, st.done !== null ? 1 + .45*Math.sin(Math.PI*seg(t, st.done + i*.05, st.done + .32 + i*.05)) : 1);   // 여섯 개가 다 차면 점들이 한 번 튐
          caps.forEach((c, i) => c.setAttribute('opacity', cl((t - .9 - i*.05)*4)));
          half.setAttribute('transform', `rotate(${(t*140 % 360).toFixed(1)})`); d1.setAttribute('cy', (-7*Math.abs(Math.sin(t*3.2))).toFixed(1)); d2.setAttribute('cy', (-7*Math.abs(Math.sin(t*3.2 + 1.3))).toFixed(1));
          const k = cl((st.v - 45)/35); R.flow(st.d, k); fx(st.d, k); me.speed(k, t); num.textContent = String(Math.round(st.v));
          me.at(st.x, 470, st.yaw); me.body(1, 1, st.dy); me.brake(held.down ? 1 : 0);
          const bl = st.blink.side && t < st.blink.until; me.blink(st.blink.side, bl && Math.floor(t/.32) % 2 === 0);
          if(st.done !== null && t > st.done + .9) api.next(); },
          {reset, state:() => ({n:KEYS6.filter(([k]) => got[k] !== undefined).length, v:st.v, x:st.x, yaw:st.yaw, dy:st.dy, mid:R.lanes[1], lo:R.lanes[0] - 26, hi:R.lanes[2] + 26, held:Object.keys(held).filter(k => held[k]).join(',')})});
    }},
    /* 4. 할 일: 규칙마다 그 뜻을 움직임으로(차가 실제로 그 행동을 한다). 글자는 그 움직임과 같이 나오고, 지나간 규칙은 작은 회색 글자로 위로.
          ① 목적지 출구로: 표지판의 목적지 칸이 파랑 → 내 차에서 그 출구까지 파란 선 → 차가 그 선을 따라감
          ② 안전할 때 옮기기: 옆 차로 뒤에서 회색 차가 다가옴 → 깜빡이를 켠 채 기다림 → 지나간 뒤 부드럽게 옮김
          ③ 앞도 살피기: 앞차가 섬 → 천천히 줄여 멈춤 → 길이 비면 다시 감. HUD 그림 · 기호는 쓰지 않는다 */
    { id:'task', name:'할 일', dur:19.5, build(g){
        const x0 = 150, lw = 104, yF = 300, L0 = x0 + .5*lw, L1 = x0 + 1.5*lw, L2 = x0 + 2.5*lw, dashA = {'stroke-dasharray':'22 26', 'stroke-linecap':'butt'};
        line(g, x0, 680, x0, 40); line(g, x0 + lw, 680, x0 + lw, 40, C.mute, 1.5, dashA); line(g, x0 + 2*lw, 680, x0 + 2*lw, yF + 60, C.mute, 1.5, dashA);
        svg('path', {d:`M${x0 + 2*lw} ${yF + 60} L${x0 + 2*lw} 40`, fill:'none', stroke:C.ink, 'stroke-width':1.5}, g);
        svg('path', {d:`M${x0 + 3*lw} 680 L${x0 + 3*lw} ${yF} Q${x0 + 3*lw} ${yF - 120} ${x0 + 3*lw + 150} ${yF - 240}`, fill:'none', stroke:C.ink, 'stroke-width':1.5}, g);
        svg('path', {d:`M${x0 + 2*lw} ${yF + 60} Q${x0 + 2*lw + 10} ${yF - 70} ${x0 + 2*lw + 140} ${yF - 220}`, fill:'none', stroke:C.ink, 'stroke-width':1.5}, g);
        // 표지판: 가로 선 하나 + 칸 이름. 목적지 칸은 ①에서 파랑(글자 + 아래 막대)
        line(g, x0 - 12, 120, x0 + 3*lw + 12, 120, C.mute, 1.5); txt(g, x0 + lw, 106, '직진', 't-cap', {'text-anchor':'middle'});
        const dst = txt(g, L2, 106, '목적지', 't-cap', {'text-anchor':'middle'}), dstBar = svg('rect', {x:L2 - 30, y:113, width:0, height:4, fill:C.point}, g);
        // ① 길: 내 차에서 출구까지
        const route = svg('path', {d:`M${L1} 560 C${L1} 470 ${L2} 490 ${L2} 400 L${L2} ${yF} Q${L2} ${yF - 120} ${L2 + 150} ${yF - 240} L${L2 + 290} ${yF - 352}`, fill:'none', stroke:C.point, 'stroke-width':3, 'stroke-linecap':'round', pathLength:1}, g);
        const lead = other(g, .9), rear = other(g, .9), me = car(g, .9);
        const rules = [['01', '목적지 출구로', '표지판과 화면 안내를 보고 그 출구로'], ['02', '안전할 때 옮기기', '옆 차로 뒤차를 보고, 깜빡이를 켜고'], ['03', '앞도 살피기', '앞차 · 보행자 · 공사 구간에서는 천천히']];
        const RS = [.4, 6.2, 12.0], RE = [6.2, 12.0, 17.6];
        const big = rules.map(([n, a, b]) => { const q = svg('g', {}, g); return {q, n:txt(q, 620, 256, n, 't-idx on'), a:barText(q, 620, 330, a, 't-rule', 60), b:(() => { const w = svg('g', {}, q); txt(w, 624, 376, b, 't-small'); return w; })()}; });
        const small = rules.map(([n, a], i) => { const q = svg('g', {}, g); txt(q, 620, 140 + i*44, n, 't-idx'); txt(q, 660, 140 + i*44, a, 't-past'); return q; });
        const strip = svg('g', {}, g); txt(strip, 620, 600, '화면 안내는 두 가지가 번갈아 나옵니다', 't-small');
        const alt = dots(strip, 626, 640, 6, 26, 7); alt.es.forEach((_, i) => alt.set(i, i % 2 === 0)); const legend = txt(strip, 800, 645, '● 현대   ○ 리뉴얼', 't-cap');
        // 경로를 따라 놓기(길이 비율 u) — 그려진 뒤에만 잼
        let RL = 0; const along = u => { if(!RL){ try{ RL = route.getTotalLength(); }catch(e){} } if(!RL) return [L1, 560, 0]; const p = route.getPointAtLength(u*RL), q = route.getPointAtLength(Math.min(RL, u*RL + 4)); return [p.x, p.y, Math.atan2(q.x - p.x, -(q.y - p.y))*180/Math.PI]; };
        return t => { t = Math.max(0, t);
          const cur = RS.filter(x => t >= x).length - 1;
          big.forEach((r, i) => { const on = i === cur && t < RE[i] + .35, out = seg(t, RE[i], RE[i] + .35);
            r.q.style.display = on ? '' : 'none'; r.q.setAttribute('opacity', (1 - out).toFixed(2)); r.q.setAttribute('transform', `translate(0 ${(-40*eo(out)).toFixed(1)})`);
            r.n.setAttribute('opacity', cl((t - RS[i])*4)); r.a(t, RS[i] + .05, .6); rise(r.b, t, RS[i] + .45); });
          small.forEach((q, i) => { q.style.display = t >= RE[i] + .2 ? '' : 'none'; rise(q, t, RE[i] + .2); });
          strip.style.display = t >= 17.6 ? '' : 'none'; rise(strip, t, 17.6); alt.es.forEach((_, i) => alt.pop(i, back(seg(t, 17.9 + i*.07, 18.25 + i*.07), 2.6))); legend.setAttribute('opacity', cl((t - 18.4)*4));
          // ① 0.4 ~ 6.2
          const dOn = seg(t, .9, 1.2)*(1 - seg(t, 6.0, 6.3)); dst.setAttribute('class', dOn > .5 ? 't-cap em' : 't-cap'); dstBar.setAttribute('width', (60*eo(dOn)).toFixed(1));
          drawn(route, eo(seg(t, 1.4, 2.5))); route.setAttribute('opacity', (1 - seg(t, 5.4, 5.9)).toFixed(2));
          let mx = L1, my = 560, myaw = 0, mbrake = 0, mdy = 0, blink = 0;
          if(t < 6.2){ const u = seg(t, 2.7, 5.4); if(u > 0){ const [px, py, a] = along(ss(u)*.98); mx = px; my = py; myaw = a; } me.g.setAttribute('opacity', (1 - seg(t, 5.0, 5.4)).toFixed(2)); }
          // ② 6.2 ~ 12: 1차로로 다시 들어와 깜빡이를 켜고 기다림 → 2차로 뒤에서 온 회색 차가 지나간 뒤 옮김
          else if(t < 12){ me.g.setAttribute('opacity', 1); const inU = seg(t, 6.2, 6.9); my = lerp(780, 560, back(inU, 1.3)); const mvU = seg(t, 9.5, 10.9); mx = lerp(L0, L1, ss(mvU));
            myaw = Math.sin(Math.PI*mvU)*11 + (t > 10.9 ? -3*wob(t - 10.9) : 0); my -= 40*ss(mvU); blink = t > 7.0 && t < 10.9 ? 1 : 0; }
          // ③ 12 ~ 17.6: 2차로를 가다 앞차가 서면 천천히 줄여 멈춤 → 앞차가 가면 다시 감(곧게)
          else { me.g.setAttribute('opacity', 1); const sU = seg(t, 12.1, 14.4); my = lerp(780, 350, 1 - Math.pow(1 - sU, 2.2)); mx = L1; mbrake = sU > .35 && sU < 1 ? 1 : t >= 14.4 && t < 15.5 ? .5 : 0;
            mdy = t > 14.4 ? -4*wob(t - 14.4) : 0; const gU = seg(t, 15.5, 17.5); if(gU > 0){ my = 350 - 520*gU*gU; mdy = 3*Math.sin(Math.PI*seg(gU, 0, .2)); } }
          me.at(mx, my, myaw); me.body(1, 1, mdy); me.brake(mbrake); me.blink(1, blink && Math.floor(t/.32) % 2 === 0);
          // 회색 차: ②에서 옆 차로 뒤에서 와 지나감 · ③에서 앞차(서고 다시 감)
          if(t >= 6.4 && t < 10.6){ rear.g.style.display = ''; rear.at(L1, lerp(860, -140, seg(t, 6.6, 10.4)), 0); } else rear.g.style.display = 'none';
          if(t >= 12 && t < 17.6){ lead.g.style.display = ''; const lu = seg(t, 12, 13.2), ly = lerp(300, 214, 1 - Math.pow(1 - lu, 2)), go = seg(t, 14.6, 16.4);
            lead.at(L1, ly - 400*go*go, 0); lead.brake(go > 0 ? 0 : lu > .1 ? 1 : 0); lead.body(1, 1, go > 0 ? 2*Math.sin(Math.PI*seg(go, 0, .2)) : t > 13.2 ? -3*wob(t - 13.2) : 0); }
          else lead.g.style.display = 'none'; };
    }},
    /* 5. 기록: 체크리스트가 위로 흐르며 지금 항목만 크고 진하게(앞에 큰 번호). 지금 항목 옆에 그 뜻을 보여 주는 작은 움직임 하나 — 원 · 선 · 점 · 작은 차로만(상자 없음) */
    { id:'data', name:'기록', dur:17.4, build(g){
        const items = [['목적지 출구', '안내된 출구로 갔는지'], ['충돌', '차 · 보행자 · 공사 구간과 부딪혔는지'], ['위험한 끼어들기', '뒤차 바로 앞으로 들어갔는지'],
          ['차로를 옮긴 때', '어디서, 얼마나 걸려 옮겼는지'], ['보행자 양보 · 도로 벗어남', '멈춰서 기다렸는지, 길 밖으로 나갔는지'], ['짧은 질문', '끝난 뒤 세 문항에 답합니다']];
        const SLOT = [2.2, 2.4, 2.6, 2.6, 3.4, 2.0], ST = SLOT.reduce((a, d, i) => (a.push(i ? a[i - 1] + SLOT[i - 1] : .5), a), []);
        const head = svg('g', {}, g); txt(head, 96, 110, '이런 것을 기록합니다', 't-lead');
        const rows = items.map(([a, b], i) => { const q = svg('g', {}, g); return {q, n:txt(q, 0, 0, String(i + 1).padStart(2, '0'), 't-num'), a:txt(q, 104, 0, a, 't-rule'), b:txt(q, 106, 46, b, 't-small')}; });
        const foot = svg('g', {}, g);
        txt(foot, 96, 632, '참가자 번호로만 저장합니다. 이름 · 얼굴 · 목소리는 기록하지 않습니다.', 't-small');
        txt(foot, 96, 662, '운전 실력을 평가하는 것이 아니라, 두 화면 안내를 비교하는 실험입니다.', 't-small');
        // 작은 움직임 여섯(오른쪽, 가운데 (1010, 380))
        const V = items.map(() => svg('g', {}, g)), cx = 1070, cy = 380;
        // ① 길이 둘로 갈라지고 점이 맞는 쪽으로 → 체크
        const v1 = {stem:line(V[0], cx, 480, cx, 400, C.ink, 1.5, {pathLength:1}), l:svg('path', {d:`M${cx} 400 Q${cx} 360 ${cx - 70} 300`, fill:'none', stroke:C.mute, 'stroke-width':1.5, pathLength:1}, V[0]),
          r:svg('path', {d:`M${cx} 400 Q${cx} 360 ${cx + 70} 300`, fill:'none', stroke:C.ink, 'stroke-width':1.5, pathLength:1}, V[0]), dot:svg('circle', {r:7, fill:C.point}, V[0]),
          chk:svg('path', {d:`M${cx + 82} 286 l8 8 l16 -18`, fill:'none', stroke:C.point, 'stroke-width':3, 'stroke-linecap':'round', 'stroke-linejoin':'round', pathLength:1}, V[0])};
        // ② 작은 차 두 대가 닿는 순간 동그라미 파문 한 번
        const v2 = {a:other(V[1], .55), b:car(V[1], .55), rip:svg('circle', {cx, cy:330, r:0, fill:'none', stroke:C.point, 'stroke-width':2}, V[1]), rip2:svg('circle', {cx, cy:330, r:0, fill:'none', stroke:C.ink, 'stroke-width':1}, V[1])};
        // ③ 좁은 틈에 한 대가 들어가며 틈을 재는 괄호가 줄어듦
        line(V[2], cx - 50, 250, cx - 50, 520, C.mute, 1.5, {'stroke-dasharray':'14 16'});
        const v3 = {f:other(V[2], .5), r:other(V[2], .5), me:car(V[2], .5), br:svg('path', {fill:'none', stroke:C.ink, 'stroke-width':1.5}, V[2])};
        // ④ 옆 차로로 옮기는 동안 가는 원 위로 바늘이 돌아 시간을 잼
        line(V[3], cx - 50, 250, cx - 50, 520, C.mute, 1.5, {'stroke-dasharray':'14 16'});
        const v4 = {me:car(V[3], .5), ring:svg('circle', {cx:cx + 130, cy:300, r:30, fill:'none', stroke:C.ink, 'stroke-width':1.5}, V[3]), hand:line(V[3], cx + 130, 300, cx + 130, 276, C.point, 2.5), hub:svg('circle', {cx:cx + 130, cy:300, r:3, fill:C.ink}, V[3])};
        // ⑤ 보행자(원 + 선)가 건너고 차가 줄무늬 앞에서 멈춤 → 차가 도로 가장자리 선에 닿음
        const zeb = svg('g', {}, V[4]); for(let i = 0; i < 4; i++) line(zeb, cx - 70, 290 + i*10, cx + 70, 290 + i*10, C.mute, 3, {'stroke-linecap':'butt'});
        const edge = line(V[4], cx + 82, 240, cx + 82, 540, C.ink, 1.5);
        const ped = svg('g', {}, V[4]); svg('circle', {cx:0, cy:-14, r:6, fill:C.ink}, ped); line(ped, 0, -6, 0, 12, C.ink, 2.5); const pedLeg = line(ped, 0, 12, 0, 24, C.ink, 2.5);
        const v5 = {me:car(V[4], .5), ripple:svg('circle', {r:0, fill:'none', stroke:C.point, 'stroke-width':2}, V[4])};
        // ⑥ 점 다섯 개 중 하나가 차오름(1 ~ 5)
        const v6 = dots(V[5], cx - 80, cy, 5, 40, 9); txt(V[5], cx - 80, cy + 34, '1', 't-cap', {'text-anchor':'middle'}); txt(V[5], cx + 80, cy + 34, '5', 't-cap', {'text-anchor':'middle'});
        const vig = [
          tau => { drawn(v1.stem, eo(seg(tau, 0, .3))); drawn(v1.l, eo(seg(tau, .25, .6))); drawn(v1.r, eo(seg(tau, .25, .6)));
            const u = seg(tau, .6, 1.5); let p; if(u < .45){ p = [cx, lerp(480, 400, u/.45)]; } else { let pt = null; try{ pt = v1.r.getPointAtLength(v1.r.getTotalLength()*ss((u - .45)/.55)); }catch(e){} p = pt ? [pt.x, pt.y] : [cx + 70*(u - .45)/.55, 400 - 100*(u - .45)/.55]; }
            v1.dot.setAttribute('cx', p[0].toFixed(1)); v1.dot.setAttribute('cy', p[1].toFixed(1)); v1.dot.setAttribute('r', (7*back(seg(tau, .55, .8), 2.4)).toFixed(2)); drawn(v1.chk, eo(seg(tau, 1.5, 1.85))); },
          tau => { const u = seg(tau, .2, 1.1), hit = 1.1; v2.a.at(cx, 290, 0); const by = lerp(540, 375, Math.pow(u, 1.6)); v2.b.at(cx, by + (tau > hit ? 2*wob(tau - hit) : 0), 0); v2.b.body(1, 1, tau > hit ? -3*wob(tau - hit) : 0);
            const r1 = seg(tau, hit, hit + .7); v2.rip.setAttribute('r', (6 + 46*eo(r1)).toFixed(1)); v2.rip.setAttribute('opacity', (r1 > 0 ? 1 - r1 : 0).toFixed(2)); v2.rip.setAttribute('cy', 336);
            const r2 = seg(tau, hit + .12, hit + .9); v2.rip2.setAttribute('r', (6 + 30*eo(r2)).toFixed(1)); v2.rip2.setAttribute('opacity', (r2 > 0 ? .8*(1 - r2) : 0).toFixed(2)); v2.rip2.setAttribute('cy', 336); },
          tau => { const fx = cx + 30, fy = 290, ry = 480; v3.f.at(fx, fy, 0); v3.r.at(fx, ry, 0); const u = ss(seg(tau, .5, 1.5)), mx = lerp(cx - 90, fx, u), my = lerp(400, 392, u);
            v3.me.at(mx, my, Math.sin(Math.PI*u)*14); v3.me.blink(1, tau < 1.5 && Math.floor(tau/.3) % 2 === 0);
            const top = u > .6 ? my + 28 : fy + 28, bot = ry - 28, bx = fx + 46; v3.br.setAttribute('d', `M${bx - 8} ${top.toFixed(1)} H${bx} V${bot.toFixed(1)} H${bx - 8}`); },
          tau => { const u = ss(seg(tau, .4, 1.9)); v4.me.at(lerp(cx - 100, cx, u), 400 - 40*u, Math.sin(Math.PI*u)*13 + (tau > 1.9 ? -3*wob(tau - 1.9) : 0)); v4.me.blink(1, tau < 1.9 && Math.floor(tau/.3) % 2 === 0);
            v4.hand.setAttribute('transform', `rotate(${(300*seg(tau, .4, 1.9) + (tau > 1.9 ? 6*wob(tau - 1.9) : 0)).toFixed(1)} ${cx + 130} 300)`); },
          tau => { const pu = seg(tau, .1, 1.6); ped.setAttribute('transform', `translate(${lerp(cx - 80, cx + 56, pu).toFixed(1)} 300)`); ped.setAttribute('opacity', (1 - seg(tau, 1.45, 1.75)).toFixed(2)); pedLeg.setAttribute('x2', (4*Math.sin(tau*18)).toFixed(1));
            const su = seg(tau, 0, 1.0), stopY = 370; let mx = cx, my = lerp(520, stopY, 1 - Math.pow(1 - su, 2.2)), yaw = 0; v5.me.brake(su > .3 && tau < 1.8 ? 1 : 0); v5.me.body(1, 1, tau > 1.0 && tau < 1.8 ? -3*wob(tau - 1.0) : 0);
            const du = seg(tau, 1.9, 2.8); if(du > 0){ mx = lerp(cx, cx + 82 - 13, ss(du)); my = stopY - 30*du; yaw = Math.sin(Math.PI*seg(du, 0, 1))*12; }
            v5.me.at(mx, my, yaw); const hu = seg(tau, 2.8, 3.3); v5.ripple.setAttribute('cx', cx + 82); v5.ripple.setAttribute('cy', (my).toFixed(1)); v5.ripple.setAttribute('r', (4 + 26*eo(hu)).toFixed(1)); v5.ripple.setAttribute('opacity', (hu > 0 ? 1 - hu : 0).toFixed(2));
            edge.setAttribute('stroke', hu > 0 && hu < .6 ? C.point : C.ink); },
          tau => { for(let i = 0; i < 5; i++){ v6.set(i, i === 3 && tau > .55, C.point); v6.pop(i, i === 3 ? lerp(1, 1.5, back(seg(tau, .55, .85), 2.6)) - .5*seg(tau, .85, 1.1) : back(seg(tau, .05*i, .3 + .05*i), 2)); } }
        ];
        return t => { t = Math.max(0, t); rise(head, t, .05);
          const curF = (() => { for(let i = 5; i >= 0; i--) if(t >= ST[i]) return i === 0 ? 0 : i - 1 + eo((t - ST[i])/.45); return 0; })();
          const cur = ST.filter(s => t >= s).length - 1;
          rows.forEach((r, i) => { const dd = i - curF, ad = Math.abs(dd), on = cl(1 - ad);
            const y = 340 + (dd < 0 ? -(64*Math.min(ad, 1) + 40*Math.max(ad - 1, 0)) : 104*Math.min(ad, 1) + 40*Math.max(ad - 1, 0)), sc = lerp(.37, 1, on);   // 위 줄은 바짝, 아래 줄은 지금 항목의 설명 밑으로
            r.q.setAttribute('transform', `translate(96 ${y.toFixed(1)}) scale(${sc.toFixed(3)})`); r.q.style.display = ad <= 3.2 && t >= .3 ? '' : 'none';
            r.q.setAttribute('opacity', (cl((t - .3)*3)*Math.max(.3, 1 - Math.max(0, ad - 1)*.25)).toFixed(2));
            r.n.style.fill = on > .5 ? C.point : C.mute; r.a.style.fill = mix(C.mute, C.ink, on); r.b.setAttribute('opacity', cl(on*3 - 2).toFixed(2)); });
          V.forEach((q, i) => { const tau = t - ST[i], vis = i === cur && t < ST[5] + SLOT[5]; q.style.display = vis ? '' : 'none'; if(vis){ q.setAttribute('opacity', (cl(tau*5)*(1 - seg(tau, SLOT[i] - .2, SLOT[i]))).toFixed(2)); vig[i](tau); } });
          foot.style.display = t >= 15.0 ? '' : 'none'; rise(foot, t, 15.0); };
    }},
    /* 6. 준비: '준비되면 시작하세요' · 같은 키보드로 키 요약 · Enter 옆 기다림 도형. 아래 도로에서 내 차가 계속 달린다 —
          가끔 깜빡이를 켜고 차로를 옮기고 회색 차를 지나친다. 8초 한 바퀴가 이음매 없이 반복(모든 움직임이 (t mod 8)의 함수, 끝 = 처음). 빛줄기 같은 강한 표현은 쓰지 않는다 */
    { id:'ready', name:'준비', dur:Infinity, hold:true, build(g){
        const title = barText(g, 96, 212, ['준비되면 ', ['시작'], '하세요'], 't-hero', 92), sub = svg('g', {}, g); txt(sub, 100, 264, '첫 주행에는 키 안내가 화면 아래에 계속 보입니다', 't-small');
        const KX = 354, KY = 368, kb = keyboard(g, KX, KY, 56, 8), CAP = [['q', '깜빡이', 32], ['left', '핸들', 0], ['down', '브레이크', 0], ['right', '핸들', 0]];   // Q의 왼쪽 끝 = 글자 왼쪽(96)
        const caps = svg('g', {}, g); CAP.forEach(([k, s, dx]) => { const [hx, hy] = kb.home[k]; txt(caps, KX + hx + dx, KY + hy + 54, s, 't-cap', {'text-anchor':'middle'}); }); txt(caps, KX + kb.home.up[0] + 42, KY + kb.home.up[1] + 5, '가속', 't-cap');
        const ent = svg('text', {x:98, y:512, class:'t-small'}, g); svg('tspan', {class:'t-enter'}, ent).textContent = 'Enter'; svg('tspan', {}, ent).textContent = '를 누르면 시작합니다';
        const spin = svg('g', {}, g), half = svg('path', {d:'M-12 0 A12 12 0 0 1 12 0 Z', fill:C.point}, spin), dot = svg('circle', {cx:0, cy:0, r:4, fill:C.ink}, spin);
        const road = svg('g', {}, g); line(road, 0, 572, 1280, 572); line(road, 0, 694, 1280, 694); const mid = line(road, 0, 633, 1280, 633, C.mute, 1.5, {'stroke-dasharray':'22 26', 'stroke-linecap':'butt'});
        const g1 = other(g, .5), g2 = other(g, .5), me = car(g, .5), LY = [602, 664], P = 8, SPD = 240, REL = 190, MX = 760;
        const lane = tau => tau < 1.8 ? 1 : tau < 3.0 ? 1 - ss(seg(tau, 1.8, 3.0)) : tau < 5.4 ? 0 : tau < 6.6 ? ss(seg(tau, 5.4, 6.6)) : 1;   // 1 = 아래 차로
        let spinX = 0;
        return t => { t = Math.max(0, t); const tau = ((t % P) + P) % P;
          title(t, .1, .7); rise(sub, t, .5); kb.unfold(seg(t, .5, 1.6)); caps.setAttribute('opacity', cl((t - 1.4)*3).toFixed(2)); rise(ent, t, 1.6);
          if(!spinX){ try{ spinX = ent.getComputedTextLength(); }catch(e){} } spin.setAttribute('transform', `translate(${(98 + (spinX || 300) + 34).toFixed(1)} 502)`);
          half.setAttribute('transform', `rotate(${(t*180 % 360).toFixed(1)})`); const da = t*Math.PI*2*3/P; dot.setAttribute('cx', (22*Math.cos(da)).toFixed(1)); dot.setAttribute('cy', (22*Math.sin(da)).toFixed(1)); spin.setAttribute('opacity', cl((t - 1.8)*3).toFixed(2));   // 기다림 도형도 8초에 딱 맞게(반원 4바퀴 · 점 3바퀴)
          mid.setAttribute('stroke-dashoffset', (SPD*tau % 48).toFixed(1));   // SPD × 8초 = 48의 배수 → 이음매 없음
          const l = lane(tau), y = lerp(LY[0], LY[1], l), dl = (lane(tau + .05) - lane(tau - .05))/.1;
          me.at(MX, y, 90 + Math.atan2(dl*(LY[1] - LY[0]), SPD)*180/Math.PI*.9); me.body(1 + .01*Math.sin(tau*Math.PI*2/P*4), 1, 0);
          me.blink(dl < 0 || (tau > 1.2 && tau < 1.8) ? -1 : 1, ((tau > 1.2 && tau < 3.0) || (tau > 4.8 && tau < 6.6)) && Math.floor(tau/.3) % 2 === 0);
          g1.at(1400 - REL*tau, LY[1], 90); g2.at(1400 - REL*(((tau + 4) % P)), LY[0], 90); };
    }}
  ];

  /* ---------- 진행 ----------
     장면 바꿈: 파란 막대가 왼쪽에서 오른쪽으로 쓸고 지나가며 그 뒤로 다음 장면이 드러난다(0.45초). 장면 번호(st.i)는 바로 바뀌고, 그림만 막대를 따라 바뀐다 — 검사 · 세션은 그대로 */
  const SWEEP = .45;
  let root = null, stage = null, bar = null, btnPrev = null, btnNext = null, layers = [], sweep = null, clipNew = null, clipOld = null, st = {i:0, t:0, on:false, last:0, raf:0, done:null}, tr = null;
  const api = {active:id => st.on && scenes[st.i].id === id, t:() => st.t, next:() => go(st.i + 1)};
  function mount(){
    if(root) return;
    root = document.createElement('div'); root.id = 'tour'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', '주행 테스트 안내');
    Object.entries(C).forEach(([k, v]) => root.style.setProperty('--t-' + k, v));   // 색은 C 한곳에서
    root.innerHTML = '<div class="tour-stage"></div><div class="tour-bar"><button class="tour-prev" id="tourPrev"><span aria-hidden="true">←</span> 이전</button><div class="tour-steps"></div>'
      + '<div class="tour-go"><span class="tour-go-label"></span><button class="tour-next" id="tourNext" aria-label="다음"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12 H18 M12 6 L18 12 L12 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div></div>';
    document.body.appendChild(root);
    stage = svg('svg', {viewBox:'0 0 1280 720', preserveAspectRatio:'xMidYMid meet', 'aria-hidden':'true'}, root.querySelector('.tour-stage'));
    const d = defsOf(stage), cn = svg('clipPath', {id:'tourClipNew'}, d), co = svg('clipPath', {id:'tourClipOld'}, d);
    clipNew = svg('rect', {x:-3000, y:-2000, width:0, height:5000}, cn); clipOld = svg('rect', {x:0, y:-2000, width:6000, height:5000}, co);
    layers = scenes.map(s => { const g = svg('g', {opacity:0}, stage); s.draw = s.build(g, api); s.g = g; return g; });
    sweep = svg('rect', {x:-400, y:-2000, width:0, height:5000, fill:C.point}, stage);
    bar = root.querySelector('.tour-steps'); bar.innerHTML = '<i class="tour-line"></i><i class="tour-fill"></i>' + scenes.map((s, i) => `<span class="tour-step" data-i="${i}">${s.name}</span>`).join('');
    btnPrev = root.querySelector('#tourPrev'); btnNext = root.querySelector('#tourNext');
    btnPrev.onclick = () => go(st.i - 1); btnNext.onclick = () => go(st.i + 1);
    addEventListener('keydown', e => { if(!st.on) return; if(e.key === 'Enter'){ e.preventDefault(); e.stopPropagation(); go(st.i + 1); } else if(e.key === 'Backspace'){ e.preventDefault(); go(st.i - 1); }
      else if(/^Arrow|^Key[QE]$/.test(e.code) || e.key === ' '){ e.preventDefault(); e.stopPropagation(); } }, true);   // 방향키 · Q · E는 '눌러 보기' 장면 몫(다른 곳으로 새지 않게)
    addEventListener('keyup', e => { if(st.on && /^Arrow|^Key[QE]$/.test(e.code)){ e.preventDefault(); e.stopPropagation(); } }, true);
  }
  function paint(){
    const s = scenes[st.i], now = performance.now();
    let u = tr ? (now - tr.start)/(SWEEP*1000) : 1; if(u >= 1){ tr = null; u = 1; }
    layers.forEach((g, i) => { const show = i === st.i || (tr && i === tr.from); g.setAttribute('opacity', show ? 1 : 0); g.removeAttribute('clip-path'); });
    if(tr){ // 막대의 왼쪽 끝이 지나간 자리까지 새 장면, 막대의 오른쪽 끝부터 옛 장면
      const W = 220, xR = lerp(-20, 1300 + W, ss(u)), xL = xR - W;
      layers[st.i].setAttribute('clip-path', 'url(#tourClipNew)'); clipNew.setAttribute('width', (xL + 3000).toFixed(1));
      layers[tr.from].setAttribute('clip-path', 'url(#tourClipOld)'); clipOld.setAttribute('x', xR.toFixed(1));
      sweep.setAttribute('x', xL.toFixed(1)); sweep.setAttribute('width', W);
    } else sweep.setAttribute('width', 0);
    s.draw(st.t);
    const p = (st.i + (s.hold ? 1 : cl(st.t/s.dur)))/scenes.length;
    bar.querySelector('.tour-fill').style.width = (p*100).toFixed(2) + '%';
    bar.querySelectorAll('.tour-step').forEach((e, i) => { e.classList.toggle('on', i === st.i); e.classList.toggle('done', i < st.i); });
    btnPrev.disabled = st.i === 0; root.querySelector('.tour-go-label').textContent = st.i === scenes.length - 1 ? '주행 시작' : '';
    btnNext.setAttribute('aria-label', st.i === scenes.length - 1 ? '주행 시작' : '다음');
  }
  function go(i){
    if(i < 0) return; if(i >= scenes.length){ finish(); return; }
    const from = st.i; st.i = i; const s = scenes[i]; if(s.draw.reset) s.draw.reset();
    if(st.on && from !== i){ tr = {from, start:performance.now()}; st.t = -SWEEP*.5; } else { tr = null; st.t = 0; }   // 막대가 반쯤 지나갈 때 새 장면의 시계가 0
    paint();
  }
  function frame(now){
    if(!st.on) return; const dt = Math.min(.1, (now - st.last)/1000); st.last = now;
    const s = scenes[st.i]; st.t += dt;
    if(!s.hold && st.t >= s.dur) go(st.i + 1); else paint();
    if(st.on) st.raf = requestAnimationFrame(frame);
  }
  function finish(){ const f = st.done; st.on = false; st.done = null; tr = null; cancelAnimationFrame(st.raf); root.hidden = true; if(f) f(); }
  /* 보여 주기. done: 마지막 장면에서 '주행 시작'을 눌렀을 때 */
  function show(done){ mount(); st.on = true; st.done = done || null; root.hidden = false; st.i = 0; tr = null; st.t = 0; const s = scenes[0]; if(s.draw.reset) s.draw.reset(); paint(); st.last = performance.now(); cancelAnimationFrame(st.raf); st.raf = requestAnimationFrame(frame); btnNext.focus(); }
  function hide(){ if(!root) return; st.on = false; st.done = null; tr = null; cancelAnimationFrame(st.raf); root.hidden = true; }
  // 테스트 · 캡처용: 장면 i를 t초 자리로(장면 바꿈 막대 없이 바로)
  function seek(i, t){ mount(); const changed = st.i !== i; st.i = i; st.t = t; tr = null; const s = scenes[i]; if(s.draw.reset && (t === 0 || changed)) s.draw.reset(); paint(); }
  // parts: 캡처 · 검사용(부품을 따로 그려 볼 때)
  return {show, hide, seek, preload:mount, go:i => go(i), scenes, state:() => ({on:st.on, i:st.i, t:st.t, id:scenes[st.i].id}), parts:{car, other, key, keyboard, C, TONE, KEYTONE, defsOf}};
})();
