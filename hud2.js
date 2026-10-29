/* ============================================================
   hud2.js — 우리 HUD v2 (개선 후, 2026-10-29). v1(hud.js drawAr)은 1차 실험 그대로 보존 → 개선 전 · 후를 같은 환경에서 비교
   v1과 같은 자리 · 같은 크기 · 같은 미니 도로 투영(makeProj). 판단은 guide.js(main.js guideStep → S.G), 여기는 그리기만.
   바뀐 것 (설계 01_프로젝트/10_HUD_GUI_설계.md 'v2' 절):
   ① 들어갈 차로(청록)는 상태와 상관없이 같은 색 · 같은 진하기 — '어디로'는 흔들리지 않는다
   ② 이동 화살표(초록)는 판단이 '이동'일 때만. 대기에는 화살표 없이 차로 경계에 막힌 벽 — '그쪽으로 가라'로 읽히지 않게
   ③ 위험 차는 실제 상대 위치에 — 내 차 아래 '뒤 구역'에 뒤차, 왼쪽/오른쪽은 내 차 자세 기준
   ④ 대기(빨강) → 확인(회색, 벽이 끊김) → 이동(초록) — 위험이 풀리는 순간이 보이고, 안정된 뒤에만 이동
   ⑤ 짧은 문구 한 줄: 대기 이유 · 확인 후 이동 · 이동 · 정지 · 차로 유지. 자리는 HUD 맨 아래 내 차 옆(늘 노면 위) — 위쪽은 앞차와 겹쳐 안 읽혔음
   ⑥ 정체: 빗금 · 깜빡이는 칸 · 주황 테 없음. 줄 차는 회색 블록, 들어갈 차로는 줄 끝까지만 칠하고(테두리는 유지)
      틈은 판단이 '이동'일 때만 초록 테. 합류를 마치면 이동 안내를 끄고 '차로 유지'
   ⑦ '언제까지' 막대는 무채색(마감 직전만 주황) — 허용(초록)과 섞이지 않게
   ⑧ 멈춤(신호 · 보행자)은 지금 차로를 가로지르는 빨간 막대 — 차로 변경 대기(경계의 벽)와 모양이 다르다
   ============================================================ */

const H2 = {rearK:14, rearH:38, rearTop:228};   // 뒤 구역: 내 차 뒤 거리 dz(m) → y = 228 + 38·(1 − e^(−dz/14)) (가까울수록 미니 도로와 같은 기울기)
const rearY = dz => H2.rearTop + H2.rearH*(1 - Math.exp(-Math.max(0, dz)/H2.rearK));
const H2COL = {wait:'#ff5a52', waitText:'#ff8a80', jam:C_WARN, jamText:'#ffc35a', clear:'#dfe6ee', go:C_GO, car:'#a9b4c0', ink:'#eaf6ff'};

