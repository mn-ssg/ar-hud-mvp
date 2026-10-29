/* ============================================================
   ourhud.js — 우리 HUD (그래픽만, 글자 없음). 판단은 guide.js → main.js guideStep → S.G, 여기는 그리기만.
   설계 근거 · 리서치: 01_프로젝트/10_HUD_GUI_설계.md 0-7절 (2026-10-29)

   표시 영역: HUD 상자(#hudWrap, viewBox 520 × 270) 하나. 모든 층은 #hudClip 안에서만 그린다(index.html).
   좌표 변환 · 자르기 · 앞 방향 띠는 hudgeom.js — 내 차 아이콘은 가까운 면(내 차 앞 4m) 아래, 옆으로 35° 넘게 꺾인 길은 그리지 않음

   그래픽 어휘 (색 하나에 뜻을 몰지 않음 — 형태 · 자리 · 움직임을 함께):
     들어갈 차로 = 청록 면(가까울수록 진함) + 빛나는 청록 테두리. 상태와 상관없이 같음
     회전 = 경로가 끝나는 곳(정지선 · 꺾이는 곳)에 회전 쪽을 가리키는 청록 꺾쇠 두 개 (화면에 바로 선 기호).
            옆으로 꺾인 길은 미니 도로에 그리지 않는다 — 'ㄱ'자로 꺾인 도로처럼 보였음(사용자 지적 2번).
            실제로 돌면 내 차 방향이 따라 돌아, 새 길이 앞 방향 띠에 들어올 때 그 앞 경로가 나타난다
     지금 옮겨도 됨 = 초록 곡선 화살표(꼬리 흐림 → 머리 선명) 위로 밝은 토막이 미끄러짐
     지금 못 옮김 = 차로 경계에 선 벽. 뒤 · 옆 차 때문이면 빨강(밝은 심), 정체 줄 때문이면 주황. 화살표 없음
       └ 그래도 그쪽으로 넘어가기 시작하면 벽이 깜빡임 (양산차 후측방 경고: 감지 = 켜짐, 그쪽 깜빡이를 켜면 = 깜빡임)
     위험 차 = 앞모습(전조등)의 빨간 차 + 번지는 빛, 실제 상대 위치. 다가올수록 빛이 커지고 꼬리, 그쪽 HUD 가장자리에 빨간 빛
     위험 해소 = 벽이 0.8초 동안 끊긴 회색 토막으로 옅어짐(한 번) → 초록 화살표
     정체 줄 = 들어갈 수 없는 줄은 하나의 회색 띠 — 실제로 들어갈 수 있는 틈만 열려 보임, 판단이 '이동'일 때만 초록 테
     차로 변경 완료 = 청록 테두리가 내 차 양옆까지 내려와 감쌈 + 테두리가 1.4초 초록 → 청록
     언제까지 = 위 막대. 옮겨야 하면 남은 몫 초록 → 주황 → 빨강, 기다리는 동안 회색 · 할 일 없으면 옅은 흰색
     멈춤(빨간불 · 보행자) = 지금 차로를 가로지르는 빨간 막대
   ============================================================ */

const AHC = {lane:C_NOW, go:C_GO, wall:C_DANGER, wallCore:'#ffd2cc', jam:C_WARN, jamCore:'#ffe7b8', hazard:C_DANGER, car:'#9aa6b2', queue:'#8f9aa6', ink:'#eaf6ff', idle:'#b4bec9', stop:C_DANGER};
const hexRgb = h => [1,3,5].map(i => parseInt(h.slice(i,i+2),16));
const mix = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return '#'+A.map((v,i) => Math.round(v+(B[i]-v)*t).toString(16).padStart(2,'0')).join(''); };
const timeColor = fr => fr >= .5 ? C_GO : fr >= .2 ? mix(C_WARN, C_GO, (fr-.2)/.3) : mix(C_DANGER, C_WARN, fr/.2);   // 남은 몫: 초록 → 주황 → 빨강

