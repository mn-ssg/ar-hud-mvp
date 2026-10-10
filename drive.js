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
  if(e.node){ pts.push(...sampleCurve(e.curve, off)); pts.push(...sampleCurve(e.node.exits[sub % e.node.exits.length].vis)); }
  else pts.push(...sampleCurve(e.vis, off));
  return m._lp[key] = resample(pts, 1);
}

/* ---------- 차량: 정체 줄은 scene.js queueCars(브레이크등 켬, 두 차로 줄을 위해 14대 더), 달리는 차는 여기서 ---------- */
for(let i=0;i<14;i++) queueCars.push(makeCar(QTYPES[(i+5)%QTYPES.length], QCOLORS[(i+3)%QCOLORS.length], true));
const FTYPES = ['sedan','suv','hatch','sedan','suv','truck','sedan','hatch','suv','sedan','hatch','sedan'];
const FCOLORS = ['#f4f5f4','#2a3442','#a4a9af','#7d2222','#f4f5f4','#1c1e22','#c9ccd0','#233b5c','#5b6169','#f4f5f4','#2e3440','#a4a9af'];
const flowCars = FTYPES.map((t, i) => makeCar(t, FCOLORS[i], false));
// 브레이크등: 미등 재질 ↔ 브레이크 재질 바꿔 끼우기 (앞차 급정거)
const setBrake = (mesh, on) => mesh.traverse(o => { if(o.material === carMats.tail || o.material === carMats.brake) o.material = on ? carMats.brake : carMats.tail; });
// 교통 번호(seed)로 같은 난수 → 두 HUD 블록이 같은 교통
const mulberry32 = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };

/* ---------- 상태 ---------- */
const KEYS = {left:false, right:false, up:false, down:false};
const D = {x:0, z:0, psi:0, v:SPEED, steer:0, wheel:0, t:0, frozen:false, cars:[], jamLanes:[], cfg:null};

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
    if(lon > 0 && Math.abs(lat) < w){ const g = lon - DRV.carL; if(g < gap){ gap = g; v = ov; car = o; me = !o; } }
  };
  D.cars.forEach(o => { if(o !== self) see(o.x, o.z, o.v, o, carLat); });
  if(meLat) see(D.x, D.z, D.v, null, meLat);
  return {gap, v, car, me};
}

/* ---------- 한 판 준비 (main.js startDrive가 경로를 정한 뒤 부름) ----------
   cfg = {map, leaf, lane, type:'rear'|'jam', jam, seed}. 교통은 seed 난수로 → 같은 seed면 목적지가 달라도 같은 교통 (D61) */
