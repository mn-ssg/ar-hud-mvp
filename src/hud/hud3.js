/* ============================================================
   hud3.js — 리뉴얼 HUD 3차 (3.0, 2026-11-17) · 피그마 '기말 / 11주차' (3차 HUD 디자인 근거 ① ② · HUD 정보 구조 · 상태 변화 01 ~ 06)
   2차(2.4, hud2.js)의 구조(자리 · 크기 · ① 들어갈 차로 ② 갈 방향 ③ 막대 · 뒤차 정보)는 그대로 두고 2차 실험에서 문제였던 네 가지만 고쳤다.
   01 앞쪽 위험 먼저: 앞차와 간격이 좁아지거나 보행자가 건너려 하면 주황 삼각형 · 앞쪽 간격이 가장 크게, 들어갈 차로 · 갈 방향 · 뒤차는 작고 옅게
   02 들어갈 때를 분명하게: 기다림(빨간 점 세 개 · 마감선까지 남은 거리 밝게) → 확인(틈 자리 흰 점선 · 거울 표시) → 이동(틈 초록 · 꺾쇠 크게)
   03 색 하나에 뜻 하나: 초록 = 옮겨도 됨 / 주황 = 조심 / 빨강 = 지금 옮기지 마 / 청록 = 길 안내(늘 그대로). 꺾쇠 = 옮길 방향 · 삼각형 = 앞쪽 주의 · 점 세 개 = 기다려.
      2차에서 뜻이 겹치던 곳을 정리: 막대 · 마감선의 초록 → 주황 → 빨강(무채색으로) · 정지선 빨간 막대(주황으로) · 차로 변경 뒤 차로가 초록으로 바뀌던 칭찬 · 해소 때 차로 전체 초록(틈만 초록으로) ·
      내 차 아이콘의 빨간 미등 · 제한속도 표지의 빨간 테(표지를 뺌) · 화살표 머리 삼각형(꺾쇠로) · 차로 경계 빨간 선(대기에 합침)
   04 미니 도로 투시: 손으로 맞춘 원근식(hud.js K · PXM · HY_*)을 버리고, 실제 차선 좌표를 장면 카메라와 같은 방향 · 같은 화각으로 투영한다(makeProj3).
      카메라 자리만 내 차 뒤 · 위로 옮긴다(config.js HUD3.view) → 소실점 · 지평선이 화면에서 실제 도로와 같은 자리. 차 아이콘 · 차로 띠 · 틈 · 마감선 · 보행자도 모두 같은 투영
   · 상태 판단은 guide.js h3Step (config.js HUD3) — stepHud3()이 매 프레임 입력을 모아 넘기고 S.H3에 둔다. 현대 HUD로 달릴 때도 계산해 기록(drive.js lcStart)에 남긴다
   · 색 · 굵기 · 투명도 토큰은 2차와 같은 것(hud.css --h2-*)
   config.js · guide.js · hud.js · hud2.js(laneRibbon · tk2) 다음에 로드. S · path · EGO는 main.js (호출 시점엔 존재)
   ============================================================ */

$('#hudSvgTop').classList.toggle('screen', !HUD3.warnSolid);
// 대기 기준 · 확인 시간은 판단 게이트(guide.js)가 쓴다 → 설정값을 넣는다 (처음 값은 2차와 같음)
GUIDE.rearGap = HUD3.waitGap; GUIDE.rearTtc = HUD3.waitTtc; GUIDE.hold = HUD3.confirmT;

/* ---------- 투영: 장면 카메라와 같은 방향 · 화각, 자리만 뒤 · 위 ----------
   돌려줌: (월드 x, z, 높이 y = 0) → [상자 x, 상자 y, 축척(내 차 줄 = 1), 내 차 기준 앞 거리 m] | null(그리는 범위 밖).
   화면 px = 화면 중심 + (1 tan 단위 = ppt px) × 카메라 좌표 비 → HUD 상자(가운데 정렬, 아래끝 = LAY.hud.bottomY)의 520 × 270 좌표로 옮긴다. 상자 밖은 #hudClip이 자른다 */
