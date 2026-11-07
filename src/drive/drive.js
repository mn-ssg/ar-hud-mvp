/* ============================================================
   drive.js — 주행 테스트: 내 차(키보드 조향 · 속도) · 도로 판정 · 교통(뒤차 · 정체 · 그 밖의 차) · 기록할 값
   설계: 01_프로젝트/14_주행테스트_설계.md (D57~D60). 값은 config.js DRV
   config.js · maps.js · scene.js · cabin.js · hud.js 다음, main.js 전에 로드.
   좌표: 앞 = -z, 오른쪽 = +x. 방향 ψ = 0이면 앞(-z), +면 오른쪽으로 돈 것 → 앞 벡터 (sin ψ, -cos ψ)
   ============================================================ */

/* ---------- 점 목록: 곡선을 같은 간격으로 ---------- */
function sampleCurve(c, off = 0, step = 2){
  const L = c.getLength(), n = Math.max(2, Math.ceil(L/step)), out = [];
  for(let i=0;i<=n;i++){ const u = i/n, q = c.getPointAt(u), t = c.getTangentAt(u); out.push([q.x - t.z*off, q.z + t.x*off]); }
  return out;
}
function resample(pts, step){
  const cum = [0];
  for(let i=1;i<pts.length;i++) cum.push(cum[i-1] + Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]));
  const n = Math.max(2, Math.floor(cum[cum.length-1]/step) + 1), x = new Float32Array(n), z = new Float32Array(n);
  for(let i=0, j=0; i<n; i++){
    const s = i*step;
    while(j < pts.length-2 && cum[j+1] < s) j++;
    const seg = cum[j+1] - cum[j], u = seg > 1e-6 ? clamp((s - cum[j])/seg) : 0;
    x[i] = pts[j][0] + (pts[j+1][0]-pts[j][0])*u; z[i] = pts[j][1] + (pts[j+1][1]-pts[j][1])*u;
  }
  const tx = new Float32Array(n), tz = new Float32Array(n);
  for(let i=0;i<n;i++){ const a = Math.max(0,i-1), b = Math.min(n-1,i+1), dx = x[b]-x[a], dz = z[b]-z[a], l = Math.hypot(dx,dz)||1; tx[i] = dx/l; tz[i] = dz/l; }
  return {x, z, tx, tz, n, step, L:(n-1)*step};
}
// 점 (x, z)를 점 목록 위로: 가장 가까운 번호 i · 길 따라 s · 옆 d(+ = 오른쪽). hint 근처만 찾는다(-1이면 전체)
function project(P, x, z, hint = -1){
  let i0 = 0, i1 = P.n - 1;
  if(hint >= 0){ i0 = Math.max(0, hint - 80); i1 = Math.min(P.n - 1, hint + 80); }
  let best = i0, bd = Infinity;
  for(let i=i0;i<=i1;i++){ const dx = x - P.x[i], dz = z - P.z[i], dd = dx*dx + dz*dz; if(dd < bd){ bd = dd; best = i; } }
  const dx = x - P.x[best], dz = z - P.z[best], tx = P.tx[best], tz = P.tz[best];
  return {i:best, s:best*P.step + dx*tx + dz*tz, d:dx*(-tz) + dz*tx, tx, tz};
}
function pathAt(P, s){
  const f = clamp(s, 0, P.L - .001)/P.step, i = Math.floor(f), u = f - i, j = Math.min(P.n-1, i+1);
  return [P.x[i] + (P.x[j]-P.x[i])*u, P.z[i] + (P.z[j]-P.z[i])*u, P.tx[i], P.tz[i]];
}
// 그리기용 방향: 점 사이에서 보간 (D112, 2026-11-07 저녁). pathAt의 방향은 점 i의 것을 그대로 줘서(판정 · 경로 계산은 그대로 둠) 꺾는 구간에선 1m마다 4 ~ 6°씩 뛰었다 → 차 메시 · 시연 카메라는 이걸 쓴다
function pathDirAt(P, s){
  const f = clamp(s, 0, P.L - .001)/P.step, i = Math.floor(f), u = f - i, j = Math.min(P.n-1, i+1);
  const tx = P.tx[i] + (P.tx[j]-P.tx[i])*u, tz = P.tz[i] + (P.tz[j]-P.tz[i])*u, l = Math.hypot(tx, tz) || 1;
  return [tx/l, tz/l];
}
const wrapA = a => a - 2*Math.PI*Math.round(a/(2*Math.PI));
const laneOf = (m, x) => clamp(Math.round(x/LANE + (m.lanes-1)/2), 0, m.lanes-1);
const exitName = e => e.dest || e.label;

// 출구 구간의 중심선 점 목록 (잎은 멀리 늘린 곡선 — 끝난 뒤에도 달릴 수 있게)
const segPts = e => e._pts || (e._pts = resample(sampleCurve(e.node ? e.curve : e.vis), .5));
// AI 차가 달릴 길: 본선 차로 → 그 차로의 출구 (⑤ 램프는 sub로 한쪽). 1m 간격. 본선 위에선 s = LANE_START - z
const LANE_START = 420;
function lanePath(m, lane, sub){
  m._lp = m._lp || {};
  const key = lane + ':' + sub;
  if(m._lp[key]) return m._lp[key];
  const e = m.exits.find(x => x.lanes.includes(lane)), off = -e.k*LANE/2 + (e.lanes.indexOf(lane) + .5)*LANE;
  const pts = [[m.laneX(lane), LANE_START], [m.laneX(lane), FORK_Z]];
  if(e.node){
    // 갈림 뒤 길: 내 차로 끝에서 이어지는 쪽 (④ 골목 갈림: 1차로 → 직진 · 2차로 → 골목 — 예전엔 랜덤이라 옆 차로로 3.5m 순간 이동). 같은 곳에서 갈리면(⑤ 램프) 랜덤
    const main = sampleCurve(e.curve, off), end = main[main.length - 1];
    const dist = c => { const q = c.vis.getPointAt(0); return Math.hypot(q.x - end[0], q.z - end[1]); }, best = Math.min(...e.node.exits.map(dist));
    const near = e.node.exits.filter(c => dist(c) < best + .5);
    pts.push(...main, ...sampleCurve(near[sub % near.length].vis));
  }
  else pts.push(...sampleCurve(e.vis, off));
  return m._lp[key] = resample(pts, 1);
}

/* ---------- 차량: 정체 줄은 scene.js queueCars(브레이크등 켬, 두 차로 줄을 위해 14대 더), 달리는 차는 여기서 ---------- */
for(let i=0;i<14;i++) queueCars.push(makeCar(QTYPES[(i+5)%QTYPES.length], QCOLORS[(i+3)%QCOLORS.length], true));
const FTYPES = ['sedan','suv','hatch','sedan','suv','truck','sedan','hatch','suv','sedan','hatch','sedan'];
const FCOLORS = ['#f4f5f4','#2a3442','#a4a9af','#7d2222','#f4f5f4','#1c1e22','#c9ccd0','#233b5c','#5b6169','#f4f5f4','#2e3440','#a4a9af'];
const flowCars = FTYPES.map((t, i) => makeCar(t, FCOLORS[i], false));
// 브레이크등: 미등 재질 ↔ 브레이크 재질 바꿔 끼우기 (앞차 급정거)
const setBrake = (mesh, on) => { mesh.userData.brake = on; if(mesh.userData.lights) mesh.userData.lights.brake = on; mesh.traverse(o => { if(o.material === carMats.tail || o.material === carMats.brake) o.material = on ? carMats.brake : carMats.tail; }); };   // 모델 차는 셰이더 uniform(D110)
// 교통 번호(seed)로 같은 난수 → 두 HUD 블록이 같은 교통
const mulberry32 = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };

