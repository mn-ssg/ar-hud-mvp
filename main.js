/* ============================================================
   main.js — 상태 · 맵 · 경로 · 정체 대기열 · 매 프레임 루프(시연 · 주행 테스트) · 시연 흐름 · 이벤트
   config.js, maps.js, scene.js, cabin.js, hud.js, drive.js 다음에 로드. 주행 테스트 진행 · 기록은 session.js
   ============================================================ */

/* ---------- 경로 ----------
   시작 차로 → (옮길 차로) → 첫 갈림 → 목적지. 갈림 뒤는 maps.js makeRoute()의 after(내 차로 선) */
function buildPath(R, jam){
  const x0 = R.x0, tx = R.tx, m = R.m;
  let pts, mergeZ = -128;
  if(m.city){
    // 일반도로 (D69): 맵마다 정한 구간(laneChange)에서 옮김 — ④는 좌회전 줄 뒤 · 백색실선 전, ⑤는 정류장 버스를 지난 뒤 · 백색실선 전
    const [za, zb] = m.laneChange;
    pts = tx !== x0 ? [V(x0,40), V(x0,0), V(x0,za+40), V(x0,za), V((x0+tx)/2,(za+zb)/2), V(tx,zb), V(tx,zb-12), V(tx,-222)] : [V(x0,40), V(x0,0), V(x0,-100), V(x0,-222)];
  } else if(jam > 0 && tx !== x0){
    // 정체 시: 대기열 뒤끝(back)보다 더 뒤(양의 z)에서 합류를 끝낸다 → 줄 맨 뒤에 붙음(관통 없음)
    const mEnd = jamBackOf(m, jam) + 20, mStart = Math.min(0, mEnd + 50);
    mergeZ = mStart;
    pts = [V(x0,40), V(x0,mStart), V((x0+tx)/2,(mStart+mEnd)/2), V(tx,mEnd), V(tx,-218)];
  } else {
    pts = [V(x0,40),V(x0,0),V(x0,-100),V(x0,-128),V((x0+tx)/2,-170),V(tx,-203),V(tx,-218)];
  }
  const curve = curveOf(pts.concat(R.after), 1000), L = curve.getLength();
  // 갈림마다 경로 위 거리(s): 첫 갈림은 z = FORK_Z를 지나는 곳, 다음 갈림은 갈림 점에 가장 가까운 곳
  const samples = []; for(let s=0; s<=L; s+=1) samples.push(curve.getPointAt(s/L));
  const nodeS = R.nodes.map((n, i) => {
    let best = 0, bd = Infinity;
    samples.forEach((q, s) => { const d = i === 0 ? Math.abs(q.z - FORK_Z) : Math.hypot(q.x - n.pt[0], q.z - n.pt[1]); if(d < bd){ bd = d; best = s; } });
    return best;
  });
  const cwI = m.cw ? samples.findIndex(q => q.x >= m.cw.x0 && q.z < FORK_Z) : -1;   // ⑤ 경로가 횡단보도에 닿는 곳(s)
  // 갈림마다 '출구 확정' 지점(s) — 주행 테스트 drive.js stepCands와 같은 기준: 경로 점이 경로의 출구 포장 위에만 있고
  // 다른 출구 포장에서 commitGap(3m) 넘게 떨어진 첫 곳 (일반도로는 출구 시작에서 6m 넘게 들어간 뒤). 시연의 안내 단계가 이걸 씀 (2026-10-29)
  const commitS = R.nodes.map((n, i) => {
    const mine = R.leaf.path[i], sibs = i === 0 ? m.exits : R.leaf.path[i-1].node.exits, hint = sibs.map(() => -1);
    for(let s = nodeS[i]; s < samples.length; s++){
      const q = samples[s]; let ok = true;
      sibs.forEach((e, k) => {
        const r = project(segPts(e), q.x, q.z, hint[k]); hint[k] = r.i;
        if(e === mine){ if(Math.abs(r.d) > e.half || (m.city && r.s <= 6)) ok = false; }
        else if(Math.abs(r.d) - e.half <= DRV.commitGap) ok = false;
      });
      if(ok) return s;
    }
    return L;
  });
  // sStart: 일반도로는 60m 앞에서 출발(50km/h라 접근이 길어져서). P: 주행 테스트에서 내 차를 경로 위로 옮겨 잴 때
  return {curve, L, sStart:m.city ? 100 : 40, mergeZ, nodeS, commitS, cwS:cwI >= 0 ? cwI : null, P:resample(samples.map(q => [q.x, q.z]), 1)};
}
/* 다음 갈림: 번호 i · 남은 거리 d(경로 위 m) · phase(guide.js navPhase) · 진행 단계 st(1 접근 · 2 지선 구분 · 3 차로 옮김 · 4 진입 · 5 도착)
   단계는 '출구를 실제로 확정했는가'로 넘긴다 — 주행 테스트는 drive.js가 확정한 출구(D.chosen), 시연은 경로 위 확정 지점(commitS).
   v1은 거리만 봐서(d ≤ 25 → 진입) 현대 HUD가 회전 전에 직진 화살표를 그렸다 (2026-10-29 재현 · tests/drive-regression.js) */