function hud2Markup(){
  const ego = `<path d="M-15 4 Q-15 -3 -11 -4 L-7 -10 Q-6 -12 -3 -12 H3 Q6 -12 7 -10 L11 -4 Q15 -3 15 4 V7 Q15 9 13 9 H-13 Q-15 9 -15 7 Z" fill-opacity=".92"/>
    <rect x="-12" y="0" width="5" height="2.6" rx="1.3" fill="#ff6a6a"/><rect x="7" y="0" width="5" height="2.6" rx="1.3" fill="#ff6a6a"/>
    <path d="M-5 -9 H5 L8 -4 H-8 Z" fill="#0b0d10" fill-opacity=".55"/>`;
  return `<defs>
      <linearGradient id="h2LaneGrad" gradientUnits="userSpaceOnUse" x1="0" y1="228" x2="0" y2="88">
        <stop id="h2gA" offset="0" stop-color="${C_NOW}" stop-opacity=".58"/><stop id="h2gB" offset=".55" stop-color="${C_NOW}" stop-opacity=".28"/><stop id="h2gC" offset="1" stop-color="${C_NOW}" stop-opacity=".09"/>
      </linearGradient>
      <linearGradient id="h2RearFade" gradientUnits="userSpaceOnUse" x1="0" y1="226" x2="0" y2="268"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <mask id="h2RearMask" maskUnits="userSpaceOnUse" x="0" y="226" width="520" height="44"><rect x="0" y="226" width="520" height="44" fill="url(#h2RearFade)"/></mask>
    </defs>
    <g mask="url(#roadMask)">
      <path id="h2Surf" fill="#ffffff" fill-opacity=".045"/>
      <path id="h2Fill" fill="url(#h2LaneGrad)"/>
      <path id="h2Edges" fill="${H2COL.ink}" fill-opacity=".5"/>
      <path id="h2Dash" fill="${H2COL.ink}" fill-opacity=".3"/>
      <path id="h2Rails" fill="${C_NOW}" filter="url(#glow)"/>
      <path id="h2Gate" fill="${H2COL.ink}" fill-opacity=".75"/>
      <path id="h2Tail" fill="${C_NOW}" filter="url(#glow)"/>
      <g id="h2Cars"></g>
      <path id="h2Slot" fill="none" stroke="${C_GO}" stroke-width="2.6" stroke-linejoin="round" filter="url(#glow)"/>
      <path id="h2Stop" fill="${C_DANGER}" filter="url(#glow)"/>
      <path id="h2PedW" fill="none" stroke="#ffffff" stroke-width="1.8"/>
      <path id="h2PedC" fill="#ffffff" fill-opacity=".95"/>
    </g>
    <g mask="url(#h2RearMask)">
      <path id="h2RearLines" fill="${H2COL.ink}" fill-opacity=".3"/>
      <path id="h2RearRails" fill="${C_NOW}" fill-opacity=".6"/>
    </g>
    <g id="h2Wall" filter="url(#glow)"><path id="h2WallA"/><path id="h2WallB" fill="#ffe1dc"/></g>
    <g id="h2RearCars"></g>
    <g id="h2Move" filter="url(#glow)"><path id="h2Arrow" fill="none" stroke="${C_GO}" stroke-width="8" stroke-linecap="round" stroke-dasharray="12 14"/><path id="h2Head" fill="${C_GO}"/></g>
    <g id="h2Ego" transform="translate(260 221)" fill="${H2COL.ink}">${ego}</g>
    <g id="h2Act" filter="url(#glow)"><g transform="scale(1.55)" fill="none" stroke="${C_NOW}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round">
      <path id="h2IcoR" d="M-6 13 V4 Q-6 -4 5 -9 M-1 -13 L8 -9 L4 -1"/><path id="h2IcoL" d="M6 13 V4 Q6 -4 -5 -9 M1 -13 L-8 -9 L-4 -1"/><path id="h2IcoS" d="M0 13 V-12 M-8 -4 L0 -13 L8 -4"/></g></g>
    <g id="h2Cd"><rect id="h2CdBg" x="200" y="60" width="120" height="5" rx="2.5" fill="${H2COL.ink}" fill-opacity=".16"/><rect id="h2CdBar" x="200" y="60" width="120" height="5" rx="2.5"/></g>
    <text id="h2Msg" class="hud-t" x="260" y="263" text-anchor="middle" font-size="19" font-weight="700" letter-spacing="-.2" filter="url(#glow)"></text>
    <g id="h2Info" transform="translate(112 34)">
      <circle r="21" fill="#fff" fill-opacity=".92" stroke="#e5262b" stroke-width="5"/>
      <text id="h2Lim" class="hud-t tnum" y="6.8" text-anchor="middle" font-size="19" font-weight="700" fill="#111">80</text>
    </g>`;
}
$('#arHud2').innerHTML = hud2Markup();

