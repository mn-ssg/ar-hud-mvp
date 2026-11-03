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