const _p3 = {r:new THREE.Vector3(), u:new THREE.Vector3(), f:new THREE.Vector3()};
function makeProj3(p){
  const q = camera.quaternion, r = _p3.r.set(1, 0, 0).applyQuaternion(q), u = _p3.u.set(0, 1, 0).applyQuaternion(q), f = _p3.f.set(0, 0, -1).applyQuaternion(q);
  const hl = Math.hypot(f.x, f.z) || 1, hx = f.x/hl, hz = f.z/hl, V = HUD3.view, L = LAY;
  const cx = camera.position.x - hx*V.back, cy = V.up, cz = camera.position.z - hz*V.back;
  const ppt = L.H/(2*Math.tan(camera.fov*Math.PI/360)), kx = 520/L.hud.w, ky = 270/L.hud.h, bx = L.W/2 - L.hud.w/2, by = L.hud.bottomY - L.hud.h;
  const rx = r.x, ry = r.y, rz = r.z, ux = u.x, uy = u.y, uz = u.z, fx = f.x, fy = f.y, fz = f.z, far = HUD3.far || 300, near = -HUD3.behind - 6;
  const fn = (wx, wz, wy = 0) => {
    const d = (wx - p.x)*hx + (wz - p.z)*hz;
    if(d < near || d > far) return null;
    const dx = wx - cx, dy = wy - cy, dz = wz - cz, zc = dx*fx + dy*fy + dz*fz;
    if(zc < 2) return null;
    return [(L.W/2 + ppt*(dx*rx + dy*ry + dz*rz)/zc - bx)*kx, (L.H/2 - ppt*(dx*ux + dy*uy + dz*uz)/zc - by)*ky, V.back/zc, d];
  };
  fn.unit = ppt*kx/V.back;   // 내 차 줄에서 1m = 상자 단위
  return fn;
}
// 볼록 껍질 (점 8개 이하)
function hull3(pts){
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0])*(b[1] - o[1]) - (a[1] - o[1])*(b[0] - o[0]), lo = [], up = [];
  for(const q of P){ while(lo.length >= 2 && cr(lo[lo.length-2], lo[lo.length-1], q) <= 0) lo.pop(); lo.push(q); }
  for(let i = P.length - 1; i >= 0; i--){ const q = P[i]; while(up.length >= 2 && cr(up[up.length-2], up[up.length-1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop(); return lo.concat(up);
}
const poly3 = pts => 'M' + pts.map(fmt).join('L') + 'Z';
/* 차 아이콘의 자리 · 테두리: 차 크기 상자(L × W × k, 높이 = 모델 높이 · 모델이 없으면 slabH)를 같은 투영으로 → 줄 · 차로 · 내 차와 같은 원근(멀수록 작고, 방향이 틀어지면 같이 틀어짐).
   3D 모델 층(CAR3)이 준비되면 이 상자는 보이지 않고 자리 계산(깜빡임 테두리 · 접근 꺾쇠)에만 쓴다. 돌려줌: {d 몸통, glass 뒤창, c 가운데, top 위끝 y, pts 꼭짓점} */
function slab3(proj, x, z, fx, fz, L, W, k = HUD3.icon){
  const rx = -fz, rz = fx, hl = L/2*k, hw = W/2*k, h = (CAR3.ready ? CAR3.size[2] : HUD3.slabH)*k, pt = (a, b, y) => proj(x + fx*a + rx*b, z + fz*a + rz*b, y);
  const c = [pt(-hl, -hw, 0), pt(-hl, hw, 0), pt(hl, hw, 0), pt(hl, -hw, 0), pt(-hl, -hw, h), pt(-hl, hw, h), pt(hl, hw, h), pt(hl, -hw, h)];
  if(c.some(q => !q)) return null;
  const win = [pt(-hl*.84, -hw*.72, h), pt(-hl*.84, hw*.72, h), pt(-hl*.42, hw*.68, h), pt(-hl*.42, -hw*.68, h)], ctr = pt(0, 0, h/2), hu = hull3(c);
  return {d:poly3(hu), glass:win.every(Boolean) ? poly3(win) : '', c:ctr, top:Math.min(...hu.map(q => q[1])), pts:hu};
}
const grow3 = (S, k) => poly3(S.pts.map(q => [S.c[0] + (q[0] - S.c[0])*k, S.c[1] + (q[1] - S.c[1])*k]));

/* ---------- 차 아이콘 3D 층 (2026-11-17 사용자: '차 모양 품질을 높여') ----------
   Blender로 만든 세단(assets/models/hud_car.glb — 차체 · 유리 · 미등 · 전조등 · 타이어 · 휠이 재질로 나뉨, 원본 assets/blender/hud_car.py · .blend)을
   미니 도로와 똑같은 가상 카메라(장면 카메라의 방향 · 화각, 자리만 뒤 · 위)로 #hudCars 캔버스에 그린다. 카메라의 보는 범위를 HUD 상자만큼만 잘라(setViewOffset) 상자 좌표와 1:1.
   빛으로 그린 그림처럼: 면은 상태 색, 가장자리(보는 방향과 비스듬한 곳)는 더 밝게, 유리 · 타이어는 어둡게(= 비쳐 보임). 등은 차체와 같은 색으로 더 밝게 — 빨강 · 주황을 장식으로 쓰지 않는다.
   모델을 못 불러오면 SVG 상자 아이콘이 그대로 보인다 */
const CAR3 = {ready:false, r:null, cam:null, scene:null, models:{}, size:[4.71, 1.82, 1.435], w:0, h:0, pr:0};
const CAR3_PART = {body:[1, 1], glass:[.1, .9], lamp_tail:[1.7, .6], lamp_head:[1.5, .6], tire:[.14, .45], rim:[.5, .7]};   // 재질 이름 → [면 밝기, 가장자리 빛]
const CAR3_VERT = 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position, 1.0); vN = normalMatrix*normal; vV = -mv.xyz; gl_Position = projectionMatrix*mv; }';
const CAR3_FRAG = `uniform vec3 uCol; uniform float uA, uFill, uRim, uOut; varying vec3 vN; varying vec3 vV;
  void main(){ vec3 n = normalize(vN), v = normalize(vV); float f = pow(1.0 - abs(dot(n, v)), 2.0), l = .5 + .5*max(0.0, dot(n, normalize(vec3(0.0, .9, .45))));
    vec3 c = uCol*uFill*l*(1.0 - uOut) + mix(uCol, vec3(1.0), .4)*uRim*f*(1.0 + uOut);
    c *= uA; gl_FragColor = vec4(c, clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0)); }`;
(() => {
  if(!HUD3.carModel || !THREE.GLTFLoader) return;
  try{ CAR3.r = new THREE.WebGLRenderer({canvas:$('#hudCars'), alpha:true, antialias:true, premultipliedAlpha:true}); }catch(e){ console.warn('HUD 차 아이콘 층을 만들지 못함 → 상자 아이콘', e); return; }
  CAR3.r.setClearColor(0x000000, 0); CAR3.scene = new THREE.Scene(); CAR3.cam = new THREE.PerspectiveCamera(58, 1, 5, 800);
  const load = (url, key, done) => new THREE.GLTFLoader().load(url, g => {
    const parts = []; g.scene.updateMatrixWorld(true);
    g.scene.traverse(o => { if(o.isMesh){ const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); parts.push({geo, name:o.material.name}); } });
    const sz = new THREE.Box3().setFromObject(g.scene).getSize(new THREE.Vector3());
    CAR3.models[key] = {parts, size:[sz.z, sz.x, sz.y], pool:[], n:0}; if(done) done(sz);
  }, undefined, () => console.warn('HUD 모델을 못 불러옴:', url));
  load(HUD3.carModel, 'car', sz => { CAR3.size = [sz.z, sz.x, sz.y]; CAR3.ready = true; $('#arHud3').classList.add('model'); });
  if(HUD3.pedModel) load(HUD3.pedModel, 'ped');   // 보행자: 걷는 자세 한 명(assets/blender/hud_ped.py)
})();
// 모델 하나 놓기: key 'car' · 'ped', 자리 (x, z) · 앞 방향 (fx, fz) · 축척 (sx 옆, sy 높이, sz 앞뒤) · 색 · 밝기 a · out = 1이면 테두리만(정체 줄 차)
function mdl3Put(key, x, z, fx, fz, sx, sy, sz, col, a, out = 0){
  const M = CAR3.models[key]; if(!CAR3.ready || !M || a <= .004) return false;
  let g = M.pool[M.n];
  if(!g){ g = new THREE.Group();
    g.userData.mats = M.parts.map(pt => { const P = CAR3_PART[pt.name] || [1, 1], m = new THREE.ShaderMaterial({uniforms:{uCol:{value:new THREE.Color()}, uA:{value:1}, uFill:{value:P[0]}, uRim:{value:P[1]}, uOut:{value:0}}, vertexShader:CAR3_VERT, fragmentShader:CAR3_FRAG, side:THREE.DoubleSide}); g.add(new THREE.Mesh(pt.geo, m)); return m; });
    CAR3.scene.add(g); M.pool.push(g); }
  M.n++; g.visible = true; g.position.set(x, 0, z); g.rotation.y = Math.atan2(-fx, -fz); g.scale.set(sx, sy, sz);
  g.userData.mats.forEach(m => { m.uniforms.uCol.value.set(col); m.uniforms.uA.value = a; m.uniforms.uOut.value = out; });
  return true;
}
// 차 한 대: 길이 L · 폭 W · 축척 k
const car3Put = (x, z, fx, fz, L, W, k, col, a, out = 0) => mdl3Put('car', x, z, fx, fz, W*k/CAR3.size[1], k, L*k/CAR3.size[0], col, a, out);
function car3Render(){
  if(!CAR3.ready) return;
  Object.values(CAR3.models).forEach(M => { for(let i = M.n; i < M.pool.length; i++) M.pool[i].visible = false; M.n = 0; });
  const L = LAY, r = CAR3.r, c = CAR3.cam, V = HUD3.view, pr = Math.min(window.devicePixelRatio || 1, 2), w = Math.round(L.hud.w), h = Math.round(L.hud.h);
  if(w !== CAR3.w || h !== CAR3.h || pr !== CAR3.pr){ r.setPixelRatio(pr); r.setSize(w, h, false); CAR3.w = w; CAR3.h = h; CAR3.pr = pr; }
  const f = _p3.f.set(0, 0, -1).applyQuaternion(camera.quaternion), hl = Math.hypot(f.x, f.z) || 1;
  c.fov = camera.fov; c.aspect = L.W/L.H; c.quaternion.copy(camera.quaternion); c.position.set(camera.position.x - f.x/hl*V.back, V.up, camera.position.z - f.z/hl*V.back);
  c.setViewOffset(L.W, L.H, L.W/2 - L.hud.w/2, L.hud.bottomY - L.hud.h, L.hud.w, L.hud.h); c.updateProjectionMatrix();
  r.render(CAR3.scene, c);
}
/* 도로 면 위 도형(같은 투영) — 꺾쇠 · 점 · 틈 테두리를 화면 도형이 아니라 노면에 그려진 표시처럼 눕힌다 (2026-11-17 사용자: '점선 · 화살표 투시를 맞춰').
   내 차 줄에서 앞뒤 1m는 약 3 상자 단위, 옆 1m는 약 34 단위라(가상 카메라가 5° 내려다봄) 노면 표시는 실제 도로의 화살표처럼 앞뒤로 길게 그린다 */
