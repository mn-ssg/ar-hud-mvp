/* ============================================================
   guide.js — 안내 판단 로직 (2026-10-29). DOM · THREE를 쓰지 않는다 → tests/guide.test.js로 node에서 검증
   · 차로 변경 게이트: 목표 차로의 실제 차(위치 · 속도 · 간격)로 '대기 → 확인 → 이동'. 위험은 즉시, 해제는 안정된 뒤에만
   · 위험 방향: 내 차의 지금 자세(ψ) 기준 왼쪽/오른쪽 · 뒤/옆/앞 — 목적지 방향으로 대신하지 않음
   · 안내 단계: 갈림마다 접근 → 갈림 안(출구 아직 확정 안 됨) → 완료 / 이탈 — 거리 하나로 단계를 정하지 않음
   main.js가 매 프레임 부른다(guideStep). 우리 HUD는 글자 없이 이 상태를 그래픽으로만 그린다(ourhud.js). 근거 01_프로젝트/10_HUD_GUI_설계.md 0-7절
   ============================================================ */

const GUIDE = {
  hold: .8,                    // 안전이 이만큼(초) 이어져야 '확인' → '이동' [가정 — 파일럿에서 조정]
  exitK: 1.2,                  // 대기를 풀 때는 기준을 1.2배 엄격하게 → 경계값에서 대기 ↔ 이동이 깜빡이지 않게 [가정]
  rearGap: 10, rearTtc: 3.5,   // 뒤차: 1차 실험 우리 HUD '대기' 기준(DRV.hudGap · hudTtc)과 같은 값 → 기존 수치와 같은 틀
  frontGap: 4, frontTtc: 2,    // 목표 차로 앞차: '위험한 끼어들기' 기준(DRV.gapRisk · ttcRisk)과 같은 값
  queueGap: 4, queueTtc: 2,    // 정체 줄 차가 뒤일 때: 서행 중이라 위험한 끼어들기 기준 그대로
  sideGap: 1                   // 옆에 겹쳐 있음
};

/* ---------- 차 하나가 목표 차로 진입을 막는가 ----------
   ego/c: {x, z, v, halfL} (도로 방향 = -z). 간격은 범퍼 사이(m), 접근은 도로 방향 속도 차 — 기록의 laneSafe · cutIn과 같은 틀.
   k: 기준 배수(대기 해제 때 GUIDE.exitK). 돌려줌: null(막지 않음) | {rel:'side'|'rear'|'front', gap, ttc} */
function blockOf(ego, c, k = 1){
  const dz = c.z - ego.z, gap = Math.abs(dz) - c.halfL - ego.halfL;   // dz + = 뒤
  if(gap < GUIDE.sideGap) return {rel:'side', gap, ttc:0};
  if(dz > 0){
    const q = c.kind === 'queue', cl = c.v - ego.v, ttc = cl > 0 ? gap/cl : Infinity;
    return gap < (q ? GUIDE.queueGap : GUIDE.rearGap)*k || ttc < (q ? GUIDE.queueTtc : GUIDE.rearTtc)*k ? {rel:'rear', gap, ttc} : null;
  }
  const cl = ego.v - c.v, ttc = cl > 0 ? gap/cl : Infinity;
  return gap < GUIDE.frontGap*k || ttc < GUIDE.frontTtc*k ? {rel:'front', gap, ttc} : null;
}

/* ---------- 내 차 자세 기준 방향 ----------
   ego.psi: 0 = 앞(-z), + = 오른쪽으로 돈 것. lon + = 앞, lat + = 오른쪽. zone: 뒤 · 옆 · 앞 */
function relDir(ego, c){
  const fx = Math.sin(ego.psi), fz = -Math.cos(ego.psi), dx = c.x - ego.x, dz = c.z - ego.z;
  const lon = dx*fx + dz*fz, lat = dx*(-fz) + dz*fx, reach = c.halfL + ego.halfL;
  return {lon, lat, side:lat > .4 ? 1 : lat < -.4 ? -1 : 0, zone:lon < -reach ? 'rear' : lon > reach ? 'front' : 'side'};
}

/* ---------- 목표 차로 평가 ----------
   cars: [{x, z, v, halfL, lane, kind}] · lane: 목표 차로 번호. 모든 차를 본다 → 뒤차 한 대가 지나가도 다음 차가 위험하면 계속 막힘.
   돌려줌: {safe(기준 1배), clear(기준 exitK배 — 대기 해제용), blockers:[{c, rel, gap, ttc}], primary} */