function navCtx(s){
  const committed = S.drive ? D.chosen.length : path.commitS.filter(c => s >= c).length;
  const N = navPhase(path.nodeS, s, committed, S.drive && D.result === 'wrong');
  N.node = S.route.nodes[N.i]; N.st = stageOf(N);
  return N;
}

/* ---------- 상태 ---------- */
// testing = 주행 테스트 진행 중(결과 카드 · 쉬는 화면 포함, 설정 잠금) · drive = 내 차를 키보드로 모는 중 (drive.js D)
const S = {mode:'ar', map:null, route:null, target:0, startLane:1, running:false, paused:false, s:40, testing:false, drive:false,
  fill:0, danger:0, car:null, jam:0, speedFactor:1, q:null, jamHoldT:0,
  rearGap:56, rearActive:false, rearBlock:false, threatCar:null, bswL:false, bswR:false, demoMap:'ICR', demoTarget:1, demoJam:0, light:'day',
  cityT:0, sigT:0, pedPlan:null, cityLim:Infinity};   // 일반도로(D69): 판 시작부터 시간 · 좌회전 화살표 켜지는 시각 · 보행자 계획 · 시연에서 설 곳(s)
let path = null;
const pick = a => a[Math.floor(Math.random()*a.length)];
const mapLabel = id => { const m = mapById(id) || MAPS_OFF.find(o => o.id === id); return m ? `${m.no} ${m.name}` : '-'; };   // 뺀 맵(D68)은 예전 기록용

function loadMap(m){
  if(S.map === m) return;
  S.map = m; showMap(m); buildNavLanes(m); setLimitSign(m);
  $$('#jamSeg button').forEach(b => b.disabled = !!m.city);   // 일반도로는 상황이 맵에 딸려 있음(정체 고르기 없음)
}
// 시연에서 기본 목적지: 차로를 옮겨야 하는 마지막 목적지(뒤차가 지나가는 상황을 볼 수 있게)
const defaultLeaf = m => { const c = leafIdxs(m, (l, i) => (!m.city || l.quiz) && makeRoute(m, i, m.start[0]).side !== 0); return c.length ? c[c.length-1] : 0; };   // 일반도로: 테스트 목적지(골목 · 우회전)