const gpoly3 = (proj, pts) => { const q = pts.map(a => proj(a[0], a[1])); return q.every(Boolean) ? 'M' + q.map(fmt).join('L') + 'Z' : ''; };
// 옆을 가리키는 꺾쇠 '>' : 가운데 (cx, cz), s = 가리키는 쪽(±1), a = 옆 반길이 · b = 앞뒤 반길이 · t = 옆 굵기(m)
const gchev3 = (proj, cx, cz, s, a, b, t) => gpoly3(proj, [[cx - s*a, cz + b], [cx + s*a, cz], [cx - s*a, cz - b], [cx - s*(a + t), cz - b], [cx + s*(a - t), cz], [cx - s*(a + t), cz + b]]);
// 앞(-z)을 가리키는 꺾쇠 '^' : 끝이 cz - b, a = 옆 반폭 · t = 앞뒤 굵기
const gfwd3 = (proj, cx, cz, a, b, t) => gpoly3(proj, [[cx - a, cz + b], [cx, cz - b], [cx + a, cz + b], [cx + a, cz + b + t], [cx, cz - b + t], [cx - a, cz + b + t]]);
// 타원 점: 옆 반지름 rx · 앞뒤 반지름 rz
const gdot3 = (proj, cx, cz, rx, rz) => gpoly3(proj, Array.from({length:16}, (_, i) => [cx + rx*Math.cos(i*Math.PI/8), cz + rz*Math.sin(i*Math.PI/8)]));
// 틈 테두리: 옆 xa ~ xb, 앞뒤 z0(가까운 쪽) ~ z1. dashed면 점선(긴 변 1.5m 칠 · 1m 빈칸, 짧은 변 0.48m 칠 · 0.3m 빈칸) — 선 굵기도 노면 기준(옆 0.13m · 앞뒤 0.6m)
function gframe3(proj, xa, xb, z0, z1, dashed){
  const t = .13, tz = .6; let d = '';
  if(!dashed) return quadZ(xa, xa + t, z0, z1, proj) + quadZ(xb - t, xb, z0, z1, proj) + quadZ(xa, xb, z0, z0 - tz, proj) + quadZ(xa, xb, z1 + tz, z1, proj);
  for(let z = z0; z > z1 + .3; z -= 2.5){ const zb = Math.max(z - 1.5, z1); d += quadZ(xa, xa + t, z, zb, proj) + quadZ(xb - t, xb, z, zb, proj); }
  for(let x = xa; x < xb - .1; x += .78){ const x1 = Math.min(x + .48, xb); d += quadZ(x, x1, z0, z0 - tz, proj) + quadZ(x, x1, z1 + tz, z1, proj); }
  return d;
}

/* 띠 그리기 — hud.js strip · bandX · lineX · lineC와 같은 일을 하되, 투영 범위 밖(카메라 뒤 · 너무 먼 곳)으로 나간 점에서 띠를 **끊는다**.
   (hud.js strip은 빠진 점을 건너뛰고 남은 점끼리 이어 버려서, 교차로에서 돌 때 지나온 도로의 선이 엉뚱한 점과 이어져 미니 도로가 뒤틀려 보였다 — 2026-11-17 사용자 지적, ⑤ 우회전) */
function strip3(L, R){
  let d = '', a = [], b = [];
  const flush = () => { if(a.length > 1) d += 'M' + a.map(fmt).join('L') + 'L' + b.slice().reverse().map(fmt).join('L') + 'Z'; a = []; b = []; };
  L.forEach((q, i) => { if(q && R[i]){ a.push(q); b.push(R[i]); } else flush(); }); flush();
  return d;
}
const band3 = (x0, x1, z0, z1, proj, step = 4) => { const L = [], R = []; for(let z = z0; z > z1; z -= step){ L.push(proj(x0, z)); R.push(proj(x1, z)); } L.push(proj(x0, z1)); R.push(proj(x1, z1)); return strip3(L, R); };
const line3 = (x, z0, z1, hw, proj) => band3(x - hw, x + hw, z0, z1, proj);
const line3C = (c, u0, u1, off, hw, proj, n = 40) => strip3(offsetPts(c, u0, u1, off - hw, proj, n), offsetPts(c, u0, u1, off + hw, proj, n));
// 들어갈 차로 한 줄 띠 — hud2.js laneRibbon과 같은 모양(본선 구간 + 갈림 뒤 경로, 끝 18m는 뾰족하게), 끊김만 strip3로
function laneRibbon3(zNear, onMain, offFn, proj){
  const R = S.route, tx = R.tx, bc = R.afterCurve, L = R.afterL, bh = R.leaf.path[0].road ? 1.75 : R.leaf.path[0].k === 1 ? 2.3 : 1.75;
  const lastS = path.nodeS[path.nodeS.length - 1], bu = clamp((lastS + ROUTE_END - path.nodeS[0])/L), A = [], B = [];
  if(onMain) for(let z = zNear; z > FORK_Z; z -= 2){ const [o1, o2] = offFn(1.75); A.push(proj(tx + o1, z)); B.push(proj(tx + o2, z)); }
  const u0 = Math.min(bu, clamp((S.s - path.nodeS[0] - 8)/L)), n = Math.max(24, Math.ceil((bu - u0)*L/2));   // 갈림을 지난 뒤에는 내 차 뒤 8m부터만 — 지나온 회전 구간이 차 뒤로 갈고리처럼 남지 않게
  for(let i = 0; i <= n; i++){ const u = u0 + (bu - u0)*i/n, s = u*L, q = bc.getPointAt(u), t = bc.getTangentAt(u), l = Math.hypot(t.x, t.z) || 1, nx = -t.z/l, nz = t.x/l;
    const f = clamp((bu*L - s)/18), [o1, o2] = offFn(1.75 + (bh - 1.75)*clamp(s/20)).map(o => o*f);
    A.push(proj(q.x + nx*o1, q.z + nz*o1)); B.push(proj(q.x + nx*o2, q.z + nz*o2)); }
  return strip3(A, B);
}

