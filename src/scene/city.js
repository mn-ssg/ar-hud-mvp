/* ============================================================
   city.js — 일반도로 교차로 (D69): ④ 이중 좌회전 · ⑤ 우회전 + 횡단보도
   · 장면: 도로(내 쪽 + 마주 오는 쪽 · 가로 도로 · 골목) · 보도 · 차선(점선 → 백색실선 · 중앙 황색 · 정지선 · 횡단보도 · 화살표) · 건물 · 가로등 · 가로수 · 신호등 · 방향 표지 · 버스 정류장
   · 신호(움직임별) · 보행자(시간으로 정해지는 위치) · 버스
   좌표 · 숫자는 maps.js의 CZ와 맵 값(lanes · cw · bus). 설계 01_프로젝트/11_시뮬레이터_맵_설계.md 2-4절
   scene.js · drive.js 다음, main.js 전에 로드. 시연 · 주행 테스트 둘 다 cityFrame(t)로 신호등 · 보행자를 맞춘다
   ============================================================ */

/* ---------- 재질 ---------- */
const cityMats = (() => {
  const std = (hex, o = {}) => new THREE.MeshStandardMaterial({color:lin(hex), roughness:.9, ...o});
  return {
    walk: std('#b3afa6'), ground: std('#6f7466', {roughness:.97}),
    yellow: new THREE.MeshStandardMaterial({color:lin('#e2b21c'), emissive:lin('#e2b21c'), emissiveIntensity:0, roughness:.55, side:THREE.DoubleSide,
      polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2}),
    dark: std('#1b1e22', {roughness:.6}), shelter: std('#3c4753', {metalness:.3, roughness:.5}),
    glass: new THREE.MeshStandardMaterial({color:lin('#a9c2d2'), transparent:true, opacity:.35, roughness:.1}),
    skin: std('#d9b393'), pants: std('#2b2f36')
  };
})();
// 건물 벽: 창 무늬를 건물 크기만큼 되풀이(창 하나 ≈ 3m) — 색만 다른 재질 4개, 밤엔 창이 켜짐(cityLight)
facadeMat.map.wrapS = facadeMat.map.wrapT = facadeMat.emissiveMap.wrapS = facadeMat.emissiveMap.wrapT = THREE.RepeatWrapping;
facadeMat.map.needsUpdate = facadeMat.emissiveMap.needsUpdate = true;
const cityFacades = ['#ffffff', '#e6dccb', '#cfd6dc', '#d9c9c0'].map(hex => { const m = facadeMat.clone(); m.color = lin(hex); facadeMats.push(m); return m; });
// 보도: Higgsfield 생성 보도 블록 (한 장 ≈ 1.8m, 세계 좌표로 깔아 이음새 없이). 불러오기 전엔 단색
worldUV(cityMats.walk, 1/1.8);
loadTex('assets/tex/sidewalk.jpg', t => { cityMats.walk.map = t; cityMats.walk.color = lin('#d8d6d0'); cityMats.walk.needsUpdate = true; });
// 길바닥 화살표 (흰 칠, 앞 = 위): S ↑ · L ↰ · R ↱ · SR ↑↱
const arrowMats = {};
['S', 'L', 'R', 'SR'].forEach(k => {
  const tex = canvasTex(128, 512, g => {
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 22; g.lineCap = 'butt'; g.lineJoin = 'miter';
    const tri = (a, b, c) => { g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...c); g.closePath(); g.fill(); };
    const line = pts => { g.beginPath(); g.moveTo(...pts[0]); pts.slice(1).forEach(q => g.lineTo(...q)); g.stroke(); };
    if(k === 'S'){ line([[64,505],[64,130]]); tri([64,18],[22,140],[106,140]); }
    if(k === 'L'){ line([[86,505],[86,180],[44,180]]); tri([6,180],[50,136],[50,224]); }
    if(k === 'R'){ line([[42,505],[42,180],[84,180]]); tri([122,180],[78,136],[78,224]); }
    if(k === 'SR'){ line([[50,505],[50,130]]); tri([50,18],[12,136],[88,136]); line([[50,300],[84,300]]); tri([124,300],[82,262],[82,338]); }
  });
  arrowMats[k] = new THREE.MeshStandardMaterial({map:tex, transparent:true, alphaTest:.5, roughness:.55, emissive:lin('#d8dbd4'), emissiveMap:tex, emissiveIntensity:0,
    polygonOffset:true, polygonOffsetFactor:-3, polygonOffsetUnits:-3});
});
function cityLight(night){
  cityFacades.forEach(m => m.emissiveIntensity = night ? LIGHT.night.win : 0);
  [...BUILD.apt.mats, ...BUILD.glass.mats].forEach(m => m.emissiveIntensity = night ? LIGHT.night.win : 0);
  BUILD.shop.emissiveIntensity = night ? .55 : 0; PROPS.night(night);
  Object.values(arrowMats).forEach(m => m.emissiveIntensity = night ? LIGHT.night.paint : 0);
  cityMats.yellow.emissiveIntensity = night ? LIGHT.night.paint : 0;
}

/* ---------- 신호 ----------
   움직임: 'L' 좌회전 · 'S' 직진 · 'R' 우회전(늘 됨 — 보행자에겐 양보) · 'O' 마주 오는 직진
   ④ sig 'left': 처음엔 직진 · 마주 오는 직진 초록 → S.sigT - 3초부터 노랑 → S.sigT부터 직진 빨강 + 좌회전 화살표 초록(그 뒤 계속)
   ⑤ sig 'green': 직진 · 마주 오는 직진 늘 초록, 좌회전 늘 빨강 → 우회전해 들어가는 가로 도로 횡단보도는 보행자 초록 */
