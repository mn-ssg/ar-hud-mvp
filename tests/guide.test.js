// guide.js 판단 로직 단위 테스트 — 실행: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/core/guide.js');

const LANE = 3.5, HL = 2.3;
const ego = (o = {}) => ({x:0, z:0, psi:0, v:18, halfL:HL, ...o});
const car = (lane, z, v, o = {}) => ({x:(lane - 1)*LANE, z, v, halfL:HL, lane, kind:'rear', ...o});   // 3차로, 내 차 = 1번

// 게이트를 dt 간격으로 굴리며 매 단계 차 위치를 옮김
function run(g, t0, secs, dt, egoF, carsF, need = true, lane = 2){
  const out = [];
  for(let t = t0; t < t0 + secs - 1e-9; t += dt){
    const E = egoF(t), A = G.assessLane(E, carsF(t), lane);
    out.push({t, s:G.gateStep(g, t, need, A), A});
  }
  return out;
}

test('오른쪽 뒤에서 빠르게 오는 차 → 즉시 대기, 방향은 오른쪽 뒤', () => {
  const E = ego(), c = car(2, 30, 27), A = G.assessLane(E, [c], 2), g = G.makeGate();
  assert.equal(A.safe, false);
  assert.equal(A.primary.rel, 'rear');
  assert.equal(G.gateStep(g, 0, true, A), 'wait');
  const d = G.relDir(E, c);
  assert.equal(d.side, 1); assert.equal(d.zone, 'rear');
  assert.equal(g.reason.rel, 'rear');
});

test('그리는 자리(뒤/옆)는 내 차 기준 zone: 범퍼가 1m 안이어도 내 차보다 뒤면 뒤', () => {
  const E = ego(), c = car(2, HL*2 + .5, 25), A = G.assessLane(E, [c], 2), g = G.makeGate();
  G.gateStep(g, 0, true, A);
  assert.equal(A.primary.rel, 'side');
  const d = G.relDir(E, c);
  assert.equal(d.zone, 'rear');
  assert.equal(d.side, 1);
  const beside = car(2, 1, 20), d2 = G.relDir(E, beside);
  assert.equal(d2.zone, 'side'); assert.equal(d2.side, 1);
});

test('왼쪽 뒤 차량은 왼쪽으로 표시 (목적지 방향이 아니라 내 차 기준)', () => {
  const E = ego(), c = car(0, 20, 26), A = G.assessLane(E, [c], 0), g = G.makeGate();
  G.gateStep(g, 0, true, A);
  const d = G.relDir(E, c);
  assert.equal(d.side, -1);
  assert.equal(d.zone, 'rear'); assert.equal(g.reason.rel, 'rear');
});

test('방향은 내 차 자세(ψ) 기준: 차가 오른쪽으로 크게 돌아 있으면 같은 차도 다른 쪽', () => {
  const c = car(2, 6, 20);
  assert.equal(G.relDir(ego(), c).side, 1);
  // 왼쪽으로 90° 돈 내 차(앞 = -x): 세계 좌표로 같은 차(+x, +z)가 이제 내 왼쪽
  const r = G.relDir(ego({psi:-Math.PI/2}), c);
  assert.equal(r.side, -1);
});

test('뒤차 무리: 한 대가 지나가도 다음 차가 위험하면 대기 유지, 다 지나간 뒤 확인 → 이동', () => {
  const g = G.makeGate(), dv = 8;   // 나보다 8 m/s 빠른 3대, 차 간격 12m
  const cars = t => [0, 1, 2].map(k => car(2, 20 + k*(4.6 + 12) - dv*t, 26));
  const tr = run(g, 0, 14, .05, () => ego(), cars);
  const firstGo = tr.find(x => x.s === 'go');
  assert.ok(firstGo, '결국 이동이 나와야 함');
  // 마지막 차가 내 앞 4m(앞 기준)를 벗어나기 전에는 이동이 나오면 안 됨
  const lastClear = (20 + 2*16.6 + HL*2 + G.GUIDE.frontGap*G.GUIDE.exitK)/dv;
  assert.ok(firstGo.t >= lastClear + G.GUIDE.hold - .06, `이동이 너무 이름 ${firstGo.t.toFixed(2)} < ${lastClear.toFixed(2)}`);
  // 첫 차가 지나간 직후(두 번째 차가 아직 뒤) 구간은 계속 wait
  const mid = tr.filter(x => x.t > (20 + HL*2 + 4.8)/dv + .1 && x.t < (20 + 16.6)/dv);
  assert.ok(mid.length && mid.every(x => x.s === 'wait'), '다음 차가 위험하면 대기 유지');
});

