/* ============================================================
   cabin.js — 운전석 실내 (3D): 대시보드 · 파노라마 디스플레이(계기판 + 센터 화면) · 핸들
   (A필러 · 지붕 틀 · 룸미러 · 도어는 v1.7.1에서 화면에서 뺌 — 아래 '앞유리 틀' 주석)
   scene.js 다음, hud.js 전에 로드. 실내는 바깥 장면과 따로(cabinScene) 그려 바깥 해가 차 안을 비추지 않게 하고,
   카메라(운전자 눈)를 매 프레임 따라간다 — 화면에서 실내 위치는 늘 같다.
   좌표: 운전자 눈 = 원점, 앞 = -z, 위 = +y, 오른쪽 = +x (m). 차 중심선은 눈보다 오른쪽 DRIVER_X(좌핸들 운전석).
   치수 근거 · 한계는 01_프로젝트/12_운전석_실내_설계.md. 외부 3D 모델 · 이미지 · 상표 없음 (모두 코드로 생성).
   ============================================================ */

const cabinScene = new THREE.Scene();
const cabin = new THREE.Group(); cabinScene.add(cabin);
const CCX = DRIVER_X;   // 차 중심선 x

/* ---------- 재질 ---------- */
const grainTex = (base, amp, n) => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for(let i=0;i<n;i++){ const v = Math.random() < .5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${Math.random()*amp})`; g.fillRect(Math.random()*w, Math.random()*h, 1.5, 1.5); }
}, true);
const softTex = grainTex('#8a8d93', .06, 9000); softTex.repeat.set(8, 8);      // 대시보드 소프트 플라스틱(무광 결)
const leatherTex = grainTex('#8a8b90', .12, 7000); leatherTex.repeat.set(24, 2);
const CM = {
  dash:  new THREE.MeshStandardMaterial({map:softTex, color:lin('#3a3c41'), roughness:.9, envMapIntensity:.2}),
  dashLow: new THREE.MeshStandardMaterial({map:softTex, color:lin('#2b2d31'), roughness:.88, envMapIntensity:.2}),
  piano: new THREE.MeshStandardMaterial({color:lin('#07080a'), roughness:.1, metalness:.4, envMapIntensity:1}),        // 디스플레이 테 · 버튼 판(유광 검정)
  satin: new THREE.MeshStandardMaterial({color:lin('#b4b9c0'), roughness:.3, metalness:.95, envMapIntensity:.9}),       // 송풍구 날개 · 핸들 장식
  band:  new THREE.MeshStandardMaterial({color:lin('#6b7078'), roughness:.38, metalness:.85, envMapIntensity:.7}),      // 대시보드를 가로지르는 금속 띠
  leather: new THREE.MeshStandardMaterial({map:leatherTex, color:lin('#34363b'), roughness:.55, envMapIntensity:.35}),
  trim:  new THREE.MeshStandardMaterial({map:softTex, color:lin('#303237'), roughness:.9, envMapIntensity:.2}),          // 도어 · 핸들 기둥
  ambient: new THREE.MeshStandardMaterial({color:lin('#2a2b2e'), emissive:lin('#ffd8ae'), emissiveIntensity:0, roughness:.5})   // 무드등(밤에만, HUD 청록과 겹치지 않는 따뜻한 흰색)
};
const cadd = (geo, mat, x=0, y=0, z=0, rx=0, ry=0, rz=0, parent=cabin) => {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m;
};
const rrShape = (w, h, r) => {   // 가운데 기준 둥근 사각형
  const s = new THREE.Shape(), x = -w/2, y = -h/2;
  s.moveTo(x+r, y); s.lineTo(x+w-r, y); s.quadraticCurveTo(x+w, y, x+w, y+r); s.lineTo(x+w, y+h-r); s.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  s.lineTo(x+r, y+h); s.quadraticCurveTo(x, y+h, x, y+h-r); s.lineTo(x, y+r); s.quadraticCurveTo(x, y, x+r, y); return s;
};
const rrBox = (w, h, d, r) => { const g = new THREE.ExtrudeGeometry(rrShape(w, h, r), {depth:d, bevelEnabled:true, bevelThickness:Math.min(.006, d/3), bevelSize:Math.min(.006, r/2), bevelSegments:3, curveSegments:8}); g.translate(0, 0, -d/2); return g; };
// 옆모습(z, y) 다각형을 x0~x1 폭으로 밀어낸 덩어리
function extrudeX(pts, x0, x1, mat){
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
  for(let i=1;i<pts.length;i++){ const q = pts[i]; if(q.length === 4) s.quadraticCurveTo(q[0], q[1], q[2], q[3]); else s.lineTo(q[0], q[1]); }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {depth:x1-x0, bevelEnabled:false, curveSegments:16});
  g.rotateY(-Math.PI/2); g.translate(x1, 0, 0);
  return cadd(g, mat);
}

/* ---------- 대시보드 ----------
   앞끝(카울) = 앞유리 밑선. 눈에서 내려다보는 각 ≈ 11° → 그 아래는 차 안, 위는 도로.
   윗면은 운전자 쪽으로 낮아지며(계기판 자리) 둥글게 꺾여 앞면으로. 앞면엔 가로 금속 띠 + 얇은 송풍구 (요즘 국산 중형 세단 구성) */
const COWL = {y:-.205, z:-1.05};
extrudeX([[COWL.z, COWL.y], [-.90, -.222], [-.80, -.245], [-.70, -.262], [-.615, -.272, -.585, -.29], [-.572, -.31, -.574, -.335],
  [-.574, -.36], [-1.1, -.36]], -.62, 1.36, CM.dash);
extrudeX([[-.574, -.36], [-.55, -.47], [-.47, -.62], [-.62, -.82], [-1.1, -.82], [-1.1, -.36]], -.62, 1.36, CM.dashLow);
cadd(new THREE.BoxGeometry(1.9, .016, .012), CM.band, .37, -.318, -.576);                     // 가로 금속 띠

cadd(new THREE.BoxGeometry(1.9, .013, .012), CM.piano, .37, -.336, -.577);                     // 얇은 송풍구 틈
for(const x of [-.38, .2, .55, 1.0]) for(let k=0;k<4;k++) cadd(new THREE.BoxGeometry(.003, .011, .014), CM.satin, x + k*.022, -.336, -.574);   // 송풍구 날개
cadd(new THREE.BoxGeometry(1.9, .0022, .004), CM.ambient, .37, -.3055, -.5765);                // 무드등 띠

/* ---------- 파노라마 디스플레이: 계기판(운전자 정면) + 센터 화면(오른쪽)을 한 유리로 ---------- */
const PANEL = {x:.22, y:-.205, z:-.74, tilt:-.12};
const panel = new THREE.Group(); panel.position.set(PANEL.x, PANEL.y, PANEL.z); panel.rotation.x = PANEL.tilt; cabin.add(panel);
cadd(rrBox(.79, .112, .022, .018), CM.piano, 0, 0, -.004, 0, 0, 0, panel);
cadd(new THREE.BoxGeometry(.8, .008, .06), CM.dash, 0, .059, -.022, 0, 0, 0, panel);   // 위 차양(빛 가림 턱)
cadd(new THREE.BoxGeometry(.04, .03, .12), CM.dash, -.05, -.06, -.05, 0, 0, 0, panel);  // 받침
const clusterCv = document.createElement('canvas'); clusterCv.width = 768; clusterCv.height = 252;
const infoCv = document.createElement('canvas'); infoCv.width = 1100; infoCv.height = 252;
const screenMat = cv => { const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = MAX_ANISO; return new THREE.MeshBasicMaterial({map:t, toneMapped:false}); };
const clusterMat = screenMat(clusterCv), infoMat = screenMat(infoCv);
cadd(new THREE.PlaneGeometry(.292, .092), clusterMat, -.22, -.002, .0145, 0, 0, 0, panel);   // 계기판: 눈 정면(x≈0)
cadd(new THREE.PlaneGeometry(.418, .092), infoMat, .143, -.002, .0145, 0, 0, 0, panel);

/* ---------- 핸들: 지름 37cm, 기둥 기울기 22° (윗부분이 앞으로 누움). 돌리는 건 wheelSpin ----------
   v1.7.1: 눈 앞 0.52 m · 아래 0.385 m(실제 자세에 가깝게). 테 윗부분이 계기판 아래끝 바로 밑(화면 위에서 ≈ 85%)에 와서
   계기판과 겹치지 않고, 화면 아래엔 테 윗부분만 크게 보인다. 가운데 패드 · 살은 화면 밖 */
const wheel = new THREE.Group(); wheel.position.set(0, -.385, -.52); wheel.rotation.x = -.384; cabin.add(wheel);
const wheelSpin = new THREE.Group(); wheel.add(wheelSpin);
(() => {
  cadd(new THREE.TorusGeometry(.17, .0178, 22, 120), CM.leather, 0, 0, 0, 0, 0, 0, wheelSpin);
  cadd(new THREE.TorusGeometry(.17, .0185, 8, 120, Math.PI*.18), CM.piano, 0, 0, 0, 0, 0, Math.PI*1.41, wheelSpin);   // 6시 쪽 유광 장식
  cadd(rrBox(.135, .1, .045, .03), CM.leather, 0, -.01, .03, 0, 0, 0, wheelSpin);                 // 가운데 패드
  cadd(rrBox(.06, .028, .006, .01), CM.piano, 0, -.004, .056, 0, 0, 0, wheelSpin);                // 패드 가운데 장식(로고 없음)
  for(const sx of [-1, 1]){                                                                         // 3시 · 9시 살 + 스위치
    cadd(new THREE.BoxGeometry(.11, .05, .024), CM.leather, sx*.112, -.012, .012, 0, 0, sx*.05, wheelSpin);
    cadd(new THREE.BoxGeometry(.104, .005, .026), CM.satin, sx*.112, .014, .013, 0, 0, sx*.05, wheelSpin);
    cadd(rrBox(.07, .03, .006, .01), CM.piano, sx*.112, -.012, .026, 0, 0, sx*.05, wheelSpin);
    for(let k=0;k<3;k++) cadd(new THREE.BoxGeometry(.012, .004, .004), CM.satin, sx*(.09 + k*.022), -.012, .03, 0, 0, sx*.05, wheelSpin);
  }
  for(const sx of [-1, 1]) cadd(new THREE.BoxGeometry(.018, .1, .022), CM.leather, sx*.03, -.1, .01, 0, 0, sx*.18, wheelSpin);   // 6시 살
})();
cadd(new THREE.CylinderGeometry(.045, .06, .26, 16), CM.trim, 0, -.45, -.63, 1.01);   // 핸들 기둥 덮개

/* ---------- 앞유리 틀 · 룸미러 · 도어는 그리지 않음 (v1.7.1, D51) ----------
   모니터 시야(가로 ≈ 70°)에 실제 비율로 넣으면 왼쪽 A필러만 화면 안에 들어와 앞유리가 한쪽으로 쏠려 보이고,
   지붕 틀 · 점 띠 · 룸미러가 '창틀'처럼 화면을 막았다(사용자 피드백). 실제 HUD 홍보 화면처럼 대시보드 시점으로 정리 */

/* ---------- 빛: 실내만 비춤 ----------
   낮: 앞유리로 들어오는 하늘빛(위 · 앞) + 옆 · 뒤 창에서 오는 약한 빛(운전자 쪽 면) / 밤: 거의 꺼짐 + 화면 빛이 핸들에 살짝 */
const cHemi = new THREE.HemisphereLight(lin('#e6ecf3'), lin('#3b3b3b'), 1.25); cabin.add(cHemi);
const cKey = new THREE.DirectionalLight(lin('#ffffff'), 1.15); cKey.position.set(.3, 1.5, -1.5); cabin.add(cKey, cKey.target);
const cFill = new THREE.DirectionalLight(lin('#ffffff'), .45); cFill.position.set(-1, .9, .9); cabin.add(cFill, cFill.target);
const cGlow = new THREE.PointLight(lin('#a9c6ff'), 0, .9, 2); cGlow.position.set(-.05, -.18, -.66); cabin.add(cGlow);

/* ---------- 화면 내용 (글자는 최소, 실제 차 화면처럼. 내비 지도 없음 — 주행 테스트에 다른 단서가 생기지 않게) ---------- */
const CF = '"Pretendard Variable","Pretendard",' + FONT;
let cabinNight = false, lastKmh = -1, lastMin = -1;
const two = n => String(n).padStart(2, '0');
function gauge(g, cx, cy, r, fr, col){
  const a0 = Math.PI*.75, a1 = Math.PI*2.25;
  g.lineCap = 'round'; g.lineWidth = 10; g.strokeStyle = '#1a222c'; g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
  g.strokeStyle = col; g.beginPath(); g.arc(cx, cy, r, a0, a0 + (a1-a0)*clamp(fr)); g.stroke();
  for(let i=0;i<=10;i++){ const a = a0 + (a1-a0)*i/10; g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx+Math.cos(a)*(r-16), cy+Math.sin(a)*(r-16)); g.lineTo(cx+Math.cos(a)*(r-24), cy+Math.sin(a)*(r-24)); g.stroke(); }
}
function drawCluster(kmh){
  const g = clusterCv.getContext('2d'), W = clusterCv.width, H = clusterCv.height, d = new Date();
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0c1117'); bg.addColorStop(1, '#05070a');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  gauge(g, 150, 140, 96, kmh/220, '#8fbfff');
  gauge(g, W-150, 140, 96, (800 + kmh*14)/7000, '#c9d3de');
  g.textAlign = 'center'; g.fillStyle = '#fff';
  g.font = `700 64px ${CF}`; g.fillText(kmh, 150, 150);
  g.font = `500 18px ${CF}`; g.fillStyle = '#8b96a3'; g.fillText('km/h', 150, 180); g.fillText('x1000 r/min', W-150, 180);
  g.font = `600 44px ${CF}`; g.fillStyle = '#dfe6ee'; g.fillText(((800 + kmh*14)/1000).toFixed(1), W-150, 152);
  // 가운데: 기어 · 차로 유지 보조 그림 · 시각 · 누적 거리
  g.font = `700 40px ${CF}`; g.fillStyle = '#fff'; g.fillText('D', W/2, 70);
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(W/2-60, 200); g.lineTo(W/2-26, 108); g.moveTo(W/2+60, 200); g.lineTo(W/2+26, 108); g.stroke();
  g.fillStyle = '#c9d3de'; g.beginPath(); g.roundRect ? g.roundRect(W/2-16, 160, 32, 40, 7) : g.rect(W/2-16, 160, 32, 40); g.fill();
  g.font = `500 20px ${CF}`; g.fillStyle = '#8b96a3';
  g.fillText(`${two(d.getHours())}:${two(d.getMinutes())}   18°C`, W/2, 30);
  g.fillText('ODO 12,483 km', W/2, 236);
  clusterMat.map.needsUpdate = true;
}
function drawInfo(){
  const g = infoCv.getContext('2d'), W = infoCv.width, H = infoCv.height, d = new Date();
  g.fillStyle = '#0a0e14'; g.fillRect(0, 0, W, H);
  // 음악(라디오) 카드
  g.fillStyle = '#121923'; g.beginPath(); g.roundRect ? g.roundRect(24, 22, 470, 158, 18) : g.rect(24, 22, 470, 158); g.fill();
  const art = g.createLinearGradient(40, 36, 170, 166); art.addColorStop(0, '#5b4fd6'); art.addColorStop(1, '#2fa7c9');
  g.fillStyle = art; g.beginPath(); g.roundRect ? g.roundRect(42, 38, 126, 126, 12) : g.rect(42, 38, 126, 126); g.fill();
  g.textAlign = 'left'; g.fillStyle = '#fff'; g.font = `700 34px ${CF}`; g.fillText('FM 95.9', 192, 86);
  g.fillStyle = '#8b96a3'; g.font = `500 22px ${CF}`; g.fillText('라디오', 192, 120);
  g.fillStyle = '#263241'; g.fillRect(192, 146, 280, 5); g.fillStyle = '#9fb3c8'; g.fillRect(192, 146, 120, 5);
  // 시각
  g.fillStyle = '#fff'; g.font = `300 88px ${CF}`; g.fillText(`${two(d.getHours())}:${two(d.getMinutes())}`, 530, 120);
  g.fillStyle = '#8b96a3'; g.font = `500 24px ${CF}`; g.fillText(`${d.getMonth()+1}월 ${d.getDate()}일`, 536, 160);
  // 공조 줄
  g.fillStyle = '#0f151d'; g.fillRect(0, 196, W, 56);
  g.fillStyle = '#dfe6ee'; g.font = `600 30px ${CF}`; g.fillText('22.0°', 40, 236); g.textAlign = 'right'; g.fillText('22.0°', W-40, 236);
  g.textAlign = 'center'; g.fillStyle = '#8b96a3'; g.font = `600 22px ${CF}`; g.fillText('AUTO', W/2, 233);
  infoMat.map.needsUpdate = true;
}
drawCluster(0); drawInfo();
try{ document.fonts && document.fonts.ready.then(() => { lastKmh = -1; drawInfo(); }); }catch(e){}

/* ---------- main.js가 부르는 것 ---------- */
// 매 프레임: 실내를 눈(카메라)에 붙이고, 핸들을 돌리고, 계기판 속도를 바꾼다(바뀔 때만 다시 그림)
function updateCabin(steerDeg, kmh){
  cabin.position.copy(camera.position); cabin.quaternion.copy(camera.quaternion);
  wheelSpin.rotation.z = -steerDeg*Math.PI/180;   // + = 오른쪽으로 돌림(운전자가 볼 때 시계 방향)
  const m = new Date().getMinutes();
  if(kmh !== lastKmh || m !== lastMin){ drawCluster(kmh); if(m !== lastMin) drawInfo(); lastKmh = kmh; lastMin = m; }
}
function setCabinLight(night){
  cabinNight = night;
  cabinScene.environment = scene.environment;
  cHemi.color.copy(lin(night ? '#3a4660' : '#e6ecf3')); cHemi.groundColor.copy(lin(night ? '#050505' : '#3b3b3b')); cHemi.intensity = night ? .08 : 1.25;
  cKey.color.copy(lin(night ? '#9fb2e6' : '#ffffff')); cKey.intensity = night ? .05 : 1.15;
  cFill.intensity = night ? .03 : .45;
  cGlow.intensity = night ? .5 : 0;
  CM.ambient.emissiveIntensity = night ? .45 : 0;
  // 화면 밝기: 실제 차처럼 밤엔 낮춤
  const k = night ? .58 : 1;
  for(const mt of [clusterMat, infoMat]) mt.color.setScalar(k);
}
// HUD 상자의 아래끝을 대시보드 윗선(카울) 바로 위에 맞춘다 — 실내가 카메라에 붙어 있어 화면 높이는 시야각만으로 정해짐
function cowlBottomPct(){
  const t = (-COWL.y)/(-COWL.z), half = Math.tan(camera.fov/2*Math.PI/180);
  return (.5 - t/(2*half))*100;   // 아래에서 잰 %
}