/* ---------- 요소 ---------- */
function ahMarkup(){
  // 내 차: 뒷모습(빨간 미등) — 1차 실험 때와 같은 모양
  const egoCar = `<path d="M-15 4 Q-15 -3 -11 -4 L-7 -10 Q-6 -12 -3 -12 H3 Q6 -12 7 -10 L11 -4 Q15 -3 15 4 V7 Q15 9 13 9 H-13 Q-15 9 -15 7 Z" fill="${AHC.ink}" fill-opacity=".94"/>
    <rect x="-12" y="0" width="5" height="2.6" rx="1.3" fill="#ff6a6a"/><rect x="7" y="0" width="5" height="2.6" rx="1.3" fill="#ff6a6a"/>
    <path d="M-5 -9 H5 L8 -4 H-8 Z" fill="#0b0d10" fill-opacity=".55"/>`;
  return `<defs>
      <linearGradient id="ahFade" gradientUnits="userSpaceOnUse" x1="0" y1="${AH.YF}" x2="0" y2="${AH.YF + 22}"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient>
      <mask id="ahHorizon" maskUnits="userSpaceOnUse" x="0" y="0" width="${AH.W}" height="${AH.H}"><rect x="0" y="${AH.YF}" width="${AH.W}" height="${AH.H - AH.YF}" fill="url(#ahFade)"/></mask>
      <linearGradient id="ahDown" gradientUnits="userSpaceOnUse" x1="0" y1="${AH.YN}" x2="0" y2="${AH.EGO_Y + 10}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity=".1"/></linearGradient>
      <mask id="ahNearFade" maskUnits="userSpaceOnUse" x="0" y="${AH.YN}" width="${AH.W}" height="${AH.H - AH.YN}"><rect x="0" y="${AH.YN}" width="${AH.W}" height="${AH.H - AH.YN}" fill="url(#ahDown)"/></mask>
      <linearGradient id="ahLaneGrad" gradientUnits="userSpaceOnUse" x1="0" y1="${AH.YN}" x2="0" y2="${AH.YF}">
        <stop id="ahLg0" offset="0" stop-color="${AHC.lane}" stop-opacity=".6"/><stop id="ahLg1" offset=".55" stop-color="${AHC.lane}" stop-opacity=".28"/><stop id="ahLg2" offset="1" stop-color="${AHC.lane}" stop-opacity=".08"/>
      </linearGradient>
      <linearGradient id="ahGoGrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${AHC.go}" stop-opacity=".35"/><stop offset="1" stop-color="${AHC.go}" stop-opacity="1"/></linearGradient>
      <radialGradient id="ahDangerRad"><stop offset="0" stop-color="${AHC.hazard}" stop-opacity=".75"/><stop offset="1" stop-color="${AHC.hazard}" stop-opacity="0"/></radialGradient>
      <linearGradient id="ahEdgeGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${AHC.hazard}" stop-opacity="0"/><stop offset=".6" stop-color="${AHC.hazard}" stop-opacity=".95"/><stop offset="1" stop-color="${AHC.hazard}" stop-opacity=".2"/></linearGradient>
      <filter id="ahGlow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <g mask="url(#ahHorizon)">
      <path id="ahSurf" fill="#ffffff" fill-opacity=".045"/>
      <path id="ahEdges" fill="${AHC.ink}" fill-opacity=".45"/>
      <path id="ahDash" fill="${AHC.ink}" fill-opacity=".28"/>
      <path id="ahLane" fill="url(#ahLaneGrad)"/>
      <path id="ahPulses" fill="${AHC.lane}" fill-opacity=".55"/>
      <path id="ahRails" fill="${AHC.lane}" filter="url(#ahGlow)"/>
      <path id="ahTurn" fill="${AHC.lane}" fill-opacity=".9" filter="url(#ahGlow)"/>
      <path id="ahQueue" fill="${AHC.queue}" fill-opacity=".55"/>
      <path id="ahCars" fill="${AHC.car}" fill-opacity=".55"/>
      <path id="ahHazAhead" fill="${AHC.hazard}" fill-opacity=".85" filter="url(#ahGlow)"/>
      <path id="ahSlot" fill="${AHC.go}" fill-opacity=".14" stroke="${AHC.go}" stroke-width="2.4" stroke-linejoin="round" filter="url(#ahGlow)"/>
      <path id="ahStop" fill="${AHC.stop}" fill-opacity=".95" filter="url(#ahGlow)"/>
      <path id="ahPedW" fill="none" stroke="${AHC.ink}" stroke-width="1.8"/>
      <path id="ahPedC" fill="${AHC.ink}"/>
    </g>
    <g mask="url(#ahNearFade)"><path id="ahNearRails" fill="${AHC.lane}" filter="url(#ahGlow)"/></g>
    <rect id="ahEdgeL" x="0" y="${AH.YF + 30}" width="6" height="${AH.H - AH.YF - 30}" rx="3" fill="url(#ahEdgeGrad)" opacity="0"/>
    <rect id="ahEdgeR" x="${AH.W - 6}" y="${AH.YF + 30}" width="6" height="${AH.H - AH.YF - 30}" rx="3" fill="url(#ahEdgeGrad)" opacity="0"/>
    <g id="ahRear"></g>
    <g id="ahWallG" filter="url(#ahGlow)"><path id="ahWall"/><path id="ahWallCore"/></g>
    <g filter="url(#ahGlow)"><path id="ahGo" fill="url(#ahGoGrad)"/><path id="ahGoHi" fill="#e2fff0" fill-opacity=".85"/></g>
    <g id="ahEgo" transform="translate(${AH.HX} ${AH.EGO_Y - 2})">${egoCar}</g>
    <g id="ahAct" filter="url(#ahGlow)"><g transform="scale(1.55)" fill="none" stroke="${AHC.lane}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round">
      <path id="ahIcoR" d="M-6 13 V4 Q-6 -4 5 -9 M-1 -13 L8 -9 L4 -1"/><path id="ahIcoL" d="M6 13 V4 Q6 -4 -5 -9 M1 -13 L-8 -9 L-4 -1"/><path id="ahIcoS" d="M0 13 V-12 M-8 -4 L0 -13 L8 -4"/></g></g>
    <g id="ahCd"><rect id="ahCdBg" x="200" y="60" width="120" height="6" rx="3" fill-opacity=".16"/><rect id="ahCdBar" x="200" y="60" width="120" height="6" rx="3"/></g>
    <g id="ahInfo" transform="translate(84 32)">
      <circle r="21" fill="#fff" fill-opacity=".92" stroke="#e5262b" stroke-width="5"/>
      <text id="ahLim" class="hud-t tnum" y="6.8" text-anchor="middle" font-size="19" font-weight="700" fill="#111">80</text>
    </g>`;
}
$('#arHud').innerHTML = ahMarkup();

