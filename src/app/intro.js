/* ============================================================
   intro.js — 주행 테스트 안내 모션그래픽 (2026-11-17 밤, 사용자: 맨 앞의 연습 주행 대신 '어떻게 조작하고 무엇을 수집하는지'를 모션그래픽으로)
   · 주행 테스트의 첫 단계(session.js buildSteps의 {kind:'tour'}). 장면 6개: 시작 → 조작 방법 → 직접 눌러 보기 → 할 일 → 기록하는 것 → 준비
   · 그림: Blender로 렌더한 3D 영상 · 그림(assets/video/intro_*.mp4 · .webp — 만드는 법 assets/blender/intro_mg.py · intro_encode.sh).
     처음엔 SVG 그림뿐이었는데 사용자가 '블렌더나 힉스필드로 고퀄리티 모션그래픽'을 원해 3D 장면으로 바꿨다. 글자 · 자막 · 속도 숫자는 영상에 굽지 않고 이 파일이 영상 시각에 맞춰 그 위에 그린다
     (문장을 고쳐도 다시 렌더할 필요가 없다). 영상을 못 불러오면 예전 SVG 그림(각 장면의 ill 묶음)이 대신 나온다
   · 조작 장면의 시간 식(T · 속도)은 intro_mg.py의 장면 b와 같은 값 — 한쪽을 고치면 다른 쪽도
   · HUD의 표시(색 · 꺾쇠 · 점 등)가 무슨 뜻인지는 **알려 주지 않는다** — 두 HUD를 비교하는 실험이라 한쪽 뜻을 미리 가르치면 결과가 흐려진다. 조작 · 할 일 · 기록 항목만
   · 방향키는 '직접 눌러 보기' 장면이 쓰므로 넘기기는 버튼 · Enter(다음) · Backspace(이전)
   · 문장은 [가정 — 사용자 확인 대기]. 기록 항목은 session.js HEAD(엑셀 '기록' 시트)와 맞춘다
   ============================================================ */