/* ---------- 상태 ---------- */
const C3 = {h:makeH3(), lastT:null, alpha:0, gapDraw:null, primRef:null, edgeW:0, edgeA:0, blinkT0:0, icon:null, iconSince:0, iconOp:1, dim:0, warnA:0, gapA:0, barA:.78, lastBase:1};
function resetHud3(){
  Object.assign(C3, {h:makeH3(), lastT:null, alpha:0, gapDraw:null, primRef:null, edgeW:0, edgeA:0, blinkT0:0, icon:null, iconSince:0, iconOp:1, dim:0, warnA:0, gapA:0, barA:.78, lastBase:1});
  S.H3 = null;
  ['cSurf', 'cLaneFill', 'cEdges', 'cDash', 'cRails', 'cSolid', 'cGate', 'cSlot', 'cQueue', 'cStop', 'cPed', 'cFrontBand', 'cLead', 'cLeadGlass', 'cDistBand', 'cFlow', 'cAhead', 'cGap', 'cGapLine', 'cZebra', 'cZebraHot', 'cTrail1', 'cTrail2', 'cRing1', 'cRing2', 'cRear', 'cRearGlass', 'cEgo', 'cEgoGlass', 'cDots'].forEach(id => $('#' + id).setAttribute('d', ''));
  $$('#cChev path, #cAppr path').forEach(q => q.setAttribute('d', ''));
  $('#cEdgeL').setAttribute('opacity', 0); $('#cEdgeR').setAttribute('opacity', 0); $('#cWarn').setAttribute('opacity', 0); $('#cJam').setAttribute('opacity', 0);
  $('#arHud3').dataset.state = 1; $('#mirCue').hidden = true;
}

/* ---------- 매 프레임: 입력 모으기 → 상태 (어느 HUD로 달리든) ----------
   need · 줄 옆 판단은 2차(hud2.js drawAr2)와 같은 식, 뒤차 후보도 같다(대기 이유 차가 있으면 그 차, 아니면 옮길 차로에서 내 뒤 · 옆의 가장 가까운 차 — 정체 줄 차는 뺌).
   앞차: 내 진행선에서 옆으로 frontLat 안 · 앞에 있는 가장 가까운 차(본선 위 교통). 판정 자세(EGO)로 계산한다 */
function stepHud3(C, t){
  const m = S.map, R = S.route, G = S.G, onMain = C.i === 0, tx = R.tx, ex = EGO.x, ez = EGO.z;
  const inLane = !onMain || Math.abs(ex - tx) < 1.2;
  const tail = onMain && S.jam > 0 && S.q && S.q.backZ !== null ? S.q.backZ : null;
  const needMove = onMain && !inLane && C.st <= 3;
  const besideQueue = tail !== null && needMove && ez <= tail + 2;
  const gateZ = tail !== null ? tail + 10 : changeEndOf(m);
  let cand = null, rearNear = null, others = [], ahead = [];
  if(G && needMove && G.side){
    const list = G.cars.filter(c => c.lane === G.next && c.kind !== 'queue').map(c => { const dz = c.z - ez, gap = Math.abs(dz) - c.halfL - EGO.halfL, cl = c.v - EGO.v; return {c, dz, gap, cl, behind:dz > 0, ttc:dz > 0 && cl > 0 ? gap/cl : Infinity}; });
    const rc = G.reason && G.reason.car && G.reason.kind !== 'queue' ? list.find(o => o.c.ref === G.reason.car.ref) : null;
    rearNear = list.filter(o => o.behind || o.gap < 1).sort((a, b) => a.gap - b.gap)[0] || null;
    cand = rc || rearNear;
    others = list.filter(o => o !== cand && o.behind && o.gap < HUD3.detect).sort((a, b) => a.gap - b.gap);
    ahead = list.filter(o => o !== cand && !o.behind && o.gap >= 1 && -o.dz < 70).sort((a, b) => a.gap - b.gap).slice(0, 3);
  }
  let front = null;
  if(G){ const fx = Math.sin(EGO.psi), fz = -Math.cos(EGO.psi);
    G.cars.forEach(c => { const dx = c.x - ex, dz = c.z - ez, lon = dx*fx + dz*fz, lat = dx*(-fz) + dz*fx; if(lon <= 0 || Math.abs(lat) > HUD3.frontLat) return;
      const gap = Math.max(0, lon - c.halfL - EGO.halfL); if(!front || gap < front.gap) front = {c, gap, closing:EGO.v - c.v}; });
    if(front) front.ttc = front.closing > 0 ? front.gap/front.closing : Infinity; }
  const ped = !!(m.cw && path.cwS !== null && pedBlock(S.cityT) && ex < m.cw.x0 && S.s > path.cwS - HUD3.pedDist && S.s < path.cwS);
  const gate = G ? G.gate : 'none', rearWait = !!G && (gate === 'wait' || gate === 'clearing') && !!(G.reason && G.reason.kind !== 'queue');
  const prev = C3.h.state;
  h3Step(C3.h, t, {need:needMove, gate, rearWait, queueWait:besideQueue && !S.q.mergeNear, queueGo:besideQueue && S.q.mergeNear,
    rear:rearNear ? {gap:rearNear.gap, ttc:rearNear.ttc} : null, front:front ? {ttc:front.ttc, closing:front.closing} : null, ped}, HUD3);
  S.H3 = {state:C3.h.state, base:C3.h.base, since:C3.h.since, kind:C3.h.frontKind, needMove, inLane, tail, besideQueue, gateZ, cand, others, ahead, front, ped, gate, onMain};
  if(S.drive && D.events && C3.h.state !== prev) D.events.push({t:+t.toFixed(2), type:'h3', from:prev, to:C3.h.state, shown:S.mode === 'ar3'});
  return S.H3;
}

/* ---------- 거울 표시 (HUD 상자 밖 · 룸미러 자리): 02 주황 경고등 · 03 빨간 경고등 · 04 흰 테두리 ---------- */
function mirrorCue3(show, base, side){
  const el = $('#mirCue');
  if(!HUD3.mirrorCue || !show || typeof MIR === 'undefined' || !MIR.on || !MIR.box){ el.hidden = true; return; }
  const b = MIR.box; el.hidden = false;
  el.style.left = (b.cx - b.w/2 - 3).toFixed(1) + 'px'; el.style.top = (b.topY - 3).toFixed(1) + 'px'; el.style.width = (b.w + 6) + 'px'; el.style.height = (b.h + 6) + 'px'; el.style.borderRadius = (b.h*.42 + 3).toFixed(1) + 'px';
  el.dataset.cue = base === 4 ? 'check' : ''; el.dataset.lamp = base === 3 ? 'danger' : base === 2 ? 'warn' : ''; el.dataset.side = side || 1;
}