test('확인 중 다시 위험해지면 즉시 대기로', () => {
  const g = G.makeGate();
  let phase = 'gone';
  const cars = t => phase === 'gone' ? [car(2, -40, 26)] : [car(2, 15, 28)];
  run(g, 0, .3, .05, () => ego(), () => [car(2, 25, 27)]);
  assert.equal(g.state, 'wait');
  run(g, .3, .3, .05, () => ego(), cars);
  assert.equal(g.state, 'clearing');
  phase = 'back';
  run(g, .6, .05, .05, () => ego(), cars);
  assert.equal(g.state, 'wait');
});

test('경계값에서 깜빡이지 않음: 기준 1배는 안전 · 1.2배는 위험이 번갈아도 이동이 나오지 않음', () => {
  const g = G.makeGate();
  const tr = run(g, 0, 6, .05, () => ego(), t => [car(2, HL*2 + 10.5 + (Math.sin(t*20) > 0 ? 0 : -1), 18)]);
  assert.ok(tr.every(x => x.s !== 'go'), '1.2배 기준을 넘지 못하면 이동 금지');
  const flips = tr.reduce((n, x, i) => n + (i && x.s !== tr[i-1].s ? 1 : 0), 0);
  assert.ok(flips <= 1, `상태가 ${flips}번 바뀜`);
});

test('처음부터 비어 있으면 바로 이동, 옮길 필요가 없으면 none', () => {
  const g = G.makeGate();
  assert.equal(G.gateStep(g, 0, true, G.assessLane(ego(), [car(2, 80, 18)], 2)), 'go');
  assert.equal(G.gateStep(g, .1, false, G.assessLane(ego(), [], 2)), 'none');
});

test('목표 차로 앞차가 너무 가까우면 간격 부족', () => {
  const g = G.makeGate(), A = G.assessLane(ego(), [car(2, -(HL*2 + 2), 15)], 2);
  assert.equal(G.gateStep(g, 0, true, A), 'wait');
  assert.equal(g.reason.rel, 'front');
});

test('정체 줄: 바로 뒤 줄 차가 3m면 틈 없음, 줄 사이가 넉넉하면 틈으로 이동', () => {
  const q = (z, v = 3.5) => car(2, z, v, {kind:'queue'});
  const E = ego({v:3.5}), g = G.makeGate();
  const tight = [q(-(HL*2 + 3)), q(HL*2 + 3)];
  G.gateStep(g, 0, true, G.assessLane(E, tight, 2));
  assert.equal(g.state, 'wait');
  assert.equal(g.reason.kind, 'queue');
  const wide = [q(-(HL*2 + 6)), q(HL*2 + 6)];
  for(let t = .05; t < 1.5; t += .05) G.gateStep(g, t, true, G.assessLane(E, wide, 2));
  assert.equal(g.state, 'go');
});

test('안내 단계: 갈림 25m 안이어도 출구를 확정하기 전에는 회전 안내 유지', () => {
  const nodeS = [190];
  assert.equal(G.navPhase(nodeS, 100, 0, false).phase, 'approach');
  assert.equal(G.navPhase(nodeS, 180, 0, false).phase, 'approach');   // 10m 앞 (예전엔 '진입'으로 넘어감)
  assert.equal(G.navPhase(nodeS, 200, 0, false).phase, 'turning');    // 정지선을 지나 회전 중
  assert.equal(G.navPhase(nodeS, 200, 1, false).phase, 'follow');     // 출구 확정 = 회전 완료
  assert.equal(G.navPhase(nodeS, 200, 1, true).phase, 'off');         // 다른 출구 확정 = 이탈
  assert.equal(G.stageOf(G.navPhase(nodeS, 180, 0, false)), 4);
});

test('연속 분기: 첫 출구를 확정해야 다음 갈림으로 넘어감', () => {
  const nodeS = [190, 380];
  const a = G.navPhase(nodeS, 230, 0, false);
  assert.equal(a.i, 0); assert.equal(a.phase, 'turning');
  const b = G.navPhase(nodeS, 230, 1, false);
  assert.equal(b.i, 1); assert.equal(b.phase, 'approach'); assert.equal(Math.round(b.d), 150);
  assert.equal(G.navPhase(nodeS, 400, 2, false).phase, 'follow');
});


/* ---------- 리뉴얼 HUD 3차: 상태 6가지 (h3Step) ---------- */
const P3 = {cautionTtc:6, cautionGap:25, confirmT:.8, frontTtc:3, frontClosing:1.5, exitK:1.2, dwell:.4, frontHold:.6};
const I3 = (o = {}) => ({need:true, gate:'go', rearWait:false, queueWait:false, queueGo:false, rear:null, front:null, ped:false, ...o});