const TOUR = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const C = {ink:'#eef2f6', sub:'#93a0ae', dim:'#5b6673', rule:'#2a333e', panel:'#141a21', road:'#1c232c', line:'#cdd5dd', cyan:'#00e5ff', go:'#3ddc84', warn:'#ffb020', red:'#ff5a52', car:'#e9edf1'};
  const svg = (tag, a = {}, parent) => { const e = document.createElementNS(NS, tag); for(const k in a) e.setAttribute(k, a[k]); if(parent) parent.appendChild(e); return e; };
  const txt = (parent, x, y, s, cls, a = {}) => { const e = svg('text', {x, y, class:cls, ...a}, parent); e.textContent = s; return e; };
  const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const ss = t => { t = cl(t); return t*t*(3 - 2*t); }, eo = t => 1 - Math.pow(1 - cl(t), 3);
  const seg = (t, a, b) => cl((t - a)/(b - a));
  // 아래에서 떠오르며 나타남 (묶음 g에만 쓴다 — transform을 덮어씀)
  const pop = (e, t, t0, dy = 18, d = .55) => { const k = eo((t - t0)/d); e.setAttribute('opacity', k.toFixed(3)); e.setAttribute('transform', `translate(0 ${((1 - k)*dy).toFixed(1)})`); };

  /* ---------- 부품 ---------- */
  // 위에서 본 차(앞 = 위). 돌려줌: {g, at(x, y, rot), brake(on), blink(side, on)}
  function car(parent, col = C.car, s = 1){
    const g = svg('g', {}, parent), b = svg('g', {transform:`scale(${s})`}, g);
    svg('rect', {x:-29, y:-55, width:58, height:114, rx:19, fill:'#000', opacity:.32, transform:'translate(5 7)'}, b);
    svg('rect', {x:-28, y:-56, width:56, height:112, rx:18, fill:col}, b);
    svg('rect', {x:-24, y:-52, width:48, height:104, rx:15, fill:'#fff', opacity:.16}, b);
    svg('path', {d:'M-21 -25 Q0 -35 21 -25 L18 -4 H-18 Z', fill:'#1b2430'}, b);
    svg('path', {d:'M-18 33 Q0 39 18 33 L16 18 H-16 Z', fill:'#1b2430'}, b);
    svg('rect', {x:-17, y:-2, width:34, height:18, rx:5, fill:col}, b); svg('rect', {x:-17, y:-2, width:34, height:18, rx:5, fill:'#fff', opacity:.22}, b);
    for(const sx of [-1, 1]){ svg('rect', {x:sx > 0 ? 12 : -23, y:-56, width:11, height:5, rx:2, fill:'#fff6d0'}, b); svg('rect', {x:sx > 0 ? 28 : -33, y:-22, width:5, height:9, rx:2, fill:col}, b); }
    const tail = [-1, 1].map(sx => svg('rect', {x:sx > 0 ? 11 : -24, y:51, width:13, height:5, rx:2, fill:'#8f241f'}, b));
    const bl = {'-1':[], '1':[]};
    for(const sx of [-1, 1]) for(const y of [-57, 52]) bl[sx].push(svg('rect', {x:sx > 0 ? 21 : -28, y, width:7, height:6, rx:2, fill:C.warn, opacity:0}, b));
    return {g, at:(x, y, r = 0) => g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${r.toFixed(1)})`),
      brake:on => tail.forEach(e => e.setAttribute('fill', on ? '#ff3b30' : '#8f241f')), blink:(side, on) => { for(const k of [-1, 1]) bl[k].forEach(e => e.setAttribute('opacity', on && k === side ? 1 : 0)); }};
  }
  // 키 모양. 돌려줌: {g, set(눌림 0 ~ 1, 색)}
  function key(parent, x, y, label, w = 68, h = 64){
    const g = svg('g', {transform:`translate(${x} ${y})`}, parent);
    svg('rect', {x:-w/2, y:-h/2 + 6, width:w, height:h, rx:12, fill:'#07090c'}, g);
    const top = svg('g', {}, g), face = svg('rect', {x:-w/2, y:-h/2, width:w, height:h, rx:12, fill:'#232c37', stroke:'#3a4654', 'stroke-width':1.5}, top), t = txt(top, 0, 9, label, 't-key', {'text-anchor':'middle'});
    return {g, set:(k, col = C.cyan) => { top.setAttribute('transform', `translate(0 ${(4.5*k).toFixed(1)})`); face.setAttribute('fill', k > .02 ? col : '#232c37'); face.setAttribute('stroke', k > .02 ? col : '#3a4654'); t.style.fill = k > .5 ? '#06121a' : C.ink; }};
  }
  // 키 묶음: 방향키(역 T) + Q · E. 가운데 (cx, cy), 크기 s
  function keyboard(parent, cx, cy, s = 1){
    const g = svg('g', {transform:`translate(${cx} ${cy}) scale(${s})`}, parent), K = {};
    K.up = key(g, 0, -37, '↑'); K.left = key(g, -76, 37, '←'); K.down = key(g, 0, 37, '↓'); K.right = key(g, 76, 37, '→'); K.q = key(g, -262, 0, 'Q'); K.e = key(g, -186, 0, 'E');
    return {g, K};
  }
  // 도로 판: 둥근 창 안에 세로 도로. 돌려줌 {g(창 안), lanes[x], dashes[]}
  function roadPanel(parent, id, x = 90, y = 104, w = 430, h = 548, lanes = 3, lw = 108){
    svg('rect', {x, y, width:w, height:h, rx:22, fill:C.panel, stroke:C.rule, 'stroke-width':1.5}, parent);
    const cp = svg('clipPath', {id}, parent); svg('rect', {x, y, width:w, height:h, rx:22}, cp);
    const g = svg('g', {'clip-path':`url(#${id})`}, parent), x0 = x + (w - lanes*lw)/2;
    svg('rect', {x:x0 - 14, y, width:lanes*lw + 28, height:h, fill:C.road}, g);
    for(const ex of [x0 - 4, x0 + lanes*lw + 4]) svg('rect', {x:ex - 3, y, width:6, height:h, fill:C.line, opacity:.85}, g);
    const dashes = []; for(let i = 1; i < lanes; i++) dashes.push(svg('line', {x1:x0 + i*lw, y1:y - 80, x2:x0 + i*lw, y2:y + h + 80, stroke:C.line, 'stroke-width':5, 'stroke-dasharray':'34 46', opacity:.8}, g));
    return {g, x, y, w, h, x0, lw, lanes:Array.from({length:lanes}, (_, i) => x0 + (i + .5)*lw), dashes, scroll:d => dashes.forEach(e => e.setAttribute('stroke-dashoffset', (-d % 80).toFixed(1)))};
  }
  const ICON = {   // 48 × 48 안의 선 그림
    exit:'M14 40 V24 Q14 12 27 12 H34 M28 6 L35 12 L28 18', crash:'M24 5 L28 17 L40 12 L33 23 L44 28 L32 31 L35 43 L25 35 L16 44 L17 31 L5 30 L15 23 L8 12 L20 17 Z',
    cut:'M15 42 V30 Q15 22 23 19 Q31 16 31 7 M26 11 L31 6 L36 11 M33 42 V30', clock:'M24 6 A18 18 0 1 0 24.01 6 Z M24 13 V24 L32 29',
    ped:'M24 9 A4 4 0 1 0 24.01 9 Z M24 18 V30 M24 30 L18 42 M24 30 L31 41 M16 24 L24 20 L32 25', ask:'M8 10 H40 V32 H22 L13 40 V32 H8 Z M17 21 H18 M24 21 H25 M31 21 H32'
  };
  const icon = (parent, name, x, y, col = C.cyan) => { const g = svg('g', {transform:`translate(${x} ${y})`}, parent); svg('circle', {cx:24, cy:24, r:30, fill:'#0d1319', stroke:C.rule, 'stroke-width':1.5}, g);
    svg('path', {d:ICON[name], fill:name === 'crash' ? col : 'none', stroke:col, 'stroke-width':name === 'crash' ? 0 : 3.4, 'stroke-linecap':'round', 'stroke-linejoin':'round'}, g); return g; };

  /* ---------- 장면 ---------- */
  const KEYS6 = [['left', 'ArrowLeft', '핸들 왼쪽'], ['right', 'ArrowRight', '핸들 오른쪽'], ['up', 'ArrowUp', '가속'], ['down', 'ArrowDown', '브레이크'], ['q', 'KeyQ', '왼쪽 깜빡이'], ['e', 'KeyE', '오른쪽 깜빡이']];
  const scenes = [
    { id:'start', name:'시작', dur:5.5, video:'assets/video/intro_a.mp4', build(g){
        svg('rect', {x:0, y:0, width:1280, height:720, fill:'url(#tourShade)'}, g);
        const a = svg('g', {}, g), b = svg('g', {}, g), c = svg('g', {}, g);
        txt(a, 640, 268, '주행 테스트 안내', 't-hero', {'text-anchor':'middle'});
        txt(b, 640, 330, '키보드로 여섯 번 운전합니다 · 한 번에 1분 안팎', 't-lead', {'text-anchor':'middle'});
        const chips = ['조작 방법', '할 일', '기록하는 것'].map((s, i) => { const q = svg('g', {}, c), x = 640 + (i - 1)*220; svg('rect', {x:x - 96, y:392, width:192, height:54, rx:27, fill:C.panel, stroke:C.rule, 'stroke-width':1.5}, q);
          txt(q, x - 58, 427, String(i + 1), 't-num'); txt(q, x - 34, 427, s, 't-chip'); return q; });
        const rd = svg('g', {class:'ill'}, g); svg('rect', {x:0, y:560, width:1280, height:96, fill:C.road}, rd); for(const y of [560, 656]) svg('rect', {x:0, y:y - 2, width:1280, height:4, fill:C.line, opacity:.7}, rd);
        const dash = svg('line', {x1:-100, y1:608, x2:1400, y2:608, stroke:C.line, 'stroke-width':5, 'stroke-dasharray':'40 50', opacity:.75}, rd), cr = car(rd, C.car, .62);
        return t => { pop(a, t, .2, 26, .7); pop(b, t, .7); chips.forEach((q, i) => pop(q, t, 1.3 + i*.25)); dash.setAttribute('stroke-dashoffset', (t*220 % 90).toFixed(1)); cr.at(250 + 780*ss(t/5.5), 632 - 48*ss(seg(t, 2.2, 3.6)), 90 - 14*Math.sin(Math.PI*seg(t, 2.2, 3.6))); cr.blink(-1, t > 1.7 && t < 3.8 && Math.floor(t/.33) % 2 === 0); };
    }},
    { id:'keys', name:'조작', dur:14.2, video:'assets/video/intro_b.mp4', build(g){
        const ill = svg('g', {class:'ill'}, g), R = roadPanel(ill, 'tourClipA'), cr = car(R.g), spd = svg('g', {}, g);
        svg('rect', {x:R.x + 18, y:R.y + 18, width:150, height:58, rx:12, fill:'#0b0f14', opacity:.86}, spd); const num = txt(spd, R.x + 86, R.y + 59, '50', 't-speed', {'text-anchor':'end'}); txt(spd, R.x + 94, R.y + 59, 'km/h', 't-unit');
        const head = svg('g', {}, g); txt(head, 790, 150, '이렇게 조작합니다', 't-title');
        const kb = keyboard(ill, 1080, 275, .82), K = kb.K; txt(g, 868, 352, '깜빡이', 't-cap', {'text-anchor':'middle'});   // 3D 키 자리(intro_mg.py KEYPOS: Q 836 · E 901, 275)
        const rows = [['← →', '핸들'], ['↑', '가속 — 누르는 동안 빨라집니다'], ['↓', '브레이크 — 길게 누를수록 세게'], ['손을 떼면', '정해진 속도로 스스로 갑니다'], ['Q E', '깜빡이 — 차로 옮기기 전에']].map(([k, s], i) => { const q = svg('g', {}, g), y = 432 + i*47;
          const bar = svg('rect', {x:790, y:y - 26, width:5, height:34, rx:2.5, fill:C.cyan}, q), a = txt(q, 812, y, k, 't-rowk'), b = txt(q, 812 + (i === 3 ? 112 : 80), y, s, 't-row'); return {q, bar, a, b}; });
        const T = [.6, 3.0, 5.4, 7.8, 10.2, 13.4]; let last = 0, dist = 0;
        return t => { if(t < last) dist = 0; const dt = t - last; last = t;
          const step = t < T[0] ? -1 : t < T[1] ? 0 : t < T[2] ? 1 : t < T[3] ? 2 : t < T[4] ? 3 : 4;
          pop(head, t, .1); rows.forEach((r, i) => { pop(r.q, t, .35 + i*.1, 12); const on = i === step; r.bar.setAttribute('opacity', on ? 1 : 0); r.a.style.fill = on ? C.cyan : C.sub; r.b.style.fill = on ? C.ink : C.sub; });
          // 1) 핸들: 오른쪽 → 왼쪽 → 가운데
          const u = seg(t, T[0], T[1] - .2), sway = step === 0 ? Math.sin(u*Math.PI*2) : 0, kr = step === 0 && (u < .25 || u > .75) && u < 1, kl = step === 0 && u >= .25 && u <= .75;
          // 2 ~ 4) 속도: 가속 50 → 80 · 브레이크 80 → 22 · 손 떼면 22 → 50
          const v = t < T[1] ? 50 : t < T[2] ? 50 + 30*ss(seg(t, T[1] + .2, T[2] - .3)) : t < T[3] ? 80 - 58*ss(seg(t, T[2] + .1, T[3] - .5)) : 22 + 28*ss(seg(t, T[3] + .2, T[4] - .3));
          const ku = step === 1 && t < T[2] - .3, kd = step === 2 && t < T[3] - .5;
          // 5) 깜빡이 E → 오른쪽 차로로
          const ke = step === 4 && t < T[4] + .55, blinking = step === 4 && t > T[4] + .2 && t < T[5] - .3, mv = ss(seg(t, T[4] + 1.0, T[5] - .6));
          dist += dt*v*5.2; R.scroll(dist); num.textContent = String(Math.round(v));
          cr.at(R.lanes[1] + sway*40 + (R.lanes[2] - R.lanes[1])*mv, R.y + 380, sway ? Math.cos(u*Math.PI*2)*7 : 9*Math.sin(Math.PI*mv)); cr.brake(kd); cr.blink(1, blinking && Math.floor(t/.32) % 2 === 0);
          K.left.set(kl ? 1 : 0); K.right.set(kr ? 1 : 0); K.up.set(ku ? 1 : 0); K.down.set(kd ? 1 : 0); K.e.set(ke ? 1 : 0, C.warn); K.q.set(0); };
    }},
    { id:'try', name:'눌러 보기', dur:Infinity, hold:true, image:'assets/video/intro_keys_0.webp', lit:[1, 2, 3, 4, 5, 6].map(i => `assets/video/intro_keys_${i}.webp`), build(g, api){
        const head = svg('g', {}, g); txt(head, 110, 150, '직접 눌러 보세요', 't-title');
        const sub = svg('g', {}, g); txt(sub, 110, 196, '여섯 개 키를 한 번씩 누르면 다음으로 넘어갑니다', 't-lead');
        const ill = svg('g', {class:'ill'}, g), kb = keyboard(ill, 822, 480, 1.9), K = kb.K, got = {}, at = {};
        const pos = {left:[676, 628], right:[967, 628], up:[813, 356], down:[822, 628], q:[321, 572], e:[463, 572]};   // 키 아래(↑만 위) 이름표 — 3D 그림의 키 자리(intro_mg.py 장면 c의 KEYPOS)
        const labs = KEYS6.map(([k, , s]) => { const [x, y] = pos[k]; return txt(g, x, y, s, 't-cap', {'text-anchor':'middle'}); });
        const cnt = txt(g, 1120, 196, '0 / 6', 't-count', {'text-anchor':'middle'});
        const onKey = e => { const k = KEYS6.find(q => q[1] === e.code); if(!k || !api.active('try')) return; e.preventDefault(); e.stopPropagation(); if(!got[k[0]]){ got[k[0]] = true; at[k[0]] = api.t(); } at['p_' + k[0]] = api.t(); };
        addEventListener('keydown', onKey, true);
        return Object.assign(t => { pop(head, t, .1); pop(sub, t, .35); const n = Object.keys(got).length;
          KEYS6.forEach(([k], i) => { const p = at['p_' + k], press = p !== undefined ? 1 - seg(t, p + .12, p + .3) : 0; K[k].set(got[k] ? Math.max(.35, press) : press, k === 'q' || k === 'e' ? C.warn : C.cyan); labs[i].style.fill = got[k] ? C.ink : C.sub; });
          cnt.textContent = n + ' / 6'; cnt.style.fill = n === 6 ? C.go : C.sub; api.lit(KEYS6.map(([k]) => !!got[k]));
          if(n === 6 && !got.done){ got.done = t; } if(got.done && t > got.done + .9) api.next(); },
          {reset(){ for(const k in got) delete got[k]; for(const k in at) delete at[k]; }, state:() => ({n:Object.keys(got).filter(k => k !== 'done').length})});
    }},
    { id:'task', name:'할 일', dur:14, video:'assets/video/intro_d.mp4', build(g){
        const ill = svg('g', {class:'ill'}, g), R = roadPanel(ill, 'tourClipB'), L = R.lanes, y0 = R.y;
        // 오른쪽 차로가 출구로 갈라짐: 갈림(yF) 위로는 본선이 두 차로, 셋째 차로는 오른쪽 위로 휘어 나간다 + 문형 표지(목적지 칸은 흰 테)
        const yF = y0 + 250, xe = R.x0 + 2*R.lw, P0 = [L[2], yF], P1 = [L[2], y0 + 110], P2 = [L[2] + 96, y0 - 30];
        svg('rect', {x:xe - 3, y:y0, width:R.lw + 60, height:yF - y0 - 12, fill:C.panel}, R.g);                                        // 갈림 위 셋째 차로 자리는 도로 밖
        svg('path', {d:`M${P0[0]} ${yF + 40} V${yF} Q${P1[0]} ${P1[1]} ${P2[0]} ${P2[1]}`, fill:'none', stroke:C.road, 'stroke-width':R.lw + 8}, R.g);   // 출구 노면
        svg('path', {d:`M${xe + R.lw + 4} ${yF + 40} V${yF} Q${xe + R.lw + 4} ${P1[1] + 16} ${P2[0] + 62} ${P2[1] + 34}`, fill:'none', stroke:C.line, 'stroke-width':6, opacity:.85}, R.g);   // 출구 바깥 선
        svg('path', {d:`M${xe + 2} ${y0} V${yF - 70} M${xe + 2} ${yF - 70} Q${xe + 2} ${P1[1] - 6} ${P2[0] - 58} ${P2[1] - 6}`, fill:'none', stroke:C.line, 'stroke-width':6, opacity:.85}, R.g);   // 본선 오른쪽 끝 · 갈림 안쪽 선
        const sign = svg('g', {}, R.g); svg('rect', {x:R.x0 - 8, y:y0 + 196, width:3*R.lw + 16, height:8, fill:'#77828d'}, sign);
        svg('rect', {x:R.x0 + 8, y:y0 + 150, width:2*R.lw - 16, height:44, rx:5, fill:'#1f7a4a'}, sign); txt(sign, R.x0 + R.lw, y0 + 180, '직진', 't-sign', {'text-anchor':'middle'});
        const dest = svg('rect', {x:R.x0 + 2*R.lw + 8, y:y0 + 150, width:R.lw - 16, height:44, rx:5, fill:'#1f7a4a', stroke:'#fff', 'stroke-width':0}, sign); txt(sign, R.x0 + 2.5*R.lw, y0 + 180, '목적지', 't-sign', {'text-anchor':'middle'});
        const rear = car(R.g, '#aeb7c0'), me = car(R.g);
        const head = svg('g', {}, g); txt(head, 760, 150, '할 일은 하나입니다', 't-title'); const lead = svg('g', {}, g); txt(lead, 760, 196, '목적지 출구로, 안전하게 갑니다', 't-lead');
        const rows = [['1', '판마다 목적지가 정해집니다', '표지판과 화면 안내를 보고 그 출구로'], ['2', '차로는 안전할 때 옮깁니다', '옆 차로 뒤차를 보고, 깜빡이를 켜고'], ['3', '앞도 살핍니다', '앞차 · 보행자 · 공사 구간에서는 천천히']].map(([n, a, b], i) => { const q = svg('g', {}, g), y = 276 + i*84;
          svg('circle', {cx:778, cy:y - 9, r:17, fill:'none', stroke:C.cyan, 'stroke-width':2}, q); txt(q, 778, y - 2, n, 't-num', {'text-anchor':'middle'}); txt(q, 812, y - 2, a, 't-rowb'); txt(q, 812, y + 28, b, 't-rows'); return q; });
        const strip = svg('g', {}, g); txt(strip, 760, 548, '화면 안내는 두 가지가 번갈아 나옵니다', 't-row');
        const chips = Array.from({length:6}, (_, i) => { const q = svg('g', {}, strip), x = 760 + i*82, hy = i % 2 === 0; svg('rect', {x, y:568, width:74, height:42, rx:10, fill:hy ? '#1b2430' : '#10323a', stroke:hy ? '#3a4654' : '#1d6a78', 'stroke-width':1.5}, q);
          txt(q, x + 37, 596, hy ? '현대' : '리뉴얼', 't-chip2', {'text-anchor':'middle'}); return q; });
        const rampPt = u => { const a = P0, b = P1, c = P2, v = 1 - u; return [v*v*a[0] + 2*v*u*b[0] + u*u*c[0], v*v*a[1] + 2*v*u*b[1] + u*u*c[1]]; };
        return t => { pop(head, t, .1); pop(lead, t, .4); rows.forEach((q, i) => pop(q, t, [1.0, 4.4, 8.6][i])); pop(strip, t, 11.0); chips.forEach((q, i) => pop(q, t, 11.4 + i*.14, 10, .4));
          R.scroll(t*150); dest.setAttribute('stroke-width', t > 1.2 ? (2 + 2*Math.abs(Math.sin(t*3))).toFixed(1) : 0);
          // 뒤차: 오른쪽 차로를 아래에서 올라와 나를 지나 출구로
          const ru = seg(t, 2.2, 7.4), ry = y0 + 660 - 430*ru; if(ru < 1 && ry > y0 + 250){ rear.at(L[2], ry, 0); } else { const p = rampPt(seg(t, 7.0, 8.6)); rear.at(p[0], p[1], 34*seg(t, 7.0, 8.6)); } rear.g.setAttribute('opacity', t > 8.5 ? (1 - seg(t, 8.5, 8.9)).toFixed(2) : 1);
          // 나: 가운데 차로 → (뒤차가 지나간 뒤) 깜빡이 → 오른쪽 차로 → 출구
          const mv = ss(seg(t, 6.6, 8.4)), ex = seg(t, 10.2, 12.6), my = y0 + 440 - 150*ss(seg(t, 8.4, 10.2));
          if(ex <= 0) me.at(L[1] + (L[2] - L[1])*mv, my, 10*Math.sin(Math.PI*mv)); else { const p = rampPt(ss(ex)*.8), q0 = [L[2], y0 + 290], k = ss(seg(ex, 0, .3)); me.at(q0[0] + (p[0] - q0[0])*k, q0[1] + (p[1] - q0[1])*k, 30*ss(ex)); }
          me.blink(1, t > 5.6 && t < 8.6 && Math.floor(t/.32) % 2 === 0); };
    }},
    { id:'data', name:'기록', dur:12.5, image:'assets/video/intro_bg.webp', build(g){
        svg('rect', {x:0, y:0, width:1280, height:720, fill:'#0b0e12', opacity:.72}, g);
        const head = svg('g', {}, g); txt(head, 640, 132, '이런 것을 기록합니다', 't-title', {'text-anchor':'middle'});
        const items = [['exit', '목적지 출구', '안내된 출구로 갔는지', C.cyan], ['crash', '충돌', '차 · 보행자 · 공사 구간과 부딪혔는지', C.red], ['cut', '위험한 끼어들기', '뒤차 바로 앞으로 들어갔는지', C.warn],
          ['clock', '차로를 옮긴 때', '어디서, 얼마나 걸려 옮겼는지', C.cyan], ['ped', '보행자 양보 · 도로 벗어남', '멈춰서 기다렸는지, 길 밖으로 나갔는지', C.go], ['ask', '짧은 질문', '끝난 뒤 세 문항에 답합니다', C.ink]];
        const cards = items.map(([ic, a, b, col], i) => { const q = svg('g', {}, g), x = 96 + (i % 2)*552, y = 172 + Math.floor(i/2)*116; svg('rect', {x, y, width:536, height:100, rx:16, fill:C.panel, stroke:C.rule, 'stroke-width':1.5}, q);
          icon(q, ic, x + 28, y + 26, col); txt(q, x + 104, y + 44, a, 't-rowb'); txt(q, x + 104, y + 75, b, 't-rows'); return q; });
        const f1 = svg('g', {}, g), f2 = svg('g', {}, g);
        txt(f1, 640, 566, '참가자 번호로만 저장합니다. 이름 · 얼굴 · 목소리는 기록하지 않습니다.', 't-row', {'text-anchor':'middle'}).style.fill = C.ink;
        txt(f2, 640, 606, '운전 실력을 평가하는 것이 아니라, 두 화면 안내를 비교하는 실험입니다.', 't-row', {'text-anchor':'middle'});
        return t => { pop(head, t, .1); cards.forEach((q, i) => pop(q, t, .7 + i*.8, 22)); pop(f1, t, 6.4); pop(f2, t, 7.8); };
    }},
    { id:'ready', name:'준비', dur:Infinity, hold:true, image:'assets/video/intro_bg.webp', build(g){
        svg('rect', {x:0, y:0, width:1280, height:720, fill:'#0b0e12', opacity:.6}, g);
        const a = svg('g', {}, g), b = svg('g', {}, g), c = svg('g', {}, g), d = svg('g', {}, g);
        txt(a, 640, 250, '준비되면 시작하세요', 't-hero', {'text-anchor':'middle'});
        txt(b, 640, 310, '첫 주행에는 키 안내가 화면 아래에 계속 보입니다', 't-lead', {'text-anchor':'middle'});
        [['← →', '핸들'], ['↑', '가속'], ['↓', '브레이크'], ['Q E', '깜빡이']].forEach(([k, s], i) => { const x = 640 + (i - 1.5)*230; svg('rect', {x:x - 102, y:372, width:204, height:60, rx:14, fill:C.panel, stroke:C.rule, 'stroke-width':1.5}, c);
          txt(c, x - 76, 411, k, 't-rowk').style.fill = C.cyan; txt(c, x - 4, 411, s, 't-row').style.fill = C.ink; });
        const ring = svg('rect', {x:440, y:492, width:400, height:58, rx:29, fill:'none', stroke:C.cyan, 'stroke-width':2}, d); txt(d, 640, 529, '아래 "주행 시작" 또는 Enter', 't-row', {'text-anchor':'middle'}).style.fill = C.ink;
        return t => { pop(a, t, .15, 26, .7); pop(b, t, .6); pop(c, t, 1.0); pop(d, t, 1.6); ring.setAttribute('opacity', (.45 + .55*Math.abs(Math.sin(t*2.2))).toFixed(2)); };
    }}
  ];

  /* ---------- 진행 ----------
     무대 = 영상 · 그림 층(#tour .tour-media) 위에 SVG 자막 층. 영상이 있는 장면은 영상의 시각(currentTime)이 곧 장면 시각 t — 자막 · 속도 숫자가 영상과 어긋나지 않는다.
     영상 · 그림을 못 불러온 장면은 시계로 가고 SVG 그림(.ill)이 대신 보인다 */
  let root = null, stage = null, media = null, bar = null, btnPrev = null, btnNext = null, layers = [], st = {i:0, t:0, on:false, last:0, raf:0, done:null};
  const api = {active:id => st.on && scenes[st.i].id === id, t:() => st.t, next:() => go(st.i + 1), lit:on => { const s = scenes[st.i]; if(s.litEls) s.litEls.forEach((e, k) => e.style.opacity = on[k] ? 1 : 0); }};
  function mount(){
    if(root) return;
    root = document.createElement('div'); root.id = 'tour'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', '주행 테스트 안내');
    root.innerHTML = '<div class="tour-stage"><div class="tour-frame"><div class="tour-media"></div></div></div><div class="tour-bar"><div class="tour-steps"></div><div class="tour-actions"><button class="tour-btn" id="tourPrev">이전</button><button class="tour-btn primary" id="tourNext">다음</button></div></div>';
    document.body.appendChild(root);
    media = root.querySelector('.tour-media');
    stage = svg('svg', {viewBox:'0 0 1280 720', 'aria-hidden':'true'}, root.querySelector('.tour-frame'));
    const defs = svg('defs', {}, stage), sh = svg('radialGradient', {id:'tourShade', cx:.5, cy:.46, r:.62}, defs);   // 시작 장면: 글자 뒤만 어둡게
    svg('stop', {offset:0, 'stop-color':'#05070a', 'stop-opacity':.78}, sh); svg('stop', {offset:1, 'stop-color':'#05070a', 'stop-opacity':.12}, sh);
    scenes.forEach(s => {   // 영상 · 그림 층
      s.ok = false;
      if(s.video){ const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = s.video; v.addEventListener('loadeddata', () => { s.ok = true; paint(); }); v.addEventListener('error', () => { s.ok = false; }); media.appendChild(v); s.el = v; }
      else if(s.image){ const im = new Image(); im.onload = () => { s.ok = true; paint(); }; im.src = s.image; media.appendChild(im); s.el = im;
        if(s.lit) s.litEls = s.lit.map(u => { const e = new Image(); e.src = u; e.className = 'tour-lit'; media.appendChild(e); return e; }); }
    });
    layers = scenes.map(s => { const g = svg('g', {opacity:0}, stage); s.draw = s.build(g, api); s.g = g; return g; });
    bar = root.querySelector('.tour-steps'); bar.innerHTML = scenes.map((s, i) => `<span class="tour-step" data-i="${i}"><i></i><b>${s.name}</b></span>`).join('');
    btnPrev = root.querySelector('#tourPrev'); btnNext = root.querySelector('#tourNext');
    btnPrev.onclick = () => go(st.i - 1); btnNext.onclick = () => go(st.i + 1);
    addEventListener('keydown', e => { if(!st.on) return; if(e.key === 'Enter'){ e.preventDefault(); e.stopPropagation(); go(st.i + 1); } else if(e.key === 'Backspace'){ e.preventDefault(); go(st.i - 1); }
      else if(/^Arrow|^Key[QE]$/.test(e.code) || e.key === ' '){ e.preventDefault(); e.stopPropagation(); } }, true);   // 방향키 · Q · E는 '눌러 보기' 장면 몫(다른 곳으로 새지 않게)
  }
  function paint(){
    const s = scenes[st.i]; layers.forEach((g, i) => g.setAttribute('opacity', i === st.i ? 1 : 0));
    scenes.forEach((q, i) => { if(q.el) q.el.style.opacity = i === st.i && q.ok ? 1 : 0; if(q.litEls && i !== st.i) q.litEls.forEach(e => e.style.opacity = 0); });
    s.g.classList.toggle('has-media', !!s.ok);   // 영상 · 그림이 있으면 SVG 그림(.ill)은 숨김
    s.draw(st.t);
    bar.querySelectorAll('.tour-step').forEach((e, i) => { e.classList.toggle('on', i === st.i); e.classList.toggle('done', i < st.i); e.firstChild.style.width = (i < st.i ? 100 : i === st.i ? (s.hold ? 100 : cl(st.t/s.dur)*100) : 0) + '%'; });
    btnPrev.disabled = st.i === 0; btnNext.textContent = st.i === scenes.length - 1 ? '주행 시작' : '다음';
  }
  function stopVideos(){ scenes.forEach(q => { if(q.video && q.el && !q.el.paused) q.el.pause(); }); }
  function go(i){
    if(i < 0) return; if(i >= scenes.length){ finish(); return; }
    stopVideos(); st.i = i; st.t = 0; const s = scenes[i]; if(s.draw.reset) s.draw.reset();
    if(s.video && s.el){ try{ s.el.currentTime = 0; const pr = s.el.play(); if(pr && pr.catch) pr.catch(() => {}); }catch(e){} }
    paint();
  }
  function frame(now){
    if(!st.on) return; const dt = Math.min(.1, (now - st.last)/1000); st.last = now;
    const s = scenes[st.i], v = s.video && s.ok ? s.el : null;
    if(v && !v.paused && !v.ended) st.t = v.currentTime; else st.t += dt;        // 영상이 돌고 있으면 영상 시각, 아니면 시계
    if(!s.hold && (st.t >= s.dur || (v && v.ended))) go(st.i + 1); else paint();
    if(st.on) st.raf = requestAnimationFrame(frame);
  }
  function finish(){ const f = st.done; st.on = false; st.done = null; cancelAnimationFrame(st.raf); stopVideos(); root.hidden = true; if(f) f(); }
  /* 보여 주기. done: 마지막 장면에서 '주행 시작'을 눌렀을 때 */
  function show(done){ mount(); st.on = true; st.done = done || null; root.hidden = false; go(0); st.last = performance.now(); cancelAnimationFrame(st.raf); st.raf = requestAnimationFrame(frame); btnNext.focus(); }
  function hide(){ if(!root) return; st.on = false; st.done = null; cancelAnimationFrame(st.raf); stopVideos(); root.hidden = true; }
  // 테스트 · 캡처용: 장면 i를 t초 자리로(영상도 그 시각으로 옮기고 멈춤)
  function seek(i, t){ mount(); stopVideos(); st.i = i; st.t = t; const s = scenes[i]; if(s.draw.reset && t === 0) s.draw.reset(); if(s.video && s.el){ try{ s.el.currentTime = Math.min(t, (s.el.duration || s.dur) - .04); }catch(e){} } paint(); }
  return {show, hide, seek, preload:mount, go:i => go(i), scenes, state:() => ({on:st.on, i:st.i, t:st.t, id:scenes[st.i].id})};
})();