/* ---------- 상태 ---------- */
const KEYS = {left:false, right:false, up:false, down:false};
const D = {x:0, z:0, psi:0, v:SPEED, steer:0, wheel:0, t:0, frozen:false, cars:[], jamLanes:[], cfg:null,
  blink:0, blinkT0:0, blinkOnAt:null, blinkPhase:false, responder:null, blinkUsed:null, blinkLead:null, blinkResp:''};   // 깜빡이 (D103)

// IDM(지능형 운전자 모델): 원하는 속도 v0 · 앞차와 간격 gap · 속도 차 dv(+ = 내가 빠름) → 가속도. T 차간 시간 · s0 최소 간격
function idm(v, v0, gap, dv, A = 1.5, T = 1.1, s0 = 2.5){
  let a = A*(1 - Math.pow(v/Math.max(v0, .1), 4));
  if(gap < Infinity){ const ss = s0 + Math.max(0, v*T + v*dv/(2*Math.sqrt(A*3))); a -= A*Math.pow(ss/Math.max(gap, .1), 2); }
  return a;
}
// (x, z)에서 앞(fx, fz)을 볼 때 같은 줄(옆 차이 < 차 폭 + 0.3) 앞의 가장 가까운 차.
// meLat > 0이면 내 차도 보되, 옆 차이가 meLat 안으로 들어와야 앞차로 알아챔(AI는 끼어드는 차를 늦게 알아챔, HARD.aiSee).
// carLat: 다른 차를 앞차로 볼 옆 폭. 내 SCC는 속도에 따라(서 있으면 차 폭 1.85m ~ 65km/h면 2.4m):
// 늘 넓으면 끼어들다 걸친 채 옆 차로 차를 앞차로 보고 멈춰 갇히고, 늘 좁으면 빠르게 끼어들 때 늦게 알아채 들이받음
function leaderOf(x, z, fx, fz, self, meLat, carLat = DRV.carW + .3){
  let gap = Infinity, v = 0, car = null, me = false;
  const see = (ox, oz, ov, o, w) => {
    const dx = ox - x, dz = oz - z, lon = dx*fx + dz*fz, lat = dx*(-fz) + dz*fx;
    // 간격 = 중심 거리 − 두 차 길이의 반씩 (버스 11.4m도 제 길이로 — 예전엔 모두 4.6m로 쳐서 버스와 3m 겹쳤음)
    if(lon > 0 && Math.abs(lat) < w + (o && o.w ? (o.w - DRV.carW)/2 : 0)){ const g = lon - (o ? halfL(o) : DRV.carL/2) - (self ? halfL(self) : DRV.carL/2); if(g < gap){ gap = g; v = ov; car = o; me = !o; } }
  };
  D.cars.forEach(o => { if(o !== self) see(o.x, o.z, o.v, o, carLat); });
  if(meLat) see(D.x, D.z, D.v, null, meLat);
  return {gap, v, car, me};
}

/* ---------- 한 판 준비 (main.js startDrive가 경로를 정한 뒤 부름) ----------
   cfg = {map, leaf, lane, type:'rear'|'jam', jam, seed}. 교통은 seed 난수로 → 같은 seed면 목적지가 달라도 같은 교통 (D61) */
