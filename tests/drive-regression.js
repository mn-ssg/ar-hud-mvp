/* 주행 회귀 테스트 — 실제 시뮬레이터 코드(update · driveStep · drawNav · drawAr2 · guideStep · mirrors · session)를 브라우저에서 자동 운전으로 돌려 확인
   실행:  cd tests && npm i && node drive-regression.js [--shots <폴더>]
   (Chrome 필요: CHROME 환경변수 또는 macOS 기본 경로. 정적 서버는 이 스크립트가 직접 띄움) */
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
const TYPES = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.jpg':'image/jpeg', '.png':'image/png', '.json':'application/json', '.webp':'image/webp', '.mp4':'video/mp4', '.glb':'model/gltf-binary'};

function serve(){
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0]));
      if(!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()){ r.writeHead(404); r.end(); return; }
      r.writeHead(200, {'Content-Type':TYPES[path.extname(p)] || 'application/octet-stream'}); fs.createReadStream(p).pipe(r);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

/* 페이지 안에서 쓰는 자동 운전 도구. 조향만 대신하고 속도는 시뮬레이터의 SCC(손 뗀 상태) 그대로, 필요하면 브레이크
   자동 급제동(D134, 환경 3.3) 뒤에는 SCC가 꺼져 ↑를 누르기 전까지 서 있다 → 사람처럼: 급제동이 풀리고 앞에 건너는 사람이 없으면 ↑를 한 번 톡 눌러 다시 출발(noResume면 안 누름).
   up · down: 검사가 ↑ · ↓를 계속 누르게 할 때. brakeNeed: 앞쪽 위험의 필요 감속도가 이 값을 넘으면 ↓(보통으로 미리 서는 운전자) */
const AUTOPILOT = () => {
  const _sp = stepPlayer; window.__sp0 = _sp;   // 자동 운전을 거치지 않는 원래 조작 함수(10절 조작감 검사가 씀)
  window.AP = {mode:'route', lane:null, exit:null, brakeUntilS:null, brakeHold:0, held:0, up:false, down:false, noResume:false, brakeNeed:null};
  stepPlayer = function(dt){
    const A = window.AP, ld = Math.max(8, D.v*.6);
    let tx, tz;
    if(A.exit && (D.cands || D.seg || D.z < FORK_Z)){ const P = segPts(A.exit), r = project(P, D.x, D.z, -1); [tx, tz] = pathAt(P, r.s + ld); }
    else if(A.mode === 'lane' && D.z > FORK_Z + 5){ tx = S.map.laneX(A.lane) + (A.offset || 0); tz = D.z - ld; }
    else { const r = project(path.P, D.x, D.z, -1); [tx, tz] = pathAt(path.P, r.s + ld); }
    const fx = Math.sin(D.psi), fz = -Math.cos(D.psi), dx = tx - D.x, dz = tz - D.z, l = Math.hypot(dx, dz) || 1;
    const sinA = (fx*dz - fz*dx)/l, u = swForCurv(2*sinA/l, D.v);   // 겨눈 점으로 가는 곡률 → 핸들 각도(°)
    KEYS.left = KEYS.right = false;
    KEYS.down = A.brakeUntilS !== null && S.s > A.brakeUntilS - 18 && (A.held < A.brakeHold);
    // 급한 굽은 길(일반도로 회전 · 골목) 앞에서는 사람처럼 줄임: 앞 15m 경로 방향 변화가 크면 시속 25km 아래로
    { const r = project(path.P, D.x, D.z, -1), a = pathAt(path.P, r.s + 2), b = pathAt(path.P, r.s + 17), turnA = Math.acos(clamp(a[2]*b[2] + a[3]*b[3], -1, 1));
      if(turnA > .35 && D.v > 7) KEYS.down = true; }
    if(A.down || (A.brakeNeed !== null && D.haz && D.haz.need >= A.brakeNeed) || (A.brakeNeed !== null && KEYS.__bn && D.v > .05)) KEYS.down = true;
    KEYS.__bn = A.brakeNeed !== null && KEYS.down && (D.v > .05 || !!(D.haz && D.haz.kind === 'ped'));   // 보통 운전자: 한 번 밟기 시작하면 설 때까지, 횡단보도 앞이면 사람이 다 건널 때까지
    if(KEYS.down && D.v < .2) A.held += dt;
    KEYS.up = !!A.up || (!A.noResume && D.sccOff && !(D.aeb && D.aeb.on) && !KEYS.down && !(D.haz && D.haz.kind === 'ped'));   // 급제동 뒤 다시 출발: ↑ 한 번(다음 걸음엔 SCC가 켜져 있어 안 누름)
    _sp(dt); D.autoSw = u;   // 다음 스텝의 핸들 각도 (2026-11-17: 예전엔 0 ~ 1 조향 입력과 앞바퀴 각을 직접 넣음)
  };
  // 한 판을 dt 간격으로 끝까지(또는 secs초) 돌리며 매 프레임 sample()을 모음
  window.runDrive = (cfg, opts = {}) => {
    Object.assign(window.AP, {mode:'route', lane:null, exit:null, brakeUntilS:null, brakeHold:0, held:0, offset:0, up:false, down:false, noResume:false, brakeNeed:null}, opts.ap || {}); KEYS.__bn = false;
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
    (window.__runLog = window.__runLog || []).push({map:cfg.map.id, hud:opts.hud || 'ar', seed:cfg.seed, result:D.result, crash:D.crashWith || '', ped:D.ped, aeb:D.aebN, t:+D.t.toFixed(2), x:+D.x.toFixed(1), z:+D.z.toFixed(1)});   // 판마다 결과 — NO_AEB=1로 돌린 것과 비교(D134)
    if(opts.keep) return res;
    stopDrive(); return res;
  };
  const vis = id => { const e = document.getElementById(id); return e && e.style.display !== 'none'; };
  window.navSample = () => { const C = navCtx(S.s);
    return {t:+D.t.toFixed(2), d:+C.d.toFixed(1), phase:C.phase, chosen:D.chosen.length, turn:vis('nvTurn'), straight:vis('nvStraight'), dist:document.getElementById('nvDistN').textContent + document.getElementById('nvUnit').textContent, name:document.getElementById('nvName').textContent, v:+D.v.toFixed(2)}; };
};

