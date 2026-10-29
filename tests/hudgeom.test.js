// hudgeom.js 좌표 변환 · 자르기 단위 테스트 — '차 밑 90도 도로' 버그(2026-10-29)가 다시 생기지 않게
const test = require('node:test');
const assert = require('node:assert/strict');
global.clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const H = require('../hudgeom.js');

const ys = d => [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(m => +m[2]);
const xs = d => [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(m => +m[1]);
// 우회전: 정지선(z −230)에서 반지름 9m로 꺾여 가로 도로(+x) 쪽으로. [x, z, tx, tz]
function rightTurn(x0 = 3.5, R = 9){
  const pts = [];
  for(let z = -200; z > -230; z -= 2) pts.push([x0, z, 0, -1]);
  for(let a = 180; a <= 270; a += 6){ const r = a*Math.PI/180; pts.push([x0 + R + R*Math.cos(r), -230 + R*Math.sin(r), -Math.sin(r), Math.cos(r)]); }
  for(let x = x0 + R + 2; x < x0 + R + 80; x += 2) pts.push([x, -239, 1, 0]);
  return pts;
}

test('가까운 면에 닿은 점은 y = YN, 그보다 뒤는 그려지지 않음', () => {
  assert.equal(H.prj(H.AH.NEAR, 0)[1], H.AH.YN);
  const T = H.toEgo({x:0, z:0}, {x:0, z:-1});
  const d = H.polyD([[-2, 3], [2, 3], [2, -10], [-2, -10]].map(q => T(q[0], q[1])));   // 내 차 뒤 ~ 앞 10m
  assert.ok(d.length > 0);
  assert.ok(Math.max(...ys(d)) <= H.AH.YN + 1e-6, '가까운 면 아래로 내려옴');
});

test('우회전 직전(정지선 3m 앞) · 회전 중: 경로 띠가 내 차 줄(가까운 면 아래)로 내려오지 않음', () => {
  const pts = rightTurn();
  for(const [ex, ez, hdg] of [[3.5, -227, 0], [4.2, -232, 25], [6.5, -236, 60], [10, -238.6, 85]]){
    const h = hdg*Math.PI/180, T = H.toEgo({x:ex, z:ez}, {x:Math.sin(h), z:-Math.cos(h)});
    const d = H.bandAlong(T, pts, -1.75, 1.75);
    assert.ok(d.length > 0, `띠가 비었음 (${hdg}°)`);
    assert.ok(Math.max(...ys(d)) <= H.AH.YN + 1e-6, `${hdg}°: y ${Math.max(...ys(d))}`);
    const xr = xs(d); assert.ok(Math.min(...xr) > -40 && Math.max(...xr) < 560, `${hdg}°: x ${Math.min(...xr)} ~ ${Math.max(...xr)}`);
  }
});

test('예전 투영(가까운 면 = 내 차 줄, 뒤 점은 빼고 이어 붙임)은 정지선 앞에서 경로를 내 차 줄에 가로로 깔았음 — 재현', () => {
  const old = (p, f) => (wx, wz) => { const dx = wx - p.x, dz = wz - p.z, d = dx*f.x + dz*f.z; if(d < 0 || d > 300) return null; const X = dx*(-f.z) + dz*f.x, s = 55/(d + 55); return [260 + X*24*s, 88 + 140*s]; };
  const pr = old({x:3.5, z:-227}, {x:0, z:-1});
  const ysOld = rightTurn().map(q => pr(q[0], q[1])).filter(Boolean).filter(q => q[0] > 300).map(q => q[1]);
  assert.ok(Math.max(...ysOld) > 205, '예전 방식은 내 차 아이콘(y 209 ~ 230) 높이에 내 차 오른쪽으로 뻗는 가로 경로가 생김');
});

test('자르기: 화면 밖으로 나갔다 들어오는 띠가 서로 이어지지 않음 — 조각마다 닫힌 다각형', () => {
  const T = H.toEgo({x:0, z:0}, {x:0, z:-1});
  const pts = []; for(let i = 0; i <= 40; i++){ const a = i/40*Math.PI*2; pts.push([20*Math.sin(a), -20 + 20*Math.cos(a), Math.cos(a), -Math.sin(a)]); }   // 내 차를 둘러싼 원
  const d = H.bandAlong(T, pts, -1, 1);
  const subs = d.split('M').filter(Boolean);
  assert.ok(subs.every(p => p.endsWith('Z')));
  assert.ok(Math.max(...ys(d)) <= H.AH.YN + 1e-6);
});

test('앞 방향 띠: 정지선 앞 접근 중엔 회전 원호 앞에서 끊김 — 옆으로 꺾인 경로를 그리지 않음 (사용자 지적 2번)', () => {
  const pts = rightTurn(), f = {x:0, z:-1}, T = H.toEgo({x:3.5, z:-190}, f);
  const [a, b] = H.corridorRange(T, f, pts, pts.length - 1);
  assert.equal(a, 0);
  assert.ok(b > 10 && b < 25, `끊긴 번호 ${b}`);
  const d = H.bandAlong(T, pts, -1.75, 1.75, a, b);
  const xr = xs(d); assert.ok(Math.max(...xr) < 360 && Math.min(...xr) > 200, `x ${Math.min(...xr)} ~ ${Math.max(...xr)}`);
});

test('앞 방향 띠: 회전 중 이미 옆으로 휜 곳에서는 시작하지 않음 → 내 차 앞에 가로 조각 없음', () => {
  const pts = rightTurn(), h = 13*Math.PI/180, f = {x:Math.sin(h), z:-Math.cos(h)}, T = H.toEgo({x:5, z:-237.6}, f);
  const [a, b] = H.corridorRange(T, f, pts, pts.length - 1);
  assert.ok(b - a <= 1, `그릴 구간 ${a} ~ ${b}`);
});
