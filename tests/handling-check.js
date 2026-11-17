/* 조작감 점검 (2026-11-17, 3회차 MVP 작업 2) — 새 조작 모델(config.js VEH · drive.js stepPlayer)을 키 입력으로 돌려 실제 값과 나란히 볼 숫자를 낸다. 사람 실험이 아님
   실행: cd tests && node handling-check.js
   키보드 운전자 흉내: 방향키 ← → 를 누름 · 뗌만으로 옆으로 3.5m 옮김 — 목표 방향(남은 옆 거리에 비례, 옆 속도 상한)보다 덜 틀어져 있으면 그쪽 키, 넘었으면 반대 키, 비슷하면 뗌 */
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const serve = () => new Promise(res => { const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const p = path.join(ROOT, u === '/' ? 'index.html' : u);
  if(!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':{'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8'}[path.extname(p)] || 'application/octet-stream'}); fs.createReadStream(p).pipe(r); }).listen(0, '127.0.0.1', () => res(srv)); });
(async () => {
  const srv = await serve(), browser = await chromium.launch({executablePath:CHROME, headless:true, args:['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']});
  const page = await browser.newPage({viewport:{width:1366, height:768}});
  await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`, {waitUntil:'load'}); await page.waitForTimeout(2500);
  const out = await page.evaluate(() => {
    const dt = 1/60, keys = (l, r, u, d) => { KEYS.left = l; KEYS.right = r; KEYS.up = !!u; KEYS.down = !!d; };
    const fresh = v => { const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥'); setMode('off'); startDrive({map:m, leaf, lane:1, type:'practice', jam:0, seed:1, sigT:0}); D.frozen = false;
      D.cars.forEach(c => c.mesh.visible = false); D.cars = []; Object.assign(D, {x:0, z:0, psi:0, v, sw:0, r:0, wheel:0, cruise:v, holdT:0, holdDir:0, brakeT:0, thrT:0}); };
    // 1) 차로 변경: 옆 속도 상한 vy(m/s)를 목표로 키만으로. 시간 = 첫 키 ~ 목표 차로 가운데 ±0.3m에 들어와 방향이 0.4° 안으로 돌아올 때까지
    const laneChange = (kmh, vy) => { const v = kmh/3.6; fresh(v); const psiMax = Math.asin(vy/v); let t = 0, t0 = null, tEnd = null, swMax = 0, rateMax = 0, ayMax = 0, prev = 0, taps = 0, last = 0;
      for(let k = 0; k < 60*20; k++){ const err = 3.5 - D.x, want = clamp(err*.55*psiMax/1.2, -psiMax, psiMax), e = want - (D.psi + D.r*.35), band = .0022;
        const key = t < .5 ? 0 : e > band ? 1 : e < -band ? -1 : 0; if(key && t0 === null) t0 = t; if(key !== last){ if(key) taps++; last = key; }
        keys(key < 0, key > 0); D.v = v; stepPlayer(dt); t += dt;
        swMax = Math.max(swMax, Math.abs(D.sw)); rateMax = Math.max(rateMax, Math.abs(D.sw - prev)/dt); prev = D.sw; ayMax = Math.max(ayMax, Math.abs(D.v*D.r));
        if(t0 !== null && tEnd === null && Math.abs(err) < .3 && Math.abs(D.psi) < .007) tEnd = t; if(tEnd !== null && t > tEnd + 2) break; }
      const settle = Math.abs(3.5 - D.x);
      return {kmh, vy, secs:tEnd === null ? null : +(tEnd - t0).toFixed(1), sw:+swMax.toFixed(1), rate:+rateMax.toFixed(1), ay:+ayMax.toFixed(2), taps, endErr:+settle.toFixed(2)}; };
    // 2) 가장 급하게: 오른쪽 키를 누르고 있다가 반쯤에서 왼쪽으로 바꿔 누름
    const hard = kmh => { const v = kmh/3.6; fresh(v); let t = 0, swMax = 0, ayMax = 0, tEnd = null, phase = 0;
      for(let k = 0; k < 60*12; k++){ if(phase === 0 && D.x > 1.2) phase = 1; if(phase === 1 && D.psi <= 0.002) phase = 2;
        keys(phase === 1, phase === 0); D.v = v; stepPlayer(dt); t += dt; swMax = Math.max(swMax, Math.abs(D.sw)); ayMax = Math.max(ayMax, Math.abs(D.v*D.r)); if(phase === 2 && tEnd === null) tEnd = t; if(tEnd !== null && t > tEnd + 1.5) break; }
      return {kmh, secs:tEnd && +tEnd.toFixed(1), x:+D.x.toFixed(2), sw:+swMax.toFixed(1), ay:+ayMax.toFixed(2)}; };
    // 3) 핸들: 키를 계속 누를 때 닿는 각도 · 걸리는 시간, 떼면 10% 아래로 돌아오는 시간
    const hold = kmh => { const v = kmh/3.6; fresh(v); let t = 0, tFull = null; const target = swHoldOf(v);
      for(let k = 0; k < 60*4; k++){ keys(false, true); D.v = v; stepPlayer(dt); t += dt; if(tFull === null && D.sw >= target*.98) tFull = t; }
      const peak = D.sw; let tr = 0; while(Math.abs(D.sw) > peak*.1 && tr < 30){ keys(false, false); D.v = v; stepPlayer(dt); tr += dt; }
      return {kmh, hold:+target.toFixed(1), wheel:+(target/VEH.ratio).toFixed(2), t:tFull && +tFull.toFixed(2), rate:+(Math.min(VEH.swRate, target/VEH.tFull)).toFixed(1), ret:+tr.toFixed(2), radius:+(v > 0 ? v/Math.abs(D.r || 1e-9) : 0).toFixed(0)}; };
    // 4) 가속 · 제동 · 타력
    const accel = () => { fresh(0); D.cruise = 0; let t = 0, t60 = null; const vmax0 = DRV.vMax; DRV.vMax = 60; while(D.v < 100/3.6 && t < 40){ keys(false, false, true); stepPlayer(dt); t += dt; if(t60 === null && D.v >= 60/3.6) t60 = t; } DRV.vMax = vmax0; return {t100:+t.toFixed(2), t60:+t60.toFixed(2)}; };
    const brake = kmh => { fresh(kmh/3.6); const x0 = D.z; let t = 0; while(D.v > .01 && t < 20){ keys(false, false, false, true); stepPlayer(dt); t += dt; } return {kmh, dist:+(x0 - D.z).toFixed(1), secs:+t.toFixed(2), avg:+((kmh/3.6)**2/(2*(x0 - D.z))).toFixed(2)}; };
    const tap = (kmh, secs) => { fresh(kmh/3.6); const v0 = D.v; let t = 0; while(t < secs){ keys(false, false, false, true); stepPlayer(dt); t += dt; } return {kmh, secs, dv:+((v0 - D.v)*3.6).toFixed(1), peak:+brakeOf(secs).toFixed(1)}; };
    const coast = kmh => { fresh(kmh/3.6); D.cruise = 5; const v0 = D.v; for(let k = 0; k < 60; k++){ keys(false, false); stepPlayer(dt); } return {kmh, decel:+(v0 - D.v).toFixed(2)}; };
    // 5) 일반도로 우회전(⑤, 반지름 9m): 자동 운전이 경로를 따라 돌 때 핸들 각도 · 속도
    const turn = () => { const m = mapById('CRT'), leaf = m.leaves.findIndex(l => l.dest === '종합병원'); setMode('off'); startDrive({map:m, leaf, lane:2, type:'city', jam:0, seed:777, sigT:0}); D.frozen = false; D.cars.forEach(c => c.mesh.visible = false); D.cars = []; S.pedPlan = [];
      let swMax = 0, vAt = 0, t = 0; const tr = [];
      for(let k = 0; k < 60*40 && S.running; k++){ const r = project(path.P, D.x, D.z, -1), ld = Math.max(5, D.v*.6), [tx, tz] = pathAt(path.P, r.s + ld), fx = Math.sin(D.psi), fz = -Math.cos(D.psi), dx = tx - D.x, dz = tz - D.z, l = Math.hypot(dx, dz) || 1;
        const a = pathAt(path.P, r.s + 2), b = pathAt(path.P, r.s + 14), bend = Math.acos(clamp(a[2]*b[2] + a[3]*b[3], -1, 1));
        keys(false, false, false, bend > .3 && D.v > 4.6); D.autoSw = swForCurv(2*(fx*dz - fz*dx)/l/l, D.v); driveStep(dt); t += dt;
        if(Math.abs(D.sw) > swMax){ swMax = Math.abs(D.sw); vAt = D.v; } }
      const res = D.result; stopDrive(); return {sw:+swMax.toFixed(0), turns:+(swMax/360).toFixed(2), kmh:+(vAt*3.6).toFixed(0), result:res, offroad:D.offroad}; };
    return {lane:[laneChange(100, 1.0), laneChange(100, .75), laneChange(65, 1.0), laneChange(50, 1.0)], hard:[hard(100), hard(65)], hold:[100, 80, 65, 50, 30, 20, 10].map(hold), accel:accel(), brake:[brake(100), brake(65)], tap:[tap(65, .3), tap(65, .6), tap(65, 1)], coast:[coast(100), coast(50)], turn:turn(),
      gain:[30, 50, 80, 100].map(k => { const v = k/3.6; return {kmh:k, pct:Math.round(VEH.L/(VEH.L + VEH.K*v*v)*100)}; })};
  });
  console.log(JSON.stringify(out, null, 1).replace(/\n\s+(?=[^\[\]{}]*[}\]])/g, ' ').replace(/{\n\s+/g, '{'));
  fs.writeFileSync(path.join(__dirname, 'handling-check.json'), JSON.stringify(out, null, 1));
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(2); });
