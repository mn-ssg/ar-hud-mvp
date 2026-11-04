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

/* ---------- 재질 ---------- */
const grainTex = (base, amp, n) => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for(let i=0;i<n;i++){ const v = Math.random() < .5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${Math.random()*amp})`; g.fillRect(Math.random()*w, Math.random()*h, 1.5, 1.5); }
}, true);
const softTex = grainTex('#8a8d93', .06, 9000); softTex.repeat.set(8, 8);      // 대시보드 소프트 플라스틱(무광 결)
const leatherTex = grainTex('#8a8b90', .12, 7000); leatherTex.repeat.set(24, 2);
const CM = {
  dash:  new THREE.MeshStandardMaterial({map:softTex, color:lin('#3b3d42'), roughness:.92, envMapIntensity:.18}),
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
  [-.574, -.36], [-1.1, -.36]], -1.1, 1.36, CM.dash);   // 왼쪽 끝 −1.1: 문 안쪽까지 (2026-10-29 — 예전 −0.62에서 끝나 왼쪽 아래로 도로가 보였음)
extrudeX([[-.574, -.36], [-.55, -.47], [-.47, -.62], [-.62, -.82], [-1.1, -.82], [-1.1, -.36]], -1.1, 1.36, CM.dashLow);
cadd(new THREE.BoxGeometry(1.9, .016, .012), CM.band, .37, -.318, -.576);                     // 가로 금속 띠

cadd(new THREE.BoxGeometry(1.9, .013, .012), CM.piano, .37, -.336, -.577);                     // 얇은 송풍구 틈
for(const x of [-.38, .2, .55, 1.0]) for(let k=0;k<4;k++) cadd(new THREE.BoxGeometry(.003, .011, .014), CM.satin, x + k*.022, -.336, -.574);   // 송풍구 날개
cadd(new THREE.BoxGeometry(1.9, .0022, .004), CM.ambient, .37, -.3055, -.5765);                // 무드등 띠

/* 2026-10-29: 대시보드 표면 소재 구분 — 윗면 패드(가죽 결 · 박음질 두 줄) / 앞유리 밑 서리 제거 송풍구 / 유리 아래끝 검은 세라믹 띠 */
const padTex = canvasTex(256, 256, (g, w, h) => {   // 가죽 결: 작은 주름 점
  g.fillStyle = '#7e8187'; g.fillRect(0, 0, w, h);
  for(let i = 0; i < 5200; i++){ const v = Math.random() < .5 ? 40 : 200; g.fillStyle = `rgba(${v},${v},${v},${Math.random()*.08})`; g.beginPath(); g.ellipse(Math.random()*w, Math.random()*h, 1 + Math.random()*1.6, .6 + Math.random(), Math.random()*3, 0, 6.3); g.fill(); }
}, true); padTex.repeat.set(10, 6);
CM.pad = new THREE.MeshStandardMaterial({map:padTex, color:lin('#34363a'), roughness:.78, envMapIntensity:.25});
CM.stitch = new THREE.MeshStandardMaterial({color:lin('#55585e'), roughness:.8});
CM.frit = new THREE.MeshBasicMaterial({map:canvasTex(8, 64, (g, w, h) => { const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(6,7,9,1)'); gr.addColorStop(.55, 'rgba(6,7,9,.9)'); gr.addColorStop(1, 'rgba(6,7,9,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }), transparent:true, depthWrite:false});
// 윗면 패드: 대시보드 윗면 모양을 따라 1.5mm 위에 얹은 판 (운전자 앞 ~ 조수석 앞)
extrudeX([[-.93, -.2155], [-.90, -.2205], [-.80, -.2435], [-.70, -.2605], [-.64, -.2685], [-.64, -.2725], [-.93, -.2195]], -.6, 1.34, CM.pad);
for(const [z, y] of [[-.905, -.2185], [-.648, -.2672]]) for(let x = -.58; x < 1.33; x += .012) cadd(new THREE.BoxGeometry(.006, .0011, .0018), CM.stitch, x, y + .001, z);   // 박음질 (패드와 비슷한 색 — 도로 선처럼 튀지 않게)
// 서리 제거 송풍구: 앞유리 밑 가로 홈 + 날개
cadd(new THREE.BoxGeometry(1.5, .003, .03), CM.piano, .37, -.2122, -.985);   // 서리 제거 송풍구 홈 (날개는 홈 안에 숨어 보이지 않음)
// 앞유리 아래끝 검은 세라믹 띠 (위로 갈수록 옅어짐)
cadd(new THREE.PlaneGeometry(2.6, .035), CM.frit, .37, COWL.y + .016, COWL.z - .005, -.25);

/* ---------- 파노라마 디스플레이: 계기판(운전자 정면) + 센터 화면(오른쪽)을 한 유리로 ----------
   2026-11-04 (사용자: 계기판이 아래에서 잘리고 오른쪽으로 쏠림 — 원인은 창 크기가 아니라 값):
   · 세로 자리는 카메라 세로 시야각(58°)이 정해 창 크기 · 비율과 무관(계기판은 늘 화면 높이의 70 ~ 81%). '잘림'은 핸들 테 윗부분이 계기판 아래 테두리(화면 19.8°)를 덮은 것 → 핸들을 4.5cm 내려 틈을 둠
   · 가로: 계기판 유리는 눈 정면(x = 0)이었지만 속도계를 유리 왼쪽 1/3에 그렸고, 센터 화면이 오른쪽 0.61m까지 뻗어 전체가 오른쪽으로 쏠려 보였다(좁은 창 + 설정 열림(비율 1.35)에선 오른쪽 끝이 잘림).
     → 속도계를 유리 가운데(= 눈 정면 = 핸들 가운데)에, 센터 화면을 0.42 → 0.34m로 줄이고 유리 전체를 왼쪽으로 옮겨 오른쪽 끝 0.52m(비율 1.3까지 다 보임). 가로 폭은 창 비율을 따라 늘고 줄 뿐 가운데는 늘 화면 가운데 */
const PANEL = {x:.17, y:-.205, z:-.74, tilt:-.12};
const panel = new THREE.Group(); panel.position.set(PANEL.x, PANEL.y, PANEL.z); panel.rotation.x = PANEL.tilt; cabin.add(panel);
cadd(rrBox(.70, .112, .022, .018), CM.piano, 0, 0, -.004, 0, 0, 0, panel);
cadd(new THREE.BoxGeometry(.71, .008, .06), CM.dash, 0, .059, -.022, 0, 0, 0, panel);   // 위 차양(빛 가림 턱)
cadd(new THREE.BoxGeometry(.04, .03, .12), CM.dash, -.05, -.06, -.05, 0, 0, 0, panel);  // 받침
const clusterCv = document.createElement('canvas'); clusterCv.width = 768; clusterCv.height = 252;
const infoCv = document.createElement('canvas'); infoCv.width = 900; infoCv.height = 252;
const screenMat = cv => { const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = MAX_ANISO; return new THREE.MeshBasicMaterial({map:t, toneMapped:false}); };
const clusterMat = screenMat(clusterCv), infoMat = screenMat(infoCv);
cadd(new THREE.PlaneGeometry(.292, .092), clusterMat, -PANEL.x, -.002, .0145, 0, 0, 0, panel);   // 계기판: 눈 정면(x = 0) — 유리 안 어디에 두든 이 값이 가운데
cadd(new THREE.PlaneGeometry(.34, .092), infoMat, .17, -.002, .0145, 0, 0, 0, panel);               // 센터 화면: 계기판 오른쪽 (눈에서 0.15 ~ 0.49m)

/* ---------- 핸들: 림 지름 37cm, 기둥 기울기 22° (윗부분이 앞으로 누움). 돌리는 건 wheelSpin ----------
   v1.7.1: 눈 앞 0.52 m · 아래 0.385 m(실제 자세에 가깝게). 테 윗부분이 계기판 아래끝 바로 밑(화면 위에서 ≈ 85%)에 와서
   계기판과 겹치지 않고, 화면 아래엔 테 윗부분만 크게 보인다. 가운데 패드 · 살은 화면 밖 */
const wheel = new THREE.Group(); wheel.position.set(0, -.43, -.52); wheel.rotation.x = -.384; cabin.add(wheel);   // 2026-11-04: -0.385 → -0.43 (테 윗부분이 계기판 테두리를 덮지 않게, 화면 높이 ≈ 3%의 틈)
const wheelSpin = new THREE.Group(); wheel.add(wheelSpin);
(() => {
  /* 2026-10-29: 실제 비례로 다시 — 림 지름 37cm · 굵기 3.9cm(엄지 자리 4.4cm) · 3스포크(3 · 9 · 6시) · 에어백 허브 15 × 11.5cm.
     참고 시안 assets/ref/2_7_interior.jpg. 회전축 = 핸들 면에 수직인 기둥 축(wheel 그룹의 z) — 돌리면 스포크가 함께 돈다 */
  const RIM = .185;
  cadd(new THREE.TorusGeometry(RIM, .0195, 24, 160), CM.leather, 0, 0, 0, 0, 0, 0, wheelSpin);
  for(const sx of [-1, 1]) cadd(new THREE.TorusGeometry(RIM, .022, 20, 40, Math.PI*.2), CM.leather, 0, 0, 0, 0, 0, sx > 0 ? -Math.PI*.12 : Math.PI*.92, wheelSpin);   // 엄지 자리 (2 · 10시 아래)
  cadd(new THREE.TorusGeometry(RIM, .0201, 8, 60, Math.PI*.16), CM.piano, 0, 0, 0, 0, 0, Math.PI*1.42, wheelSpin);        // 6시 쪽 유광 장식
  // 스포크: 허브 가장자리 → 림 안쪽으로 가늘어지는 판 (옆 2개 · 아래 1개)
  const spoke = (len, w0, w1, t) => { const sh = new THREE.Shape([new THREE.Vector2(0, -w0/2), new THREE.Vector2(len, -w1/2), new THREE.Vector2(len, w1/2), new THREE.Vector2(0, w0/2)]);
    const g = new THREE.ExtrudeGeometry(sh, {depth:t, bevelEnabled:true, bevelThickness:.004, bevelSize:.004, bevelSegments:2}); g.translate(0, 0, -t/2); return g; };
  for(const sx of [-1, 1]){
    const g = spoke(.11, .052, .036, .02); if(sx < 0) g.rotateZ(Math.PI);
    cadd(g, CM.leather, sx*.068, -.016, .012, 0, 0, 0, wheelSpin);
    cadd(new THREE.BoxGeometry(.075, .004, .024), CM.satin, sx*.115, .006, .016, 0, 0, 0, wheelSpin);                 // 스포크 윗선 장식
    cadd(rrBox(.058, .028, .006, .008), CM.piano, sx*.105, -.018, .027, 0, 0, 0, wheelSpin);                          // 스위치 판
    for(let k = 0; k < 3; k++) cadd(new THREE.BoxGeometry(.01, .004, .004), CM.satin, sx*(.088 + k*.017), -.018, .031, 0, 0, 0, wheelSpin);
  }
  const low = spoke(.13, .07, .05, .02); low.rotateZ(-Math.PI/2); cadd(low, CM.leather, 0, -.06, .01, 0, 0, 0, wheelSpin);
  cadd(rrBox(.15, .115, .05, .03), CM.leather, 0, -.012, .03, 0, 0, 0, wheelSpin);                                     // 에어백 허브
  cadd(rrBox(.07, .03, .006, .01), CM.piano, 0, -.006, .057, 0, 0, 0, wheelSpin);                                        // 허브 가운데 (로고 없음)
})();
cadd(new THREE.CylinderGeometry(.045, .06, .26, 16), CM.trim, 0, -.495, -.63, 1.01);   // 핸들 기둥 덮개 (핸들과 같이 4.5cm 내림)

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
/* 2026-10-29: 계기판 · 센터 화면 정리 — 운전에 쓰는 것(속도 · 기어 · 시각)만 남김.
   뺀 것: 회전수 게이지 · 누적 거리 · 차로 유지 그림 · 라디오 카드(보라 ~ 청록 앨범 그림). 참고 시안 assets/ref/0_art_day.jpg */
function drawCluster(kmh){
  const g = clusterCv.getContext('2d'), W = clusterCv.width, H = clusterCv.height, d = new Date();
  g.fillStyle = '#080b0f'; g.fillRect(0, 0, W, H);
  // 속도: 가는 호 + 큰 숫자 — 유리 가운데(= 눈 정면 = 핸들 가운데, 2026-11-04). 기어는 왼쪽, 시각은 오른쪽
  const cx = W/2, cy = 150, r = 98, a0 = Math.PI*.78, a1 = Math.PI*2.22;
  g.lineCap = 'round'; g.lineWidth = 6; g.strokeStyle = '#1b232d'; g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
  g.strokeStyle = '#a9c7ec'; g.beginPath(); g.arc(cx, cy, r, a0, a0 + (a1-a0)*clamp(kmh/200)); g.stroke();
  g.textAlign = 'center'; g.fillStyle = '#f2f5f8'; g.font = `600 84px ${CF}`; g.fillText(kmh, cx, cy + 26);
  g.font = `500 20px ${CF}`; g.fillStyle = '#8b96a3'; g.fillText('km/h', cx, cy + 58);
  // 기어 · 시각
  g.font = `700 46px ${CF}`; g.fillStyle = '#f2f5f8'; g.fillText('D', 150, 165);
  g.font = `500 22px ${CF}`; g.fillStyle = '#8b96a3'; g.fillText(`${two(d.getHours())}:${two(d.getMinutes())}`, W - 150, 160);
  clusterMat.map.needsUpdate = true;
}
function drawInfo(){
  const g = infoCv.getContext('2d'), W = infoCv.width, H = infoCv.height, d = new Date();
  g.fillStyle = '#080b0f'; g.fillRect(0, 0, W, H);
  g.textAlign = 'left'; g.fillStyle = '#e6ebf0'; g.font = `300 76px ${CF}`; g.fillText(`${two(d.getHours())}:${two(d.getMinutes())}`, 60, 118);
  g.fillStyle = '#8b96a3'; g.font = `500 24px ${CF}`; g.fillText(`${d.getMonth()+1}월 ${d.getDate()}일 · 바깥 18°C`, 64, 160);
  // 공조 줄
  g.fillStyle = '#0d1218'; g.fillRect(0, 196, W, 56);
  g.fillStyle = '#c9d2dc'; g.font = `600 28px ${CF}`; g.fillText('22.0°', 40, 234); g.textAlign = 'right'; g.fillText('22.0°', W-40, 234);
  g.textAlign = 'center'; g.fillStyle = '#7d8894'; g.font = `600 20px ${CF}`; g.fillText('AUTO', W/2, 232);
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
