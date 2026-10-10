/* ============================================================
   config.js — 공용 헬퍼 · 상수 · 경로 곡선
   (가장 먼저 로드. 이후 maps.js → scene.js → hud.js → main.js 순서)
   ============================================================ */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (x,a=0,b=1) => Math.min(b,Math.max(a,x));
const FONT = '"IBM Plex Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
const SVGNS = 'http://www.w3.org/2000/svg';
// 청록 = 어디로(경로·들어갈 차로·갈 방향) / 초록 = 지금 해도 됨 / 주황 = 서두름·정체 / 빨강 = 대기·위험 (ISO 2575 색 의미와 같은 방향)
// v1.4: 청록은 HUD의 주인공이라 채도를 올림(#46e6ff → #00e5ff)
const C_NOW = '#00e5ff', C_GO = '#3ddc84', C_WARN = '#ffb020', C_DANGER = '#ff4d4d';

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
const LANE = 3.5, FORK_Z = -230, CHANGE_END = -205, SPEED = 18, CAR_SPEED = 27;
// 정체(교통 혼잡): 목표 차로 대기열. 레벨별 대기열 뒤끝 z(운전자 쪽으로 얼마나 길게 밀리는지)
const JAM_LV = {0:null, 1:{back:-150}, 2:{back:-70}};
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
  joinN: [1, 4], joinDv: [10, 25]   // 정체 판: 목표 차로 뒤에서 줄 끝으로 달려와 붙는 차 대수 · 나보다 빠른 km/h (첫 차 도착 · 간격은 rearArrive · rearGap)
};
const V = (x,z) => new THREE.Vector3(x,0,z);
const curveOf = (pts,div) => { const c = new THREE.CatmullRomCurve3(pts,false,'centripetal'); c.arcLengthDivisions = div; return c; };
