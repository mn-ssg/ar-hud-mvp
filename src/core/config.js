/* ============================================================
   config.js — 공용 헬퍼 · 상수 · 경로 곡선
   (가장 먼저 로드. 이후 guide.js → maps.js → scene.js … → main.js 순서 — index.html · README.md)
   ============================================================ */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (x,a=0,b=1) => Math.min(b,Math.max(a,x));
const FONT = '"IBM Plex Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
const SVGNS = 'http://www.w3.org/2000/svg';
// 청록 = 어디로(경로·들어갈 차로·갈 방향) / 초록 = 지금 해도 됨 / 주황 = 서두름·정체 / 빨강 = 대기·위험 (ISO 2575 색 의미와 같은 방향)
// v1.4: 청록은 HUD의 주인공이라 채도를 올림(#46e6ff → #00e5ff)
const C_NOW = '#00e5ff', C_GO = '#3ddc84', C_WARN = '#ffb020', C_DANGER = '#ff4d4d';
// 시뮬레이터 환경 버전 — 기록에 남김. 2.0 (2026-10-29): 미러 · 차량 · 보행자 · 노면 재질 · 계기판 · 고정 간격 주행 계산 · 차종별 충돌 크기.
// 1차 실험(환경 1.x)과 HUD를 비교할 때 이 차이가 섞인다 — 개선 전 · 후 HUD는 같은 2.0 환경에서 비교할 것
const ENV_VER = '2.1';   // 2.1 (2026-11-07): 깜빡이(Q · E) + 옮길 차로 뒤차의 양보 반응 · ⑤ 버스 정류장 흐름 · 미니 도로 도로 기준 · 차량 깜빡이 등 — 2.0 기록과 교통이 같지 않음(같은 seed라도 뒤차 반응 난수가 더해짐)