function driveReset(cfg){
  const m = cfg.map, p0 = path.curve.getPointAt(clamp(path.sStart/path.L));
  D.cruise = cruiseOf(m);
  Object.assign(D, {x:m.laneX(cfg.lane), z:p0.z, psi:0, v:D.cruise, steer:0, wheel:0, t:0, frozen:false, cfg, ped:0, pedIn:false, sigChecked:false,
    seg:null, hint:-1, segS:0, cands:null, lane:cfg.lane, chosen:[], exitName:'',
    enterZ:null, changeDist:null, risky:0, enc:{}, lastCut:{}, offroad:0, lastTouch:-9, followT:0, crashWith:'', result:null, endT:0,
    safeOn:false, safeSince:0, reactT:null, moved:false, cutAhead:0, cutAheadGap:null, cutAheadTtc:null,   // 앞으로 끼어들기(2026-11-03): 옮길 차로의 뒤차 앞에 들어간 횟수 · 그때 뒤차 간격(m, 최소) · 닿기까지(초, 최소)
    blink:0, blinkT0:0, blinkOnAt:null, blinkPhase:false, responder:null, blinkUsed:null, blinkLead:null, blinkResp:'',   // 깜빡이 (D103): 켜진 쪽 · 켠 시각 · 반응하는 뒤차 · 기록 3칸
    events:[], lc:null});   // events: 위험 · 판단 상태 · 차로 변경 시작/완료 · 끼어들기 · 충돌 시점 (2026-10-29, session.js가 기록에 붙임)
  Object.keys(KEYS).forEach(k => KEYS[k] = false);
  queueCars.forEach(c => c.visible = false); flowCars.forEach(c => { c.visible = false; c.userData.onc = false; setBrake(c, false); }); otherCar.visible = false; busMesh.visible = false;
  D.cars = [];
  const R = mulberry32(cfg.seed ?? Math.floor(Math.random()*1e9)), rr = ([a, b]) => a + R()*(b - a), ri = ([a, b]) => a + Math.floor(R()*(b - a + 1));
  let fi = 0, qi = 0;
  // 판정 크기 = 보이는 차체 크기 (2026-10-29: 예전엔 차종과 상관없이 4.6 × 1.85m — 해치 4.1m · 탑차 4.8m와 어긋났음). 버스는 o.len · o.w
  const add = (mesh, lane, z, v, kind, o = {}) => {
    const c = {mesh, lane, kind, v, v0:v, base:v, T:1.1, s0:2.5, seenV:v, len:mesh.userData.L, w:mesh.userData.W, P:o.P || lanePath(m, lane, Math.floor(R()*2)), s:LANE_START - z, ...o};   // 버스 · 마주 오는 차는 자기 길(o.P)
    D.cars.push(c); mesh.visible = true; return c;
  };
  const tl = S.route.tl, lanes = [...Array(m.lanes).keys()], V0 = D.cruise;
  // 내 차로 앞차는 늘 있음. 판마다 둘 중 하나: 앞차가 급정거해 완전히 섬(내 뒤는 비어 있음) / 뒤에 바짝 붙어 오는 차(급하게 서면 받힘, 뒤차 판만)
  // — 둘을 한 판에 같이 두면 세게 밟아도 약하게 밟아도 부딪혀 피할 길이 없음
  cfg.brake = cfg.type !== 'practice' && R() < HARD.brakeAhead;   // 연습 판(session.js)은 급정거 · 뒤차 · 정체 없이 앞차와 옆 차로 차만
  const lead = add(flowCars[fi++], cfg.lane, D.z - DRV.carL - rr(HARD.block.leadNear && cfg.type !== 'practice' ? HARD.leadNearGap : HARD.lead), V0, 'lead');   // block.leadNear: 앞차를 가까이 (연습 판은 보통 거리 — 내 속도가 흔들려 옆 차로 연습 뒤차가 먼저 지나가 버리지 않게)
  lead.brakeAt = cfg.brake ? rr(HARD.brakeAt) : null; lead.phase = 0;
  // 바짝 붙은 뒤차는 뒤차 판에만 — 정체 판은 줄 때문에 누구나 크게 줄여야 해서, 뒤차까지 붙으면 제대로 줄여도 받힘(실제론 뒤차도 정체를 보고 같이 줄임)
  if(!cfg.brake && cfg.type === 'rear') add(flowCars[fi++], cfg.lane, D.z + rr(HARD.tail), V0 + .4, 'tail', {T:.5, s0:2, v0:V0 + 1.5});
  // 뒤차 판: 목표 차로에 3~5대 무리가 바짝 붙어(차간 0.4초) 빠르게 온다. 첫 차가 1.5~5초에 내 옆
  cfg.rearN = 0;
  if(cfg.type === 'rear'){
    cfg.rearN = ri(HARD.block.stream ? HARD.streamN : HARD.rearN);   // block.stream: 4 ~ 5대 흐름
    const dv = rr(HARD.rearDv)/3.6;
    let z = D.z + dv*rr(HARD.rearArrive);
    for(let k=0;k<cfg.rearN;k++){ add(flowCars[fi++], tl, z, V0 + dv, 'rear', {T:.4, s0:2}); z += DRV.carL + rr(HARD.block.stream ? HARD.streamGap : HARD.rearGap); }
  }
  // 정체 판: 목표 차로 뒤에서 줄 끝으로 달려와 붙는 차 2~3대 — 일찍 옮기려 해도 이 차들 사이 틈을 찾아야 함
  if(cfg.type === 'jam'){
    const n = ri(HARD.joinN), dv = rr(HARD.joinDv)/3.6;
    let z = D.z + dv*rr(HARD.rearArrive);
    for(let k=0;k<n;k++){ add(flowCars[fi++], tl, z, V0 + dv, 'rear', {T:.4, s0:2}); z += DRV.carL + rr(HARD.rearGap); }
  }
  /* 일반도로 (D69): 맵에 딸린 상황 — ④ 좌회전 대기 줄(아래 정체 줄과 같은 코드) + 뒤에서 와 줄 끝에 붙는 좌회전 차 0~2대 ·
     ⑤ 정류장 버스(4~10초 뒤 떠나 곧장 감) + 맨 오른쪽 차로 뒤차 1~3대. 둘 다 마주 오는 차 2~4대 · 신호 · ⑤ 보행자 */
  if(m.city){
    const n = m.bus ? ri([1, 3]) : ri([0, 2]), dv = rr(m.bus ? [10, 20] : [5, 15])/3.6;
    let z = D.z + dv*rr(HARD.rearArrive) + (m.bus ? 0 : 10);
    for(let k=0;k<n;k++){ add(flowCars[fi++], tl, z, V0 + dv, 'rear', {T:.6, s0:2}); z += DRV.carL + rr([8, 20]); }
    if(m.bus){ const bx = m.laneX(m.bus.lane), plan = busPlanOf(m, rr, ri); add(busMesh, m.bus.lane, plan.z0, BUS.v0, 'bus', {len:11.4, w:2.5, plan, P:resample([[bx, LANE_START], [bx, -900]], 1)}); }   // 정류장 흐름 (D104): 앞에서 천천히 와서 서고 떠남
    const nO = ri([2, 4]);
    for(let k=0;k<nO && fi < flowCars.length;k++){
      const ol = Math.floor(R()*m.lanes), ox = -m.lanes*LANE/2 - (ol + .5)*LANE, oz = -560 + k*90 + R()*40, mesh = flowCars[fi++];
      add(mesh, -1 - ol, oz, V0, 'onc', {P:resample([[ox, -900], [ox, 300]], 1), s:oz + 900, mv:'O', stopS:(CZ.far - 8) + 900});
      mesh.userData.onc = true;
    }
    S.pedPlan = m.cw ? Array.from({length:ri([2, 3])}, () => ({x:m.cw.x0 + .7 + R()*(m.cw.x1 - m.cw.x0 - 1.4), dir:R() < .6 ? 1 : -1, v:1.2 + R()*.4, t0:8 + R()*10})) : null;   // 내 차가 닿는 15초 안팎에 건너게
  } else S.pedPlan = null;
  // 정체 판: 목표 출구로 가는 차로 모두에 줄 (줄 끝 = 시연과 같은 JAM_LV). 촘촘하고(몇 대마다 넓은 틈) 멈췄다 가며, 일부는 끼어들면 틈을 막는다
  D.jamLanes = cfg.type === 'jam' ? S.route.leaf.path[0].lanes.slice() : m.city && m.queue ? m.queue.lanes.slice() : [];   // 일반도로: 좌회전 차로들
  // 같은 줄은 같은 기본 속도 — 차마다 다르면 빠른 차가 앞 틈을 영구히 메워 버림. 틈은 물결 따라 열렸다 닫혔다만 함
  D.qBase = {};
  D.jamLanes.forEach(lane => {
    const base = D.qBase[lane] = m.city ? 9 : 3.5 + R();   // 일반도로 줄은 서 있는 채로 시작(속도 0 — 9m/s로 시작해 정지선을 못 서고 빨간불에 들어갔었음), 초록이면 바로 출발
    let k = 0, wideAt = ri(HARD.qWideEvery);
    for(let z = qFrontOf(m) - (m.city ? 0 : R()*4); z <= jamBackOf(m, cfg.jam) && qi < queueCars.length; k++){
      add(queueCars[qi++], lane, z, m.city ? 0 : base, 'queue', {base, T:.5, s0:1.5, mean:R() < HARD.qMean});
      if(k + 1 === wideAt){ z += rr(HARD.qWideGap); wideAt += ri(HARD.qWideEvery); } else z += rr(HARD.qGap);   // 몇 대마다 넓은 틈
    }
  });
  // 연습 판 (D103): 옮길 차로에 같은 속도로 따라오는 뒤차 2대 — 가까운 차(범퍼 7m 뒤, 그냥은 끼어들 틈이 없음)는 깜빡이를 켜면 반드시 양보, 뒤 차는 양보 안 함
  if(cfg.type === 'practice'){ add(flowCars[fi++], tl, D.z + DRV.carL + 7, V0, 'rear', {T:.6, s0:2, pYield:BLINK.practiceYield ? 0 : null, match:true}); add(flowCars[fi++], tl, D.z + DRV.carL + 7 + 34, V0, 'rear', {T:.6, s0:2, pYield:1}); }   // match: 내 속도를 따라붙어 틈을 안 줌(양보 전까지)
  // 그 밖의 차: 시작 · 목표 · 정체 차로가 아닌 차로 앞쪽 1~3대
  const others = lanes.filter(l => l !== cfg.lane && l !== tl && !D.jamLanes.includes(l)), nAmb = ri([1, 3]);
  for(let k=0; k<nAmb && others.length && fi < flowCars.length; k++) add(flowCars[fi++], others[Math.floor(R()*others.length)], D.z - 30 - k*45 - R()*25, m.city ? V0*(.9 + R()*.15) : (61 + R()*11)/3.6, 'amb');
  // 일반도로: 차마다 신호(정지선) · 꺾는 구간(느리게) · 우회전 차는 횡단보도 앞(보행자 양보)
  if(m.city){
    const stopS0 = LANE_START - FORK_Z;
    D.cars.forEach(c => {
      if(c.kind === 'onc') return;
      const e = m.exits.find(x => x.lanes.includes(c.lane));
      c.mv = c.kind === 'bus' ? 'S' : e.key; c.stopS = stopS0;
      if(m.cw && c.mv === 'R') for(let i = Math.floor(stopS0); i < c.P.n; i++) if(c.P.x[i] >= m.cw.x0 - .3){ c.cwS = i*c.P.step; break; }
    });
  }
  // 깜빡이 반응 난수 (D103): 차마다 양보 여부(yieldR < BLINK.yieldP) · 알아채는 시간 — 맨 끝에서 뽑아 위 교통 배치는 예전 seed 그대로. 연습 판은 정해진 값(pYield)
  D.cars.forEach(c => { c.yieldR = c.pYield ?? R(); c.noticeT = rr(BLINK.notice); });
  placeCars();
  hudThreat(0);
}
function driveClear(){ D.cars.forEach(c => c.mesh.visible = false); D.cars = []; }