function sigOf(mv, t, m = S.map){
  if(!m || !m.city || mv === 'R') return 'green';
  if(m.sig === 'left'){
    if(mv === 'L') return t >= S.sigT ? 'green' : 'red';
    return t < S.sigT - 3 ? 'green' : t < S.sigT ? 'yellow' : 'red';
  }
  return mv === 'L' ? 'red' : 'green';
}
// 내 쪽 신호등(빨강 · 노랑 · 좌회전 화살표 · 초록) 켜기
function updateSignalHead(m, t){
  const L = m._lamps; if(!L) return;
  const sg = sigOf('S', t, m), on = {red:sg === 'red', yellow:sg === 'yellow', green:sg === 'green', arrow:sigOf('L', t, m) === 'green'};
  Object.entries(L).forEach(([k, mt]) => mt.emissiveIntensity = on[k] ? 2.6 : 0);
}

/* ---------- 보행자 ----------
   계획 S.pedPlan = [{x, dir(+1 가까운 쪽 → 먼 쪽 · -1 반대), v, t0}] — 위치는 시간만으로 정해진다(같은 시간 = 같은 자리, 기록 재현 가능).
   건너기 3초 전부터 보도 끝에 서 있음(= '건너려 하는' 사람 — 1.5초였을 땐 차가 코앞에서야 보여 설 수 없었음). 횡단보도 x 폭은 맵 cw */
/* 사람 모양 (2026-10-29, 참고 시안 assets/ref/7_peds.jpg): 키 1.7m 안팎 · 엉덩이 · 어깨 관절에서 다리 · 팔이 흔들림 · 머리 + 머리카락 · 신발.
   앞 = -z. 옷 색은 차분한 실제 옷 색 (예전: 원색 상자 몸통). 충돌 · 양보 판정은 아래 pedsAt 위치 하나로 — 보이는 자리 = 판정 자리 */