// 뒤 · 옆의 차(내 차보다 뒤): 앞모습(다가오는 차의 앞) + 번지는 빛 + 꼬리
const ahRearEls = Array.from({length:5}, () => {
  const mk = n => document.createElementNS(SVGNS, n), g = mk('g'), halo = mk('circle'), trail = mk('path'), body = mk('rect'), glass = mk('path'), lamps = mk('path');
  halo.setAttribute('fill', 'url(#ahDangerRad)');
  body.setAttribute('x', -12); body.setAttribute('y', -8); body.setAttribute('width', 24); body.setAttribute('height', 16); body.setAttribute('rx', 4.5);
  glass.setAttribute('d', 'M-8 -6 H8 L9.5 -1.5 H-9.5 Z'); glass.setAttribute('fill', '#0b0d10'); glass.setAttribute('fill-opacity', .55);
  lamps.setAttribute('d', 'M-10 2 h5 v2.4 h-5Z M5 2 h5 v2.4 h-5Z'); lamps.setAttribute('fill', '#fff6d8');
  trail.setAttribute('d', 'M-7 10 L-7.5 20 M7 10 L7.5 20'); trail.setAttribute('stroke-width', 2.6); trail.setAttribute('stroke-linecap', 'round'); trail.setAttribute('fill', 'none');
  g.append(halo, trail, body, glass, lamps); $('#ahRear').appendChild(g); return {g, halo, body, trail};
});
const rearY = dz => AH.REAR_TOP + AH.REAR_H*(1 - Math.exp(-Math.max(0, dz)/AH.REAR_K));
const AHS = {icon:null, since:0, segCache:null, segMap:null, routeCache:null};
function resetHud(){ AHS.icon = null; AHS.routeCache = null; }

/* 경로 점 (2m 간격): 갈림부터 목적지 쪽 출구 구간들을 실제 모양 그대로 이어 붙임, 마지막 구간은 ROUTE_END(70m)까지.
   2026-10-29 두 번째: 예전엔 R.afterCurve(출구 전체를 24점으로 — 점 사이 약 14m)를 썼는데, 그 곡선은 정지선에서부터 회전 모서리를
   30 ~ 40° 비스듬히 질러가서 미니 도로에 'ㄱ'자처럼 꺾인 띠가 생겼다. 첫 구간은 들어갈 차로만큼 옆으로 띄움(makeRoute after와 같은 식) */
function routePts(R){
  const m = R.m, segs = R.leaf.path, e1 = segs[0], off = R.tx - (m.laneX(e1.lanes[0]) + m.laneX(e1.lanes[e1.k - 1]))/2, out = [];
  segs.forEach((e, j) => {
    const last = j === segs.length - 1, c = last ? e.vis : e.curve, L = c.getLength(), len = last ? Math.min(L, ROUTE_END) : L, o = j === 0 ? off : 0;
    const n = Math.max(2, Math.ceil(len/2));
    for(let i = j ? 1 : 0; i <= n; i++){
      const u = len/L*i/n, q = c.getPointAt(u), t = c.getTangentAt(u), l = Math.hypot(t.x, t.z) || 1, tx = t.x/l, tz = t.z/l;
      out.push([q.x - tz*o, q.z + tx*o, tx, tz]);
    }
  });
  return out;
}

