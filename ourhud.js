/* ============================================================
   ourhud.js — 우리 HUD (그래픽만, 글자 없음). 판단은 guide.js → main.js guideStep → S.G, 여기는 그리기만.
   설계 근거 · 리서치: 01_프로젝트/10_HUD_GUI_설계.md 0-7절 (2026-10-29)

   표시 영역: HUD 상자(#hudWrap, viewBox 520 × 270) 하나. 모든 층은 #hudClip 안에서만 그린다(index.html).
   좌표 변환 · 자르기는 hudgeom.js — 내 차 아이콘은 가까운 면(내 차 앞 4m) 아래에 그려 경로가 내 차 밑으로 지나가지 않음

   그래픽 어휘 (색 하나에 뜻을 몰지 않음 — 형태 · 자리 · 움직임을 함께):
     들어갈 차로 = 청록 면 + 청록 테두리 (늘 같은 진하기, 움직이지 않음)
     지금 옮겨도 됨 = 초록 꺾쇠가 내 차로에서 목표 차로로 흐름 (움직이는 건 이것뿐)
     지금 못 옮김 = 차로 경계에 선 주황 벽 (가로 막대 아님 — 내 차로에서 서라는 뜻이 아님). 화살표 없음
       └ 그래도 그쪽으로 넘어가기 시작하면 벽이 깜빡임 (양산차 후측방 경고: 감지 = 켜짐, 그쪽 깜빡이를 켜면 = 깜빡임)
     위험 차 = 빨강 차 모양, 실제 상대 위치(뒤는 내 차 아래 뒤 띠), 다가오면 꼬리
     위험 해소 = 벽이 0.8초 동안 끊긴 토막으로 옅어짐(한 번) → 초록 꺾쇠
     정체 줄 = 들어갈 수 없는 줄은 하나의 회색 띠로 붙여 그림 — 실제로 들어갈 수 있는 틈만 열려 보임, 판단이 '이동'일 때만 초록 테
     차로 변경 완료 = 청록 차로 테두리가 내 차 양옆까지 내려와 내 차를 감쌈 (화살표 · 벽 없음)
     멈춤(빨간불 · 보행자) = 지금 차로를 가로지르는 빨간 막대
   ============================================================ */

const AHC = {lane:C_NOW, go:C_GO, wall:C_WARN, hazard:C_DANGER, car:'#9aa6b2', queue:'#8f9aa6', ink:'#eef3f7', stop:C_DANGER};