function placeCars(){
  D.cars.forEach((c, i) => {
    const [x, z, tx, tz] = pathAt(c.P, c.s); c.x = x; c.z = z; c.tx = tx; c.tz = tz;
    const [dx, dz] = pathDirAt(c.P, c.s);   // 메시 방향만 보간(D112) — 판정용 c.tx · c.tz는 그대로
    c.mesh.position.set(x, 0, z); c.mesh.rotation.y = Math.atan2(-dx, -dz);
    // AI 차 깜빡이 (D103): 꺾이는 출구로 나가는 차는 갈림 앞뒤에서 그쪽, 버스는 정류장 흐름(busSide)
    applyBlink(c.mesh, c.kind === 'bus' ? (c.busSide || 0) : laneBlink(S.map, c.lane, c.z), blinkOn(D.t, i));
  });
}
// 본선 차로의 출구가 꺾이면(L · R) 갈림 60m 앞부터 갈림 뒤 25m까지 그쪽 깜빡이 (시연의 줄 차 · 옆 차로 차도 같은 규칙 — main.js)
function laneBlink(m, lane, z){
  if(lane < 0 || lane >= m.lanes || z > FORK_Z + 60 || z < FORK_Z - 25) return 0;
  const e = m.exits.find(x => x.lanes.includes(lane)); return !e ? 0 : e.key === 'L' ? -1 : e.key === 'R' ? 1 : 0;
}

/* ---------- 깜빡이 (D103) ----------
   setBlink(side): Q(−1) · E(1) 토글, 반대쪽을 누르면 그쪽으로. 차로 변경이 끝나면(trackLanes lcDone) 자동으로 꺼짐(auto).
   stepBlink(): 옮길 쪽 차로에서 내 뒤 · 옆(BLINK.react m 안)의 가장 가까운 차 한 대가 반응 — noticeT초 뒤 양보(yielding: 속도를 줄여 내 앞에 틈) 또는 양보 안 함(passing: 조금 올려 그냥 지나감).
   반응 여부(yieldR)는 driveReset에서 seed로 정해져 있어 같은 seed면 두 HUD 조건에서 같다. 깜빡이를 끄면 반응도 멈춘다. 2차 HUD 판단(guide.js)엔 연결하지 않음 */
function setBlink(side, auto = false){
  if(!S.drive || D.result) return;
  const next = side && side !== D.blink ? side : 0;
  if(next === D.blink) return;
  D.blink = next; D.blinkT0 = D.t; if(next) D.blinkOnAt = D.t;
  D.events.push({t:+D.t.toFixed(2), type:'blink', side:next, auto});
  // 끄거나 쪽을 바꾸면 반응을 되돌림 — 알아챈 시계 · 결정도 지워 다시 켜면 처음부터(같은 seed면 같은 결정)
  D.cars.forEach(c => { c.yielding = c.passing = false; delete c.blinkSeenAt; delete c.blinkDec; }); D.responder = null;
}
function stepBlink(){
  if(!D.blink || D.seg || D.cands) return;   // 본선에서만 뒤차가 반응
  const lane = D.lane + D.blink; if(lane < 0 || lane >= S.map.lanes) return;
  const behindGap = c => c.z - D.z - halfL(c) - DRV.carL/2;   // 내 뒤 범퍼 간격(+ = 뒤, 음수 = 옆 · 앞)
  const inRange = c => c.lane === lane && c.kind !== 'queue' && c.kind !== 'onc' && c.kind !== 'bus' && c.z > FORK_Z - 5 && behindGap(c) > -(halfL(c) + DRV.carL/2) && c.z - D.z <= BLINK.react;
  // 범위에 든 차마다 알아채는 시계를 따로(한 번만) — 반응 차 하나를 매 프레임 다시 고르면 빠른 흐름에선 알아채기 전에 지나가 버려 아무도 반응하지 못했음(2026-11-07 확인)
  D.cars.forEach(c => { if(inRange(c) && c.blinkSeenAt === undefined) c.blinkSeenAt = D.t + c.noticeT; });
  if(D.responder && D.responder.yielding){ if(behindGap(D.responder) <= -(halfL(D.responder) + DRV.carL/2)){ D.responder.yielding = false; D.responder.passing = true; D.responder = null; } return; }   // 양보 중인 차가 있으면 그 차만. 어쩌다 나를 완전히 앞질렀으면 그냥 지나감으로
  // 알아챈 차 중 가장 가까운 한 대가 정한다: 양보할 수 있는 자리(뒤에 있고, yieldDec로 줄여 내 뒤에 설 수 있는 간격)면 seed 난수로 양보 · 안 함, 이미 옆이거나 너무 가까이 빠르게 왔으면 그냥 지나감(결정으로 세지 않음)
  const cand = D.cars.filter(c => inRange(c) && c.blinkDec === undefined && D.t >= c.blinkSeenAt).sort((p, q) => (p.z - D.z) - (q.z - D.z))[0];
  if(!cand) return;
  const gap = behindGap(cand), can = gap > 1 + Math.max(0, cand.v - D.v)**2/(2*BLINK.yieldDec), y = can && cand.yieldR < BLINK.yieldP;
  cand.blinkDec = y ? 'yield' : 'pass'; if(y) cand.yielding = true; else cand.passing = true;
  D.responder = cand;
  if(can){ D.events.push({t:+D.t.toFixed(2), type:'blinkResp', with:KIND_NAME[cand.kind], yield:y, notice:+cand.noticeT.toFixed(1), gap:+gap.toFixed(1)}); if(!D.blinkResp) D.blinkResp = y ? '양보' : '양보 안 함'; }
}