/* ---------- 그리기 ---------- */
function drawAr3(p, f, C, k){
  const m = S.map, R = S.route, G = S.G, H = S.H3 || stepHud3(C, S.drive ? D.t : S.cityT), onMain = C.i === 0, st = C.st;
  const now = performance.now(), t = S.drive ? D.t : S.cityT, dt = C3.lastT === null ? 1/60 : clamp(t - C3.lastT, 0, .1); C3.lastT = t;
  const T = tk2(now), proj = makeProj3(p), tx = R.tx, sgn = R.side;
  const base = H.base, front = H.state === 6, wait = base === 3, confirm = base === 4, move = base === 5, caution = base === 2;
  const needMove = H.needMove, besideQueue = H.besideQueue, tail = H.tail, gateZ = H.gateZ;
  const set = (id, d) => $('#' + id).setAttribute('d', d || '');
  const ramp = (v, to, sec) => v + clamp(to - v, -dt/sec, dt/sec);
  $('#arHud3').dataset.state = H.state;
  // 06 앞쪽 위험이면 나머지를 작고 옅게 (0 → 1, 0.18초)
  C3.dim = ramp(C3.dim, front ? 1 : 0, .18); C3.warnA = ramp(C3.warnA, front ? 1 : 0, .15);
  const dim = C3.dim, soft = 1 - .55*dim;
  if(base === 3 && C3.lastBase !== 3) C3.blinkT0 = t;
  C3.lastBase = base;
  const blinkOn = wait && H.gate === 'wait' ? ((t - C3.blinkT0) % HUD3.blink) < HUD3.blink*HUD3.blinkDuty : true;

  /* ② 갈 방향 — 2차와 같은 자리 · 모양, 색은 늘 청록. 대기 중엔 흐리게, 앞쪽 위험이면 작고 옅게(삼각형이 그 위) */
  const icon = C.d >= -8 ? {L:'cIcoLeft', S:'cIcoUp', R:'cIcoRight'}[C.node.key] : null;
  if(icon !== C3.icon){ C3.icon = icon; C3.iconSince = now; }
  const act = $('#cAct'), e = ease(clamp((now - C3.iconSince)/200));
  ['cIcoRight', 'cIcoLeft', 'cIcoUp'].forEach(n => $('#' + n).style.display = n === icon ? '' : 'none');
  act.style.display = icon ? '' : 'none';
  act.setAttribute('transform', `translate(${HX} ${ICON_Y}) scale(${((.88 + .12*e)*(1 - .3*dim)).toFixed(3)})`);
  C3.iconOp = ramp(C3.iconOp, wait ? .45 : 1, .18);
  act.setAttribute('opacity', (e*C3.iconOp*(1 - .78*dim)).toFixed(3));
  $('#cIcon').setAttribute('transform', `scale(${T.iconScale})`);

  /* ③ 마감선까지 남은 거리 — 색 없는 막대. 옮겨야 하면 마감선(정체면 줄 끝 10m 뒤)까지, 이미 맞는 차로면 다음 갈림까지. 대기 중엔 밝아지고 테두리 */
  const frac = clamp((p.z - gateZ)/(0 - gateZ));
  let bar = null, bi = C.i, bd = C.d;
  if(bd <= 0 && bi < path.nodeS.length - 1){ bi++; bd = path.nodeS[bi] - S.s; }
  if(needMove) bar = besideQueue ? 0 : frac;
  else if(bd > 0) bar = clamp(bd/(bi === 0 ? path.nodeS[0] - path.sStart : path.nodeS[bi] - path.nodeS[bi-1]));
  const barY = Math.round(ICON_Y + 13*T.iconScale + T.sp3);
  $('#cCd').style.display = bar === null ? 'none' : '';
  if(bar !== null){
    const emph = wait && needMove && !front;
    C3.barA = ramp(C3.barA, emph ? 1 : .78, .18);
    const w = 120*bar, b = $('#cCdBar'), ring = $('#cCdRing');
    b.setAttribute('y', barY); b.setAttribute('width', w.toFixed(1)); b.setAttribute('fill-opacity', (C3.barA*soft).toFixed(3)); b.style.fill = emph ? T.core : '';
    $('#cCdBg').setAttribute('y', barY); $('#cCdBg').setAttribute('opacity', soft.toFixed(2));
    ring.setAttribute('y', barY - 5.5); ring.setAttribute('height', 17); ring.setAttribute('rx', 8.5); ring.setAttribute('width', (Math.max(w, 6) + 11).toFixed(1)); ring.setAttribute('opacity', emph ? .95 : 0);
  }

  /* ① 미니 도로 — 실제 차선 좌표 그대로(3D 도로와 같은 점선 자리 · 가장자리 · 출구 곡선)를 같은 카메라 투영으로. 일반도로는 백색실선(마감선 ~ 정지선) · 횡단보도 줄무늬도 실제대로.
     갈림(정지선)을 지난 뒤에는 **내 경로의 도로만** 그린다 — 지나온 본선과 가지 않는 출구는 뺀다(회전 중 옆 · 뒤로 지나가는 선이 뒤엉켜 보였음, 2026-11-17).
     일반도로 출구의 가장자리 선 · 점선은 교차로 안(출구 시작 16m)에는 긋지 않는다 — 실제 교차로 안에는 차선이 없다 */
  const zNear = Math.min(p.z + HUD3.behind, 40), past = !onMain || p.z < FORK_Z - 1, myPath = R.leaf.path;
  let surf = '', edges = '', dash = '', zebra = '', zebraHot = '';
  if(!past){
    surf += band3(-m.edgeX, m.edgeX, zNear, -232, proj); edges += line3(-m.edgeX, zNear, -228, .08, proj) + line3(m.edgeX, zNear, -228, .08, proj);
    for(let i = 1; i < m.lanes; i++){ const x = m.laneX(i) - LANE/2;
      if(m.city){ for(let z = 40; z > m.changeEnd; z -= 9){ if(z > zNear + 3) continue; dash += quadZ(x - .075, x + .075, z, Math.max(z - 3, m.changeEnd), proj); } dash += line3(x, Math.min(m.changeEnd, zNear), FORK_Z, .075, proj); }
      else dash += dashX(x, .075, zNear, proj); }
  }
  m.segs.forEach(s => {
    if(past && !myPath.includes(s)) return;
    const c = s.curve, rd = s.road, nL = rd ? rd.n : s.k, hw = rd && rd.w ? rd.w/2 - .15 : nL*LANE/2, half = rd ? (rd.w ? rd.w/2 : hw + .55) : s.half, off = rd ? ((rd.n - 1)/2 - rd.i - (s.k - 1)/2)*LANE : 0;
    const inBox = m.city && s.depth === 0 ? 16 : 0, e0 = clamp(inBox/s.L);
    surf += strip3(offsetPts(c, 0, 1, off - half, proj, 60), offsetPts(c, 0, 1, off + half, proj, 60));
    edges += line3C(c, e0, 1, off - (hw + .15), .08, proj, 60) + line3C(c, e0, 1, off + hw + .15, .08, proj, 60);
    for(let i = 1; i < nL; i++) for(let q = Math.max(8, inBox + 1); q < s.L - 3; q += 9) dash += strip3(offsetPts(c, q/s.L, (q + 3)/s.L, off - hw + i*LANE - .075, proj, 2), offsetPts(c, q/s.L, (q + 3)/s.L, off - hw + i*LANE + .075, proj, 2));
  });
  // 횡단보도 줄무늬(실제 자리: 폭 0.5m · 1m 간격): 내 쪽 정지선 앞(-232 ~ -236) · ⑤ 우회전해 들어가는 가로 도로(m.cw). 보행자가 건너거나 건너려 하면 그 횡단보도가 주황으로
  if(m.city){
    const xC = -m.lanes*LANE/2, xR = m.lanes*LANE/2;
    if(!past) for(let x = xC + .5; x < xR - .4; x += 1) zebra += quadZ(x, x + .5, -232, -236, proj);
    if(m.cw && myPath[0].key === 'R'){ let zz = ''; for(let z = CZ.far + .5; z < CZ.near - .4; z += 1) zz += gpoly3(proj, [[m.cw.x0, z], [m.cw.x0 + 4, z], [m.cw.x0 + 4, z + .5], [m.cw.x0, z + .5]]); if(H.ped) zebraHot = zz; else zebra += zz; }
  }
  set('cSurf', surf); set('cEdges', edges); set('cDash', dash); set('cZebra', zebra); set('cZebraHot', zebraHot);
  // 들어갈 차로: 2차와 같은 한 줄 띠. 색은 늘 청록 — 차로를 다 옮겨도 · 경로 끝에서도 초록으로 바꾸지 않는다(초록 = 옮겨도 됨). 앞쪽 위험이면 흐리게, 모양은 그대로
  S.fill += ((st === 1 ? .85 : 1) - S.fill)*k;
  const lf = S.fill*(1 - .62*dim);
  set('cLaneFill', laneRibbon3(zNear, onMain, w => [-w, w], proj)); $('#cLaneFill').setAttribute('opacity', lf.toFixed(3));
  set('cRails', laneRibbon3(zNear, onMain, w => [-w - .1, -w + .1], proj) + laneRibbon3(zNear, onMain, w => [w - .1, w + .1], proj)); $('#cRails').setAttribute('opacity', lf.toFixed(3));

  // 마감선(흰 가로선) + 그 뒤 실선 구간: 점선은 옮길 수 있는 곳, 실선부터는 옮길 수 없는 곳. 정체면 줄 끝 10m 뒤에 가로선만
  const next = G && G.side ? G.next : null, laneX = next !== null && next >= 0 && next < m.lanes ? m.laneX(next) : tx, side = (G && G.side) || Math.sign(tx - p.x) || sgn || 1;   // 차로 선을 막 넘은 뒤(판단의 옮길 쪽이 0)에도 들어갈 차로 쪽
  const showGate = needMove && !besideQueue, dlOp = ((wait ? 1 : .72)*soft).toFixed(3);
  set('cGate', showGate ? quadZ(tx - 1.75, tx + 1.75, gateZ + .45, gateZ - .45, proj) : ''); $('#cGate').setAttribute('fill-opacity', dlOp);
  set('cSolid', showGate && tail === null ? line3(laneX - side*1.75, Math.min(gateZ, zNear), FORK_Z, .11, proj) : ''); $('#cSolid').setAttribute('fill-opacity', dlOp);

  /* 정체 — 2차와 같음(빗금 · 설 칸 · 줄 차 주황 테). 줄 차는 같은 투영의 차 아이콘 테두리 */
  const jb = $('#cJam');
  if(tail !== null){ const dj = band3(tx - 1.7, tx + 1.7, Math.min(tail, zNear), qFrontOf(m), proj); jb.setAttribute('d', dj); jb.setAttribute('opacity', dj ? (.45*soft).toFixed(2) : '0'); }
  else jb.setAttribute('opacity', '0');
  set('cSlot', tail !== null && p.z > tail + 14 ? quadZ(tx - 1.3, tx + 1.3, tail + 10, tail + 5, proj) : ''); $('#cSlot').setAttribute('opacity', (.7 + .3*Math.sin(now/260)).toFixed(2));
  let qd = '';
  if(tail !== null) queueCars.filter(c => c.visible).sort((a, b) => Math.abs(a.position.z - p.z) - Math.abs(b.position.z - p.z)).slice(0, 16).forEach(c => {
    const ry = c.rotation.y, cl = c.userData.L || DRV.carL, cw = c.userData.W || DRV.carW, s = slab3(proj, c.position.x, c.position.z, -Math.sin(ry), -Math.cos(ry), cl, cw);
    if(s){ qd += s.d; car3Put(c.position.x, c.position.z, -Math.sin(ry), -Math.cos(ry), cl, cw, HUD3.icon, T.warn, .85*soft, 1); } });
  set('cQueue', qd);

  /* 틈 — 04 확인: 흰 점선 상자(틈 자리) / 05 이동: 초록으로 채움. 옮길 차로에서 내 차 옆(뒤 2.5m ~ 앞 9m), 그 차로의 차가 있으면 그 범퍼까지만. 줄 옆이면 줄 차 사이 틈 */
  let gz0 = null, gz1 = null;
  if(needMove && (confirm || move)){
    if(besideQueue){
      const zs = queueCars.filter(c => c.visible && Math.abs(c.position.x - tx) < 1).map(c => c.position.z).sort((a, b) => b - a);
      for(let i = 0; i < zs.length - 1; i++) if(zs[i] - zs[i+1] > Q_MERGE){ const mz = (zs[i] + zs[i+1])/2; if(Math.abs(mz - p.z) < 16){ gz0 = mz + 1.6; gz1 = mz - 1.6; break; } }
    } else {
      gz0 = p.z + 2.5; gz1 = p.z - 9;
      if(G) G.cars.forEach(c => { if(c.lane !== G.next) return; if(c.z > p.z) gz0 = Math.min(gz0, c.z - c.halfL - .8); else gz1 = Math.max(gz1, c.z + c.halfL + .8); });
      if(gz0 - gz1 < 3){ gz0 = gz1 = null; }
    }
  }
  C3.gapA = ramp(C3.gapA, gz0 !== null ? 1 : 0, .15);
  const gp = $('#cGap'), gl = $('#cGapLine'), ga = (C3.gapA*(1 - .5*dim)).toFixed(3);
  if(gz0 !== null){
    gp.setAttribute('d', move ? quadZ(laneX - 1.45, laneX + 1.45, gz0, gz1, proj) : ''); gp.setAttribute('fill-opacity', .42);
    gl.setAttribute('d', gframe3(proj, laneX - 1.45, laneX + 1.45, gz0, gz1, !move)); gl.setAttribute('fill', move ? T.go : T.core); gl.setAttribute('stroke', move ? T.go : T.core); gl.dataset.line = move ? 'solid' : 'dash';
  } else if(C3.gapA <= 0){ gp.setAttribute('d', ''); gl.setAttribute('d', ''); }
  gp.setAttribute('opacity', ga); gl.setAttribute('opacity', ga);

  /* 뒤차 정보 — 2차와 같은 구성. 자리: 뒤에 있으면 간격 0 ~ detect m를 내 차 뒤 rearZone 자리로 눌러(가까울수록 내 차 쪽으로), 옆 · 앞이면 실제 자리. 크기 · 모양은 투영이 정한다
     색: 대기 = 빨강(테두리가 깜빡임) / 주의 = 주황(지난 위치 · 접근 꺾쇠 · 거리 구간) / 그 밖 = 무채색으로 작고 옅게 */
  const cand = H.cand, zOfGap = g => p.z + HUD3.rearZone[0] + (HUD3.rearZone[1] - HUD3.rearZone[0])*clamp(g/HUD3.detect);
  const ref = cand ? cand.c.ref : null;
  if(ref !== C3.primRef){ C3.primRef = ref; C3.alpha = 0; C3.gapDraw = null; }
  let zCar = null, xCar = laneX, hd = [0, -1];
  if(cand){
    if(cand.behind && cand.gap >= 1){ const g0 = Math.max(0, cand.gap); C3.gapDraw = C3.gapDraw === null ? g0 : C3.gapDraw + (g0 - C3.gapDraw)*Math.min(1, dt*10); zCar = zOfGap(C3.gapDraw); }
    else { zCar = cand.c.z; xCar = cand.c.x; C3.gapDraw = null; if(cand.c.ref && cand.c.ref.rotation){ const ry = cand.c.ref.rotation.y; hd = [-Math.sin(ry), -Math.cos(ry)]; } }
  } else C3.gapDraw = null;
  const lvl = wait ? 3 : caution ? 2 : 1, col = lvl === 3 ? T.danger : lvl === 2 ? T.warn : T.neutral;
  const inRange = cand && (lvl >= 2 || (cand.behind ? cand.gap < HUD3.detect : true));
  C3.alpha = ramp(C3.alpha, inRange && zCar !== null ? 1 : 0, HUD3.fade);
  const rk = HUD3.icon*(lvl === 3 ? 1.08 : lvl === 2 ? 1 : .74)*(1 - .2*dim);
  const rs = cand && zCar !== null && C3.alpha > .001 ? slab3(proj, xCar, zCar, hd[0], hd[1], cand.c.halfL*2, DRV.carW, rk) : null;
  const rearEl = $('#cRear'), apprEls = $$('#cAppr path');
  if(rs){
    const op = C3.alpha*(lvl === 1 ? T.opDetect : 1)*(1 - .5*dim);
    rearEl.setAttribute('d', rs.d); rearEl.setAttribute('fill', col); rearEl.setAttribute('stroke', lvl === 3 ? T.core : col); rearEl.setAttribute('stroke-width', lvl === 3 ? 1.3 : 2.4); rearEl.setAttribute('opacity', op.toFixed(3));   // 대기: 빨강은 휘도가 낮아 밝은 테를 두름(2차와 같음)
    car3Put(xCar, zCar, hd[0], hd[1], cand.c.halfL*2, DRV.carW, rk, col, op*(lvl === 3 ? 1.25 : 1));
    set('cRearGlass', rs.glass); $('#cRearGlass').setAttribute('opacity', op.toFixed(3));
    // 대기: 뒤차 둘레 테두리 두 겹이 깜빡임(켜짐 · 꺼짐 딱 끊김, 2.5Hz). 뒤차 자체는 계속 보임. 테두리도 노면 위 사각형으로(같은 투영)
    const ringOn = lvl === 3 && blinkOn && !front;
    const rl = cand.c.halfL*rk, rw = DRV.carW/2*rk, rq = g => gpoly3(proj, [[-rl - g*1.6, -rw - g], [-rl - g*1.6, rw + g], [rl + g*1.6, rw + g], [rl + g*1.6, -rw - g]].map(([a, b]) => [xCar + hd[0]*a - hd[1]*b, zCar + hd[1]*a + hd[0]*b]));   // 뒤차 바닥 둘레의 사각형(도로 면) 두 겹
    set('cRing1', ringOn ? rq(.35) : ''); set('cRing2', ringOn ? rq(.85) : ''); $('#cRing2').setAttribute('opacity', .55);
    // 접근 속도(주의부터, 뒤에 있을 때): 뒤차 **뒤 노면**에 앞(내 차 쪽)을 가리키는 꺾쇠 1 ~ 3개 — 빠르게 다가올수록 많이. 같은 투영으로 눕힘.
    // (처음엔 지붕 위에 뜬 표지 → '하늘로 올라가 있다'(2026-11-17 사용자). 뒤차 앞 노면은 이 낮은 각도에선 뒤차 차체에 가려져 뒤쪽에 둔다. 반투명 차로 그리던 '지난 위치'는 이 꺾쇠가 대신한다)
    const cl = cand.cl, n = lvl >= 2 && cand.behind && cand.gap >= 1 && cl > 0 && !front ? (cl < HUD3.chevronV[0] ? 1 : cl < HUD3.chevronV[1] ? 2 : 3) : 0, zb = zCar + cand.c.halfL*rk + 1.3;
    apprEls.forEach((q, i) => { q.setAttribute('d', i < n ? gfwd3(proj, xCar, zb + i*2.5, .78, .85, 1.25) : ''); q.setAttribute('fill', col); q.setAttribute('opacity', (op*[1, .7, .45][i]).toFixed(3)); });
    set('cTrail1', ''); set('cTrail2', '');
  } else { rearEl.setAttribute('d', ''); ['cRearGlass', 'cRing1', 'cRing2', 'cTrail1', 'cTrail2'].forEach(id => set(id, '')); apprEls.forEach(q => q.setAttribute('d', '')); }
  // 거리 구간: 내 차 뒤부터 뒤차까지 옮길 차로를 칠함 — 가까울수록 짧고 진하게, 색은 단계
  let band = '', bandOp = 0;
  if(rs && cand.behind && cand.gap >= 1){
    const z1 = p.z + 2.4, z0 = Math.max(zCar - 2, z1 + 1);
    if(z0 - z1 > .3){ band = band3(laneX - 1.55, laneX + 1.55, z0, z1, proj, 1); bandOp = (REAR2.bandOp[0] + (REAR2.bandOp[1] - REAR2.bandOp[0])*(1 - clamp(C3.gapDraw/HUD3.detect)))*(lvl === 1 ? .5 : 1); }
  }
  const db = $('#cDistBand'); db.setAttribute('d', band); db.setAttribute('fill', col); db.setAttribute('fill-opacity', (bandOp*C3.alpha*(1 - .6*dim)).toFixed(3));
  // 뒤에 더 오는 차가 있으면 옮길 차로 아래쪽에 위로 흐르는 옅은 띠
  let flow = '';
  if(rs && cand.behind && H.others.length && C3.gapDraw !== null) for(let i = 0; i < 3; i++){ const g = C3.gapDraw + 6 + ((i*7 - now/1000*6) % 21 + 21) % 21; if(g > HUD3.detect) continue; const zf = zOfGap(g); flow += band3(laneX - 1.1, laneX + 1.1, zf + .35, zf - .35, proj, .5); }
  set('cFlow', flow); $('#cFlow').setAttribute('fill-opacity', (REAR2.flowOp*C3.alpha*(1 - .6*dim)).toFixed(3));
  // 옮길 차로 앞쪽 차(방금 지나간 차 포함): 실제 자리에 무채색으로 작고 옅게 — 틈이 어디까지인지
  let ad = '';
  H.ahead.forEach(o => { const ry = o.c.ref && o.c.ref.rotation ? o.c.ref.rotation.y : 0, s = slab3(proj, o.c.x, o.c.z, -Math.sin(ry), -Math.cos(ry), o.c.halfL*2, DRV.carW, HUD3.icon*.74);
    if(s){ ad += s.d; car3Put(o.c.x, o.c.z, -Math.sin(ry), -Math.cos(ry), o.c.halfL*2, DRV.carW, HUD3.icon*.74, T.neutral, T.opDetect*(1 - .5*dim)); } });
  set('cAhead', ad); $('#cAhead').setAttribute('opacity', (T.opDetect*(1 - .5*dim)).toFixed(3));

  /* 내 차 — 실제 자리 · 방향(f) 그대로 */
  const es = slab3(proj, p.x, p.z, f.x, f.z, DRV.carL, DRV.carW);
  set('cEgo', es ? es.d : ''); set('cEgoGlass', es ? es.glass : '');
  if(es) car3Put(p.x, p.z, f.x, f.z, DRV.carL, DRV.carW, HUD3.icon, T.core, S.light === 'night' ? .85 : 1);

  /* 이동 화살표(초록 꺾쇠) · 기다려(빨간 점 세 개) — 내 차 옆에서 옮길 차로 쪽으로, 앞으로 갈수록 한 칸씩 옆으로(대각선). 노면에 그려진 표시처럼 같은 투영으로 눕힌다
     01 안전 · 02 주의: 꺾쇠 2개가 흐름 / 05 이동: 꺾쇠 3개가 크게 흐름 / 03 대기: 점 3개(멈춤) / 04 확인: 없음(틈 상자와 거울 표시만).
     자리: 내 차 옆 1.3m부터 옮길 차로 가운데 조금 너머까지 — 차가 넘어가며 남은 폭이 줄면 간격도 같이 줄어든다 */
  const chev = $$('#cChev path'), dots = $('#cDots');
  if(needMove && !confirm){
    const mo = 1 - .55*dim, span = Math.max(.6, (laneX - p.x)*side + .55 - 1.3);
    if(wait){
      const dx = Math.min(.74, (span - .6)/2);
      dots.setAttribute('d', [0, 1, 2].map(i => gdot3(proj, p.x + side*(1.62 + i*dx), p.z - 2 - i*2.2, .3, 3.5)).join(''));
      dots.setAttribute('opacity', mo.toFixed(2)); chev.forEach(q => q.setAttribute('d', ''));
    } else {
      dots.setAttribute('d', '');
      const n = move ? 3 : 2, a = move ? .52 : .44, b = move ? 5 : 4, tk = move ? .46 : .4, dx = Math.min(move ? .82 : .9, (span - 2*a)/(n - 1)), ph = now/850;   // 앞뒤로 8 ~ 10m 길이(노면 화살표처럼 길게) — 화면에서 '>' 모양으로 읽히게
      chev.forEach((q, i) => {
        if(i >= n){ q.setAttribute('d', ''); return; }
        q.setAttribute('d', gchev3(proj, p.x + side*(1.3 + a + i*dx), p.z - 3, side, a, b, tk));   // 같은 줄에 나란히 '>>' (앞뒤로 엇갈리면 겹쳐 보임)
        q.setAttribute('opacity', ((.34 + .66*(.5 + .5*Math.cos(2*Math.PI*(ph - i/n))))*mo).toFixed(3));   // 내 차 쪽 → 옮길 차로 쪽으로 차례로 밝아짐(흐름)
      });
    }
  } else { dots.setAttribute('d', ''); chev.forEach(q => q.setAttribute('d', '')); }

  /* 가장자리 빛: 뒤차 쪽. 02 주황(좁게) · 03 빨강(넓게, 깜빡임) · 대기 중 그쪽으로 넘어가기 시작하면 더 넓고 밝게. 앞쪽 위험이면 끔 */
  const E = !needMove || front ? [0, 0] : wait ? (G && G.intent ? HUD3.edge.intent : HUD3.edge.wait) : caution ? HUD3.edge.caution : [0, 0];
  C3.edgeW += (E[0] - C3.edgeW)*Math.min(1, dt*8); C3.edgeA = ramp(C3.edgeA, E[1], HUD3.fade);
  const ec = wait ? T.danger : T.warn; $$('.eg3').forEach(s => s.setAttribute('stop-color', ec));
  const es2 = (G && G.dir && G.dir.side) || side, eL = $('#cEdgeL'), eR = $('#cEdgeR'), ea = (C3.edgeA*T.opEdge*(wait && !blinkOn ? .25 : 1)).toFixed(3);
  eL.setAttribute('width', es2 < 0 ? C3.edgeW.toFixed(1) : 0); eL.setAttribute('opacity', es2 < 0 ? ea : 0);
  eR.setAttribute('width', es2 > 0 ? C3.edgeW.toFixed(1) : 0); eR.setAttribute('x', (520 - C3.edgeW).toFixed(1)); eR.setAttribute('opacity', es2 > 0 ? ea : 0);

  /* 일반도로 — 멈출 곳(빨간불 정지선 · 보행자 앞)은 주황 막대, 보행자는 점(앞쪽 위험이면 주황) */
  let cs = '', pd = '';
  if(m.city){
    const ct = S.cityT, e1 = R.leaf.path[0];
    if(onMain && p.z > FORK_Z - 1 && sigOf(e1.key, ct) === 'red') cs += quadZ(m.laneX(e1.lanes[0]) - 1.75, m.laneX(e1.lanes[e1.k-1]) + 1.75, FORK_Z + .7, FORK_Z - .7, proj);
    if(m.cw){
      if(pedBlock(ct) && p.x < m.cw.x0) cs += quadW([[m.cw.x0 - 1.7, CZ.near], [m.cw.x0 - .4, CZ.near], [m.cw.x0 - .4, CZ.mid], [m.cw.x0 - 1.7, CZ.mid]], proj);
      // 보행자: 걷는 사람 모델(같은 가상 카메라, 실제 키). 0.45초마다 좌우를 뒤집어 걷는 것처럼. 건너거나 건너려 하는 사람은 주황, 모델을 못 불러오면 점
      pedsAt(ct).forEach(q => { if(q.phase === 'done') return; const c = proj(q.x, q.z, .9); if(!c) return;
        const flip = q.walking && Math.floor(ct/.45 + q.i*.5) % 2 ? -1 : 1, fz = q.dir > 0 ? -1 : 1;
        if(mdl3Put('ped', q.x, q.z, 0, fz, flip*1.25, 1.25, 1.25, H.ped ? T.warn : T.neutral, H.ped ? 1 : .8)) return;
        const r = Math.max(2.2, 5.5*c[2]); pd += `M${(c[0] - r).toFixed(1)} ${c[1].toFixed(1)}a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(2*r).toFixed(1)} 0a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-2*r).toFixed(1)} 0Z`; });
    }
  }
  set('cStop', cs); set('cPed', pd); $('#cPed').setAttribute('fill', H.ped ? T.warn : T.neutral); $('#cPed').setAttribute('fill-opacity', H.ped ? 1 : .9);

  /* 06 앞쪽 위험 — 주황 삼각형(가운데 위, 가장 크게) + 앞차(주황)와 앞쪽 간격. 한 번 커지며 나타남 */
  const wEl = $('#cWarn'), wa = C3.warnA;
  wEl.setAttribute('opacity', wa.toFixed(3)); wEl.setAttribute('transform', `translate(${HX} 44) scale(${(.8 + .2*ease(wa)).toFixed(3)})`);
  let ld = null, fb = '';
  if(wa > .01 && H.front && H.kind === 'lead'){
    const c = H.front.c, ry = c.ref && c.ref.rotation ? c.ref.rotation.y : 0, cf = [-Math.sin(ry), -Math.cos(ry)];
    ld = slab3(proj, c.x, c.z, cf[0], cf[1], c.halfL*2, DRV.carW); if(ld) car3Put(c.x, c.z, cf[0], cf[1], c.halfL*2, DRV.carW, HUD3.icon, T.warn, wa);
    const ax = p.x + f.x*DRV.carL/2, az = p.z + f.z*DRV.carL/2, bx2 = c.x - cf[0]*c.halfL, bz2 = c.z - cf[1]*c.halfL, rx = -f.z, rz = f.x, w = .95;
    if(Math.hypot(bx2 - ax, bz2 - az) > .4) fb = quadW([[ax - rx*w, az - rz*w], [ax + rx*w, az + rz*w], [bx2 + rx*w, bz2 + rz*w], [bx2 - rx*w, bz2 - rz*w]], proj);
  }
  set('cLead', ld ? ld.d : ''); set('cLeadGlass', ld ? ld.glass : ''); $('#cLead').setAttribute('opacity', wa.toFixed(3)); $('#cLeadGlass').setAttribute('opacity', wa.toFixed(3));
  set('cFrontBand', fb); $('#cFrontBand').setAttribute('fill-opacity', (.55*wa).toFixed(3));

  car3Render();
  mirrorCue3(needMove && onMain, front ? 0 : base, side);
}