// 안내 카드 · 버튼 아이콘 (글자 대신 그림, 24×24 선 아이콘, 색은 글자색을 따름)
const ICON = {
  play:'<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>',
  replay:'<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4"/>',
  test:'<circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V9.5M9.5 3h5M18 7l1.5-1.5"/>',
  next:'<path d="M4.5 12h11M11 6.5l5.5 5.5-5.5 5.5M19.5 5.5v13"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  cross:'<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  stop:'<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
  wait:'<path d="M9 6v12M15 6v12"/>',
  L:'<path d="M19 12H5.5M11 6l-6 6 6 6"/>',
  S:'<path d="M12 19V5.5M6 11l6-6 6 6"/>',
  R:'<path d="M5 12h13.5M13 6l6 6-6 6"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon:'<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>'
};
const ico = (name, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ''}</svg>`;

// 폰트 미리 로드 (비차단)
try{ document.fonts && document.fonts.load('700 60px "IBM Plex Sans KR"'); }catch(e){}

/* ---------- 주행 · 정체 상수 ---------- */
// 운전자 눈: 차 중심선에서 왼쪽 DRIVER_X m(좌핸들 운전석, 추정값), 높이 EYE_Y m. 근거 · 한계는 01_프로젝트/12_운전석_실내_설계.md
const DRIVER_X = .37, EYE_Y = 1.25;
// HUD 상자 크기 — 장면 카메라 각도(세로 화각 58°) 기준, 현대 · 2차 HUD 같은 상자 (cabin.js layoutCabin이 px로)
// D114(2026-11-07 저녁): 조사값 10° × 5.2°(10_HUD_GUI_설계.md 0-13절) → 화면에서 너무 작음(참가자 눈엔 3.5°). D116(같은 날 밤, 사용자 결정): 참가자 눈 기준 10°(481px)는 너무 커서 장면 각도 14°로 — 0-14절
const HUD_DEG = {w:14, h:14*270/520};   // 가로 · 세로 시야각(°, 상자 520×270 비율 유지)
const LANE = 3.5, FORK_Z = -230, CHANGE_END = -205, SPEED = 18, CAR_SPEED = 27;
// 정체(교통 혼잡): 목표 차로 대기열. 레벨별 대기열 뒤끝 z(운전자 쪽으로 얼마나 길게 밀리는지)
// D67: '정체 없음 · 정체' 두 가지만. 정체 = 예전 보통(-150)과 심함(-70)의 중간 — 심함은 끼어들 때 줄이 너무 길어 급하게 서야 했음(사용자).
// 시연 · 주행 테스트가 같은 값. 번호 3은 예전 기록(1 보통 · 2 심함)과 섞이지 않게 새로 붙임 (session.js situName)
const JAM_LV = {0:null, 3:{back:-110}};
const Q_FRONT = -214, Q_SPACE = 6.8, Q_WAVE = 2.6, Q_MERGE = 9.8;
// 핸들: 1초 앞(18m) 경로 지점을 겨눠 조향. 실제 조향비 15:1 그대로면 차로 변경 때 5° 안팎이라 안 보여 2.5배 과장
const WHEELBASE = 2.8, STEER_RATIO = 15, STEER_GAIN = 2.5, STEER_LOOK = 18;
/* ---------- 주행 테스트: 키보드 직접 운전 (D57~D60, 01_프로젝트/14_주행테스트_설계.md) ----------
   값은 Claude 판단 · 파일럿에서 조정. [가정] 표시는 근거 없는 기준값 */
const DRV = {
  cruise: SPEED, vMax: 27.8,                 // 손 떼면 65 km/h 순항(SCC처럼 앞차 따라감) · ↑ 최고 100 km/h
  acc: 2.6, brake: 7, coastUp: 1.2, coastDown: 1.0,   // m/s²
  steerUp: 1.8, steerBack: 3,                // 핸들 입력이 차오르는 / 돌아오는 빠르기 (1/s)
  latMax: 3.2, wheelMax: .5,                 // 최대 옆 가속(m/s²) · 저속 최대 앞바퀴 각(rad)
  carW: 1.85, carL: 4.6,
  ttcRisk: 2, gapRisk: 4,                    // 위험 끼어들기 [가정]
  hudTtc: 3.5, hudGap: 10,                   // 우리 HUD '대기' 기준 [가정]
  bswTtc: 3, bswBack: 15,                    // 현대 HUD 후측방 경고 기준
  settle: 1.0, commitGap: 3,                 // 차로 '자리 잡음' 허용 폭 · 출구 확정 거리(m)
  endAfter: 70, wrongEnd: 2.5, timeout: 60
};
/* 난이도 (D61 — 사용자: '너무 쉬움, 충돌이 더 나고 끼어들기가 많이 어렵게'). 값을 키우면(aiSee · aiDec · accDec는 줄이면) 어려워진다.
   두 HUD 블록은 같은 교통 번호(seed)를 써서 같은 난이도 */
const HARD = {
  rearN: [1, 5], rearDv: [15, 35], rearArrive: [1.5, 4], rearGap: [6, 22],   // 뒤차: 대수(판마다 1대 ~ 무리) · 나보다 빠른 km/h · 첫 차가 내 옆에 오는 초(늘 옮기기 전에 마주치게, D64) · 차 사이 범퍼 간격(m, 촘촘 ~ 듬성)
  aiSee: 1.3,       // AI 차가 끼어드는 내 차를 앞차로 알아채는 옆 거리(m, 차로 반폭 1.75) — 작을수록 늦게 반응
  aiLag: .8,        // AI 차가 내 속도 변화를 알아채는 데 걸리는 시간(초) — 급하게 서면 뒤차가 늦게 밟음
  aiDec: 5,         // AI 차가 나 때문에 밟을 수 있는 최대 감속(m/s²) — 급정거를 못 함
  accDec: 3.5,      // 손 뗐을 때 SCC 최대 감속(m/s²) — 급정거는 직접 ↓
  lead: [16, 26], brakeAhead: .5, brakeAt: [3.5, 8], leadDec: 6.5,   // 내 차로 앞차 거리(m) · 급정거 판 비율 · 급정거 시점(초) · 감속(m/s², 완전히 섬)
  tail: [12, 18],   // 급정거 판이 아니면: 내 차로 뒤에 바짝 붙어 오는 차 거리(m, 차 중심)
  qGap: [6.2, 8], qWideEvery: [3, 5], qWideGap: [10, 12],   // 정체 줄 차 간격(중심 m) · 줄 차 몇 대마다 넓은 틈 하나(늘 생김 — 기다리면 들어갈 수 있게) · 그 간격
  qWave: .8,        // 정체 멈췄다 가기 물결 세기 (0이면 일정한 속도)
  qMean: .5, qMeanFor: 1.5,   // 옆에서 끼어들려 하면 앞차에 바짝 붙어 틈을 막는 줄 차 비율 · 그만큼(초) 버티면 양보
  joinN: [1, 4], joinDv: [10, 25],  // 정체 판: 목표 차로 뒤에서 줄 끝으로 달려와 붙는 차 대수 · 나보다 빠른 km/h (첫 차 도착 · 간격은 rearArrive · rearGap)
  // 2026-11-03 '앞질러 끼어들기' 막기 (사용자 선택 A+B+C, 자동 운전 비교 E47 — 14_주행테스트_설계.md 0-6절). 셋 다 끄면 1차 장면:
  //  leadNear: 내 차로 앞차를 가까이(범퍼 7 ~ 11m) 두어 가속할 자리가 없게 / rearMatch: 옮길 차로 뒤차가 내 속도에 맞춰 붙어 옴(내가 가속하면 같이 가속, 끼워 주지 않는 차처럼) / stream: 뒤차 4 ~ 5대 · 간격 6 ~ 10m 흐름(안전한 틈은 맨 뒤에만)
  block: {leadNear:true, rearMatch:true, stream:true}, leadNearGap:[7, 11], streamN:[4, 5], streamGap:[6, 10], matchA:3
};
/* ---------- 우리 HUD 2.1 (개선 후, 2026-11-03 · 10주차 발표 '상태 6개'): 뒤차 단계 값 ----------
   한 곳에서만 바꾼다. [가정] 표시는 파일럿에서 정할 값. 대기(10m · 3.5초)는 1차와 같은 기준(DRV.hudGap · hudTtc = guide.js GUIDE.rearGap · rearTtc)이라 여기 없음.
   대기 → 해소는 guide.js 게이트(해제 기준 1.2배 + 0.8초 유지)를 따른다 → 경계값에서 대기 ↔ 이동이 깜빡이지 않음 */
const REAR2 = {
  detect: 60,        // 02 감지: 옮길 차로 뒤차가 이 범퍼 간격(m) 안에 들어오면 뒤차 · 간격 막대가 흐린 흰색으로 나타남 [가정]
  cautionTtc: 6,     // 03 주의: 닿기까지 시간(초)이 이 값 아래로 줄기 시작하면 주황 [가정]
  cautionGap: 25,    // 03 주의: 또는 간격이 이 m 아래 [가정]
  exitK: 1.2,        // 단계를 내릴 때는 기준을 1.2배 넉넉히(감지 → 안전 72m · 주의 → 감지 7.2초 · 30m) — 경계값 근처에서 오가지 않게 (guide.js exitK와 같은 생각)
  dwell: .4,         // 단계를 내리기 전에 그 단계에 최소 머무는 시간(초). 올릴 때(더 위험)는 바로
  // 04 대기 · 05 위험 강화 깜빡임 (2026-11-04 사용자: '너무 약함' → 켜짐 · 꺼짐 차이를 확실하게). 켜짐 · 꺼짐은 딱 끊김(사인 곡선 아님). 뒤차 · 거리 구간 · 가장자리 빛이 같은 시계를 탄다
  //   blink: 한 주기(초). 0.4 = 2.5Hz — 빛 자극 안전 기준(WCAG 2.3.1 · ISO 9241-391: 초당 3회 초과 금지) 아래, SAE J945 비상등 1 ~ 2Hz보다 조금 빠르게 '지금 위험'을 구분. 위험 강화(05)에서도 그대로(빛 넓이 · 밝기만 커짐)
  //   blinkDuty: 한 주기 중 켜져 있는 비율 / blinkLow: 꺼짐일 때 남는 밝기(0 = 완전히 꺼짐). 비교 시안 ① 2Hz · 0.05 ② 2.5Hz · 0 ③ 3Hz · 0.1 중 사용자 선택 ② (2026-11-04)
  blink: .4, blinkDuty: .5, blinkLow: 0,
  // 06 해소 신호 (2026-11-04 사용자: '띵' 하고 지나가는 초록이 너무 희미함). 한 번만, 반복 없음. 전체 길이(초) — 들어갈 차로 전체 초록(켜짐 0.1초 · 빠짐 천천히) + 빨간 점이 초록 화살표로 바뀌며 한 번 커짐 (시안 A · B · C 중 사용자 선택 A+C)
  clearT: .8,
  fade: .3,          // 뒤차 · 간격 막대가 나타나고(fade in) 사라지는(fade out) 시간(초)
  chevronV: [3, 8],  // 움직이는 뒤차의 꺾쇠 수 = 접근 속도(m/s): 이 값 미만 1개 · 사이 2개 · 이상 3개 [가정]
  bandOp: [.26, .7],  // 거리 구간(내 차 뒤부터 뒤차까지 칠함)의 투명도: 감지 범위 끝 ~ 바로 뒤 (2026-11-03 사용자 선택 7-B). 2026-11-07 2.2: [.22, .62] → [.26, .7] — 채움이 진해져 야간 측정 대비가 4.7 → 4.3으로 떨어진 것을 보충(D107)
  flowOp: .5          // 뒤에 더 오는 차가 있을 때 옮길 차로 아래쪽 흐름 띠 투명도 (사용자 선택 4-C)
};
/* ---------- 깜빡이 (2026-11-07, D103 — 01_프로젝트/14_주행테스트_설계.md 0-8절) ----------
   Q 왼쪽 · E 오른쪽. 옮길 차로에서 내 뒤 · 옆의 가장 가까운 차 한 대가 반응(양보 · 양보 안 함)하며, 반응은 판의 seed 난수(driveReset 맨 끝에서 뽑음 → 같은 seed면 두 HUD 조건에서 같고, 예전 seed의 교통 배치도 그대로).
   깜빡이를 안 켜면 지금까지처럼 양보 없음. 값은 모두 [가정] — 파일럿에서 조정 */
const BLINK = {
  yieldP: .5,          // 양보 확률 [가정]
  notice: [1, 2],      // 뒤차가 깜빡이를 알아채는 데 걸리는 시간(초) [가정]
  react: 45,           // 반응하는 뒤차: 옮길 차로에서 내 뒤 이 거리(m) 안(옆에 나란한 차 포함) [가정]
  yieldGap: 12, yieldT: .8,   // 양보: 나를 앞차로 보고 뒤로 물러남 — 최소 범퍼 간격(m) · 차간 시간(초). 틈 ≈ yieldGap + 속도 × yieldT [가정]
  yieldDec: 3.0,       // 양보 감속 한도(m/s²) — 급정거 아닌 보통 제동 [가정]
  passDv: 1.5,         // 양보 안 함: 기본 속도 + 이 값(m/s)으로 올려 그냥 지나감('씽') [가정]
  hz: 1.5,             // 깜빡임 · 똑딱 소리 주기 (실제 차 60 ~ 120회/분)
  practiceYield: true  // 연습 주행: 옮길 차로 뒤차 한 대는 반드시 양보 (결과가 일정하게)
};
/* ---------- ⑤ 정류장 버스 흐름 (2026-11-07, D104 — 11_시뮬레이터_맵_설계.md 2-4절) ----------
   앞쪽에서 천천히 오던 버스가 오른쪽 깜빡이를 켜고 정류장에 서고(비상등 · 문 열림 · 승하차), 문을 닫고 왼쪽 깜빡이를 켠 뒤 뒤차가 없으면 느리게 출발. 시연 · 주행 테스트 같은 흐름.
   내 차는 서 있는 버스를 지나 앞으로 들어갈지, 뒤에서 기다릴지, 출발하는 버스를 보고 판단한다. 값은 [가정] */
const BUS = {
  v0: 7, dec: 1.5,         // 들어올 때 속도(m/s, 25 km/h) · 감속(m/s²) → 정지 거리 16.3m
  lead: [0, 10],           // 정지 거리보다 이만큼(m) 더 앞에서 출발 — seed로 (시연은 5)
  dwell: [3, 8],           // 문 열린 시간(초) — seed로 (시연은 5.5). 짧으면 내가 옆을 지날 때 출발하는 장면이 됨
  doorT: .8, doorDelay: 1, // 문 여닫는 시간 · 선 뒤 문 열기까지(초)
  acc: .8,                 // 출발 가속(m/s²) — 버스답게 느리게
  gapBack: 25,             // 출발 전: 같은 차로 뒤 이 거리(m) 안에서 오는 차가 있으면 기다림
  peds: [1, 3], walk: 1.2  // 승하차 인원 — seed로 (시연은 2) · 걷는 속도(m/s)
};
/* 맵마다 다른 값 (일반도로 D69 — 설계 11_시뮬레이터_맵_설계.md 2-4절) */
const cruiseOf = m => (m && m.cruise) || DRV.cruise;                  // 손 떼면 순항: 고속도로 65 · 일반도로 50 km/h
const changeEndOf = m => (m && m.changeEnd) || CHANGE_END;            // 차로를 옮겨 있어야 하는 곳 (일반도로: 백색실선 시작)
const qFrontOf = m => m && m.city ? FORK_Z + 3 : Q_FRONT;             // 정체 줄 맨 앞 차 중심 z (일반도로: 정지선 바로 뒤)
const jamBackOf = (m, jam) => m && m.city ? (m.queue ? m.queue.back : null) : (JAM_LV[jam] ? JAM_LV[jam].back : null);
const CITY_DRV = {timeout:90, endAfter:30};                          // 일반도로: 한 판 최대(초) · 꺾은 뒤 끝나는 거리(m) (AI 꺾는 속도는 drive.js curveV)
const V = (x,z) => new THREE.Vector3(x,0,z);
// 호 길이 표(arcLengthDivisions): getPointAt(u)가 같은 거리마다 같은 u를 주려면 점 하나 사이마다 표본이 넉넉해야 한다.
// 2026-11-03: 경로 점을 2m 간격으로 늘린 뒤(10-29) 점이 180개 안팎이 되자 1000칸 표로는 점 사이 5칸뿐 → 시연 내 차가 같은 S.s 증가에 8 ~ 24 m/s로 흔들렸음(뒤차도 같이 덜컹). 점마다 최소 24칸
// 겹치는 점(앞 점과 1cm 안)은 뺀다 — 길이 0인 구간에 표본이 여럿 들어가면 u → t 변환이 0으로 나누어(NaN) 곡선 점이 깨진다
// u가 1을 아주 조금 넘으면(부동소수점, 예 1.0000000000000002) three.js가 표 밖을 읽어 NaN 점을 돌려준다 → 0 ~ 1로 잘라 넣는다
const curveOf = (pts,div) => { const P = pts.filter((q, i) => i === 0 || q.distanceTo(pts[i-1]) > .01); const c = new THREE.CatmullRomCurve3(P,false,'centripetal'); c.arcLengthDivisions = Math.max(div, P.length*24);
  c.getUtoTmapping = function(u, d){ return THREE.CatmullRomCurve3.prototype.getUtoTmapping.call(this, clamp(u, 0, 1), d); }; return c; };