/* ---------- 매 프레임 ---------- */
function driveStep(dt){
  D.t += dt;
  stepPlayer(dt);
  if(!D.result) stepBlink();
  stepCars(dt);
  if(!D.result){
    if(!D.seg && !D.cands) stepMain(dt);
    else if(D.cands) stepCands(dt);
    else stepSeg(dt);
    if(!D.result){ const h = hit(); if(h){ D.crashWith = h; D.events.push({t:+D.t.toFixed(2), type:'crash', with:h}); endRun('crash'); } }
    if(!D.result && D.t > (S.map.city ? CITY_DRV.timeout : DRV.timeout)) endRun('timeout');
    if(!D.result && S.map.cw) pedCheck();
  }
  hudThreat(dt);
  if(D.result && D.t >= D.endT){ S.running = false; if(typeof onDriveEnd === 'function') onDriveEnd(); }
}

// 내 차: ← → 누르는 동안 핸들이 차오르고 떼면 돌아온다(차 방향은 남음). ↑ 가속 · ↓ 브레이크 · 손 떼면 65km/h 순항 + 앞차 따라감(SCC)
function stepPlayer(dt){
  const want = (KEYS.right ? 1 : 0) - (KEYS.left ? 1 : 0), rate = want === 0 || D.steer*want < 0 ? DRV.steerBack : DRV.steerUp;
  D.steer += clamp(want - D.steer, -rate*dt, rate*dt);
  const fx = Math.sin(D.psi), fz = -Math.cos(D.psi);
  let a;
  if(KEYS.down) a = -DRV.brake;
  else if(KEYS.up) a = DRV.acc;
  else {
    a = D.v > D.cruise + .3 ? -DRV.coastDown : idm(D.v, D.cruise, Infinity, 0, DRV.coastUp);
    const ld = leaderOf(D.x, D.z, fx, fz, null, 0, DRV.carW + Math.min(.55, D.v*.03));
    if(ld.gap < Infinity) a = Math.min(a, idm(D.v, D.cruise, ld.gap, D.v - ld.v, DRV.coastUp));
    a = Math.max(a, -HARD.accDec);   // SCC는 급정거를 못 함 — 앞차가 급히 서면 직접 ↓
  }
  D.v = clamp(D.v + a*dt, 0, DRV.vMax);
  // 앞바퀴 각: 빠를수록 옆 가속 한도(latMax) 때문에 덜 꺾인다
  const v = D.v, dMax = Math.min(DRV.wheelMax, Math.atan(DRV.latMax*WHEELBASE/Math.max(v*v, .01)));
  D.wheel = D.steer*dMax;
  D.psi += v/WHEELBASE*Math.tan(D.wheel)*dt;
  D.x += Math.sin(D.psi)*v*dt; D.z -= Math.cos(D.psi)*v*dt;
}

function stepCars(dt){
  D.cars.forEach(c => {
    // 앞차 급정거: HARD.leadDec로 완전히 서고 1.5초 뒤 다시 출발
    if(c.kind === 'lead' && c.brakeAt !== null && c.phase < 3){
      if(c.phase === 0 && D.t >= c.brakeAt){ c.phase = 1; setBrake(c.mesh, true); }
      if(c.phase === 1){ c.v = Math.max(0, c.v - HARD.leadDec*dt); c.s += c.v*dt; if(c.v === 0){ c.phase = 2; c.holdT = D.t; } return; }
      if(c.phase === 2){ if(D.t - c.holdT < 1.5) return; c.phase = 3; setBrake(c.mesh, false); }
    }
    const ld = leaderOf(c.x, c.z, c.tx, c.tz, c, HARD.aiSee);
    // 정체 판: 줄 끝으로 달려온 차가 줄에 붙어 느려지면 그때부터 줄 차 (HUD 줄 끝 · 대기 판단 · 줄 합류 성공에 같이 들어감)
    if(c.kind === 'rear' && D.jamLanes.includes(c.lane) && ld.car && ld.car.kind === 'queue' && ld.gap < 12 && c.v < 7){
      Object.assign(c, {kind:'queue', base:D.qBase[c.lane], T:.5, s0:1.5, mean:false}); setBrake(c.mesh, true);
    }
    if(c.kind === 'bus'){   // 정류장 흐름 (D104): 출발 전까지는 시각의 함수(city.js busStateAt), 문 닫은 뒤 같은 차로 뒤 gapBack m 안에서 오는 차(내 차 포함)가 없으면 출발. 출발 뒤엔 보통 차처럼(IDM, 느린 가속)
      const P = c.plan, st = busStateAt(P, D.t);
      if(st.phase === 'ready' && P.departT === null){ const fx = Math.sin(D.psi), fz = -Math.cos(D.psi);
        const coming = D.cars.some(o => o !== c && o.lane === c.lane && o.z > c.z && o.z - c.z < BUS.gapBack + halfL(o) + halfL(c) && o.v > 1) || (laneOf(S.map, D.x) === c.lane && D.z > c.z && D.z - c.z < BUS.gapBack + DRV.carL/2 + halfL(c) && D.v > 1);
        void fx; void fz; if(!coming) P.departT = D.t; }
      if(st.phase !== 'depart'){ c.v = st.v; c.s = LANE_START - st.z; }
      c.busSide = st.side; busFrame(P, {...st, z:LANE_START - c.s}, D.t, S.map, D.cars.indexOf(c));   // 출발 뒤 자리는 IDM이 적분한 c.s (문 · 등 · 사람만 시각 함수)
      if(st.phase !== 'depart') return;
      c.v0 = D.cruise;
    }
    let v0 = c.v0, T = c.T, s0 = c.s0;
    if(c.kind === 'queue'){
      if(c.z < FORK_Z - 12){ v0 = D.cruise; T = 1.1; s0 = 2.5; }                                     // 갈림을 지나면 빠져나감
      else {
        v0 = Math.max(.3, c.base*(1 + (S.map.city ? 0 : HARD.qWave)*Math.sin(D.t*.9 + c.z*.12)));   // 멈췄다 가는 물결 (일반도로 줄은 신호만 따름)
        // 끼어들려 하면 앞차에 바짝 붙어 틈을 막음 — 내가 차로를 넘어오기 시작했을 때만, HARD.qMeanFor초 버티면 양보
        if(c.mean && cuttingAhead(c)){ c.meanT = (c.meanT || 0) + dt; if(c.meanT > HARD.qMeanFor) c.mean = false; else { v0 = c.base*2.4; T = .2; s0 = 1; } }
      }
    }
    if(S.map.city) v0 = Math.min(v0, curveV(c));                                                   // 일반도로: 굽은 곳 앞에서 미리 부드럽게 줄임
    // block.rearMatch: 옮길 차로 뒤차(내 뒤 60m 안)는 내가 순항보다 빨리 달리면 그만큼 더 빨라져 간격을 유지 — 끼워 주지 않는 차처럼. 가속은 matchA까지. 양보 중인 차(D103)는 예외
    let Aacc = c.kind === 'bus' ? BUS.acc : 1.5; const decCap = -9;
    if(HARD.block.rearMatch && !c.yielding && c.kind === 'rear' && c.lane === laneOf(S.map, S.route.tx) && c.z > D.z && c.z - D.z < 60 && D.v > D.cruise + .3){ v0 = Math.max(v0, c.base + (D.v - D.cruise)); Aacc = HARD.matchA; }
    // 깜빡이 반응 (D103): 양보 = 내 뒤 범퍼 간격이 yieldGap이 될 때까지 내 속도보다 yieldDv 느리게(감속은 yieldDec까지만 — 앞차가 가까우면 평소대로), 생기면 내 속도를 따라감 / 양보 안 함 = 기본 속도 + passDv로 지나가고, 지나가면 평소대로
    if(c.match && !c.yielding && !c.passing) v0 = Math.min(v0, D.v);   // 연습 판 뒤차: 내 속도에 맞춰 따라옴(깜빡이로 양보받기 전엔 틈이 안 생김)
    let aYield = Infinity;
    if(c.yielding){ const gapMe = Math.max(.1, c.z - D.z - halfL(c) - DRV.carL/2); aYield = Math.max(-BLINK.yieldDec, idm(c.v, Math.min(v0, D.v + .3), gapMe, c.v - D.v, 1.5, BLINK.yieldT, BLINK.yieldGap)); }   // 나를 앞차로 보고 뒤로 물러남
    if(c.passing){ v0 = Math.max(v0, c.base + BLINK.passDv); if(c.z - D.z < -(halfL(c) + DRV.carL/2 + 4)){ c.passing = false; if(D.responder === c) D.responder = null; } }
    // 내 차가 앞차면: 내 속도 변화를 HARD.aiLag초 늦게 알아채고, 최대 HARD.aiDec까지만 밟음
    c.seenV += (D.v - c.seenV)*Math.min(1, dt/HARD.aiLag);
    let gap = ld.gap, lv = ld.me ? c.seenV : ld.v;
    const st = cityStop(c); if(st !== null && st < gap){ gap = st; lv = 0; }                       // 빨간불 정지선 · 보행자 앞 = 서 있는 앞차처럼
    const a = Math.min(idm(c.v, v0, gap, c.v - lv, Aacc, T, s0), aYield);
    c.v = Math.max(0, c.v + Math.max(ld.me ? -HARD.aiDec : decCap, a)*dt);
    c.s += c.v*dt;
  });
  placeCars();
}
// 일반도로: 차 c가 멈춰야 할 곳까지 앞범퍼 거리(없으면 null) — 빨간불(노란불은 설 수 있을 때) 정지선 · 보행자가 있으면 횡단보도 앞
function cityStop(c){
  if(!S.map.city) return null;
  const front = c.s + (c.len || DRV.carL)/2; let g = null;
  if(c.stopS !== undefined){ const d = c.stopS - front, sg = sigOf(c.mv, D.t); if(d > -.5 && (sg === 'red' || (sg === 'yellow' && d > c.v*c.v/8))) g = Math.max(0, d); }
  if(c.cwS !== undefined && pedBlock(D.t)){ const d = c.cwS - front; if(d > -.5 && d < 30) g = Math.min(g ?? Infinity, Math.max(0, d)); }
  return g;
}
const halfL = o => (o.len || DRV.carL)/2, halfW = o => (o.w || DRV.carW)/2;
// 일반도로 AI: 앞 36m 안 굽은 곳(곡률)에 맞춘 속도 — 옆 가속 2.5m/s², 미리 1.8m/s²로 줄임 (예전: 꺾는 구간에 들어서며 7m/s로 급제동)
function curveV(c){
  const P = c.P, i0 = Math.round(c.s/P.step); let v = Infinity;
  for(let k = 0; k <= 12; k++){
    const i = Math.min(P.n - 4, i0 + k*3), j = i + 3;
    const dth = Math.abs(Math.atan2(P.tx[i]*P.tz[j] - P.tz[i]*P.tx[j], P.tx[i]*P.tx[j] + P.tz[i]*P.tz[j])), kap = dth/(3*P.step);
    if(kap < .004) continue;
    const vc = Math.sqrt(2.5/kap), d = Math.max(0, (i - i0)*P.step);
    v = Math.min(v, Math.sqrt(vc*vc + 2*1.8*d));
  }
  return v;
}
// 줄 차 c 앞 옆 차로에서 내 차가 끼어들려는 중인가: c 앞 2~13.6m에 있고, 내 차로 가운데에서 c 쪽으로 0.6m 넘게 넘어와 있음
function cuttingAhead(c){
  if(c.z < FORK_Z) return false;
  const dx = D.x - c.x, dz = D.z - c.z, lon = dx*c.tx + dz*c.tz, lat = Math.abs(dx*(-c.tz) + dz*c.tx);
  return lat > HARD.aiSee && lat < LANE - .6 && lon > 2 && lon < DRV.carL + 9;
}

