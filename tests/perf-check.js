/* 그래픽 성능 · 로딩 용량 재기 (2026-11-17, 3회차 MVP 작업 3 — 바꾸기 전 · 후 비교용)
   실행: cd tests && node perf-check.js [결과 이름]   → perf-<이름>.json
   · 프레임: 맵마다 자동 운전으로 달리며 실제 화면 갱신(requestAnimationFrame) 간격을 8초 잼 — 평균 · 느린 쪽 5% · 초당 프레임. 창 1440 × 900, 화소 배율 1.5 고정(?dpr=1.5), 헤드 있는 크롬(GPU 사용)
   · 로딩 용량: 이 저장소에서 보낸 파일(외부 CDN 제외)의 바이트 합 — 처음 화면까지 / 맵 5개를 다 지은 뒤
   · 삼각형 · 그리기 호출 수: renderer.info (앞 화면 + 룸미러) */
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), NAME = process.argv[2] || 'now', CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sent = {}; let total = 0;
const serve = () => new Promise(res => { const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const p = path.join(ROOT, u === '/' ? 'index.html' : u);
  if(!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()){ r.writeHead(404); r.end(); return; } const n = fs.statSync(p).size; sent[u] = n; total += n;
  r.writeHead(200, {'Content-Type':{'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.glb':'model/gltf-binary', '.wasm':'application/wasm'}[path.extname(p)] || 'application/octet-stream', 'Content-Length':n, 'Cache-Control':'no-store'}); fs.createReadStream(p).pipe(r); }).listen(0, '127.0.0.1', () => res(srv)); });
(async () => {
  const srv = await serve(), browser = await chromium.launch({executablePath:CHROME, headless:false, args:['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-frame-rate-limit', '--disable-gpu-vsync', '--window-size=1440,900']});
  const page = await browser.newPage({viewport:{width:1440, height:900}});
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${srv.address().port}/index.html?dpr=1.5`, {waitUntil:'load'}); await page.waitForTimeout(6000);
  const firstBytes = total;
  const src = fs.readFileSync(path.join(__dirname, 'drive-regression.js'), 'utf8'), a = src.indexOf('const AUTOPILOT = () => {'), b = src.indexOf('\n};\n', a);
  await page.evaluate(`(${src.slice(a + 'const AUTOPILOT = '.length, b + 2)})()`);
  const out = {name:NAME, at:new Date().toISOString(), scenes:[]};
  for(const [label, mapId, dest, lane, type, seed, light] of [['고속도로 ① 주간 뒤차', 'ICR', '용인·기흥', 1, 'rear', 5, 'day'], ['고속도로 ② 야간 정체', 'JC4', '의정부·구리', 1, 'jam', 11, 'night'], ['일반도로 ④ 주간', 'CL2', '전통시장', 2, 'city', 777, 'day'], ['일반도로 ⑤ 야간', 'CRT', '종합병원', 1, 'city', 777, 'night']]){
    await page.evaluate(([mapId, dest, lane, type, seed, light]) => { const m = mapById(mapId), leaf = m.leaves.findIndex(l => l.dest === dest); setScreen('drive'); $('#intro').hidden = true; $('#sess').hidden = true; MIR.on = true;
      Object.assign(window.AP, {mode:'lane', lane, exit:null, brakeUntilS:null, brakeHold:0, held:0, offset:0}); setMode('ar3'); setLight(light); S.testing = true; startDrive({map:m, leaf, lane, type, jam:type === 'jam' ? 3 : 0, seed, sigT:0}); D.frozen = false;
      window.__ft = []; let last = performance.now(); const tick = now => { window.__ft.push(now - last); last = now; if(window.__ft.length < 4000) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }, [mapId, dest, lane, type, seed, light]);
    await page.waitForTimeout(2500); await page.evaluate(() => { window.__ft = []; }); await page.waitForTimeout(8000);
    const r = await page.evaluate(() => { const f = window.__ft.slice(2).sort((p, q) => p - q), n = f.length, avg = f.reduce((p, q) => p + q, 0)/n; renderer.info.autoReset = false; renderer.info.reset(); renderScene(); const inf = {tris:renderer.info.render.triangles, calls:renderer.info.render.calls, geos:renderer.info.memory.geometries, tex:renderer.info.memory.textures}; renderer.info.autoReset = true;
      window.__ft = new Array(5000); stopDrive(); S.testing = false; return {frames:n, avgMs:+avg.toFixed(2), fps:+(1000/avg).toFixed(1), p95Ms:+f[Math.floor(n*.95)].toFixed(2), worstMs:+f[n - 1].toFixed(1), tier:PERF.tier, ...inf}; });
    out.scenes.push({label, ...r}); console.log(label, JSON.stringify(r));
  }
  await page.evaluate(() => new Promise(res => { let n = 0; const t = setInterval(() => { if(Object.keys(builtMaps).length >= MAPS.length || ++n > 60){ clearInterval(t); res(); } }, 500); goHome(); }));
  out.bytes = {first:firstBytes, all:total, files:Object.entries(sent).sort((p, q) => q[1] - p[1]).slice(0, 14)};
  out.byType = {}; Object.entries(sent).forEach(([u, n]) => { const k = path.extname(u) || 'html'; out.byType[k] = (out.byType[k] || 0) + n; });
  console.log('로딩 용량: 처음 화면', (firstBytes/1e6).toFixed(2), 'MB · 전체', (total/1e6).toFixed(2), 'MB', JSON.stringify(out.byType), errs.length ? 'ERR ' + errs.slice(0, 3).join('|') : '');
  fs.writeFileSync(path.join(__dirname, `perf-${NAME}.json`), JSON.stringify(out, null, 1));
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(2); });