const mkS = (n, parent) => { const e = document.createElementNS(SVGNS, n); parent.appendChild(e); return e; };
// 미니 도로 위 차(내 차보다 앞): 원근 사각형
const h2CarEls = Array.from({length:18}, () => { const r = mkS('rect', $('#h2Cars')); r.setAttribute('rx', 2.5); return r; });
// 뒤 구역의 차(내 차보다 뒤 · 옆): 앞모습 + 다가오면 위쪽 꺾쇠와 꼬리
const h2RearEls = Array.from({length:5}, () => {
  const g = mkS('g', $('#h2RearCars')), trail = mkS('path', g), body = mkS('rect', g), glass = mkS('path', g), lamps = mkS('path', g), chev = mkS('path', g);
  body.setAttribute('x', -11); body.setAttribute('y', -7); body.setAttribute('width', 22); body.setAttribute('height', 14); body.setAttribute('rx', 4);
  glass.setAttribute('d', 'M-7 -5 H7 L8.5 -1 H-8.5 Z'); glass.setAttribute('fill', '#0b0d10'); glass.setAttribute('fill-opacity', .55);
  lamps.setAttribute('d', 'M-9 2.2 h4.5 v2.2 h-4.5Z M4.5 2.2 h4.5 v2.2 h-4.5Z'); lamps.setAttribute('fill', '#fff7d6');
  chev.setAttribute('d', 'M-7 -11 L0 -16 L7 -11'); chev.setAttribute('fill', 'none'); chev.setAttribute('stroke-width', 2.6); chev.setAttribute('stroke-linecap', 'round'); chev.setAttribute('stroke-linejoin', 'round');
  trail.setAttribute('d', 'M-6 9 V15 M6 9 V15'); trail.setAttribute('stroke-width', 2.2); trail.setAttribute('stroke-linecap', 'round');
  return {g, body, chev, trail};
});
const H2S = {icon:null, since:0};
function drawAr2(p, f, C, k){
  const m = S.map, R = S.route, G = S.G, proj = makeProj(p, f), now = performance.now();
  const onMain = C.i === 0 && (C.phase === 'approach' || C.phase === 'turning') && p.z > FORK_Z - 1;
  const rx = -f.z, rz = f.x, zNear = Math.min(p.z - 2, 40);
  const tx = m.laneX(G.tl), state = G.gate, wait = G.need && state === 'wait', clearing = G.need && state === 'clearing', go = G.need && state === 'go';
  const jam = G.jam, tailEnd = jam ? jam.tail + 2.3 + 1 : null;

  /* 갈 방향 (v1과 같음): 출구를 확정하기 전까지 */
  const icon = C.phase === 'approach' || C.phase === 'turning' ? {L:'h2IcoL', S:'h2IcoS', R:'h2IcoR'}[C.node.key] : null;
  if(icon !== H2S.icon){ H2S.icon = icon; H2S.since = now; }
  ['h2IcoL','h2IcoS','h2IcoR'].forEach(id => $('#'+id).style.display = id === icon ? '' : 'none');
  const e = ease(clamp((now - H2S.since)/200)), act = $('#h2Act');
  act.style.display = icon ? '' : 'none';
  act.setAttribute('transform', `translate(${HX} 32) scale(${(.88 + .12*e).toFixed(3)})`); act.setAttribute('opacity', e.toFixed(3));

  /* 언제까지: 무채색 막대 (마감 직전만 주황). 옮겨야 하면 마감선(정체면 줄 끝)까지, 아니면 다음 갈림까지 */
  const gateZ = jam && G.need ? jam.tail + 10 : changeEndOf(m), frac = clamp((p.z - gateZ)/(0 - gateZ));
  let bar = null, bi = C.i, bd = C.d;
  if(bd <= 0 && bi < path.nodeS.length - 1){ bi++; bd = path.nodeS[bi] - S.s; }
  if(G.need) bar = {fr:frac, col:frac < .25 ? C_WARN : H2COL.ink, op:.85};
  else if(bd > 0 && C.phase !== 'off') bar = {fr:clamp(bd/(bi === 0 ? path.nodeS[0] - path.sStart : path.nodeS[bi] - path.nodeS[bi-1])), col:H2COL.ink, op:.45};
  $('#h2Cd').style.display = bar ? '' : 'none';
  if(bar){ const b = $('#h2CdBar'); b.setAttribute('width', (120*bar.fr).toFixed(1)); b.setAttribute('x', (260 - 60*bar.fr).toFixed(1)); b.setAttribute('fill', bar.col); b.setAttribute('fill-opacity', bar.op); }
  $('#h2Gate').setAttribute('d', G.need ? quadZ(tx-1.75, tx+1.75, gateZ+.3, gateZ-.3, proj) : '');

  /* 도로: 면 · 가장자리 · 점선 (v1과 같은 그림) */
  let surf = bandX(-m.edgeX, m.edgeX, zNear, -232, proj), edges = lineX(-m.edgeX, zNear, -228, .09, proj) + lineX(m.edgeX, zNear, -228, .09, proj), dash = '';
  m.segs.forEach(sg => {
    const c = sg.curve, hw = sg.k*LANE/2, inner = 25/sg.L;
    surf += strip(offsetPts(c,0,1,-sg.half,proj,40), offsetPts(c,0,1,sg.half,proj,40));
    edges += lineC(c, sg.outerL?0:inner, 1, -sg.half, .09, proj) + lineC(c, sg.outerR?0:inner, 1, sg.half, .09, proj);
    for(let i=1;i<sg.k;i++) for(let s=8; s<sg.L-3; s+=9) dash += strip(offsetPts(c,s/sg.L,(s+3)/sg.L,-hw+i*LANE-.075,proj,2), offsetPts(c,s/sg.L,(s+3)/sg.L,-hw+i*LANE+.075,proj,2));
  });
  for(let i=1;i<m.lanes;i++) dash += dashX(m.laneX(i) - LANE/2, .075, zNear, proj);
  $('#h2Surf').setAttribute('d', surf); $('#h2Edges').setAttribute('d', edges); $('#h2Dash').setAttribute('d', dash);

  /* ① 들어갈 차로: 늘 같은 청록. 정체면 줄 끝까지만 칠하고(줄 차를 통과해 보이지 않게) 테두리는 끝까지 */
  // 갈림 뒤 경로는 안내 끝(마지막 갈림 + ROUTE_END)까지 — 지나갈수록 내 앞에서 짧아지다 사라짐(색 변화 · 축하 효과 없음)
  const lastS = path.nodeS[path.nodeS.length-1];
  const bc = R.afterCurve, bu = clamp((lastS + ROUTE_END - path.nodeS[0])/R.afterL), bh = R.leaf.path[0].k === 1 ? 2.3 : 1.75;
  S.fill += ((C.st === 1 ? .85 : 1) - S.fill)*k;
  let fillTo = -230;
  if(jam && onMain){
    if(G.need) fillTo = tailEnd;                                                           // 줄 끝까지
    else { const ahead = G.cars.filter(c => c.lane === G.my && c.z < p.z - 1).map(c => c.z + c.halfL); if(ahead.length) fillTo = Math.max(...ahead) + .5; }   // 줄 안: 앞차까지
  }
  const mainFill = onMain && fillTo < zNear ? bandX(tx-1.75, tx+1.75, zNear, fillTo, proj) : '';
  const mainRails = onMain ? lineX(tx-1.75, zNear, -230, .1, proj) + lineX(tx+1.75, zNear, -230, .1, proj) : '';
  $('#h2Fill').setAttribute('d', mainFill + (C.phase === 'off' ? '' : bandC(bc, 0, bu, -bh, bh, 18, R.afterL, proj)));
  $('#h2Fill').setAttribute('opacity', S.fill.toFixed(3));
  $('#h2Rails').setAttribute('d', mainRails + (C.phase === 'off' ? '' : bandC(bc, 0, bu, -bh-.1, -bh+.1, 18, R.afterL, proj) + bandC(bc, 0, bu, bh-.1, bh+.1, 18, R.afterL, proj)));
  $('#h2Rails').setAttribute('opacity', S.fill.toFixed(3));
  $('#h2Tail').setAttribute('d', jam && onMain && G.need && tailEnd < zNear ? quadZ(tx-1.75, tx+1.75, tailEnd + .25, tailEnd - .25, proj) : '');

  /* 차: 들어갈(옮길) 차로의 차만. 판단에 쓴 바로 그 차(S.G.cars) — 대기 이유인 차는 빨강, 확인 중엔 회색 */
  const lanesShown = new Set(G.need ? [G.next] : jam ? [G.my] : []);
  const blockers = new Set((wait ? G.A.blockers : clearing ? G.A.strict : []).map(b => b.c));
  const primary = G.reason && G.reason.car;
  const ahead = [], behind = [];
  if(onMain) G.cars.forEach(c => {
    if(!lanesShown.has(c.lane) && !blockers.has(c)) return;
    const dx = c.x - p.x, dz = c.z - p.z, lon = dx*f.x + dz*f.z, lat = dx*rx + dz*rz;
    if(lon < -35 || lon > 95) return;
    (lon >= c.halfL ? ahead : behind).push({c, lon, lat});
  });
  const jamWait = wait && G.reason && G.reason.kind === 'queue';   // 정체 줄 때문에 대기 = 위험 아닌 '틈 기다림' → 주황, 줄 차는 회색 그대로
  const colOf = c => blockers.has(c) && c.kind !== 'queue' ? (wait ? H2COL.wait : H2COL.clear) : H2COL.car;
  ahead.sort((a, b) => a.lon - b.lon);
  h2CarEls.forEach((r, i) => {
    const v = ahead[i], a = v && proj(v.c.x, v.c.z + v.c.halfL), b = v && proj(v.c.x, v.c.z - v.c.halfL), c = v && proj(v.c.x, v.c.z);
    if(!a || !b || !c){ r.setAttribute('opacity', 0); return; }
    const w = 1.8*PXM*c[2], h = Math.max(2.5, a[1] - b[1]), col = colOf(v.c);
    r.setAttribute('x', (c[0]-w/2).toFixed(1)); r.setAttribute('y', b[1].toFixed(1)); r.setAttribute('width', w.toFixed(1)); r.setAttribute('height', h.toFixed(1));
    const hot = blockers.has(v.c) && v.c.kind !== 'queue';
    r.setAttribute('fill', col); r.setAttribute('fill-opacity', hot ? .85 : .5); r.setAttribute('stroke', 'none'); r.setAttribute('opacity', 1);
  });
  behind.sort((a, b) => b.lon - a.lon);
  h2RearEls.forEach((el, i) => {
    const v = behind[i]; if(!v){ el.g.setAttribute('opacity', 0); return; }
    const col = colOf(v.c), isB = blockers.has(v.c) && v.c.kind !== 'queue', closing = (v.c.v - EGO.v) > .5;
    const X = clamp(HX + v.lat*PXM, 14, 506), Y = v.lon > 0 ? H2.rearTop - v.lon*2.5 : rearY(-v.lon);
    el.g.setAttribute('transform', `translate(${X.toFixed(1)} ${Y.toFixed(1)})`); el.g.setAttribute('opacity', isB ? 1 : .7);
    el.body.setAttribute('fill', col); el.body.setAttribute('fill-opacity', isB ? .9 : .55);
    const showChev = isB && v.c === primary && closing && wait;
    el.chev.setAttribute('stroke', col); el.chev.setAttribute('opacity', showChev ? 1 : 0);
    el.trail.setAttribute('stroke', col); el.trail.setAttribute('opacity', showChev ? .55 : 0);
  });

  /* 뒤 구역: 내 차 뒤로 이어지는 차로선 · 들어갈 차로 테두리 (본선에서만) */
  let rl = '', rr = '';
  if(onMain){
    const col = x => HX + (x - p.x)*PXM, seg = (x, w) => `M${(col(x) - w).toFixed(1)} ${H2.rearTop}H${(col(x) + w).toFixed(1)}V268H${(col(x) - w).toFixed(1)}Z`;
    for(let i = 1; i < m.lanes; i++) rl += seg(m.laneX(i) - LANE/2, .9);
    rl += seg(-m.edgeX, 1.1) + seg(m.edgeX, 1.1);
    if(G.need){ const nx = m.laneX(G.next); rr = seg(nx - LANE/2, 1.4) + seg(nx + LANE/2, 1.4); }
  }
  $('#h2RearLines').setAttribute('d', rl); $('#h2RearRails').setAttribute('d', rr);

  /* ② 대기 · 확인: 내 차로와 옮길 차로 사이 경계에 벽 (내 차 조금 뒤 ~ 16m 앞). 확인 중엔 회색으로 끊어져 보임 */
  let wa = '', wb = '';
  if(onMain && (wait || clearing)){
    const xb = m.laneX(G.my) + G.side*LANE/2, X0 = HX + (xb - p.x)*PXM;
    if(wait){
      wa = lineX(xb, p.z, p.z - 16, .15, proj) + `M${(X0-3.6).toFixed(1)} ${H2.rearTop}H${(X0+3.6).toFixed(1)}V${rearY(7).toFixed(1)}H${(X0-3.6).toFixed(1)}Z`;
      wb = lineX(xb, p.z, p.z - 16, .045, proj) + `M${(X0-1).toFixed(1)} ${H2.rearTop}H${(X0+1).toFixed(1)}V${rearY(7).toFixed(1)}H${(X0-1).toFixed(1)}Z`;
    } else {   // 확인: 벽이 끊어진 회색 토막 — 막혔던 길이 풀리는 중 (아직 이동 아님)
      for(let z = p.z; z > p.z - 16; z -= 4) wa += lineX(xb, z, z - 2, .16, proj);
      wa += `M${(X0-3).toFixed(1)} ${H2.rearTop + 2}H${(X0+3).toFixed(1)}V${(H2.rearTop + 9).toFixed(1)}H${(X0-3).toFixed(1)}Z`;
    }
  }
  $('#h2WallA').setAttribute('d', wa); $('#h2WallA').setAttribute('fill', wait ? (jamWait ? H2COL.jam : H2COL.wait) : H2COL.clear); $('#h2WallA').setAttribute('fill-opacity', wait ? .95 : .85);
  $('#h2WallB').setAttribute('d', jamWait ? '' : wb);

  /* ③ 이동: 판단이 '이동'일 때만 초록 흐름 화살표 (정체 틈이면 틈 한가운데로) */
  const slot = jam && jam.beside && go ? (() => {
    const zs = G.cars.filter(c => c.lane === G.next).map(c => c);
    const front = zs.filter(c => c.z < p.z).sort((a, b) => b.z - a.z)[0], back = zs.filter(c => c.z >= p.z).sort((a, b) => a.z - b.z)[0];
    const z0 = back ? back.z - back.halfL - .4 : p.z + 4, z1 = front ? front.z + front.halfL + .4 : p.z - 8;
    return {z0, z1, zc:(z0 + z1)/2};
  })() : null;
  $('#h2Slot').setAttribute('d', slot ? quadZ(m.laneX(G.next) - 1.45, m.laneX(G.next) + 1.45, Math.min(slot.z0, p.z - .1), slot.z1, proj) : '');
  const a0 = go && onMain ? proj(p.x, p.z - 7) : null, aEnd = slot ? Math.min(slot.zc, p.z - 12) : p.z - 31;
  const a1 = a0 ? proj(p.x, (p.z - 7 + aEnd)/2 - 2) : null, a2 = a0 ? proj(m.laneX(G.next), aEnd) : null;
  const ar = $('#h2Arrow'), hd = $('#h2Head');
  if(a0 && a1 && a2){
    ar.setAttribute('d', `M${fmt(a0)}Q${fmt(a1)} ${fmt(a2)}`); ar.classList.add('flow');
    let dx = a2[0]-a1[0], dy = a2[1]-a1[1]; const l = Math.hypot(dx,dy)||1; dx/=l; dy/=l; const nx = -dy, ny = dx;
    hd.setAttribute('d', `M${(a2[0]+dx*9).toFixed(1)} ${(a2[1]+dy*9).toFixed(1)}L${(a2[0]-dx*8+nx*10).toFixed(1)} ${(a2[1]-dy*8+ny*10).toFixed(1)}L${(a2[0]-dx*8-nx*10).toFixed(1)} ${(a2[1]-dy*8-ny*10).toFixed(1)}Z`);
  } else { ar.setAttribute('d', ''); hd.setAttribute('d', ''); ar.classList.remove('flow'); }

  /* ④ 짧은 문구 */
  // 자리: 맨 아래 내 차 옆 노면 위. 오른쪽으로 옮길 땐 내 차로 쪽(왼쪽)으로 붙여 뒤 구역의 뒤차와 겹치지 않게, 왼쪽이면 반대
  const msg = $('#h2Msg'), stopOn = !!G.stop && !G.need, sd = G.need ? G.side : 0;
  msg.textContent = G.text;
  msg.setAttribute('x', sd > 0 ? 298 : sd < 0 ? 222 : 260); msg.setAttribute('text-anchor', sd > 0 ? 'end' : sd < 0 ? 'start' : 'middle');
  msg.setAttribute('fill', stopOn ? H2COL.waitText : jamWait ? H2COL.jamText : wait ? H2COL.waitText : clearing ? H2COL.clear : go ? C_GO : H2COL.ink);

  /* ⑤ 일반도로 멈춤: 지금 차로를 가로지르는 빨간 막대(정지선 · 횡단보도 앞) + 보행자(대기 = 고리 · 건너는 중 = 점) */
  let cs = '', pw = '', pc = '';
  if(m.city){
    const e1 = R.leaf.path[0];
    if(G.stop && G.stop.kind === 'signal' && onMain) cs += quadZ(m.laneX(e1.lanes[0]) - 1.75, m.laneX(e1.lanes[e1.k-1]) + 1.75, FORK_Z + .6, FORK_Z - .6, proj);
    if(m.cw){
      if(G.stop && G.stop.kind === 'ped') cs += quadW([[m.cw.x0 - 1.5, CZ.near], [m.cw.x0 - .4, CZ.near], [m.cw.x0 - .4, CZ.mid], [m.cw.x0 - 1.5, CZ.mid]], proj);
      pedsAt(S.cityT).forEach(q => { if(q.phase === 'done') return; const c = proj(q.x, q.z); if(!c) return; const r = Math.max(2, 4.6*c[2]);
        const d = `M${(c[0] - r).toFixed(1)} ${c[1].toFixed(1)}a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(2*r).toFixed(1)} 0a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-2*r).toFixed(1)} 0Z`;
        if(q.phase === 'wait') pw += d; else pc += d; });
    }
  }
  $('#h2Stop').setAttribute('d', cs); $('#h2PedW').setAttribute('d', pw); $('#h2PedC').setAttribute('d', pc);
}