function setTarget(i, lane){
  // 시연은 정체 시 줄 뒤로 합류하는 경로, 주행 테스트는 경로를 HUD에만 쓰므로 정체 경로 없음
  S.target = i; S.startLane = lane ?? S.map.start[0];
  S.route = makeRoute(S.map, i, S.startLane);
  path = buildPath(S.route, S.drive ? 0 : S.jam); S.s = path.sStart;
  S.fill = 0; S.danger = 0; S.jamHoldT = 0;
  S.car = null; otherCar.visible = false;
  resetHud(); resetGuide();
}
// 주간 · 야간: 3D 장면(scene.js) + HUD 밤 밝기(hud.css .night) + 페이지 다크 테마(styles.css [data-light])
function setLight(l){
  S.light = l; const night = l === 'night';
  document.documentElement.dataset.light = l;
  $('#cab').classList.toggle('night', night);
  setSceneLight(night); setCabinLight(night);
  $('#glow feGaussianBlur').setAttribute('stdDeviation', night ? 1.1 : 2.4);   // 밤엔 빛 번짐을 줄임 (현대 HUD)
  $('#ahGlow feGaussianBlur').setAttribute('stdDeviation', night ? .9 : 1.6);   // 우리 HUD
  $$('#lightSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.light === l)));
}
// HUD 두 가지: 'nav' 현대 HUD(대조군) · 'ar' 우리 HUD (ourhud.js). 'off' = 연습 주행(HUD 없음)
// HUD_VER는 기록 식별용 내부 값(엑셀 'HUD 버전' 칸) — 화면에 고르는 버전은 없다. 예전 기록은 이 칸이 비어 있음
const HUD_VER = {nav:'현대 3.3', ar:'우리 2026-10-29'};
function setMode(m){
  S.mode = m;
  $('#arHud').style.display = m==='ar' ? '' : 'none';
  $('#navHud').style.display = m==='nav' ? '' : 'none';
  $$('#modeSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode===m)));
}
// 연구자 설정의 '시연': 고른 맵 · 목적지 · 상황 (테스트가 덮어쓰지 않음)
function renderScenario(){
  const m = mapById(S.demoMap);
  $$('#mapSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === S.demoMap)));
  $('#mapName').textContent = m.name;
  const seg = $('#targetSeg');
  seg.hidden = $('#jamSeg').hidden = !!m.city;   // 일반도로(④ 좌회전 · ⑤ 우회전)는 맵이 곧 상황 — 목적지 · 정체 고르기 없음 (D71)
  if(seg.dataset.map !== m.id){
    seg.dataset.map = m.id; seg.innerHTML = '';
    m.leaves.forEach((l, i) => {
      const b = document.createElement('button'); b.dataset.t = i; b.textContent = l.label;
      b.onclick = () => { if(stopDemo()){ S.demoTarget = i; prepDemo(); update(1); renderStatus(); } };
      seg.appendChild(b);
    });
  }
  $$('#targetSeg button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.t === S.demoTarget)));
  $$('#jamSeg button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.j === S.demoJam)));
}
// 시연 중에 시연 상황을 바꾸면 시연을 멈추고 바로 바꾼다 (주행 테스트 중에는 잠금)
function stopDemo(){
  if(S.testing) return false;
  if(S.running){ S.running = false; S.paused = false; $('#pauseBtn').textContent = '일시정지'; }
  return true;
}
function prepDemo(){
  const m = mapById(S.demoMap);
  loadMap(m); renderScenario();
  S.jam = m.city ? (m.queue ? 1 : 0) : S.demoJam; setTarget(S.demoTarget);
  // 일반도로 시연: 좌회전 화살표는 17초에 켜짐(줄 뒤에서 몇 초 기다림), ⑤ 보행자 3명이 내 차가 닿을 무렵 건넘
  S.cityT = 0; S.sigT = 17;
  S.pedPlan = m.cw ? [{x:17.2, dir:1, v:1.35, t0:11.5}, {x:18.8, dir:1, v:1.5, t0:13}, {x:18, dir:-1, v:1.5, t0:1}] : null;
  cityFrame(0);
}

/* ---------- 화면 흐름 (2026-10-29) ----------
   'home' 처음 카드(주행 테스트 · 연습 · 시연) / 'demo' 시연(위 막대 · 연구자 설정) / 'drive' 연습 · 주행 테스트(운전 화면만, 위 막대 · 설정 숨김) */
function setScreen(sc){
  $('#app').dataset.screen = sc;
  $('#pauseBtn').hidden = $('#homeBtn').hidden = sc !== 'demo';
  renderStatus();
}
function renderStatus(){
  const sc = $('#app').dataset.screen;
  $('#statusLine').textContent = sc === 'demo' ? `시연 · ${mapLabel(S.demoMap)} · ${modeName(S.mode)} · ${S.light === 'night' ? '야간' : '주간'}` : '';
}
function openSetup(open){ $('#setup').hidden = !open; $('#setupBtn').setAttribute('aria-expanded', String(open)); }
function goHome(){
  if(S.testing) return;
  stopDemo(); $('#sess').hidden = true; $('#intro').hidden = false; $('#drawer').classList.remove('open');
  setScreen('home'); prepDemo(); update(1);
}

/* ---------- 정체 대기열 ----------
   줄이 분기점 쪽으로 천천히 빠진다(qShift). 카메라는 update()의 하드 클램프로
   '맨 뒤차 뒤'에 고정돼 줄을 따라 서행할 뿐 절대 통과하지 않는다. */
let qShift = 0; // 대기열 누적 전진량(주행마다 0)
function tailZ(){ const b = S.jam > 0 ? jamBackOf(S.map, S.jam) : null; return b !== null ? b - qShift : null; } // 현재 맨 뒤차 z
function updateQueue(p, dt){
  const m = S.map, back0 = S.jam > 0 ? jamBackOf(m, S.jam) : null, QF = qFrontOf(m);
  if(back0 === null || !S.running){ queueCars.forEach(c => c.visible = false); return {backZ:null, mergeNear:false}; }
  // 정체 서서히 해소. 일반도로 좌회전 줄은 화살표가 켜져야 움직이고, 정지선을 지난 차는 좌회전 길을 따라 꺾어 나감
  if(!S.paused && (!m.city || sigOf('L', S.cityT) === 'green')) qShift += 6*dt;
  const tx = S.route.tx, t = performance.now()/1000, back = back0 - qShift;
  const lanes = m.city ? m.queue.lanes : [laneOf(m, tx)], per = Math.floor(queueCars.length/lanes.length);   // 일반도로: 좌회전 차로들
  const n = Math.min(per, Math.max(1, Math.round((back0 - QF)/Q_SPACE)));
  const zs = [];
  for(let idx=0;idx<queueCars.length;idx++){
    const c = queueCars[idx], k = Math.floor(idx/lanes.length), lane = lanes[idx % lanes.length], x = m.laneX(lane);
    if(k >= n){ c.visible = false; continue; }
    const z = back - k*Q_SPACE + (m.city ? 0 : Q_WAVE*Math.sin(t*1.4 + k*0.7)); // 늘어선 줄 + 서행 물결
    if(z < QF - 4){
      if(!m.city || LANE_START - z > LANE_START - FORK_Z + 150){ c.visible = false; continue; } // 분기점 지난 차는 빠져나감 (일반도로: 꺾은 뒤 멀리 가서 사라짐)
      const [px, pz, ptx, ptz] = pathAt(lanePath(m, lane, idx % 2), LANE_START - z);       // 일반도로: 꺾어 나감
      c.visible = true; c.position.set(px, 0, pz); c.rotation.y = Math.atan2(-ptx, -ptz); continue;
    }
    if(Math.abs(x - tx) < .1) zs.push(z);
    if(Math.abs(x - p.x) < 1.4 && Math.abs(z - p.z) < 7){ c.visible = false; continue; } // 안전망: 카메라 클리핑 방지
    c.visible = true; c.position.set(x, 0, z); c.rotation.y = 0;
  }
  const backZ = zs.length ? Math.max(...zs) : null;
  let mergeNear = false;
  for(let i=0;i<zs.length-1;i++){ if(zs[i] - zs[i+1] > Q_MERGE){ const mz=(zs[i]+zs[i+1])/2; if(Math.abs(mz - p.z) < 13) mergeNear = true; } }
  return {backZ, mergeNear };
}

/* ---------- 핸들 ----------
   곡률을 바로 쓰면 경로 제어점마다 각도가 튀어서, 1초 앞 지점을 겨누는 방식(pure pursuit)으로 부드럽게.
   시연용. 주행 테스트는 참가자가 돌린 앞바퀴 각을 그대로(updateDrive). 3D 핸들은 cabin.js */
let steer = 0;
function updateWheel(p, f, dt){
  const q = path.curve.getPointAt(clamp((S.s + STEER_LOOK)/path.L));
  const dx = q.x - p.x, dz = q.z - p.z, sinA = (f.x*dz - f.z*dx)/(Math.hypot(dx,dz)||1); // + = 오른쪽
  const deg = Math.atan(2*WHEELBASE*sinA/STEER_LOOK)*STEER_RATIO*STEER_GAIN*180/Math.PI;
  steer += (deg - steer)*Math.min(1, dt*4);
}

/* ---------- 안내 판단 (guide.js) ----------
   내 차 자세(EGO)와 실제 차(시연: 옆 차로 뒤차 · 정체 줄 / 주행: D.cars)로 매 프레임 S.G를 만든다.
   우리 HUD가 그리고, 주행 테스트에서는 어느 HUD든 같은 판단을 기록한다(현대 HUD엔 보이지 않음 — 비교용 잠재 상태).
   미러(mirrors.js)도 같은 EGO · 같은 차를 쓴다 → HUD에 그린 차 = 판단에 쓴 차 = 미러에 보이는 차 */
const EGO = {x:0, z:0, psi:0, v:0, halfL:DRV.carL/2};
const GS = {gate:makeGate(), needWas:false, doneAt:-9, hazard:null};
function resetGuide(){ GS.gate = makeGate(); GS.needWas = false; GS.doneAt = -9; GS.hazard = null; S.G = null; }
function setEgo(x, z, psi, v){ EGO.x = x; EGO.z = z; EGO.psi = psi; EGO.v = v; }
// 판단에 쓸 차 목록 {x, z, v, halfL, lane, kind, ref(3D 차)}. 본선 위(갈림 앞)만 차로 번호가 뜻이 있다
function trafficList(){
  const m = S.map, out = [];
  if(S.drive) D.cars.forEach(c => { if(c.kind !== 'onc' && c.z > FORK_Z - 5) out.push({x:c.x, z:c.z, v:c.v, halfL:halfL(c), lane:laneOf(m, c.x), kind:c.kind, ref:c.mesh}); });
  else {
    if(otherCar.visible) out.push({x:otherCar.position.x, z:otherCar.position.z, v:EGO.v + 13, halfL:CAR_TYPES.sedan.L/2, lane:laneOf(m, otherCar.position.x), kind:'rear', ref:otherCar});
    queueCars.forEach(c => { if(c.visible && c.position.z > FORK_Z - 5) out.push({x:c.position.x, z:c.position.z, v:6, halfL:(c.userData.L || DRV.carL)/2, lane:laneOf(m, c.position.x), kind:'queue', ref:c}); });
  }
  return out;
}
function guideStep(t, C){
  const m = S.map, R = S.route, cars = trafficList(), my = laneOf(m, EGO.x), goal = R.leaf.path[0].lanes;
  const onMain = C.i === 0 && C.phase === 'approach' && EGO.z > FORK_Z;
  const tl = goal.reduce((a, b) => Math.abs(b - my) < Math.abs(a - my) ? b : a), side = Math.sign(tl - my);
  const centered = Math.abs(EGO.x - m.laneX(my)) < DRV.settle;
  const need = onMain && side !== 0 && EGO.z > changeEndOf(m);   // 옮길 차로가 남았고 마감선 전 (고속도로 갈림 25m 앞 · 일반도로 백색실선 시작)
  const next = my + side, A = side ? assessLane(EGO, cars, next) : {safe:true, clear:true, blockers:[], primary:null};
  const prev = GS.gate.state;
  gateStep(GS.gate, t, need, A);
  if(GS.needWas && !need && side === 0 && centered) GS.doneAt = t;          // 목표 차로에 다 들어옴
  if(side === 0 && centered) GS.needWas = false; else if(need) GS.needWas = true;
  // 정체: 목표 차로 줄 끝(가장 뒤 줄 차) · 내 차가 이미 줄 옆인가
  const qz = cars.filter(c => c.kind === 'queue' && goal.includes(c.lane) && (side ? c.lane === next : c.lane === my)).map(c => c.z);
  const tail = qz.length ? Math.max(...qz) : null;
  const jam = tail !== null ? {tail, beside:EGO.z < tail + 2*EGO.halfL + 3} : null;
  const r = GS.gate.reason, dir = r && r.car ? relDir(EGO, r.car) : null;
  // 일반도로: 지금 차로에서 멈춰야 하는 이유 (차로 변경 대기와 다른 신호 — 우리 HUD는 지금 차로를 가로지르는 막대)
  let stop = null;
  if(m.city && C.i === 0){
    const e1 = R.leaf.path[0], dStop = EGO.z - FORK_Z;
    if(dStop > 0 && dStop < 70 && sigOf(e1.key, S.cityT) !== 'green') stop = {kind:'signal', z:FORK_Z};
    if(m.cw && path.cwS !== null && pedBlock(S.cityT) && EGO.x < m.cw.x0 && S.s > path.cwS - 45 && S.s < path.cwS) stop = {kind:'ped'};
  }
  // 대기인데 그쪽으로 넘어가기 시작함(차로 가운데에서 옮길 쪽으로 0.45m 넘게) — 양산차 후측방 경고의 '그쪽 깜빡이를 켜면 깜빡임' 단계에 해당
  const intent = need && GS.gate.state === 'wait' && (EGO.x - m.laneX(my))*side > .45;
  S.G = {need, side, next, tl, my, A, gate:GS.gate.state, since:GS.gate.since, reason:r, dir, jam, stop:stop && (!need || stop.kind === 'ped') ? stop : null, cars, intent, doneAt:GS.doneAt};
  // 기록 (주행 테스트): 판단 상태가 바뀐 시점 · 위험 발생/해소
  if(S.drive && D.events){
    if(GS.gate.state !== prev) D.events.push({t:+t.toFixed(2), type:'gate', from:prev, to:GS.gate.state, rel:r ? r.rel : '', side:dir ? dir.side : 0, shown:S.mode === 'ar'});
    const haz = need && !A.safe;
    if(haz !== !!GS.hazard){ GS.hazard = haz || null; D.events.push({t:+t.toFixed(2), type:haz ? 'hazardOn' : 'hazardOff', lane:next, with:A.primary ? KIND_NAME[A.primary.c.kind] : ''}); }
  }
  return S.G;
}

/* ---------- 매 프레임 ---------- */
let lastStage = 0;
const showStage = st => { if(st !== lastStage){ lastStage = st; $$('#stages li').forEach(li => li.classList.toggle('on', +li.dataset.s === st)); } };
function update(dt){
  if(S.drive) return updateDrive(dt);
  // 정체(시연): 맨 뒤차(빠지면서 앞으로 이동)보다 앞으로 못 가게 하드 클램프.
  // 줄을 따라 서행하다 정체가 풀리면 다시 주행.
  const tz = tailZ();
  const jamActive = S.jam > 0 && S.running && tz !== null && tz > qFrontOf(S.map) && (!S.map.city || S.map.queue.lanes.includes(S.route.tl));   // 일반도로: 줄 차로로 갈 때만
  const guardZ = tz + 9; // 맨 뒤차보다 9m 뒤
  if(jamActive){
    let z = path.curve.getPointAt(clamp(S.s/path.L)).z, g = 0;
    while(z < guardZ && S.s > 0 && g++ < 80){ S.s -= 1; z = path.curve.getPointAt(clamp(S.s/path.L)).z; }
    if(!S.map.city && z <= guardZ + 2.5){ S.jamHoldT += dt; if(S.jamHoldT > 5){ finish(); } } // 5초 서행 뒤 마무리 (일반도로는 신호 따라 끝까지)
  }
  // 일반도로 시연: 빨간불이면 정지선 앞, 보행자가 건너면 횡단보도 앞에 선다 (이미 지났으면 무시)
  S.cityLim = Infinity;
  if(S.map.city && S.running){
    const n0 = path.nodeS[0];
    if(S.s < n0 - 2 && sigOf(S.route.leaf.path[0].key, S.cityT) === 'red') S.cityLim = n0 - 3.3;
    if(path.cwS !== null && S.s < path.cwS - 2.5 && pedBlock(S.cityT)) S.cityLim = Math.min(S.cityLim, path.cwS - 3.5);
    S.s = Math.min(S.s, S.cityLim);
  }

  const u = clamp(S.s/path.L);
  const p = path.curve.getPointAt(u), f = path.curve.getTangentAt(u);
  const ahead = path.curve.getPointAt(clamp((S.s+22)/path.L));
  // 운전자 눈: 차 중심(p)에서 왼쪽으로 DRIVER_X (좌핸들). 보는 방향은 차 진행 방향과 나란히
  const lx = f.z*DRIVER_X, lz = -f.x*DRIVER_X;
  // 일반도로는 차가 향한 방향을 봄 — 22m 앞 경로 점을 보면 90도로 꺾을 때 차보다 먼저 고개가 돌아가 어색했음 (고속도로는 완만해서 그대로)
  camera.position.set(p.x + lx, EYE_Y, p.z + lz);
  if(S.map.city) camera.lookAt(p.x + f.x*22 + lx, EYE_Y - .2, p.z + f.z*22 + lz); else camera.lookAt(ahead.x + lx, EYE_Y - .2, ahead.z + lz);
  updateWheel(p, f, dt);

  const C = navCtx(S.s), k = Math.min(1, dt*4), R = S.route;

  // 정체 대기열 + 줄 뒤에 다가갈수록 부드럽게 감속(시연)
  S.q = updateQueue(p, dt);
  S.speedFactor = 1;
  if(jamActive){
    const df = p.z - guardZ;
    if(df < 30) S.speedFactor = clamp(df/30, 0, 1); // 줄 뒤 30m부터 서서히 감속
  }
  if(S.map.city){
    if(Math.abs(S.s - (path.nodeS[0] + 8)) < 28) S.speedFactor = Math.min(S.speedFactor, .45);   // 꺾을 땐 천천히
    if(S.cityLim < Infinity) S.speedFactor = Math.min(S.speedFactor, clamp((S.cityLim - S.s)/25, 0, 1));
  }

  // 뒤차 이벤트(시연): 뒤에서 다가와 옆 차로로 실제 지나감 — 가운데 도로 HUD로만 표시(옆 레이더 없음). 관통 없음.
  let dangerOn = false;
  const rtx = R.tx;
  if(S.rearActive){
    if(!S.paused) S.rearGap -= 13*dt;
    dangerOn = S.rearGap < 24 && S.rearGap > -12;
    S.danger += ((dangerOn?1:0) - S.danger) * Math.min(1, dt*6);
    // 옮길 차로(rtx)에 3D 차 배치 — 뒤에서 와서 앞으로 지나감. 내 차는 아직 옆 차로라 관통 없음.
    otherCar.visible = R.side !== 0 && S.rearGap < 60 && S.rearGap > -95;
    if(otherCar.visible){ otherCar.position.set(rtx, 0, p.z + S.rearGap); otherCar.rotation.y = 0; }
    if(S.rearGap < -95) S.rearActive = false;
    S.car = { pos:{ x:rtx, z: p.z + S.rearGap } };
  } else {
    S.danger += (0 - S.danger) * Math.min(1, dt*8);
    otherCar.visible = false; S.car = null;
  }

  if(S.running && (u >= .985 || S.s > path.nodeS[path.nodeS.length-1] + 88)) finish();

  showStage(C.st);

  const kmh = S.running && !S.paused ? Math.max(0, Math.round(cruiseOf(S.map)*(S.speedFactor ?? 1)*3.6 + Math.sin(performance.now()/900))) : 0;
  const remainKm = Math.max(0, 3.4 - (S.s-40)/1000).toFixed(1);

  setEgo(p.x, p.z, Math.atan2(f.x, -f.z), S.running && !S.paused ? cruiseOf(S.map)*(S.speedFactor ?? 1) : 0);
  guideStep(S.cityT, C);
  if(S.mode === 'ar') drawAr(p, f, C, k);
  else if(S.mode === 'nav') drawNav(p, f, C, kmh, remainKm, dangerOn);
  updateCabin(steer, kmh);
  cityFrame(S.cityT);
}

/* ---------- 주행 테스트 한 판 (session.js가 부름) ----------
   경로(route · path)는 HUD용: 내 차를 경로 위로 옮겨 갈림까지 거리를 재고, 차로를 바꾸면 지금 차로에서 가장 가까운 목표 차로로 다시 계산 */
let pathHint = -1;
function startDrive(cfg){
  $('#intro').hidden = true; $('#drawer').classList.remove('open');
  loadMap(cfg.map); S.jam = cfg.type === 'jam' ? cfg.jam : cfg.map.city && cfg.map.queue ? 1 : 0; S.rearActive = false;
  S.cityT = 0; S.sigT = cfg.sigT ?? 0;   // 일반도로: 신호 시각 (보행자 계획은 driveReset이 교통 번호로)
  S.drive = true; setTarget(cfg.leaf, cfg.lane);
  driveReset(cfg); pathHint = -1; qShift = 0;
  S.running = true; S.paused = false; $('#pauseBtn').textContent = '일시정지';
  update(0);
}
function driveRoute(lane){ S.route = makeRoute(S.map, S.target, lane); path = buildPath(S.route, 0); pathHint = -1; }
function stopDrive(){ S.drive = false; S.running = false; driveClear(); S.rearActive = false; }
// 주행은 고정 간격(1/60초)으로 나눠 계산 — 화면 프레임률(미러를 그리느라 느려져도)과 상관없이 조향 · 충돌 · 위험 판정이 같다
const DRIVE_STEP = 1/60; let driveAcc = 0;
function updateDrive(dt){
  if(S.running && !S.paused && !D.frozen){
    driveAcc = Math.min(driveAcc + dt, .1);
    while(driveAcc >= DRIVE_STEP - 1e-9 && S.running){ driveStep(DRIVE_STEP); driveAcc -= DRIVE_STEP; }
  } else driveAcc = 0;
  const f = {x:Math.sin(D.psi), z:-Math.cos(D.psi)}, p = {x:D.x, z:D.z};
  // 운전자 눈: 차 중심에서 왼쪽 DRIVER_X (좌핸들), 차가 보는 방향 그대로
  const lx = f.z*DRIVER_X, lz = -f.x*DRIVER_X;
  camera.position.set(p.x + lx, EYE_Y, p.z + lz); camera.lookAt(p.x + f.x*22 + lx, EYE_Y - .2, p.z + f.z*22 + lz);
  const r = project(path.P, p.x, p.z, pathHint); pathHint = r.i; S.s = r.s; S.cityT = D.t;
  const C = navCtx(S.s), k = Math.min(1, dt*4), kmh = Math.round(D.v*3.6);
  showStage(C.st);
  setEgo(D.x, D.z, D.psi, D.v);
  guideStep(D.t, C);
  if(S.mode === 'ar') drawAr(p, f, C, k);
  else if(S.mode === 'nav') drawNav(p, f, C, kmh, Math.max(0, 3.4 - (S.s-40)/1000).toFixed(1), S.rearBlock);
  updateCabin(clamp(D.wheel*STEER_RATIO*STEER_GAIN*180/Math.PI, -360, 360), kmh);
  cityFrame(D.t);
}

let prev = performance.now();
function frame(now){
  const dt = Math.min(.05,(now-prev)/1000); prev = now;
  if(S.running && !S.paused && !S.drive){ S.s += cruiseOf(S.map)*(S.speedFactor ?? 1)*dt; S.cityT += dt; }
  update(dt);
  renderScene();
  requestAnimationFrame(frame);
}

/* ---------- 시연 흐름 ---------- */
function start(){
  $('#intro').hidden = true; $('#sess').hidden = true; $('#drawer').classList.remove('open');
  setScreen('demo');
  // 시연: 연구자 설정에서 고른 맵 · 목적지 · 상황 그대로
  prepDemo();
  // 옮겨야 하는 목적지 + 정체 없음이면 뒤차가 뒤에서 다가와 옆으로 지나가는 상황
  S.rearActive = (S.route.side !== 0 && S.demoJam === 0 && !S.map.city);   // 일반도로는 맵에 딸린 상황(줄 · 버스 · 보행자)
  if(S.rearActive) S.rearGap = 45;
  qShift = 0;
  S.running = true; S.paused = false; $('#pauseBtn').textContent = '일시정지';
  update(1);
}
function finish(){
  S.running = false;
  sesCard({eyebrow:'시연 끝', title:mapLabel(S.map.id), btn:['다시 보기', start], btn2:['처음으로', goHome]});
}

/* ---------- 이벤트 (주행 테스트 · 기록 서랍 · 방향키는 session.js) ---------- */
$('#demoBtn').onclick = () => { openSetup(true); start(); };
$('#demoSide').onclick = () => start();
$('#homeBtn').onclick = goHome;
$('#setupBtn').onclick = () => openSetup($('#setup').hidden);
$$('#modeSeg button').forEach(b => b.onclick = () => { setMode(b.dataset.mode); update(1); renderStatus(); });
$$('#lightSeg button').forEach(b => b.onclick = () => { setLight(b.dataset.light); update(1); renderStatus(); });
$$('#mapSeg button').forEach(b => b.onclick = () => {
  if(!stopDemo()) return;
  S.demoMap = b.dataset.m; S.demoTarget = defaultLeaf(mapById(S.demoMap)); prepDemo(); update(1); renderStatus();
});
$$('#jamSeg button').forEach(b => b.onclick = () => { if(stopDemo()){ S.demoJam = +b.dataset.j; prepDemo(); update(1); } });
$('#mirrorChk').onchange = e => { MIR.on = e.target.checked; };
$('#mirrorChk').checked = MIR.on;
function togglePause(){
  if(!S.running || S.testing) return;
  S.paused = !S.paused; $('#pauseBtn').textContent = S.paused ? '계속' : '일시정지';
}
$('#pauseBtn').onclick = togglePause;
addEventListener('keydown', e => {
  if(e.target.tagName === 'INPUT' || S.testing) return;   // 주행 테스트 중 키는 session.js
  if(e.code === 'Space' && $('#app').dataset.screen === 'demo'){ e.preventDefault(); togglePause(); }
});

/* ---------- 시작 ---------- */
$$('[data-ico]').forEach(el => el.insertAdjacentHTML('afterbegin', ico(el.dataset.ico)));   // 버튼 아이콘 채우기
$('#hudWrap').style.bottom = (cowlBottomPct() + .2).toFixed(1) + '%';   // HUD 아래끝 = 대시보드 윗선 바로 위
setMode('ar'); setLight('day'); prepDemo(); update(1); setScreen('home');
requestAnimationFrame(frame);
prebuildMaps(() => !S.running);   // 멈춰 있을 때 나머지 맵을 미리 지어 둔다