const PED_STYLE = [['#2f3a4d','#3a4a63','#1d1f24'], ['#c9bda6','#2a2c31','#eae6dd'], ['#59604a','#1f2329','#d8d4cc'], ['#7a2f35','#3b4554','#202226'], ['#9aa3ad','#24272c','#f0eee8'], ['#4b3b2f','#c2b59b','#2a2a2a']];
const pedMeshes = PED_STYLE.map(([coat, pants, shoe], i) => {
  const g = new THREE.Group(), std = hex => new THREE.MeshStandardMaterial({color:lin(hex), roughness:.88});
  const mCoat = std(coat), mPants = std(pants), mShoe = std(shoe), mSkin = std(['#d9b393','#c99f7f','#e2c2a2'][i % 3]), mHair = std(['#1b1714','#2b2119','#121212'][i % 3]);
  const mesh = (geo, mat, parent, x, y, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const limb = (r0, r1, len) => { const c = new THREE.CylinderGeometry(r0, r1, len, 8); c.translate(0, -len/2, 0); return c; };   // 위끝이 관절
  const body = new THREE.Group(); g.add(body);
  const legs = [-1, 1].map(s => { const hip = new THREE.Group(); hip.position.set(s*.1, .9, 0); body.add(hip);
    mesh(limb(.075, .055, .84), mPants, hip, 0, 0); mesh(new THREE.BoxGeometry(.11, .07, .25), mShoe, hip, 0, -.86, -.04); return hip; });
  const torso = new THREE.CylinderGeometry(.19, .16, .62, 10); torso.scale(1, 1, .62);
  mesh(torso, mCoat, body, 0, 1.2);
  mesh(new THREE.CylinderGeometry(.05, .055, .08, 8), mSkin, body, 0, 1.54);                       // 목
  mesh(new THREE.SphereGeometry(.105, 14, 12), mSkin, body, 0, 1.64);                            // 머리
  const hair = mesh(new THREE.SphereGeometry(.112, 14, 10, 0, Math.PI*2, 0, Math.PI*.55), mHair, body, 0, 1.655, .012); hair.rotation.x = -.25;
  const arms = [-1, 1].map(s => { const sh = new THREE.Group(); sh.position.set(s*.22, 1.47, 0); body.add(sh);
    mesh(limb(.05, .04, .6), mCoat, sh, 0, 0); mesh(new THREE.SphereGeometry(.04, 8, 6), mSkin, sh, 0, -.63); return sh; });
  g.userData = {legs, arms, body};
  g.visible = false; scene.add(g); return g;
});
/* 지금 보이는 보행자: {i, x, z, phase, walking}
   phase: 'wait'(보도 끝에서 건너려 함 — 건너기 3초 전부터) · 'cross'(건너는 중, 다 건너고 1m 몫 서 있는 것까지 = 예전과 같은 양보 판정 구간)
   · 'done'(건넌 뒤 보도를 따라 멀어짐 4초 — 횡단보도 밖이라 양보 판정 없음, 예전엔 그 자리에서 사라졌음) */
function pedsAt(t){
  const m = S.map, out = [];
  if(!m || !m.cw || !S.pedPlan) return out;
  S.pedPlan.forEach((p, i) => {
    const z0 = p.dir > 0 ? CZ.near + 1 : CZ.far - 1, z1 = p.dir > 0 ? CZ.far - 1 : CZ.near + 1, len = Math.abs(z1 - z0);
    if(t < p.t0 - 3) return;
    const d = Math.max(0, t - p.t0)*p.v;
    if(d <= len + 1){ out.push({i, x:p.x, z:z0 - p.dir*Math.min(d, len), phase:t < p.t0 ? 'wait' : 'cross', walking:t >= p.t0 && d < len, dir:p.dir}); return; }
    const w = (d - len - 1)/p.v;
    if(w < 4) out.push({i, x:p.x + w*p.v, z:z1, phase:'done', walking:true, dir:p.dir});
  });
  return out;
}
// 내가 들어갈 가까운 2개 차로(7m = 가로 도로 내 쪽 절반) + 보도 끝 1.5m 안에 건너려 하거나 건너는 사람이 있으면 일시정지
const pedBlock = t => pedsAt(t).some(p => p.phase !== 'done' && p.z <= CZ.near + 1.5 && p.z >= CZ.near - 7);
function pedFrame(t){
  const ps = pedsAt(t).concat(busMesh.visible && busMesh.userData.peds ? busMesh.userData.peds : []);   // 횡단보도 사람(0 ~ 2) + 정류장 승하차 사람(3 ~ 5, D104)
  pedMeshes.forEach((g, i) => {
    const p = ps.find(q => q.i === i); g.visible = !!p; if(!p) return;
    const u = g.userData, ph = t*6.2 + i*1.7, sw = p.walking ? Math.sin(ph) : 0;
    g.position.set(p.x, p.z > CZ.near || p.z < CZ.far ? .15 : 0, p.z);   // 보도 위면 보도 높이
    g.rotation.y = p.dx !== undefined ? Math.atan2(-p.dx, -p.dz) : p.phase === 'done' ? -Math.PI/2 : p.dir > 0 ? 0 : Math.PI;
    u.legs[0].rotation.x = sw*.42; u.legs[1].rotation.x = -sw*.42;
    u.arms[0].rotation.x = -sw*.34; u.arms[1].rotation.x = sw*.34;
    u.body.position.y = p.walking ? Math.abs(Math.cos(ph))*.025 : 0;
    if(p.phase === 'wait'){ u.arms[0].rotation.x = u.arms[1].rotation.x = 0; u.body.rotation.z = Math.sin(t*1.3 + i)*.012; } else u.body.rotation.z = 0;
  });
}

/* ---------- 버스 (⑤ 정류장) — 길이 11.4m · 폭 2.5m, 앞 = -z (2026-10-29, 참고 시안 assets/ref/6_vehicles.jpg) ----------
   저상 시내버스: 큰 앞유리 · 행선지 표시 · 전조등 · 옆 창 띠 · 앞/뒤 문 · 바퀴 덮개 · 뒤 등 · 지붕 냉방기 · 거울 팔. 판정 크기(11.4 × 2.5)는 그대로 */
const busMesh = (() => {
  const g = new THREE.Group(), body = paintOf('#2f8f4e'), white = paintOf('#e9ecea'), dark = cityMats.dark;
  const add = (geo, mat, x, y, z, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  add(B(2.5, 1.05, 11.4), body, 0, .88, 0);                                      // 아래 몸통
  add(B(2.48, 1.5, 11.2), white, 0, 2.15, .05);                                  // 창 띠 높이의 흰 몸통
  add(B(2.5, .22, 11.3), body, 0, 3.0, .02);                                     // 지붕 테
  add(B(1.5, .32, 2.6), white, 0, 3.27, .8);                                     // 냉방기
  for(const sx of [-1, 1]) add(B(.03, 1.05, 9.2), carMats.glass, sx*1.255, 2.2, .55, false);   // 옆 창 띠
  const doorF = add(B(.035, 1.95, 1.05), carMats.glass, 1.255, 1.5, -4.55, false);   // 앞문 (오른쪽) — 열리면 뒤로 미끄러짐(busFrame)
  const doorR = add(B(.035, 1.95, 1.05), carMats.glass, 1.255, 1.5, .6, false);      // 뒷문
  g.userData.doors = [doorF, doorR];
  add(B(2.3, 1.55, .04), carMats.glass, 0, 1.95, -5.715, false);                  // 앞유리
  add(B(1.9, .26, .05), new THREE.MeshStandardMaterial({color:lin('#141414'), emissive:lin('#ffb347'), emissiveIntensity:.9}), 0, 2.9, -5.72, false);   // 행선지 표시
  for(const sx of [-1, 1]) add(B(.36, .16, .05), carMats.head, sx*.92, .72, -5.72, false);   // 전조등
  add(B(2.3, .32, .06), dark, 0, .48, -5.72);                                     // 앞 범퍼
  add(B(1.9, .85, .04), carMats.glass, 0, 2.3, 5.715, false);                      // 뒷유리
  for(const sx of [-1, 1]) add(B(.18, .55, .05), carMats.tail, sx*1.08, 1.05, 5.72, false);   // 뒤 등
  add(B(.52, .12, .02), carMats.plate, 0, .62, 5.72, false);
  g.userData.ind = {};   // 방향 지시등 · 비상등 (D103): 앞 · 뒤 모서리, 왼쪽 · 오른쪽 한 덩이씩
  for(const sx of [-1, 1]){ const geo = merge([[B(.22, .14, .08), M4().makeTranslation(sx*1.12, .95, -5.72)], [B(.2, .22, .08), M4().makeTranslation(sx*1.12, 1.55, 5.72)]]); const m = add(geo, carMats.indOff, 0, 0, 0, false); g.userData.ind[sx < 0 ? 'L' : 'R'] = m; }
  for(const sx of [-1, 1]){ add(B(.06, .06, .5), dark, sx*1.4, 2.35, -5.9); add(B(.08, .42, .22), dark, sx*1.42, 2.1, -6.1); }   // 거울 팔 · 거울
  const tire = new THREE.CylinderGeometry(.5, .5, .3, 18); tire.rotateZ(Math.PI/2);
  for(const z of [-3.6, 3.4]) for(const sx of [-1, 1]){ add(tire, carMats.tire, sx*1.1, .5, z); add(B(.04, .6, 1.35), dark, sx*1.26, .78, z, false); }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 12.2).rotateX(-Math.PI/2).translate(0, .02, 0), carMats.shadow); g.add(shadow);
  for(const sx of [-1, 1]){ const sp = new THREE.Sprite(headGlowMat); sp.scale.set(1.2, 1.2, 1); sp.position.set(sx*.92, .72, -5.85); sp.visible = NIGHT; nightOnly.push(sp); g.add(sp); }
  g.userData.L = 11.4; g.userData.W = 2.5;
  g.visible = false; scene.add(g); return g;
})();

