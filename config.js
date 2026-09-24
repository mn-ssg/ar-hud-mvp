/* ============================================================
   config.js — 공용 헬퍼 · 상수 · 경로 곡선
   (가장 먼저 로드. 이후 scene.js → hud.js → main.js 순서)
   ============================================================ */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (x,a=0,b=1) => Math.min(b,Math.max(a,x));
const FONT = '"IBM Plex Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
const SVGNS = 'http://www.w3.org/2000/svg';
// 청록 = 어디로(경로·내 차로) / 초록 = 지금 해도 됨 / 주황 = 서두름·정체 / 빨강 = 대기·위험 (ISO 2575 색 의미와 같은 방향)
const C_NOW = '#46e6ff', C_GO = '#3ddc84', C_WARN = '#ffb020', C_DANGER = '#ff4d4d';

// 폰트 미리 로드 (비차단)
try{ document.fonts && document.fonts.load('700 60px "IBM Plex Sans KR"'); }catch(e){}

/* ---------- 주행 · 정체 상수 ---------- */
const LANE = 3.5, FORK_Z = -230, CHANGE_END = -205, SPEED = 18, TEST_Z = -80, CAR_SPEED = 27;
// 정체(교통 혼잡): 목표 차로 대기열. 레벨별 대기열 뒤끝 z(운전자 쪽으로 얼마나 길게 밀리는지)
const JAM_LV = {0:null, 1:{back:-150}, 2:{back:-70}};
const Q_FRONT = -214, Q_SPACE = 6.8, Q_WAVE = 2.6, Q_MERGE = 9.8;
// 핸들: 1초 앞(18m) 경로 지점을 겨눠 조향. 실제 조향비 15:1 그대로면 차로 변경 때 5° 안팎이라 안 보여 2.5배 과장
const WHEELBASE = 2.8, STEER_RATIO = 15, STEER_GAIN = 2.5, STEER_LOOK = 18;
// 고스트카(가상 선행 차량): 22m(1.2초) 앞에서 달림. 차로 이동은 운전자보다 일찍(-40m 지점) 2초 동안, 그 25m 전부터 깜빡이.
// 정체 시연에선 줄 맨 뒤차 뒤(한 칸 + 물결 여유)에 선다
const GHOST_LEAD = 22, GHOST_MERGE_Z = -40, GHOST_MERGE_T = 2, GHOST_SIGNAL = 25, GHOST_GAP = Q_SPACE + Q_WAVE;
const DEST = [
  {name:'서울·과천', side:'왼쪽'},
  {name:'안양·의왕', side:'가운데'},
  {name:'수원·영통', side:'오른쪽'}
];
const BRANCH_PTS = [
  [[-3.5,-230],[-5.2,-262],[-12,-305],[-28,-352],[-50,-400],[-78,-450],[-108,-500],[-140,-550]],
  [[0,-230],[0,-290],[0,-350],[0,-410],[0,-470],[0,-530],[0,-590]],
  [[3.5,-230],[5.2,-262],[12,-305],[28,-352],[50,-400],[78,-450],[108,-500],[140,-550]]
];
const V = (x,z) => new THREE.Vector3(x,0,z);
const curveOf = (pts,div) => { const c = new THREE.CatmullRomCurve3(pts,false,'centripetal'); c.arcLengthDivisions = div; return c; };
const branchCurves = BRANCH_PTS.map(p => curveOf(p.map(a=>V(a[0],a[1])),400));