const results = [];
let SES_ROWS = [];   // 7절 세션의 판들 — 12절(자동 급제동 기록)이 다시 씀
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
  if(process.env.NO_AEB) await E(() => { AEB.on = Infinity; });   // 비교용: 자동 급제동만 끔(빨강 단계는 그대로) — 판마다 결과(__runLog)를 켠 것과 견줌

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
    // 경로 이탈: 우회전해야 하는데 직진 출구로 (2026-11-17 밤: 직진 차로는 공사로 막혀 있으므로 이 검사 동안만 공사 판정을 꺼 둔다 — 좌회전은 늘 빨간불이라 신호 위반으로 끝남)
    const r = await E(() => { const m = mapById('CRT'), leaf = m.leaves.findIndex(l => l.dest === '종합병원'), w0 = m.work; m.work = null;
      try { return runDrive({map:m, leaf, lane:1, type:'city', jam:0, seed:777, sigT:0}, {hud:'nav', noPeds:true, sample:navSample, secs:40, keep:true,
        ap:{exit:m.exits.find(e => e.key === 'S'), mode:'lane', lane:1}, setup:() => { D.cars.filter(c => c.kind !== 'onc').forEach(c => c.mesh.visible = false); D.cars = D.cars.filter(c => c.kind === 'onc'); }}); } finally { m.work = w0; } });
    const last = r.samples[r.samples.length - 1];
    check('경로 이탈(다른 출구): 결과가 성공이 아니라 다른 출구', r.result === 'wrong', `결과 ${r.result} · ${r.exit}`);
    check('경로 이탈: 현대 HUD가 정상 직진처럼 보이지 않음(재탐색)', last && !last.straight && !last.turn && last.name === '경로 재탐색', JSON.stringify(last));
    await E(() => stopDrive());
    // ⑤ 공사 구간(2026-11-17 밤): 가운데 차로에 그대로 있으면 공사 구간 충돌로 끝남 · 마감선은 공사가 좁아지기 시작하는 곳(-136) · 리뉴얼 HUD는 막힌 차로를 주황으로 그리고 가까워지면 06 앞쪽 위험
    const w = await E(() => { const m = mapById('CRT'), leaf = m.leaves.findIndex(l => l.dest === '종합병원'); let hud = null, st = [];
      const r = runDrive({map:m, leaf, lane:1, type:'city', jam:0, seed:777, sigT:0}, {hud:'ar3', noPeds:true, secs:40, keep:true, ap:{mode:'lane', lane:1},
        setup:() => { D.cars.filter(c => c.kind !== 'onc').forEach(c => c.mesh.visible = false); D.cars = D.cars.filter(c => c.kind === 'onc'); },
        sample:() => { if(S.H3 && !st.includes(S.H3.state)) st.push(S.H3.state); if(hud === null && D.z < -95 && D.z > -110) hud = {work:($('#cWork').getAttribute('d') || '').length > 20, bars:($('#cWorkBars').getAttribute('d') || '').length > 20, fill:getComputedStyle($('#cWork')).fill, warn:getComputedStyle(document.documentElement).getPropertyValue('--h2-warn').trim(), gate:S.H3.gateZ}; }});
      const o = {result:r.result, crash:D.crashWith, z:+D.z.toFixed(0), hud, states:st, ce:changeEndOf(m), work:m.work, in1:inWork(m, 0, -160), in2:inWork(m, 3.5, -160), tip:inWork(m, 0, -137), tipSide:inWork(m, 1.4, -138), after:inWork(m, 0, -210), aeb:D.aebN, red:D.events.some(e => e.type === 'h3red')}; stopDrive(); return o; });
    check('⑤ 공사 구간: 가운데 차로에 그대로 있으면 공사 구간 충돌(좁아지는 곳 안에서)로 끝나고, 마감선은 좁아지기 시작하는 -136, 막힌 곳 판정은 가운데 차로 z -204 ~ -148(+ 삼각형)뿐', w.result === 'crash' && w.crash === '공사 구간' && w.z <= -136 && w.z >= -150 && w.ce === -136 && w.in1 && !w.in2 && w.tip && !w.tipSide && !w.after, JSON.stringify({r:w.result, c:w.crash, z:w.z, ce:w.ce}));
    check('⑤ 공사 구간: 리뉴얼 HUD가 막힌 차로를 주황(조심 색) 바탕 + 줄로 그리고 마감선이 -136, 그 차로로 다가가면 06 앞쪽 위험', w.hud && w.hud.work && w.hud.bars && w.hud.gate === -136 && w.states.includes(6), JSON.stringify({hud:w.hud, states:w.states}));
    check('⑤ 공사 구간은 이번 범위 밖(D134): 06은 주황 그대로 — 빨강 · 자동 급제동 없이 공사 구간 충돌', w.aeb === 0 && !w.red && w.result === 'crash', JSON.stringify({aeb:w.aeb, red:w.red}));
  }

  // 2026-10-29: 리뉴얼 HUD를 중간고사 V1(470a8f7)로 되돌려 v2 그래픽 전용 검사(벽 · 꺾쇠 · 정체 띠 등)는 뺌 — 판단 로직은 guide.test.js
  const seeds = await E(() => { const out = []; const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥');
    for(let s = 1; s < 400 && out.length < 1; s++){ setMode('ar'); startDrive({map:m, leaf, lane:1, type:'rear', jam:0, seed:s, sigT:0}); if(D.cfg.rearN >= 3) out.push(s); stopDrive(); } return out; });
  {
    // 리뉴얼 HUD(V1): 뒤차 판에서 대기(빨간 멈춤 막대)가 실제로 그려지는지 — V1 표시가 살아 있는지만
    const r = await E(seed => { const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥');
      return runDrive({map:m, leaf, lane:1, type:'rear', jam:0, seed, sigT:0}, {hud:'ar', secs:6, ap:{mode:'lane', lane:1},
        setup:() => { const l = D.cars.find(c => c.kind === 'lead'); if(l) l.brakeAt = null; },
        sample:() => ({block:S.rearBlock, stop:(document.getElementById('moveStop').getAttribute('d') || '').length > 0, arrow:(document.getElementById('moveArrow').getAttribute('d') || '').length > 0})}); }, seeds[0]);
    const b = r.samples.filter(s => s.block);
    check('리뉴얼 HUD(V1): 뒤차 위험이면 V1의 빨간 멈춤 막대가 그려짐', b.length > 0 && b.every(s => s.stop && s.arrow), `${b.length}프레임`);
  }

  /* ---------- 3-2. 리뉴얼 HUD 개선 후(hud2.js): 상태 6개가 설계대로 — 뒤차 한 대를 정해진 자리 · 속도로 놓고(실제 시뮬레이터 차) 단계를 본다 ---------- */
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

  /* ---------- 3-3. 리뉴얼 HUD 3차(hud3.js · guide.js h3Step): 상태 6가지 · 색 하나에 뜻 하나 · 미니 도로 투영 (2026-11-17) ---------- */
  {
    // 3-2와 같은 장면: ① 오른쪽 출구, 1차로 → 2차로. 2차로(목표) 뒤차 한 대만(+ 06은 내 차로 앞차 한 대). 자동 운전은 1차로 유지
    const stage3 = async (gapM, closing, secs, extra = {}) => E(([gapM, closing, secs, extra]) => {
      const m = mapById(extra.map || 'ICR'), leaf = m.leaves.findIndex(l => l.dest === (extra.dest || '용인·기흥')), myLane = extra.lane ?? 1, rearLane = extra.rear ?? 2;   // 기본: ① 오른쪽 출구, 1차로 → 2차로
      const RED = getComputedStyle($('#cab')).getPropertyValue('--h2-danger').trim().toLowerCase(), GRN = getComputedStyle($('#cab')).getPropertyValue('--h2-go').trim().toLowerCase();
      const rgb = h => 'rgb(' + [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ') + ')';
      // 지금 보이는 요소 중 그 색을 쓰는 것(id) — 색 하나에 뜻 하나 점검
      const using = hex => { const c = rgb(hex), out = []; $$('#arHud3 path, #arHud3 rect, #arHud3 circle, #cWarn path').forEach(el => { const cs = getComputedStyle(el), d = el.tagName === 'path' ? el.getAttribute('d') : 'x';
        if(!d || +el.getAttribute('opacity') === 0 || el.closest('[opacity="0"]') || (el.tagName === 'rect' && +el.getAttribute('width') === 0)) return;
        if(cs.fill === c || cs.stroke === c) out.push(el.id || el.parentNode.id); }); $$('.eg3').forEach(st => { if(st.getAttribute('stop-color').toLowerCase() === hex && [...'LR'].some(k => +$('#cEdge' + k).getAttribute('opacity') > .01)) out.push('cEdge'); });
        return [...new Set(out)]; };
      // 03 대기의 금지 표지(#cHold): 밝기 · 가운데 x(화살표 그림 단위, 화살표 가운데 기준) · 원 바깥 지름 · 꺾쇠 방향(1 = '>>', -1 = '<<') · 빗금 · 꺾쇠 색 · 꺾쇠마다 빗금에 안 가린 비율
      const holdOf = () => { const h = $('#cHold'), on = h.style.display !== 'none', ring = h.querySelector('.c-hold-ring'), bar = h.querySelector('.c-hold-bar'), flip = (($('#cHoldChev').getAttribute('transform') || '').includes('-1')) ? -1 : 1, svg = $('#hudSvg');
        const vis = !on ? [] : [...h.querySelectorAll('#cHoldChev path')].map(p => { const b = p.getBBox(); let n = 0, v = 0; for(let i = 0; i <= 24; i++) for(let j = 0; j <= 24; j++){ const pt = svg.createSVGPoint(); pt.x = b.x + b.width*i/24; pt.y = b.y + b.height*j/24; if(!p.isPointInFill(pt)) continue; n++; const q = svg.createSVGPoint(); q.x = flip*pt.x; q.y = pt.y; if(!bar.isPointInStroke(q)) v++; } return +(v/n).toFixed(2); });
        // 정렬(화면 px, getBoundingClientRect = SVG 그린 모양 상자 — 선 굵기 뺌): 화살표 선 바깥 끝은 선 굵기의 반을, 표지 바깥 끝은 흰 테 바깥까지 더한다
        let al = null;
        if(on){ const H3h = HUD3.hold, rc = ring.getBoundingClientRect(), u = rc.width/(2*+ring.getAttribute('r')), cx = rc.left + rc.width/2, cy = rc.top + rc.height/2, Rx = (H3h.r + H3h.rim)*u, cv = $('#cHoldChev').getBoundingClientRect(), bg = $('#cCdBg').getBoundingClientRect();
          const ia = $('#' + (C3.icon || C3.lastIco || 'cIcoUp') + ' path'), shown = !!C3.icon, ar = ia.getBoundingClientRect(), sw = parseFloat(getComputedStyle($('#cIcon')).strokeWidth)*u, side = cx > ar.left + ar.width/2 ? 1 : -1;
          const L = shown ? Math.min(ar.left - sw/2, cx - Rx) : cx - Rx, Rr = shown ? Math.max(ar.right + sw/2, cx + Rx) : cx + Rx;
          al = {u:+u.toFixed(4), dy:shown ? +(cy - (ar.top + ar.height/2)).toFixed(3) : null, dGroup:+((L + Rr)/2 - (bg.left + bg.width/2)).toFixed(3), dChev:[+(cv.left + cv.width/2 - cx).toFixed(3), +(cv.top + cv.height/2 - cy).toFixed(3)],
            gapU:shown ? +((side > 0 ? (cx - Rx) - (ar.right + sw/2) : (ar.left - sw/2) - (cx + Rx))/u).toFixed(3) : null, chevW:+(cv.width/rc.width*(+ring.getAttribute('r'))/H3h.r).toFixed(3), chevH:+(cv.height/rc.width*(+ring.getAttribute('r'))/H3h.r).toFixed(3), left:+(cx - Rx).toFixed(2)}; }
        return {hold:on ? +h.getAttribute('opacity') : 0, al, actX:+((($('#cAct').getAttribute('transform') || '').match(/^translate\(([-\d.]+) /) || [0, 0])[1]), holdX:+((h.getAttribute('transform') || '').match(/translate\(([-\d.]+) [-\d.]+\)$/) || [0, 0])[1], holdD:2*(+ring.getAttribute('r') + +ring.getAttribute('stroke-width')/2), holdRing:+ring.getAttribute('stroke-width'), holdBarW:+bar.getAttribute('stroke-width'), holdFlip:flip, holdBar:bar.getAttribute('d'), holdChevCol:getComputedStyle($('#cHoldChev path')).fill, holdVis:vis}; };
      const sm = () => { const H = S.H3, n = id => ($('#' + id).getAttribute('d') || '').length;
        return {t:+D.t.toFixed(2), st:H.state, base:H.base, gate:S.G ? S.G.gate : '-', chev:[...document.querySelectorAll('#cChev path')].filter(q => q.getAttribute('d')).length, ...holdOf(), iconOp:+C3.iconOp.toFixed(3), ico:C3.icon, holdFollow:($('#cHold').getAttribute('transform') || '').startsWith($('#cAct').getAttribute('transform')), gap:n('cGapLine') > 0 && +$('#cGapLine').getAttribute('opacity') > .5, gapFill:n('cGap') > 0 ? 'fill' : 'none', gapDash:$('#cGapLine').dataset.line === 'dash' ? 'dash' : 'none', cars:CAR3.ready ? CAR3.models.car.pool.filter(g => g.visible).length : -1,
          rear:n('cRear') > 0 ? +$('#cRear').getAttribute('opacity') : 0, rearCol:$('#cRear').getAttribute('fill'), ring:n('cRing1') > 0, appr:[...document.querySelectorAll('#cAppr path')].filter(q => q.getAttribute('d')).length, edgeR:+$('#cEdgeR').getAttribute('opacity'), edgeW:+$('#cEdgeR').getAttribute('width'), edgeL:+$('#cEdgeL').getAttribute('opacity'),
          warn:+$('#cWarn').getAttribute('opacity'), warnR:+$('#cWarn path').getBoundingClientRect().right.toFixed(2), lead:n('cLead') > 0, fband:n('cFrontBand') > 0, lane:+$('#cLaneFill').getAttribute('opacity'), laneCol:getComputedStyle($('#lg3A')).stopColor, icon:+$('#cAct').getAttribute('opacity'), barRing:+$('#cCdRing').getAttribute('opacity'), barW:+$('#cCdBar').getAttribute('width'), barX:+$('#cCdBar').getAttribute('x'),
          red:using(RED), green:using(GRN), cue:$('#mirCue').hidden ? 'hidden' : ($('#mirCue').dataset.cue || '') + '/' + ($('#mirCue').dataset.lamp || ''), text:$$('#arHud3 text').length}; };
      window.__jumped = false;
      return runDrive({map:m, leaf, lane:myLane, type:'rear', jam:0, seed:5, sigT:0}, {hud:extra.hud || 'ar3', secs, ap:{mode:'lane', lane:myLane}, sample:sm,
        setup:() => { D.cars.forEach(c => c.mesh.visible = false); const lead = D.cars.find(c => c.kind === 'lead'), car = D.cars.find(c => c.kind === 'rear') || D.cars[1];
          D.cars = [car]; car.mesh.visible = true; car.lane = rearLane; car.P = lanePath(S.map, rearLane, 0); car.kind = 'rear'; car.brakeAt = null;
          car.s = LANE_START - (D.z + gapM + car.len/2 + DRV.carL/2); car.v = car.v0 = car.base = D.v + closing; car.T = 5; car.s0 = 1;
          if(extra.lead){ D.cars.push(lead); lead.mesh.visible = true; lead.lane = myLane; lead.P = lanePath(S.map, myLane, 0); lead.kind = 'lead'; lead.brakeAt = null; lead.phase = 3; lead.s = LANE_START - (D.z - extra.lead[0] - lead.len/2 - DRV.carL/2); lead.v = lead.v0 = lead.base = D.v + extra.lead[1]; }
          placeCars(); window.__car = car; resetGuide(); resetHud3(); update(0); },
        beforeFrame:extra.jumpAt ? (tt => { if(tt >= extra.jumpAt && !window.__jumped){ window.__jumped = true; window.__car.s = LANE_START - (D.z - 26); window.__car.v = window.__car.v0 = D.v + 2; } }) : null}); }, [gapM, closing, secs, extra]);
    const last = r => r.samples[r.samples.length - 1];
    const a = await stage3(80, 2, 2), al = last(a);
    check('3차 01 안전: 뒤차가 주의 거리 밖 → 상태 1 · 초록 꺾쇠 2개 · 금지 표지 없음 · 뒤차 표시 없음 · 가장자리 빛 없음 · 빨강 없음', a.samples.every(s => s.st === 1 && s.chev === 2 && s.hold === 0 && s.rear < .01 && s.edgeR < .01 && s.red.length === 0) && al.green.join() === 'cChev', JSON.stringify(al));
    const a2 = await stage3(45, 1, 2), a2l = last(a2);
    check('3차 01 안전: 멀리 있는 뒤차(45m)는 작고 옅게(무채색) · 상태는 그대로 1', a2l.st === 1 && a2l.rear > .2 && a2l.rear < .6 && a2l.appr === 0 && a2l.edgeR < .01 && a2l.red.length === 0, JSON.stringify(a2l));
    const b = await stage3(20, 2.5, 2), bl = last(b);
    check('3차 02 주의: 상태 2 · 주황 뒤차 + 뒤 노면의 접근 꺾쇠 · 오른쪽 가장자리 주황 빛 · 꺾쇠는 계속 흐름(아직 옮길 수 있음) · 빨강 없음', bl.st === 2 && bl.rearCol.toLowerCase() === '#ffb020' && bl.appr >= 1 && bl.edgeR > .3 && bl.edgeL < .01 && bl.chev === 2 && bl.hold === 0 && bl.red.length === 0, JSON.stringify(bl));
    const c = await stage3(7, 4, 2), cs = c.samples.filter(s => s.st === 3), cl = cs[cs.length - 1];
    const HD = await E(() => ({...HUD3.hold, fade:HUD3.fade, icoW:parseFloat(getComputedStyle($('#cIcon')).strokeWidth)})), csIn = cs.filter(s => s.t > cs[0].t + HD.inT + .05);
    check(`3차 03 대기: 상태 3 · 꺾쇠가 사라지고 갈 방향 화살표 옆(옮길 쪽 = 오른쪽)에 옆으로 옮기기 금지 표지 · 화살표는 청록 그대로 조금 흐리게(${HD.arrowOp}) · 빨간 뒤차 · 가장자리 빛 넓게 · 남은 거리 막대에 테두리(밝아짐) · 들어갈 차로는 그대로 · 초록 없음`, cs.length > 30 && cs.every(s => s.hold > 0 && s.holdX > 0 && s.holdFollow && s.chev === 0 && s.rearCol.toLowerCase() === '#ff4d4d' && s.green.length === 0) && cl.lane > .84 && cl.barRing > .9 && cl.edgeW > 80 && Math.abs(cl.iconOp - HD.arrowOp) < .01 && HD.arrowOp >= .6 && HD.arrowOp <= .7 && cl.ico === 'cIcoRight', JSON.stringify(cl));
    const arrowH = 26 + HD.icoW, tl = d => { const m = (d || '').match(/^M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)$/); return !!m && +m[1] < 0 && +m[2] < 0 && +m[3] > 0 && +m[4] > 0; };   // 화살표 높이(선 포함) · 빗금이 왼쪽 위 → 오른쪽 아래인지
    const okAl = a => !!a && Math.abs(a.dy) <= .5 && Math.abs(a.dGroup) <= .5 && Math.abs(a.dChev[0]) <= .5 && Math.abs(a.dChev[1]) <= .5 && Math.abs(a.gapU - HD.gap) < .02;   // 정렬 기준: 0.5px 안
    check(`3차 03 대기의 금지 표지: ${HD.inT}초에 옆에서 닫히듯 나타난 뒤 깜빡이지 않고 그대로 · 원 지름 ${2*HD.r}은 화살표 높이 ${arrowH}와 같거나 조금 큼 · 빨간 테 ${HD.ring} + 빗금 ${HD.bar}(원 가운데를 지나는 왼쪽 위 → 오른쪽 아래) · 흰 꺾쇠 '>>' 둘 다 빗금에 덮이지 않음(초록 아님) · 꺾쇠 묶음은 지름의 ${Math.round(HD.chev.max*100)}% 안`, cs[0].hold < 1 && cs[0].holdX > cl.holdX && csIn.length > 20 && csIn.every(s => s.hold > .99 && Math.abs(s.holdX - cl.holdX) < .001) && cl.holdD >= arrowH && cl.holdD <= 1.2*arrowH && cl.holdRing > 0 && cl.holdBarW > 0 && tl(cl.holdBar) && cl.holdFlip === 1 && cl.holdChevCol === 'rgb(255, 255, 255)' && cl.holdVis.length === 2 && cl.holdVis.every(v => v >= .7) && cl.al.chevW <= HD.chev.max && cl.al.chevH <= HD.chev.max, JSON.stringify({first:cs[0].hold, x0:cs[0].holdX, x:cl.holdX, d:cl.holdD, ring:cl.holdRing, bar:cl.holdBarW, vis:cl.holdVis, chevW:cl.al.chevW, chevH:cl.al.chevH}));
    check(`3차 03 대기의 정렬(0.5px 안): 표지 가운데 높이 = 화살표 그린 모양 가운데 높이 · '화살표 + 간격 ${HD.gap} + 표지' 묶음 가운데 = 남은 거리 막대 가운데 · 꺾쇠 묶음 가운데 = 원 가운데`, csIn.every(s => okAl(s.al)) && cl.actX < 260, JSON.stringify({...cl.al, actX:cl.actX}));
    check('3차 03 대기: 빨강을 쓰는 것은 금지 표지 · 뒤차(접근 꺾쇠 · 깜빡임 테두리 포함) · 가장자리 빛뿐', cs.every(s => s.red.every(id => ['cHold', 'cRear', 'cAppr', 'cRing1', 'cRing2', 'cEdge'].includes(id))) && cs.some(s => s.ring) && cs.some(s => !s.ring), JSON.stringify([...new Set(cs.flatMap(s => s.red))]));
    const d = await stage3(7, 4, 4, {jumpAt:1}), conf = d.samples.filter(s => s.st === 4), mv = d.samples.filter(s => s.st === 5), order = d.samples.map(s => s.st).filter((v, i, arr) => i === 0 || v !== arr[i-1]).join('');
    const confT = conf.length ? conf[conf.length - 1].t - conf[0].t : 0, cfT = await E(() => HUD3.confirmT);
    const confIn = conf.filter(s => s.t > conf[0].t + HD.fade + .05);   // 금지 표지는 풀리는 순간부터 HUD3.fade초에 걸쳐 사라진다 — 그 뒤로는 빨강이 하나도 없어야 한다
    check(`3차 04 확인: 대기가 풀려도 바로 이동하지 않고 확인을 한 번(${confT.toFixed(2)}초 ≈ 설정 ${cfT}초) — 금지 표지는 ${HD.fade}초에 화살표 옆에 붙은 채 사라지고 화살표는 원래 자리(원점 = 260)로 돌아옴 · 꺾쇠 없음 · 틈 흰 점선 상자 · 거울 표시 흰 테두리 · 빨강 · 초록 없음`, /34+5/.test(order) && Math.abs(confT - cfT) < .12 && conf.every((s, i) => s.chev === 0 && s.green.length === 0 && s.red.every(id => id === 'cHold') && (i === 0 || s.hold <= conf[i-1].hold) && (i === 0 || s.actX >= conf[i-1].actX) && (s.hold === 0 || okAl({...s.al, dGroup:0}))) && confIn.length > 10 && confIn.every(s => s.hold === 0 && s.red.length === 0 && s.actX === 260) && mv.every(s => s.hold === 0) && conf.slice(6).every(s => s.gap && s.gapFill === 'none' && s.gapDash !== 'none' && s.cue.startsWith('check')), order + ' ' + JSON.stringify(conf[conf.length - 1]));
    check('3차 05 이동: 확인 뒤 틈이 그대로면 상태 5 · 틈이 초록으로 채워지고 꺾쇠 3개 · 빨강 없음 · 초록은 꺾쇠와 틈뿐', mv.length > 20 && mv.slice(8).every(s => s.gap && s.gapFill === 'fill' && s.gapDash === 'none' && s.chev === 3 && s.red.length === 0 && s.green.every(id => ['cChev', 'cGap', 'cGapLine'].includes(id))), JSON.stringify(mv[mv.length - 1]));
    check('3차: 들어갈 차로는 어느 상태에서든 청록(길 안내 색은 안 바뀜)', [a, b, c, d].every(r => r.samples.every(s => s.laneCol === 'rgb(0, 229, 255)')), al.laneCol);
    check('3차: 남은 거리 막대는 왼쪽 고정(x = 200) · 색 없음', [a, c, d].every(r => r.samples.every(s => s.barX === 200)) && c.samples.every(s => !s.red.includes('cCdBar')), `${al.barX} · ${al.barW}`);
    const f = await stage3(80, 2, 1.2, {lead:[13, -6]}), fs = f.samples.filter(s => s.st === 6), fl = fs[fs.length - 1];
    check('3차 06 앞쪽 위험: 앞차와 닿기까지 시간이 짧으면 상태 6 · 주황 삼각형 + 앞차 + 앞쪽 간격 · 들어갈 차로 · 갈 방향은 옅게(모양 그대로) · 빨강 없음', fs.length > 10 && fl.warn > .9 && fl.lead && fl.lane < .5 && fl.lane > .2 && fl.icon < .4 && fl.red.length === 0, JSON.stringify(fl));
    const g = await stage3(7, 4, 1.6, {lead:[13, -6]}), gs = g.samples.filter(s => s.st === 6 && s.base === 3), gl = gs[gs.length - 1];
    check('3차 06: 대기 중에도 앞쪽 위험이 먼저 — 삼각형이 뜨고 뒤차 · 금지 표지는 남되(화살표와 함께 오른쪽으로 비켜나 같은 비율로 작고 옅게, 같은 간격 · 같은 높이로 붙어서 · 화살표 자리는 예전과 같음) 깜빡임 · 가장자리 빛은 꺼짐', gs.length > 10 && gl.warn > .9 && gl.hold > .15 && gl.hold < .3 && gl.holdFollow && okAl({...gl.al, dGroup:0}) && gl.actX === 312 && gl.al.left > gl.warnR && gl.icon < gl.hold && !gl.ring && gl.edgeR < .05 && gl.rear > .2 && gl.rear < .7, JSON.stringify({...gl, red:undefined, green:undefined}));
    // 금지 표지는 늘 화살표 옆, 옮길 쪽에: 왼쪽 화살표 + 왼쪽으로(② JC) · 직진 화살표 + 왼쪽으로(① 본선으로 가는 길) — 직진이어도 위가 아니라 옆. 왼쪽이면 꺾쇠만 '<<'로 뒤집히고 빗금은 그대로
    const wl = (await stage3(7, 4, 2, {map:'JC4', dest:'인천·부천', lane:2, rear:1})).samples.filter(s => s.st === 3), ws = (await stage3(7, 4, 2, {map:'ICR', dest:'대전·천안', lane:2, rear:1})).samples.filter(s => s.st === 3);
    const sideOk = (list, ico) => list.length > 30 && list.every(s => s.ico === ico && s.hold > 0 && s.holdX < 0 && s.holdFlip === -1 && s.holdBar === cl.holdBar && s.holdVis.every(v => v >= .7) && s.edgeL > 0 && s.edgeR === 0) && list.filter(s => s.t > list[0].t + HD.inT + .05).every(s => okAl(s.al) && s.actX > 260);
    check("3차 03 대기의 금지 표지: 왼쪽으로 옮길 때는 화살표 왼쪽에 놓이고 꺾쇠만 '<<'로 뒤집힘(빗금 방향은 그대로 · 꺾쇠 둘 다 읽힘) · 직진 화살표여도 위가 아니라 옮길 쪽 옆에 · 둘 다 정렬 0.5px 안(화살표는 오른쪽으로 비켜남)", sideOk(wl, 'cIcoLeft') && sideOk(ws, 'cIcoUp'), JSON.stringify({left:wl.length, x:wl.length && wl[wl.length - 1].holdX, vis:wl.length && wl[wl.length - 1].holdVis, alL:wl.length && wl[wl.length - 1].al, up:ws.length, alUp:ws.length && ws[ws.length - 1].al}));
    // 06 + 대기 · 왼쪽으로 옮길 때: 묶음이 통째로 삼각형 오른쪽으로(표지가 삼각형 밑에 깔리지 않음) — 같은 간격 · 같은 높이로 붙어서
    const wf = (await stage3(7, 4, 1.6, {map:'JC4', dest:'인천·부천', lane:2, rear:1, lead:[13, -6]})).samples.filter(s => s.st === 6 && s.base === 3), wfl = wf[wf.length - 1];
    check('3차 06 + 대기 · 왼쪽으로: 금지 표지가 화살표 왼쪽에 붙은 채 묶음이 삼각형 오른쪽으로 — 표지 왼쪽 끝이 삼각형 오른쪽 끝보다 오른쪽 · 같은 간격 · 같은 높이', wf.length > 10 && !!wfl.al && okAl({...wfl.al, dGroup:0}) && wfl.al.left > wfl.warnR && wfl.holdFlip === -1, JSON.stringify(wfl && {al:wfl.al, warnR:wfl.warnR, actX:wfl.actX}));
    check('3차: HUD 안에 글자 없음', [al, cl, fl].every(s => s.text === 0), '');
    // ⑤ 우회전: 정지선을 지난 뒤에는 내 경로의 도로만(도로면 한 덩어리 · 가장자리 두 줄) — 지나온 본선 · 다른 출구의 선이 섞이지 않음. 보행자는 사람 모델 · 건너는 횡단보도는 주황 줄무늬
    const rt = await E(() => { const m = mapById('CRT'), leaf = m.leaves.findIndex(l => l.dest === '종합병원'); const runs = id => (($('#' + id).getAttribute('d') || '').match(/M/g) || []).length; let n = 0, bad = 0, peds = 0, hot = 0, pre = 0;
      runDrive({map:m, leaf, lane:2, type:'city', jam:0, seed:777, sigT:0}, {hud:'ar3', secs:22, ap:{}, setup:() => { D.cars.filter(c => c.kind !== 'onc').forEach(c => c.mesh.visible = false); D.cars = D.cars.filter(c => c.kind === 'onc'); },
        sample:() => { if(D.z > FORK_Z - 1){ if(runs('cSurf') >= 4) pre++; return; } n++; if(runs('cSurf') > 1 || runs('cEdges') > 2) bad++;
          if(S.H3.ped){ if(CAR3.models.ped && CAR3.models.ped.pool.some(g => g.visible)) peds++; if(runs('cZebraHot') > 5) hot++; } }}); return {n, bad, peds, hot, pre}; });
    check('3차 ⑤ 우회전: 정지선을 지나면 미니 도로에 내 경로의 도로만(지나온 본선 · 다른 출구 없음, 끊긴 띠를 이어 붙이지 않음), 그 전에는 본선 + 출구 셋', rt.n > 60 && rt.bad <= 1 && rt.pre > 60, JSON.stringify(rt));   // bad ≤ 1: 본선 → 꺾는 구간으로 보기가 넘어가는 한 프레임은 띠가 둘로 나뉠 수 있음(2026-11-17 밤, 출발 지점이 바뀌며 드러남 — 눈에 보이지 않는 1/60초)
    check('3차 ⑤: 건너는 보행자는 사람 모델(주황), 그 횡단보도 줄무늬가 주황으로', rt.peds > 10 && rt.hot > 10, JSON.stringify(rt));
    // 왼쪽으로 옮기는 맵(④): 차로 선을 넘는 내내 꺾쇠가 들어갈 차로 쪽(왼쪽 = 내 차 아이콘보다 화면 왼쪽)에, 대기의 금지 표지는 갈 방향 화살표의 왼쪽에 있음
    const lt = await E(() => { const m = mapById('CL2'), leaf = m.leaves.findIndex(l => l.dest === '전통시장'); let n = 0, bad = 0, nw = 0, badw = 0;
      runDrive({map:m, leaf, lane:2, type:'city', jam:0, seed:777, sigT:0}, {hud:'ar3', secs:9, ap:{}, sample:() => { const ch = [...document.querySelectorAll('#cChev path')].find(q => q.getAttribute('d')), hd = $('#cHold');
        if(hd.style.display !== 'none'){ nw++; if(!/translate\(-[\d.]+ [-\d.]+\)$/.test(hd.getAttribute('transform')) || S.H3.base !== 3 && S.H3.base !== 4) badw++; }
        if(!ch || !S.H3.needMove || !$('#cEgo').getAttribute('d')) return; const a = ch.getBBox(), e = $('#cEgo').getBBox(); n++; if(a.x + a.width/2 > e.x + e.width/2) bad++; }}); return {n, bad, nw, badw}; });
    check('3차: 왼쪽으로 옮길 때 꺾쇠가 내 차 왼쪽(들어갈 차로 쪽)에 — 차로 선을 넘는 중에도. 대기의 금지 표지는 갈 방향 화살표 왼쪽에', lt.n > 20 && lt.bad === 0 && lt.badw === 0, JSON.stringify(lt));
    check('3차 차 아이콘: Blender 세단 모델(hud_car.glb)을 불러와 같은 가상 카메라로 그림 — 안전 1대(내 차) · 주의 2대(내 차 + 뒤차) · 앞쪽 위험 2대 이상(내 차 + 앞차)', al.cars === 1 && bl.cars === 2 && fl.cars >= 2, `${al.cars} · ${bl.cars} · ${fl.cars}`);
    // 현대 HUD로 달려도 같은 상태가 계산되고(화면엔 안 보임) 이벤트로 남음
    const nv = await stage3(7, 4, 4, {jumpAt:1, hud:'nav'});
    check('3차 상태는 현대 HUD로 달릴 때도 같게 계산 · 기록(이벤트 h3, 화면에 안 보임 표시)', nv.samples.map(s => s.st).filter((v, i, arr) => i === 0 || v !== arr[i-1]).join('') === order && nv.events.filter(e => e.type === 'h3').length >= 2 && nv.events.filter(e => e.type === 'h3').every(e => e.shown === false) && d.events.filter(e => e.type === 'h3').every(e => e.shown === true), JSON.stringify(nv.events.filter(e => e.type === 'h3')));
    // 대기 중 옮기기 시작 → lcStart에 상태 3이 남음. 기다려 중 횟수는 예전 기준(게이트) 그대로
    const lc = await E(() => { const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥');
      const r = runDrive({map:m, leaf, lane:1, type:'rear', jam:0, seed:5, sigT:0}, {hud:'ar3', secs:4, ap:{mode:'lane', lane:1},
        setup:() => { D.cars.forEach(c => c.mesh.visible = false); const car = D.cars.find(c => c.kind === 'rear') || D.cars[1]; D.cars = [car]; car.mesh.visible = true; car.lane = 2; car.P = lanePath(S.map, 2, 0); car.kind = 'rear'; car.s = LANE_START - (D.z + 9 + car.len/2 + DRV.carL/2); car.v = car.v0 = car.base = D.v; car.T = 5; car.s0 = 1; placeCars(); resetGuide(); resetHud3(); update(0); },
        beforeFrame:tt => { if(tt > .8) window.AP.lane = 2; }});
      const st = r.events.find(e => e.type === 'lcStart' && e.toward); return {st, es:eventStats(r.events, r.t)}; });
    check('기록: 옮기기 시작한 순간의 리뉴얼 HUD 상태(03 대기)가 이벤트 · 한 줄 기록에 남고, 기다려 중 옮기기 시작 횟수는 그대로 1', lc.st && lc.st.hs === 3 && lc.st.gate === 'wait' && lc.es.lcState === 3 && lc.es.waitMoves === 1, JSON.stringify(lc));

    /* 미니 도로 투영 (2026-11-17 저녁 개정 — 미니 도로 고정):
       · 꺾는 구간(갈림 뒤, VIEW3.w = 1): 어느 방향의 평행선이든 미니 도로의 소실점 = 장면 카메라의 소실점 (예전과 같음)
       · 본선(VIEW3.w = 0): 도로 방향의 소실점이 프레임마다 같은 자리(차가 차로 안에서 틀어져도 미니 도로는 안 움직임) + 지평선 높이는 장면 카메라와 같음(같은 화각 · 내려다보는 각) */
    const vp = await E(() => { const out = {};
      const vpOf = (pr, p, a) => { const dx = Math.sin(a), dz = -Math.cos(a), nx = -dz, nz = dx, ln = o => [pr(p.x + nx*o + dx*30, p.z + nz*o + dz*30), pr(p.x + nx*o + dx*220, p.z + nz*o + dz*220)], A = ln(-3), B = ln(4); if([...A, ...B].some(q => !q)) return null;
        const x1 = A[0][0], y1 = A[0][1], x2 = A[1][0], y2 = A[1][1], x3 = B[0][0], y3 = B[0][1], x4 = B[1][0], y4 = B[1][1], den = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4);
        return [((x1*y2 - y1*x2)*(x3-x4) - (x1-x2)*(x3*y4 - y3*x4))/den, ((x1*y2 - y1*x2)*(y3-y4) - (y1-y2)*(x3*y4 - y3*x4))/den]; };
      const camVp = a => { const L = LAY, v = new THREE.Vector3(camera.position.x + Math.sin(a)*1e7, camera.position.y, camera.position.z - Math.cos(a)*1e7).project(camera);
        return [((v.x*.5 + .5)*L.W - (L.W/2 - L.hud.w/2))*520/L.hud.w, ((1 - (v.y*.5 + .5))*L.H - (L.hud.bottomY - L.hud.h))*270/L.hud.h]; };
      for(const [id, dest, lane, type, T, wob] of [['ICR', '용인·기흥', 1, 'rear', 3, 1], ['ICR', '용인·기흥', 1, 'rear', 13, 0], ['CRT', '종합병원', 1, 'city', 13, 0], ['CL2', '전통시장', 2, 'city', 15, 0]]){
        const m = mapById(id), leaf = m.leaves.findIndex(l => l.dest === dest); let turn = 0, nT = 0, nM = 0, hor = 0; const xs = [];
        runDrive({map:m, leaf, lane, type, jam:0, seed:777, sigT:0}, {hud:'ar3', noPeds:true, secs:T, ap:{}, setup:() => { D.cars.filter(c => c.kind !== 'onc').forEach(c => c.mesh.visible = false); D.cars = D.cars.filter(c => c.kind === 'onc'); },
          sample:() => { if(D.t <= T - 2.5) return;
            if(wob){ D.psi = .035*Math.sin(D.t*4); D.x = m.laneX(lane) + .3*Math.sin(D.t*3); update(0); }   // 차로 안에서 좌우 0.3m · 방향 2°로 흔듦
            const p = {x:D.x, z:D.z}, pr = makeProj3(p), W = VIEW3, fw = new THREE.Vector3(); camera.updateMatrixWorld(); camera.getWorldDirection(fw); const yaw = Math.atan2(fw.x, -fw.z);
            if(W.w === 1){ nT++; for(const da of [-.25, -.1, 0, .12, .3]){ const q = vpOf(pr, p, yaw + da), r = camVp(yaw + da); if(q) turn = Math.max(turn, Math.hypot(q[0] - r[0], q[1] - r[1])); } }
            else if(W.w === 0){ nM++; const q = vpOf(pr, p, 0), r = camVp(yaw); if(q){ xs.push(q[0]); hor = Math.max(hor, Math.abs(q[1] - r[1])); out.horizonY = +q[1].toFixed(1); } } }});
        out[id + ' ' + T + 's'] = {turn:+turn.toFixed(3), nTurn:nT, nMain:nM, sway:xs.length ? +(Math.max(...xs) - Math.min(...xs)).toFixed(3) : 0, horizon:+hor.toFixed(3)}; }
      return out; });
    const vps = Object.entries(vp).filter(([k]) => / \d+s$/.test(k)).map(([, v]) => v);
    check('3차 미니 도로: 꺾는 구간(갈림을 지난 뒤 — 일반도로 좌회전 중)에서는 소실점이 장면 카메라의 소실점과 같은 자리(차이 < 0.5 상자 단위)', vps.every(v => v.turn < .5) && vps.some(v => v.nTurn > 20), JSON.stringify(vp));
    check('3차 미니 도로 고정: 본선에서 차가 차로 안에서 흔들려도(좌우 0.3m · 방향 2°) 미니 도로의 소실점은 안 움직이고(< 0.5 상자 단위), 지평선 높이는 장면 카메라와 같음', vps.every(v => v.sway < .5 && v.horizon < .5) && vps[0].nMain > 20, JSON.stringify(vp));
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
      Object.assign(window.AP, {mode:'route', lane:null, exit:null, brakeUntilS:null, brakeHold:0, held:0, up:false, down:false, noResume:false, brakeNeed:null});
      const sessions = {};
      for(const pid of ['P1', 'P2']){
        $('#pid').value = pid; openSession(); beginSession();
        let guard = 0;
        while(SES.on && guard++ < 40){
          const st = SES.steps[SES.i];
          if(TOUR.state().on){ (window.__tours = window.__tours || []).push(pid + ':' + SES.i + ':' + TOUR.state().id); TOUR.go(TOUR.scenes.length); continue; }   // 안내 모션그래픽: 끝까지 넘김(→ 첫 주행)
          if(!$('#sess').hidden && $('#rate')){ setRate(4); if($('#choice')) setWait(0); (window.__qCards = window.__qCards || []).push({hud:st.hud, two:!!$('#choice'), text:$('#sesBody').innerText.slice(0, 60)}); $('#sesBtn').click(); continue; }
          if(!$('#sess').hidden){ if(/연습/.test($('#sesEyebrow').textContent) && /성공|다른 출구|충돌|시간 초과/.test($('#sesTitle').textContent)) window.__practiceCard = $('#sesTitle').textContent; $('#sesBtn').click(); continue; }
          // 주행 중: 카운트다운 건너뛰고 자동 운전
          clearTimeout(SES.timer); $('#count').hidden = true; D.frozen = false;
          for(let k = 0; k < 120*30 && S.running; k++) update(1/30);
          void st;
        }
        sessions[pid] = {rows:SES.rows.map(r => ({hud:r.hud, scn:r.scn, seq:r.seq, order:r.order, ver:r.ver, env:r.env, ev:(r.events || []).length, practice:r.practice, lcState:r.lcState, aeb:r.aeb, aebEv:(r.events || []).filter(e => e.type === 'aebOn').length})), qs:SES.qs.length, qd:SES.qs.map(q => ({hud:q.hud, rate:q.rate, wait:q.wait, q2:!!q.q2})), mode:S.mode, testing:S.testing};
      }
      const stored = loadArr(DKEY);
      return {sessions, tours:window.__tours || [], step0:buildSteps('ALT')[0].kind, practiceCard:window.__practiceCard || null, storedN:stored.length, oldKept:stored.some(r => r.p === 'P_OLD'), practiceN:loadArr(PKEY).length, practiceInDrives:stored.some(r => r.practice),
        sheets:book && book.map(([n, a]) => [n, a.length, a[0].length]), head:book && book.find(([n]) => n === '기록')[1][0], oldRowCells:rowCells(old).length};
    });
    const p1 = s.sessions.P1, p2 = s.sessions.P2; SES_ROWS = p1.rows.concat(p2.rows);
    check('세션: 참가자마다 본 주행 6판 기록', p1.rows.length === 6 && p2.rows.length === 6, `P1 ${p1.rows.length} · P2 ${p2.rows.length}`);
    check('세션(2026-11-17 밤): 맨 앞은 연습 주행이 아니라 안내 모션그래픽 — 참가자마다 한 번 뜨고(0번째 단계), 끝내면 바로 첫 주행. 연습 기록은 안 생김', s.step0 === 'tour' && JSON.stringify(s.tours) === JSON.stringify(['P1:0:start', 'P2:0:start']) && s.practiceN === 0 && !s.practiceInDrives, JSON.stringify({tours:s.tours, practice:s.practiceN}));
    const alt = rows => rows.map(r => r.hud).join(',') === 'nav,ar3,nav,ar3,nav,ar3' && rows.map(r => r.seq).join('') === '123456';
    check('세션(3차, 피그마 3차 검증 계획): 연습 뒤 현대 · 리뉴얼을 판마다 교대(현대 먼저, 번호와 상관없이) · 순서 칸 ALT', alt(p1.rows) && alt(p2.rows) && p1.rows[0].order === 'ALT' && p2.rows[0].order === 'ALT', `${p1.rows.map(r => r.hud).join(',')} / ${p2.rows.map(r => r.hud).join(',')}`);
    check('세션: 같은 장면이 연달아 나오지 않음(두 HUD의 같은 장면 사이에 다른 판이 낌)', [p1, p2].every(q => q.rows.every((r, i) => i === 0 || r.scn !== q.rows[i-1].scn)), JSON.stringify(p1.rows.map(r => r.scn)));
    check('세션: HUD 버전 칸 — 현대 3.5 · 리뉴얼 3.3', p1.rows.filter(r => r.hud === 'ar3').length === 3 && p1.rows.filter(r => r.hud === 'ar3').every(r => r.ver === '리뉴얼 3.3') && p1.rows.filter(r => r.hud === 'nav').every(r => r.ver === '현대 3.5'), JSON.stringify(p1.rows.map(r => r.ver)));
    const pairOk = rows => { const by = {}; rows.forEach(r => (by[r.scn] = by[r.scn] || []).push(r.hud)); return Object.values(by).every(h => h.length === 2 && h[0] !== h[1]); };
    check('세션: 같은 시나리오 ID를 두 HUD가 한 번씩 (교통 · 목적지 · 시간대 고정)', pairOk(p1.rows) && pairOk(p2.rows), JSON.stringify(p1.rows.map(r => r.scn)));
    check('세션: 새 필드(시나리오 · HUD 버전 · 환경 · 순서 · 이벤트) 기록', p1.rows.every(r => r.scn && r.ver && r.env && r.order && r.ev > 0), JSON.stringify(p1.rows[0]));
    check('세션: 모든 판에 \'옮기기 시작 때 리뉴얼 HUD 상태\'가 남음(1 ~ 6 또는 안 옮김 null) — 현대 HUD 판도', p1.rows.concat(p2.rows).every(r => r.lcState === null || (r.lcState >= 1 && r.lcState <= 6)) && p1.rows.concat(p2.rows).some(r => r.lcState >= 1), JSON.stringify(p1.rows.map(r => r.hud + ':' + r.lcState)));
    check('세션: 예전 기록이 지워지거나 덮이지 않음', s.oldKept && s.storedN === 13, `저장 ${s.storedN}`);
    check('세션 끝: 질문은 여섯 판 뒤에 현대(확신) → 리뉴얼(확신 + 대기 표시 이해) · HUD/테스트 상태 복원', p1.qs === 2 && !p2.testing && p1.qd[0].hud === 'nav' && p1.qd[0].wait === 0 && p1.qd[1].hud === 'ar3' && p1.qd[1].wait === 1 && p1.qd[1].q2 && p1.rows.length === 6, JSON.stringify(p1.qd));
    check('엑셀(참가자 한 명): 요약 · 기록 · 질문 · 이벤트 · 설명 시트 — 연습 시트는 없음(연습 주행을 없앰)', s.sheets && ['요약','기록','질문','이벤트','설명'].every(n => s.sheets.some(x => x[0] === n)) && !s.sheets.some(x => x[0] === '연습'), JSON.stringify(s.sheets));
    check('엑셀: 기록 시트 앞 11칸은 예전 칸 그대로, 새 칸은 뒤에(연습 여부 · 정체 줄 합류 방식 · 끼어들기 · 깜빡이 3칸 · 화면 맞추기 4칸 · 3차 상태 1칸 · 자동 급제동 1칸)', s.head && s.head[0] === '참가자' && s.head[10] === '도로 벗어남 (번)' && s.head[11] === '시나리오 ID' && s.head[s.head.length - 14] === '연습 여부' && s.head[s.head.length - 13] === '정체 줄 합류 방식' && s.head[s.head.length - 10] === '그때 닿기까지 (초)' && s.head[s.head.length - 7] === '옮길 차로 뒤차 반응' && s.head[s.head.length - 6] === '화면 1cm당 px' && s.head[s.head.length - 3] === 'HUD 상자 (px)' && s.head[s.head.length - 2] === '옮기기 시작 때 리뉴얼 HUD 상태' && s.head[s.head.length - 1] === '자동 급제동 (번)' && s.oldRowCells === s.head.length, s.head && s.head.slice(9, 13).concat(s.head.slice(-5)).join(' | '));
  }

  {
    // 처음 화면(2026-11-17 밤 정리): 버튼은 '주행 테스트 시작' · '시연 보기' 둘뿐 — 연습 주행 · 안내 보기 · 키 안내 줄 없음. 예전 연습 기록은 저장소에 그대로
    const r = await E(() => { goHome(); const c = $('#intro .card'); practices = [{p:'P_OLDPRACTICE', hud:'off', light:'day', map:'ICR', type:'practice', result:'ok', practice:true}]; let book = null;
      window.XLSX = {utils:{book_new:() => ({s:[]}), aoa_to_sheet:a => ({a}), book_append_sheet:(wb, ws, n) => wb.s.push([n, ws.a])}, writeFile:wb => { book = wb.s; }}; $('#allXlsx').click(); practices = [];
      return {btns:[...c.querySelectorAll('button')].map(q => q.textContent.trim()), keyrow:!!c.querySelector('.keyrow'), practiceBtn:!!$('#practiceBtn'), tourBtn:!!$('#tourBtn'), fn:typeof practiceCard, allSheets:book && book.map(q => q[0])}; });
    check('처음 화면: 버튼은 주행 테스트 시작 · 시연 보기 둘뿐(연습 주행 · 안내 보기 · 키 안내 줄 없음), 연습 주행 흐름은 코드에서도 없앰. 예전 연습 기록이 남아 있으면 엑셀 (전체)에만 연습 시트로 나감', JSON.stringify(r.btns) === JSON.stringify(['주행 테스트 시작', '시연 보기']) && !r.keyrow && !r.practiceBtn && !r.tourBtn && r.fn === 'undefined' && r.allSheets && r.allSheets.includes('연습'), JSON.stringify(r));
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

  /* ---------- 7-1. 안내 모션그래픽 (intro.js TOUR, 2026-11-17 밤 · 11-18 다시 디자인 D135 · D136) ---------- */
  {
    const t = await E(async () => { const o = {}; let done = 0;
      TOUR.show(() => done++); await new Promise(r => setTimeout(r, 300)); o.n = TOUR.scenes.length; o.ids = TOUR.scenes.map(q => q.id).join(',');
      const layers = () => [...document.querySelectorAll('#tour svg > g')], texts = () => layers().map(g => +g.getAttribute('opacity'));
      // 장면마다 끝 시각으로 옮겨 그려 보고(오류 없이), 보이는 장면은 하나뿐
      o.one = TOUR.scenes.every((q, i) => { TOUR.seek(i, q.hold ? 3 : q.dur - .05); const v = texts(); return v[i] === 1 && v.filter(x => x > 0).length === 1; });
      // 조작 장면: 속도 글자가 50 → 80 근처 → 22 근처 → 50으로 바뀜
      const spd = tt => { TOUR.seek(1, tt); return +document.querySelector('#tour .t-speed').textContent; }; o.speed = [spd(1), spd(5.2), spd(7.5), spd(10)];
      // 눌러 보기: 방향키 4개 + Q · E를 누르면 6/6, 그 전에는 저절로 안 넘어감. 누른 키는 운전 입력(KEYS)으로 새지 않음
      const kev = (type, c) => dispatchEvent(new KeyboardEvent(type, {code:c, key:c, bubbles:true, cancelable:true})), press = c => kev('keydown', c), lift = c => kev('keyup', c);
      TOUR.go(2); ['ArrowLeft', 'ArrowRight', 'ArrowUp'].forEach(press); TOUR.seek(2, 30); o.half = {n:TOUR.scenes[2].draw.state().n, at:TOUR.state().id, leak:Object.values(KEYS).some(Boolean)};
      ['ArrowDown', 'KeyQ', 'KeyE'].forEach(press); TOUR.seek(2, 31); TOUR.seek(2, 32.5); o.full = {at:TOUR.state().id};
      // 눌러 보기의 차: 누르고 있는 동안 반응하고 떼면 돌아옴(시간을 0.05초씩 흘림)
      TOUR.go(2); const S = () => TOUR.scenes[2].draw.state(); let tt = 1; const run = d => { for(const e = tt + d; tt < e - 1e-9;){ tt += .05; TOUR.seek(2, tt); } };
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyQ', 'KeyE'].forEach(lift); TOUR.go(2); TOUR.seek(2, tt); const r = {};
      press('ArrowUp'); run(1); r.up = S().v; const kUp = document.querySelector('#tour svg > g:nth-of-type(3) g[data-k="up"] > g'); r.upKeyDown = kUp && /translate\(0 [3-9]/.test(kUp.getAttribute('transform'));
      lift('ArrowUp'); run(2.5); r.back = S().v;
      press('ArrowDown'); run(.5); r.down = S().v; lift('ArrowDown'); run(2.5);
      press('ArrowLeft'); run(.6); r.yawL = S().yaw; r.xL = S().x - S().mid; run(3); r.edge = S().x - S().lo; lift('ArrowLeft'); run(1.5); r.yaw0 = S().yaw;
      r.held = S().held; r.n = S().n; r.at = TOUR.state().id; o.drive = r;
      // 키보드: 처음엔 가운데 한 덩어리 → 1.1초 뒤 모두 제자리(data-home)
      const kpos = () => [...layers()[1].querySelectorAll('g[data-k]')].map(g => { const m = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)/.exec(g.getAttribute('transform') || ''), h = g.dataset.home.split(',').map(Number); return m ? Math.hypot(+m[1] - h[0], +m[2] - h[1]) + Math.abs(+m[3] - 1)*100 : 999; });
      TOUR.seek(1, .05); o.unfold0 = Math.min(...kpos()); TOUR.seek(1, 1.3); o.unfold1 = Math.max(...kpos()); o.keyN = layers()[1].querySelectorAll('g[data-k]').length;
      // 준비: 8초 한 바퀴가 이음매 없이 — t와 t + 8의 그림이 같음
      const rd = tt => { TOUR.seek(5, tt); return layers()[5].innerHTML; }; o.loop = [3.3, 6.1, 7.96].map(x => rd(x) === rd(x + 8));
      // 색: 장면 여러 시각의 fill · stroke · stop-color가 모두 C 넷 · 그 음영 단계(TONE · KEYTONE) 또는 그 둘 사이 섞임 — HUD 신호색 · 다른 색 없음
      const P = TOUR.parts, base = [...Object.values(P.C), ...Object.values(P.TONE.point), ...Object.values(P.TONE.gray), ...Object.values(P.KEYTONE), '#ffffff'];
      const rgb = c => { c = (c || '').trim().toLowerCase(); let m = /^#([0-9a-f]{3})$/.exec(c); if(m) return [...m[1]].map(h => parseInt(h + h, 16)); m = /^#([0-9a-f]{6})$/.exec(c); if(m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)); m = /^rgba?\(([^)]+)\)/.exec(c); if(m) return m[1].split(',').slice(0, 3).map(Number); return null; };
      const B = base.map(rgb), onSeg = (c, a, b) => { const ab = a.map((v, i) => b[i] - v), L = ab.reduce((s, v) => s + v*v, 0), k = L ? Math.max(0, Math.min(1, ab.reduce((s, v, i) => s + v*(c[i] - a[i]), 0)/L)) : 0; return Math.hypot(...c.map((v, i) => v - (a[i] + ab[i]*k))) < 2.5; };
      const ok = c => B.some(a => B.some(b => onSeg(c, a, b))), bad = new Set();
      TOUR.scenes.forEach((q, i) => [.3, 1, 2.5, 4, 6, 9, 12, 15, 18].forEach(x => { TOUR.seek(i, x); document.querySelectorAll('#tour svg *').forEach(e => { ['fill', 'stroke', 'stop-color'].forEach(at => { const v = e.getAttribute(at); if(v && !/^(none|url\(|currentColor)/.test(v)){ const c = rgb(v); if(!c || !ok(c)) bad.add(at + ':' + v); } });
        if(e.tagName === 'text' || e.tagName === 'tspan'){ const c = rgb(getComputedStyle(e).fill); if(!c || !ok(c)) bad.add('text:' + getComputedStyle(e).fill); } }); }));
      o.badColors = [...bad].slice(0, 8);
      // 3D 영상 · 그림 없음(전부 SVG), 빛 번짐 · 그림자 필터는 차 · 키에만(그림자 = 먹색 사각형, 빛 = 꼬리등 선)
      o.media = document.querySelectorAll('#tour video, #tour img, #tour image, #tour foreignObject').length + TOUR.scenes.filter(q => q.video || q.image).length;
      const glow = [P.TONE.point.glow, P.TONE.gray.glow]; o.filters = [...document.querySelectorAll('#tour svg [filter]')].filter(e => !((e.tagName === 'rect' && e.getAttribute('fill') === P.C.ink) || (e.tagName === 'path' && glow.includes(e.getAttribute('stroke'))))).length;
      // Enter로 다음 · 마지막 장면에서 Enter(= 주행 시작)면 닫히고 done 한 번
      TOUR.go(5); const before = done; dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', code:'Enter', bubbles:true, cancelable:true})); o.end = {done:done - before, hidden:document.querySelector('#tour').hidden, on:TOUR.state().on};
      // HUD 표시의 뜻은 알려 주지 않음(대기 · 이동 같은 말 · HUD 색 설명이 없음)
      o.words = /기다려|대기|이동하세요|청록|빨간 점|금지 표|꺾쇠|급제동/.test(document.querySelector('#tour').textContent);
      return o; });
    check('안내 모션그래픽: 장면 6개(시작 · 조작 · 눌러 보기 · 할 일 · 기록 · 준비)가 오류 없이 그려지고 한 번에 한 장면만 보임, 조작 장면의 속도가 50 → 가속 → 브레이크 → 50으로 바뀜', t.n === 6 && t.ids === 'start,keys,try,task,data,ready' && t.one && t.speed[0] === 50 && t.speed[1] > 70 && t.speed[2] < 35 && Math.abs(t.speed[3] - 50) < 6, JSON.stringify({n:t.n, one:t.one, speed:t.speed}));
    check('안내 모션그래픽: 눌러 보기는 여섯 키를 다 눌러야 넘어가고(3개만 누르면 그대로) 운전 입력으로 새지 않음, 마지막 장면에서 Enter면 닫히며 주행으로 넘어감(한 번만)', t.half.n === 3 && t.half.at === 'try' && !t.half.leak && t.full.at === 'task' && t.end.done === 1 && t.end.hidden && !t.end.on, JSON.stringify({half:t.half, full:t.full, end:t.end}));
    check('안내 모션그래픽(D136): 눌러 보기의 차가 키를 누르는 동안 반응 — ↑ 1초면 빨라지고(키가 눌려 내려감) 떼면 50으로, ↓면 느려짐, ← 누르면 왼쪽으로 기울며 가다가 도로 끝에서 멈추고(끝까지 2px 안, 넘지 않음) 떼면 곧게. 키를 떼면 눌린 키 없음, 네 키만 눌렀으니 넘어가지 않음',
      t.drive.up > 68 && t.drive.upKeyDown && Math.abs(t.drive.back - 50) < 4 && t.drive.down < 35 && t.drive.yawL < -5 && t.drive.xL < -5 && t.drive.edge >= 0 && t.drive.edge < 2 && Math.abs(t.drive.yaw0) < 1.5 && t.drive.held === '' && t.drive.n === 3 && t.drive.at === 'try', JSON.stringify(t.drive));
    check('안내 모션그래픽(D136): 조작 장면의 키보드 — 키 6개가 처음엔 가운데 덩어리로 모여 있다가(제자리에서 떨어짐) 1.1초 뒤 모두 제자리 · 제 크기', t.keyN === 6 && t.unfold0 > 30 && t.unfold1 < .5, JSON.stringify({n:t.keyN, start:+t.unfold0.toFixed(1), end:+t.unfold1.toFixed(2)}));
    check('안내 모션그래픽(D136): 준비 장면의 반복은 8초 한 바퀴가 이음매 없이(t와 t + 8초의 그림이 같음 — 3.3 · 6.1 · 7.96초)', t.loop.every(Boolean), JSON.stringify(t.loop));
    check('안내 모션그래픽(D135 · D136): 색은 흰 바탕 · 파랑 · 먹색 · 회색과 그 음영 단계(사이 섞임)뿐, 3D 영상 · 그림 없음(전부 SVG), 그림자 · 빛 번짐 필터는 차 · 키에만', t.badColors.length === 0 && t.media === 0 && t.filters === 0, JSON.stringify({bad:t.badColors, media:t.media, filters:t.filters}));
    check('안내 모션그래픽: HUD 표시의 뜻(기다려 · 이동 · 색)은 알려 주지 않음 — 조작 · 할 일 · 기록 항목만(자동 급제동은 사용자 결정 전이라 넣지 않음)', !t.words, '');
  }

  /* ---------- 8-0. 화면 UI 디자인 시스템 (D137, 2026-11-18 — 안내 모션그래픽과 같은 토큰 · 야간 페이지 테마 없음 · 참가자 화면에 HUD 신호색 없음) ---------- */
  {
    const u = await E(async () => { const o = {}, cs = e => getComputedStyle(e), tok = n => cs(document.documentElement).getPropertyValue(n).trim();
      const rgb = c => { c = (c || '').trim().toLowerCase(); let m = /^#([0-9a-f]{6})$/.exec(c); if(m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)).join(','); m = /^rgba?\(([^)]+)\)/.exec(c); if(!m) return ''; const v = m[1].split(',').map(Number); return v.length > 3 && v[3] === 0 ? '' : v.slice(0, 3).join(','); };
      const T = {bg:rgb(tok('--bg')), point:rgb(tok('--point')), ink:rgb(tok('--ink')), field:rgb(tok('--field')), danger:rgb(tok('--danger'))};
      const HUDC = ['#00e5ff', '#3ddc84', '#ffb020', '#ff4d4d', '#5fd4ea', '#4cd38a', '#ff5a4f', cs($('#cab')).getPropertyValue('--h2-route'), cs($('#cab')).getPropertyValue('--h2-go'), cs($('#cab')).getPropertyValue('--h2-warn'), cs($('#cab')).getPropertyValue('--h2-danger')].map(rgb).filter(Boolean);
      // 야간 장면이어도 페이지 · 카드 · 위 막대는 흰 바탕, <html data-light> 없음
      goHome(); setLight('night'); o.night = {body:rgb(cs(document.body).backgroundColor), card:rgb(cs($('#intro .card')).backgroundColor), top:rgb(cs($('#topbar')).backgroundColor), attr:document.documentElement.hasAttribute('data-light'), cabNight:$('#cab').classList.contains('night')}; setLight('day');
      // 토큰 한곳: 안내 모션그래픽의 색 = styles.css 토큰, intro.css의 따로 둔 변수(--t-*) 없음
      TOUR.preload(); const P = TOUR.parts.C; o.tour = ['bg', 'point', 'ink', 'mute'].every(k => rgb(P[k]) === rgb(tok('--' + k))) && !cs($('#tour')).getPropertyValue('--t-point').trim();
      // 버튼: 주요 = 파랑 + 흰 글자, 보조 = 옅은 회색 + 먹색, 위 막대 = 글자만. 검정 버튼 없음
      o.btn = {primary:rgb(cs($('#testBtn')).backgroundColor) === T.point && rgb(cs($('#testBtn')).color) === T.bg, second:rgb(cs($('#demoBtn')).backgroundColor) === T.field && rgb(cs($('#demoBtn')).color) === T.ink,
        ghost:$$('.topbar .btn').every(b => !rgb(cs(b).backgroundColor)), black:$$('.btn').filter(b => rgb(cs(b).backgroundColor) === T.ink || rgb(cs(b).backgroundColor) === '20,25,31').map(b => b.id)};
      // 참가자 화면(처음 · 진행 카드 · 질문 · 키 안내)의 모든 글자 · 바탕 · 테두리 색에 HUD 신호색 · 연구자용 빨강 없음. 결과 아이콘: 성공 = 파랑, 그 밖 = 먹색
      // 허용 = 디자인 토큰뿐(흰 · 파랑 · 진한 파랑 · 먹색 · 회색 둘 · 옅은 회색 · 구분선). 그 밖의 색(HUD 신호색 계열 · 연구자용 빨강 · 예전 초록 등)은 모두 걸림
      const ALLOW = ['--bg', '--point', '--point-dark', '--ink', '--sub', '--mute', '--field', '--rule'].map(n => rgb(tok(n)));
      const colorsIn = sel => { const out = new Set(); [$(sel), ...$$(sel + ' *')].forEach(e => { const c = cs(e), svgEl = e instanceof SVGElement; [c.color, c.backgroundColor, c.borderTopColor, ...(svgEl ? [c.fill, c.stroke] : [])].forEach(v => { const r = rgb(v); if(r) out.add(r); }); }); return out; };
      const bad = new Set(), scan = sel => colorsIn(sel).forEach(c => { if(!ALLOW.includes(c) || HUDC.includes(c)) bad.add(sel + ':' + c); });
      scan('#intro'); setScreen('drive');
      sesCard({icon:'check', tone:'ok', eyebrow:'1 / 6', title:RESULT.ok, btn:['다음', () => {}]}); scan('#sess'); o.okIcon = rgb(cs($('#sesIcon')).backgroundColor) === T.point;
      sesCard({icon:'cross', tone:'bad', eyebrow:'2 / 6', title:RESULT.crash, btn:['다음', () => {}]}); scan('#sess'); o.badIcon = rgb(cs($('#sesIcon')).backgroundColor) === T.ink;
      SES.order = 'ALT'; surveyCard({block:1, hud:'ar3'}); setRate(4); setWait(0); scan('#sess');
      $('#keyHint').hidden = false; scan('#keyHint'); o.hintStill = cs($('#keyHint')).animationName === 'none' && /^0s/.test(cs($('#keyHint')).transitionDuration) && cs($('#keyHint kbd')).animationName === 'none';
      // 주행 중 · 시연 중: 운전 화면 둘레 여백 없음(창 끝까지)
      const edge = () => { const r = $('#cab').getBoundingClientRect(), a = $('.stage').getBoundingClientRect(); return [r.left - a.left, a.right - r.right, a.bottom - r.bottom, r.top - a.top].every(v => Math.abs(v) < .5); };
      o.edgeDrive = edge() && $('#cab').getBoundingClientRect().width === innerWidth; $('#keyHint').hidden = true; $('#sess').hidden = true;
      setScreen('demo'); await new Promise(r => setTimeout(r, 60)); o.edgeDemo = edge(); setScreen('home'); await new Promise(r => setTimeout(r, 60)); o.frameHome = !edge();
      // 세그먼트: 고른 칸 뒤의 흰 칸이 그 칸 자리로(설정을 열고 HUD를 바꿈)
      openSetup(true); setMode('nav'); await new Promise(r => setTimeout(r, 400)); const th = $('#modeSeg .seg-thumb'), pb = $('#modeSeg [aria-pressed="true"]');
      o.thumb = !!th && Math.abs(new DOMMatrix(cs(th).transform).m41 - pb.offsetLeft) < .5 && Math.abs(th.offsetWidth - pb.offsetWidth) < .5 && rgb(cs(th).backgroundColor) === T.bg; setMode('ar3'); openSetup(false); goHome();
      o.bad = [...bad].slice(0, 6); return o; });
    // prefers-reduced-motion: 카드 · 설정 · 서랍 · 세그먼트 움직임 꺼짐
    await page.emulateMedia({reducedMotion:'reduce'});
    const motionOff = await E(() => { const cs = e => getComputedStyle(e); return {card:cs($('#intro .card')).animationName, overlay:cs($('#intro')).animationName, drawer:cs($('#drawer')).transitionDuration, thumb:cs($('#modeSeg .seg-thumb')).transitionDuration}; });
    await page.emulateMedia({reducedMotion:'no-preference'});
    check('화면 UI(D137): 야간 장면이어도 페이지 · 위 막대 · 카드는 흰 바탕(<html data-light> 없음, 장면은 밤), 안내 모션그래픽의 색 = styles.css 토큰 한곳', Object.values(u.night).slice(0, 3).every(v => v === '255,255,255') && !u.night.attr && u.night.cabNight && u.tour, JSON.stringify({night:u.night, tour:u.tour}));
    check('화면 UI(D137): 주요 버튼 = 파랑 + 흰 글자 · 보조 = 옅은 회색 + 먹색 · 위 막대 = 글자만, 검정 버튼 없음', u.btn.primary && u.btn.second && u.btn.ghost && !u.btn.black.length, JSON.stringify(u.btn));
    check('화면 UI(D137): 참가자 화면(처음 · 판 결과 · 질문 · 키 안내)의 글자 · 바탕 · 테두리 색은 디자인 토큰뿐(HUD 신호색 · 연구자용 빨강 없음), 판 결과 아이콘 성공 = 파랑 · 그 밖 = 먹색', !u.bad.length && u.okIcon && u.badIcon, JSON.stringify({bad:u.bad, ok:u.okIcon, crash:u.badIcon}));
    check('화면 UI(D137): 주행 중 · 시연 중 운전 화면 둘레 여백 없음(처음 화면은 둥근 틀), 키 안내는 움직임 없음, 세그먼트의 흰 칸이 고른 칸 자리로', u.edgeDrive && u.edgeDemo && u.frameHome && u.hintStill && u.thumb, JSON.stringify({drive:u.edgeDrive, demo:u.edgeDemo, home:u.frameHome, hint:u.hintStill, thumb:u.thumb}));
    check('화면 UI(D137): 움직임 줄이기(prefers-reduced-motion)면 카드 · 뒤 어둡기 · 서랍 · 세그먼트 움직임 꺼짐', motionOff.card === 'none' && motionOff.overlay === 'none' && /^0s/.test(motionOff.drawer) && /^0s/.test(motionOff.thumb), JSON.stringify(motionOff));
  }

  /* ---------- 8-1. 화면 구조: HUD 선택은 현대 · 우리 두 개 · 버전 선택 없음 · 리뉴얼 HUD에 설명 글자 없음 ---------- */
  {
    const r = await E(() => ({modes:$$('#modeSeg button').map(b => b.dataset.mode + ':' + b.textContent.trim()), pair:!!$('#pairSeg'),
      verWords:/v1|v2/.test(document.body.innerText + $$('#setup button, #intro button').map(b => b.title).join(' ')), rules:/순서|홀수|짝수|비교:/.test(document.body.innerText),
      arText:$$('#arHud text').map(t => t.id + ':' + t.textContent), ar2Text:$$('#arHud2 text').map(t => t.id + ':' + t.textContent), ar3Text:$$('#arHud3 text').length, ours:/우리 HUD/.test(document.body.innerText + document.documentElement.innerHTML), arHud2:!!$('#arHud2'), orderUi:!!$('#orderSeg')}));
    check('시연 HUD 선택은 현대 · 3차 · 2차 · 1차(2026-11-17 저녁 사용자), 순서 선택지 · 안내 문장 없음, 화면 · 문서에 예전 이름 없음', JSON.stringify(r.modes) === JSON.stringify(['nav:현대', 'ar3:3차', 'ar2:2차', 'ar:1차']) && !r.ours && !r.pair && !r.verWords && r.arHud2 && !r.orderUi && !r.rules, JSON.stringify(r));
    check('리뉴얼 HUD 1 · 2차 안 글자는 제한속도 숫자뿐, 3차는 글자 없음', r.arText.length === 1 && /^limA:\d+$/.test(r.arText[0]) && r.ar2Text.length === 1 && /^bLim:\d+$/.test(r.ar2Text[0]) && r.ar3Text === 0, JSON.stringify(r.arText.concat(r.ar2Text)));
    const prep = await E(() => { $('#pid').value = 'P3'; openSession(); const o = {screen:$('#app').dataset.screen, setupVisible:!!$('#setup').offsetParent, setupBtn:!!$('#setupBtn').offsetParent, modeBtns:$$('#modeSeg button').filter(b => b.offsetParent).length, text:$('#sess').innerText, o3:orderFor('P3'), o4:orderFor('P4')}; goHome(); return o; });
    check('주행 테스트 준비 화면: HUD · 순서 고르기 · 안내 문장 없음, 순서는 누구나 판마다 교대(P3 · P4 모두 ALT)', !prep.setupVisible && !prep.setupBtn && prep.modeBtns === 0 && !/순서|비교|연습 주행 있음/.test(prep.text) && prep.o3 === 'ALT' && prep.o4 === 'ALT', JSON.stringify(prep));
  }

  /* ---------- 8-2. HUD 표시 영역 밖으로 나오지 않음: 같은 프레임을 HUD 켬 / 끔으로 그려 상자 밖 픽셀 비교 ---------- */
  {
    const scenes = [['CRT 우회전 접근', 'CRT', '종합병원', 1, 'city', 777, 11.4, 'day'], ['CRT 우회전 중', 'CRT', '종합병원', 1, 'city', 777, 12.6, 'day'], ['CL2 좌회전 중', 'CL2', '전통시장', 2, 'city', 777, 14.6, 'night'],
      ['뒤차 대기', 'ICR', '용인·기흥', 1, 'rear', seeds[0], 1.2, 'day'], ['정체 줄 옆', 'ICR', '용인·기흥', 1, 'jam', 11, 8, 'night']];
    for(const hud of ['ar', 'ar2', 'ar3', 'nav']) for(const [vw, vh] of [[1366, 768], [1920, 1080]]){
      await page.setViewportSize({width:vw, height:vh}); await page.waitForTimeout(250);
      for(const [name, mapId, dest, lane, type, seed, T, light] of scenes){
        await E(([mapId, dest, lane, type, seed, T, light, hud]) => { const m = mapById(mapId), leaf = m.leaves.findIndex(l => l.dest === dest);
          setScreen('drive'); $('#intro').hidden = true; $('#sess').hidden = true; MIR.on = false;
          runDrive({map:m, leaf, lane, type, jam:type === 'jam' ? 3 : 0, seed, sigT:0}, {hud, light, noPeds:true, secs:T, keep:true, ap:type === 'city' ? {} : {mode:'lane', lane},
            setup:() => { if(type === 'city'){ D.cars.filter(c => c.kind !== 'onc').forEach(c => c.mesh.visible = false); D.cars = D.cars.filter(c => c.kind === 'onc'); } const l = D.cars.find(c => c.kind === 'lead'); if(l) l.brakeAt = null; }});
          D.frozen = true; }, [mapId, dest, lane, type, seed, T, light, hud]);
        await page.waitForTimeout(150);
        // 계기판의 트립 거리 · 시계는 실제 시간으로 바뀌어(멈춘 판에서도 속도 × 시간) 두 캡처 사이에 숫자가 넘어가면 상자 밖 픽셀이 달라진다 → 찍는 동안 실내 갱신을 멈춤 (2026-11-17: 검사가 늘어 걸리는 일이 잦아짐)
        await E(() => { if(!window.__uc){ window.__uc = updateCabin; updateCabin = () => {}; } });
        const box = await E(() => { const r = $('#hudWrap').getBoundingClientRect(); return {x:r.left, y:r.top, w:r.width, h:r.height}; });
        // 계기판 시계가 두 캡처 사이에 분이 바뀌면 상자 밖 픽셀이 달라져 가짜로 걸림 → 한 번은 다시 찍는다
        let on, off, n = Infinity;
        for(let attempt = 0; attempt < 2 && n > 0; attempt++){
        on = await page.screenshot(); await E(() => { $('#hudWrap').style.visibility = 'hidden'; }); await page.waitForTimeout(60);
        off = await page.screenshot(); await E(() => { $('#hudWrap').style.visibility = ''; });
        n = await E(async ([a, b, box]) => {
          const load = s => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + s; });
          const [A, B] = await Promise.all([load(a), load(b)]), c = document.createElement('canvas'); c.width = A.width; c.height = A.height; const g = c.getContext('2d');
          g.drawImage(A, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data; g.drawImage(B, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data; let n = 0, bb = [1e9, 1e9, -1, -1];
          for(let y = 0; y < c.height; y++) for(let x = 0; x < c.width; x++){ if(x >= box.x - 1 && x <= box.x + box.w + 1 && y >= box.y - 1 && y <= box.y + box.h + 1) continue;
            const i = (y*c.width + x)*4; if(Math.abs(da[i]-db[i]) + Math.abs(da[i+1]-db[i+1]) + Math.abs(da[i+2]-db[i+2]) > 24){ n++; bb = [Math.min(bb[0], x), Math.min(bb[1], y), Math.max(bb[2], x), Math.max(bb[3], y)]; } }
          window.__bb = n ? bb.join(',') : ''; return n; }, [on.toString('base64'), off.toString('base64'), box]);
        }
        const [bbWas, tierWas] = await E(() => [window.__bb, PERF.tier]);
        await E(() => { stopDrive(); S.testing = false; MIR.on = true; if(window.__uc){ updateCabin = window.__uc; window.__uc = null; } });
        check(`HUD 영역 밖 픽셀 0 — ${({ar:'1차', ar2:'2차', ar3:'3차', nav:'현대'})[hud]} · ${vw}×${vh} · ${name}`, n === 0, `${n}px` + (n ? ' · 달라진 곳 ' + bbWas + ' · 화소 배율 단계 ' + tierWas : ''));
      }
    }
    await page.setViewportSize({width:1366, height:768});
    // HUD를 숨기면(연습 = HUD 없음) HUD 그림이 남지 않음
    const hidden = await E(() => { setMode('off'); return [...document.querySelectorAll('#arHud, #arHud2, #arHud3, #navHud')].every(g => g.style.display === 'none'); });
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
      // 자동 운전은 보행자 앞에 서지 않으므로 보행자는 뺌(버스 흐름만 봄). 2026-11-17 밤: 공사 구간이 생겨 경로만 따라가는 자동 운전은 뒤차와 부딪히므로 내 차는 출발점에 세워 둠(버스 · 뒤차 흐름만 봄)
      runDrive(cfg, {hud:'ar2', secs:45, ap:{mode:'lane', lane:1}, noPeds:true, setup:() => { D.cruise = 0; D.v = 0; }, sample:() => { const c = D.cars.find(o => o.kind === 'bus'); if(!c) return; const s = busStateAt(c.plan, D.t); phases.add(s.phase); doorMax = Math.max(doorMax, s.door); if(c.plan.departT !== null) departed = true; peds = Math.max(peds, (busMesh.userData.peds || []).length);
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
    const tex = await E(() => ({asphalt:!!(asphalt.map && asphalt.map.image && asphalt.map.image.src && /asphalt\.webp/.test(asphalt.map.image.src) && asphalt.map.image.naturalWidth === 1024), facade:/facade\.webp/.test((facadeMat.map.image || {}).src || '')}));
    check('Higgsfield 재질(아스팔트 · 건물 벽)이 실제로 불러와짐', tex.asphalt && tex.facade, JSON.stringify(tex));
    check('콘솔 오류 · 깨진 경로 없음', errors.filter(e => !/favicon/.test(e)).length === 0, errors.slice(0, 5).join(' | '));
  }

  /* ---------- 10. 조작감 (2026-11-17, config.js VEH · drive.js stepPlayer): 키 → 핸들 각도 → 앞바퀴 각 → 자전거 모델. 실제 값과의 비교는 handling-check.js ---------- */
  {
    const h = await E(() => {
      const dt = 1/60, stepPlayer = window.__sp0, keys = (l, r, u, d) => { KEYS.left = !!l; KEYS.right = !!r; KEYS.up = !!u; KEYS.down = !!d; };
      const fresh = v => { const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥'); setMode('off'); setScreen('drive'); startDrive({map:m, leaf, lane:1, type:'practice', jam:0, seed:1, sigT:0}); D.frozen = false;
        D.cars.forEach(c => c.mesh.visible = false); D.cars = []; Object.assign(D, {x:0, z:0, psi:0, v, sw:0, r:0, wheel:0, cruise:v, holdT:0, holdDir:0, brakeT:0, thrT:0, autoSw:null}); };
      VEH.assist.on = false;   // 아래 실제 값 검사는 조작 보조를 끄고 잰다(보조는 맨 끝에서 따로)
      const press = (kmh, secs) => { fresh(kmh/3.6); const tr = []; for(let k = 0; k < secs*60; k++){ keys(0, 1); D.v = kmh/3.6; stepPlayer(dt); tr.push(D.sw); } return tr; };
      const o = {};
      const a100 = press(100, 1), a20 = press(20, 1), tap = press(100, .15);
      o.sw100 = +a100[a100.length - 1].toFixed(1); o.sw20 = +a20[a20.length - 1].toFixed(0); o.tap100 = +tap[tap.length - 1].toFixed(2);
      o.grows = a100.every((v, i) => i === 0 || v >= a100[i-1]) && a100[20] - a100[10] > a100[10] - a100[0];   // 점점 커지고, 누른 직후보다 나중이 빠름
      o.wheelLink = Math.abs(D.wheel - D.sw/VEH.ratio*Math.PI/180) < 1e-9;
      // 떼면 가운데로: 매 프레임 줄어들고 한 프레임에 크게 뛰지 않음, 2.5초 안에 10% 아래
      const peak = D.sw; let maxStep = 0, mono = true, t10 = null, prev = D.sw;
      for(let k = 0; k < 60*4; k++){ keys(); D.v = 20/3.6; stepPlayer(dt); if(D.sw > prev + 1e-9) mono = false; maxStep = Math.max(maxStep, prev - D.sw); prev = D.sw; if(t10 === null && D.sw < peak*.1) t10 = (k + 1)*dt; }
      o.ret = {mono, maxStepPct:+(maxStep/peak*100).toFixed(1), t10:+t10.toFixed(2), end:+D.sw.toFixed(2)};
      // 같은 핸들 각도(10°)에 빠를수록 덜 꺾임
      const yaw = kmh => { fresh(kmh/3.6); for(let k = 0; k < 90; k++){ D.autoSw = 10; D.v = kmh/3.6; stepPlayer(dt); } return D.r/(kmh/3.6); };   // 곡률(1/m)
      o.gain = +(yaw(100)/yaw(30)).toFixed(2);
      // 화면 속 핸들 = 실제 핸들 각도
      fresh(20/3.6); for(let k = 0; k < 40; k++){ keys(0, 1); stepPlayer(dt); } update(0);
      o.wheelImg = +(/rotateZ\(([-\d.]+)deg\)/.exec($('#cabinWheel').style.transform) || [])[1]; o.swNow = +D.sw.toFixed(1);
      // 가속 · 브레이크
      fresh(0); D.cruise = 0; let t = 0; while(D.v < 100/3.6 - .01 && t < 30){ keys(0, 0, 1); stepPlayer(dt); t += dt; } o.t100 = +t.toFixed(1);
      fresh(65/3.6); const z0 = D.z; t = 0; while(D.v > .01 && t < 10){ keys(0, 0, 0, 1); stepPlayer(dt); t += dt; } o.stop65 = +(z0 - D.z).toFixed(1);
      fresh(65/3.6); for(let k = 0; k < 18; k++){ keys(0, 0, 0, 1); stepPlayer(dt); } o.tapBrake = +((65/3.6 - D.v)*3.6).toFixed(1);
      /* 조작 보조(VEH.assist, 2026-11-17 밤 — 2차 실험 때의 조작 느낌): 누르면 0.55초에 끝 각도 · 떼면 0.33초에 가운데(일정한 빠르기),
         핸들이 스스로 움직이지 않음(떼고 나면 방향이 틀어져 있어도 0에 그대로), 2차 조작 식(입력 × 옆 가속 3.2 한도, 요 속도 = v/L·tan)과 같은 궤적 */
      VEH.assist.on = true;
      { const A = VEH.assist, run = (kmh, pressS, totalS, old) => { fresh(kmh/3.6); const v = kmh/3.6; let st = 0, tr = []; for(let k = 0; k < totalS*60; k++){ const on = k < pressS*60; keys(0, on); D.v = v;
            if(old){ const rate = on ? 1.8 : 3; st += clamp((on ? 1 : 0) - st, -rate*dt, rate*dt); const dMax = Math.min(.5, Math.atan(3.2*VEH.L/Math.max(v*v, .01))); D.psi += v/VEH.L*Math.tan(st*dMax)*dt; D.x += Math.sin(D.psi)*v*dt; D.z -= Math.cos(D.psi)*v*dt; tr.push(st); }
            else { stepPlayer(dt); tr.push(D.sw); } }
          return {tr, x:D.x, psi:D.psi*180/Math.PI}; };
        const a = run(50, 1, 4, false), hold = swForCurv(Infinity, 50/3.6, tabAt(A.ayHold, 50/3.6)), tUp = (a.tr.findIndex(q => q >= hold*.999) + 1)*dt, tDown = (a.tr.slice(60).findIndex(q => q <= 1e-6) + 1)*dt;
        const after = a.tr.slice(60 + Math.round(.4*60)), o2 = run(50, 1, 4, true), n100 = run(100, .6, 4, false), o100 = run(100, .6, 4, true);
        o.as = {tUp:+tUp.toFixed(2), tDown:+tDown.toFixed(2), selfMove:+Math.max(...after.map(Math.abs)).toFixed(3), psiLeft:+a.psi.toFixed(1), x50:[+a.x.toFixed(1), +o2.x.toFixed(1)], psi50:[+a.psi.toFixed(1), +o2.psi.toFixed(1)], x100:[+n100.x.toFixed(1), +o100.x.toFixed(1)]}; }
      keys(); stopDrive(); S.testing = false;
      // 키 배치는 그대로: 방향키 4개 · Q · E
      S.testing = true; S.drive = true; const ev = (type, key, code) => dispatchEvent(new KeyboardEvent(type, {key, code, bubbles:true, cancelable:true}));
      ev('keydown', 'ArrowLeft'); ev('keydown', 'ArrowUp'); const dn = {...KEYS}; ev('keyup', 'ArrowLeft'); ev('keyup', 'ArrowUp'); ev('keydown', 'ArrowRight'); ev('keydown', 'ArrowDown'); const dn2 = {...KEYS}; ev('keyup', 'ArrowRight'); ev('keyup', 'ArrowDown');
      o.keys = dn.left && dn.up && !dn.right && !dn.down && dn2.right && dn2.down && !dn2.left && !Object.values(KEYS).some(Boolean); S.testing = false; S.drive = false; setMode('ar3'); goHome();
      o.veh = {L:VEH.L, ratio:VEH.ratio, lock:VEH.lock, wheelMax:+(VEH.lock/VEH.ratio).toFixed(1)};
      return o; });
    check('조작 보조(2차 조작 느낌): 누르면 0.55초에 끝 각도 · 떼면 0.33초에 가운데, 뗀 뒤에는 방향이 틀어져 있어도 핸들이 스스로 안 움직임(0 그대로), 50km/h 1초 누름의 궤적이 2차 조작 식과 5% 안으로 같음(100km/h는 옆 가속 2.6이라 2차보다 덜 꺾임)', Math.abs(h.as.tUp - .56) < .04 && Math.abs(h.as.tDown - .34) < .04 && h.as.selfMove === 0 && Math.abs(h.as.psiLeft) > 5 && Math.abs(h.as.x50[0] - h.as.x50[1]) < Math.abs(h.as.x50[1])*.05 + .2 && Math.abs(h.as.psi50[0] - h.as.psi50[1]) < Math.abs(h.as.psi50[1])*.05 + .3 && h.as.x100[0] < h.as.x100[1] && h.as.x100[0] > h.as.x100[1]*.7, JSON.stringify(h.as));
    check('조작감: 핸들 각도와 앞바퀴 각을 따로 계산(앞바퀴 = 핸들 ÷ 기어비 12.7) · 화면 속 핸들이 실제 핸들 각도 그대로 돎', h.wheelLink && Math.abs(h.wheelImg - h.swNow) < .11 && h.swNow > 20 && h.veh.ratio === 12.7 && h.veh.lock === 446, JSON.stringify({img:h.wheelImg, sw:h.swNow, veh:h.veh}));
    check('조작감(보조 끔 = 실제 값): 키를 누르고 있는 동안 핸들이 점점 돌아가고(누른 직후는 느리게), 빠를수록 같은 입력에 덜 돎 — 1초 누름 100km/h 수 도 · 20km/h 150° 넘게, 톡 누르면(0.15초) 1° 안', h.grows && h.sw100 > 5 && h.sw100 < 14 && h.sw20 > 150 && h.tap100 < 1, JSON.stringify({sw100:h.sw100, sw20:h.sw20, tap100:h.tap100}));
    check('조작감(보조 끔 = 실제 값): 키를 떼면 핸들이 끊기지 않고 가운데로(매 프레임 줄어듦 · 한 프레임에 3% 넘게 안 뜀 · 2.5초 안에 10% 아래)', h.ret.mono && h.ret.maxStepPct < 3 && h.ret.t10 < 2.5 && h.ret.t10 > .8 && Math.abs(h.ret.end) < 2, JSON.stringify(h.ret));
    check('조작감: 같은 핸들 각도에 100km/h는 30km/h보다 덜 꺾임(곡률 비 0.4 ~ 0.6, 언더스티어)', h.gain > .4 && h.gain < .6, `${h.gain}`);
    check('조작감: ↑ 0 → 100km/h 10.3초 안팎(아반떼 1.6 실측 10.27초) · ↓ 계속 누르면 65km/h에서 20 ~ 25m에 섬(예전 7m/s² 고정 23m와 비슷) · 0.3초 톡 누르면 5km/h 안 줄어듦', Math.abs(h.t100 - 10.3) < .5 && h.stop65 > 20 && h.stop65 < 25 && h.tapBrake < 5, JSON.stringify({t100:h.t100, stop65:h.stop65, tapBrake:h.tapBrake}));
    check('조작감: 키 배치 그대로(← → ↑ ↓)', h.keys, '');
  }

  /* ---------- 10-1. 2026-11-17 밤: ⑤ 보행자 시작을 내 차 위치에 맞춤 · 차로 변경 때 미니 도로가 한 번에 매끄럽게 ---------- */
  {
    const r = await E(() => { const o = {};
      const m = mapById('CRT'), leaf = m.leaves.findIndex(l => l.dest === '종합병원');
      // 일찍 닿는 경우(순항 100km/h로 버스를 지나쳐 감)와 보통(50km/h) 모두: 횡단보도 45m 앞에 왔을 때 건너려 하거나 건너는 사람이 있어야 함
      const one = (cruise, seed) => { let before = null, trig = null, near = null, hud = null;
        runDrive({map:m, leaf, lane:1, type:'city', jam:0, seed, sigT:0}, {hud:'ar3', secs:40, ap:{},
          setup:() => { D.cruise = cruise; D.cars.filter(c => c.kind !== 'onc').forEach(c => c.mesh.visible = false); D.cars = D.cars.filter(c => c.kind === 'onc'); before = !!(S.pedPlan && S.pedPlan.pending) && pedsAt(0).length === 0; },
          sample:() => { if(trig === null && S.pedPlan && !S.pedPlan.pending) trig = {t:+D.t.toFixed(2), z:+D.z.toFixed(0), t0:S.pedPlan.map(p => +(p.t0 - D.t).toFixed(1))};
            if(near === null && D.z < CZ.near + 30){ near = pedsAt(D.t).filter(p => p.phase !== 'done').length; hud = S.H3 ? S.H3.state : null; } }});
        const ev = D.events.filter(e => e.type === 'peds').length; return {before, trig, near, hud, ev}; };
      o.fast = one(27.8, 777); o.norm = one(13.9, 778);
      // 미니 도로 좌우 기준: 차가 차로 가운데에서 옆 차로 가운데까지 일정하게 옮겨 갈 때 한 방향으로만 · 한 프레임에 조금씩만 움직이고, 가운데 ±0.5m 안에서는 안 움직임
      const mm = mapById('ICR'); runDrive({map:mm, leaf:mm.leaves.findIndex(l => l.dest === '용인·기흥'), lane:1, type:'rear', jam:0, seed:777, sigT:0}, {hud:'ar3', secs:1, keep:true, ap:{}});
      const x0 = mm.laneX(1), xs = []; D.frozen = true; let t = D.t;
      for(let k = 0; k < 60; k++){ D.x = x0; D.psi = 0; D.t = t += 1/60; update(0); }   // 먼저 차로 가운데에 자리 잡게
      for(let k = 0; k <= 240; k++){ D.x = x0 + LANE*k/240; D.psi = 0; D.t = t += 1/60; update(0); xs.push(VIEW3.ax); }
      for(let k = 0; k < 60; k++){ D.t = t += 1/60; update(0); } xs.push(VIEW3.ax);
      const steps = xs.slice(1).map((v, i) => v - xs[i]); o.view = {mono:steps.every(d => d >= -1e-6), maxStep:+Math.max(...steps).toFixed(3), still:+(xs[30] - xs[0]).toFixed(3), end:+(xs[xs.length - 1] - mm.laneX(2)).toFixed(2), mid:+(xs[120] - x0).toFixed(2), ego:Math.abs(VIEW3.ex - VIEW3.ax) < 1e-9};
      // 충돌 판정: 내 차가 우회전하며 72° 틀어져 서 있고 버스가 7.9m 옆을 곧게 지나감 → 충돌 아님. 같은 버스가 내 차 꼬리에 닿으면 충돌. 나란한 앞차는 예전 식과 같은 거리에서 충돌
      { const m5 = mapById('CRT'); runDrive({map:m5, leaf:m5.leaves.findIndex(l => l.dest === '종합병원'), lane:1, type:'city', jam:0, seed:777, sigT:0}, {hud:'ar3', secs:1, keep:true, ap:{}}); S.pedPlan = [];
        const keep = D.cars; const mk = (x, z, kind, len, w) => ({x, z, tx:0, tz:-1, kind, len, w, mesh:{userData:{L:len, W:w}}});
        const bus = mk(3.5, -241.1, 'bus', 11.4, 2.5); D.cars = [bus]; D.x = 11.4; D.z = -241.7; D.psi = 72*Math.PI/180; o.hit = {far:hit()};
        bus.x = 8.2; o.hit.touch = hit(); D.psi = 0; D.x = 0; D.z = -100; const car = mk(0, -104.4, 'rear', 4.6, 1.85); D.cars = [car]; o.hit.gap = hit(); car.z = -104.3; o.hit.alignedHit = hit(); car.z = -100; car.x = 1.75; o.hit.side = hit(); car.x = 1.65; o.hit.sideHit = hit(); D.cars = keep; }
      stopDrive(); S.testing = false; goHome(); return o; });
    check('충돌 판정: 두 차를 각자 방향의 직사각형으로 — 비스듬히 선 내 차 옆 7.9m를 곧게 지나가는 버스는 충돌 아님 · 꼬리에 닿으면 충돌 · 나란한 차는 예전과 같은 거리(앞뒤 4.35m · 옆 1.70m)에서 충돌', r.hit.far === '' && /버스/.test(r.hit.touch) && r.hit.gap === '' && /앞을 받음/.test(r.hit.alignedHit) && r.hit.side === '' && /옆/.test(r.hit.sideHit), JSON.stringify(r.hit));
    check('⑤ 보행자: 건너기 시작은 내 차가 교차로 55m 앞에 온 순간부터(첫 사람 2 ~ 4.5초 뒤) — 100km/h로 일찍 닿아도 50km/h로 닿아도 교차로 30m 앞에서 건너려 하거나 건너는 사람이 있고 리뉴얼 HUD가 06 앞쪽 위험, 기록에 이벤트 1줄', [r.fast, r.norm].every(q => q.before && q.trig && q.trig.t0[0] >= 1.9 && q.trig.t0[0] <= 4.6 && q.near >= 1 && q.hud === 6 && q.ev === 1), JSON.stringify(r.fast) + ' / ' + JSON.stringify(r.norm));
    check('3차 미니 도로: 차로를 옮기는 동안 좌우 기준이 한 방향으로 매끄럽게(프레임당 0.05m 아래) 넘어가고, 차로 가운데 0.5m 안에서는 안 움직이며, 옆 차로 가운데에 정확히 닿음. 내 차 아이콘은 늘 그 기준 자리', r.view.mono && r.view.maxStep < .05 && Math.abs(r.view.still) < 1e-6 && Math.abs(r.view.end) < .02 && r.view.ego, JSON.stringify(r.view));
  }

  /* ---------- 11. 그래픽 에셋 (2026-11-17, 3회차 MVP 작업 3): 나무 · 가로등 · 가드레일 기둥(Blender) · 보행자(Higgsfield + 리깅) · 차량 압축 ---------- */
  {
    await page.waitForTimeout(1500);
    const g = await E(() => { const o = {};
      o.trees = {ready:TREES.isReady(), models:Object.keys(TREES.models).sort().join(','), cards:Object.keys(TREES.cards).length, mapOk:Object.values(TREES.M).every(m => !!m.map)};
      o.props = {ready:PROPM.isReady(), models:Object.keys(PROPM.models).sort().join(',')};
      // 고속도로 맵: 나무 인스턴스(모델 + 판) · 가로등 · 가드레일 기둥이 놓였나
      const count = (grp, f) => { let n = 0; grp.traverse(q => { if(q.isInstancedMesh && f(q)) n += q.count; }); return n; };
      const hw = builtMaps.ICR, city = builtMaps.CRT; const isLeaf = q => q.userData.tree === 'leaf', isFar = q => q.userData.tree === 'far';
      o.hw = hw ? {near:count(hw, isLeaf), far:count(hw, isFar), culled:(() => { let ok = true; hw.traverse(q => { if(q.userData.tree && q.userData.tree !== 'far' && (!q.frustumCulled || !q.geometry.boundingSphere)) ok = false; }); return ok; })(), lamps:count(hw, q => PROPM.models.lamp_hw.some(p => p.geo === q.geometry))/PROPM.models.lamp_hw.length, posts:count(hw, q => PROPM.models.rail_post.some(p => p.geo === q.geometry))/PROPM.models.rail_post.length} : null;
      o.city = city ? {trees:count(city, isLeaf), walkers:mapById('CRT')._walkers.length + ' ' + mapById('CL2')._walkers.length, lamps:count(city, q => PROPM.models.lamp_city.some(p => p.geo === q.geometry))/PROPM.models.lamp_city.length} : null;
      // 보행자: 모델 4개 · 자리 6개 모두 뼈대 동작, 걷는 방향을 보고 섬(머리 → 얼굴 앞 뼈대가 진행 방향)
      const m = mapById('CRT'), leaf = m.leaves.findIndex(l => l.dest === '종합병원');
      runDrive({map:m, leaf, lane:2, type:'city', jam:0, seed:777, sigT:0}, {hud:'ar3', secs:1, keep:true, ap:{}});
      S.pedPlan = [{x:16.6, dir:1, v:1.3, t0:.2}, {x:18, dir:-1, v:1.4, t0:.1}]; cityFrame(3); scene.updateMatrixWorld(true);
      const a = new THREE.Vector3(), b = new THREE.Vector3(), face = i => { const u = pedMeshes[i].userData; if(!u.model) return null; u.model.getObjectByName('headfront').getWorldPosition(a); u.model.getObjectByName('Head').getWorldPosition(b); return +(a.z - b.z).toFixed(2); };
      const pose = i => { const u = pedMeshes[i].userData; if(!u.model) return null; const f = u.model.getObjectByName('LeftFoot').getWorldPosition(new THREE.Vector3()); return f.toArray().map(v => +v.toFixed(2)).join(','); };
      const p3 = pose(0); cityFrame(3.3); scene.updateMatrixWorld(true); const p33 = pose(0); cityFrame(3); scene.updateMatrixWorld(true);
      o.peds = {loaded:PED_MODEL.loaded, mixers:pedMeshes.filter(q => q.userData.mixer).length, codeHidden:pedMeshes.every(q => !q.userData.body.visible), face0:face(0), face1:face(1), moves:p3 !== p33, same:pose(0) === p3, nat:pedMeshes.map(q => +(q.userData.natural || 0).toFixed(2))};
      // 보도를 걷는 사람들(장식): 보도 위에만(차도 x 범위 밖) · 횡단보도 머리에서 떨어져 · 시각에 따라 움직이고 같은 시각이면 같은 자리 · 횡단보도 보행자 수(pedsAt)는 그대로
      { const W = m._walkers, xR = m.lanes*LANE/2, xL = -xR - m.lanes*LANE; const at = tt => { cityFrame(tt); return W.filter(w => w.node).map(w => [+w.node.position.x.toFixed(2), +w.node.position.z.toFixed(2)]); };
        camera.position.set(0, 1.2, -100); const a = at(3), b = at(9), a2 = at(3);
        const onWalk = q => q.every(([x, z]) => (x > xR + 1.2 || x < xL - 1.2) || (z > CZ.near + 1.2 && z < CZ.near + 4) || (z < CZ.far - 1.2 && z > CZ.far - 4));
        o.walk = {n:W.length, made:a.length, onWalk:onWalk(a) && onWalk(b), moved:a.filter((q, i) => Math.hypot(q[0] - b[i][0], q[1] - b[i][1]) > 3).length, same:JSON.stringify(a) === JSON.stringify(a2),
          cwClear:W.every(w => w.ax !== 'x' || !m.cw || w.a >= m.cw.x0 + 13 || w.b <= m.cw.x0 - 13), peds:pedsAt(3).length, pedMeshes:pedMeshes.length}; }
      stopDrive(); S.testing = false; goHome();
      o.cars = {draco:!!THREE.DRACOLoader, n:Object.keys(CAR_MODELS).length};
      return o; });
    check('그래픽: 나무 모델 6그루(느티나무 3 · 소나무 3)와 텍스처를 불러와, 고속도로에 가까운 나무는 모델 · 먼 나무는 그 모델을 찍은 판으로 심김(같은 나무), 가까운 나무는 구역별로 묶여 화면 밖 구역은 안 그림. 일반도로(④ ⑤)에는 가로수 없음(2026-11-17 저녁 사용자)', g.trees.ready && g.trees.models === 'pine_a,pine_b,pine_c,zelkova_a,zelkova_b,zelkova_c' && g.trees.cards === 6 && g.trees.mapOk && g.hw && g.hw.near >= 300 && g.hw.far > 3000 && g.hw.culled && g.city && g.city.trees === 0, JSON.stringify({t:g.trees, hw:g.hw, city:g.city}));
      check('그래픽: 가로등 2종 · 가드레일 기둥 · 공사 구간 소품(라바콘 · 방호 울타리 · 표지) Blender 모델이 인스턴스로 놓임', g.props.ready && g.props.models === 'barricade,cone,lamp_city,lamp_hw,rail_post,work_sign' && g.hw.lamps >= 8 && g.hw.posts >= 100 && g.city.lamps >= 10, JSON.stringify({p:g.props, hw:g.hw, city:g.city}));
      check('그래픽: 보행자 모델 4명이 자리 6개에 모두 들어가 뼈대로 걷고(시각에 따라 자세가 바뀌고 같은 시각이면 같은 자세), 걷는 방향을 보고 섬. 코드 모양은 숨김', g.peds.loaded === 4 && g.peds.mixers === 6 && g.peds.codeHidden && g.peds.face0 < -.05 && g.peds.face1 > .05 && g.peds.moves && g.peds.same && g.peds.nat.every(v => v > .4 && v < 1.6), JSON.stringify(g.peds));
      check('그래픽: 일반도로 보도를 걷는 사람들(장식) — 보도 위로만 다니고 횡단보도 머리 13m 안으로는 안 옴, 시각에 따라 걷고 같은 시각이면 같은 자리, 횡단보도 보행자 자리(6개)는 그대로', g.walk.n >= 30 && g.walk.made === g.walk.n && g.walk.onWalk && g.walk.moved > g.walk.n*.8 && g.walk.same && g.walk.cwClear && g.walk.pedMeshes === 6, JSON.stringify(g.walk));
      check('그래픽: 차량 모델 5종은 Draco 압축본을 읽음', g.cars.draco && g.cars.n === 5, JSON.stringify(g.cars));
  }

  /* ---------- 12. 앞쪽 위험 2단계 · 자동 급제동 (2026-11-18, D134 — config.js AEB · drive.js aebStep · guide.js needDec · h3Step) ---------- */
  if(!process.env.NO_AEB){
    await E(() => {
      // 앞차 장면: ① 1차로 · 직진(대전·천안), 내 차로 앞차 한 대만 gap m 앞 · 같은 속도. brakeAt초에 급정거(6.5 m/s²로 서고 1.5초 뒤 다시 출발) / park: 서 있는 차
      window.leadCfg = () => { const m = mapById('ICR'); return {map:m, leaf:m.leaves.findIndex(l => l.dest === '대전·천안'), lane:1, type:'rear', jam:0, seed:5, sigT:0}; };
      window.leadSetup = (gap, brakeAt, park) => () => { const lead = D.cars.find(c => c.kind === 'lead'); D.cars.forEach(c => { if(c !== lead) c.mesh.visible = false; }); D.cars = [lead];
        lead.s = LANE_START - (D.z - gap - halfL(lead) - DRV.carL/2); lead.v = lead.v0 = lead.base = D.v;
        if(park){ lead.v = 0; lead.brakeAt = 0; lead.phase = 2; lead.holdT = 1e9; } else { lead.brakeAt = brakeAt; lead.phase = 0; } placeCars(); resetGuide(); resetHud3(); update(0); };
      // ⑤ 우회전 전체 경로(seed 777): 다른 차를 빼고 마주 오는 차만 — 보행자는 내 차가 다가오면 건너기 시작(D126)
      window.pedCfg = () => { const m = mapById('CRT'); return {map:m, leaf:m.leaves.findIndex(l => l.dest === '종합병원'), lane:2, type:'city', jam:0, seed:777, sigT:0}; };
      window.pedSetup = () => { D.cars.filter(c => c.kind !== 'onc').forEach(c => c.mesh.visible = false); D.cars = D.cars.filter(c => c.kind === 'onc'); };
      const sc = el => { const m = (el.getAttribute('transform') || '').match(/scale\(([\d.]+)\)/); return m ? +m[1] : 1; };
      window.aebSm = () => { const lead = D.cars.find(c => c.kind === 'lead');
        return {t:+D.t.toFixed(3), v:+D.v.toFixed(3), aeb:D.aeb.on, dec:+D.aeb.dec.toFixed(2), need:D.haz ? +D.haz.need.toFixed(2) : 0, gap:D.haz && D.haz.kind === 'lead' ? +D.haz.gap.toFixed(2) : null, lvl:S.H3.level, st:S.H3.state, scc:D.sccOff, ped:D.ped,
          cwd:path.cwS !== null ? +(path.cwS - S.s - DRV.carL/2).toFixed(2) : null, leadV:lead ? +lead.v.toFixed(2) : null,
          tri:getComputedStyle($('#cWarn .c-warn-tri')).fill, mark:getComputedStyle($('#cWarn .c-warn-mark')).fill, scale:sc($('#cWarn')), leadFill:getComputedStyle($('#cLead')).fill, band:getComputedStyle($('#cFrontBand')).fill, zebra:getComputedStyle($('#cZebraHot')).fill, svgRed:$('#hudSvgTop').classList.contains('red')}; };
    });
    const pick = r => ({result:r.result, ev:r.events.filter(e => e.type === 'aebOn' || e.type === 'aebOff'), red:r.events.filter(e => e.type === 'h3red'), s:r.samples});
    const aebOf = r => r.ev.map(e => [e.type, e.t, e.why || e.kind, e.kmh, e.need ?? '', e.gap ?? ''].join(':')).join(' | ');
    const RGB = h => 'rgb(' + [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ') + ')', DANGER = RGB('#ff4d4d'), WARN = RGB('#ffb020'), WHITE = 'rgb(255, 255, 255)';

    // ① 아무 키도 안 누르면: 앞차가 급정거해도 · 보행자가 건너도 급제동으로 선다. 걸리면 SCC가 꺼져 서 있다(앞차가 다시 출발해도 혼자 안 감)
    const n1 = pick(await E(() => runDrive(leadCfg(), {hud:'ar3', secs:10, ap:{mode:'lane', lane:1, noResume:true}, setup:leadSetup(16, 1, false), sample:aebSm})));
    const on1 = n1.ev.find(e => e.type === 'aebOn'), off1 = n1.ev.find(e => e.type === 'aebOff'), during = n1.s.filter(x => x.aeb), after = n1.s.filter(x => off1 && x.t > off1.t), redOn = n1.red.find(e => e.on);
    const AB = await E(() => ({...AEB, max:VEH.brake.max}));
    check(`자동 급제동 ① 아무 키도 안 누르면 앞차 급정거에서 급제동으로 섬 — 필요 감속도 ${AB.on} 이상에서 걸려 ${AB.rampT}초에 ${AB.max} m/s²까지, 서서 ${AB.hold}초 잡은 뒤 풀림 · 충돌 없음`,
      n1.result === null && n1.ev.filter(e => e.type === 'aebOn').length === 1 && on1.kind === 'lead' && on1.need >= AB.on && off1 && off1.why === 'stop' && Math.abs(off1.t - during.find(x => x.v === 0).t - AB.hold) < .06 &&
      during.some(x => x.dec >= AB.max - .01) && Math.min(...during.filter(x => x.dec >= AB.max - .01).map(x => x.t)) - on1.t <= AB.rampT + .05 && Math.min(...n1.s.map(x => x.gap ?? 99)) > 0,
      aebOf(n1) + ` · 최소 간격 ${Math.min(...n1.s.map(x => x.gap ?? 99)).toFixed(2)}m`);
    check('자동 급제동 ①: 급제동 뒤 SCC가 꺼져 — 앞차가 다시 출발해도 ↑를 누르기 전까지 서 있음', after.length > 30 && after.every(x => x.v === 0 && x.scc) && after.some(x => x.leadV > 3), JSON.stringify(after[after.length - 1]));
    check('06 빨강: 필요 감속도 4 이상이면 급제동보다 먼저 빨강(주황 → 빨강 바로) · 급제동 중엔 늘 빨강 · 빨간 삼각형 + 흰 느낌표 · 앞차 아이콘 · 앞쪽 간격 띠도 빨강 · 바뀌는 순간 한 번 커짐',
      redOn && redOn.t <= on1.t && during.every(x => x.lvl === 2) && n1.s.filter(x => x.lvl === 2).every(x => x.tri === DANGER && x.mark === WHITE && x.leadFill === DANGER && x.band === DANGER && x.svgRed) && n1.s.filter(x => x.lvl === 1).every(x => x.tri === WARN && x.leadFill === WARN) &&
      (() => { const i = n1.s.findIndex(x => x.lvl === 2); return i > 0 && n1.s[i - 1].lvl === 1 && n1.s[i - 1].scale > .99 && n1.s[i].scale < .95 && n1.s.slice(i, i + 12).some(x => x.scale > .99); })(),
      JSON.stringify({redOn, aebOn:on1.t, atRed:n1.s.find(x => x.lvl === 2)}));
    const p1 = pick(await E(() => runDrive(pedCfg(), {hud:'ar3', secs:30, ap:{noResume:true}, setup:pedSetup, sample:aebSm})));
    const pOn = p1.ev.find(e => e.type === 'aebOn'), pStop = p1.s.filter(x => pOn && x.t > pOn.t && x.v === 0);
    check('자동 급제동 ① 아무 키도 안 누르면 ⑤ 횡단보도에 사람이 건널 때 그 앞에서 급제동으로 섬 — 앞범퍼가 횡단보도 앞 선을 넘지 않음 · 보행자 양보 안 함 0',
      !!pOn && pOn.kind === 'ped' && pStop.length > 30 && pStop.every(x => x.cwd > 0) && p1.s[p1.s.length - 1].ped === 0 && p1.ev.some(e => e.type === 'aebOff' && e.why === 'stop'), aebOf(p1) + ` · 섰을 때 횡단보도까지 ${pStop.length ? pStop[0].cwd : '-'}m`);
    check('06 빨강(보행자): 횡단보도 줄무늬도 빨강', p1.s.some(x => x.lvl === 2) && p1.s.filter(x => x.lvl === 2).every(x => x.tri === DANGER && x.zebra === DANGER), JSON.stringify(p1.s.find(x => x.lvl === 2)));

    // ② ↓로 보통 제동해 서면 급제동이 안 걸린다(필요 감속도가 brakeNeed를 넘으면 밟기 시작해 설 때까지 — 미리 서는 운전자)
    const b1 = pick(await E(() => runDrive(leadCfg(), {hud:'ar3', secs:10, ap:{mode:'lane', lane:1, noResume:true, brakeNeed:2.5}, setup:leadSetup(16, 1, false), sample:aebSm})));
    const b2 = pick(await E(() => runDrive(pedCfg(), {hud:'ar3', secs:30, ap:{noResume:true, brakeNeed:2}, setup:pedSetup, sample:aebSm})));
    // 횡단보도: 처음 선 자리가 앞 선 앞이면 '보통으로 섬'. 그 뒤 사람 사이가 잠깐 비었을 때 다시 출발해 걸음 속도로 들어가는 것은 급제동 기준(필요 감속도 6) 밖 — [한계] 시속 약 3km 아래(D134 기록)
    const b2i = b2.s.findIndex(x => x.need >= 2), b2stop = b2i < 0 ? null : b2.s.slice(b2i).find(x => x.v === 0);   // 보행자 때문에 밟기 시작한 뒤 처음 선 자리(그 장면엔 앞차가 없어 필요 감속도는 횡단보도뿐)
    check('자동 급제동 ② ↓로 보통 제동해 서면 급제동이 안 걸림 — 앞차 급정거 앞 · 횡단보도 앞 모두(충돌 없음, 횡단보도는 앞 선 앞에 섬)', b1.ev.length === 0 && b1.result === null && Math.min(...b1.s.map(x => x.v)) === 0 && b2.ev.length === 0 && !!b2stop && b2stop.cwd > 0 && b2.result !== 'crash',
      `앞차: ${aebOf(b1) || '급제동 없음'} · 결과 ${b1.result} · 최대 필요 감속도 ${Math.max(...b1.s.map(x => x.need))} / 횡단보도: ${aebOf(b2) || '급제동 없음'} · 결과 ${b2.result} · 처음 선 자리 횡단보도 앞 ${b2stop ? b2stop.cwd : '-'}m · 보행자 양보 안 함 ${b2.s[b2.s.length - 1].ped} · 최대 ${Math.max(...b2.s.map(x => x.need))}`);

    // ③ ↑를 계속 누르면: 급제동이 약해져(ovrDec) 속도가 줄다가, ovrT초 뒤 풀려 다시 빨라지고 충돌. 다시 걸리지 않음
    const u1 = pick(await E(() => runDrive(leadCfg(), {hud:'ar3', secs:9, ap:{mode:'lane', lane:1, up:true}, setup:leadSetup(70, 0, true), sample:aebSm})));
    const uOn = u1.ev.find(e => e.type === 'aebOn'), uOff = u1.ev.find(e => e.type === 'aebOff'), uIn = u1.s.filter(x => x.aeb), vAt = t => u1.s.reduce((b, x) => Math.abs(x.t - t) < Math.abs(b.t - t) ? x : b).v;
    check(`자동 급제동 ③ ↑를 계속 누르면 속도가 줄다가(급제동 ${AB.ovrDec} m/s²로 약해짐) ${AB.ovrT}초 뒤 풀려 다시 빨라지고 충돌 · 다시 걸리지 않음`,
      !!uOn && uOff && uOff.why === 'override' && Math.abs(uOff.dur - AB.ovrT) < .05 && vAt(uOff.t) < vAt(uOn.t) - 1 && uIn.every(x => x.dec <= AB.ovrDec + .01) && u1.s.filter(x => x.t > uOff.t + .3).every((x, i, a) => i === 0 || x.v >= a[i - 1].v - 1e-6) &&
      u1.result === 'crash' && u1.ev.filter(e => e.type === 'aebOn').length === 1, aebOf(u1) + ` · 속도 ${vAt(uOn.t).toFixed(1)} → ${vAt(uOff.t).toFixed(1)} → ${u1.s[u1.s.length - 1].v.toFixed(1)}m/s · 결과 ${u1.result}`);
    const u2 = pick(await E(() => runDrive(leadCfg(), {hud:'ar3', secs:9, ap:{mode:'lane', lane:1, up:true, noResume:true}, setup:leadSetup(70, 0, true), sample:aebSm,
      beforeFrame:() => { if(D.aeb.on && D.t - D.aeb.t0 > .5) window.AP.up = false; }})));
    const u2on = u2.ev.find(e => e.type === 'aebOn'), u2in = u2.s.filter(x => x.aeb);
    check(`자동 급제동 ③-2 ↑를 ${AB.ovrT}초 전에 떼면 다시 세게 잡아(${AB.max} m/s²) 섬 · 충돌 없음`, !!u2on && u2.ev.some(e => e.type === 'aebOff' && e.why === 'stop') && u2in.some(x => x.t - u2on.t < .5 && x.dec <= AB.ovrDec + .01) && u2in.some(x => x.dec >= AB.max - .01) && u2.result === null,
      aebOf(u2));

    // ④ 같은 시나리오에서 현대 · 리뉴얼의 급제동 시점이 같다(차의 기능 — HUD와 상관없이 같은 걸음에)
    const pair = await E(() => ['nav', 'ar3'].map(h => { const a = runDrive(leadCfg(), {hud:h, secs:10, ap:{mode:'lane', lane:1}, setup:leadSetup(16, 1, false)}), b = runDrive(pedCfg(), {hud:h, secs:30, ap:{}, setup:pedSetup});
      const k = r => r.events.filter(e => /^aeb|^h3red$/.test(e.type)).map(e => [e.type, e.t, e.why || e.kind, e.kmh, e.on, e.need, e.gap].join(':')).join(' | '); return {lead:k(a), ped:k(b), shown:a.events.filter(e => e.type === 'h3red').map(e => e.shown)}; }));
    check('자동 급제동 ④ 같은 시나리오에서 현대 HUD · 리뉴얼 HUD의 급제동 시작 · 끝 시점과 빨강 단계 시점이 같음(앞차 · 보행자, 빨강은 현대 HUD 화면에 안 보임)', pair[0].lead === pair[1].lead && pair[0].ped === pair[1].ped && /aebOn/.test(pair[0].lead) && /aebOn/.test(pair[0].ped) && pair[0].shown.every(x => !x) && pair[1].shown.every(x => x),
      `앞차 ${pair[0].lead} / 보행자 ${pair[0].ped}`);

    // ⑤ 기록: 한 판을 세션처럼 끝내(onDriveEnd) 기록 · 요약 · 이벤트 · 설명 시트에 급제동이 남는지
    const rec = await E(() => {
      const keep = drives.slice(), keepRows = SES.rows.slice(), cfg = leadCfg();
      SES.cur = {st:{block:1, no:1, hud:'ar3', scn:'TEST-AEB', kind:'run'}, cfg}; SES.pid = 'P_AEB';
      runDrive(cfg, {hud:'ar3', secs:12, ap:{mode:'lane', lane:1, noResume:true}, setup:leadSetup(16, 1, false), beforeFrame:t => { if(t > 9 && !D.result) endRun('timeout'); }});
      const row = SES.rows[SES.rows.length - 1];
      const cells = rowCells(row), sum = sumCells([row], []), ev = evRows([row]), ex = EXPLAIN.find(r => r[0] === '자동 급제동 (번)');
      drives = keep; saveArr(DKEY, drives); SES.rows = keepRows; $('#sess').hidden = true;
      return {aeb:row.aeb, cell:cells[HEAD.indexOf('자동 급제동 (번)')], sum:sum.filter(r => r[1] === '전체').map(r => r[SUM_HEAD.indexOf('자동 급제동 (번)')]), sumHead:SUM_HEAD.includes('자동 급제동 (번)'),
        evOn:ev.filter(r => r[5] === '자동 급제동 시작').map(r => r[6]), evOff:ev.filter(r => r[5] === '자동 급제동 끝').map(r => r[6]), ex:ex && ex[2], env:row.env, oldCell:rowCells({...row, aeb:undefined})[HEAD.indexOf('자동 급제동 (번)')]};
    });
    const sesRows = SES_ROWS;
    check('자동 급제동 ⑤ 기록 시트 \'자동 급제동 (번)\' · 요약 시트 HUD별 합계 · 이벤트 시트 시작(대상 · 그때 속도)/끝(멈춤) · 설명 시트 칸 뜻 · 환경 3.3 — 예전 기록은 빈칸',
      rec.aeb === 1 && rec.cell === 1 && rec.sumHead && rec.sum.length === 1 && rec.sum[0] === 1 && rec.evOn.length === 1 && /대상 앞차 · 그때 시속 \d+km/.test(rec.evOn[0]) && rec.evOff.length === 1 && /^멈춤/.test(rec.evOff[0]) &&
      rec.ex === '적을수록 운전자가 스스로 먼저 대처한 것. 가속으로 풀린 뒤 충돌했으면 경고를 무시한 것' && /환경 3\.3/.test(rec.env) && rec.oldCell === '' && sesRows.every(r => r.aeb === r.aebEv), JSON.stringify({...rec, ses:sesRows.map(r => r.aeb)}));
  }
  {
    const log = await E(() => window.__runLog || []);
    if(process.env.RUNLOG) fs.writeFileSync(process.env.RUNLOG, JSON.stringify(log, null, 1));
    console.log(`(판 기록 ${log.length}판 · 급제동이 걸린 판 ${log.filter(r => r.aeb).length})`);
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