test('3차 01 안전: 옮길 차로 뒤가 비었거나 뒤차가 주의 거리 밖', () => {
  const h = G.makeH3();
  assert.equal(G.h3Step(h, 0, I3(), P3), 1);
  assert.equal(G.h3Step(h, .1, I3({rear:{gap:40, ttc:20}}), P3), 1);
  assert.equal(G.h3Step(h, .2, I3({need:false, rear:{gap:5, ttc:1}}), P3), 1);   // 옮길 일이 없으면 뒤차가 가까워도 01
});

test('3차 02 주의: 닿기까지 시간이 줄거나 간격이 좁아지면 바로, 풀릴 때는 1.2배 + 0.4초 머문 뒤', () => {
  const h = G.makeH3();
  assert.equal(G.h3Step(h, 0, I3({rear:{gap:40, ttc:5.9}}), P3), 2);
  assert.equal(G.h3Step(h, .1, I3({rear:{gap:40, ttc:6.5}}), P3), 2);    // 6초 × 1.2 = 7.2초 안이면 유지
  assert.equal(G.h3Step(h, .2, I3({rear:{gap:40, ttc:9}}), P3), 2);      // 풀렸지만 0.4초 전
  assert.equal(G.h3Step(h, .5, I3({rear:{gap:40, ttc:9}}), P3), 1);
  assert.equal(G.h3Step(h, .6, I3({rear:{gap:24, ttc:Infinity}}), P3), 2);   // 간격만으로도
});

test('3차 03 대기 → 04 확인 → 05 이동: 게이트를 따라가고, 한 번 기다린 뒤에만 05', () => {
  const h = G.makeH3();
  assert.equal(G.h3Step(h, 0, I3({gate:'wait', rearWait:true, rear:{gap:6, ttc:2}}), P3), 3);
  assert.equal(G.h3Step(h, 1, I3({gate:'clearing', rearWait:true}), P3), 4);
  assert.equal(G.h3Step(h, 1.8, I3({gate:'go'}), P3), 5);
  assert.equal(G.h3Step(h, 2.5, I3({gate:'go', rear:{gap:30, ttc:5}}), P3), 2);            // 다음 차가 다가오면 주의
  assert.equal(G.h3Step(h, 3, I3({gate:'wait', rearWait:true, rear:{gap:8, ttc:2}}), P3), 3);
  assert.equal(G.h3Step(h, 4, I3({gate:'clearing', rearWait:true}), P3), 4);
  assert.equal(G.h3Step(h, 4.3, I3({gate:'wait', rearWait:true, rear:{gap:8, ttc:2}}), P3), 3);   // 확인 중 다시 위험 → 바로 대기
  assert.equal(G.h3Step(h, 6, I3({need:false, gate:'none'}), P3), 1);
  assert.equal(G.h3Step(h, 7, I3(), P3), 1);                                                // 다시 옮겨야 해도 기다린 적 없으면 01
});

test('3차 정체 줄 옆: 틈이 없으면 03, 틈이 생기면 확인 시간만큼 04를 거쳐 05', () => {
  const h = G.makeH3();
  assert.equal(G.h3Step(h, 0, I3({gate:'wait', queueWait:true}), P3), 3);
  assert.equal(G.h3Step(h, 1, I3({gate:'wait', queueGo:true}), P3), 4);
  assert.equal(G.h3Step(h, 1.5, I3({gate:'wait', queueGo:true}), P3), 4);
  assert.equal(G.h3Step(h, 1.9, I3({gate:'wait', queueGo:true}), P3), 5);
  assert.equal(G.h3Step(h, 2.5, I3({gate:'wait', queueWait:true}), P3), 3);   // 틈이 닫히면 다시 대기
});

