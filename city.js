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
const cityFacades = ['#ffffff', '#e6dccb', '#cfd6dc', '#d9c9c0'].map(hex => { const m = facadeMat.clone(); m.color = lin(hex); return m; });
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
const pedMeshes = Array.from({length:6}, (_, i) => {
  const g = new THREE.Group(), shirt = new THREE.MeshStandardMaterial({color:lin(['#c0392b','#2e86c1','#f4f1e8','#27ae60','#8e44ad','#e67e22'][i]), roughness:.85});
  const add = (geo, mat, x, y) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, 0); m.castShadow = true; g.add(m); return m; };
  g.userData.legs = [add(new THREE.BoxGeometry(.15, .82, .17), cityMats.pants, -.1, .41), add(new THREE.BoxGeometry(.15, .82, .17), cityMats.pants, .1, .41)];
  add(new THREE.BoxGeometry(.46, .64, .27), shirt, 0, 1.14);
  add(new THREE.SphereGeometry(.13, 12, 10), cityMats.skin, 0, 1.6);
  g.visible = false; scene.add(g); return g;
});
// 지금 보이는 보행자: {x, z, walking}
function pedsAt(t){
  const m = S.map, out = [];
  if(!m || !m.cw || !S.pedPlan) return out;
  S.pedPlan.forEach(p => {
    const z0 = p.dir > 0 ? CZ.near + 1 : CZ.far - 1, z1 = p.dir > 0 ? CZ.far - 1 : CZ.near + 1, len = Math.abs(z1 - z0);
    if(t < p.t0 - 3) return;
    const d = Math.max(0, t - p.t0)*p.v;
    if(d > len + 1) return;
    out.push({x:p.x, z:z0 - p.dir*Math.min(d, len), walking:t >= p.t0 && d < len});
  });
  return out;
}
// 내가 들어갈 가까운 2개 차로(7m = 가로 도로 내 쪽 절반) + 보도 끝 1.5m 안에 사람이 있으면 일시정지
const pedBlock = t => pedsAt(t).some(p => p.z <= CZ.near + 1.5 && p.z >= CZ.near - 7);
function pedFrame(t){
  const ps = pedsAt(t);
  pedMeshes.forEach((g, i) => {
    const p = ps[i]; g.visible = !!p; if(!p) return;
    const dir = S.pedPlan[i] ? S.pedPlan[i].dir : 1, sw = p.walking ? Math.sin(t*7 + i)*.35 : 0;
    g.position.set(p.x, .15*(p.z > CZ.near || p.z < CZ.far ? 1 : 0), p.z); g.rotation.y = dir > 0 ? 0 : Math.PI;
    g.userData.legs[0].rotation.x = sw; g.userData.legs[1].rotation.x = -sw;
  });
}