/* ---------- 도로 판정 ---------- */
// 도로 끝에 닿음: 안쪽으로 밀고, 바깥을 보고 있으면 길 방향으로, 긁히며 감속. 1초 넘게 떨어졌다 다시 닿으면 이탈 1회
function wall(r, side, lim, dt){
  const push = r.d - side*lim;
  D.x -= -r.tz*push; D.z -= r.tx*push;
  const road = Math.atan2(r.tx, -r.tz);
  if(wrapA(D.psi - road)*side > 0) D.psi = road;
  D.v = Math.max(0, D.v - 4*dt);
  if(D.t - D.lastTouch > 1) D.offroad++;
  D.lastTouch = D.t;
}
function stepMain(dt){
  const m = S.map, lim = m.city ? m.edgeX - DRV.carW/2 + .2 : m.half + .4 - DRV.carW/2;   // 가드레일(포장 반폭 + 0.4m) · 일반도로는 중앙선 · 연석
  if(Math.abs(D.x) > lim) wall({d:D.x, tx:0, tz:-1}, Math.sign(D.x), lim, dt);
  trackLanes();
  // 일반도로: 앞범퍼가 정지선을 1m 넘는 순간 그 차로의 신호가 빨강이면 신호 위반(그 판 끝)
  if(m.city && !D.sigChecked && D.z - DRV.carL/2 < FORK_Z - 1){
    D.sigChecked = true;
    if(sigOf(m.exits.find(e => e.lanes.includes(laneOf(m, D.x))).key, D.t) === 'red'){ endRun('signal'); return; }
  }
  // 정체 판: 목표 차로 줄에 자리 잡고 3초 동안 줄 차를 따라가면 성공으로 끝 — 그 뒤는 줄을 따라 기어갈 뿐이라 (참가자 1명 2분, D60)
  if(D.cfg.type === 'jam'){
    const ld = leaderOf(D.x, D.z, Math.sin(D.psi), -Math.cos(D.psi), null, 0, DRV.carW);
    D.followT = D.enterZ !== null && ld.car && ld.car.kind === 'queue' && ld.gap < 20 ? D.followT + dt : 0;
    if(D.followT >= 3){ D.changeDist = Math.round(D.enterZ - FORK_Z); D.exitName = exitName(S.route.leaf.path[0]) + ' 줄 합류'; endRun('ok'); return; }
  }
  if(D.z < FORK_Z){
    D.changeDist = D.enterZ !== null ? Math.round(D.enterZ - FORK_Z) : null;   // 목표 차로에 자리 잡은 곳이 갈림 몇 m 앞
    D.cands = m.exits.map(e => ({e, hint:-1}));
  }
}
// 갈림 직후: 모든 출구가 후보. 한 출구 위에만 있고 다른 출구 포장에서 3m 넘게 떨어지면 확정. 두 출구 사이(코)면 충돌
function stepCands(dt){
  const cs = D.cands, m = S.map;
  cs.forEach(c => { const r = project(segPts(c.e), D.x, D.z, c.hint); Object.assign(c, r); c.hint = r.i; });
  // 일반도로 교차로 안: 벽 · 갈림 코 없음. 한 출구 위(시작에서 6m 넘게)에 있고 다른 출구와 3m 넘게 떨어지면 확정. 교차로를 벗어나면 가장 가까운 출구로
  if(m.city){
    D.candsT = (D.candsT || 0) + dt;
    const inside = cs.filter(c => Math.abs(c.d) <= c.e.half && c.s > 6);
    if(inside.length === 1 && cs.every(o => o === inside[0] || Math.abs(o.d) - o.e.half > DRV.commitGap)) commit(inside[0]);
    else if(D.candsT > 8 || (!D.chosen.length && (D.z < CZ.far - 4 || D.x > m.edgeX + 14 || D.x < -m.edgeX - m.lanes*LANE - 14))) commit(cs.slice().sort((a, b) => Math.abs(a.d) - Math.abs(b.d))[0]);   // 8초 넘게 어느 출구에도 안 올라탐 → 가장 가까운 출구
    return;
  }
  const L = cs[0], R = cs[cs.length-1], lim = c => c.e.half - DRV.carW/2 + .3;   // 출구는 왼쪽 → 오른쪽 순서
  if(L.d < -lim(L)) wall(L, -1, lim(L), dt);
  else if(R.d > lim(R)) wall(R, 1, lim(R), dt);
  const inside = cs.filter(c => Math.abs(c.d) <= c.e.half);
  if(inside.length === 1){
    const c = inside[0];
    if(cs.every(o => o === c || Math.abs(o.d) - o.e.half > DRV.commitGap)) commit(c);
  } else if(!inside.length && L.d >= -L.e.half && R.d <= R.e.half){ D.crashWith = '갈림 코'; endRun('crash'); }
}
function commit(c){
  D.candsT = 0;
  D.seg = c.e; D.hint = c.hint; D.segS = c.s; D.cands = null; D.chosen.push(c.e); D.exitName = exitName(c.e);
  if(c.e !== S.route.leaf.path[D.chosen.length - 1]) endRun('wrong');
}
function stepSeg(dt){
  const e = D.seg, P = segPts(e), r = project(P, D.x, D.z, D.hint), lim = e.half - DRV.carW/2 + .3 + (S.map.city ? 1.75 : 0);   // 일반도로: 옆 차로까지 여유
  D.hint = r.i; D.segS = r.s;
  if(Math.abs(r.d) > lim) wall(r, Math.sign(r.d), lim, dt);
  if(e.node){ if(r.s >= P.L - .5) D.cands = e.node.exits.map(x => ({e:x, hint:-1})); }
  else if(r.s >= (S.map.city ? CITY_DRV.endAfter : DRV.endAfter)) endRun('ok');
}
function endRun(result){ if(D.result) return; D.result = result; D.endT = D.t + (result === 'wrong' ? DRV.wrongEnd : 0); }
// 다른 차와 겹치면 충돌 상대를 돌려줌 (기록용: 누구와 · 내가 받았나 / 받혔나)
const KIND_NAME = {queue:'정체 줄 차', rear:'옆 차로 뒤차', tail:'내 뒤차', lead:'앞차', amb:'옆 차로 차', bus:'버스', onc:'마주 오는 차'};
function hit(){
  const fx = Math.sin(D.psi), fz = -Math.cos(D.psi);
  for(const o of D.cars){
    const dx = o.x - D.x, dz = o.z - D.z, lon = dx*fx + dz*fz;
    if(Math.abs(lon) < halfL(o) + DRV.carL/2 - .25 && Math.abs(dx*(-fz) + dz*fx) < halfW(o) + DRV.carW/2 - .15) return KIND_NAME[o.kind] + (lon > 1 ? ' · 앞을 받음' : lon < -1 ? ' · 뒤에서 받힘' : ' · 옆');
  }
  if(S.map.city) for(const p of pedsAt(D.t)){
    const dx = p.x - D.x, dz = p.z - D.z, lon = dx*fx + dz*fz;
    if(Math.abs(lon) < DRV.carL/2 + .2 && Math.abs(dx*(-fz) + dz*fx) < DRV.carW/2 + .2) return '보행자';
  }
  return '';
}
// ⑤ 횡단보도: 사람이 건너거나 건너려 할 때(pedBlock) 앞범퍼가 횡단보도에 들어가면 '보행자 양보 안 함' 1번 (들어갈 때마다)
function pedCheck(){
  const cw = S.map.cw, fx = Math.sin(D.psi), fz = -Math.cos(D.psi), xf = D.x + fx*DRV.carL/2, zf = D.z + fz*DRV.carL/2;
  const inBand = xf > cw.x0 - .2 && D.x - DRV.carL/2 < cw.x1 && zf < CZ.near + .5 && zf > CZ.far;
  if(inBand && !D.pedIn && pedBlock(D.t)) D.ped++;
  D.pedIn = inBand;
}

