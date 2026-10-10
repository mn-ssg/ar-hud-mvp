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
const LANE = 3.5, FORK_Z = -230, CHANGE_END = -205, SPEED = 18, TEST_Z = -80, CAR_SPEED = 27;
// 정체(교통 혼잡): 목표 차로 대기열. 레벨별 대기열 뒤끝 z(운전자 쪽으로 얼마나 길게 밀리는지)
const JAM_LV = {0:null, 1:{back:-150}, 2:{back:-70}};
const Q_FRONT = -214, Q_SPACE = 6.8, Q_WAVE = 2.6, Q_MERGE = 9.8;
// 핸들: 1초 앞(18m) 경로 지점을 겨눠 조향. 실제 조향비 15:1 그대로면 차로 변경 때 5° 안팎이라 안 보여 2.5배 과장
const WHEELBASE = 2.8, STEER_RATIO = 15, STEER_GAIN = 2.5, STEER_LOOK = 18;
// 질문은 판단할 갈림 이만큼(m) 앞에서 (첫 갈림 기준 z = -80)
const Q_LEAD = 150;
const V = (x,z) => new THREE.Vector3(x,0,z);
const curveOf = (pts,div) => { const c = new THREE.CatmullRomCurve3(pts,false,'centripetal'); c.arcLengthDivisions = div; return c; };