/* ---------- 요소 ---------- */
function ahMarkup(){
  const egoCar = `<rect x="-12" y="-18" width="24" height="36" rx="7" fill="${AHC.ink}" fill-opacity=".95"/><path d="M-8.5 -9 H8.5 L7 -3 H-7 Z" fill="#0b0d10" fill-opacity=".6"/>`;
  return `<defs>
      <linearGradient id="ahFade" gradientUnits="userSpaceOnUse" x1="0" y1="${AH.YF}" x2="0" y2="${AH.YF + 22}"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient>
      <mask id="ahHorizon" maskUnits="userSpaceOnUse" x="0" y="0" width="${AH.W}" height="${AH.H}"><rect x="0" y="${AH.YF}" width="${AH.W}" height="${AH.H - AH.YF}" fill="url(#ahFade)"/></mask>
      <linearGradient id="ahDown" gradientUnits="userSpaceOnUse" x1="0" y1="${AH.YN}" x2="0" y2="${AH.EGO_Y + 14}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity=".15"/></linearGradient>
      <mask id="ahNearFade" maskUnits="userSpaceOnUse" x="0" y="${AH.YN}" width="${AH.W}" height="${AH.H - AH.YN}"><rect x="0" y="${AH.YN}" width="${AH.W}" height="${AH.H - AH.YN}" fill="url(#ahDown)"/></mask>
    </defs>
    <g mask="url(#ahHorizon)">
      <path id="ahSurf" fill="#ffffff" fill-opacity=".04"/>
      <path id="ahEdges" fill="${AHC.ink}" fill-opacity=".42"/>
      <path id="ahDash" fill="${AHC.ink}" fill-opacity=".26"/>
      <path id="ahLane" fill="${AHC.lane}" fill-opacity=".3"/>
      <path id="ahRails" fill="${AHC.lane}" fill-opacity=".95"/>
      <path id="ahQueue" fill="${AHC.queue}" fill-opacity=".55"/>
      <path id="ahCars" fill="${AHC.car}" fill-opacity=".55"/>
      <path id="ahHazAhead" fill="${AHC.hazard}" fill-opacity=".9"/>
      <path id="ahSlot" fill="none" stroke="${AHC.go}" stroke-width="2.4" stroke-linejoin="round"/>
      <path id="ahStop" fill="${AHC.stop}" fill-opacity=".95"/>
      <path id="ahPedW" fill="none" stroke="${AHC.ink}" stroke-width="1.8"/>
      <path id="ahPedC" fill="${AHC.ink}"/>
    </g>
    <g mask="url(#ahNearFade)"><path id="ahNearRails" fill="${AHC.lane}" fill-opacity=".85"/></g>
    <g id="ahRear"></g>
    <path id="ahWall" fill="${AHC.wall}"/>
    <path id="ahGo" fill="${AHC.go}" fill-opacity=".85"/><path id="ahGoHi" fill="#d9ffe9" fill-opacity=".8"/>
    <g id="ahEgo" transform="translate(${AH.HX} ${AH.EGO_Y})">${egoCar}</g>
    <g id="ahAct"><g transform="scale(1.55)" fill="none" stroke="${AHC.lane}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round">
      <path id="ahIcoR" d="M-6 13 V4 Q-6 -4 5 -9 M-1 -13 L8 -9 L4 -1"/><path id="ahIcoL" d="M6 13 V4 Q6 -4 -5 -9 M1 -13 L-8 -9 L-4 -1"/><path id="ahIcoS" d="M0 13 V-12 M-8 -4 L0 -13 L8 -4"/></g></g>
    <g id="ahCd"><rect x="210" y="58" width="100" height="4" rx="2" fill="${AHC.ink}" fill-opacity=".16"/><rect id="ahCdBar" x="210" y="58" width="100" height="4" rx="2"/></g>
    <g id="ahInfo" transform="translate(70 32)">
      <circle r="20" fill="#fff" fill-opacity=".92" stroke="#e5262b" stroke-width="5"/>
      <text id="ahLim" class="hud-t tnum" y="6.6" text-anchor="middle" font-size="18" font-weight="700" fill="#111">80</text>
    </g>`;
}
$('#arHud').innerHTML = ahMarkup();

// 뒤 띠의 차(내 차 옆 · 뒤): 위에서 본 차 + 다가오면 꼬리 두 줄
const ahRearEls = Array.from({length:5}, () => {
  const g = document.createElementNS(SVGNS, 'g'), trail = document.createElementNS(SVGNS, 'path'), body = document.createElementNS(SVGNS, 'rect'), glass = document.createElementNS(SVGNS, 'path');
  body.setAttribute('x', -11); body.setAttribute('y', -16); body.setAttribute('width', 22); body.setAttribute('height', 32); body.setAttribute('rx', 6.5);
  glass.setAttribute('d', 'M-8 -9 H8 L6.5 -4 H-6.5 Z'); glass.setAttribute('fill', '#0b0d10'); glass.setAttribute('fill-opacity', .55);
  trail.setAttribute('d', 'M-6 19 L-6.5 30 M6 19 L6.5 30'); trail.setAttribute('stroke-width', 3); trail.setAttribute('stroke-linecap', 'round'); trail.setAttribute('fill', 'none');
  g.append(trail, body, glass); $('#ahRear').appendChild(g); return {g, body, trail};
});
const rearY = dz => AH.REAR_TOP + AH.REAR_H*(1 - Math.exp(-Math.max(0, dz)/AH.REAR_K));
const AHS = {icon:null, since:0, segCache:null, segMap:null, routeCache:null};
function resetHud(){ AHS.icon = null; AHS.routeCache = null; }

// 위에서 본 차 한 대(앞쪽, 원근): 차 방향(tx, tz)으로 네 꼭짓점
function carPoly(T, c, shrink = 0){
  const hl = c.halfL - shrink, hw = (c.w || DRV.carW)/2 - shrink*.4, tx = c.tx ?? 0, tz = c.tz ?? -1, nx = -tz, nz = tx;
  return polyD([[c.x + tx*hl - nx*hw, c.z + tz*hl - nz*hw], [c.x + tx*hl + nx*hw, c.z + tz*hl + nz*hw], [c.x - tx*hl + nx*hw, c.z - tz*hl + nz*hw], [c.x - tx*hl - nx*hw, c.z - tz*hl - nz*hw]].map(q => T(q[0], q[1])));
}