function driveReset(cfg){
  const m = cfg.map, p0 = path.curve.getPointAt(clamp(path.sStart/path.L));
  Object.assign(D, {x:m.laneX(cfg.lane), z:p0.z, psi:0, v:DRV.cruise, steer:0, wheel:0, t:0, frozen:false, cfg,
    seg:null, hint:-1, segS:0, cands:null, lane:cfg.lane, chosen:[], exitName:'',
    enterZ:null, changeDist:null, risky:0, enc:{}, lastCut:{}, offroad:0, lastTouch:-9, followT:0, crashWith:'', result:null, endT:0,
    safeOn:false, safeSince:0, reactT:null, moved:false});
  Object.keys(KEYS).forEach(k => KEYS[k] = false);
  queueCars.forEach(c => c.visible = false); flowCars.forEach(c => { c.visible = false; setBrake(c, false); }); otherCar.visible = false;
  D.cars = [];
  const R = mulberry32(cfg.seed ?? Math.floor(Math.random()*1e9)), rr = ([a, b]) => a + R()*(b - a), ri = ([a, b]) => a + Math.floor(R()*(b - a + 1));
  let fi = 0, qi = 0;
  const add = (mesh, lane, z, v, kind, o = {}) => {
    const c = {mesh, lane, kind, v, v0:v, base:v, T:1.1, s0:2.5, seenV:v, P:lanePath(m, lane, Math.floor(R()*2)), s:LANE_START - z, ...o};
    D.cars.push(c); mesh.visible = true; return c;
  };
  const tl = S.route.tl, lanes = [...Array(m.lanes).keys()];
  // 내 차로 앞차는 늘 있음. 판마다 둘 중 하나: 앞차가 급정거해 완전히 섬(내 뒤는 비어 있음) / 뒤에 바짝 붙어 오는 차(급하게 서면 받힘, 뒤차 판만)
  // — 둘을 한 판에 같이 두면 세게 밟아도 약하게 밟아도 부딪혀 피할 길이 없음
  cfg.brake = R() < HARD.brakeAhead;
  const lead = add(flowCars[fi++], cfg.lane, D.z - DRV.carL - rr(HARD.lead), DRV.cruise, 'lead');
  lead.brakeAt = cfg.brake ? rr(HARD.brakeAt) : null; lead.phase = 0;
  // 바짝 붙은 뒤차는 뒤차 판에만 — 정체 판은 줄 때문에 누구나 크게 줄여야 해서, 뒤차까지 붙으면 제대로 줄여도 받힘(실제론 뒤차도 정체를 보고 같이 줄임)
  if(!cfg.brake && cfg.type === 'rear') add(flowCars[fi++], cfg.lane, D.z + rr(HARD.tail), DRV.cruise + .4, 'tail', {T:.5, s0:2, v0:DRV.cruise + 1.5});
  // 뒤차 판: 목표 차로에 3~5대 무리가 바짝 붙어(차간 0.4초) 빠르게 온다. 첫 차가 1.5~5초에 내 옆
  cfg.rearN = 0;
  if(cfg.type === 'rear'){
    cfg.rearN = ri(HARD.rearN);
    const dv = rr(HARD.rearDv)/3.6;
    let z = D.z + dv*rr(HARD.rearArrive);
    for(let k=0;k<cfg.rearN;k++){ add(flowCars[fi++], tl, z, DRV.cruise + dv, 'rear', {T:.4, s0:2}); z += DRV.carL + rr(HARD.rearGap); }
  }
  // 정체 판: 목표 차로 뒤에서 줄 끝으로 달려와 붙는 차 2~3대 — 일찍 옮기려 해도 이 차들 사이 틈을 찾아야 함
  if(cfg.type === 'jam'){
    const n = ri(HARD.joinN), dv = rr(HARD.joinDv)/3.6;
    let z = D.z + dv*rr(HARD.rearArrive);
    for(let k=0;k<n;k++){ add(flowCars[fi++], tl, z, DRV.cruise + dv, 'rear', {T:.4, s0:2}); z += DRV.carL + rr(HARD.rearGap); }
  }
  // 정체 판: 목표 출구로 가는 차로 모두에 줄 (줄 끝 = 시연과 같은 JAM_LV). 촘촘하고(몇 대마다 넓은 틈) 멈췄다 가며, 일부는 끼어들면 틈을 막는다
  D.jamLanes = cfg.type === 'jam' ? S.route.leaf.path[0].lanes.slice() : [];
  // 같은 줄은 같은 기본 속도 — 차마다 다르면 빠른 차가 앞 틈을 영구히 메워 버림. 틈은 물결 따라 열렸다 닫혔다만 함
  D.qBase = {};
  D.jamLanes.forEach(lane => {
    const base = D.qBase[lane] = 3.5 + R();
    let k = 0, wideAt = ri(HARD.qWideEvery);
    for(let z = Q_FRONT - R()*4; z <= JAM_LV[cfg.jam].back && qi < queueCars.length; k++){
      add(queueCars[qi++], lane, z, base, 'queue', {T:.5, s0:1.5, mean:R() < HARD.qMean});
      if(k + 1 === wideAt){ z += rr(HARD.qWideGap); wideAt += ri(HARD.qWideEvery); } else z += rr(HARD.qGap);   // 몇 대마다 넓은 틈
    }
  });
  // 그 밖의 차: 시작 · 목표 · 정체 차로가 아닌 차로 앞쪽 1~3대
  const others = lanes.filter(l => l !== cfg.lane && l !== tl && !D.jamLanes.includes(l)), nAmb = ri([1, 3]);
  for(let k=0; k<nAmb && others.length && fi < flowCars.length; k++) add(flowCars[fi++], others[Math.floor(R()*others.length)], D.z - 30 - k*45 - R()*25, (61 + R()*11)/3.6, 'amb');
  placeCars();
  hudThreat(0);
}
function driveClear(){ D.cars.forEach(c => c.mesh.visible = false); D.cars = []; }