/* ---------- 본선 차로: 기록 (자리 잡은 곳 · 위험 끼어들기) + HUD 경로 다시 계산 ---------- */
function trackLanes(){
  const m = S.map, li = laneOf(m, D.x), hw = DRV.carW/2;
  if(li !== D.lane){ D.enc[D.lane] = true; D.lane = li; if(typeof driveRoute === 'function') driveRoute(li); }   // 떠나는 차로는 끼어들기가 아님
  // 차 옆면이 차로 선을 넘어 옆 차로에 들어가기 시작하는 순간 → 위험 끼어들기 판정 (그 차로 차가 반응해 감속하기 전 값으로)
  const touch = [laneOf(m, D.x - hw), laneOf(m, D.x + hw)].filter(l => l !== li);
  Object.keys(D.enc).forEach(l => { if(!touch.includes(+l)) delete D.enc[l]; });
  // 반응 시간 (D65): 옮길 쪽 옆 차로가 안전해진 순간 → 실제로 옮기기 시작(차 옆면이 선을 넘음)까지. 들어간 그 틈이 열린 순간부터 잼
  const side = S.route.side, next = D.lane + side;
  if(side && !D.moved){ const ok = laneSafe(next); if(ok && !D.safeOn) D.safeSince = D.t; D.safeOn = ok; }
  touch.forEach(l => {
    if(side && !D.moved && l === next){ D.moved = true; D.reactT = D.safeOn ? +(D.t - D.safeSince).toFixed(2) : null;   // 안전하지 않을 때 끼면 빈칸(위험 끼어들기로 잡힘)
      D.blinkUsed = D.blink === side; D.blinkLead = D.blinkUsed ? +(D.t - D.blinkOnAt).toFixed(2) : null; }   // 깜빡이 기록 (D103): 옮기기 시작할 때 켜져 있었나 · 켠 뒤 몇 초 만에
    if(!D.enc[l]){
      D.enc[l] = true;
      // 차로 변경 시작: 차 옆면이 선을 넘기 시작한 순간. 그때 판단 상태(S.G — 어느 HUD든 같은 판단, 보인 건 v2뿐)를 함께
      D.lc = {from:li, to:l, t0:D.t}; D.events.push({t:+D.t.toFixed(2), type:'lcStart', from:li, to:l, gate:S.G ? S.G.gate : '', toward:l === next});
      cutIn(l);
    }
  });
  // 차로 변경 완료: 새 차로 가운데 ±settle에 들어옴 / 되돌아오면 취소
  if(D.lc){
    if(li === D.lc.to && Math.abs(D.x - m.laneX(li)) < DRV.settle){ D.events.push({t:+D.t.toFixed(2), type:'lcDone', from:D.lc.from, to:li, dur:+(D.t - D.lc.t0).toFixed(2)});
      if(D.blink && D.blink === Math.sign(li - D.lc.from)) setBlink(0, true);   // 새 차로에 자리 잡으면 깜빡이 자동 끔 (D103)
      D.lc = null; }
    else if(li === D.lc.from && !touch.includes(D.lc.to)){ D.events.push({t:+D.t.toFixed(2), type:'lcAbort', from:D.lc.from, to:D.lc.to}); D.lc = null; }
  }
  // 목표 차로 중앙 ±1m 안에 들어오면 그곳을 기억, 목표 차로를 벗어나면 지움 → 갈림에서 남은 값이 '자리 잡은 곳'
  if(S.route.leaf.path[0].lanes.includes(li)){ if(D.enterZ === null && Math.abs(D.x - m.laneX(li)) < DRV.settle) D.enterZ = D.z; }
  else D.enterZ = null;
}
// 옆 차로가 지금 옮겨도 안전한가 (반응 시간의 기준, 시뮬레이터가 아는 실제 교통): 옆에 차 없음 · 뒤차는 10m 넘게 떨어지고 3.5초 안에 안 닿음 ·
// 앞차는 4m 넘게 떨어지고 2초 안에 안 닿음. [가정] 우리 HUD '대기' 기준과 같은 값 → 우리 HUD 신호와 맞물려 유리할 수 있음 (설계 7장)
function laneSafe(li){
  return !D.cars.some(c => {
    if(c.lane !== li || c.z < FORK_Z - 5) return false;
    const dz = c.z - D.z, gap = Math.abs(dz) - halfL(c) - DRV.carL/2;
    if(gap < 1) return true;
    if(dz > 0){ const cl = c.v - D.v; return gap < DRV.hudGap || (cl > 0 && gap/cl < DRV.hudTtc); }
    const cl = D.v - c.v; return gap < DRV.gapRisk || (cl > 0 && gap/cl < DRV.ttcRisk);
  });
}
// 옆 차로에 들어가기 시작할 때: 그 차로의 뒤차 · 앞차와 간격 4m 미만이거나 2초 안에 부딪힐 상황이면 위험 끼어들기 [가정]
function cutIn(li){
  if(D.t - (D.lastCut[li] ?? -9) < 1) return;   // 선 위에서 흔들린 것은 1초에 한 번만
  D.lastCut[li] = D.t;
  const by = D.cars.find(c => {
    if(c.lane !== li || c.z < FORK_Z - 5) return false;
    const dz = c.z - D.z, behind = dz >= 0, gap = Math.abs(dz) - halfL(c) - DRV.carL/2, closing = behind ? c.v - D.v : D.v - c.v;
    return gap < DRV.gapRisk || (closing > 0 && gap/closing < DRV.ttcRisk);
  });
  if(by) D.risky++;
  // 앞으로 끼어들기: 그 차로에서 내 뒤 60m 안에 (줄 아닌) 차가 있으면 — 그 차 앞에 들어간 것. 위험 여부와 상관없이 세고, 가장 가까운 차의 간격 · 닿기까지 시간을 남긴다 (2차 가설 '위험한 차로 변경' 지표)
  const behind = D.cars.filter(c => c.lane === li && c.kind !== 'queue' && c.z > D.z && c.z - D.z < 60 && c.z > FORK_Z - 5).map(c => { const gap = c.z - D.z - halfL(c) - DRV.carL/2, cl = c.v - D.v; return {gap, ttc:cl > 0 ? gap/cl : Infinity}; }).sort((a, b) => a.gap - b.gap)[0];
  if(behind){ D.cutAhead++; D.cutAheadGap = D.cutAheadGap === null ? +behind.gap.toFixed(1) : Math.min(D.cutAheadGap, +behind.gap.toFixed(1)); if(behind.ttc < Infinity) D.cutAheadTtc = D.cutAheadTtc === null ? +behind.ttc.toFixed(2) : Math.min(D.cutAheadTtc, +behind.ttc.toFixed(2)); }
  D.events.push({t:+D.t.toFixed(2), type:'cutIn', lane:li, risky:!!by, with:by ? KIND_NAME[by.kind] + (by.z > D.z ? ' (뒤)' : ' (앞)') : '', ahead:!!behind, gap:behind ? +behind.gap.toFixed(1) : null, ttc:behind && behind.ttc < Infinity ? +behind.ttc.toFixed(2) : null});
}

