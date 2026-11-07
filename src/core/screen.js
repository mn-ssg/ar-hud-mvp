/* ============================================================
   screen.js — 화면 맞추기 · 참가자 눈 기준 각도 (D116, 2026-11-07 밤, 사용자 4차 요청 J)
   · 왜: D114는 HUD 크기를 '장면 카메라 각도'(세로 화각 58°)로 정했다. 그런데 참가자는 장면을 노트북 화면으로 보고, 화면이 참가자 눈에 차지하는 각도는 세로 20° 안팎이라
     장면 속 모든 것이 실제보다 약 3배 작게 보인다 → '장면 속 10°' HUD가 눈에는 3.5°. 그래서 HUD는 **참가자 눈에서** 실제 HUD와 같은 각도(가로 10° × 세로 5.2°, 10_HUD_GUI_설계.md 0-13절 조사값)로 보이게 한다
   · 브라우저는 화면의 실제 cm를 모른다 → 연구자가 한 번 맞춘다(신용카드 ISO/IEC 7810 ID-1 85.60 × 53.98 mm 사각형을 실제 카드에 맞춤) + 보는 거리(cm). localStorage에 저장, 기록 한 줄마다 같이 남긴다
   · 기본값(맞추기 전): 이 작업을 한 맥 — MacBook Pro 14(Mac16,8, M4 Pro), 내장 3024 × 1964, 대각 14.2인치 = 36.07 cm → 화소 비율로 가로 30.26 cm [가정: 활성 영역을 대각선 규격에서 계산]. CSS px 폭(screen.width) ÷ 30.26
   · 2026-11-07 밤 사용자 결정: HUD 크기는 참가자 눈 기준(481px)이 아니라 장면 각도 14°(config.js HUD_DEG)로. 이 모듈은 **기록 · 환산용**으로만 남김 — HUD가 참가자 눈에 몇 도였는지 되짚을 수 있게(기록 칸 4개)
   config.js 다음에 로드
   ============================================================ */
const SCR = {pxPerCm:null, distCm:55, model:'MacBook Pro 14 (Mac16,8) 내장 화면', widthCm:30.26, key:'arhud.screen'};
SCR.load = () => { try{ const v = JSON.parse(localStorage.getItem(SCR.key) || 'null'); if(v && v.pxPerCm > 0) SCR.pxPerCm = v.pxPerCm; if(v && v.distCm > 0) SCR.distCm = v.distCm; }catch(e){} };
SCR.save = () => { try{ localStorage.setItem(SCR.key, JSON.stringify({pxPerCm:SCR.pxPerCm, distCm:SCR.distCm})); }catch(e){} };
SCR.calibrated = () => SCR.pxPerCm !== null;
SCR.ppc = () => SCR.pxPerCm ?? (screen.width/SCR.widthCm);                       // 화면 1cm당 CSS px (맞추기 전엔 기본값 [가정])
SCR.pxOfDeg = deg => 2*SCR.distCm*Math.tan(deg*Math.PI/360)*SCR.ppc();          // 참가자 눈 기준 각도 → px
SCR.degOfPx = px => 2*Math.atan(px/SCR.ppc()/2/SCR.distCm)*180/Math.PI;          // px → 참가자 눈 기준 각도
SCR.arcminOfPx = px => SCR.degOfPx(px)*60;
SCR.load();