function drawAr(p, f, C, k){
  const m = S.map, R = S.route, G = S.G, T = toEgo(p, f), now = performance.now();
  const onMain = C.i === 0 && (C.phase === 'approach' || C.phase === 'turning') && p.z > FORK_Z - 1;
  const straight = onMain && Math.abs(f.x) < .2;   // 본선을 곧게 달리는 중 (내 차 아래 띠에 차로를 이어 그려도 되는 때)
  const zNear = Math.min(p.z, 40), state = G.gate, need = G.need;
  const wait = need && state === 'wait', clearing = need && state === 'clearing', go = need && state === 'go';
  const jam = G.jam, tx = m.laneX(G.tl);

  /* 갈 방향 (출구를 확정하기 전까지) — 맨 위 가운데 */
  const icon = C.phase === 'approach' || C.phase === 'turning' ? {L:'ahIcoL', S:'ahIcoS', R:'ahIcoR'}[C.node.key] : null;
  if(icon !== AHS.icon){ AHS.icon = icon; AHS.since = now; }
  ['ahIcoL','ahIcoS','ahIcoR'].forEach(id => $('#'+id).style.display = id === icon ? '' : 'none');
  const e = ease(clamp((now - AHS.since)/200)), act = $('#ahAct');
  act.style.display = icon ? '' : 'none';
  act.setAttribute('transform', `translate(${AH.HX} 30) scale(${(.9 + .1*e).toFixed(3)})`); act.setAttribute('opacity', e.toFixed(3));

  /* 언제까지 (무채색, 마감 직전만 주황) */
  const gateZ = jam && need ? jam.tail + 10 : changeEndOf(m), frac = clamp((p.z - gateZ)/(0 - gateZ));
  let bar = null, bi = C.i, bd = C.d;
  if(bd <= 0 && bi < path.nodeS.length - 1){ bi++; bd = path.nodeS[bi] - S.s; }
  if(need) bar = {fr:frac, col:frac < .25 ? C_WARN : AHC.ink, op:.8};
  else if(bd > 0 && C.phase !== 'off') bar = {fr:clamp(bd/(bi === 0 ? path.nodeS[0] - path.sStart : path.nodeS[bi] - path.nodeS[bi-1])), col:AHC.ink, op:.4};
  $('#ahCd').style.display = bar ? '' : 'none';
  if(bar){ const b = $('#ahCdBar'); b.setAttribute('width', f1(100*bar.fr)); b.setAttribute('x', f1(260 - 50*bar.fr)); b.setAttribute('fill', bar.col); b.setAttribute('fill-opacity', bar.op); }

  /* 도로: 면 · 가장자리 · 점선 (맵마다 곡선 점을 한 번만 만들어 둠) */
  if(AHS.segMap !== m){ AHS.segMap = m; AHS.segCache = m.segs.map(sg => { const L = sg.vis.getLength(); return {sg, pts:curvePts(sg.vis, L, Math.min(L, 260))}; }); }
  let surf = bandZ(T, -m.edgeX, m.edgeX, zNear, FORK_Z - 2), edges = bandZ(T, -m.edgeX - .1, -m.edgeX + .1, zNear, FORK_Z - 2) + bandZ(T, m.edgeX - .1, m.edgeX + .1, zNear, FORK_Z - 2), dash = '';
  for(let i = 1; i < m.lanes; i++){ const x = m.laneX(i) - LANE/2; for(let z = 38; z > FORK_Z + 6; z -= 9) if(z - 3 < zNear) dash += bandZ(T, x - .075, x + .075, Math.min(z, zNear), z - 3); }
  AHS.segCache.forEach(({sg, pts}) => {
    surf += bandAlong(T, pts, -sg.half, sg.half);
    const n = pts.length - 1, in0 = Math.round(25/2);
    edges += bandAlong(T, pts, -sg.half - .1, -sg.half + .1, sg.outerL ? 0 : Math.min(in0, n)) + bandAlong(T, pts, sg.half - .1, sg.half + .1, sg.outerR ? 0 : Math.min(in0, n));
    const hw = sg.k*LANE/2;
    for(let j = 1; j < sg.k; j++) for(let s = 4; s < n - 2; s += 4.5) dash += bandAlong(T, pts, -hw + j*LANE - .075, -hw + j*LANE + .075, Math.floor(s), Math.floor(s) + 1);
  });
  $('#ahSurf').setAttribute('d', surf); $('#ahEdges').setAttribute('d', edges); $('#ahDash').setAttribute('d', dash);

  /* ① 들어갈 차로 — 청록, 상태와 상관없이 같은 진하기. 정체면 줄 끝까지만 칠하고 테두리는 끝까지 */
  if(!AHS.routeCache || AHS.routeCache.R !== R){ AHS.routeCache = {R, pts:curvePts(R.afterCurve, R.afterL)}; }
  const lastS = path.nodeS[path.nodeS.length - 1], uEnd = clamp((lastS + ROUTE_END - path.nodeS[0])/R.afterL), rp = AHS.routeCache.pts, iEnd = Math.max(1, Math.round(uEnd*(rp.length - 1)));
  const bh = R.leaf.path[0].k === 1 ? 2.3 : 1.75;
  S.fill += ((C.st === 1 ? .85 : 1) - S.fill)*k;
  let fillTo = FORK_Z;
  if(jam && onMain){
    if(need) fillTo = jam.tail + 2.3 + 1;
    else { const ahead = G.cars.filter(c => c.lane === G.my && c.z < p.z - 1).map(c => c.z + c.halfL); if(ahead.length) fillTo = Math.max(...ahead) + .5; }
  }
  const off = C.phase === 'off';
  let lane = onMain && fillTo < zNear ? bandZ(T, tx - 1.75, tx + 1.75, zNear, fillTo) : '';
  let rails = onMain ? bandZ(T, tx - 1.85, tx - 1.65, zNear, FORK_Z) + bandZ(T, tx + 1.65, tx + 1.85, zNear, FORK_Z) : '';
  if(!off){ lane += bandAlong(T, rp, -bh, bh, 0, iEnd); rails += bandAlong(T, rp, -bh - .1, -bh + .1, 0, iEnd) + bandAlong(T, rp, bh - .1, bh + .1, 0, iEnd); }
  $('#ahLane').setAttribute('d', lane); $('#ahRails').setAttribute('d', rails);
  $('#ahLane').setAttribute('opacity', S.fill.toFixed(3)); $('#ahRails').setAttribute('opacity', S.fill.toFixed(3));
  // 내 차 옆 띠의 청록 테두리: 목표 차로가 내 차 옆까지 이어짐. 이미 목표 차로면 테두리가 내 차를 감쌈 = 차로 변경 완료
  let near = '';
  if(straight){
    const X = lat => AH.HX + lat*AH.PX, col = (x, w) => `M${f1(X(x) - w)} ${AH.YN}H${f1(X(x) + w)}V${AH.EGO_Y + 14}H${f1(X(x) - w)}Z`;   // 내 차 옆까지만 (아래로 길게 내리지 않음)
    const latL = T(tx - 1.75, p.z)[1], latR = T(tx + 1.75, p.z)[1];
    near = col(latL, 1.6) + col(latR, 1.6);
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

  /* ③ 차: 옮길(또는 이미 들어간) 차로의 차만 — 판단에 쓴 바로 그 차(S.G.cars). 대기 이유인 차는 빨강, 정체 줄은 위에서 띠로 */
  const shown = new Set(need ? [G.next] : jam ? [] : []);
  const blockers = new Set((wait ? G.A.blockers : []).filter(b => b.c.kind !== 'queue').map(b => b.c));
  let carsD = '', hazD = '';
  const behind = [];
  if(onMain) G.cars.forEach(c => {
    if(c.kind === 'queue' || (!shown.has(c.lane) && !blockers.has(c))) return;
    const [lon, lat] = T(c.x, c.z);
    if(lon < -40 || lon > 160) return;
    if(lon - c.halfL >= AH.NEAR - 1){ const d = carPoly(T, {...c, tx:0, tz:-1}); if(blockers.has(c)) hazD += d; else carsD += d; }
    else behind.push({c, lon, lat});
  });
  $('#ahCars').setAttribute('d', carsD); $('#ahHazAhead').setAttribute('d', hazD);
  behind.sort((a, b) => b.lon - a.lon);
  ahRearEls.forEach((el, i) => {
    const v = behind[i]; if(!v){ el.g.setAttribute('opacity', 0); return; }
    const hot = blockers.has(v.c), col = hot ? AHC.hazard : AHC.car, closing = v.c.v - EGO.v > 1;
    const X = clamp(AH.HX + v.lat*AH.PX, 16, AH.W - 16), Y = Math.min(AH.H - 31, v.lon > 0 ? AH.EGO_Y - v.lon*3 : rearY(-v.lon));
    el.g.setAttribute('transform', `translate(${f1(X)} ${f1(Y)})`); el.g.setAttribute('opacity', hot ? 1 : .6);
    el.body.setAttribute('fill', col); el.trail.setAttribute('stroke', col); el.trail.setAttribute('opacity', hot && closing ? .7 : 0);
  });

  /* ④ 못 옮김: 내 차로와 옮길 차로 사이 경계에 주황 벽 (내 차 옆 ~ 14m 앞). 확인 중엔 0.8초 동안 토막으로 옅어짐(한 번).
       대기인데 그쪽으로 넘어가기 시작하면 깜빡임(2Hz) */
  let wall = '', wallOp = 0;
  if(onMain && straight && (wait || clearing)){
    const xb = m.laneX(G.my) + G.side*LANE/2, latB = T(xb, p.z)[1], X0 = AH.HX + latB*AH.PX;
    if(wait){
      wall = bandZ(T, xb - .16, xb + .16, p.z - AH.NEAR, p.z - AH.NEAR - 14) + `M${f1(X0 - 3.4)} ${AH.YN}H${f1(X0 + 3.4)}V${AH.EGO_Y + 14}H${f1(X0 - 3.4)}Z`;
      wallOp = G.intent ? (Math.floor(S.cityT*4) % 2 ? .35 : 1) : 1;   // 2Hz, 시뮬레이터 시간 기준(프레임률과 무관)
    } else {
      const fade = 1 - clamp((S.cityT - (G.since ?? S.cityT))/GUIDE.hold);
      for(let z = p.z - AH.NEAR; z > p.z - AH.NEAR - 14; z -= 4) wall += bandZ(T, xb - .13, xb + .13, z, z - 2);
      wallOp = .85*fade;
    }
  }
  $('#ahWall').setAttribute('d', wall); $('#ahWall').setAttribute('opacity', wallOp.toFixed(2));

  /* ⑤ 옮겨도 됨: 초록 꺾쇠 3개가 내 차로 → 목표 차로로 흐름 (정체 틈이면 틈 한가운데로, 틈은 초록 테) */
  let slot = null;
  if(go && jam && jam.beside && AHS.queue){
    const gapOf = AHS.queue.map((v, i, a) => i ? [a[i-1][1], v[0]] : null).filter(Boolean).find(([z0, z1]) => z0 < p.z + 4 && z1 > p.z - 4);
    slot = gapOf ? {z0:gapOf[1], z1:gapOf[0]} : {z0:p.z + 4, z1:p.z - 10};
  }
  $('#ahSlot').setAttribute('d', slot ? (() => { const a = [[qx - 1.3, slot.z0], [qx + 1.3, slot.z0], [qx + 1.3, slot.z1], [qx - 1.3, slot.z1]].map(q => T(q[0], q[1])); const c = clipPoly(a); return c.length > 2 ? 'M' + c.map(q => prj(q[0], q[1]).map(f1).join(' ')).join('L') + 'Z' : ''; })() : '');
  let goD = '', goHi = '';
  if(go && onMain && straight){
    // 내 차(lon NEAR+0.5, lat 0) → 목표 차로 가운데로 부드럽게 휘는 굵은 화살표 하나(머리 포함). 몸통 위로 밝은 토막 하나가 1.1초 주기로 미끄러짐 — 움직이는 건 이것뿐
    const tgt = T(m.laneX(G.next), p.z)[1], l0 = AH.NEAR + .5, l1 = slot ? clamp(T(qx, (slot.z0 + slot.z1)/2)[0], AH.NEAR + 5, 22) : 17;
    const at = u => [l0 + (l1 - l0)*u, tgt*u*u*(3 - 2*u)], dir = u => { const a = at(Math.max(0, u - .02)), b = at(Math.min(1, u + .02)), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0])/l, (b[1] - a[1])/l]; };
    const W = .32, N = 16, shaft = (u0, u1) => { const L = [], R = []; for(let i = 0; i <= N; i++){ const u = u0 + (u1 - u0)*i/N, q = at(u), d = dir(u); L.push([q[0] - d[1]*W*-1, q[1] + d[0]*W*-1]); R.push([q[0] - d[1]*W, q[1] + d[0]*W]); }
      let o = ''; for(let i = 0; i < N; i++) o += polyD([L[i], L[i+1], R[i+1], R[i]]); return o; };
    goD = shaft(0, .8);
    const q = at(.8), d = dir(.8), H = 1.6, Wh = .95, tip = [q[0] + d[0]*H, q[1] + d[1]*H], l = [q[0] + d[1]*Wh, q[1] - d[0]*Wh], r = [q[0] - d[1]*Wh, q[1] + d[0]*Wh];
    goD += polyD([l, tip, r]);
    const ph = (now/1100) % 1; goHi = shaft(Math.max(0, ph*.8 - .12), ph*.8);
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
