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
    if(KEYS.down && D.v < .2) A.held += dt;
    _sp(dt); D.steer = u; D.wheel = u*dMax;
  };
  // 한 판을 dt 간격으로 끝까지(또는 secs초) 돌리며 매 프레임 sample()을 모음
  window.runDrive = (cfg, opts = {}) => {
    Object.assign(window.AP, {mode:'route', lane:null, exit:null, brakeUntilS:null, brakeHold:0, held:0}, opts.ap || {});
    setMode(opts.hud || 'ar2'); setLight(opts.light || 'day');
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
  window.h2Sample = () => {
    const G = S.G, at = id => document.getElementById(id).getAttribute('d') || '';
    return {t:+D.t.toFixed(2), z:+D.z.toFixed(1), x:+D.x.toFixed(2), gate:G.gate, need:G.need, side:G.side, text:G.text, msg:document.getElementById('h2Msg').textContent,
      arrow:at('h2Arrow').length > 0, wall:at('h2WallA').length > 0, slot:at('h2Slot').length > 0, icon:['h2IcoL','h2IcoS','h2IcoR'].find(id => document.getElementById(id).style.display !== 'none') || null,
      dirSide:G.dir ? G.dir.side : 0, dirZone:G.dir ? G.dir.zone : '', reasonKind:G.reason ? G.reason.kind : '', jam:!!G.jam, beside:G.jam ? G.jam.beside : false,
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

  /* ---------- 2. 뒤차 위험 · 대기 → 확인 → 이동 (우리 HUD v2) ---------- */
  const rear = async (seed, opts = {}) => E(([seed, opts]) => {
    const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥');
    return runDrive({map:m, leaf, lane:1, type:'rear', jam:0, seed, sigT:0}, {hud:'ar2', light:opts.light, sample:h2Sample, secs:opts.secs || 22, ap:{mode:'lane', lane:1},
      setup:() => { const lead = D.cars.find(c => c.kind === 'lead'); if(lead) lead.brakeAt = null; }});
  }, [seed, opts]);
  // 뒤차가 3대 이상 오는 seed 찾기
  const seeds = await E(() => { const out = []; const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥');
    for(let s = 1; s < 400 && out.length < 3; s++){ setMode('ar2'); startDrive({map:m, leaf, lane:1, type:'rear', jam:0, seed:s, sigT:0}); if(D.cfg.rearN >= 3) out.push(s); stopDrive(); } return out; });
  {
    const r = await rear(seeds[0]);
    const S_ = r.samples, waits = S_.filter(s => s.gate === 'wait'), gos = S_.filter(s => s.gate === 'go');
    const both = S_.filter(s => (s.gate === 'wait' || s.gate === 'clearing') && s.arrow);
    const wallInGo = S_.filter(s => s.gate === 'go' && s.wall);
    check(`뒤차 무리(seed ${seeds[0]}): 대기가 나옴`, waits.length > 0, `대기 ${waits.length}프레임`);
    check('대기 · 확인 중에는 이동 화살표가 절대 같이 나오지 않음', both.length === 0, `겹친 프레임 ${both.length}`);
    check('이동 중에는 막힌 벽이 없음', wallInGo.length === 0, `겹친 프레임 ${wallInGo.length}`);
    const rearWaits = waits.filter(s => s.dirZone === 'rear');
    const badDir = rearWaits.filter(s => !(s.dirSide === 1 && /^오른쪽 뒤 차량 · 대기$/.test(s.msg)));
    check('대기 이유 방향 = 내 차 기준 오른쪽 뒤 (목표도 오른쪽)', rearWaits.length > 0 && badDir.length === 0, badDir.length ? JSON.stringify(badDir.slice(0, 2)) : rearWaits[0].msg);
    // 첫 차가 지나간 뒤에도 다음 차가 위험하면 대기 유지: 대기 구간이 한 번에 이어지는지(중간에 이동이 끼지 않음)
    const firstGo = S_.findIndex(s => s.gate === 'go'), lastWait = S_.map(s => s.gate).lastIndexOf('wait');
    check('뒤차 한 대가 지나가도 다음 차가 위험하면 이동이 나오지 않음 (대기 → 이동은 마지막 위험 뒤에만)', firstGo === -1 || firstGo > lastWait, `첫 이동 ${firstGo} · 마지막 대기 ${lastWait}`);
    // 확인 단계가 있고 hold(0.8초) 이상 이어진 뒤 이동
    const tr = []; S_.forEach((s, i) => { if(i && s.gate !== S_[i-1].gate) tr.push({t:s.t, from:S_[i-1].gate, to:s.gate}); });
    const toGo = tr.find(x => x.to === 'go'), clr = tr.filter(x => x.to === 'clearing').pop();
    check('위험이 풀리면 확인(회색)을 거쳐 0.8초 뒤 이동', !toGo || (toGo.from === 'clearing' && clr && toGo.t - clr.t >= .75), JSON.stringify(tr.slice(0, 8)));
    const flips = tr.length;
    check('대기 ↔ 이동이 빠르게 깜빡이지 않음 (전환 10번 이하)', flips <= 10, `${flips}번 전환`);
    check('확인 단계 문구 = "확인 후 이동", 이동 문구 = "오른쪽으로 이동"', S_.filter(s => s.gate === 'clearing').every(s => s.msg === '확인 후 이동') && gos.every(s => s.msg === '오른쪽으로 이동'), '');
    check('목표 차로(청록)는 대기 중에도 그대로 — 갈 방향 아이콘 유지', waits.every(s => s.icon === 'h2IcoR'), '');
  }
  {
    // 위험 해소 직후 재접근: 이동이 된 뒤 빠른 차를 하나 더 뒤에 넣으면 즉시 대기
    const r = await E(() => { const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥'); let injected = false, tGo = null;
      return runDrive({map:m, leaf, lane:1, type:'rear', jam:0, seed:5, sigT:0}, {hud:'ar2', sample:h2Sample, secs:20, ap:{mode:'lane', lane:1},
        setup:() => { const lead = D.cars.find(c => c.kind === 'lead'); if(lead) lead.brakeAt = null; },
        beforeFrame:t => { if(!injected && S.G && S.G.gate === 'go'){ tGo = t; injected = true;
          const mesh = flowCars.find(c => !c.visible); const c = {mesh, lane:2, kind:'rear', v:D.v + 9, v0:D.v + 9, base:D.v + 9, T:.4, s0:2, seenV:D.v, len:mesh.userData.L, w:mesh.userData.W, P:lanePath(m, 2, 0), s:LANE_START - (D.z + 22)};
          D.cars.push(c); mesh.visible = true; placeCars(); window._inj = t; } }}); });
    const t0 = await E(() => window._inj), after = r.samples.filter(s => s.t > t0 + .02).slice(0, 3);
    check('위험 해소 뒤 재접근: 다음 프레임에 바로 대기로', t0 !== undefined && after.length && after[0].gate === 'wait' && !after[0].arrow, JSON.stringify(after[0]));
  }
  {
    // 왼쪽 목표 · 왼쪽 뒤 차: JC4 왼쪽 출구, 2차로에서 출발
    const r = await E(() => { const m = mapById('JC4'), leaf = m.leaves.findIndex(l => l.dest === '인천·부천'); let s0 = null;
      for(let s = 1; s < 300; s++){ startDrive({map:m, leaf, lane:2, type:'rear', jam:0, seed:s, sigT:0}); const ok = D.cfg.rearN >= 1; stopDrive(); if(ok){ s0 = s; break; } }
      return runDrive({map:m, leaf, lane:2, type:'rear', jam:0, seed:s0, sigT:0}, {hud:'ar2', sample:h2Sample, secs:14, ap:{mode:'lane', lane:2},
        setup:() => { const lead = D.cars.find(c => c.kind === 'lead'); if(lead) lead.brakeAt = null; }}); });
    const w = r.samples.filter(s => s.gate === 'wait' && s.dirZone === 'rear');
    const badL = w.filter(s => !(s.dirSide === -1 && s.msg === '왼쪽 뒤 차량 · 대기'));
    check('왼쪽 뒤 차량: 방향 = 왼쪽, 문구 "왼쪽 뒤 차량 · 대기"', w.length > 0 && badL.length === 0, badL.length ? JSON.stringify(badL.slice(0, 2)) : w[0].msg);
  }
  {
    // 이미 목표 차로: 옮길 일이 없으면 화살표 · 벽 · 대기 문구 없음 (JC4 오른쪽 출구를 3차로에서 출발)
    const r = await E(() => { const m = mapById('JC4'), leaf = m.leaves.findIndex(l => l.dest === '의정부·구리');
      return runDrive({map:m, leaf, lane:2, type:'rear', jam:0, seed:9, sigT:0}, {hud:'ar2', sample:h2Sample, secs:10, ap:{mode:'lane', lane:2}}); });
    check('이미 목표 차로: 대기 · 이동 표시가 나오지 않음', r.samples.every(s => !s.need && !s.arrow && !s.wall && s.gate === 'none'), `need ${r.samples.filter(s => s.need).length}`);
  }
  {
    // 대기 신호는 차로 변경 경계에만 — 지금 차로를 가로지르는 멈춤 막대(h2Stop)는 일반도로 정지 이유가 있을 때만
    const r = await rear(seeds[1] || seeds[0]);
    const stopBar = await E(() => document.getElementById('h2Stop').getAttribute('d') || '');
    check('고속도로 대기 중 지금 차로를 막는 정지 막대가 없음', r.samples.some(s => s.gate === 'wait') && stopBar === '', '');
  }

  /* ---------- 3. 정체: 틈 없음 · 틈 · 다시 닫힘 ---------- */
  {
    const r = await E(() => { const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥');
      return runDrive({map:m, leaf, lane:1, type:'jam', jam:3, seed:11, sigT:0}, {hud:'ar2', sample:h2Sample, secs:28, ap:{mode:'lane', lane:1},
        setup:() => { const lead = D.cars.find(c => c.kind === 'lead'); if(lead) lead.brakeAt = null; }}); });
    const beside = r.samples.filter(s => s.jam && s.beside && s.need);
    const noGap = beside.filter(s => s.gate === 'wait'), gap = beside.filter(s => s.gate === 'go');
    check('정체 줄 옆: 틈이 없으면 "틈 없음 · 차로 유지"', noGap.length > 0 && noGap.filter(s => s.reasonKind === 'queue').every(s => s.msg === '틈 없음 · 차로 유지'), `줄 옆 ${beside.length} · 틈 없음 ${noGap.length} · 틈 ${gap.length}`);
    check('정체: 판단이 이동이 아니면 초록 틈 표시가 없음', r.samples.every(s => !s.slot || s.gate === 'go'), '');
    check('정체: 틈 표시 · 화살표는 이동 판단과 함께만', gap.every(s => s.arrow), '');
  }

  {
    // 틈 발생 → 다시 닫힘: 줄과 같은 속도로 나란히 가며 내 옆 줄 차를 빼서 틈을 만들고(14m), 이어서 다시 넣음
    const r = await E(() => { const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥'); let phase = 0, t1 = null, t2 = null, held = [];
      const res = runDrive({map:m, leaf, lane:1, type:'jam', jam:3, seed:11, sigT:0}, {hud:'ar2', sample:h2Sample, secs:24, ap:{mode:'lane', lane:1},
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
    check('정체 틈 발생: 실제 앞뒤 간격이 되면 확인 뒤 초록 틈 + 화살표 + "틈으로 이동"', t1 !== null && open.some(s => s.gate === 'go' && s.slot && s.arrow && s.msg === '틈으로 이동'), `틈 열린 뒤 상태 ${[...new Set(open.map(s => s.gate))].join(',')}`);
    check('정체 틈이 다시 닫히면 다음 프레임에 대기 · 초록 틈 사라짐', t2 !== null && closed.length && closed[0].gate === 'wait' && !closed[0].slot && !closed[0].arrow, JSON.stringify(closed[0] || null).slice(0, 200));
  }

  /* ---------- 4. 미러: 같은 차가 같은 쪽 거울에 보임 (그린 픽셀 차이로) ---------- */
  {
    const mir = await E(() => {
      const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥');
      setMode('ar2'); startDrive({map:m, leaf, lane:1, type:'practice', jam:0, seed:1, sigT:0}); D.frozen = true;
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
      runDrive({map:m, leaf, lane:1, type:'rear', jam:0, seed:2, sigT:0}, {hud:'ar2', secs:16, ap:{mode:'lane', lane:3},
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
      EXP.pair = ['ar', 'ar2']; EXP.order = 'auto'; EXP.practice = true;
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
    check('세션: 순서 교대 — P1 A→B(v1 먼저) · P2 B→A(v2 먼저)', p1.rows[0].hud === 'ar' && p2.rows[0].hud === 'ar2' && p1.rows[0].order === 'AB' && p2.rows[0].order === 'BA', `${p1.rows[0].hud} / ${p2.rows[0].hud}`);
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
      S.demoMap = 'ICR'; S.demoTarget = defaultLeaf(mapById('ICR')); S.demoJam = 0; setMode('ar2'); start();
      for(let k = 0; k < 75; k++){ S.s += cruiseOf(S.map)/30; update(1/30); }
      const gate1 = S.G.gate; S.paused = true; const s0 = S.s; for(let k = 0; k < 30; k++) update(1/30); const s1 = S.s; S.paused = false;
      start(); const after = {gate:GS.gate.state, s:S.s, log:GS.gate.log.length};
      setMode('nav'); update(1/30); const navVis = document.getElementById('navHud').style.display !== 'none' && document.getElementById('arHud2').style.display === 'none';
      setMode('ar2'); stopDemo(); goHome();
      return {gate1, paused:s0 === s1, after, navVis};
    });
    check('시연 일시정지 중 진행도가 움직이지 않음', r.paused, '');
    check('재시작하면 대기 · 이동 판단 기록이 처음부터', r.after.log <= 1 && r.after.s === 40, JSON.stringify(r.after));
    check('HUD 바꾸면 한 HUD만 보임', r.navVis, '');
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
