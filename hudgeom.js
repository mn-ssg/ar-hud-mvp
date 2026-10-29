/* ============================================================
   hudgeom.js — 우리 HUD의 좌표 변환 · 자르기 (DOM 없음 → tests/hudgeom.test.js로 node에서 검증)
   세계(x, z) → 내 차 기준(앞 lon, 오른쪽 lat) → HUD 상자(viewBox 520 × 270) 안 미니 도로 원근.
   · 가까운 면 NEAR = 내 차 중심 앞 4m(앞범퍼 앞). 그 뒤 · FAR 너머 · 옆 9m 밖은 다각형을 잘라서 버림(Sutherland–Hodgman)
   · 띠는 구간마다 사각형 하나로 만들어 자른다 → 화면 밖으로 나갔다 들어온 조각이 서로 이어지지 않음
   2026-10-29 버그 수정: 예전(hud.js makeProj)은 가까운 면 = 내 차 줄(d = 0)이고 그 뒤 점을 빼고 남은 점을 한 다각형으로 이어서,
   교차로 직전 · 회전 중 경로가 내 차 높이에 가로로 납작하게 깔리고(‘차 밑 90도 도로’) 엉뚱한 면이 생겼다.
   ============================================================ */

const AH = {W:520, H:270, HX:260, YF:78, YN:212, NEAR:4, FAR:240, K:34, PX:21, LAT:9,
  EGO_Y:230, REAR_TOP:230, REAR_H:14, REAR_K:9};   // 뒤 띠: 내 차 뒤 거리 → y 230 ~ 244 (꼬리까지 상자 안에)

/* ---------- 좌표: 세계 → 내 차 기준 → 미니 도로 ---------- */
const toEgo = (p, f) => { const rx = -f.z, rz = f.x; return (wx, wz) => { const dx = wx - p.x, dz = wz - p.z; return [dx*f.x + dz*f.z, dx*rx + dz*rz]; }; };
const prj = (lon, lat) => { const s = AH.K/(lon - AH.NEAR + AH.K); return [AH.HX + lat*AH.PX*s, AH.YF + (AH.YN - AH.YF)*s]; };
// 다각형([lon, lat]...)을 보이는 범위로 자름: lon ≥ NEAR · lon ≤ FAR · |lat| ≤ LAT (9m — 회전 직전 가로 도로가 상자 끝까지 긴 막대로 늘어나지 않게)
function clipPoly(poly){
  const planes = [[0, AH.NEAR, 1], [0, AH.FAR, -1], [1, -AH.LAT, 1], [1, AH.LAT, -1]];
  let out = poly;
  for(const [k, v, sg] of planes){
    if(out.length < 3) return [];
    const inp = out; out = [];
    for(let i = 0; i < inp.length; i++){
      const a = inp[i], b = inp[(i + 1) % inp.length], ia = (a[k] - v)*sg >= 0, ib = (b[k] - v)*sg >= 0;
      if(ia) out.push(a);
      if(ia !== ib){ const t = (v - a[k])/(b[k] - a[k]); out.push([a[0] + (b[0] - a[0])*t, a[1] + (b[1] - a[1])*t]); }
    }
  }
  return out;
}
const f1 = v => v.toFixed(1);
const polyD = poly => { const c = clipPoly(poly); return c.length > 2 ? 'M' + c.map(q => { const r = prj(q[0], q[1]); return f1(r[0]) + ' ' + f1(r[1]); }).join('L') + 'Z' : ''; };
// 세계 중심선 점([x, z, tx, tz]) 따라 a ~ b 옆 띠 (+ = 오른쪽). 구간마다 사각형 하나 — 잘린 조각끼리 잘못 이어지지 않음
function bandAlong(T, pts, a, b, i0 = 0, i1 = pts.length - 1){
  let d = '';
  const side = (q, o) => T(q[0] - q[3]*o, q[1] + q[2]*o);   // 오른쪽 법선 = (−tz, tx)
  for(let i = i0; i < i1; i++){
    const q0 = pts[i], q1 = pts[i + 1], A = side(q0, a), B = side(q1, a), C2 = side(q1, b), D2 = side(q0, b);
    if(Math.max(A[0], B[0], C2[0], D2[0]) < AH.NEAR || Math.min(A[0], B[0], C2[0], D2[0]) > AH.FAR) continue;
    d += polyD([A, B, C2, D2]);
  }
  return d;
}
// 본선(z 방향 곧은 길)의 x0 ~ x1 띠, z0(가까움) → z1(멂)
const zPts = (z0, z1, step = 4) => { const o = []; for(let z = z0; z > z1; z -= step) o.push([0, z, 0, -1]); o.push([0, z1, 0, -1]); return o; };
const bandZ = (T, x0, x1, z0, z1) => z0 <= z1 ? '' : bandAlong(T, zPts(z0, z1).map(q => [x0, q[1], 0, -1]), 0, x1 - x0);
// 곡선을 2m 간격 점으로 (맵 구간 · 경로마다 한 번만)
// L: 곡선 길이(m), len: 그중 앞에서부터 쓸 길이(m)
function curvePts(c, L, len = L, step = 2){
  const uMax = clamp(len/L), n = Math.max(2, Math.ceil(len/step)), o = [];
  for(let i = 0; i <= n; i++){ const u = uMax*i/n, q = c.getPointAt(u), t = c.getTangentAt(u), l = Math.hypot(t.x, t.z) || 1; o.push([q.x, q.z, t.x/l, t.z/l]); }
  return o;
}

if(typeof module !== 'undefined') module.exports = {AH, toEgo, prj, clipPoly, polyD, bandAlong, bandZ, zPts, f1, curvePts};
