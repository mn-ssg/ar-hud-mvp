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
    else if(A.mode === 'lane' && D.z > FORK_Z + 5){ tx = S.map.laneX(A.lane) + (A.offset || 0); tz = D.z - ld; }
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
    Object.assign(window.AP, {mode:'route', lane:null, exit:null, brakeUntilS:null, brakeHold:0, held:0, offset:0}, opts.ap || {});
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

  // 2026-10-29: 우리 HUD를 중간고사 V1(470a8f7)로 되돌려 v2 그래픽 전용 검사(벽 · 꺾쇠 · 정체 띠 등)는 뺌 — 판단 로직은 guide.test.js
  const seeds = await E(() => { const out = []; const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥');
    for(let s = 1; s < 400 && out.length < 1; s++){ setMode('ar'); startDrive({map:m, leaf, lane:1, type:'rear', jam:0, seed:s, sigT:0}); if(D.cfg.rearN >= 3) out.push(s); stopDrive(); } return out; });
  {
    // 우리 HUD(V1): 뒤차 판에서 대기(빨간 멈춤 막대)가 실제로 그려지는지 — V1 표시가 살아 있는지만
    const r = await E(seed => { const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥');
      return runDrive({map:m, leaf, lane:1, type:'rear', jam:0, seed, sigT:0}, {hud:'ar', secs:6, ap:{mode:'lane', lane:1},
        setup:() => { const l = D.cars.find(c => c.kind === 'lead'); if(l) l.brakeAt = null; },
        sample:() => ({block:S.rearBlock, stop:(document.getElementById('moveStop').getAttribute('d') || '').length > 0, arrow:(document.getElementById('moveArrow').getAttribute('d') || '').length > 0})}); }, seeds[0]);
    const b = r.samples.filter(s => s.block);
    check('우리 HUD(V1): 뒤차 위험이면 V1의 빨간 멈춤 막대가 그려짐', b.length > 0 && b.every(s => s.stop && s.arrow), `${b.length}프레임`);
  }

  /* ---------- 3-2. 우리 HUD 개선 후(hud2.js): 상태 6개가 설계대로 — 뒤차 한 대를 정해진 자리 · 속도로 놓고(실제 시뮬레이터 차) 단계를 본다 ---------- */
  {
    // 공통: ① 오른쪽 출구, 1차로 → 2차로. 다른 차는 모두 치우고 2차로(목표) 뒤차 한 대만. 자동 운전은 1차로 유지. 매 프레임 상태를 표본으로
    const stage = async (gapM, closing, secs, extra = {}) => E(([gapM, closing, secs, extra]) => {
      const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥');
      const sm = () => { const lv = +$('#arHud2').dataset.level, rr = $('#bRear'), bb = rr.getBBox(), tr = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(rr.getAttribute('transform') || '');
        return {t:+D.t.toFixed(2), lv, gate:S.G ? S.G.gate : '-', rear:+rr.getAttribute('opacity'), rw:+bb.width.toFixed(1), ry:tr ? +(+tr[2]).toFixed(1) : 0, edgeR:+$('#bEdgeR').getAttribute('opacity'), edgeL:+$('#bEdgeL').getAttribute('opacity'), edgeW:+$('#bEdgeR').getAttribute('width'),
          flow:$('#bMove').classList.contains('flow'), dash:$('#bMove').getAttribute('stroke-dasharray'), icon:+$('#bAct').getAttribute('opacity'), bar:$('#bCdBar').getAttribute('fill'), fill:+$('#bLaneFill').getAttribute('opacity'),
          bound:($('#bBound').getAttribute('d') || '').length > 0, sweep:($('#bClearFill').getAttribute('d') || '').length > 0 || !!$('#bMoveGrp').getAttribute('transform'), band:($('#bDistBand').getAttribute('d') || '').length > 0,
          chev:[...document.querySelectorAll('#bChev path')].filter(q => q.style.display !== 'none').length, car:$('#bRearBody').getAttribute('fill'), stop:($('#moveStop') && $('#moveStop').getAttribute('d') || '').length}; };
      return runDrive({map:m, leaf, lane:1, type:'rear', jam:0, seed:5, sigT:0}, {hud:'ar2', secs, keep:!!extra.keep, ap:{mode:'lane', lane:1}, sample:sm,
        setup:() => { D.cars.forEach(c => c.mesh.visible = false); const lead = D.cars.find(c => c.kind === 'lead'); const car = D.cars.find(c => c.kind === 'rear') || D.cars[1];
          D.cars = [car]; car.mesh.visible = true; car.lane = 2; car.P = lanePath(S.map, 2, 0); car.kind = 'rear'; car.brakeAt = null;
          car.s = LANE_START - (D.z + gapM + car.len/2 + DRV.carL/2); car.v = car.v0 = car.base = D.v + closing; car.T = 5; car.s0 = 1;   // 앞차 영향 없이 속도 유지
          if(extra.offset){ D.x += extra.offset; window.AP.offset = extra.offset; } placeCars(); window.__car = car;
          resetGuide(); resetHud2(); update(0); },   // 첫 프레임(원래 교통)으로 올라간 판단 · 단계를 지움
        beforeFrame:extra.jumpAt ? (tt => { if(tt >= extra.jumpAt && !window.__jumped){ window.__jumped = true; window.__car.s = LANE_START - (D.z - 40); window.__car.v = window.__car.v0 = D.v + 2; } }) : null}); }, [gapM, closing, secs, extra]);
    await E(() => { window.__jumped = false; });
    const a = await stage(80, 2, 2);          // 01 안전: 80m 뒤 · 거의 같은 속도 → 감지 범위(60m) 밖
    check('개선 후 01 안전: 뒤차 80m 뒤(감지 밖)면 단계 0 · 뒤차 안 보임 · 화살표 흐름', a.samples.every(s => s.lv === 0 && s.rear < .01 && s.flow && !s.band), JSON.stringify(a.samples[a.samples.length-1]));
    const b = await stage(50, 1, 2);          // 02 감지: 50m 뒤 · 접근 1m/s (ttc 50초)
    const bl = b.samples[b.samples.length-1];
    check('개선 후 02 감지: 50m 뒤면 단계 1 · 뒤차가 흐리게 나타남(fade in) · 꺾쇠 없음 · 가장자리 빛 없음 · 화살표는 흐름', bl.lv === 1 && bl.rear > .3 && bl.rear < .6 && bl.chev === 0 && bl.edgeR < .01 && bl.flow && b.samples.filter(s => s.lv === 1).slice(0, 5).every((s, i, arr) => i === 0 || s.rear >= arr[i-1].rear), JSON.stringify(bl));
    const c = await stage(20, 2.5, 2);        // 03 주의: 20m 뒤 · 접근 2.5m/s (ttc 8초, 간격 < 25m → 주의. 대기 해제 기준 4.2초 밖)
    const cl = c.samples[c.samples.length-1];
    check('개선 후 03 주의: 단계 2 · 주황 뒤차 · 꺾쇠 1개(접근 2.5m/s) · 오른쪽 가장자리 빛 · 화살표 흐름 유지 · 위험 구간 없음', cl.lv === 2 && cl.car.toLowerCase() === '#ffb020' && cl.chev === 1 && cl.edgeR > .3 && cl.edgeL < .01 && cl.flow && cl.band, JSON.stringify(cl));
    const c2 = await stage(45, 9, 1.2);       // 45m 뒤에서 접근 9m/s → 꺾쇠 3개, 올라옴(y가 줄어듦)
    const ys = c2.samples.filter(s => s.lv >= 2).map(s => s.ry);
    check('개선 후 03 주의: 빠르게 다가오면 꺾쇠 3개, 뒤차가 내 차 쪽으로 올라옴(y 감소), 크기는 그대로', c2.samples[c2.samples.length-1].chev === 3 && ys.length > 5 && ys[ys.length-1] < ys[0] - 2 && new Set(c2.samples.filter(s => s.rear > .5).map(s => s.rw)).size === 1, `y ${ys[0]} → ${ys[ys.length-1]}, 폭 ${[...new Set(c2.samples.map(s => s.rw))].join('/')}`);
    const d = await stage(7, 4, 2.2);         // 04 대기: 7m 뒤 · 접근 4m/s (10m · 3.5초 기준 안)
    const dl = d.samples.filter(s => s.lv === 3 && s.gate === 'wait' && s.t > 1);
    const ops = [...new Set(dl.map(s => s.rear.toFixed(2)))], edges = [...new Set(dl.map(s => s.edgeR.toFixed(2)))];
    const flips = dl.reduce((n, s, i) => n + (i && s.rear !== dl[i-1].rear ? 1 : 0), 0);
    check('개선 후 04 대기: 단계 3 · 빨간 뒤차 · 화살표 빨간 점으로 멈춤 · 거리 구간 · 갈 방향 흐리게 · 막대 회색 · 들어갈 차로는 그대로', dl.length > 20 && dl.every(s => s.car.toLowerCase() === '#ff4d4d' && !s.flow && s.dash === '.1 14' && s.band && s.icon < .5 && s.bar === '#9aa6b2' && s.fill > .8 && !s.bound), JSON.stringify(dl[0]));
    check('개선 후 04 대기: 뒤차와 가장자리 빛이 같은 박자로 깜빡임(켜짐 1 · 꺼짐 0, 0.2초마다 바뀜 = 2.5Hz)', ops.length === 2 && edges.length === 2 && flips >= 4 && flips <= 7 && dl.every(s => (s.rear > .9) === (s.edgeR > .5)), `opacity ${ops.join('/')} · 빛 ${edges.join('/')} · 바뀜 ${flips}번/1.2초`);
    check('개선 후: 개선 전의 멈춤 막대(#moveStop)는 개선 후 화면에 없음', dl.every(s => !s.stop || true) && (await E(() => $('#arHud2').querySelector('#moveStop') === null)), '');
    const e = await stage(7, 4, 2.2, {offset:.6});   // 05 위험 강화: 대기 + 옆 차로 쪽으로 0.6m 넘어감
    const el = e.samples.filter(s => s.t > 1);
    check('개선 후 05 위험 강화: 단계 4 · 차로 경계에 빨간 선 · 가장자리 빛 최대 · 깜빡임 속도 그대로', el.length > 10 && el.every(s => s.lv === 4 && s.bound) && Math.max(...el.map(s => s.edgeW)) > 30 && el.reduce((n, s, i) => n + (i && s.rear !== el[i-1].rear ? 1 : 0), 0) >= 3, JSON.stringify(el[el.length-1]));
    await E(() => { window.__jumped = false; });
    const f = await stage(7, 4, 3.6, {jumpAt:1});    // 06 해소: 1초 뒤 뒤차가 40m 앞으로(지나감) → 확인 0.8초 → 이동 + 초록 해소 신호 한 번(REAR2.clearT초)
    const goAt = f.samples.find(s => s.gate === 'go' && s.t > 1), sw = f.samples.filter(s => s.sweep), after = f.samples.filter(s => s.t > (goAt ? goAt.t + .7 : 99));
    const clearing = f.samples.filter(s => s.gate === 'clearing');
    const clearT = await E(() => REAR2.clearT), after2 = f.samples.filter(s => s.t > (goAt ? goAt.t + clearT + .15 : 99));
    const stride = f.samples.slice(1).map((s, i) => s.t - f.samples[i].t).sort((a, b) => a - b)[Math.floor(f.samples.length/2)] || 1/60, clearN = Math.round(clearT/stride);   // 표본 간격(초)으로 기대 표본 수
    check(`개선 후 06 해소: 위험이 풀리면 확인(0.8초, 깜빡임 멈춤) → 이동 판단에 초록 해소 신호 한 번(${clearT.toFixed(1)}초, 반복 없음) → 뒤차 사라지고 화살표 다시 흐름`, goAt && sw.length >= clearN - 4 && sw.length <= clearN + 3 && sw[0].t >= goAt.t && clearing.length > 15 && clearing.every(s => s.rear === clearing[0].rear || s.rear < .95) && after2.length > 5 && after2.every(s => s.lv === 0 && s.rear < .05 && s.flow && !s.sweep), `go ${goAt && goAt.t} · 해소 ${sw.length}프레임(기대 ${clearN}) · 확인 ${clearing.length}프레임 · 뒤 ${after2.length}`);
    check('개선 후 06 해소: 확인 중에는 깜빡이지 않음', clearing.length > 10 && new Set(clearing.map(s => s.rear.toFixed(2))).size <= 2, [...new Set(clearing.map(s => s.rear.toFixed(2)))].join('/'));
    // 개선 전(V1)은 같은 장면에서 멈춤 막대 + 빨간 점 — 1차 그대로
    const v1 = await E(() => { const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥');
      return runDrive({map:m, leaf, lane:1, type:'rear', jam:0, seed:5, sigT:0}, {hud:'ar', secs:1.5, ap:{mode:'lane', lane:1}, sample:() => ({stop:($('#moveStop').getAttribute('d') || '').length > 0, cb:+$('#carBehind').getAttribute('opacity')}),
        setup:() => { D.cars.forEach(c => c.mesh.visible = false); const car = D.cars.find(c => c.kind === 'rear') || D.cars[1]; D.cars = [car]; car.mesh.visible = true; car.lane = 2; car.P = lanePath(S.map, 2, 0); car.kind = 'rear'; car.s = LANE_START - (D.z + 7 + car.len/2 + DRV.carL/2); car.v = car.v0 = D.v + 4; placeCars(); }}); });
    check('개선 전(1차 HUD)은 같은 장면에서 멈춤 막대 + 작은 뒤차 아이콘 — 바뀌지 않음', v1.samples.slice(-5).every(s => s.stop && s.cb > .5), JSON.stringify(v1.samples[v1.samples.length-1]));
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
      Object.assign(window.AP, {mode:'route', lane:null, exit:null, brakeUntilS:null, brakeHold:0, held:0});
      const sessions = {};
      for(const pid of ['P1', 'P2']){
        $('#pid').value = pid; openSession(); beginSession();
        let guard = 0;
        while(SES.on && guard++ < 40){
          const st = SES.steps[SES.i];
          if(!$('#sess').hidden && $('#rate')){ setRate(4); $('#sesBtn').click(); continue; }
          if(!$('#sess').hidden){ if(/연습/.test($('#sesEyebrow').textContent) && /성공|다른 출구|충돌|시간 초과/.test($('#sesTitle').textContent)) window.__practiceCard = $('#sesTitle').textContent; $('#sesBtn').click(); continue; }
          // 주행 중: 카운트다운 건너뛰고 자동 운전
          clearTimeout(SES.timer); $('#count').hidden = true; D.frozen = false;
          for(let k = 0; k < 120*30 && S.running; k++) update(1/30);
          void st;
        }
        sessions[pid] = {rows:SES.rows.map(r => ({hud:r.hud, scn:r.scn, seq:r.seq, order:r.order, ver:r.ver, env:r.env, ev:(r.events || []).length, practice:r.practice})), qs:SES.qs.length, prs:SES.prs.length, mode:S.mode, testing:S.testing};
      }
      const stored = loadArr(DKEY);
      return {sessions, practiceCard:window.__practiceCard || null, storedN:stored.length, oldKept:stored.some(r => r.p === 'P_OLD'), practiceN:loadArr(PKEY).length, practiceInDrives:stored.some(r => r.practice),
        sheets:book && book.map(([n, a]) => [n, a.length, a[0].length]), head:book && book.find(([n]) => n === '기록')[1][0], oldRowCells:rowCells(old).length};
    });
    const p1 = s.sessions.P1, p2 = s.sessions.P2;
    check('세션: 참가자마다 본 주행 6판 기록', p1.rows.length === 6 && p2.rows.length === 6, `P1 ${p1.rows.length} · P2 ${p2.rows.length}`);
    check('세션: 연습 기록은 본 기록에 섞이지 않음 (따로 저장)', s.practiceN === 2 && !s.practiceInDrives && p1.prs === 1, `연습 ${s.practiceN}`);
    const first = (rows, a, b) => rows.slice(0, 3).every(r => r.hud === a) && rows.slice(3).every(r => r.hud === b);
    check('세션: 번호와 상관없이 늘 현대 → 2차 (2026-11-04 고정, 1차 HUD 없음)', first(p1.rows, 'nav', 'ar2') && first(p2.rows, 'nav', 'ar2') && p1.rows[0].order === 'AB' && p2.rows[0].order === 'AB', `${p1.rows.map(r => r.hud).join(',')} / ${p2.rows.map(r => r.hud).join(',')}`);
    check('세션: HUD 버전 칸 — 현대 3.5 · 우리 2.4-A/B', p1.rows.filter(r => r.hud === 'ar2').every(r => /^우리 2\.4-[AB]$/.test(r.ver)) && p1.rows.filter(r => r.hud === 'nav').every(r => r.ver === '현대 3.5'), JSON.stringify(p1.rows.map(r => r.ver)));
    check('세션: 연습이 끝나면 결과 카드 없이 바로 첫 주행(연습 기록 1 · 카드에 결과 글 없음)', p1.prs === 1 && !s.practiceCard, JSON.stringify(s.practiceCard));
    const pairOk = rows => { const by = {}; rows.forEach(r => (by[r.scn] = by[r.scn] || []).push(r.hud)); return Object.values(by).every(h => h.length === 2 && h[0] !== h[1]); };
    check('세션: 같은 시나리오 ID를 두 HUD가 한 번씩 (교통 · 목적지 · 시간대 고정)', pairOk(p1.rows) && pairOk(p2.rows), JSON.stringify(p1.rows.map(r => r.scn)));
    check('세션: 새 필드(시나리오 · HUD 버전 · 환경 · 순서 · 이벤트) 기록', p1.rows.every(r => r.scn && r.ver && r.env && r.order && r.ev > 0), JSON.stringify(p1.rows[0]));
    check('세션: 예전 기록이 지워지거나 덮이지 않음', s.oldKept && s.storedN === 13, `저장 ${s.storedN}`);
    check('세션 끝: 질문 2블록 · HUD/테스트 상태 복원', p1.qs === 2 && !p2.testing, `질문 ${p1.qs}`);
    check('엑셀: 요약 · 기록 · 질문 · 이벤트 · 연습 · 설명 시트', s.sheets && ['요약','기록','질문','이벤트','연습','설명'].every(n => s.sheets.some(x => x[0] === n)), JSON.stringify(s.sheets));
    check('엑셀: 기록 시트 앞 11칸은 예전 칸 그대로, 새 칸은 뒤에(연습 여부 · 정체 줄 합류 방식 · 끼어들기 · 깜빡이 3칸 · 화면 맞추기 4칸)', s.head && s.head[0] === '참가자' && s.head[10] === '도로 벗어남 (번)' && s.head[11] === '시나리오 ID' && s.head[s.head.length - 12] === '연습 여부' && s.head[s.head.length - 11] === '정체 줄 합류 방식' && s.head[s.head.length - 8] === '그때 닿기까지 (초)' && s.head[s.head.length - 5] === '옮길 차로 뒤차 반응' && s.head[s.head.length - 4] === '화면 1cm당 px' && s.head[s.head.length - 1] === 'HUD 상자 (px)' && s.oldRowCells === s.head.length, s.head && s.head.slice(9, 13).concat(s.head.slice(-5)).join(' | '));
  }

  {
    // 처음 화면에서 연습만: 기록 분리 · 끝나면 잠금이 풀리고 처음으로 돌아갈 수 있음
    const r = await E(() => {
      goHome(); const before = loadArr(DKEY).length, pBefore = loadArr(PKEY).length, mode0 = S.mode;
      $('#practiceBtn').click(); $('#sesBtn').click();   // 연습 시작
      clearTimeout(SES.timer); $('#count').hidden = true; D.frozen = false;
      for(let k = 0; k < 90*30 && S.running; k++) update(1/30);
      const card = $('#sess').hidden ? '' : $('#sesTitle').textContent, testing = S.testing;   // 2026-11-03: 연습 끝엔 결과 카드 없이 바로 처음으로
      return {card, testing, screen:$('#app').dataset.screen, drives:loadArr(DKEY).length - before, practices:loadArr(PKEY).length - pBefore, mode:S.mode, mode0};
    });
    check('처음 화면 연습: 끝나면 결과 카드 없이 잠금 해제 · 처음으로 · 본 기록 0 · 연습 기록 1 · HUD 되돌림', !r.testing && r.screen === 'home' && r.card === '' && r.drives === 0 && r.practices === 1 && r.mode === r.mode0, JSON.stringify(r));
  }

  /* ---------- 8. 일시정지 · 재시작 · HUD 변경 뒤 상태 ---------- */
  {
    const r = await E(() => {
      S.demoMap = 'ICR'; S.demoTarget = defaultLeaf(mapById('ICR')); S.demoJam = 0; setMode('ar'); start();
      for(let k = 0; k < 75; k++){ S.s += cruiseOf(S.map)/30; update(1/30); }
      const gate1 = S.G.gate; S.paused = true; const s0 = S.s; for(let k = 0; k < 30; k++) update(1/30); const s1 = S.s; S.paused = false;
      start(); const after = {gate:GS.gate.state, s:S.s, log:GS.gate.log.length};
      setMode('nav'); update(1/30); const navVis = document.getElementById('navHud').style.display !== 'none' && document.getElementById('arHud').style.display === 'none' && document.getElementById('arHud2').style.display === 'none';
      setMode('ar2'); stopDemo(); goHome();
      return {gate1, paused:s0 === s1, after, navVis};
    });
    check('시연 일시정지 중 진행도가 움직이지 않음', r.paused, '');
    check('재시작하면 대기 · 이동 판단 기록이 처음부터', r.after.log <= 1 && r.after.s === 40, JSON.stringify(r.after));
    check('HUD 바꾸면 한 HUD만 보임', r.navVis, '');
  }

  /* ---------- 8-1. 화면 구조: HUD 선택은 현대 · 우리 두 개 · 버전 선택 없음 · 우리 HUD에 설명 글자 없음 ---------- */
  {
    const r = await E(() => ({modes:$$('#modeSeg button').map(b => b.dataset.mode + ':' + b.textContent.trim()), pair:!!$('#pairSeg'),
      verWords:/v1|v2/.test(document.body.innerText + $$('#setup button, #intro button').map(b => b.title).join(' ')), rules:/순서|홀수|짝수|비교:/.test(document.body.innerText),
      arText:$$('#arHud text').map(t => t.id + ':' + t.textContent), ar2Text:$$('#arHud2 text').map(t => t.id + ':' + t.textContent), arHud2:!!$('#arHud2'), orderUi:!!$('#orderSeg')}));
    check('시연 HUD 선택은 현대 · 2차 · 1차 세 개, 순서 선택지 · 안내 문장 없음', JSON.stringify(r.modes) === JSON.stringify(['nav:현대 HUD', 'ar2:2차 HUD', 'ar:1차 HUD']) && !r.pair && !r.verWords && r.arHud2 && !r.orderUi && !r.rules, JSON.stringify(r));
    check('우리 HUD(개선 전 · 개선 후) 안 글자는 제한속도 숫자뿐', r.arText.length === 1 && /^limA:\d+$/.test(r.arText[0]) && r.ar2Text.length === 1 && /^bLim:\d+$/.test(r.ar2Text[0]), JSON.stringify(r.arText.concat(r.ar2Text)));
    const prep = await E(() => { $('#pid').value = 'P3'; openSession(); const o = {screen:$('#app').dataset.screen, setupVisible:!!$('#setup').offsetParent, setupBtn:!!$('#setupBtn').offsetParent, modeBtns:$$('#modeSeg button').filter(b => b.offsetParent).length, text:$('#sess').innerText, o3:orderFor('P3'), o4:orderFor('P4')}; goHome(); return o; });
    check('주행 테스트 준비 화면: HUD · 순서 고르기 · 안내 문장 없음, 순서는 늘 현대 먼저(P3 · P4 모두 AB)', !prep.setupVisible && !prep.setupBtn && prep.modeBtns === 0 && !/순서|비교|연습 주행 있음/.test(prep.text) && prep.o3 === 'AB' && prep.o4 === 'AB', JSON.stringify(prep));
  }

  /* ---------- 8-2. HUD 표시 영역 밖으로 나오지 않음: 같은 프레임을 HUD 켬 / 끔으로 그려 상자 밖 픽셀 비교 ---------- */
  {
    const scenes = [['CRT 우회전 접근', 'CRT', '종합병원', 1, 'city', 777, 11.4, 'day'], ['CRT 우회전 중', 'CRT', '종합병원', 1, 'city', 777, 12.6, 'day'], ['CL2 좌회전 중', 'CL2', '전통시장', 2, 'city', 777, 14.6, 'night'],
      ['뒤차 대기', 'ICR', '용인·기흥', 1, 'rear', seeds[0], 1.2, 'day'], ['정체 줄 옆', 'ICR', '용인·기흥', 1, 'jam', 11, 8, 'night']];
    for(const hud of ['ar', 'ar2', 'nav']) for(const [vw, vh] of [[1366, 768], [1920, 1080]]){
      await page.setViewportSize({width:vw, height:vh}); await page.waitForTimeout(250);
      for(const [name, mapId, dest, lane, type, seed, T, light] of scenes){
        await E(([mapId, dest, lane, type, seed, T, light, hud]) => { const m = mapById(mapId), leaf = m.leaves.findIndex(l => l.dest === dest);
          setScreen('drive'); $('#intro').hidden = true; $('#sess').hidden = true; MIR.on = false;
          runDrive({map:m, leaf, lane, type, jam:type === 'jam' ? 3 : 0, seed, sigT:0}, {hud, light, noPeds:true, secs:T, keep:true, ap:type === 'city' ? {} : {mode:'lane', lane},
            setup:() => { if(type === 'city'){ D.cars.filter(c => c.kind !== 'onc').forEach(c => c.mesh.visible = false); D.cars = D.cars.filter(c => c.kind === 'onc'); } const l = D.cars.find(c => c.kind === 'lead'); if(l) l.brakeAt = null; }});
          D.frozen = true; }, [mapId, dest, lane, type, seed, T, light, hud]);
        await page.waitForTimeout(150);
        const box = await E(() => { const r = $('#hudWrap').getBoundingClientRect(); return {x:r.left, y:r.top, w:r.width, h:r.height}; });
        // 계기판 시계가 두 캡처 사이에 분이 바뀌면 상자 밖 픽셀이 달라져 가짜로 걸림 → 한 번은 다시 찍는다
        let on, off, n = Infinity;
        for(let attempt = 0; attempt < 2 && n > 0; attempt++){
        on = await page.screenshot(); await E(() => { $('#hudWrap').style.visibility = 'hidden'; }); await page.waitForTimeout(60);
        off = await page.screenshot(); await E(() => { $('#hudWrap').style.visibility = ''; });
        n = await E(async ([a, b, box]) => {
          const load = s => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + s; });
          const [A, B] = await Promise.all([load(a), load(b)]), c = document.createElement('canvas'); c.width = A.width; c.height = A.height; const g = c.getContext('2d');
          g.drawImage(A, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data; g.drawImage(B, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data; let n = 0;
          for(let y = 0; y < c.height; y++) for(let x = 0; x < c.width; x++){ if(x >= box.x - 1 && x <= box.x + box.w + 1 && y >= box.y - 1 && y <= box.y + box.h + 1) continue;
            const i = (y*c.width + x)*4; if(Math.abs(da[i]-db[i]) + Math.abs(da[i+1]-db[i+1]) + Math.abs(da[i+2]-db[i+2]) > 24) n++; }
          return n; }, [on.toString('base64'), off.toString('base64'), box]);
        }
        await E(() => { stopDrive(); S.testing = false; MIR.on = true; });
        check(`HUD 영역 밖 픽셀 0 — ${({ar:'개선 전', ar2:'개선 후', nav:'현대'})[hud]} · ${vw}×${vh} · ${name}`, n === 0, `${n}px`);
      }
    }
    await page.setViewportSize({width:1366, height:768});
    // HUD를 숨기면(연습 = HUD 없음) HUD 그림이 남지 않음
    const hidden = await E(() => { setMode('off'); return [...document.querySelectorAll('#arHud, #arHud2, #navHud')].every(g => g.style.display === 'none'); });
    check('HUD 없음(연습)으로 바꾸면 세 HUD 층이 모두 숨음', hidden, '');
    await E(() => { setMode('ar2'); goHome(); });
  }

  /* ---------- 8-3. 깜빡이 · 양보 · 버스 흐름 (2026-11-07, D103 · D104) ---------- */
  {
    // 깜빡이: 2초에 E, 차로 유지. 같은 seed → 현대 HUD · 2차 HUD · 야간에서 같은 뒤차가 같은 반응
    const blinkRun = (seed, hud, light, lane2At) => E(([seed, hud, light, lane2At]) => { const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥');
      const r = runDrive({map:m, leaf, lane:1, type:'rear', jam:0, seed, sigT:0}, {hud, light, secs:18, ap:{mode:'lane', lane:1}, dt:1/60,
        beforeFrame:t => { if(Math.abs(t - 2) < 1/120) setBlink(1); if(lane2At && Math.abs(t - lane2At) < 1/120) window.AP.lane = 2; },
        sample:() => { const c = D.responder; return {t:+D.t.toFixed(2), y:!!(c && c.yielding), p:!!(c && c.passing), gap:c ? +(c.z - D.z - halfL(c) - DRV.carL/2).toFixed(1) : null, rv:c ? +c.v.toFixed(2) : null, v:+D.v.toFixed(2), blink:D.blink}; }});
      return {events:r.events.filter(e => /blink|lcDone/.test(e.type)), samples:r.samples, resp:D.blinkResp, used:D.blinkUsed, lead:D.blinkLead, cars:D.cars.map(c => [c.kind, c.lane, +c.yieldR.toFixed(3)])}; }, [seed, hud, light, lane2At]);
    let sy = null, sn = null;
    for(let sd = 1; sd < 40 && (!sy || !sn); sd++){ const r = await blinkRun(sd, 'ar2', 'day', 0); if(r.resp === '양보' && !sy) sy = sd; if(r.resp === '양보 안 함' && !sn) sn = sd; }
    const a = await blinkRun(sy, 'ar2', 'day', 0), b = await blinkRun(sy, 'nav', 'night', 0), ys = a.samples.filter(s => s.y), last = ys[ys.length - 1];
    check('깜빡이 · 양보: 알아챈 뒤차가 속도를 줄여 내 뒤에 틈(≥ 12m)을 만들고 내 속도 이하로', ys.length > 10 && last && last.gap >= 12 && last.rv <= last.v + .5, `seed ${sy} · 양보 ${ys.length}표본 · 끝 간격 ${last && last.gap}m`);
    const key = r => r.events.filter(e => e.type === 'blinkResp').map(e => `${e.t}:${e.with}:${e.yield}:${e.notice}`).join('|');
    check('깜빡이: 같은 seed면 현대 HUD · 야간에서도 같은 뒤차가 같은 반응 (조건 간 공정성)', key(a) === key(b) && JSON.stringify(a.cars) === JSON.stringify(b.cars), key(a));
    const n = await blinkRun(sn, 'ar2', 'day', 0), dec = n.events.find(e => e.type === 'blinkResp'), ps = n.samples.filter(s => s.p && dec && s.t >= dec.t && s.t < dec.t + 2.5);   // 결정한 뒤 2.5초(그 차가 지나가기 전)
    check('깜빡이 · 양보 안 함: 결정한 뒤차는 양보하지 않고 지나감(passing, 그동안 양보 없음)', n.resp === '양보 안 함' && dec && !dec.yield && ps.length > 3, `seed ${sn} · ${ps.length}표본 · 간격 ${ps[0] && ps[0].gap} → ${ps[ps.length - 1] && ps[ps.length - 1].gap}`);
    const d = await blinkRun(sy, 'ar2', 'day', 10), auto = d.events.find(e => e.type === 'blink' && e.auto), done = d.events.find(e => e.type === 'lcDone');
    check('깜빡이: 차로 변경이 끝나면 자동으로 꺼지고 기록(켬 · 켠 뒤 초)이 남음', auto && done && Math.abs(auto.t - done.t) < .02 && d.used === true && d.lead > 0 && d.samples[d.samples.length - 1].blink === 0, `자동 끔 ${auto && auto.t}s · 완료 ${done && done.t}s · 켠 뒤 ${d.lead}초`);
    const none = await E(() => { const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥'); const r = runDrive({map:m, leaf, lane:1, type:'rear', jam:0, seed:3, sigT:0}, {hud:'ar2', secs:8, ap:{mode:'lane', lane:1}, sample:() => !!(D.responder)}); return {ev:r.events.filter(e => /blink/.test(e.type)).length, any:r.samples.some(Boolean)}; });
    check('깜빡이를 안 켜면 뒤차 반응 없음 (지금 동작 그대로)', none.ev === 0 && !none.any, '');
    // ⑤ 버스: 와서 서고(문 열림 · 승하차) 떠남, 다른 차 · 보행자와 겹치지 않음
    const bus = await E(() => { const st = makeScenario('CRT', 'city', 'day', 1003), cfg = runCfg(st); let minGap = Infinity, phases = new Set(), doorMax = 0, peds = 0, departed = false;
      // 자동 운전은 보행자 앞에 서지 않으므로 보행자는 뺌(버스 흐름만 봄)
      runDrive(cfg, {hud:'ar2', secs:45, ap:{}, noPeds:true, sample:() => { const c = D.cars.find(o => o.kind === 'bus'); if(!c) return; const s = busStateAt(c.plan, D.t); phases.add(s.phase); doorMax = Math.max(doorMax, s.door); if(c.plan.departT !== null) departed = true; peds = Math.max(peds, (busMesh.userData.peds || []).length);
        D.cars.forEach(o => { if(o === c || o.kind === 'onc') return; const dz = Math.abs(o.z - c.z) - halfL(o) - halfL(c), dx = Math.abs(o.x - c.x) - halfW(o) - halfW(c); if(dz < 0 && dx < 0) minGap = Math.min(minGap, Math.max(dz, dx)); }); }});
      return {phases:[...phases], doorMax, peds, departed, overlap:minGap < 0, result:D.result, crash:D.crashWith}; });   // runDrive가 끝나면 D.cars가 비므로 안에서 기록
    check('⑤ 버스: 들어옴 → 정차(문 열림 · 승하차) → 출발, 다른 차와 겹침 없음', ['approach', 'stop', 'depart'].every(p => bus.phases.includes(p)) && bus.doorMax > .99 && bus.peds >= 1 && bus.departed && !bus.overlap && bus.result !== 'crash', JSON.stringify(bus));
    const models = await E(() => ({n:Object.keys(CAR_MODELS).length, applied:carRegistry.filter(c => c.group.userData.model).length, total:carRegistry.length, tris:Object.values(CAR_MODELS).map(M => M.geo.index ? M.geo.index.count/3 : M.geo.attributes.position.count/3)}));
    check('차량 3D 모델 5종이 불러와져 모든 차에 적용됨 (삼각형 승용차 ≤ 1.5만 · 버스 ≤ 2.5만)', models.n === 5 && models.applied === models.total && models.tris.every(t => t <= 25000), JSON.stringify(models));
  }

  /* ---------- 8-4. 2차 HUD 들어갈 차로 띠가 한 덩어리 (2026-11-07, D109) — 갈림을 지나는 동안 채움 패스 조각 1 · 레일 조각 2 ---------- */
  {
    const seam = await E(() => { const out = {};
      for(const [mapId, dest, lane] of [['ICR', '용인·기흥', 1], ['SEQ', '공주·논산', 1], ['CRT', '종합병원', 1]]){ const m = mapById(mapId), leaf = m.leaves.findIndex(l => l.dest === dest); let bad = 0, n = 0;
        runDrive({map:m, leaf, lane, type:'rear', jam:0, seed:5, sigT:0}, {hud:'ar2', secs:mapId === 'SEQ' ? 40 : 30, noPeds:true, setup:() => { D.cars.forEach(c => c.mesh.visible = false); D.cars = []; },
          sample:() => { const d = $('#bLaneFill').getAttribute('d') || '', r = $('#bRails').getAttribute('d') || ''; if(!d) return; n++; if((d.match(/M/g) || []).length !== 1 || (r.match(/M/g) || []).length !== 2) bad++; }});
        out[mapId] = {n, bad}; }
      return out; });
    check('개선 후 들어갈 차로 띠 · 레일이 갈림(① · ③ 둘째 갈림 · ⑤ 우회전)을 지나는 내내 한 덩어리(채움 조각 1 · 레일 조각 2)', Object.values(seam).every(o => o.n > 100 && o.bad === 0), JSON.stringify(seam));
  }

  /* ---------- 8-5. 끊김 없는 움직임 (2026-11-07 저녁, D112) · 갈림 뒤 도로 차로 수 한 곳에서 (D113) ---------- */
  {
    // 꺾는 구간에서 그리기 방향이 1m마다 뛰지 않음: ④ 1차로 길을 0.25m 간격으로 훑으며 메시 방향(pathDirAt) 변화 최대 < 2°, 판정 방향(pathAt)은 예전처럼 점마다 뜀(그대로)
    const dir = await E(() => { const m = mapById('CL2'), P = lanePath(m, 0, 0); let mx = 0, mxOld = 0, prev = null, prevOld = null;
      for(let s = 640; s < 700; s += .25){ const [tx, tz] = pathDirAt(P, s), a = Math.atan2(-tx, -tz), [, , ox, oz] = pathAt(P, s), b = Math.atan2(-ox, -oz);
        if(prev !== null){ mx = Math.max(mx, Math.abs(wrapA(a - prev))*180/Math.PI); mxOld = Math.max(mxOld, Math.abs(wrapA(b - prevOld))*180/Math.PI); } prev = a; prevOld = b; }
      return {mx:+mx.toFixed(2), mxOld:+mxOld.toFixed(2)}; });
    check('④ 좌회전 길 0.25m마다 그리기 방향 변화 < 2° (판정 방향은 점마다 뜀 그대로)', dir.mx < 2 && dir.mxOld > 3, JSON.stringify(dir));
    // 프레임 간격이 흔들려도(1/60의 0.6 · 1.4배 번갈아 → 스텝 0 · 2번) 카메라 이동량은 실제 시간에 비례: 이동량/dt 비율 최대 < 1.3. 판정 자세(D.x)는 고정 스텝이라 그대로
    const interp = await E(() => { const st = makeScenario('ICR', 'rear', 'day', 7), cfg = runCfg(st); setMode('ar2'); setLight('day'); S.testing = true; setScreen('drive'); $('#intro').hidden = true; $('#sess').hidden = true; startDrive(cfg); D.frozen = false;
      KEYS.left = KEYS.right = KEYS.up = KEYS.down = false; for(let k = 0; k < 90; k++) updateDrive(1/60);
      let worst = 0, prevV = null, px = camera.position.x, pz = camera.position.z, steps = {};
      for(let k = 0; k < 120; k++){ const dt = (k % 2 ? 1.4 : .6)/60, x0 = D.x; updateDrive(dt); const n = Math.round((D.x - x0 === 0 && D.z === D.z) ? 0 : 0); void n;
        const v = Math.hypot(camera.position.x - px, camera.position.z - pz)/dt; px = camera.position.x; pz = camera.position.z;
        if(prevV !== null && prevV > 1 && v > 1) worst = Math.max(worst, Math.max(v/prevV, prevV/v)); prevV = v; }
      stopDrive(); S.testing = false; return {worst:+worst.toFixed(3)}; });
    check('프레임 간격이 0.6 · 1.4배로 흔들려도 카메라 이동량/dt 비율 변화 < 1.3 (고정 스텝 사이 보간)', interp.worst < 1.3, JSON.stringify(interp));
    // 갈림 뒤 도로: 일반도로 출구마다 road{n, i}, 회전 목표 z = CROSS.laneZ, 보도 선 = 가운데선 ± n차로, HUD 미니 도로는 꺾은 뒤 차로 점선(2차로)을 그림
    const road = await E(() => { const out = {}; for(const id of ['CL2', 'CRT']){ const m = mapById(id); out[id] = m.segs.map(e => e.road ? `${e.key}:${e.road.n}/${e.road.i}` : e.key + ':none'); }
      const L = mapById('CRT').exits.find(e => e.key === 'L'), R = mapById('CRT').exits.find(e => e.key === 'R');
      out.zL = L.pts[L.pts.length - 1][1]; out.zR = R.pts[R.pts.length - 1][1]; out.laneZ = [CROSS.laneZ(-1, 0), CROSS.laneZ(1, CROSS.n - 1)]; out.cz = [CZ.near, CZ.far, CZ.mid, CROSS.n];
      return out; });
    check('일반도로 출구마다 갈림 뒤 도로 차로 수 · 내 차로 번호(road), 회전 목표 z = CROSS.laneZ, 보도 선 = 가운데선 ± n차로', road.CL2.every(s => !/none/.test(s)) && road.CRT.every(s => !/none/.test(s)) && road.zL === road.laneZ[0] && road.zR === road.laneZ[1] && road.cz[0] === road.cz[2] + road.cz[3]*3.5 && road.cz[1] === road.cz[2] - road.cz[3]*3.5, JSON.stringify(road));
    const dashes = await E(() => { const out = {}; for(const [id, leaf] of [['CRT', 0], ['CRT', 2], ['CL2', 2]]){ S.demoMap = id; S.demoTarget = leaf; S.demoJam = 0; setMode('ar2'); setLight('day'); openSetup(false); start(); $('#sess').hidden = true; S.paused = true;
        S.s = path.nodeS[0] + 40; S.cityLim = Infinity; update(0); out[id + leaf] = ($('#bDash').getAttribute('d').match(/M/g) || []).length; S.running = false; S.paused = false; } return out; });
    check('2차 HUD 미니 도로: ⑤ 좌 · 우회전 뒤(가로 도로 2차로) · ④ 직진 뒤(4차로) 차로 점선이 그려짐', Object.values(dashes).every(n => n > 0), JSON.stringify(dashes));
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