/* ---------- 버스 흐름 (D104, 값 config.js BUS) ----------
   계획(plan)은 seed 난수(주행 테스트) 또는 고정값(시연)으로 한 번 정하고, 위치 · 속도 · 문 · 등 · 승하차는 시각 t의 함수(busStateAt) → 시연은 S.cityT, 주행 테스트는 D.t.
   출발(departT)만 상태: 문을 닫은 뒤 같은 차로 뒤에서 오는 차가 없을 때 정한다(drive.js). 시연은 문 닫고 0.5초 뒤 */
function busPlanOf(m, rr, ri){
  const stopZ = m.bus.z, brake = BUS.v0*BUS.v0/(2*BUS.dec), lead = rr ? rr(BUS.lead) : 5, dwell = rr ? rr(BUS.dwell) : 5.5, n = ri ? ri(BUS.peds) : 2;
  const tBrake = lead/BUS.v0, tStop = tBrake + BUS.v0/BUS.dec, tOpen = tStop + BUS.doorDelay, tClose = tOpen + BUS.doorT + dwell, tClosed = tClose + BUS.doorT;
  // 승하차: 타는 사람은 정류장(보도)에서 앞문으로, 내리는 사람은 뒷문에서 정류장으로. 문이 다 열린 뒤 순서대로
  const peds = Array.from({length:n}, (_, k) => ({board:rr ? rr([0, 1]) < .55 : k === 0, t0:tOpen + BUS.doorT + .3 + k*1.4 + (rr ? rr([0, .6]) : 0), zOff:(rr ? rr([-1.2, 1.2]) : (k - .5)*1.4)}));
  return {stopZ, z0:stopZ + brake + lead, tBrake, tStop, tOpen, tClose, tClosed, dwell, peds, departT:null};
}
// 시각 t의 버스: z · v · 문 열림(0 ~ 1) · 깜빡이 쪽(1 오른쪽 · 2 비상등 · −1 왼쪽 · 0) · 단계
function busStateAt(P, t){
  let z, v, phase;
  if(t < P.tBrake){ z = P.z0 - BUS.v0*t; v = BUS.v0; phase = 'approach'; }
  else if(t < P.tStop){ const u = t - P.tBrake; z = P.z0 - BUS.v0*P.tBrake - (BUS.v0*u - BUS.dec*u*u/2); v = BUS.v0 - BUS.dec*u; phase = 'approach'; }
  else if(P.departT === null || t < P.departT){ z = P.stopZ; v = 0; phase = t < P.tClosed ? 'stop' : 'ready'; }
  else { const u = t - P.departT, vm = cruiseOf(S.map), tA = vm/BUS.acc; v = Math.min(vm, BUS.acc*u); z = P.stopZ - (u < tA ? BUS.acc*u*u/2 : vm*vm/(2*BUS.acc) + vm*(u - tA)); phase = 'depart'; }
  const door = clamp((t - P.tOpen)/BUS.doorT) - clamp((t - P.tClose)/BUS.doorT);
  const side = phase === 'approach' ? 1 : phase === 'stop' ? 2 : phase === 'ready' ? -1 : (P.departT !== null && t < P.departT + 3) ? -1 : 0;
  return {z, v, door, side, phase};
}
// 승하차 사람: {i(메시 번호 3~5), x, z, dx, dz(걷는 방향), walking}. 타는 사람: 정류장 앞(보도) → 앞문 앞(연석) → 사라짐. 내리는 사람: 뒷문 앞(연석)에 나타나 정류장으로 → 보도를 따라 멀어짐
function busPedsAt(P, t, m){
  const out = [], xCurb = m.edgeX + .45, xShel = m.edgeX + 2.6, zF = P.stopZ - 4.55, zR = P.stopZ + .6;
  P.peds.forEach((p, k) => {
    if(k > 2 || t < p.t0 - 2.5) return;
    const path = p.board ? [[xShel, P.stopZ + p.zOff], [xCurb, zF]] : [[xCurb, zR], [xShel + .3, P.stopZ + 1.5 + p.zOff], [xShel + .3, P.stopZ - 12]];
    let d = Math.max(0, t - p.t0)*BUS.walk, i = 0;
    if(!p.board && t < p.t0) return;   // 내리는 사람은 문이 열린 뒤 문 앞에서 나타남
    while(i < path.length - 1){ const L = Math.hypot(path[i+1][0] - path[i][0], path[i+1][1] - path[i][1]); if(d <= L){ const u = d/L; out.push({i:3 + k, x:path[i][0] + (path[i+1][0] - path[i][0])*u, z:path[i][1] + (path[i+1][1] - path[i][1])*u, dx:(path[i+1][0] - path[i][0])/L, dz:(path[i+1][1] - path[i][1])/L, walking:t >= p.t0}); return; } d -= L; i++; }
    // 길 끝: 타는 사람은 버스 안(사라짐), 내리는 사람은 멀어져 사라짐
  });
  return out;
}
// 메시에 반영: 자리 · 문 · 깜빡이 · 승하차 사람 (주행 테스트는 drive.js stepCars, 시연은 cityFrame)
function busFrame(P, st, t, m, idx = 9){
  busMesh.visible = true; busMesh.position.set(m.laneX(m.bus.lane), 0, st.z); busMesh.rotation.y = 0;
  const [dF, dR] = busMesh.userData.doors; dF.position.z = -4.55 + st.door*.95; dR.position.z = .6 + st.door*.95;
  applyBlink(busMesh, st.side, st.side === 2 ? blinkOn(t) : blinkOn(t, idx));
  busMesh.userData.peds = busPedsAt(P, t, m);
}

