/* ============================================================
   cabin.js — 운전석 실내: Higgsfield 이미지 층 (2026-11-07, D111 — 1안)
   · 실내는 운전자 눈(카메라)에 늘 붙어 있어 화면에서 자리가 변하지 않는다 → 3D(예전 cabin.js: 회색 상자 · 판)를 버리고 사진풍 이미지를 WebGL 캔버스 위에 겹친다
   · 층: ① 바탕(assets/cabin/base.webp — 대시보드 · 계기판 후드 · 센터 화면 테 · A필러 · 앞유리 틀, 앞유리는 크로마키로 뚫어 투명)
         ② 계기판 캔버스(clusterCv) · 센터 화면 캔버스(infoCv): 바탕 이미지의 꺼진 유리 자리(CAB.cluster · CAB.info, 이미지 비율 좌표)에 맞춰 얹음
         ③ 핸들(assets/cabin/wheel.webp, 정면 투명 PNG) — CSS 3D(perspective + rotateX 기울기 + rotateZ 조향각)로 돌림
         ④ 야간 덮개: 어둡게 + 화면 빛이 주변을 비춤 (주간 이미지 하나에 코드로 얹음 — 야간 이미지를 따로 만들면 선이 어긋남)
   · 배치: 바탕 이미지를 세로로 꽉 채우고(cover) 계기판이 운전자 정면에 오도록 가로 기준점(CAB.anchorX)을 화면 가운데에. 넓은 화면은 가로로 더 보임
   · HUD 상자(#hudWrap)는 각도(config.js HUD_DEG)를 px로 바꿔 놓는다 (D114) — 아래끝이 대시보드 윗선(CAB.cowl)보다 2.5% H 위에 못 오면 그만큼 올림. 룸미러(mirrors.js MIR.layout)도 여기서 다시 놓음
   · 계기판에 보이는 것: 속도 · 기어 D · 깜빡이 화살표 · 제한속도 표지만. 길 안내 화살표 · 남은 거리 · 후측방 경고는 넣지 않는다(HUD 두 조건 비교에 다른 정보원이 끼면 안 됨). 센터 화면은 글자 없는 지도 + 내 차 점
   · 이미지를 못 불러오면 단순한 어두운 대시보드(CSS)만 남는다
   scene.js 다음, hud.js 전에 로드. main.js가 updateCabin(steer, kmh, blink) · setCabinLight(night)를 부른다
   ============================================================ */

// 바탕 이미지(2688 × 1152, 21:9)에서 잰 자리 — 이미지 너비 · 높이 비율 (2026-11-07 측정: 꺼진 유리의 어두운 영역)
const CAB = {
  aspect:2688/1152, cowl:.621, anchorX:.39,            // 앞유리 아래 경계(가운데) · 계기판 가운데 x → 화면 가운데에 둘 기준점
  cluster:{x0:.2682, y0:.7075, x1:.5071, y1:.9089},   // 계기판 유리
  info:{x0:.5804, y0:.6797, x1:.8631, y1:.8819},      // 센터 화면 유리
  wheel:{cx:.39, cy:.93, d:.60, tilt:24}             // 핸들: 가운데(화면 비율) · 지름(화면 높이 비율) · 기울기(°, 위가 멀어짐)
};
const cabinEl = document.getElementById('cabin');
const cabinBase = cabinEl.querySelector('#cabinBase'), wheelImg = cabinEl.querySelector('#cabinWheel'), cabinNight = cabinEl.querySelector('#cabinNight');
const clusterCv = cabinEl.querySelector('#clusterCv'), infoCv = cabinEl.querySelector('#infoCv');
clusterCv.width = 768; clusterCv.height = 252; infoCv.width = 900; infoCv.height = 252;
let cabinNightOn = false, lastKmh = -1, lastMin = -1, lastBlink = 0, lastLim = 0, mapImg = null;
const CF = '"Pretendard Variable","Pretendard",' + FONT;
const two = n => String(n).padStart(2, '0');