/* ---------- 버스 (⑤ 정류장) — 길이 11.4m, 앞 = -z ---------- */
const busMesh = (() => {
  const g = new THREE.Group(), body = paintOf('#2f8f4e');
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  add(new THREE.BoxGeometry(2.5, 2.75, 11.4), body, 0, 1.73, 0);
  for(const sx of [-1, 1]) add(new THREE.BoxGeometry(.03, .95, 9.4), carMats.glass, sx*1.26, 2.25, -.4);
  add(new THREE.BoxGeometry(2.2, 1.2, .03), carMats.glass, 0, 2.1, -5.71);
  add(new THREE.BoxGeometry(2.0, .8, .03), carMats.glass, 0, 2.35, 5.71);
  for(const sx of [-1, 1]) add(new THREE.BoxGeometry(.32, .2, .05), carMats.tail, sx*1.0, .95, 5.72);
  const tire = new THREE.CylinderGeometry(.5, .5, .3, 18); tire.rotateZ(Math.PI/2);
  for(const z of [-3.6, 3.4]) for(const sx of [-1, 1]) add(tire, carMats.tire, sx*1.1, .5, z);
  g.visible = false; scene.add(g); return g;
})();

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

  /* 건물: 길마다 한 줄로, 보도 뒤 1m. 모퉁이는 가로 도로 쪽 줄이 차지 */
  const parts = cityFacades.map(() => []);
  const bgeo = (w, h, d) => {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, fw = [d, d, 0, 0, w, w];   // 면 순서 +x −x +y −y +z −z
    for(let f = 0; f < 6; f++) for(let k = 0; k < 4; k++){ const i = f*4 + k; uv.setXY(i, uv.getX(i)*fw[f]/30, uv.getY(i)*h/75); }
    return g;
  };
  const row = (axis, a0, a1, line, dir) => {
    let a = Math.min(a0, a1); const end = Math.max(a0, a1);
    while(a < end - 6){
      const w = Math.min(end - a, 12 + rnd()*16), d = 12 + rnd()*12, h = 9 + rnd()*(rnd() < .3 ? 48 : 20), c = a + w/2, off = line + dir*(d/2 + 1);
      const [x, z, bw, bd] = axis === 'z' ? [off, c, d, w] : [c, off, w, d];
      parts[Math.floor(rnd()*parts.length)].push([bgeo(bw, h, bd), M4().makeTranslation(x, h/2, z)]);
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
  parts.forEach((p, i) => { if(p.length){ const s = addMesh(merge(p), cityFacades[i], 'rc'); s.castShadow = true; } });

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
  (() => {
    const {geo, mat, depth} = treeKinds[1], im = new THREE.InstancedMesh(geo, mat, trees.length), d = new THREE.Object3D(), c = new THREE.Color();
    im.customDepthMaterial = depth;
    trees.forEach(([x, z], i) => { const s = 5.5 + rnd()*2.5; d.position.set(x, .15, z); d.rotation.set(0, rnd()*6.3, 0); d.scale.set(s, s*1.1, s); d.updateMatrix(); im.setMatrixAt(i, d.matrix); im.setColorAt(i, c.setRGB(.85 + rnd()*.25, .9 + rnd()*.2, .8 + rnd()*.2)); });
    im.castShadow = im.receiveShadow = true; MG.add(im);
  })();

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

  /* 버스 정류장 (⑤): 보도 위 지붕 · 뒤판 · 표지 기둥 */
  if(m.bus){
    const z0 = m.bus.z, x0 = xR + SW - .9;
    const roof = addMesh(new THREE.BoxGeometry(1.8, .12, 7), cityMats.shelter, 'c'); roof.position.set(x0 - .3, 2.6, z0);
    const backP = addMesh(new THREE.BoxGeometry(.06, 1.9, 6.6), cityMats.glass, ''); backP.position.set(x0 + .5, 1.2, z0);
    for(const dz of [-3.2, 3.2]){ const p = addMesh(new THREE.BoxGeometry(.1, 2.5, .1), cityMats.shelter, ''); p.position.set(x0 + .5, 1.3, z0 + dz); }
    const sign = addMesh(new THREE.BoxGeometry(.06, .6, .6), paintOf('#1f4f9c'), ''); sign.position.set(xR + .6, 2.6, z0 - 5);
    const sp = addMesh(new THREE.CylinderGeometry(.05, .05, 2.6, 8), galv, ''); sp.position.set(xR + .6, 1.3, z0 - 5);
  }

  const g = MG; MG = null; return g;
}

/* ---------- 매 프레임 (시연 · 주행 테스트 공통): 신호등 · 보행자 · 버스(시연) ---------- */
function cityFrame(t){
  const m = S.map;
  if(!m || !m.city){ pedMeshes.forEach(g => g.visible = false); busMesh.visible = false; return; }
  updateSignalHead(m, t); pedFrame(t);
  if(!S.drive){   // 시연: 버스는 정류장에 서 있음 (주행 테스트는 drive.js가 떠나게 함)
    busMesh.visible = !!m.bus;
    if(m.bus){ busMesh.position.set(m.laneX(m.bus.lane), 0, m.bus.z); busMesh.rotation.y = 0; }
  }
}
