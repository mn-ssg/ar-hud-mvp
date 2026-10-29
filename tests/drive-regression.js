/* 주행 회귀 테스트 — 실제 시뮬레이터 코드(update · driveStep · drawNav · drawAr2 · guideStep · mirrors · session)를 브라우저에서 자동 운전으로 돌려 확인
   실행:  cd tests && npm i && node drive-regression.js [--shots <폴더>]
   (Chrome 필요: CHROME 환경변수 또는 macOS 기본 경로. 정적 서버는 이 스크립트가 직접 띄움) */
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
const TYPES = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.jpg':'image/jpeg', '.png':'image/png', '.json':'application/json'};

function serve(){
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0]));
      if(!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()){ r.writeHead(404); r.end(); return; }
      r.writeHead(200, {'Content-Type':TYPES[path.extname(p)] || 'application/octet-stream'}); fs.createReadStream(p).pipe(r);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

/* 페이지 안에서 쓰는 자동 운전 도구. 조향만 대신하고 속도는 시뮬레이터의 SCC(손 뗀 상태) 그대로, 필요하면 브레이크 */
const AUTOPILOT = () => {
  const _sp = stepPlayer;
  window.AP = {mode:'route', lane:null, exit:null, brakeUntilS:null, brakeHold:0, held:0};
  stepPlayer = function(dt){
    const A = window.AP, ld = Math.max(8, D.v*.6);
    let tx, tz;
    if(A.exit && (D.cands || D.seg || D.z < FORK_Z)){ const P = segPts(A.exit), r = project(P, D.x, D.z, -1); [tx, tz] = pathAt(P, r.s + ld); }
    else if(A.mode === 'lane' && D.z > FORK_Z + 5){ tx = S.map.laneX(A.lane); tz = D.z - ld; }
    else { const r = project(path.P, D.x, D.z, -1); [tx, tz] = pathAt(path.P, r.s + ld); }
    const fx = Math.sin(D.psi), fz = -Math.cos(D.psi), dx = tx - D.x, dz = tz - D.z, l = Math.hypot(dx, dz) || 1;
    const sinA = (fx*dz - fz*dx)/l, v = D.v, dMax = Math.min(DRV.wheelMax, Math.atan(DRV.latMax*WHEELBASE/Math.max(v*v, .01)));
    const u = clamp(Math.atan(2*WHEELBASE*sinA/l)/dMax, -1, 1);
    KEYS.left = KEYS.right = false;
    KEYS.down = A.brakeUntilS !== null && S.s > A.brakeUntilS - 18 && (A.held < A.brakeHold);
    // 급한 굽은 길(일반도로 회전 · 골목) 앞에서는 사람처럼 줄임: 앞 15m 경로 방향 변화가 크면 시속 25km 아래로
    { const r = project(path.P, D.x, D.z, -1), a = pathAt(path.P, r.s + 2), b = pathAt(path.P, r.s + 17), turnA = Math.acos(clamp(a[2]*b[2] + a[3]*b[3], -1, 1));
      if(turnA > .35 && D.v > 7) KEYS.down = true; }
    if(KEYS.down && D.v < .2) A.held += dt;
    _sp(dt); D.steer = u; D.wheel = u*dMax;
  };
  // 한 판을 dt 간격으로 끝까지(또는 secs초) 돌리며 매 프레임 sample()을 모음
  window.runDrive = (cfg, opts = {}) => {
    Object.assign(window.AP, {mode:'route', lane:null, exit:null, brakeUntilS:null, brakeHold:0, held:0}, opts.ap || {});
    setMode(opts.hud || 'ar'); setLight(opts.light || 'day');
    startDrive(cfg); D.frozen = false;
    if(opts.noPeds) S.pedPlan = [];
    if(opts.setup) opts.setup();
    const out = [], dt = opts.dt || 1/30, T = opts.secs || 90;
    for(let k = 0; k < T/dt && S.running; k++){
      if(opts.beforeFrame) opts.beforeFrame(k*dt);
      update(dt);
      if(opts.sample) out.push(opts.sample());
    }
    const res = {result:D.result, exit:D.exitName, chosen:D.chosen.length, events:D.events.slice(), risky:D.risky, t:D.t, x:D.x, z:D.z, samples:out};
    if(opts.keep) return res;
    stopDrive(); return res;
  };
  const vis = id => { const e = document.getElementById(id); return e && e.style.display !== 'none'; };
  window.navSample = () => { const C = navCtx(S.s);
    return {t:+D.t.toFixed(2), d:+C.d.toFixed(1), phase:C.phase, chosen:D.chosen.length, turn:vis('nvTurn'), straight:vis('nvStraight'), dist:document.getElementById('nvDistN').textContent + document.getElementById('nvUnit').textContent, name:document.getElementById('nvName').textContent, v:+D.v.toFixed(2)}; };
};