const REL_RANK = {side:0, rear:1, front:2};
function assessLane(ego, cars, lane){
  const blockers = [], strict = [];
  cars.forEach(c => {
    if(c.lane !== lane) return;
    const b = blockOf(ego, c, 1); if(b) blockers.push({c, ...b});
    const s = b || blockOf(ego, c, GUIDE.exitK); if(s) strict.push({c, ...s});
  });
  const pick = list => list.slice().sort((a, b) => REL_RANK[a.rel] - REL_RANK[b.rel] || a.ttc - b.ttc || a.gap - b.gap)[0] || null;
  return {safe:!blockers.length, clear:!strict.length, blockers, strict, primary:pick(blockers) || pick(strict)};
}

/* ---------- 게이트 (대기 · 확인 · 이동) ----------
   state: 'none'(옮길 일 없음) | 'wait'(대기) | 'clearing'(위험이 풀렸고 안정되는지 확인 중) | 'go'(이동)
   · 위험이 생기면 어느 상태에서든 즉시 'wait'
   · 'wait' → 'clearing': 엄격한 기준(clear)까지 만족해야. 'clearing' 동안 clear가 깨지면 바로 'wait'
   · 'clearing'이 GUIDE.hold초 이어져야 'go'. 처음부터 안전하면 바로 'go' */
function makeGate(){ return {state:'none', since:0, safeSince:null, reason:null, log:[]}; }
function gateStep(g, t, need, A){
  let next = g.state;
  if(!need) next = 'none';
  else if(!A.safe) next = 'wait';
  else if(g.state === 'none') next = A.clear ? 'go' : 'wait';
  else if(g.state === 'wait') next = A.clear ? 'clearing' : 'wait';
  else if(g.state === 'clearing') next = !A.clear ? 'wait' : t - g.safeSince >= GUIDE.hold ? 'go' : 'clearing';
  if(next === 'clearing' && g.state !== 'clearing') g.safeSince = t;
  if(next !== 'clearing' && next !== 'go') g.safeSince = null;
  // 대기 이유는 대기 동안만 갱신 — '확인'에선 방금 지나간 차를 기억(회색으로 보여 줌)
  if(next === 'wait') g.reason = A.primary ? {rel:A.primary.rel, car:A.primary.c, kind:A.primary.c.kind} : g.reason;
  if(next === 'none' || next === 'go') g.reason = null;
  if(next !== g.state){ g.log.push({t:+t.toFixed(2), from:g.state, to:next, rel:g.reason ? g.reason.rel : ''}); g.state = next; g.since = t; }
  return g.state;
}

/* ---------- 안내 단계 (현대 HUD · 우리 HUD 공통) ----------
   nodeS: 경로 위 갈림 거리(m) · s: 경로 위 내 위치 · committed: 확정된 출구 수 · wrong: 경로와 다른 출구를 확정함
   phase: 'approach'(갈림 앞) | 'turning'(갈림 지점을 지났지만 출구가 아직 확정 안 됨 — 회전 중 · 교차로 안) | 'follow'(마지막 갈림까지 완료) | 'off'(경로 이탈)
   예전(v1)은 갈림 25m 안에 들어오면 '진입' 단계로 넘겨 현대 HUD가 회전 전에 직진 화살표를 그렸다 (2026-10-29 재현) */
function navPhase(nodeS, s, committed, wrong){
  const n = nodeS.length;
  if(wrong) return {i:Math.min(Math.max(committed - 1, 0), n - 1), d:0, phase:'off'};
  if(committed >= n) return {i:n - 1, d:nodeS[n - 1] - s, phase:'follow'};
  const d = nodeS[committed] - s;
  return {i:committed, d, phase:d > 0 ? 'approach' : 'turning'};
}
// 왼쪽 패널 · 예전 기록용 진행 단계 숫자 (1 접근 · 2 지선 구분 · 3 차로 옮김 · 4 진입 · 5 도착)
const stageOf = N => N.phase === 'approach' ? (N.d > 170 ? 1 : N.d > 115 ? 2 : N.d > 25 ? 3 : 4) : N.phase === 'turning' ? 4 : 5;

if(typeof module !== 'undefined') module.exports = {GUIDE, blockOf, relDir, assessLane, makeGate, gateStep, navPhase, stageOf};