function placeCars(){
  D.cars.forEach(c => {
    const [x, z, tx, tz] = pathAt(c.P, c.s); c.x = x; c.z = z; c.tx = tx; c.tz = tz;
    c.mesh.position.set(x, 0, z); c.mesh.rotation.y = Math.atan2(-tx, -tz);
  });
}

/* ---------- 매 프레임 ---------- */
function driveStep(dt){
  D.t += dt;
  stepPlayer(dt);
  stepCars(dt);
  if(!D.result){
    if(!D.seg && !D.cands) stepMain(dt);
    else if(D.cands) stepCands(dt);
    else stepSeg(dt);
    if(!D.result){ const h = hit(); if(h){ D.crashWith = h; endRun('crash'); } }
    if(!D.result && D.t > DRV.timeout) endRun('timeout');
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
    a = D.v > DRV.cruise + .3 ? -DRV.coastDown : idm(D.v, DRV.cruise, Infinity, 0, DRV.coastUp);
    const ld = leaderOf(D.x, D.z, fx, fz, null, 0, DRV.carW + Math.min(.55, D.v*.03));
    if(ld.gap < Infinity) a = Math.min(a, idm(D.v, DRV.cruise, ld.gap, D.v - ld.v, DRV.coastUp));
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
    let v0 = c.v0, T = c.T, s0 = c.s0;
    if(c.kind === 'queue'){
      if(c.z < FORK_Z - 12){ v0 = DRV.cruise; T = 1.1; s0 = 2.5; }                                   // 갈림을 지나면 빠져나감
      else {
        v0 = Math.max(.3, c.base*(1 + HARD.qWave*Math.sin(D.t*.9 + c.z*.12)));                      // 멈췄다 가는 물결
        // 끼어들려 하면 앞차에 바짝 붙어 틈을 막음 — 내가 차로를 넘어오기 시작했을 때만, HARD.qMeanFor초 버티면 양보
        if(c.mean && cuttingAhead(c)){ c.meanT = (c.meanT || 0) + dt; if(c.meanT > HARD.qMeanFor) c.mean = false; else { v0 = c.base*2.4; T = .2; s0 = 1; } }
      }
    }
    // 내 차가 앞차면: 내 속도 변화를 HARD.aiLag초 늦게 알아채고, 최대 HARD.aiDec까지만 밟음
    c.seenV += (D.v - c.seenV)*Math.min(1, dt/HARD.aiLag);
    const a = idm(c.v, v0, ld.gap, c.v - (ld.me ? c.seenV : ld.v), 1.5, T, s0);
    c.v = Math.max(0, c.v + Math.max(ld.me ? -HARD.aiDec : -9, a)*dt);
    c.s += c.v*dt;
  });
  placeCars();
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
  const m = S.map, lim = m.half + .4 - DRV.carW/2;   // 가드레일(포장 반폭 + 0.4m)
  if(Math.abs(D.x) > lim) wall({d:D.x, tx:0, tz:-1}, Math.sign(D.x), lim, dt);
  trackLanes();
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
  const cs = D.cands;
  cs.forEach(c => { const r = project(segPts(c.e), D.x, D.z, c.hint); Object.assign(c, r); c.hint = r.i; });
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
  D.seg = c.e; D.hint = c.hint; D.segS = c.s; D.cands = null; D.chosen.push(c.e); D.exitName = exitName(c.e);
  if(c.e !== S.route.leaf.path[D.chosen.length - 1]) endRun('wrong');
}
function stepSeg(dt){
  const e = D.seg, P = segPts(e), r = project(P, D.x, D.z, D.hint), lim = e.half - DRV.carW/2 + .3;
  D.hint = r.i; D.segS = r.s;
  if(Math.abs(r.d) > lim) wall(r, Math.sign(r.d), lim, dt);
  if(e.node){ if(r.s >= P.L - .5) D.cands = e.node.exits.map(x => ({e:x, hint:-1})); }
  else if(r.s >= DRV.endAfter) endRun('ok');
}
function endRun(result){ if(D.result) return; D.result = result; D.endT = D.t + (result === 'wrong' ? DRV.wrongEnd : 0); }
// 다른 차와 겹치면 충돌 상대를 돌려줌 (기록용: 누구와 · 내가 받았나 / 받혔나)
const KIND_NAME = {queue:'정체 줄 차', rear:'옆 차로 뒤차', tail:'내 뒤차', lead:'앞차', amb:'옆 차로 차'};
function hit(){
  const fx = Math.sin(D.psi), fz = -Math.cos(D.psi);
  for(const o of D.cars){
    const dx = o.x - D.x, dz = o.z - D.z, lon = dx*fx + dz*fz;
    if(Math.abs(lon) < DRV.carL - .25 && Math.abs(dx*(-fz) + dz*fx) < DRV.carW - .15) return KIND_NAME[o.kind] + (lon > 1 ? ' · 앞을 받음' : lon < -1 ? ' · 뒤에서 받힘' : ' · 옆');
  }
  return '';
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
    if(side && !D.moved && l === next){ D.moved = true; D.reactT = D.safeOn ? +(D.t - D.safeSince).toFixed(2) : null; }   // 안전하지 않을 때 끼면 빈칸(위험 끼어들기로 잡힘)
    if(!D.enc[l]){ D.enc[l] = true; cutIn(l); }
  });
  // 목표 차로 중앙 ±1m 안에 들어오면 그곳을 기억, 목표 차로를 벗어나면 지움 → 갈림에서 남은 값이 '자리 잡은 곳'
  if(S.route.leaf.path[0].lanes.includes(li)){ if(D.enterZ === null && Math.abs(D.x - m.laneX(li)) < DRV.settle) D.enterZ = D.z; }
  else D.enterZ = null;
}
// 옆 차로가 지금 옮겨도 안전한가 (반응 시간의 기준, 시뮬레이터가 아는 실제 교통): 옆에 차 없음 · 뒤차는 10m 넘게 떨어지고 3.5초 안에 안 닿음 ·
// 앞차는 4m 넘게 떨어지고 2초 안에 안 닿음. [가정] 우리 HUD '대기' 기준과 같은 값 → 우리 HUD 신호와 맞물려 유리할 수 있음 (설계 7장)
function laneSafe(li){
  return !D.cars.some(c => {
    if(c.lane !== li || c.z < FORK_Z - 5) return false;
    const dz = c.z - D.z, gap = Math.abs(dz) - DRV.carL;
    if(Math.abs(dz) < DRV.carL + 1) return true;
    if(dz > 0){ const cl = c.v - D.v; return gap < DRV.hudGap || (cl > 0 && gap/cl < DRV.hudTtc); }
    const cl = D.v - c.v; return gap < DRV.gapRisk || (cl > 0 && gap/cl < DRV.ttcRisk);
  });
}
// 옆 차로에 들어가기 시작할 때: 그 차로의 뒤차 · 앞차와 간격 4m 미만이거나 2초 안에 부딪힐 상황이면 위험 끼어들기 [가정]
function cutIn(li){
  if(D.t - (D.lastCut[li] ?? -9) < 1) return;   // 선 위에서 흔들린 것은 1초에 한 번만
  D.lastCut[li] = D.t;
  const risky = D.cars.some(c => {
    if(c.lane !== li || c.z < FORK_Z - 5) return false;
    const dz = c.z - D.z, behind = dz >= 0, gap = Math.abs(dz) - DRV.carL, closing = behind ? c.v - D.v : D.v - c.v;
    return gap < DRV.gapRisk || (closing > 0 && gap/closing < DRV.ttcRisk);
  });
  if(risky) D.risky++;
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
      if(dz < -8 || dz > 60) return;
      const gap = dz - DRV.carL, closing = c.v - D.v;
      const block = Math.abs(dz) < DRV.carL + 1 || (dz > 0 && (gap < DRV.hudGap || (closing > 0 && gap/closing < DRV.hudTtc)));
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
    const zs = D.cars.filter(c => c.kind === 'queue' && Math.abs(c.x - R.tx) < 1 && c.z > Q_FRONT - 4).map(c => c.z).sort((a, b) => b - a);
    if(zs.length) S.q.backZ = zs[0];
    for(let i=0;i<zs.length-1;i++) if(zs[i] - zs[i+1] > Q_MERGE && Math.abs((zs[i] + zs[i+1])/2 - D.z) < 13) S.q.mergeNear = true;
  }
}