const results = [];
const check = (name, ok, detail = '') => { results.push({name, ok:!!ok, detail}); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

(async () => {
  const srv = await serve(), url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch({executablePath:CHROME, headless:true, args:['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']});
  const page = await browser.newPage({viewport:{width:1366, height:768}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if(m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', r => errors.push('요청 실패 ' + r.url()));
  await page.goto(url, {waitUntil:'networkidle'});
  await page.waitForTimeout(800);
  await page.evaluate(`(${AUTOPILOT})()`);
  const E = (fn, arg) => page.evaluate(fn, arg);

  /* ---------- 1. 회전 안내 (현대 HUD 대조군) ---------- */
  const turn = async (mapId, dest, lane, extra = {}) => E(([mapId, dest, lane, extra]) => {
    const m = mapById(mapId), leaf = m.leaves.findIndex(l => l.dest === dest);
    return runDrive({map:m, leaf, lane, type:'city', jam:0, seed:777, sigT:0}, {hud:'nav', noPeds:true, sample:navSample, secs:60,
      ap:extra.ap, setup:() => { if(extra.clear){ D.cars.filter(c => c.kind !== 'onc').forEach(c => { c.mesh.visible = false; }); D.cars = D.cars.filter(c => c.kind === 'onc'); } }});
  }, [mapId, dest, lane, extra]);
  {
    const r = await turn('CRT', '종합병원', 1, {clear:true});
    const before = r.samples.filter(s => s.chosen === 0), after = r.samples.filter(s => s.chosen === 1);
    const at25 = before.find(s => s.d <= 25 && s.d > 20), inTurn = before.filter(s => s.d < 0);
    check('⑤ 우회전: 확정 전에는 직진 화살표가 나오지 않음', r.result === 'ok' && before.length > 0 && before.every(s => s.turn && !s.straight), `결과 ${r.result}, 확정 전 ${before.length}프레임 중 직진 ${before.filter(s => s.straight).length}`);
    check('⑤ 우회전: 25m 앞에서 회전 화살표 + m 단위 + 목적지', at25 && at25.turn && /m$/.test(at25.dist) && at25.name === '종합병원', JSON.stringify(at25));
    check('⑤ 우회전: 정지선을 지나 회전 중에도 회전 안내 유지', inTurn.length > 0 && inTurn.every(s => s.turn && s.dist === '0m'), `회전 중 ${inTurn.length}프레임`);
    check('⑤ 우회전: 출구 확정 뒤 다음 안내(직진 + km)로 전환', after.length > 0 && after.every(s => s.straight && /km$/.test(s.dist)), JSON.stringify(after[0]));
  }
  {
    // 정지선 앞 대기 (5초 정지) — 안내 유지
    const r = await E(() => { const m = mapById('CRT'), leaf = m.leaves.findIndex(l => l.dest === '종합병원');
      return runDrive({map:m, leaf, lane:1, type:'city', jam:0, seed:777, sigT:0}, {hud:'nav', noPeds:true, sample:navSample, secs:60,
        ap:{brakeUntilS:path.nodeS[0] - 2, brakeHold:5}, setup:() => { D.cars.filter(c => c.kind !== 'onc').forEach(c => c.mesh.visible = false); D.cars = D.cars.filter(c => c.kind === 'onc'); window.AP.brakeUntilS = path.nodeS[0] - 2; }}); });
    const stopped = r.samples.filter(s => s.v < .2 && s.chosen === 0 && s.d < 30);
    check('정지선 앞에 서 있는 동안 회전 안내 유지', stopped.length > 30 && stopped.every(s => s.turn && !s.straight), `정지 ${stopped.length}프레임, 결과 ${r.result}`);
  }
  {
    const r = await turn('CL2', '전통시장', 2, {clear:true});
    const b = r.samples.filter(s => s.chosen === 0), mid = r.samples.filter(s => s.chosen === 1);
    check('④ 좌회전: 확정 전 내내 좌회전 안내(직진 화살표 없음)', b.length > 0 && b.every(s => s.turn && !s.straight), `결과 ${r.result}, 직진 ${b.filter(s => s.straight).length}`);
    check('④ 좌회전 뒤 골목(두 번째 갈림)으로 안내가 넘어감 — 회전 완료 뒤에만', mid.length > 0 && mid.every(s => s.turn) && mid[0].name === '전통시장', JSON.stringify(mid[0] || null));
  }
  {
    const r = await E(() => { const m = mapById('SEQ'), leaf = m.leaves.findIndex(l => l.dest === '공주·논산');
      return runDrive({map:m, leaf, lane:1, type:'rear', jam:0, seed:31, sigT:0}, {hud:'nav', sample:navSample, secs:70,
        setup:() => { D.cars.filter(c => c.kind === 'rear' || c.kind === 'lead' || c.kind === 'tail').forEach(c => c.mesh.visible = false); D.cars = D.cars.filter(c => !['rear','lead','tail'].includes(c.kind)); }}); });
    const first = r.samples.filter(s => s.chosen === 0), second = r.samples.filter(s => s.chosen === 1);
    const jumpEarly = second.length && second[0].d > 200;
    check('③ 연속 분기: 첫 출구 확정 전엔 첫 갈림 안내 · 직진 없음', r.result === 'ok' && first.every(s => s.turn && !s.straight), `결과 ${r.result}`);
    check('③ 연속 분기: 두 번째 안내는 첫 출구를 확정한 뒤에만', second.length > 0 && !jumpEarly && second.every(s => s.turn), `두 번째 안내 시작 거리 ${second[0] && second[0].d}m`);
  }
  {
    // 경로 이탈: 우회전해야 하는데 직진 출구로
    const r = await E(() => { const m = mapById('CRT'), leaf = m.leaves.findIndex(l => l.dest === '종합병원');
      return runDrive({map:m, leaf, lane:1, type:'city', jam:0, seed:777, sigT:0}, {hud:'nav', noPeds:true, sample:navSample, secs:40, keep:true,
        ap:{exit:m.exits.find(e => e.key === 'S'), mode:'lane', lane:1}, setup:() => { D.cars.filter(c => c.kind !== 'onc').forEach(c => c.mesh.visible = false); D.cars = D.cars.filter(c => c.kind === 'onc'); }}); });
    const last = r.samples[r.samples.length - 1];
    check('경로 이탈(다른 출구): 결과가 성공이 아니라 다른 출구', r.result === 'wrong', `결과 ${r.result} · ${r.exit}`);
    check('경로 이탈: 현대 HUD가 정상 직진처럼 보이지 않음(재탐색)', last && !last.straight && !last.turn && last.name === '경로 재탐색', JSON.stringify(last));
    await E(() => stopDrive());
  }

  // 뒤차 판 시드 (HUD 영역 밖 픽셀 검사에서 씀)
  const seeds = await E(() => { const out = []; const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥');
    for(let s = 1; s < 400 && out.length < 1; s++){ setMode('ar'); startDrive({map:m, leaf, lane:1, type:'rear', jam:0, seed:s, sigT:0}); if(D.cfg.rearN >= 3) out.push(s); stopDrive(); } return out; });

  /* ---------- 3-1. 우리 HUD GUI (2026-10-29): 주변 차 상대 위치 + 내 차 옆 공간 점유(괄호) + 이동 연결선 ----------
     실제 시뮬레이터 차(D.cars)를 정해진 자리 · 속도로 놓고 시뮬레이터 시간으로 진행 — 판단(S.G)과 그려진 것(SVG)이 늘 같은지 */
  await E(() => {
    // o: {map, dest, lane, cars:[{lane, dz(+ = 뒤, m), dv(km/h, 내 차 대비)}], jamGap, secs, each(t)}
    window.stageAr = (o, sample) => {
      const m = mapById(o.map), leaf = m.leaves.findIndex(l => l.dest === o.dest || l.label === o.dest);
      setScreen('drive'); $('#intro').hidden = true; $('#sess').hidden = true; S.testing = true; setMode('ar'); setLight(o.light || 'day');
      startDrive({map:m, leaf, lane:o.lane, type:o.type || 'practice', jam:o.type === 'jam' ? 3 : 0, seed:o.seed ?? 7, sigT:0});
      D.cars.filter(c => !(o.type === 'jam' && c.kind === 'queue')).forEach(c => c.mesh.visible = false);
      D.cars = D.cars.filter(c => o.type === 'jam' && c.kind === 'queue');
      const used = new Set(D.cars.map(c => c.mesh)), free = flowCars.filter(f => !used.has(f));
      (o.cars || []).forEach(({lane, dz, dv}) => { const mesh = free.shift(), v = D.cruise + dv/3.6;
        D.cars.push({mesh, lane, kind:'rear', v, v0:v, base:v, T:1.1, s0:2.5, seenV:v, len:mesh.userData.L, w:mesh.userData.W, P:lanePath(m, lane, 0), s:LANE_START - (D.z + dz)}); mesh.visible = true; });
      if(o.setup) o.setup();
      placeCars();
      Object.assign(window.AP, {mode:o.route ? 'route' : 'lane', lane:o.lane, exit:null, brakeUntilS:null, brakeHold:0, held:0});
      const out = [], dt = 1/30; D.frozen = false;
      for(let k = 0; k < (o.secs || 6)/dt && S.running; k++){ if(o.each) o.each(D.t); update(dt); out.push(sample()); }
      stopDrive(); S.testing = false; return out;
    };
    const num = d => (d || '').match(/-?\d+(\.\d+)?/g)?.map(Number) || [];
    window.arState = () => {
      const G = S.G, br = $('#bracket'), bd = br.getAttribute('d') || '', lk = $('#link').getAttribute('d') || '';
      const cars = $$('#cars g').filter(g => +g.getAttribute('opacity') > 0).map(g => { const b = g.children[1].getBBox(); return {x:b.x + b.width/2, y:b.y + b.height/2, red:g.children[1].getAttribute('fill') === C_DANGER, solid:+g.children[1].getAttribute('fill-opacity') === 1}; });
      const lf = num($('#laneFill').getAttribute('d')), ys = lf.filter((_, i) => i % 2);
      const ln = num(lk);
      return {t:+D.t.toFixed(2), gate:G.gate, need:G.need, side:G.side, my:G.my, next:G.next, tl:G.tl, hot:(G.gate === 'wait' ? G.A.strict : []).filter(b => b.c.kind !== 'queue').length,
        br:bd ? {x:num(bd)[2], red:br.getAttribute('stroke') === C_DANGER, col:br.getAttribute('stroke'), dash:br.getAttribute('stroke-dasharray'), op:+br.getAttribute('opacity')} : null,
        link:lk.length > 0, linkEnd:ln.length ? [ln[ln.length - 2], ln[ln.length - 1]] : null, corners:($('#gapCorners').getAttribute('d') || '').length > 0,
        cars, laneMaxY:ys.length ? Math.max(...ys) : null, laneN:ys.length, rear:($('#rearFill').getAttribute('d') || '').length > 0, psi:D.psi,
        nextX:HK.HX + (S.map.laneX(G.next) - D.x)*HK.PXM};
    };
  });
  {
    const HX = 260;
    // 오른쪽 뒤에서 다가와 → 옆 → 지나감 → 해제 (ICR 1 → 2차로)
    const r = await E(() => stageAr({map:'ICR', dest:'용인·기흥', lane:1, cars:[{lane:2, dz:24, dv:25}], secs:7.5}, arState));
    const W = r.filter(s => s.gate === 'wait'), Cl = r.filter(s => s.gate === 'clearing'), Go = r.filter(s => s.gate === 'go');
    const order = r.map(s => s.gate).filter((g, i, a) => g !== a[i - 1]).join('>');
    check('우리 HUD: 오른쪽 뒤차 접근 → 대기 · 확인 · 이동 순서', order === 'wait>clearing>go', order);
    check('우리 HUD: 대기 중엔 오른쪽 경계에 빨간 실선 괄호 + 빨간 속 찬 차, 연결선 없음', W.length > 0 && W.every(s => s.br && s.br.x > HX && s.br.red && !s.br.dash && !s.link && s.cars.some(c => c.red && c.solid && c.x > HX)), `${W.length}프레임 ` + JSON.stringify(W.find(s => !(s.br && s.br.x > HX && s.br.red && !s.br.dash && !s.link && s.cars.some(c => c.red && c.solid && c.x > HX))) || ''));
    const side = W.filter(s => s.cars.some(c => c.red && Math.abs(c.y - 206) < 8));
    check('우리 HUD: 차가 바로 옆(나란히)에 있는 동안 대기 유지 · 괄호 유지', side.length > 0 && side.every(s => s.gate === 'wait' && s.br), `${side.length}프레임`);
    check('우리 HUD: 확인 중엔 회색 점선 괄호(옅어짐) · 연결선 없음 · 빨강 없음', Cl.length > 0 && Cl.every(s => s.br && s.br.dash && !s.br.red && !s.link && !s.cars.some(c => c.red)), `${Cl.length}프레임`);
    check('우리 HUD: 이동일 때만 연결선 · 괄호 없음 · 연결선 끝은 바로 옆 차로', Go.length > 0 && Go.every(s => s.link && !s.br && Math.abs(s.linkEnd[0] - s.nextX) < 30), JSON.stringify(Go[0] && {end:Go[0].linkEnd, nextX:Go[0].nextX}));
    check('우리 HUD: 빨간 괄호 · 빨간 차와 이동 연결선이 같은 프레임에 없음', r.every(s => !(s.link && ((s.br && s.br.red) || s.cars.some(c => c.red)))), '');
    check('우리 HUD: 경로 그림은 가까운 면(y 186) 아래로 내려오지 않음', r.every(s => s.laneMaxY === null || s.laneMaxY <= 186.1), `최대 ${Math.max(...r.map(s => s.laneMaxY || 0)).toFixed(1)}`);
  }
  {
    // 다시 다가오는 차: 이동 → 즉시 대기(연결선이 그 프레임에 사라짐)
    const r = await E(() => stageAr({map:'ICR', dest:'용인·기흥', lane:1, cars:[{lane:2, dz:20, dv:25}, {lane:2, dz:75, dv:30}], secs:9}, arState));
    const order = r.map(s => s.gate).filter((g, i, a) => g !== a[i - 1]).join('>'), back = r.findIndex((s, i) => i > 0 && r[i - 1].gate === 'go' && s.gate === 'wait');
    check('우리 HUD: 해제 뒤 다음 차가 다가오면 다시 대기 — 연결선은 그 프레임에 사라짐', /go>wait/.test(order) && back > 0 && !r[back].link && r[back].br && r[back].br.red, order);
    // 여러 대: 대기 이유인 차는 모두 빨강으로 그림 (두 번째 위험 차도 빠지지 않음)
    const m = await E(() => stageAr({map:'ICR', dest:'용인·기흥', lane:1, cars:[{lane:2, dz:14, dv:25}, {lane:2, dz:24, dv:25}, {lane:2, dz:36, dv:25}], secs:3}, arState));
    check('우리 HUD: 여러 대 — 대기 이유 차 수 = 빨간 차 수 (44m 안)', m.every(s => s.cars.filter(c => c.red).length === s.hot), JSON.stringify(m.filter((_, i) => i % 30 === 0).map(s => [s.hot, s.cars.filter(c => c.red).length])));
  }
  {
    const HX = 260;
    // 왼쪽 (JC4 2 → 1차로) · 좌우 동시(ICR: 왼쪽 0차로에도 빠른 차) · 이미 목표 차로
    const L = await E(() => stageAr({map:'JC4', dest:'인천·부천', lane:2, cars:[{lane:1, dz:18, dv:25}], secs:2}, arState));
    check('우리 HUD: 왼쪽 뒤차 → 왼쪽 경계 괄호 · 왼쪽에 빨간 차 (내 차 방향 기준)', L.filter(s => s.gate === 'wait').every(s => s.br && s.br.x < HX && s.cars.filter(c => c.red).every(c => c.x < HX)) && L.some(s => s.gate === 'wait'), '');
    const B = await E(() => stageAr({map:'ICR', dest:'용인·기흥', lane:1, cars:[{lane:2, dz:16, dv:22}, {lane:0, dz:12, dv:22}], secs:2.4}, arState));
    check('우리 HUD: 좌우 동시 — 괄호 · 차는 옮길 쪽(오른쪽)만', B.every(s => (!s.br || s.br.x > HX) && s.cars.every(c => c.x > HX)) && B.some(s => s.br), '');
    const D0 = await E(() => stageAr({map:'ICR', dest:'용인·기흥', lane:2, cars:[{lane:1, dz:15, dv:20}], secs:2}, arState));
    check('우리 HUD: 이미 목표 차로 — 괄호 · 연결선 · 차 없음', D0.every(s => !s.need && !s.br && !s.link && s.cars.length === 0), '');
    // 다차로: CL2 3차로 → 목표 1차로, 판단 · 연결선은 바로 옆 2차로
    const M = await E(() => stageAr({map:'CL2', dest:'전통시장', lane:3, cars:[], secs:1.5}, arState));
    const mg = M.filter(s => s.gate === 'go');
    check('우리 HUD: 두 번 옮겨야 할 때 연결선은 바로 옆 차로(2)로 · 목표는 1차로', mg.length > 0 && mg.every(s => s.tl === 1 && s.next === 2 && Math.abs(s.linkEnd[0] - s.nextX) < 30), JSON.stringify(mg[0] && {tl:mg[0].tl, next:mg[0].next, end:mg[0].linkEnd, nextX:mg[0].nextX}));
  }
  {
    // 정체: 틈 없음(흰 괄호) → 틈(모서리 + 연결선) → 닫힘(즉시 흰 괄호, 연결선 · 모서리 사라짐). 줄 차 3대를 빼 틈을 만들고, 틈 뒤 차가 다시 메움
    const r = await E(() => stageAr({map:'ICR', dest:'용인·기흥', lane:1, type:'jam', secs:11,
      setup:() => { HARD.qWave0 = HARD.qWave; HARD.qWave = 0; const q = D.cars.filter(c => c.kind === 'queue' && c.lane === 2).sort((a, b) => a.z - b.z);
        q.forEach(c => { c.base = 3.5; c.v = 3.5; c.seenV = 3.5; c.mean = false; }); const i = q.length - 2; D.z = q[i].z - 4; D.cruise = 6.5; D.v = 6.5; pathHint = -1;
        [q[i - 2], q[i - 3], q[i - 4]].forEach(c => { c.mesh.visible = false; D.cars.splice(D.cars.indexOf(c), 1); }); window.__gb = q[i - 1]; window.__goAt = null; },
      each:t => { const G = S.G; if(!G) return; if(G.gate !== 'wait' && D.cruise > 4) D.cruise = 3.5; if(G.gate === 'go' && window.__goAt === null) window.__goAt = t;
        if(window.__goAt !== null && t > window.__goAt + 1.2 && !__gb.closing){ __gb.closing = 1; __gb.base = __gb.v0 = 8.4; __gb.T = .2; __gb.s0 = 1; } }}, arState));
    await E(() => { HARD.qWave = HARD.qWave0; });
    const order = r.map(s => s.gate).filter((g, i, a) => g !== a[i - 1]).join('>'), W0 = r.slice(0, 20), Go = r.filter(s => s.gate === 'go');
    const back = r.findIndex((s, i) => i > 0 && r[i - 1].gate === 'go' && s.gate === 'wait');
    check('정체: 틈 없음 → 흰 실선 괄호(빨강 아님) · 줄 차는 테두리 차 · 연결선 없음', W0.every(s => s.gate === 'wait' && s.br && !s.br.red && !s.br.dash && !s.link && s.cars.length > 0 && s.cars.every(c => !c.red && !c.solid)), order);
    check('정체: 틈이 생기면 모서리 + 연결선', Go.length > 0 && Go.every(s => s.corners && s.link && !s.br), `${Go.length}프레임`);
    check('정체: 틈이 닫히면 그 프레임에 대기 · 연결선 · 모서리 사라짐', back > 0 && !r[back].link && !r[back].corners && r[back].br, order);
    check('정체: 줄 차는 틈을 이루는 몇 대만 (앞 2 · 뒤 1)', r.every(s => s.cars.length <= 3), `최대 ${Math.max(...r.map(s => s.cars.length))}대`);
    // 정체 + 뒤에서 빠른 차: 빨강(위험)이 흰색(정체)보다 우선
    const h = await E(() => stageAr({map:'ICR', dest:'용인·기흥', lane:1, type:'jam', secs:2,
      setup:() => { const q = D.cars.filter(c => c.kind === 'queue' && c.lane === 2).sort((a, b) => a.z - b.z); D.z = q[q.length - 1].z + 40; D.cruise = 8; D.v = 8; pathHint = -1;
        const mesh = flowCars.find(f => !f.visible), v = 8 + 25/3.6; D.cars.push({mesh, lane:2, kind:'rear', v, v0:v, base:v, T:1.1, s0:2.5, seenV:v, len:mesh.userData.L, w:mesh.userData.W, P:lanePath(S.map, 2, 0), s:LANE_START - (D.z + 14)}); mesh.visible = true; }}, arState));
    check('정체 + 뒤 위험 차: 괄호는 빨강 · 빨간 차 표시', h.some(s => s.gate === 'wait' && s.br && s.br.red && s.cars.some(c => c.red)), JSON.stringify(h.slice(-1).map(s => ({gate:s.gate, br:s.br, hot:s.hot}))));
  }
  {
    // 회전 중(일반도로 ⑤ 우회전): 뒤 띠 · 괄호 · 연결선 없음, 회전 경로는 남음, 경로 그림은 y 186 아래로 내려오지 않음
    const r = await E(() => { const m = mapById('CRT'), leaf = m.leaves.findIndex(l => l.dest === '종합병원');
      return runDrive({map:m, leaf, lane:1, type:'city', jam:0, seed:777, sigT:0}, {hud:'ar', noPeds:true, secs:22,
        setup:() => { D.cars.filter(c => c.kind !== 'onc').forEach(c => c.mesh.visible = false); D.cars = D.cars.filter(c => c.kind === 'onc'); }, sample:arState}).samples; });
    const turning = r.filter(s => Math.abs(Math.sin(s.psi)) > .2);
    check('회전 중: 뒤 띠 · 괄호 · 연결선 없음, 회전 경로는 그려짐', turning.length > 10 && turning.every(s => !s.rear && !s.br && !s.link) && turning.filter(s => s.laneN > 0).length > turning.length*.5, `회전 ${turning.length}프레임 · 경로 있음 ${turning.filter(s => s.laneN > 0).length}`);
    check('회전 포함 주행 내내 경로 그림은 y 186 아래로 내려오지 않음 (차 밑 90° 도로 없음)', r.every(s => s.laneMaxY === null || s.laneMaxY <= 186.1), `최대 ${Math.max(...r.map(s => s.laneMaxY || 0)).toFixed(1)}`);
  }
  {
    // HUD 바꾸기 · 새 판: 우리 HUD 잔상 없음
    const r = await E(() => { stageAr({map:'ICR', dest:'용인·기흥', lane:1, cars:[{lane:2, dz:10, dv:25}], secs:1}, () => 0);
      setMode('nav'); const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥');
      startDrive({map:m, leaf, lane:2, type:'practice', jam:0, seed:3, sigT:0}); setMode('ar'); update(0);
      const o = {br:$('#bracket').getAttribute('d') || '', link:$('#link').getAttribute('d') || '', corners:$('#gapCorners').getAttribute('d') || '', gate:S.G.gate}; stopDrive(); return o; });
    check('HUD를 바꾸고 새 판을 시작하면 이전 괄호 · 연결선이 남지 않음', !r.br && !r.link && !r.corners, JSON.stringify(r));
  }

  /* ---------- 4. 미러: 룸미러만 · 같은 차가 거울 같은 쪽에 (그린 픽셀 차이로) ---------- */
  {
    const mir = await E(() => {
      const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥');
      setMode('ar'); startDrive({map:m, leaf, lane:1, type:'practice', jam:0, seed:1, sigT:0}); D.frozen = true;
      D.cars.forEach(c => c.mesh.visible = false); D.cars = []; update(0);
      const grab = () => { MIR.aim(); renderer.setRenderTarget(MIR.rt); renderer.render(scene, MIR.cam); const w = MIR.rt.width, h = MIR.rt.height, px = new Uint8Array(w*h*4); renderer.readRenderTargetPixels(MIR.rt, 0, 0, w, h, px); renderer.setRenderTarget(null); return {px, w, h}; };
      const out = {sideMirrors:MIR.list ? MIR.list.length : 0};
      for(const [name, lane] of [['right', 2], ['left', 0]]){
        const base = grab(), car = flowCars[0]; car.position.set(m.laneX(lane), 0, D.z + 14); car.rotation.y = 0; car.visible = true;
        const w = grab(); car.visible = false; let n = 0, sx = 0;
        for(let y = 0; y < w.h; y++) for(let x = 0; x < w.w; x++){ const k = (y*w.w + x)*4; if(Math.abs(w.px[k] - base.px[k]) + Math.abs(w.px[k+1] - base.px[k+1]) + Math.abs(w.px[k+2] - base.px[k+2]) > 30){ n++; sx += x; } }
        out[name] = {n, cx:n ? 1 - (sx/n)/w.w : null};
      }
      stopDrive(); return out;
    });
    check('미러: 사이드미러 없음 (룸미러 하나)', !mir.sideMirrors, JSON.stringify(mir.sideMirrors));
    check('룸미러: 오른쪽 뒤 차 → 거울 오른쪽 절반 · 왼쪽 뒤 차 → 왼쪽 절반 (거울 뒤집기)', mir.right.n > 20 && mir.right.cx > .5 && mir.left.n > 20 && mir.left.cx < .5, JSON.stringify(mir));
  }

  /* ---------- 5. 고정 간격 계산: 프레임률이 달라도 같은 결과 ---------- */
  {
    const run = dt => E(dt => { const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥');
      const r = runDrive({map:m, leaf, lane:1, type:'rear', jam:0, seed:21, sigT:0}, {hud:'nav', dt, secs:12, keep:true, ap:{mode:'lane', lane:1}});
      const o = {x:+D.x.toFixed(3), z:+D.z.toFixed(3), v:+D.v.toFixed(3), result:r.result}; stopDrive(); return o; }, dt);
    const a = await run(1/60), b = await run(1/20);
    check('프레임률 60 vs 20: 같은 위치 · 속도 (고정 간격 1/60초)', Math.abs(a.z - b.z) < .05 && Math.abs(a.x - b.x) < .02 && Math.abs(a.v - b.v) < .02, `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  }

  /* ---------- 6. 차로 변경 뒤 경로 재계산: 진행도가 튀지 않음 ---------- */
  {
    const r = await E(() => { const m = mapById('JC4'), leaf = m.leaves.findIndex(l => l.dest === '의정부·구리'); let prev = null, maxJump = 0;
      runDrive({map:m, leaf, lane:1, type:'rear', jam:0, seed:2, sigT:0}, {hud:'ar', secs:16, ap:{mode:'lane', lane:3},
        setup:() => { D.cars.forEach(c => c.mesh.visible = false); D.cars = []; },
        beforeFrame:() => { if(prev !== null) maxJump = Math.max(maxJump, Math.abs(S.s - prev - D.v/30)); prev = S.s; }});
      return maxJump; });
    check('차로 두 번 바꿔도 경로 진행도(s)가 튀지 않음 (프레임당 오차 < 1.5m)', r < 1.5, `최대 ${r.toFixed(2)}m`);
  }

  /* ---------- 7. 세션: 연습 분리 · 순서 교대 · 같은 시나리오 · 기록 · 엑셀 ---------- */
  {
    const s = await E(async () => {
      // 예전 형식 기록 하나를 미리 넣어 두고 지워지지 않는지
      const old = {p:'P_OLD', block:1, no:1, hud:'ar', light:'day', map:'ICR', type:'rear', jam:0, rearN:2, brake:false, seed:5, lane:2, dest:'용인·기흥', exit:'용인·기흥', result:'ok', change:140, react:2.1, risky:0, offroad:0, ped:0, crash:'', secs:30, at:'2026-10-15T00:00:00Z'};
      drives = [old]; saveArr(DKEY, drives); surveys = []; saveArr(QKEY, surveys); practices = []; saveArr(PKEY, practices);
      let book = null; window.XLSX = {utils:{book_new:() => ({s:[]}), aoa_to_sheet:a => ({a}), book_append_sheet:(wb, ws, n) => wb.s.push([n, ws.a])}, writeFile:wb => { book = wb.s; }};
      EXP.order = 'auto'; EXP.practice = true;
      Object.assign(window.AP, {mode:'route', lane:null, exit:null, brakeUntilS:null, brakeHold:0, held:0});
      const sessions = {};
      for(const pid of ['P1', 'P2']){
        $('#pid').value = pid; openSession(); beginSession();
        let guard = 0;
        while(SES.on && guard++ < 40){
          const st = SES.steps[SES.i];
          if(!$('#sess').hidden && $('#rate')){ setRate(4); setWait(0); $('#sesBtn').click(); continue; }
          if(!$('#sess').hidden){ $('#sesBtn').click(); continue; }
          // 주행 중: 카운트다운 건너뛰고 자동 운전
          clearTimeout(SES.timer); $('#count').hidden = true; D.frozen = false;
          for(let k = 0; k < 120*30 && S.running; k++) update(1/30);
          void st;
        }
        sessions[pid] = {rows:SES.rows.map(r => ({hud:r.hud, scn:r.scn, seq:r.seq, order:r.order, ver:r.ver, env:r.env, ev:(r.events || []).length, practice:r.practice})), qs:SES.qs.length, prs:SES.prs.length, mode:S.mode, testing:S.testing};
      }
      const stored = loadArr(DKEY);
      return {sessions, storedN:stored.length, oldKept:stored.some(r => r.p === 'P_OLD'), practiceN:loadArr(PKEY).length, practiceInDrives:stored.some(r => r.practice),
        sheets:book && book.map(([n, a]) => [n, a.length, a[0].length]), head:book && book.find(([n]) => n === '기록')[1][0], oldRowCells:rowCells(old).length};
    });
    const p1 = s.sessions.P1, p2 = s.sessions.P2;
    check('세션: 참가자마다 본 주행 6판 기록', p1.rows.length === 6 && p2.rows.length === 6, `P1 ${p1.rows.length} · P2 ${p2.rows.length}`);
    check('세션: 연습 기록은 본 기록에 섞이지 않음 (따로 저장)', s.practiceN === 2 && !s.practiceInDrives && p1.prs === 1, `연습 ${s.practiceN}`);
    const navFirst = rows => rows.slice(0, 3).every(r => r.hud === 'nav') && rows.slice(3).every(r => r.hud === 'ar');
    check('세션: 참가자마다 늘 현대 HUD 3판 → 우리 HUD 3판 (교대 · 랜덤 없음)', navFirst(p1.rows) && navFirst(p2.rows) && p1.rows[0].order === 'AB' && p2.rows[0].order === 'AB', `${p1.rows.map(r => r.hud).join(',')} / ${p2.rows.map(r => r.hud).join(',')}`);
    const pairOk = rows => { const by = {}; rows.forEach(r => (by[r.scn] = by[r.scn] || []).push(r.hud)); return Object.values(by).every(h => h.length === 2 && h[0] !== h[1]); };
    check('세션: 같은 시나리오 ID를 두 HUD가 한 번씩 (교통 · 목적지 · 시간대 고정)', pairOk(p1.rows) && pairOk(p2.rows), JSON.stringify(p1.rows.map(r => r.scn)));
    check('세션: 새 필드(시나리오 · HUD 버전 · 환경 · 순서 · 이벤트) 기록', p1.rows.every(r => r.scn && r.ver && r.env && r.order && r.ev > 0), JSON.stringify(p1.rows[0]));
    check('세션: 예전 기록이 지워지거나 덮이지 않음', s.oldKept && s.storedN === 13, `저장 ${s.storedN}`);
    check('세션 끝: 질문 2블록 · HUD/테스트 상태 복원', p1.qs === 2 && !p2.testing, `질문 ${p1.qs}`);
    check('엑셀: 요약 · 기록 · 질문 · 이벤트 · 연습 · 설명 시트', s.sheets && ['요약','기록','질문','이벤트','연습','설명'].every(n => s.sheets.some(x => x[0] === n)), JSON.stringify(s.sheets));
    check('엑셀: 기록 시트 앞 11칸은 예전 칸 그대로, 새 칸은 뒤에', s.head && s.head[0] === '참가자' && s.head[10] === '도로 벗어남 (번)' && s.head[11] === '시나리오 ID' && s.oldRowCells === s.head.length, s.head && s.head.slice(9, 13).join(' | '));
  }

  {
    // 처음 화면에서 연습만: 기록 분리 · 끝나면 잠금이 풀리고 처음으로 돌아갈 수 있음
    const r = await E(() => {
      goHome(); const before = loadArr(DKEY).length, pBefore = loadArr(PKEY).length, mode0 = S.mode;
      $('#practiceBtn').click(); $('#sesBtn').click();   // 연습 시작
      clearTimeout(SES.timer); $('#count').hidden = true; D.frozen = false;
      for(let k = 0; k < 90*30 && S.running; k++) update(1/30);
      const card = $('#sesTitle').textContent, testing = S.testing; $('#sesBtn').click();   // 처음으로
      return {card, testing, screen:$('#app').dataset.screen, drives:loadArr(DKEY).length - before, practices:loadArr(PKEY).length - pBefore, mode:S.mode, mode0};
    });
    check('처음 화면 연습: 끝나면 잠금 해제 · 처음으로 · 본 기록 0 · 연습 기록 1 · HUD 되돌림', !r.testing && r.screen === 'home' && r.drives === 0 && r.practices === 1 && r.mode === r.mode0, JSON.stringify(r));
  }

  /* ---------- 8. 일시정지 · 재시작 · HUD 변경 뒤 상태 ---------- */
  {
    const r = await E(() => {
      S.demoMap = 'ICR'; S.demoTarget = defaultLeaf(mapById('ICR')); S.demoJam = 0; setMode('ar'); start();
      for(let k = 0; k < 75; k++){ S.s += cruiseOf(S.map)/30; update(1/30); }
      const gate1 = S.G.gate; S.paused = true; const s0 = S.s; for(let k = 0; k < 30; k++) update(1/30); const s1 = S.s; S.paused = false;
      start(); const after = {gate:GS.gate.state, s:S.s, log:GS.gate.log.length};
      setMode('nav'); update(1/30); const navVis = document.getElementById('navHud').style.display !== 'none' && document.getElementById('arHud').style.display === 'none';
      setMode('ar'); stopDemo(); goHome();
      return {gate1, paused:s0 === s1, after, navVis};
    });
    check('시연 일시정지 중 진행도가 움직이지 않음', r.paused, '');
    check('재시작하면 대기 · 이동 판단 기록이 처음부터', r.after.log <= 1 && r.after.s === 40, JSON.stringify(r.after));
    check('HUD 바꾸면 한 HUD만 보임', r.navVis, '');
  }

  /* ---------- 8-1. 화면 구조: HUD 선택은 현대 · 우리 두 개 · 버전 선택 없음 · 우리 HUD에 설명 글자 없음 ---------- */
  {
    const r = await E(() => ({modes:$$('#modeSeg button').map(b => b.dataset.mode + ':' + b.textContent.trim()), pair:!!$('#pairSeg'),
      verWords:/v1|v2|개선 전|개선 후|버전/.test(document.body.innerText + $$('#setup button, #intro button').map(b => b.title).join(' ')),
      arText:$$('#arHud text').map(t => t.id + ':' + t.textContent), arHud2:!!$('#arHud2'), orderUi:!!$('#orderSeg')}));
    check('시연 HUD 선택은 현대 HUD · 우리 HUD 두 개뿐, 버전 · 순서 선택지 없음', JSON.stringify(r.modes) === JSON.stringify(['nav:현대 HUD', 'ar:우리 HUD']) && !r.pair && !r.verWords && !r.arHud2 && !r.orderUi, JSON.stringify(r));
    check('우리 HUD 안 글자는 제한속도 숫자뿐', r.arText.length === 1 && /^limA:\d+$/.test(r.arText[0]), JSON.stringify(r.arText));
    const prep = await E(() => { openSession(); const o = {screen:$('#app').dataset.screen, setupVisible:!!$('#setup').offsetParent, setupBtn:!!$('#setupBtn').offsetParent, modeBtns:$$('#modeSeg button').filter(b => b.offsetParent).length, meta:$('#sesMeta').textContent}; goHome(); return o; });
    check('주행 테스트 준비 화면: HUD · 순서 고르기 없음 (연구자 설정도 못 엶)', !prep.setupVisible && !prep.setupBtn && prep.modeBtns === 0 && /현대 → 우리/.test(prep.meta), JSON.stringify(prep));
  }

  /* ---------- 8-2. HUD 표시 영역 밖으로 나오지 않음: 같은 프레임을 HUD 켬 / 끔으로 그려 상자 밖 픽셀 비교 ---------- */
  {
    const scenes = [['CRT 우회전 접근', 'CRT', '종합병원', 1, 'city', 777, 11.4, 'day'], ['CRT 우회전 중', 'CRT', '종합병원', 1, 'city', 777, 12.6, 'day'], ['CL2 좌회전 중', 'CL2', '전통시장', 2, 'city', 777, 14.6, 'night'],
      ['뒤차 대기', 'ICR', '용인·기흥', 1, 'rear', seeds[0], 1.2, 'day'], ['정체 줄 옆', 'ICR', '용인·기흥', 1, 'jam', 11, 8, 'night']];
    for(const hud of ['ar', 'nav']) for(const [vw, vh] of [[1366, 768], [1920, 1080]]){
      await page.setViewportSize({width:vw, height:vh}); await page.waitForTimeout(250);
      for(const [name, mapId, dest, lane, type, seed, T, light] of scenes){
        await E(([mapId, dest, lane, type, seed, T, light, hud]) => { const m = mapById(mapId), leaf = m.leaves.findIndex(l => l.dest === dest);
          setScreen('drive'); $('#intro').hidden = true; $('#sess').hidden = true; MIR.on = false;
          runDrive({map:m, leaf, lane, type, jam:type === 'jam' ? 3 : 0, seed, sigT:0}, {hud, light, noPeds:true, secs:T, keep:true, ap:type === 'city' ? {} : {mode:'lane', lane},
            setup:() => { if(type === 'city'){ D.cars.filter(c => c.kind !== 'onc').forEach(c => c.mesh.visible = false); D.cars = D.cars.filter(c => c.kind === 'onc'); } const l = D.cars.find(c => c.kind === 'lead'); if(l) l.brakeAt = null; }});
          D.frozen = true; }, [mapId, dest, lane, type, seed, T, light, hud]);
        await page.waitForTimeout(150);
        const box = await E(() => { const r = $('#hudWrap').getBoundingClientRect(); return {x:r.left, y:r.top, w:r.width, h:r.height}; });
        const on = await page.screenshot(); await E(() => { $('#hudWrap').style.visibility = 'hidden'; }); await page.waitForTimeout(60);
        const off = await page.screenshot(); await E(() => { $('#hudWrap').style.visibility = ''; });
        const n = await E(async ([a, b, box]) => {
          const load = s => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + s; });
          const [A, B] = await Promise.all([load(a), load(b)]), c = document.createElement('canvas'); c.width = A.width; c.height = A.height; const g = c.getContext('2d');
          g.drawImage(A, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data; g.drawImage(B, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data; let n = 0;
          for(let y = 0; y < c.height; y++) for(let x = 0; x < c.width; x++){ if(x >= box.x - 1 && x <= box.x + box.w + 1 && y >= box.y - 1 && y <= box.y + box.h + 1) continue;
            const i = (y*c.width + x)*4; if(Math.abs(da[i]-db[i]) + Math.abs(da[i+1]-db[i+1]) + Math.abs(da[i+2]-db[i+2]) > 24) n++; }
          return n; }, [on.toString('base64'), off.toString('base64'), box]);
        await E(() => { stopDrive(); S.testing = false; MIR.on = true; });
        check(`HUD 영역 밖 픽셀 0 — ${hud === 'ar' ? '우리' : '현대'} · ${vw}×${vh} · ${name}`, n === 0, `${n}px`);
      }
    }
    await page.setViewportSize({width:1366, height:768});
    // HUD를 숨기면(연습 = HUD 없음) HUD 그림이 남지 않음
    const hidden = await E(() => { setMode('off'); return [...document.querySelectorAll('#arHud, #navHud')].every(g => g.style.display === 'none'); });
    check('HUD 없음(연습)으로 바꾸면 두 HUD 층이 모두 숨음', hidden, '');
    await E(() => { setMode('ar'); goHome(); });
  }

  /* ---------- 9. 화면 · 에셋 · 콘솔 ---------- */
  {
    const tex = await E(() => ({asphalt:!!(asphalt.map && asphalt.map.image && asphalt.map.image.src && /asphalt\.jpg/.test(asphalt.map.image.src)), facade:/facade\.jpg/.test((facadeMat.map.image || {}).src || '')}));
    check('Higgsfield 재질(아스팔트 · 건물 벽)이 실제로 불러와짐', tex.asphalt && tex.facade, JSON.stringify(tex));
    check('콘솔 오류 · 깨진 경로 없음', errors.filter(e => !/favicon/.test(e)).length === 0, errors.slice(0, 5).join(' | '));
  }

  if(SHOTS){
    fs.mkdirSync(SHOTS, {recursive:true});
    for(const [w, h] of [[1366, 768], [1920, 1080]]){
      await page.setViewportSize({width:w, height:h}); await page.waitForTimeout(400);
      await E(() => goHome()); await page.waitForTimeout(300);
      await page.screenshot({path:path.join(SHOTS, `${w}_home.png`)});
    }
  }
  await browser.close(); srv.close();
  const fail = results.filter(r => !r.ok);
  console.log(`\n${results.length - fail.length}/${results.length} 통과`);
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
