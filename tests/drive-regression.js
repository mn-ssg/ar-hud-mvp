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
  // 우리 HUD 한 프레임 요약: 판단 상태 + 실제로 그려진 것 (path d · 투명도 · 뒤 띠 차의 자리)
  const ptsOf = d => { const o = []; (d || '').replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, x, y) => { o.push([+x, +y]); return ''; }); return o; };
  window.ahSample = () => {
    const G = S.G, at = id => document.getElementById(id).getAttribute('d') || '', op = id => +(document.getElementById(id).getAttribute('opacity') ?? 1);
    const rear = [...document.querySelectorAll('#ahRear > g')].filter(g => +g.getAttribute('opacity') > 0).map(g => ({x:+g.getAttribute('transform').match(/translate\((-?[\d.]+)/)[1], hot:g.querySelector('rect').getAttribute('fill') === C_DANGER}));
    const lanePts = ptsOf(at('ahLane') + at('ahRails'));
    return {t:+D.t.toFixed(2), z:+D.z.toFixed(1), x:+D.x.toFixed(2), gate:G.gate, need:G.need, side:G.side, intent:G.intent,
      go:at('ahGo').length > 0, wall:at('ahWall').length > 0 && op('ahWall') > .02, wallOp:op('ahWall'), slot:at('ahSlot').length > 0, queue:at('ahQueue').length > 0,
      icon:['ahIcoL','ahIcoS','ahIcoR'].find(id => document.getElementById(id).style.display !== 'none') || null,
      dirSide:G.dir ? G.dir.side : 0, dirZone:G.dir ? G.dir.zone : '', reasonKind:G.reason ? G.reason.kind : '', jam:!!G.jam, beside:G.jam ? G.jam.beside : false,
      rear, hotRear:rear.filter(r => r.hot), hazAhead:at('ahHazAhead').length > 0, nearRails:[...at('ahNearRails').matchAll(/M(-?[\d.]+)/g)].map(m => +m[1]),
      laneMaxY:lanePts.length ? Math.max(...lanePts.map(q => q[1])) : null, laneN:lanePts.length,
      laneXmin:lanePts.length ? Math.min(...lanePts.map(q => q[0])) : null, laneXmax:lanePts.length ? Math.max(...lanePts.map(q => q[0])) : null, turnMark:at('ahTurn').length > 0,
      blockers:G.A.blockers.map(b => ({kind:b.c.kind, rel:b.rel, lat:+((b.c.x - D.x)).toFixed(1)}))};
  };
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

  /* ---------- 2. 뒤차 위험 · 대기 → 확인 → 이동 (우리 HUD, 글자 없이 그래픽만) ---------- */
  const rear = async (seed, opts = {}) => E(([seed, opts]) => {
    const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥');
    return runDrive({map:m, leaf, lane:1, type:'rear', jam:0, seed, sigT:0}, {hud:'ar', light:opts.light, sample:ahSample, secs:opts.secs || 22, ap:{mode:'lane', lane:1},
      setup:() => { const lead = D.cars.find(c => c.kind === 'lead'); if(lead) lead.brakeAt = null; }});
  }, [seed, opts]);
  // 뒤차가 3대 이상 오는 seed 찾기
  const seeds = await E(() => { const out = []; const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥');
    for(let s = 1; s < 400 && out.length < 3; s++){ setMode('ar'); startDrive({map:m, leaf, lane:1, type:'rear', jam:0, seed:s, sigT:0}); if(D.cfg.rearN >= 3) out.push(s); stopDrive(); } return out; });
  {
    const r = await rear(seeds[0]);
    const S_ = r.samples, waits = S_.filter(s => s.gate === 'wait' && s.need), gos = S_.filter(s => s.gate === 'go' && s.need);
    check(`뒤차 무리(seed ${seeds[0]}): 대기가 나옴`, waits.length > 0, `대기 ${waits.length}프레임`);
    check('대기 · 확인 중에는 초록 꺾쇠(이동)가 절대 같이 나오지 않음', S_.filter(s => (s.gate === 'wait' || s.gate === 'clearing') && s.go).length === 0, '');
    check('대기 중에는 늘 경계의 주황 벽, 이동 중에는 벽 없음', waits.every(s => s.wall) && gos.every(s => !s.wall && s.go), `대기 중 벽 없음 ${waits.filter(s => !s.wall).length} · 이동 중 벽 ${gos.filter(s => s.wall).length}`);
    const rearWaits = waits.filter(s => s.dirZone === 'rear');
    const badDir = rearWaits.filter(s => !(s.dirSide === 1 && s.hotRear.length && s.hotRear.every(h => h.x > 260)));
    check('대기 이유인 뒤차 = 빨강, 내 차 기준 오른쪽 뒤(뒤 띠의 오른쪽)에 그려짐', rearWaits.length > 0 && badDir.length === 0, badDir.length ? JSON.stringify(badDir[0]).slice(0, 300) : `${rearWaits.length}프레임`);
    const firstGo = S_.findIndex(s => s.gate === 'go'), lastWait = S_.map(s => s.gate).lastIndexOf('wait');
    check('뒤차 한 대가 지나가도 다음 차가 위험하면 이동이 나오지 않음 (대기 → 이동은 마지막 위험 뒤에만)', firstGo === -1 || firstGo > lastWait, `첫 이동 ${firstGo} · 마지막 대기 ${lastWait}`);
    const tr = []; S_.forEach((s, i) => { if(i && s.gate !== S_[i-1].gate) tr.push({t:s.t, from:S_[i-1].gate, to:s.gate}); });
    const toGo = tr.find(x => x.to === 'go'), clr = tr.filter(x => x.to === 'clearing').pop();
    check('위험이 풀리면 확인(벽이 옅어짐)을 거쳐 0.8초 뒤 이동', !toGo || (toGo.from === 'clearing' && clr && toGo.t - clr.t >= .75), JSON.stringify(tr.slice(0, 8)));
    const cl = S_.filter(s => s.gate === 'clearing' && s.need);
    check('확인 동안 벽 투명도가 줄어듦(한 번, 반복 없음)', cl.length < 2 || cl.every((s, i) => !i || s.wallOp <= cl[i-1].wallOp + 1e-6), cl.map(s => s.wallOp).join(','));
    check('대기 ↔ 이동이 빠르게 깜빡이지 않음 (전환 10번 이하)', tr.length <= 10, `${tr.length}번 전환`);
    check('대기 중에도 들어갈 차로(청록) · 갈 방향 아이콘 그대로', waits.every(s => s.icon === 'ahIcoR' && s.laneN > 0), '');
  }
  {
    // 대기인데 그쪽으로 넘어가기 시작하면 벽이 깜빡임 (양산차 후측방 경고의 2단계와 같은 뜻)
    const r = await E(seed => { const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥');
      return runDrive({map:m, leaf, lane:1, type:'rear', jam:0, seed, sigT:0}, {hud:'ar', sample:ahSample, secs:6, ap:{mode:'lane', lane:1},
        setup:() => { const lead = D.cars.find(c => c.kind === 'lead'); if(lead) lead.brakeAt = null; },
        beforeFrame:t => { if(S.G && S.G.gate === 'wait' && t > .5) window.AP.lane = 1.18; }}); }, seeds[0]);   // 오른쪽으로 0.6m 넘어감
    const w = r.samples.filter(s => s.gate === 'wait' && s.intent);
    check('대기 중 그쪽으로 넘어가면 벽이 깜빡임(투명도가 바뀜), 화살표는 여전히 없음', w.length > 10 && new Set(w.map(s => s.wallOp)).size > 1 && w.every(s => !s.go), `넘어간 대기 ${w.length}프레임`);
  }
  {
    // 위험 해소 직후 재접근: 이동이 된 뒤 빠른 차를 하나 더 뒤에 넣으면 즉시 대기
    const r = await E(() => { const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥'); let injected = false;
      return runDrive({map:m, leaf, lane:1, type:'rear', jam:0, seed:5, sigT:0}, {hud:'ar', sample:ahSample, secs:20, ap:{mode:'lane', lane:1},
        setup:() => { const lead = D.cars.find(c => c.kind === 'lead'); if(lead) lead.brakeAt = null; },
        beforeFrame:t => { if(!injected && S.G && S.G.gate === 'go'){ injected = true;
          const mesh = flowCars.find(c => !c.visible); const c = {mesh, lane:2, kind:'rear', v:D.v + 9, v0:D.v + 9, base:D.v + 9, T:.4, s0:2, seenV:D.v, len:mesh.userData.L, w:mesh.userData.W, P:lanePath(m, 2, 0), s:LANE_START - (D.z + 22)};
          D.cars.push(c); mesh.visible = true; placeCars(); window._inj = t; } }}); });
    const t0 = await E(() => window._inj), after = r.samples.filter(s => s.t > t0 + .02).slice(0, 3);
    check('위험 해소 뒤 재접근: 다음 프레임에 바로 대기(벽 · 꺾쇠 없음)', t0 !== undefined && after.length && after[0].gate === 'wait' && after[0].wall && !after[0].go, JSON.stringify(after[0]).slice(0, 200));
  }
  {
    // 왼쪽 목표 · 왼쪽 뒤 차: JC4 왼쪽 출구, 2차로에서 출발
    const r = await E(() => { const m = mapById('JC4'), leaf = m.leaves.findIndex(l => l.dest === '인천·부천'); let s0 = null;
      for(let s = 1; s < 300; s++){ startDrive({map:m, leaf, lane:2, type:'rear', jam:0, seed:s, sigT:0}); const ok = D.cfg.rearN >= 1; stopDrive(); if(ok){ s0 = s; break; } }
      return runDrive({map:m, leaf, lane:2, type:'rear', jam:0, seed:s0, sigT:0}, {hud:'ar', sample:ahSample, secs:14, ap:{mode:'lane', lane:2},
        setup:() => { const lead = D.cars.find(c => c.kind === 'lead'); if(lead) lead.brakeAt = null; }}); });
    const w = r.samples.filter(s => s.gate === 'wait' && s.dirZone === 'rear');
    const badL = w.filter(s => !(s.dirSide === -1 && s.hotRear.length && s.hotRear.every(h => h.x < 260)));
    check('왼쪽 뒤 차량: 빨강 뒤차가 뒤 띠의 왼쪽에 (목적지 방향이 아니라 실제 자리)', w.length > 0 && badL.length === 0, badL.length ? JSON.stringify(badL[0]).slice(0, 300) : `${w.length}프레임`);
  }
  {
    // 이미 목표 차로: 옮길 일이 없으면 꺾쇠 · 벽 없음, 청록 테두리가 내 차를 감쌈(완료 상태)
    const r = await E(() => { const m = mapById('JC4'), leaf = m.leaves.findIndex(l => l.dest === '의정부·구리');
      return runDrive({map:m, leaf, lane:2, type:'rear', jam:0, seed:9, sigT:0}, {hud:'ar', sample:ahSample, secs:10, ap:{mode:'lane', lane:2}}); });
    const enclosed = s => s.nearRails.length >= 2 && Math.min(...s.nearRails) < 260 && Math.max(...s.nearRails) > 260;
    check('이미 목표 차로: 꺾쇠 · 벽 없음, 청록 테두리가 내 차 양옆까지 (완료 상태)', r.samples.every(s => !s.need && !s.go && !s.wall && s.gate === 'none') && r.samples.filter(s => s.z > -190).every(enclosed), `need ${r.samples.filter(s => s.need).length}`);
  }
  {
    // 차로를 옮기면: 옮기기 전엔 테두리가 옆 차로(내 차를 감싸지 않음) → 옮긴 뒤엔 내 차를 감쌈
    const r = await E(() => { const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥');
      return runDrive({map:m, leaf, lane:1, type:'practice', jam:0, seed:3, sigT:0}, {hud:'ar', sample:ahSample, secs:12, ap:{mode:'lane', lane:1},
        setup:() => { D.cars.forEach(c => c.mesh.visible = false); D.cars = []; }, beforeFrame:t => { if(t > 3) window.AP.lane = 2; }}); });
    const enc = s => s.nearRails.length >= 2 && Math.min(...s.nearRails) < 260 && Math.max(...s.nearRails) > 260;
    const before = r.samples.filter(s => s.t < 2.5), after = r.samples.filter(s => s.t > 7 && s.z > -190);
    check('차로 변경 완료가 그래픽으로 구분됨: 전 = 테두리가 옆 차로 · 후 = 내 차를 감쌈 · 꺾쇠 사라짐', before.length && before.every(s => !enc(s) && s.go) && after.length && after.every(s => enc(s) && !s.go && !s.wall), `${before.length}/${after.length}`);
  }
  {
    const r = await rear(seeds[1] || seeds[0]);
    const stopBar = await E(() => document.getElementById('ahStop').getAttribute('d') || '');
    check('고속도로 대기 중 지금 차로를 막는 정지 막대가 없음 (대기 ≠ 정지)', r.samples.some(s => s.gate === 'wait') && stopBar === '', '');
  }

  /* ---------- 3. 정체: 틈 없음 · 틈 · 다시 닫힘 ---------- */
  {
    const r = await E(() => { const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥');
      return runDrive({map:m, leaf, lane:1, type:'jam', jam:3, seed:11, sigT:0}, {hud:'ar', sample:ahSample, secs:28, ap:{mode:'lane', lane:1},
        setup:() => { const lead = D.cars.find(c => c.kind === 'lead'); if(lead) lead.brakeAt = null; }}); });
    const beside = r.samples.filter(s => s.jam && s.beside && s.need), noGap = beside.filter(s => s.gate === 'wait');
    check('정체 줄 옆 틈 없음: 회색 줄 띠 + 주황 벽, 초록 없음', noGap.length > 0 && noGap.every(s => s.queue && s.wall && !s.go && !s.slot), `줄 옆 ${beside.length} · 틈 없음 ${noGap.length}`);
    check('정체: 판단이 이동이 아니면 초록 틈이 그려지지 않음', r.samples.every(s => !s.slot || s.gate === 'go'), '');
  }
  {
    const r = await E(() => { const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥'); let phase = 0, t1 = null, t2 = null, held = [];
      const res = runDrive({map:m, leaf, lane:1, type:'jam', jam:3, seed:11, sigT:0}, {hud:'ar', sample:ahSample, secs:24, ap:{mode:'lane', lane:1},
        setup:() => { D.cars.filter(c => c.kind === 'lead' || c.kind === 'rear' || c.kind === 'amb').forEach(c => c.mesh.visible = false); D.cars = D.cars.filter(c => !['lead','rear','amb'].includes(c.kind)); },
        beforeFrame:t => {
          const q = D.cars.filter(c => c.kind === 'queue' && c.lane === 2);
          if(phase === 0 && S.G && S.G.jam && S.G.jam.beside && S.G.jam.tail > D.z + 12){
            phase = 1; t1 = t; held = q.filter(c => Math.abs(c.z - D.z) < 9); held.forEach(c => c.mesh.visible = false); D.cars = D.cars.filter(c => !held.includes(c));
            q.forEach(c => { c.base = 3.5; }); }
          if(phase >= 1){ D.v = 3.5; D.cars.filter(c => c.kind === 'queue').forEach(c => { c.v = 3.5; c.base = 3.5; c.mean = false; }); }
          if(phase === 1 && t > t1 + 2.5){ phase = 2; t2 = t; const c = held[0]; c.s = LANE_START - (D.z + 1.5); c.v = 3.5; c.mesh.visible = true; D.cars.push(c); placeCars(); }
          window._jt = {t1, t2};
        }});
      return {res, jt:window._jt}; });
    const {t1, t2} = r.jt, S_ = r.res.samples;
    const open = S_.filter(s => s.t > t1 + 1 && s.t < t2), closed = S_.filter(s => s.t > t2 + .02).slice(0, 2);
    check('정체 틈 발생: 실제 간격이 되면 확인 뒤 초록 틈 테 + 꺾쇠', t1 !== null && open.some(s => s.gate === 'go' && s.slot && s.go), `틈 열린 뒤 상태 ${[...new Set(open.map(s => s.gate))].join(',')}`);
    check('정체 틈이 다시 닫히면 다음 프레임에 대기 · 초록 틈 사라짐', t2 !== null && closed.length && closed[0].gate === 'wait' && !closed[0].slot && !closed[0].go, JSON.stringify(closed[0] || null).slice(0, 200));
  }

  /* ---------- 3-1. 회전: 우리 HUD 경로가 내 차 아래로 지나가지 않음 · 회전 안내 유지 ---------- */
  for(const [mapId, dest, lane, key] of [['CRT', '종합병원', 1, 'ahIcoR'], ['CL2', '전통시장', 2, 'ahIcoL']]){
    const r = await E(([mapId, dest, lane]) => { const m = mapById(mapId), leaf = m.leaves.findIndex(l => l.dest === dest);
      return runDrive({map:m, leaf, lane, type:'city', jam:0, seed:777, sigT:0}, {hud:'ar', noPeds:true, sample:() => ({...ahSample(), chosen:D.chosen.length, ph:navCtx(S.s).phase, d:navCtx(S.s).d}), secs:40,
        setup:() => { D.cars.filter(c => c.kind !== 'onc').forEach(c => c.mesh.visible = false); D.cars = D.cars.filter(c => c.kind === 'onc'); }}); }, [mapId, dest, lane]);
    const near = r.samples.filter(s => s.chosen === 0 && s.d < 30);
    const under = r.samples.filter(s => s.laneMaxY !== null && s.laneMaxY > 212.01);
    check(`${mapId} 회전: 접근 · 회전 중 내내 회전 아이콘 유지(확정 전)`, near.length && near.every(s => s.icon === key), `${near.length}프레임`);
    check(`${mapId} 회전: 경로 그래픽이 가까운 면(y 212) 아래 = 내 차 줄로 내려오지 않음`, under.length === 0, under.length ? JSON.stringify({t:under[0].t, y:under[0].laneMaxY}) : `${r.samples.length}프레임`);
    // 'ㄱ'자 도로 재발 방지: 회전 전 접근 중 경로 띠는 들어갈 차로 폭 안(가로로 뻗지 않음) + 꺾이는 곳엔 회전 꺾쇠
    const appr = r.samples.filter(s => s.chosen === 0 && s.ph === 'approach' && s.d > 12 && s.d < 60 && s.laneN);
    const wide = appr.filter(s => s.laneXmax - s.laneXmin > 150 || s.laneXmin < 150 || s.laneXmax > 370);
    check(`${mapId} 회전 접근: 경로 띠가 옆으로 꺾여 뻗지 않음 (x 150 ~ 370 · 폭 150 안) · 회전 꺾쇠 표시`, appr.length > 10 && wide.length === 0 && appr.filter(s => s.turnMark).length > appr.length*.8, wide.length ? JSON.stringify({t:wide[0].t, x:[wide[0].laneXmin, wide[0].laneXmax]}) : `${appr.length}프레임 · 꺾쇠 ${appr.filter(s => s.turnMark).length}`);
  }

  /* ---------- 4. 미러: 같은 차가 같은 쪽 거울에 보임 (그린 픽셀 차이로) ---------- */
  {
    const mir = await E(() => {
      const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥');
      setMode('ar'); startDrive({map:m, leaf, lane:1, type:'practice', jam:0, seed:1, sigT:0}); D.frozen = true;
      D.cars.forEach(c => c.mesh.visible = false); D.cars = []; update(0);
      const grab = M => { MIR.aim(M); renderer.setRenderTarget(M.rt); renderer.render(scene, M.cam); const w = M.rt.width, h = M.rt.height, px = new Uint8Array(w*h*4); renderer.readRenderTargetPixels(M.rt, 0, 0, w, h, px); renderer.setRenderTarget(null); return {px, w, h}; };
      const out = {};
      for(const [name, lane] of [['right', 2], ['left', 0]]){
        const base = MIR.list.map(grab);
        const car = flowCars[0]; car.position.set(m.laneX(lane), 0, D.z + 14); car.rotation.y = 0; car.visible = true;
        const withCar = MIR.list.map(grab); car.visible = false;
        out[name] = MIR.list.map((M, i) => { let n = 0, sx = 0; const {px, w, h} = withCar[i], b = base[i].px;
          for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){ const k = (y*w + x)*4; if(Math.abs(px[k] - b[k]) + Math.abs(px[k+1] - b[k+1]) + Math.abs(px[k+2] - b[k+2]) > 30){ n++; sx += x; } }
          return {id:M.id, n, cx:n ? 1 - (sx/n)/w : null};   // 화면에 보이는 x(0 왼쪽 ~ 1 오른쪽) = 가로 뒤집기 뒤
        });
      }
      stopDrive(); return out;
    });
    const R = Object.fromEntries(mir.right.map(x => [x.id, x])), L = Object.fromEntries(mir.left.map(x => [x.id, x]));
    check('미러: 오른쪽 뒤 차가 오른쪽 사이드미러에 보이고 왼쪽엔 안 보임', R.right.n > 50 && R.left.n === 0, JSON.stringify(mir.right));
    check('미러: 오른쪽 뒤 차가 룸미러 오른쪽 절반에 보임(거울 뒤집기)', R.room.n > 20 && R.room.cx > .5, `룸미러 x ${R.room.cx && R.room.cx.toFixed(2)}`);
    check('미러: 왼쪽 뒤 차가 왼쪽 사이드미러 · 룸미러 왼쪽 절반에 보임', L.left.n > 50 && L.right.n === 0 && L.room.cx < .5, JSON.stringify(mir.left));
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
    check('세션: 비교는 현대 · 우리 두 HUD뿐, 순서 교대 — P1 현대 먼저 · P2 우리 먼저', p1.rows[0].hud === 'nav' && p2.rows[0].hud === 'ar' && [...p1.rows, ...p2.rows].every(r => r.hud === 'nav' || r.hud === 'ar') && p1.rows[0].order === 'AB' && p2.rows[0].order === 'BA', `${p1.rows[0].hud} / ${p2.rows[0].hud}`);
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
      arText:$$('#arHud text').map(t => t.id + ':' + t.textContent), arHud2:!!$('#arHud2')}));
    check('HUD 선택은 현대 HUD · 우리 HUD 두 개뿐, 버전/개선 전후 선택지 없음', JSON.stringify(r.modes) === JSON.stringify(['nav:현대 HUD', 'ar:우리 HUD']) && !r.pair && !r.verWords && !r.arHud2, JSON.stringify(r));
    check('우리 HUD 안 글자는 제한속도 숫자뿐 (행동 · 상태 설명 없음)', r.arText.length === 1 && /^ahLim:\d+$/.test(r.arText[0]), JSON.stringify(r.arText));
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