/* ---------- 장면 ---------- */
// 판(바닥) · 상자 · 흰/노란 칠 사각형
function buildCityScene(m){
  MG = new THREE.Group();
  seed = 7 + 4100 + MAPS.indexOf(m)*977;
  const N = m.lanes, W = N*LANE, xR = W/2, xC = -W/2, xL = -W/2 - W;   // 내 쪽 오른쪽 끝 · 가운데선 · 마주 오는 쪽 왼쪽 끝
  const cwE0 = m.cw ? m.cw.x0 : xR + 10.75, cwW1 = xL - (cwE0 - xR);       // 가로 도로 동쪽 · 서쪽 횡단보도
  const alley = m.id === 'CL2' ? [-78, -70] : null;                         // ④ 골목 (x 범위, maps.js 골목 x -74)
  const flat = (x0, x1, z0, z1, mat, y = 0) => { const g = new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(z1 - z0)); g.rotateX(-Math.PI/2); const s = addMesh(g, mat); s.position.set((x0 + x1)/2, y, (z0 + z1)/2); return s; };
  const slab = (x0, x1, z0, z1, h, mat) => { const s = addMesh(new THREE.BoxGeometry(Math.abs(x1 - x0), h, Math.abs(z1 - z0)), mat); s.position.set((x0 + x1)/2, h/2, (z0 + z1)/2); return s; };
  const white = [], yellow = [];
  const q = (arr, x0, z0, x1, z1) => { const a = Math.min(x0, x1), b = Math.max(x0, x1), c = Math.min(z0, z1), d = Math.max(z0, z1), y = .012; arr.push(a,y,c, b,y,c, a,y,d, b,y,c, b,y,d, a,y,d); };
  const dashZ = (x, za, zb) => { for(let z = Math.max(za, zb); z > Math.min(za, zb); z -= 9) q(white, x - .075, z, x + .075, Math.max(z - 3, Math.min(za, zb))); };
  const dashX = (z, xa, xb) => { for(let x = Math.min(xa, xb); x < Math.max(xa, xb); x += 9) q(white, x, z - .075, Math.min(x + 3, Math.max(xa, xb)), z + .075); };

  /* 바닥 · 도로 · 보도 */
  const ground = flat(-1200, 1200, 600, -1800, cityMats.ground, -.03); ground.receiveShadow = true;
  flat(xL, xR, CZ.near, 60, asphalt);                 // 교차로 앞 (내 쪽 + 마주 오는 쪽)
  flat(xL, xR, -900, CZ.far, asphalt);                // 교차로 건너편
  flat(-900, 900, CZ.far, CZ.near, asphalt);          // 가로 도로
  if(alley) flat(alley[0], alley[1], -700, CZ.far, asphalt);
  const SW = 4, H = .15, RC = 9;   // 보도 폭 · 높이 · 모퉁이 반지름 (예전엔 직각 모퉁이라 우회전 곡선이 보도 모퉁이를 가로질렀음)
  // 곧은 보도: 모퉁이 반지름만큼 떨어져서 끝남
  slab(xR, xR + SW, CZ.near + RC, 60, H, cityMats.walk); slab(xL - SW, xL, CZ.near + RC, 60, H, cityMats.walk);
  slab(xR, xR + SW, -900, CZ.far - RC, H, cityMats.walk); slab(xL - SW, xL, -900, CZ.far - RC, H, cityMats.walk);
  slab(xR + RC, 900, CZ.near, CZ.near + SW, H, cityMats.walk); slab(-900, xL - RC, CZ.near, CZ.near + SW, H, cityMats.walk);
  slab(xR + RC, 900, CZ.far - SW, CZ.far, H, cityMats.walk);
  if(alley){
    slab(-900, alley[0], CZ.far - SW, CZ.far, H, cityMats.walk); slab(alley[1], xL - RC, CZ.far - SW, CZ.far, H, cityMats.walk);
    slab(alley[0] - 2.5, alley[0], -700, CZ.far - SW, H, cityMats.walk); slab(alley[1], alley[1] + 2.5, -700, CZ.far - SW, H, cityMats.walk);
  } else slab(-900, xL - RC, CZ.far - SW, CZ.far, H, cityMats.walk);
  // 둥근 모퉁이 4개: 보도는 반지름 RC − SW ~ RC 사이 고리 조각, 모퉁이 바깥(직각 자리)은 도로 포장
  const flatShape = (pts, mat, y, h) => {
    const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
    const g = h ? new THREE.ExtrudeGeometry(sh, {depth:h, bevelEnabled:false}) : new THREE.ShapeGeometry(sh);
    g.rotateX(Math.PI/2); g.translate(0, y + (h || 0), 0);   // 모양의 y → 세계 z, 두께는 아래로
    return addMesh(g, mat);
  };
  [[xR, CZ.near, 1, 1], [xL, CZ.near, -1, 1], [xR, CZ.far, 1, -1], [xL, CZ.far, -1, -1]].forEach(([cx, cz, sx, sz]) => {
    const ox = cx + sx*RC, oz = cz + sz*RC, a0 = Math.atan2(0, -sx), a1 = Math.atan2(-sz, 0);
    let da = a1 - a0; da -= 2*Math.PI*Math.round(da/(2*Math.PI));
    const arc = r => Array.from({length:13}, (_, i) => { const a = a0 + da*i/12; return [ox + r*Math.cos(a), oz + r*Math.sin(a)]; });
    flatShape([[cx, cz], ...arc(RC)], asphalt, .001, 0);                 // 직각 자리 → 도로
    flatShape([...arc(RC), ...arc(RC - SW).reverse()], cityMats.walk, 0, H);   // 둥근 보도
  });

  /* 차선 */
  for(let i = 1; i < N; i++){ const x = m.laneX(i) - LANE/2; dashZ(x, 40, m.changeEnd); q(white, x - .075, m.changeEnd, x + .075, FORK_Z); }   // 점선 → 정지선 앞 백색실선
  q(white, xR - .32, 60, xR - .18, FORK_Z);                                        // 오른쪽 가장자리
  for(const o of [-.3, .18]){ q(yellow, xC + o, 60, xC + o + .12, FORK_Z - 1.5); q(yellow, xC + o, CZ.far - 6, xC + o + .12, -900); }   // 중앙 황색 겹선
  for(let k = 1; k < N; k++){ dashZ(xC - k*LANE, 60, CZ.near); dashZ(xC - k*LANE, CZ.far - 9, -900); dashZ(m.laneX(k) - LANE/2, CZ.far - 6, -900); }
  q(white, xC, FORK_Z, xR, FORK_Z - .45);                                           // 내 쪽 정지선
  q(white, xL, CZ.far - 8, xC, CZ.far - 8.45);                                      // 마주 오는 쪽 정지선
  for(let x = xL + .5; x < xR - .4; x += 1){ q(white, x, -232, x + .5, -236); q(white, x, CZ.far - 2, x + .5, CZ.far - 6); }   // 횡단보도: 내 쪽 · 건너편
  for(let z = CZ.far + .5; z < CZ.near - .4; z += 1){ q(white, cwE0, z, cwE0 + 4, z + .5); q(white, cwW1 - 4, z, cwW1, z + .5); }   // 가로 도로 동 · 서
  const xE = cwE0 + 6, xW = cwW1 - 6;
  for(const o of [-.3, .18]){ q(yellow, xE, CZ.mid + o, 900, CZ.mid + o + .12); q(yellow, -900, CZ.mid + o, xW, CZ.mid + o + .12); }
  for(const s of [-1, 1]){ dashX(CZ.mid + s*LANE, xE, 900); dashX(CZ.mid + s*LANE, -900, xW); }   // 방향마다 2차로 (D71)
  q(white, xW + 4.5, CZ.mid, xW + 4.05, CZ.near); q(white, xE - 4.5, CZ.far, xE - 4.05, CZ.mid);   // 가로 도로 정지선
  const geoOf = arr => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals(); return g; };
  addMesh(geoOf(white), paint); addMesh(geoOf(yellow), cityMats.yellow);
  // 길바닥 화살표: 차로마다 그 차로가 가는 쪽 (⑤ 맨 오른쪽은 직진 · 우회전 겸용 — 버스가 곧장 감)
  const keyOf = i => m.bus && i === m.bus.lane ? 'SR' : m.exits.find(e => e.lanes.includes(i)).key;
  for(let i = 0; i < N; i++) for(const z of [-214, -174]){
    const a = addMesh(new THREE.PlaneGeometry(1.4, 5.6).rotateX(-Math.PI/2), arrowMats[keyOf(i)], ''); a.position.set(m.laneX(i), .013, z);
  }

  /* 건물: 길마다 한 줄로, 보도 뒤 1m. 모퉁이는 가로 도로 쪽 줄이 차지 (2026-10-29)
     종류(사무 · 아파트 · 유리 업무)마다 층 높이에 맞는 입면, 1층은 상가(4.2m), 지붕 테 · 옥상 설비 — 덩어리 상자 하나가 아니게 */
  const P = new Map(), put = (mat, geo, mtx) => { if(!P.has(mat)) P.set(mat, []); P.get(mat).push([geo, mtx]); }, GF = 4.2;
  const row = (axis, a0, a1, line, dir) => {
    let a = Math.min(a0, a1); const end = Math.max(a0, a1);
    while(a < end - 6){
      const r = rnd(), type = r < .45 ? BUILD.apt : r < .75 ? BUILD.office : BUILD.glass;
      const w = Math.min(end - a, 12 + rnd()*16), d = 12 + rnd()*12, c = a + w/2, off = line + dir*(d/2 + 1);
      const fl = type === BUILD.apt ? 2.8 : type === BUILD.glass ? 3.5 : 3, h = GF + fl*Math.round((type === BUILD.office ? 4 : 6) + rnd()*(rnd() < .3 ? 12 : 6));
      const [x, z, bw, bd] = axis === 'z' ? [off, c, d, w] : [c, off, w, d];
      put(BUILD.shop, facadeBox(bw, GF, bd, [18, GF]), M4().makeTranslation(x, GF/2, z));
      put(type.mats[Math.floor(rnd()*type.mats.length)], facadeBox(bw, h - GF, bd, type.tile), M4().makeTranslation(x, GF + (h - GF)/2, z));
      put(BUILD.roof, new THREE.BoxGeometry(bw + .4, .45, bd + .4), M4().makeTranslation(x, h + .22, z));
      if(rnd() < .7) put(BUILD.roof, new THREE.BoxGeometry(2 + rnd()*3, 1.1 + rnd(), 2 + rnd()*2), M4().makeTranslation(x + (rnd() - .5)*bw*.5, h + 1, z + (rnd() - .5)*bd*.5));
      a += w + 1.5 + rnd()*4;
    }
  };
  row('z', CZ.near + 32, 70, xR + SW, 1); row('z', CZ.near + 32, 70, xL - SW, -1);
  row('z', -760, CZ.far - 32, xR + SW, 1);
  row('x', xR + SW, 420, CZ.near + SW, 1); row('x', -420, xL - SW, CZ.near + SW, 1);
  row('x', xR + SW, 420, CZ.far - SW, -1);
  if(alley){
    row('z', -760, CZ.far - 32, xL - SW, -1);
    row('x', -420, alley[0] - 3, CZ.far - SW, -1); row('x', alley[1] + 3, xL - SW, CZ.far - SW, -1);
    row('z', -700, CZ.far - 32, alley[0] - 2.5, -1); row('z', -700, CZ.far - 32, alley[1] + 2.5, 1);
  } else { row('z', -760, CZ.far - 32, xL - SW, -1); row('x', -420, xL - SW, CZ.far - SW, -1); }
  P.forEach((list, mat) => { const s = addMesh(merge(list), mat, 'rc'); s.castShadow = true; });

  /* 연석: 보도와 도로가 만나는 모든 가장자리 (직선 + 둥근 모퉁이) */
  (() => {
    const segs = [[xR + .1, CZ.near + RC, xR + .1, 60], [xL - .1, CZ.near + RC, xL - .1, 60], [xR + .1, -900, xR + .1, CZ.far - RC], [xL - .1, -900, xL - .1, CZ.far - RC],
      [xR + RC, CZ.near + .1, 900, CZ.near + .1], [-900, CZ.near + .1, xL - RC, CZ.near + .1], [xR + RC, CZ.far - .1, 900, CZ.far - .1]];
    if(alley) segs.push([-900, CZ.far - .1, alley[0], CZ.far - .1], [alley[1], CZ.far - .1, xL - RC, CZ.far - .1], [alley[0] - .1, -700, alley[0] - .1, CZ.far - SW], [alley[1] + .1, -700, alley[1] + .1, CZ.far - SW]);
    else segs.push([-900, CZ.far - .1, xL - RC, CZ.far - .1]);
    [[xR, CZ.near, 1, 1], [xL, CZ.near, -1, 1], [xR, CZ.far, 1, -1], [xL, CZ.far, -1, -1]].forEach(([cx, cz, sx, sz]) => {
      const ox = cx + sx*RC, oz = cz + sz*RC, a0 = Math.atan2(0, -sx); let da = Math.atan2(-sz, 0) - a0; da -= 2*Math.PI*Math.round(da/(2*Math.PI));
      for(let i = 0; i < 12; i++){ const p = a => [ox + (RC - .1)*Math.cos(a0 + da*a/12), oz + (RC - .1)*Math.sin(a0 + da*a/12)], [x0, z0] = p(i), [x1, z1] = p(i + 1); segs.push([x0, z0, x1, z1]); }
    });
    PROPS.curbs(MG, segs);
  })();

  /* 가로등 · 가로수 (보도 위) */
  const lamp = (x, z, s) => {   // s: 팔이 뻗는 쪽(도로 쪽) — x 방향 ±1
    const p = addMesh(lampGeo.pole, galv); p.position.set(x, 5, z);
    const a = addMesh(lampGeo.arm, galv, ''); a.rotation.z = Math.PI/2; a.position.set(x + s*1.2, 9.95, z);
    const h = addMesh(lampGeo.head, lampMat, ''); h.position.set(x + s*2.35, 9.9, z);
    const pool = new THREE.Mesh(poolGeo, poolMat); pool.position.set(x + s*3.2, .03, z); pool.renderOrder = 1;
    const glow = new THREE.Sprite(glowMat); glow.scale.set(2.6, 2.6, 1); glow.position.set(x + s*2.35, 9.78, z);
    for(const o of [pool, glow]){ o.visible = NIGHT; nightOnly.push(o); MG.add(o); }
  };
  for(let z = 40; z > CZ.near + 10; z -= 34){ lamp(xR + 1, z, -1); lamp(xL - 1, z - 17, 1); }
  for(let z = CZ.far - 14; z > -560; z -= 34){ lamp(xR + 1, z, -1); lamp(xL - 1, z - 17, 1); }
  const trees = [];
  const avoid = (x, z) => (m.bus && x > 0 && z < m.bus.z + 9 && z > m.bus.z - 9);   // 정류장 자리
  for(let z = 52; z > CZ.near + 8; z -= 11){ if(!avoid(xR + 2.8, z)) trees.push([xR + 2.8, z]); trees.push([xL - 2.8, z - 5]); }
  for(let z = CZ.far - 10; z > -560; z -= 11){ trees.push([xR + 2.8, z]); trees.push([xL - 2.8, z - 5]); }
  for(let x = cwE0 + 10; x < 320; x += 12){ trees.push([x, CZ.near + 2.8]); trees.push([x + 5, CZ.far - 2.8]); }
  for(let x = cwW1 - 10; x > -320; x -= 12){ if(!alley || x > alley[1] + 4 || x < alley[0] - 4) trees.push([x, CZ.far - 2.8]); trees.push([x - 5, CZ.near + 2.8]); }
  // 입체 가로수(props.js): 자리 · 크기 · 방향을 흔들고 10%는 비워 줄이 기계적으로 보이지 않게
  PROPS.plantTrees(MG, trees.filter(() => rnd() > .1).map(([x, z]) => [x + (rnd() - .5)*.6, .15, z + (rnd() - .5)*2.4, .85 + rnd()*.4, rnd()*6.3]), rnd);

  /* 방향 표지 (일반도로 = 파랑): 오른쪽 보도에서 뻗은 팔에 판, 정지선 80m 앞 */
  (() => {
    const panelOf = e => ({from:e.lanes[0], to:e.lanes[e.k - 1], lines:e.node ? e.node.exits.map(c => c.dest) : [e.dest],
      arrow:e.key === 'L' ? Math.PI/2 : e.key === 'R' ? -Math.PI/2 : Math.PI});
    const tex = signTex(N, m.exits.map(panelOf), '#1f4f9c'), BW = W*.98, z = -150;
    const mat = new THREE.MeshStandardMaterial({map:tex, roughness:.5, emissive:lin('#ffffff'), emissiveMap:tex, emissiveIntensity:NIGHT ? LIGHT.night.sign : 0});
    signMats.push(mat);
    const plate = addMesh(new THREE.PlaneGeometry(BW, BW/N*.5), mat, ''); plate.position.set(0, 6.9, z);
    const back = addMesh(new THREE.BoxGeometry(BW + .16, BW/N*.5 + .16, .08), galv, ''); back.position.set(0, 6.9, z - .06);
    const pole = addMesh(new THREE.CylinderGeometry(.2, .24, 8.4, 12), galv, 'c'); pole.position.set(xR + 1.6, 4.2, z - .3);
    const arm = addMesh(new THREE.CylinderGeometry(.1, .1, xR + 1.6 + BW/2, 8), galv, ''); arm.rotation.z = Math.PI/2; arm.position.set((xR + 1.6 - BW/2)/2, 7.9, z - .3);
  })();

  /* 신호등: 건너편 오른쪽 모퉁이 기둥 → 내 차로 위로 뻗은 팔 끝에 4구(빨강 · 노랑 · 좌회전 화살표 · 초록) */
  (() => {
    const zP = CZ.far - 2, px = xR + 2, hx = m.laneX(Math.floor((N - 1)/2)) + LANE/2 - 1.2, y = 5.9;
    const pole = addMesh(new THREE.CylinderGeometry(.16, .2, 6.6, 12), galv, 'c'); pole.position.set(px, 3.3, zP);
    const arm = addMesh(new THREE.CylinderGeometry(.08, .08, px - hx + 1, 8), galv, ''); arm.rotation.z = Math.PI/2; arm.position.set((px + hx)/2, 6.35, zP);
    const box = addMesh(new THREE.BoxGeometry(1.9, .46, .34), cityMats.dark, ''); box.position.set(hx, y, zP);
    const arrowTex = canvasTex(64, 64, g => { g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#fff';
      g.beginPath(); g.moveTo(8, 32); g.lineTo(30, 12); g.lineTo(30, 24); g.lineTo(56, 24); g.lineTo(56, 40); g.lineTo(30, 40); g.lineTo(30, 52); g.closePath(); g.fill(); });
    const lampMatOf = (hex, map) => new THREE.MeshStandardMaterial({color:lin('#15181b'), emissive:lin(hex), emissiveIntensity:0, roughness:.3, ...(map ? {emissiveMap:map} : {})});
    m._lamps = {red:lampMatOf('#ff2a1a'), yellow:lampMatOf('#ffb000'), arrow:lampMatOf('#2bff7a', arrowTex), green:lampMatOf('#2bff7a')};
    ['red', 'yellow', 'arrow', 'green'].forEach((k, i) => { const c = addMesh(new THREE.CircleGeometry(.17, 20), m._lamps[k], ''); c.position.set(hx - .66 + i*.44, y, zP + .175); });
  })();

  /* 버스 정류장 (⑤): props.js — 기둥 · 지붕 · 유리 · 의자 · 노선 표지 · 광고 상자 */
  if(m.bus) PROPS.shelter(MG, xR + SW - 1.1, m.bus.z, 1);

  const g = MG; MG = null; return g;
}

/* ---------- 매 프레임 (시연 · 주행 테스트 공통): 신호등 · 보행자 · 버스(시연) ---------- */
function cityFrame(t){
  const m = S.map;
  if(!m || !m.city){ pedMeshes.forEach(g => g.visible = false); busMesh.visible = false; return; }
  updateSignalHead(m, t);
  if(!S.drive){   // 시연: 버스 흐름은 시연 시간(t)의 함수 — 같은 시각이면 같은 장면 (주행 테스트는 drive.js stepCars가 busFrame을 부름)
    if(m.bus){ if(!m._busDemo) m._busDemo = busPlanOf(m, null, null); const P = m._busDemo; if(P.departT === null) P.departT = P.tClosed + .5; busFrame(P, busStateAt(P, t), t, m); }
    else busMesh.visible = false;
  }
  pedFrame(t);
}