/* ---------- HUD에 줄 값 (hud.js가 읽음) ----------
   우리 HUD: 옮길 쪽 옆 차로의 (줄이 아닌) 차 → S.rearActive · rearGap · rearBlock · threatCar · danger
   현대 HUD: 양쪽 후측방 경고 S.bswL · S.bswR (경로와 상관없이)
   정체 줄: 목표 차로에 줄이 있으면 S.q = {backZ, mergeNear} */
function hudThreat(dt){
  const m = S.map, R = S.route, onMain = !D.seg && !D.cands && !D.result;
  let best = null;
  if(onMain && R.side !== 0){
    const lane = D.lane + R.side;
    D.cars.forEach(c => {
      if(c.kind === 'queue' || c.lane !== lane || c.z < FORK_Z - 5) return;
      const dz = c.z - D.z;   // + = 뒤
      if(dz < -(halfL(c) + 5.7) || dz > 60) return;
      const gap = Math.abs(dz) - halfL(c) - DRV.carL/2, closing = c.v - D.v;
      const block = gap < 1 || (dz > 0 && (gap < DRV.hudGap || (closing > 0 && gap/closing < DRV.hudTtc)));
      if(!best || (block && !best.block) || (block === best.block && Math.abs(dz) < Math.abs(best.dz))) best = {dz, block, c};
    });
  }
  S.rearActive = !!best; S.rearGap = best ? best.dz : 56; S.rearBlock = !!(best && best.block); S.threatCar = best ? best.c : null;
  S.danger += ((S.rearBlock ? 1 : 0) - S.danger)*Math.min(1, dt*6);
  const bsw = side => onMain && D.cars.some(c => {
    if(c.lane !== D.lane + side || c.z < FORK_Z - 5) return false;
    const dz = c.z - D.z, closing = c.v - D.v;
    return (dz > -3 && dz < DRV.bswBack) || (dz > 0 && closing > 0 && (dz - DRV.carL)/closing < DRV.bswTtc);
  });
  S.bswL = bsw(-1); S.bswR = bsw(1);
  S.q = {backZ:null, mergeNear:false};
  if(onMain && D.jamLanes.includes(laneOf(m, R.tx))){
    const zs = D.cars.filter(c => c.kind === 'queue' && Math.abs(c.x - R.tx) < 1 && c.z > qFrontOf(m) - 4).map(c => c.z).sort((a, b) => b - a);
    if(zs.length) S.q.backZ = zs[0];
    for(let i=0;i<zs.length-1;i++) if(zs[i] - zs[i+1] > Q_MERGE && Math.abs((zs[i] + zs[i+1])/2 - D.z) < 13) S.q.mergeNear = true;
  }
}
