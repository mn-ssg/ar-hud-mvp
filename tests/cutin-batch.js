/* '앞질러 끼어들기' 막기 방법 비교 (2026-11-03, 2차 MVP 수정 6번) — 자동 운전 두 가지로 방법 조합마다 고속도로 뒤차 판을 돌린다
   ① 최대 가속 끼어들기: 출발부터 ↑를 누른 채, 2.5초 뒤(첫 뒤차가 보일 때)부터 옮길 차로의 가장 가까운 뒤차보다 내가 앞서면(범퍼 6m) 바로 옮김 → 이 운전이 '성공(충돌 없이 출구)'하는 비율이 낮을수록 막은 것
   ② HUD 따라가기: 판단이 '이동'일 때만 옮김(사람처럼) → 이 운전이 여전히 성공해야 과제가 성립
   실행: cd tests && node cutin-batch.js [교통 번호 수=8] */
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), N = +(process.argv[2] || 8);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TYPES = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.jpg':'image/jpeg', '.png':'image/png'};
const serve = () => new Promise(res => { const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const p = path.join(ROOT, u === '/' ? 'index.html' : u);
  if(!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':TYPES[path.extname(p)] || 'application/octet-stream'}); fs.createReadStream(p).pipe(r); }).listen(0, '127.0.0.1', () => res(srv)); });
const SETUP = () => {
  const _sp = stepPlayer; window.DRIVER = 'rush';
  stepPlayer = function(dt){
    const G = S.G, m = S.map, my = laneOf(m, D.x), tl = laneOf(m, S.route.tx), fx = Math.sin(D.psi), fz = -Math.cos(D.psi), ld = Math.max(8, D.v*.6);
    let lane = my, up = false, down = false;
    if(D.cands || D.seg || D.z < FORK_Z + 5){ const r = project(path.P, D.x, D.z, -1); const [tx0, tz0] = pathAt(path.P, r.s + ld); var tx = tx0, tz = tz0; }
    else if(window.DRIVER === 'rush'){
      // 최대 가속: 앞차에 박기 직전까지 ↑. 옮길 차로의 가장 가까운 뒤차(내 뒤)보다 범퍼 6m 앞서면 바로 옮김, 아니면 지금 차로 유지
      const lead = leaderOf(D.x, D.z, fx, fz, null, 0, DRV.carW + .4);
      up = !(lead.gap < Infinity && (lead.gap < 8 || (D.v - lead.v > 0 && lead.gap/(D.v - lead.v) < 1.2)));
      down = lead.gap < Infinity && (lead.gap < 5 || (D.v - lead.v > 0 && lead.gap/(D.v - lead.v) < .9));
      const near = D.cars.filter(c => c.lane === tl && c.kind !== 'queue' && c.z > FORK_Z - 5 && c.z > D.z - 2).sort((a, b) => a.z - b.z)[0];   // 내 뒤(또는 옆) 가장 가까운 차
      const aheadOk = !near || (near.z - D.z - halfL(near) - DRV.carL/2) > 6;
      // 2.5초 뒤(첫 뒤차가 보일 때)부터 — 사람이 '뒤차보다 먼저 가자'고 마음먹는 장면. 한 번 옮기기로 하면 그 차로를 끝까지 겨눔
      if(window.__moved === false && D.t >= 2.5 && my !== tl && aheadOk && !(near && near.z < D.z + 2)) window.__moved = my + Math.sign(tl - my);
      lane = window.__moved === false ? my : window.__moved;
      tx = m.laneX(lane); tz = D.z - ld;
    } else {   // 'hud': 판단이 이동일 때만, 손 떼면 순항
      lane = G && G.side && (G.need ? G.gate === 'go' : (G.A && G.A.safe && G.A.clear)) ? G.next : my;
      const lead = leaderOf(D.x, D.z, fx, fz, null, 0, DRV.carW + .4); down = lead.gap < Infinity && (lead.gap < 6 || (D.v - lead.v > 0 && lead.gap/(D.v - lead.v) < 1.6));
      tx = m.laneX(lane); tz = D.z - ld;
    }
    const dx = tx - D.x, dz = tz - D.z, l = Math.hypot(dx, dz) || 1, sinA = (fx*dz - fz*dx)/l, dMax = Math.min(DRV.wheelMax, Math.atan(DRV.latMax*WHEELBASE/Math.max(D.v*D.v, .01)));
    KEYS.left = KEYS.right = false; KEYS.up = up && !down; KEYS.down = down;
    _sp(dt); D.steer = clamp(Math.atan(2*WHEELBASE*sinA/l)/dMax, -1, 1); D.wheel = D.steer*dMax;
  };
  window.runOne = (opt, driver, mapId, seed) => {
    Object.assign(HARD.block, {leadNear:false, rearMatch:false, stream:false}, opt); window.DRIVER = driver; window.__moved = false;
    const st = makeScenario(mapId, 'rear', 'day', seed), cfg = runCfg(st);
    setMode('ar2'); startDrive(cfg); D.frozen = false;
    for(let k = 0; k < 70*60 && S.running; k++) update(1/60);
    const row = {opt:JSON.stringify(opt), driver, map:mapId, seed, result:D.result, crash:D.crashWith, cutAhead:D.cutAhead, gap:D.cutAheadGap, ttc:D.cutAheadTtc, risky:D.risky, secs:+D.t.toFixed(1), rearN:cfg.rearN, waitMoves:(D.events || []).filter(e => e.type === 'lcStart' && e.toward && (e.gate === 'wait' || e.gate === 'clearing')).length};
    stopDrive(); return row;
  };
};
(async () => {
  const srv = await serve(), url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch({executablePath:CHROME, headless:true, args:['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']});
  const page = await browser.newPage({viewport:{width:1366, height:768}});
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if(m.type() === 'error') errors.push(m.text()); });
  await page.goto(url, {waitUntil:'networkidle'}); await page.waitForTimeout(800);
  await page.evaluate(`(${SETUP})()`);
  const OPTS = [['기준(1차 그대로)', {}], ['A 앞차 가까이', {leadNear:true}], ['B 뒤차가 속도 맞춤', {rearMatch:true}], ['C 뒤차 흐름', {stream:true}], ['A+B', {leadNear:true, rearMatch:true}], ['A+C', {leadNear:true, stream:true}], ['B+C', {rearMatch:true, stream:true}], ['A+B+C', {leadNear:true, rearMatch:true, stream:true}]];
  const rows = [];
  for(const [name, opt] of OPTS) for(const driver of ['rush', 'hud']) for(const mapId of ['ICR', 'JC4', 'SEQ']) for(let i = 0; i < N; i++){
    const seed = 2000 + i*53 + mapId.length;
    const r = await page.evaluate(([opt, driver, mapId, seed]) => runOne(opt, driver, mapId, seed), [opt, driver, mapId, seed]); r.name = name; rows.push(r);
  }
  const pct = (a, b) => b ? Math.round(a/b*100) + '%' : '-';
  console.log('| 방법 | 가속 끼어들기: 성공 | 가속: 앞에 끼어듦 | 가속: 충돌 | 가속: 그때 간격 중앙값 m / 닿기까지 s | HUD 따라가기: 성공 | HUD: 충돌 | HUD: 한 회 길이 |');
  console.log('|---|---|---|---|---|---|---|---|');
  const med = a => { const s = a.filter(v => v !== null && v !== undefined).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length/2)] : '-'; };
  for(const [name] of OPTS){
    const R = rows.filter(r => r.name === name && r.driver === 'rush'), H = rows.filter(r => r.name === name && r.driver === 'hud');
    console.log(`| ${name} | ${pct(R.filter(r => r.result === 'ok').length, R.length)} (${R.filter(r => r.result === 'ok').length}/${R.length}) | ${pct(R.filter(r => r.cutAhead > 0).length, R.length)} | ${pct(R.filter(r => r.result === 'crash').length, R.length)} | ${med(R.map(r => r.gap))} / ${med(R.map(r => r.ttc))} | ${pct(H.filter(r => r.result === 'ok').length, H.length)} | ${pct(H.filter(r => r.result === 'crash').length, H.length)} | ${med(H.map(r => r.secs))}s |`);
  }
  fs.writeFileSync(path.join(__dirname, 'cutin-batch.json'), JSON.stringify(rows, null, 1));
  console.log('errors:', errors.length ? errors.join(' | ') : 'none');
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(2); });