/* ---------- 배치 (창 크기마다) ---------- */
let LAY = null;
const hudWrap = $('#hudWrap');
function layoutCabin(){
  const W = cab.clientWidth, H = cab.clientHeight;
  const s = Math.max(H/1152, W/2688), iw = 2688*s, ih = 1152*s;                 // 세로 꽉 채우기, 넓으면 가로 기준
  let left = W/2 - CAB.anchorX*iw; left = Math.min(0, Math.max(W - iw, left));   // 계기판을 가운데에, 빈틈은 안 나게
  const top = H - ih;
  LAY = {W, H, s, iw, ih, left, top};
  cabinBase.style.cssText = `left:${left}px;top:${top}px;width:${iw}px;height:${ih}px`;
  const box = (r, el) => { el.style.cssText = `left:${left + r.x0*iw}px;top:${top + r.y0*ih}px;width:${(r.x1 - r.x0)*iw}px;height:${(r.y1 - r.y0)*ih}px`; };
  box(CAB.cluster, clusterCv); box(CAB.info, infoCv);
  const wd = CAB.wheel.d*H, wx = left + CAB.wheel.cx*iw, wy = CAB.wheel.cy*H;
  wheelImg.style.cssText = `left:${wx - wd/2}px;top:${wy - wd/2}px;width:${wd}px;height:${wd}px`;
  cabinNight.style.setProperty('-webkit-mask-size', `${iw}px ${ih}px`); cabinNight.style.setProperty('mask-size', `${iw}px ${ih}px`); cabinNight.style.setProperty('-webkit-mask-position', `${left}px ${top}px`); cabinNight.style.setProperty('mask-position', `${left}px ${top}px`);
  cabinNight.style.setProperty('--cl-x', `${left + (CAB.cluster.x0 + CAB.cluster.x1)/2*iw}px`); cabinNight.style.setProperty('--cl-y', `${top + (CAB.cluster.y0 + CAB.cluster.y1)/2*ih}px`);
  cabinNight.style.setProperty('--in-x', `${left + (CAB.info.x0 + CAB.info.x1)/2*iw}px`); cabinNight.style.setProperty('--in-y', `${top + (CAB.info.y0 + CAB.info.y1)/2*ih}px`);
  // HUD 상자 (D114): 각도 → px. 화면 중심 = 시선, 세로 화각 58° → 1 tan 단위 = ppt px. 가로 폭은 시야각 HUD_DEG.w, 세로는 상자 비율(520:270)로 따라감
  const ppt = H/(2*Math.tan(camera.fov*Math.PI/360)), hw = 2*Math.tan(HUD_DEG.w*Math.PI/360)*ppt, hh = hw*270/520;
  let bottomY = H/2 + Math.tan((HUD_DEG.down + HUD_DEG.h/2)*Math.PI/180)*ppt;   // 아래끝(위에서 잰 y)
  const cowlY = top + CAB.cowl*ih, lim = cowlY - .025*H; if(bottomY > lim) bottomY = lim;   // 넓은 창(가로 기준 확대)에서 대시보드가 올라오면 그 위로
  hudWrap.style.width = hw.toFixed(1) + 'px'; hudWrap.style.bottom = (H - bottomY).toFixed(1) + 'px';
  LAY.hud = {w:hw, h:hh, bottomY, cowlY, downBottom:Math.atan((bottomY - H/2)/ppt)*180/Math.PI, degH:2*Math.atan(hh/2/ppt)*180/Math.PI};
  if(typeof MIR !== 'undefined' && MIR.layout) MIR.layout();   // 룸미러는 이미지 받침 자리에 (mirrors.js)
}
new ResizeObserver(layoutCabin).observe(cab); layoutCabin();
cabinBase.onerror = () => { cabinEl.classList.add('fallback'); console.warn('실내 이미지를 못 불러와 단순 대시보드로 둠'); };
wheelImg.onerror = () => { wheelImg.style.display = 'none'; };