// 위에서 본 차 한 대(앞쪽, 원근)
function carPoly(T, c){
  const hl = c.halfL, hw = (c.w || DRV.carW)/2;
  return polyD([[c.x - hw, c.z - hl], [c.x + hw, c.z - hl], [c.x + hw, c.z + hl], [c.x - hw, c.z + hl]].map(q => T(q[0], q[1])));
}

function drawAr(p, f, C, k){
  const m = S.map, R = S.route, G = S.G, T = toEgo(p, f), now = performance.now();
  // 그릴 도로 구간: 앞 방향 띠 안 + 내 차 앞 10m 안에서는 거의 곧은(15° 안) 것만 — 가까운 곳의 휜 길은 원근에서 가로로 납작해짐
  const COS15 = Math.cos(15*Math.PI/180), dOK = (q, c) => q[2]*f.x + q[3]*f.z >= c;
  const keep = (q0, q1) => dOK(q0, CORRIDOR) && dOK(q1, CORRIDOR) && (Math.min(T(q0[0], q0[1])[0], T(q1[0], q1[1])[0]) >= AH.NEAR + 6 || (dOK(q0, COS15) && dOK(q1, COS15)));
  const onMain = C.i === 0 && (C.phase === 'approach' || C.phase === 'turning') && p.z > FORK_Z - 1;
  const straight = onMain && Math.abs(f.x) < .2;   // 본선을 곧게 달리는 중 (내 차 옆 · 뒤 띠에 그려도 되는 때)
  const zNear = Math.min(p.z, 40), state = G.gate, need = G.need;
  const wait = need && state === 'wait', clearing = need && state === 'clearing', go = need && state === 'go';
  const jam = G.jam, tx = m.laneX(G.tl), jamWait = wait && G.reason && G.reason.kind === 'queue';

  /* 갈 방향 (출구를 확정하기 전까지) — 맨 위 가운데 */
  const icon = C.phase === 'approach' || C.phase === 'turning' ? {L:'ahIcoL', S:'ahIcoS', R:'ahIcoR'}[C.node.key] : null;
  if(icon !== AHS.icon){ AHS.icon = icon; AHS.since = now; }
  ['ahIcoL','ahIcoS','ahIcoR'].forEach(id => $('#'+id).style.display = id === icon ? '' : 'none');
  const e = ease(clamp((now - AHS.since)/200)), act = $('#ahAct');
  act.style.display = icon ? '' : 'none';
  act.setAttribute('transform', `translate(${AH.HX} 30) scale(${(.88 + .12*e).toFixed(3)})`); act.setAttribute('opacity', e.toFixed(3));

  /* 언제까지: 옮겨야 하면 마감선(정체면 줄 끝)까지 남은 몫 초록 → 주황 → 빨강 · 기다리는 동안 회색 / 할 일 없으면 다음 갈림까지 옅은 흰색 */
  const gateZ = jam && need ? jam.tail + 10 : changeEndOf(m), frac = clamp((p.z - gateZ)/(0 - gateZ));
  let bar = null, bi = C.i, bd = C.d;
  if(bd <= 0 && bi < path.nodeS.length - 1){ bi++; bd = path.nodeS[bi] - S.s; }
  if(need) bar = wait || clearing ? {fr:frac, col:AHC.idle, op:.6} : {fr:frac, col:timeColor(frac), op:1};
  else if(bd > 0 && C.phase !== 'off') bar = {fr:clamp(bd/(bi === 0 ? path.nodeS[0] - path.sStart : path.nodeS[bi] - path.nodeS[bi-1])), col:AHC.ink, op:.5};
  $('#ahCd').style.display = bar ? '' : 'none';
  if(bar){ const b = $('#ahCdBar'); b.setAttribute('width', f1(120*bar.fr)); b.setAttribute('x', f1(260 - 60*bar.fr)); b.setAttribute('fill', bar.col); b.setAttribute('fill-opacity', bar.op); $('#ahCdBg').setAttribute('fill', bar.col); }

  /* 도로: 면 · 가장자리 · 점선 — 앞 방향 띠 안만 (옆으로 꺾인 길은 그리지 않음) */
  if(AHS.segMap !== m){ AHS.segMap = m; AHS.segCache = m.segs.map(sg => { const L = sg.vis.getLength(); return {sg, pts:curvePts(sg.vis, L, Math.min(L, 260))}; }); }
  let surf = bandZ(T, -m.edgeX, m.edgeX, zNear, FORK_Z - 2), edges = bandZ(T, -m.edgeX - .1, -m.edgeX + .1, zNear, FORK_Z - 2) + bandZ(T, m.edgeX - .1, m.edgeX + .1, zNear, FORK_Z - 2), dash = '';
  for(let i = 1; i < m.lanes; i++){ const x = m.laneX(i) - LANE/2; for(let z = 38; z > FORK_Z + 6; z -= 9) if(z - 3 < zNear) dash += bandZ(T, x - .075, x + .075, Math.min(z, zNear), z - 3); }
  AHS.segCache.forEach(({sg, pts}) => {
    surf += bandAlong(T, pts, -sg.half, sg.half, 0, pts.length - 1, keep);
    const n = pts.length - 1, in0 = Math.round(25/2);
    edges += bandAlong(T, pts, -sg.half - .1, -sg.half + .1, sg.outerL ? 0 : Math.min(in0, n), n, keep) + bandAlong(T, pts, sg.half - .1, sg.half + .1, sg.outerR ? 0 : Math.min(in0, n), n, keep);
    const hw = sg.k*LANE/2;
    for(let j = 1; j < sg.k; j++) for(let s = 4; s < n - 2; s += 4.5) dash += bandAlong(T, pts, -hw + j*LANE - .075, -hw + j*LANE + .075, Math.floor(s), Math.floor(s) + 1, keep);
  });
  $('#ahSurf').setAttribute('d', surf); $('#ahEdges').setAttribute('d', edges); $('#ahDash').setAttribute('d', dash);

  /* ① 들어갈 차로 · 경로 — 앞 방향 띠 안까지, 거기서 옆으로 꺾이면 회전 화살표. 정체면 줄 끝까지만 칠하고 테두리는 끝까지 */
  if(!AHS.routeCache || AHS.routeCache.R !== R) AHS.routeCache = {R, pts:routePts(R)};
  const rp = AHS.routeCache.pts, iEnd = rp.length - 1;
  const bh = R.leaf.path[0].k === 1 ? 2.3 : 1.75, off = C.phase === 'off';
  S.fill += ((C.st === 1 ? .85 : 1) - S.fill)*k;
  let fillTo = FORK_Z;
  if(jam && onMain){
    if(need) fillTo = jam.tail + 2.3 + 1;
    else { const ahead = G.cars.filter(c => c.lane === G.my && c.z < p.z - 1).map(c => c.z + c.halfL); if(ahead.length) fillTo = Math.max(...ahead) + .5; }
  }
  const [ra, cut] = off ? [0, 0] : corridorRange(T, f, rp, iEnd);
  let lane = onMain && fillTo < zNear ? bandZ(T, tx - 1.75, tx + 1.75, zNear, fillTo) : '';
  let rails = onMain ? bandZ(T, tx - 1.85, tx - 1.65, zNear, FORK_Z) + bandZ(T, tx + 1.65, tx + 1.85, zNear, FORK_Z) : '';
  if(!off){ lane += bandAlong(T, rp, -bh, bh, ra, cut, keep); rails += bandAlong(T, rp, -bh - .1, -bh + .1, ra, cut, keep) + bandAlong(T, rp, bh - .1, bh + .1, ra, cut, keep); }
  // 회전 꺾쇠: 경로가 앞 방향 띠를 벗어나는 곳(꺾이는 곳)에 회전 쪽을 가리키는 › › 두 개. 화면에 바로 선 기호, 멀수록 작게.
  // 그곳이 내 차 앞 7m 안이면 끔(위 갈 방향 화살표가 계속 알려 줌)
  let turn = '';
  if(!off && cut < iEnd && cut > ra){
    const q = rp[Math.max(ra, cut - 1)], qn = rp[Math.min(iEnd, cut + 3)], [lon, lat] = T(q[0], q[1]);
    const side = Math.sign(T(qn[0], qn[1])[1] - lat) || 1;
    if(lon >= AH.NEAR + 3){
      const c = prj(lon, lat), sc = AH.K/(lon - AH.NEAR + AH.K), w = 9 + 13*sc, h = 7 + 10*sc, t = 2.2 + 2.6*sc;
      for(let j = 0; j < 2; j++){
        const x = c[0] + side*(w*.55 + j*w*.95), y = c[1] - h*.15;
        // 두께 t인 꺾쇠(›)를 다각형으로
        turn += `M${f1(x - side*w/2)} ${f1(y - h)}L${f1(x + side*w/2)} ${f1(y)}L${f1(x - side*w/2)} ${f1(y + h)}L${f1(x - side*(w/2 - t))} ${f1(y + h)}L${f1(x + side*(w/2 - t*1.6))} ${f1(y)}L${f1(x - side*(w/2 - t))} ${f1(y - h)}Z`;
      }
    }
  }
  const done = clamp(1 - (S.cityT - (G.doneAt ?? -9))/1.4), lc = done > 0 ? mix(C_NOW, C_GO, done) : C_NOW;   // 차로 변경 완료: 1.4초 초록 → 청록
  ['#ahLg0', '#ahLg1', '#ahLg2'].forEach(s => $(s).setAttribute('stop-color', lc));
  $('#ahLane').setAttribute('d', lane); $('#ahRails').setAttribute('d', rails); $('#ahTurn').setAttribute('d', turn);
  $('#ahRails').setAttribute('fill', lc); $('#ahNearRails').setAttribute('fill', lc);
  ['#ahLane', '#ahRails', '#ahTurn'].forEach(s => $(s).setAttribute('opacity', S.fill.toFixed(3)));
  // 흐르는 빛 띠: 이미 들어갈 차로에 있을 때만 그 차로를 따라 앞으로 (옮겨야 할 땐 없음 — 이동 화살표와 겹치지 않게)
  let pul = '';
  if(onMain && !need && !jam && straight) for(let i = 0; i < 3; i++){ const z = p.z - AH.NEAR - 3 - ((now/1000*15 + i*20) % 60); if(z > FORK_Z + 2) pul += bandZ(T, tx - 1.5, tx + 1.5, z, z - 1.1); }
  $('#ahPulses').setAttribute('d', pul);
  // 내 차 옆 띠의 청록 테두리: 목표 차로가 내 차 옆까지 이어짐. 이미 목표 차로면 테두리가 내 차를 감쌈 = 차로 변경 완료
  let near = '';
  if(straight){
    const X = lat => AH.HX + lat*AH.PX, col = (x, w) => `M${f1(X(x) - w)} ${AH.YN}H${f1(X(x) + w)}V${AH.EGO_Y + 10}H${f1(X(x) - w)}Z`;
    near = col(T(tx - 1.75, p.z)[1], 1.5) + col(T(tx + 1.75, p.z)[1], 1.5);
  }
  $('#ahNearRails').setAttribute('d', near);

  /* ② 정체 줄: 들어갈 수 없는 간격은 붙여 하나의 회색 띠로 — 실제로 들어갈 수 있는 틈만 열림 (기준 = guide.js 정체 기준, 앞뒤 4m + 내 차 길이) */
  const qLane = jam ? (need ? G.next : G.my) : null, qx = qLane !== null ? m.laneX(qLane) : 0;
  let qd = '';
  if(jam && onMain){
    const iv = G.cars.filter(c => c.kind === 'queue' && c.lane === qLane).map(c => [c.z - c.halfL, c.z + c.halfL]).sort((a, b) => a[0] - b[0]);
    const need2 = DRV.carL + 2*GUIDE.queueGap, merged = [];
    iv.forEach(v => { const l = merged[merged.length - 1]; if(l && v[0] - l[1] < need2) l[1] = Math.max(l[1], v[1]); else merged.push(v.slice()); });
    merged.forEach(([z0, z1]) => { qd += bandZ(T, qx - 1.25, qx + 1.25, Math.min(z1, zNear), z0); });
    AHS.queue = merged;
  } else AHS.queue = null;
  $('#ahQueue').setAttribute('d', qd);

  /* ③ 차: 옮길 차로의 차만 — 판단에 쓴 바로 그 차(S.G.cars). 대기 이유인 차는 빨강 */
  const shown = new Set(need ? [G.next] : []);
  const blockers = new Set((wait ? G.A.blockers : []).filter(b => b.c.kind !== 'queue').map(b => b.c));
  let carsD = '', hazD = '';
  const behind = [];
  if(onMain) G.cars.forEach(c => {
    if(c.kind === 'queue' || (!shown.has(c.lane) && !blockers.has(c))) return;
    const [lon, lat] = T(c.x, c.z);
    if(lon < -40 || lon > 160) return;
    if(lon - c.halfL >= AH.NEAR - 1){ const d = carPoly(T, c); if(blockers.has(c)) hazD += d; else carsD += d; }
    else behind.push({c, lon, lat});
  });
  $('#ahCars').setAttribute('d', carsD); $('#ahHazAhead').setAttribute('d', hazD);
  behind.sort((a, b) => b.lon - a.lon);
  let edgeL = 0, edgeR = 0;
  ahRearEls.forEach((el, i) => {
    const v = behind[i]; if(!v){ el.g.setAttribute('opacity', 0); return; }
    const hot = blockers.has(v.c), col = hot ? AHC.hazard : AHC.car, cl = v.c.v - EGO.v, gap = Math.max(0, -v.lon - v.c.halfL - EGO.halfL);
    const threat = hot ? clamp(Math.max(1 - gap/20, cl > 0 ? 1 - gap/cl/4 : 0), .25, 1) : 0;   // 가깝거나 빨리 다가올수록 1
    const X = clamp(AH.HX + v.lat*AH.PX, 20, AH.W - 20), Y = Math.min(AH.H - 30, v.lon > 0 ? AH.EGO_Y - v.lon*3 : rearY(-v.lon) + 2);
    el.g.setAttribute("transform", `translate(${f1(X)} ${f1(Y)}) scale(${(1.25 + .35*threat).toFixed(2)})`); el.g.setAttribute('opacity', hot ? 1 : .6);
    el.body.setAttribute('fill', col); el.trail.setAttribute('stroke', col); el.trail.setAttribute('opacity', hot && cl > .5 ? .7 : 0);
    el.halo.setAttribute('r', f1(14 + 14*threat)); el.halo.setAttribute('opacity', hot ? (threat*(.85 + .15*Math.sin(now/170))).toFixed(2) : 0);
    if(hot){ if(v.lat < 0) edgeL = Math.max(edgeL, threat); else edgeR = Math.max(edgeR, threat); }
  });
  // 위험 차가 있는 쪽(내 차 기준 실제 방향) HUD 가장자리 빛
  $('#ahEdgeL').setAttribute('opacity', (edgeL*.85).toFixed(2)); $('#ahEdgeR').setAttribute('opacity', (edgeR*.85).toFixed(2));

  /* ④ 못 옮김: 내 차로와 옮길 차로 사이 경계에 벽 (내 차 옆 ~ 14m 앞). 뒤 · 옆 차 = 빨강, 정체 줄 = 주황. 밝은 심으로 대비 유지.
       확인 중엔 0.8초 동안 회색 토막으로 옅어짐(한 번). 대기인데 그쪽으로 넘어가기 시작하면 깜빡임(2Hz) */
  let wall = '', core = '', wallOp = 0, wcol = AHC.wall, ccol = AHC.wallCore;
  if(onMain && straight && (wait || clearing)){
    const xb = m.laneX(G.my) + G.side*LANE/2, X0 = AH.HX + T(xb, p.z)[1]*AH.PX;
    if(wait){
      if(jamWait){ wcol = AHC.jam; ccol = AHC.jamCore; }
      wall = bandZ(T, xb - .17, xb + .17, p.z - AH.NEAR, p.z - AH.NEAR - 14) + `M${f1(X0 - 3.6)} ${AH.YN}H${f1(X0 + 3.6)}V${AH.EGO_Y + 10}H${f1(X0 - 3.6)}Z`;
      core = bandZ(T, xb - .05, xb + .05, p.z - AH.NEAR, p.z - AH.NEAR - 14) + `M${f1(X0 - 1.1)} ${AH.YN}H${f1(X0 + 1.1)}V${AH.EGO_Y + 10}H${f1(X0 - 1.1)}Z`;
      wallOp = G.intent ? (Math.floor(S.cityT*4) % 2 ? .35 : 1) : 1;   // 2Hz, 시뮬레이터 시간 기준(프레임률과 무관)
    } else {
      wcol = AHC.idle;
      const fade = 1 - clamp((S.cityT - (G.since ?? S.cityT))/GUIDE.hold);
      for(let z = p.z - AH.NEAR; z > p.z - AH.NEAR - 14; z -= 4) wall += bandZ(T, xb - .13, xb + .13, z, z - 2);
      wallOp = .9*fade;
    }
  }
  $('#ahWall').setAttribute('d', wall); $('#ahWall').setAttribute('fill', wcol); $('#ahWallCore').setAttribute('d', core); $('#ahWallCore').setAttribute('fill', ccol);
  $('#ahWall').setAttribute('opacity', wallOp.toFixed(2)); $('#ahWallCore').setAttribute('opacity', wallOp.toFixed(2));

  /* ⑤ 옮겨도 됨: 초록 곡선 화살표 (꼬리 흐림 → 머리 선명) + 밝은 토막이 미끄러짐. 정체 틈이면 틈 한가운데로, 틈은 초록 테 */
  let slot = null;
  if(go && jam && jam.beside && AHS.queue){
    const gapOf = AHS.queue.map((v, i, a) => i ? [a[i-1][1], v[0]] : null).filter(Boolean).find(([z0, z1]) => z0 < p.z + 4 && z1 > p.z - 4);
    slot = gapOf ? {z0:gapOf[1], z1:gapOf[0]} : {z0:p.z + 4, z1:p.z - 10};
  }
  $('#ahSlot').setAttribute('d', slot ? polyD([[qx - 1.3, slot.z0], [qx + 1.3, slot.z0], [qx + 1.3, slot.z1], [qx - 1.3, slot.z1]].map(q => T(q[0], q[1]))) : '');
  let goD = '', goHi = '';
  if(go && onMain && straight){
    const tgt = T(m.laneX(G.next), p.z)[1], l0 = AH.NEAR + .5, l1 = slot ? clamp(T(qx, (slot.z0 + slot.z1)/2)[0], AH.NEAR + 5, 22) : 17;
    const at = u => [l0 + (l1 - l0)*u, tgt*u*u*(3 - 2*u)], dir = u => { const a = at(Math.max(0, u - .02)), b = at(Math.min(1, u + .02)), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0])/l, (b[1] - a[1])/l]; };
    const W = .34, N = 16, shaft = (u0, u1) => { const L = [], Rr = []; for(let i = 0; i <= N; i++){ const u = u0 + (u1 - u0)*i/N, q = at(u), d = dir(u); L.push([q[0] + d[1]*W, q[1] - d[0]*W]); Rr.push([q[0] - d[1]*W, q[1] + d[0]*W]); }
      let o = ''; for(let i = 0; i < N; i++) o += polyD([L[i], L[i+1], Rr[i+1], Rr[i]]); return o; };
    goD = shaft(0, .8);
    const q = at(.8), d = dir(.8), H = 1.7, Wh = 1, tip = [q[0] + d[0]*H, q[1] + d[1]*H];
    goD += polyD([[q[0] + d[1]*Wh, q[1] - d[0]*Wh], tip, [q[0] - d[1]*Wh, q[1] + d[0]*Wh]]);
    const ph = (now/1100) % 1; goHi = shaft(Math.max(0, ph*.8 - .12), ph*.8);
    const a0 = prj(...at(0)), a1 = prj(...tip), gg = $('#ahGoGrad');   // 꼬리 → 머리 그라데이션 방향
    gg.setAttribute('x1', f1(a0[0])); gg.setAttribute('y1', f1(a0[1])); gg.setAttribute('x2', f1(a1[0])); gg.setAttribute('y2', f1(a1[1]));
  }
  $('#ahGo').setAttribute('d', goD); $('#ahGoHi').setAttribute('d', goHi);

  /* ⑥ 멈춤 (일반도로): 지금 차로를 가로지르는 빨간 막대 — 빨간불 정지선 / 보행자 앞 횡단보도. 보행자: 기다림 = 고리 · 건너는 중 = 점 */
  let cs = '', pw = '', pc = '';
  if(m.city){
    const e1 = R.leaf.path[0];
    if(G.stop && G.stop.kind === 'signal' && onMain) cs += polyD([[m.laneX(e1.lanes[0]) - 1.75, FORK_Z + .5], [m.laneX(e1.lanes[e1.k-1]) + 1.75, FORK_Z + .5], [m.laneX(e1.lanes[e1.k-1]) + 1.75, FORK_Z - .5], [m.laneX(e1.lanes[0]) - 1.75, FORK_Z - .5]].map(q => T(q[0], q[1])));
    if(m.cw){
      if(G.stop && G.stop.kind === 'ped') cs += polyD([[m.cw.x0 - 1.4, CZ.near], [m.cw.x0 - .5, CZ.near], [m.cw.x0 - .5, CZ.mid], [m.cw.x0 - 1.4, CZ.mid]].map(q => T(q[0], q[1])));
      pedsAt(S.cityT).forEach(q => {
        if(q.phase === 'done') return;
        const [lon, lat] = T(q.x, q.z); if(lon < AH.NEAR || Math.abs(lat) > AH.LAT) return;
        const c = prj(lon, lat), s = AH.K/(lon - AH.NEAR + AH.K), r = Math.max(2.2, 5*s);
        const d = `M${f1(c[0] - r)} ${f1(c[1])}a${f1(r)} ${f1(r)} 0 1 0 ${f1(2*r)} 0a${f1(r)} ${f1(r)} 0 1 0 ${f1(-2*r)} 0Z`;
        if(q.phase === 'wait') pw += d; else pc += d;
      });
    }
  }
  $('#ahStop').setAttribute('d', cs); $('#ahPedW').setAttribute('d', pw); $('#ahPedC').setAttribute('d', pc);
}
