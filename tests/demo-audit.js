/* 시연 교통 점검 — 맵 5 × 정체 없음 · 정체 × 주간 · 야간 시연을 끝까지 자동으로 돌리며 매 프레임(1/30초) 모든 차 쌍(내 차 포함)의 겹침과 이상한 움직임을 잰다 (2026-11-03)
   겹침 = 두 차의 회전 사각형(차종별 길이 · 폭)이 닿음(여유 0). 이상한 움직임 = 순간 이동(프레임당 3m 넘게 튐) · 급가속/급정거(한 프레임에 |Δv| > 1.5 m/s — 멈춘 줄이 6 m/s로 한 번에 출발하는 것 포함, 내 차도 잼) ·
   차로 가운데 벗어남(본선에서 |옆| > 0.6m) · 뒤로 감 · 보도 위(일반도로 가로 도로 밖) · 방향이 길과 안 맞음(> 20°) · 보이던 차가 내 차 근처(25m)에서 사라짐
   실행: cd tests && node demo-audit.js [--shots 폴더] > 결과.txt */
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.env.ROOT ? path.resolve(process.env.ROOT) : path.resolve(__dirname, '..');   // ROOT=<폴더>로 다른 판본(고치기 전 복사본)을 잴 수 있음
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
const TYPES = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.jpg':'image/jpeg', '.png':'image/png'};
const serve = () => new Promise(res => { const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const p = path.join(ROOT, u === '/' ? 'index.html' : u);
  if(!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':TYPES[path.extname(p)] || 'application/octet-stream'}); fs.createReadStream(p).pipe(r); }).listen(0, '127.0.0.1', () => res(srv)); });

const AUDIT = () => {
  // 회전 사각형 겹침 (분리축). a, b = {x, z, yaw, L, W}
  const corners = o => { const c = Math.cos(o.yaw), s = Math.sin(o.yaw), hl = o.L/2, hw = o.W/2;   // 앞 = -z 기준 yaw: 앞 벡터 (sin, -cos)
    const fx = Math.sin(o.yaw), fz = -Math.cos(o.yaw), rx = -fz, rz = fx; void c; void s;
    return [[1,1],[1,-1],[-1,-1],[-1,1]].map(([a, b]) => [o.x + fx*hl*a + rx*hw*b, o.z + fz*hl*a + rz*hw*b]); };
  const sat = (A, B) => { const P = corners(A), Q = corners(B); let minPen = Infinity;
    for(const poly of [P, Q]) for(let i = 0; i < 4; i++){ const ex = poly[(i+1)%4][0] - poly[i][0], ez = poly[(i+1)%4][1] - poly[i][1], l = Math.hypot(ex, ez), nx = -ez/l, nz = ex/l;
      const pr = pts => pts.map(p => p[0]*nx + p[1]*nz), a = pr(P), b = pr(Q), pen = Math.min(Math.max(...a) - Math.min(...b), Math.max(...b) - Math.min(...a));
      if(pen <= 0) return -pen > 0 ? -pen : 0 - pen;   // 분리됨: 거리(양수)를 돌려줌 — 축 하나라도 분리되면 겹치지 않음
      minPen = Math.min(minPen, pen); }
    return -minPen; };   // 음수 = 겹침 깊이
  const dist2 = (A, B) => { let best = -Infinity; const P = corners(A), Q = corners(B);
    for(const poly of [P, Q]) for(let i = 0; i < 4; i++){ const ex = poly[(i+1)%4][0] - poly[i][0], ez = poly[(i+1)%4][1] - poly[i][1], l = Math.hypot(ex, ez), nx = -ez/l, nz = ex/l;
      const pr = pts => pts.map(p => p[0]*nx + p[1]*nz), a = pr(P), b = pr(Q), gap = Math.max(Math.min(...b) - Math.max(...a), Math.min(...a) - Math.max(...b)); best = Math.max(best, gap); }
    return best; };   // 양수 = 가장 큰 분리 거리(≈ 최소 간격), 음수 = 겹침
  window.auditDemo = (mapId, jam, light, shotAt) => {
    S.demoMap = mapId; S.demoTarget = defaultLeaf(mapById(mapId)); S.demoJam = jam; setMode('ar2'); setLight(light); openSetup(false);
    start(); $('#sess').hidden = true;
    const m = S.map, dt = 1/30, prev = new Map(), out = {overlaps:[], anomalies:[], minGap:Infinity, minPair:null, frames:0, secs:0, cars:new Set()};
    const list = () => { const L = [];
      // three.js rotation.y = r 이면 차 앞 벡터 = (-sin r, -cos r). 상자 함수는 앞 = (sin yaw, -cos yaw) → yaw = -r (처음 판은 r을 그대로 써서 굽은 길에서 상자가 거울상으로 놓여 가짜 겹침이 나왔음)
      queueCars.forEach((c, i) => { if(c.visible) L.push({id:'queue' + i, kind:'정체 줄 차', x:c.position.x, z:c.position.z, yaw:-c.rotation.y, L:c.userData.L, W:c.userData.W}); });
      if(otherCar.visible) L.push({id:'other', kind:'옆 차로 뒤차', x:otherCar.position.x, z:otherCar.position.z, yaw:-otherCar.rotation.y, L:otherCar.userData.L, W:otherCar.userData.W});
      if(busMesh.visible) L.push({id:'bus', kind:'버스', x:busMesh.position.x, z:busMesh.position.z, yaw:-busMesh.rotation.y, L:11.4, W:2.5});
      flowCars.forEach((c, i) => { if(c.visible) L.push({id:'flow' + i, kind:'달리는 차', x:c.position.x, z:c.position.z, yaw:-c.rotation.y, L:c.userData.L, W:c.userData.W}); });
      return L; };
    const laneCenter = x => { const i = Math.round(x/LANE + (m.lanes-1)/2); return (i - (m.lanes-1)/2)*LANE; };
    for(let k = 0; k < 120*30 && S.running; k++){
      if(S.running && !S.paused){ S.s += cruiseOf(S.map)*(S.speedFactor ?? 1)*dt; S.cityT += dt; }
      update(dt); out.frames++; out.secs = +(k*dt).toFixed(2);
      // 내 차 자리는 카메라에서 거꾸로(그 판본이 실제로 그린 자리). 운전석 왼쪽 치우침(DRIVER_X)을 되돌린다. 방향은 경로 점 목록의 접선
      const pa = pathAt(path.P, S.s), f = {x:pa[2], z:pa[3]}, p = {x:camera.position.x - f.z*DRIVER_X, z:camera.position.z + f.x*DRIVER_X};
      const ego = {id:'ego', kind:'내 차', x:p.x, z:p.z, yaw:Math.atan2(f.x, -f.z), L:DRV.carL, W:DRV.carW};
      const cars = list(); cars.forEach(c => out.cars.add(c.kind));
      const all = [ego, ...cars];
      for(let i = 0; i < all.length; i++) for(let j = i+1; j < all.length; j++){
        const a = all[i], b = all[j]; if(Math.hypot(a.x - b.x, a.z - b.z) > 16) continue;
        const g = dist2(a, b);
        if(g < out.minGap){ out.minGap = g; out.minPair = {t:out.secs, a:a.id, ak:a.kind, b:b.id, bk:b.kind, x:+a.x.toFixed(1), z:+a.z.toFixed(1)}; }
        if(g < 0){ const last = out.overlaps[out.overlaps.length-1];
          if(!(last && last.a === a.id && last.b === b.id && out.secs - last.tEnd < .2)) out.overlaps.push({t:out.secs, tEnd:out.secs, a:a.id, ak:a.kind, b:b.id, bk:b.kind, depth:+(-g).toFixed(2), x:+a.x.toFixed(1), z:+a.z.toFixed(1), xb:+b.x.toFixed(1), zb:+b.z.toFixed(1)});
          else { last.tEnd = out.secs; last.depth = Math.max(last.depth, +(-g).toFixed(2)); } }
      }
      // 움직임: 차마다 이전 프레임과 비교
      const seen = new Set();
      all.forEach(c => { seen.add(c.id); const q = prev.get(c.id); const onMain = c.z > FORK_Z && c.z < 60;
        const anomaly = (type, detail) => { const last = out.anomalies[out.anomalies.length-1]; if(last && last.id === c.id && last.type === type && out.secs - last.tEnd < .5){ last.tEnd = out.secs; last.n++; return; } out.anomalies.push({t:out.secs, tEnd:out.secs, n:1, id:c.id, kind:c.kind, type, detail, x:+c.x.toFixed(1), z:+c.z.toFixed(1)}); };
        if(q){ const dx = c.x - q.x, dz = c.z - q.z, d = Math.hypot(dx, dz), v = d/dt;
          if(d > 3) anomaly('순간 이동', `${d.toFixed(1)}m/프레임`);
          else { if(q.v !== undefined && Math.abs(v - q.v) > 1.5) anomaly(c.id === 'ego' ? '내 차 속도 떨림' : v > q.v ? '급가속' : '급정거', `${q.v.toFixed(1)} → ${v.toFixed(1)} m/s`);   // 한 프레임(1/30초)에 1.5 m/s = 45 m/s² 넘는 덜컹
            if(d > .05 && dz > 0 && onMain && c.id !== 'ego') anomaly('뒤로 감', `Δz +${dz.toFixed(2)}`);
            if(d > .3){ const mv = Math.atan2(dx, -dz), diff = Math.abs(((mv - c.yaw + Math.PI) % (2*Math.PI) + 2*Math.PI) % (2*Math.PI) - Math.PI)*180/Math.PI; if(diff > 20 && diff < 160) anomaly('방향이 길과 안 맞음', `${diff.toFixed(0)}°`); } }
          c.v = v; } else c.v = undefined;
        if(onMain && c.id !== 'ego' && Math.abs(c.x - laneCenter(c.x)) > .6 && Math.abs(c.x) < m.lanes*LANE/2 + 1) anomaly('차로 가운데 벗어남', `${(c.x - laneCenter(c.x)).toFixed(2)}m`);
        if(m.city && c.z < CZ.near - .5 && c.z > CZ.far + .5 && c.id !== 'ego' && Math.abs(c.x) < m.lanes*LANE/2 + 10 && false) anomaly('가로 도로', '');
        if(m.city && c.id !== 'ego' && (c.z > CZ.near && c.z < FORK_Z) === false && c.z < FORK_Z - 2 && (c.z > CZ.near + .3 || c.z < CZ.far - .3) && Math.abs(c.x) > m.edgeX + .2 && Math.abs(c.x) < m.edgeX + 8 && c.z > CZ.far - 20) anomaly('보도 위', `x ${c.x.toFixed(1)} z ${c.z.toFixed(1)}`);
        prev.set(c.id, {x:c.x, z:c.z, v:c.v}); });
      prev.forEach((q, id) => { if(seen.has(id) || id === 'ego') return; if(Math.hypot(q.x - ego.x, q.z - ego.z) < 25) out.anomalies.push({t:out.secs, tEnd:out.secs, n:1, id, kind:id, type:'근처에서 사라짐', detail:`내 차에서 ${Math.hypot(q.x - ego.x, q.z - ego.z).toFixed(1)}m`, x:+q.x.toFixed(1), z:+q.z.toFixed(1)}); prev.delete(id); });   // 안 보이게 된 차는 바로 지운다(예전엔 멀리서 사라진 차의 옛 자리에 내 차가 다가가면 가짜로 잡혔음)
      if(shotAt !== undefined && Math.abs(out.secs - shotAt) < dt/2){ S.paused = true; out.shotReady = true; return out; }
    }
    S.running = false; out.cars = [...out.cars]; return out;
  };
  // 주행 테스트 모드(drive.js 교통): 사람처럼 모는 자동 운전으로 한 회 돌리며 모든 차 쌍(내 차 포함) 겹침을 잰다. 시뮬레이터의 충돌 판정(hit)과 별개로 기하로 잰다
  window.auditDrive = (mapId, type, light, seed) => {
    if(!window.__pilot){ window.__pilot = true; const _sp = stepPlayer;
      stepPlayer = function(dt){ const G = S.G, m = S.map, my = laneOf(m, D.x); let tx, tz; const ld = Math.max(8, D.v*.6);
        if(D.cands || D.seg || D.z < FORK_Z + 5){ const r = project(path.P, D.x, D.z, -1); [tx, tz] = pathAt(path.P, r.s + ld); }
        else { const lane = G && G.side && (G.need ? G.gate === 'go' : (G.A && G.A.safe && G.A.clear)) ? G.next : my; tx = m.laneX(lane); tz = D.z - ld; }
        const fx = Math.sin(D.psi), fz = -Math.cos(D.psi), dx = tx - D.x, dz = tz - D.z, l = Math.hypot(dx, dz) || 1, sinA = (fx*dz - fz*dx)/l, dMax = Math.min(DRV.wheelMax, Math.atan(DRV.latMax*WHEELBASE/Math.max(D.v*D.v, .01)));
        KEYS.left = KEYS.right = false; const lead = leaderOf(D.x, D.z, fx, fz, null, 0, DRV.carW + .4);
        let brake = lead.gap < Infinity && (lead.gap < 6 || (D.v - lead.v > 0 && lead.gap/(D.v - lead.v) < 1.6));
        if(m.city && G && G.stop && (G.stop.kind === 'ped' || (G.stop.kind === 'signal' && D.z - FORK_Z < 45 && D.v > 3))) brake = true;
        { const r = project(path.P, D.x, D.z, -1), a = pathAt(path.P, r.s + 2), b = pathAt(path.P, r.s + 17), turnA = Math.acos(clamp(a[2]*b[2] + a[3]*b[3], -1, 1)); if(turnA > .35 && D.v > 7) brake = true; }
        KEYS.down = brake; KEYS.up = false; _sp(dt); D.steer = clamp(Math.atan(2*WHEELBASE*sinA/l)/dMax, -1, 1); D.wheel = D.steer*dMax; }; }
    const st = makeScenario(mapId, type, light, seed), cfg = runCfg(st);
    setMode('ar2'); setLight(light); startDrive(cfg); D.frozen = false;
    const out = {overlaps:[], minGap:Infinity, minPair:null, frames:0, secs:0, result:null, crash:''};
    const egoBox = () => ({id:'ego', kind:'내 차', x:D.x, z:D.z, yaw:D.psi, L:DRV.carL, W:DRV.carW});
    for(let k = 0; k < 100*60 && S.running; k++){ update(1/60); out.frames++; out.secs = +(D.t).toFixed(2);
      if(k % 2) continue;   // 1/30초마다 잼
      const all = [egoBox(), ...D.cars.filter(c => c.mesh.visible).map((c, i) => ({id:c.kind + i, kind:KIND_NAME[c.kind] || c.kind, x:c.x, z:c.z, yaw:Math.atan2(c.tx, -c.tz), L:c.len || DRV.carL, W:c.w || DRV.carW}))];   // 앞 = (tx, tz)
      for(let i = 0; i < all.length; i++) for(let j = i+1; j < all.length; j++){ const a = all[i], b = all[j]; if(Math.hypot(a.x - b.x, a.z - b.z) > 16) continue; const g = dist2(a, b);
        if(g < out.minGap){ out.minGap = g; out.minPair = {t:out.secs, a:a.id, ak:a.kind, b:b.id, bk:b.kind, x:+a.x.toFixed(1), z:+a.z.toFixed(1)}; }
        if(g < 0){ const last = out.overlaps[out.overlaps.length-1]; if(!(last && last.a === a.id && last.b === b.id && out.secs - last.tEnd < .2)) out.overlaps.push({t:out.secs, tEnd:out.secs, a:a.id, ak:a.kind, b:b.id, bk:b.kind, depth:+(-g).toFixed(2), x:+a.x.toFixed(1), z:+a.z.toFixed(1)}); else { last.tEnd = out.secs; last.depth = Math.max(last.depth, +(-g).toFixed(2)); } } }
    }
    out.result = D.result; out.crash = D.crashWith; stopDrive(); return out;
  };
};
(async () => {
  const srv = await serve(), url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch({executablePath:CHROME, headless:true, args:['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']});
  const page = await browser.newPage({viewport:{width:1366, height:768}});
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if(m.type() === 'error') errors.push(m.text()); });
  await page.goto(url, {waitUntil:'networkidle'}); await page.waitForTimeout(800);
  await page.evaluate(`(${AUDIT})()`);
  const rows = [], ONLY_SHOTS = process.argv.includes('--shots-only');   // --shots-only: 캡처만 (SHOT_LIST 환경변수로 장면 · 시각을 바꿀 수 있음)
  for(const mapId of ONLY_SHOTS ? [] : (process.env.ONLY ? [process.env.ONLY] : ['ICR', 'JC4', 'SEQ', 'CL2', 'CRT'])) for(const jam of (mapId === 'CL2' || mapId === 'CRT') ? [0] : [0, 3]) for(const light of ['day', 'night']){
    const r = await page.evaluate(([mapId, jam, light]) => { const o = auditDemo(mapId, jam, light); o.cars = [...o.cars]; return o; }, [mapId, jam, light]);
    rows.push({mapId, jam, light, ...r});
    const ov = r.overlaps.map(o => `${o.ak}(${o.a}) × ${o.bk}(${o.b}) ${o.t}~${o.tEnd}s 깊이 ${o.depth}m @(${o.x},${o.z})`).join(' | ');
    const an = r.anomalies.map(a => `${a.kind}(${a.id}) ${a.type} ${a.detail} ${a.t}~${a.tEnd}s ×${a.n} @(${a.x},${a.z})`).join(' | ');
    console.log(`\n== ${mapId} 정체${jam} ${light}: ${r.secs}s ${r.frames}프레임 · 차 종류 [${r.cars.join(', ')}] · 겹침 ${r.overlaps.length} · 최소 간격 ${r.minGap === Infinity ? '-' : r.minGap.toFixed(2)}m ${r.minPair ? JSON.stringify(r.minPair) : ''}\n   겹침: ${ov || '없음'}\n   이상: ${an || '없음'}`);
  }
  // 문제 장면 캡처 (--shots): ④ 줄이 꺾어 나간 뒤 · 고속도로 줄이 갈림을 지날 때
  if(SHOTS){ fs.mkdirSync(SHOTS, {recursive:true});
    const SHOT_LIST = process.env.SHOT_LIST ? JSON.parse(process.env.SHOT_LIST) : [['CL2_좌회전뒤_줄', 'CL2', 0, 'day', 33.5], ['ICR_정체_갈림', 'ICR', 3, 'day', 16.6], ['JC4_정체_줄뒤', 'JC4', 3, 'day', 17.2]];
    for(const [name, mapId, jam, light, at] of SHOT_LIST){
      await page.evaluate(([mapId, jam, light, at]) => { const o = auditDemo(mapId, jam, light, at); setScreen('drive'); $('#intro').hidden = true; $('#sess').hidden = true; return o.shotReady; }, [mapId, jam, light, at]);
      await page.waitForTimeout(150); await page.screenshot({path:path.join(SHOTS, name + '.png')}); await page.evaluate(() => { S.paused = false; S.running = false; });
    } }
  // 주행 테스트 모드 (drive.js 교통)
  for(const [mapId, type] of ONLY_SHOTS ? [] : (process.env.ONLY ? [[process.env.ONLY, process.env.ONLY === 'CL2' || process.env.ONLY === 'CRT' ? 'city' : 'rear']] : [['ICR', 'rear'], ['JC4', 'rear'], ['SEQ', 'rear'], ['ICR', 'jam'], ['JC4', 'jam'], ['SEQ', 'jam'], ['CL2', 'city'], ['CRT', 'city']])) for(const seed of [1003, 1040, 1077]) for(const light of ['day', 'night']){
    const r = await page.evaluate(([mapId, type, light, seed]) => auditDrive(mapId, type, light, seed), [mapId, type, light, seed]);
    rows.push({mode:'drive', mapId, type, light, seed, ...r});
    const ov = r.overlaps.filter(o => !(o.a === 'ego' || o.b === 'ego') || r.result !== 'crash').map(o => `${o.ak}(${o.a}) × ${o.bk}(${o.b}) ${o.t}~${o.tEnd}s 깊이 ${o.depth}m @(${o.x},${o.z})`).join(' | ');
    console.log(`== [주행] ${mapId} ${type} ${light} ${seed}: ${r.result}${r.crash ? ' (' + r.crash + ')' : ''} ${r.secs}s · 겹침(내 차 충돌 제외) ${r.overlaps.filter(o => !(o.a === 'ego' || o.b === 'ego') || r.result !== 'crash').length} · 최소 간격 ${r.minGap === Infinity ? '-' : r.minGap.toFixed(2)}m ${r.minPair ? JSON.stringify(r.minPair) : ''}${ov ? '\n   겹침: ' + ov : ''}`);
  }
  if(!ONLY_SHOTS && !process.env.ONLY) fs.writeFileSync(path.join(__dirname, 'demo-audit.json'), JSON.stringify(rows, null, 1));
  console.log('\nerrors:', errors.length ? errors.join(' | ') : 'none');
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(2); });