/* ---------- 계기판 · 센터 화면 ---------- */
// 계기판: 속도 · 기어 · 깜빡이 · 제한속도 표지. blink = 켜진 쪽(−1 · 1), 꺼진 순간 0
function drawCluster(kmh, blink = 0, lim = 80){
  const g = clusterCv.getContext('2d'), W = clusterCv.width, H = clusterCv.height;
  g.fillStyle = '#06080b'; g.fillRect(0, 0, W, H);
  const cx = W/2, cy = 138, r = 92, a0 = Math.PI*.78, a1 = Math.PI*2.22;
  g.lineCap = 'round'; g.lineWidth = 6; g.strokeStyle = '#1b232d'; g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
  g.strokeStyle = '#a9c7ec'; g.beginPath(); g.arc(cx, cy, r, a0, a0 + (a1-a0)*clamp(kmh/200)); g.stroke();
  g.textAlign = 'center'; g.fillStyle = '#f2f5f8'; g.font = `600 78px ${CF}`; g.fillText(kmh, cx, cy + 24);
  g.font = `500 19px ${CF}`; g.fillStyle = '#8b96a3'; g.fillText('km/h', cx, cy + 54);
  g.font = `700 42px ${CF}`; g.fillStyle = '#f2f5f8'; g.fillText('D', 196, 150);   // 핸들 테에 가리지 않게 안쪽으로
  // 제한속도 표지(오른쪽): 흰 원 · 빨간 테 · 숫자
  g.beginPath(); g.arc(W - 196, 138, 36, 0, 6.3); g.fillStyle = '#f4f4f2'; g.fill(); g.lineWidth = 8; g.strokeStyle = '#d8232a'; g.stroke();
  g.fillStyle = '#111'; g.font = `700 32px ${CF}`; g.fillText(lim, W - 196, 149);
  // 깜빡이 화살표 (D103): 위 양쪽 초록, 켜진 쪽만
  for(const s of [-1, 1]){ if(blink !== s) continue; const cx0 = W/2 + s*96, y = 52; /* 핸들 테 안쪽에 보이게 가운데 가까이 */ g.fillStyle = '#3ddc84'; g.beginPath(); g.moveTo(cx0 + s*16, y); g.lineTo(cx0 - s*4, y - 12); g.lineTo(cx0 - s*4, y - 5); g.lineTo(cx0 - s*18, y - 5); g.lineTo(cx0 - s*18, y + 5); g.lineTo(cx0 - s*4, y + 5); g.lineTo(cx0 - s*4, y + 12); g.closePath(); g.fill(); }
}
// 센터 화면: 글자 없는 지도(assets/cabin/map.jpg) + 내 차 점 · 시각 · 공조 줄. 차로 · 갈림 안내는 넣지 않는다
function drawInfo(){
  const g = infoCv.getContext('2d'), W = infoCv.width, H = infoCv.height, d = new Date();
  g.fillStyle = '#0b0e12'; g.fillRect(0, 0, W, H);
  if(mapImg){ g.drawImage(mapImg, 0, 0, W, H - 50); g.fillStyle = 'rgba(8,10,14,.18)'; g.fillRect(0, 0, W, H - 50);
    g.beginPath(); g.arc(W*.46, (H - 50)*.6, 11, 0, 6.3); g.fillStyle = '#2f7bff'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke(); }   // 내 차 위치
  g.fillStyle = '#0d1218'; g.fillRect(0, H - 50, W, 50);
  g.textAlign = 'left'; g.fillStyle = '#c9d2dc'; g.font = `600 24px ${CF}`; g.fillText('22.0°', 28, H - 16); g.textAlign = 'right'; g.fillText('22.0°', W - 28, H - 16);
  g.textAlign = 'center'; g.fillStyle = '#e6ebf0'; g.font = `500 24px ${CF}`; g.fillText(`${two(d.getHours())}:${two(d.getMinutes())}`, W/2, H - 16);
}
(() => { const im = new Image(); im.onload = () => { mapImg = im; drawInfo(); }; im.src = 'assets/cabin/map.jpg'; })();
drawCluster(0, 0, 80); drawInfo();
try{ document.fonts && document.fonts.ready.then(() => { lastKmh = -1; drawInfo(); }); }catch(e){}

/* ---------- main.js가 부르는 것 ---------- */
function updateCabin(steerDeg, kmh, blink = 0){
  wheelImg.style.transform = `perspective(900px) rotateX(${CAB.wheel.tilt}deg) rotateZ(${steerDeg.toFixed(1)}deg)`;   // + = 오른쪽으로 돌림(시계 방향)
  const m = new Date().getMinutes(), lim = (S.map && S.map.limit) || 80;
  if(kmh !== lastKmh || m !== lastMin || blink !== lastBlink || lim !== lastLim){ drawCluster(kmh, blink, lim); if(m !== lastMin) drawInfo(); lastKmh = kmh; lastMin = m; lastBlink = blink; lastLim = lim; }
}
function setCabinLight(night){
  cabinNightOn = night; cabinEl.classList.toggle('night', night);
}
// HUD 상자의 아래끝 = 대시보드 윗선(앞유리 아래 경계) 바로 위 (화면 아래에서 잰 %)
/* 깜빡이 똑딱 소리 (D103): 파일 없이 WebAudio로 짧은 클릭(켜짐 높은 음 · 꺼짐 낮은 음, 30ms, 작게). 브라우저가 소리를 막으면(사용자 조작 전) 조용히 건너뜀 */
const SND = {ctx:null};
function cabinTick(on){
  try{
    if(!SND.ctx) SND.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const c = SND.ctx; if(c.state === 'suspended') c.resume();
    const t0 = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'square'; o.frequency.value = on ? 1800 : 1300;
    g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(on ? .03 : .022, t0 + .003); g.gain.exponentialRampToValueAtTime(.0001, t0 + .03);
    o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + .035);
  }catch(e){}
}
