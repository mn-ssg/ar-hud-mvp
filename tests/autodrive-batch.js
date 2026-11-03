/* 헤드리스 자동 운전 묶음 — 맵 5 × HUD(개선 전 · 후) × 주간 · 야간 × 교통 번호 n개를 돌려 기록 값(결과 · 차로 옮긴 곳 · 반응 시간 · 위험 · 이벤트)을 모은다 (2026-11-03, ③ 버그 찾기)
   자동 운전 = 사람처럼: 판단(S.G.gate)이 '이동'일 때만 목표 차로로, 아니면 지금 차로 유지. 앞차 · 빨간불 · 보행자 앞에서 섬. 사람 실험이 아님
   실행: cd tests && node autodrive-batch.js [교통 번호 수=3] > 결과.txt */
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), N = +(process.argv[2] || 3);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TYPES = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.jpg':'image/jpeg', '.png':'image/png'};
const serve = () => new Promise(res => { const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const p = path.join(ROOT, u === '/' ? 'index.html' : u);
  if(!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':TYPES[path.extname(p)] || 'application/octet-stream'}); fs.createReadStream(p).pipe(r); }).listen(0, '127.0.0.1', () => res(srv)); });
const PILOT = () => {
  const _sp = stepPlayer;
  stepPlayer = function(dt){
    const G = S.G, m = S.map, my = laneOf(m, D.x);
    // 어느 차로를 겨눌까: 갈림 뒤는 경로, 본선은 판단이 이동이면 다음 차로(목표 쪽), 아니면 지금 차로
    let tx, tz; const ld = Math.max(8, D.v*.6);
    if(D.cands || D.seg || D.z < FORK_Z + 5){ const r = project(path.P, D.x, D.z, -1); [tx, tz] = pathAt(path.P, r.s + ld); }
    else { const lane = G && G.side && (G.need ? G.gate === 'go' : (G.A && G.A.safe && G.A.clear)) ? G.next : my; tx = m.laneX(lane); tz = D.z - ld; }   // 마감선 뒤에도 옆이 비었을 때만
    const fx = Math.sin(D.psi), fz = -Math.cos(D.psi), dx = tx - D.x, dz = tz - D.z, l = Math.hypot(dx, dz) || 1, sinA = (fx*dz - fz*dx)/l;
    const dMax = Math.min(DRV.wheelMax, Math.atan(DRV.latMax*WHEELBASE/Math.max(D.v*D.v, .01)));
    KEYS.left = KEYS.right = false;
    // 서기: 앞차가 급정거하면 · 빨간불 · 보행자 · 정체 줄 뒤 (SCC 한도 3.5보다 세게 밟아야 할 때)
    const lead = leaderOf(D.x, D.z, fx, fz, null, 0, DRV.carW + .4);
    let brake = lead.gap < Infinity && (lead.gap < 6 || (D.v - lead.v > 0 && lead.gap/(D.v - lead.v) < 1.6));
    if(m.city && G && G.stop && (G.stop.kind === 'ped' || (G.stop.kind === 'signal' && D.z - FORK_Z < 45 && D.v > 3))) brake = true;
    { const r = project(path.P, D.x, D.z, -1), a = pathAt(path.P, r.s + 2), b = pathAt(path.P, r.s + 17), turnA = Math.acos(clamp(a[2]*b[2] + a[3]*b[3], -1, 1)); if(turnA > .35 && D.v > 7) brake = true; }
    KEYS.down = brake; KEYS.up = false;
    _sp(dt); D.steer = clamp(Math.atan(2*WHEELBASE*sinA/l)/dMax, -1, 1); D.wheel = D.steer*dMax;
  };
  window.runOne = (hud, light, mapId, type, seed) => {
    const st = makeScenario(mapId, type, light, seed), cfg = runCfg(st);
    setMode(hud); setLight(light); startDrive(cfg); D.frozen = false;
    for(let k = 0; k < 100*60 && S.running; k++) update(1/60);
    const row = {hud, light, map:mapId, type, seed, scn:st.scn, rearN:cfg.rearN, brake:cfg.brake, lane:cfg.lane + 1, result:D.result, exit:D.exitName, crash:D.crashWith, change:D.changeDist, margin:D.changeDist === null ? null : Math.round(D.changeDist - (changeEndOf(S.map) - FORK_Z)),
      react:D.reactT, risky:D.risky, offroad:D.offroad, ped:D.ped, secs:+D.t.toFixed(1), moved:D.moved, safeOn:D.safeOn, gates:D.events.filter(e => e.type === 'gate').map(e => `${e.to}@${e.t}`).join(' '), lc:D.events.filter(e => e.type === 'lcStart').map(e => `${e.from + 1}→${e.to + 1}@${e.t}(${e.gate})`).join(' '), cut:D.events.filter(e => e.type === 'cutIn').map(e => `${e.lane + 1}@${e.t}${e.risky ? '!' : ''}`).join(' ')};
    stopDrive(); return row;
  };
};
(async () => {
  const srv = await serve(), url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch({executablePath:CHROME, headless:true, args:['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']});
  const page = await browser.newPage({viewport:{width:1366, height:768}});
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if(m.type() === 'error') errors.push(m.text()); });
  await page.goto(url, {waitUntil:'networkidle'}); await page.waitForTimeout(800);
  await page.evaluate(`(${PILOT})()`);
  const rows = [];
  const combos = [['ICR', 'rear'], ['JC4', 'rear'], ['SEQ', 'rear'], ['ICR', 'jam'], ['JC4', 'jam'], ['SEQ', 'jam'], ['CL2', 'city'], ['CRT', 'city']];
  for(const [mapId, type] of combos) for(let i = 0; i < N; i++){ const seed = 1000 + i*37 + mapId.length; for(const light of ['day', 'night']) for(const hud of ['ar', 'ar2']){
    const r = await page.evaluate(([hud, light, mapId, type, seed]) => runOne(hud, light, mapId, type, seed), [hud, light, mapId, type, seed]); rows.push(r);
    console.log(`${hud}\t${light}\t${mapId}\t${type}\t${seed}\t${r.result}\t${r.exit}\tchange=${r.change}\tmargin=${r.margin}\treact=${r.react}\trisky=${r.risky}\tsecs=${r.secs}\tmoved=${r.moved}\tgates=[${r.gates}]\tlc=[${r.lc}]\tcut=[${r.cut}]`);
  } }
  fs.writeFileSync(path.join(__dirname, 'autodrive-batch.json'), JSON.stringify(rows, null, 1));
  console.log('\n요약: 총', rows.length, '회 ·', ['ok', 'wrong', 'crash', 'timeout', 'signal'].map(k => `${k} ${rows.filter(r => r.result === k).length}`).join(' · '));
  console.log('이상 후보 — 성공인데 반응 빈칸:', rows.filter(r => r.result === 'ok' && r.react === null && r.type !== 'city').length, '/ 다른 출구인데 옮긴 곳 빈칸:', rows.filter(r => r.result === 'wrong' && r.change === null).length, '/ 반응 0:', rows.filter(r => r.react === 0).length, '/ 옮겼는데(moved) 반응 빈칸 · 위험 0:', rows.filter(r => r.moved && r.react === null && !r.risky).length);
  console.log('errors:', errors.length ? errors.join(' | ') : 'none');
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(2); });