test('3차 06 앞쪽 위험: 어느 상태에서든 먼저, 풀린 뒤 0.6초 더 유지하고 밑의 상태로 돌아감', () => {
  const h = G.makeH3();
  assert.equal(G.h3Step(h, 0, I3({gate:'wait', rearWait:true, rear:{gap:6, ttc:2}}), P3), 3);
  assert.equal(G.h3Step(h, .1, I3({gate:'wait', rearWait:true, rear:{gap:6, ttc:2}, front:{ttc:2.5, closing:4}}), P3), 6);
  assert.equal(h.base, 3);                                                                  // 밑에서는 대기가 계속
  assert.equal(G.h3Step(h, .2, I3({gate:'wait', rearWait:true, front:{ttc:3.3, closing:3}}), P3), 6);   // 3초 × 1.2 안: 아직
  assert.equal(G.h3Step(h, .3, I3({gate:'wait', rearWait:true, front:{ttc:5, closing:2}}), P3), 6);
  assert.equal(G.h3Step(h, .8, I3({gate:'wait', rearWait:true, front:{ttc:5, closing:2}}), P3), 6);
  assert.equal(G.h3Step(h, .95, I3({gate:'wait', rearWait:true, front:{ttc:5, closing:2}}), P3), 3);
  assert.equal(G.h3Step(h, 1, I3({front:{ttc:1, closing:.5}}), P3) === 6, false);           // 천천히 좁혀지는 것(1.5m/s 이하)은 위험 아님 — 정체 줄 따라가기
  assert.equal(G.h3Step(h, 2, I3({need:false, ped:true}), P3), 6);                          // 보행자: 옮길 일이 없어도
  assert.equal(h.frontKind, 'ped');
  assert.deepEqual(h.log.map(l => l.to), [3, 6, 3, 5, 6]);   // 대기 → 앞쪽 위험 → 대기 → (기다린 뒤 풀림) 이동 → 보행자
});

test('필요 감속도(D134): 가까워지는 속도² ÷ (2 × 남은 거리) — 같은 20m라도 빠를수록 크다, 멀어지면 0', () => {
  assert.equal(G.needDec(30/3.6, 20).toFixed(2), '1.74');   // 시속 30km · 20m: 여유
  assert.equal(G.needDec(80/3.6, 20).toFixed(2), '12.35');  // 시속 80km · 20m: 이미 늦음
  assert.equal(G.needDec(10, 12.5), 4);
  assert.equal(G.needDec(0, 5), 0);
  assert.equal(G.needDec(-3, 5), 0);
  assert.ok(G.needDec(5, 0) > 100);                          // 이미 닿음
});

const A3 = {red:4, redExitK:1.2, redHold:.6};
test('06 2단계 빨강(D134): 필요 감속도 4 이상이면 바로 빨강, 내릴 때는 4 ÷ 1.2 아래로 0.6초 머문 뒤 · 공사 구간은 빨강 없음', () => {
  const h = G.makeH3(), F = (need, o = {}) => I3({front:{ttc:1.5, closing:8, need, ...o}});
  assert.equal(G.h3Step(h, 0, F(2), P3, A3), 6); assert.equal(h.level, 1);     // 주황
  G.h3Step(h, .1, F(4.1), P3, A3); assert.equal(h.level, 2);                   // 바로 빨강
  G.h3Step(h, .2, F(3.5), P3, A3); assert.equal(h.level, 2);                   // 3.5 ≥ 4/1.2 = 3.33: 그대로
  G.h3Step(h, .3, F(3), P3, A3); assert.equal(h.level, 2);                     // 3.33 아래로 내려온 순간부터 0.6초
  G.h3Step(h, .8, F(3), P3, A3); assert.equal(h.level, 2);
  G.h3Step(h, .95, F(3), P3, A3); assert.equal(h.level, 1);                    // 0.65초 뒤 주황
  const w = G.makeH3();
  G.h3Step(w, 0, I3({front:{ttc:1, closing:10, need:50, work:true}}), P3, A3); assert.equal(w.level, 1);   // 공사 구간: 주황만
});

test('06 2단계 빨강(D134): 보행자 필요 감속도도 같은 기준 · 급제동 중이면 늘 빨강(앞쪽 위험 목록에 없는 대상이어도)', () => {
  const h = G.makeH3();
  G.h3Step(h, 0, I3({need:false, ped:true, pedNeed:1}), P3, A3); assert.equal(h.level, 1);
  G.h3Step(h, .1, I3({need:false, ped:true, pedNeed:5}), P3, A3); assert.equal(h.level, 2); assert.equal(h.frontKind, 'ped');
  const a = G.makeH3();
  assert.equal(G.h3Step(a, 0, I3({aeb:'lead'}), P3, A3), 6); assert.equal(a.level, 2); assert.equal(a.frontKind, 'lead');
  G.h3Step(a, .5, I3({aeb:'lead', front:{ttc:9, closing:.5, need:.1}}), P3, A3); assert.equal(a.level, 2);   // 필요 감속도가 낮아져도 급제동 중엔 빨강
  G.h3Step(a, .6, I3({}), P3, A3); assert.equal(a.level, 2);                   // 풀린 뒤엔 06처럼 0.6초 더
  G.h3Step(a, 1.25, I3({}), P3, A3); assert.equal(a.level, 0); assert.equal(a.state, 1);
});
