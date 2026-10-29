/* ============================================================
   session.js — 주행 테스트 진행 · 기록 · 내보내기 (2026-10-29 개편, 예전 D60 · D64 · D65 · D68 · D70 위에)
   흐름: 참가자 정보 → (연습 주행) → HUD A 3판 → 질문 2개 → HUD B 3판 → 질문 2개 → 요약 + 엑셀 자동 저장
   · 비교: 현대 HUD · 우리 HUD, 순서는 늘 현대 HUD 먼저 (2026-10-29 — 교대 · 고르기 없음, 1차 실험과 같음)
   · 시나리오(맵 · 상황 · 시간대 · 교통 번호 · 시작 차로 · 목적지 · 신호 시각)는 짝마다 한 번 정해 두 HUD 블록이 그대로 다시 씀
     → HUD만 다르고 교통은 같다 (예전엔 블록마다 교통 번호 · 목적지를 새로 뽑았음)
   · 연습 주행은 HUD 없이, 본 기록(hud-drive-v1)과 따로(hud-drive-practice-v1) 저장 → 결과에 섞이지 않음
   · 예전 기록 · 엑셀 칸은 그대로 두고 새 칸을 뒤에 붙임. 예전 기록의 새 칸은 빈칸
   방향키 · 기록 서랍도 여기. main.js 다음에 로드.
   ============================================================ */

const DKEY = 'hud-drive-v1', OLD_KEY = 'hud-mvp-trials-v2', BAG_KEY = 'hud-drive-mapbag', PID_KEY = 'hud-drive-nextpid', QKEY = 'hud-drive-survey-v1', PKEY = 'hud-drive-practice-v1', CFG_KEY = 'hud-drive-expcfg';
const loadArr = k => { try{ const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; }catch(e){ return []; } };
const saveArr = (k, v) => { try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} };
let drives = loadArr(DKEY), surveys = loadArr(QKEY), practices = loadArr(PKEY);
const shuffle = (a, R = Math.random) => { for(let i=a.length-1;i>0;i--){ const j = Math.floor(R()*(i+1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// HUD 이름. 어느 때의 우리 HUD였는지는 기록의 'HUD 버전'(내부 값, 예전 기록은 빈칸 = 1차 실험 때 HUD)으로 구분.
// 'ar2'는 10.29 중간 시험판 기록(있다면)을 읽기 위한 것 — 지금은 만들지 않음
const hudKey = h => h === 'ar2' ? 'ar' : h;
const modeName = m => ({ar:'우리 HUD', nav:'현대 HUD', off:'HUD 없음'})[hudKey(m)] || m;
const modeShort = m => ({ar:'우리', nav:'현대'})[hudKey(m)] || m;
const RESULT = {ok:'성공', wrong:'다른 출구', crash:'충돌', timeout:'시간 초과', signal:'신호 위반'};   // 신호 위반: 일반도로(D69)
const CITY_SITU = {CL2:'좌회전 대기 줄 · 신호', CRT:'정류장 버스 · 보행자'};
const situName = r => (r.type === 'practice' ? '연습' : r.type === 'city' ? CITY_SITU[r.map] || '일반도로' : r.type === 'jam' ? ({1:'정체 보통(예전)', 2:'정체 심함(예전)'}[r.jam] || '정체') : `뒤차 ${r.rearN}대`) + (r.brake ? ' · 앞차 급정거' : '');
const kindOf = r => r.type === 'city' ? '일반도로' : r.type === 'jam' ? '고속도로 정체' : r.type === 'practice' ? '연습' : '고속도로 뒤차';
const lightName = l => l === 'night' ? '야간' : '주간';
const resultName = r => r.result === 'crash' && r.crash ? `충돌 (${r.crash.split(' · ')[0]})` : RESULT[r.result];
// 차로 옮긴 곳 = 목표 차로에 자리 잡은 곳이 '마감선' 몇 m 앞인가 (기준 그대로)
const marginOf = r => { if(r.change === null || r.change === undefined) return null; const m = mapById(r.map) || MAPS_OFF.find(o => o.id === r.map); return Math.round(r.change - (FORK_Z - changeEndOf(m))); };
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const envName = () => `환경 ${ENV_VER} · 미러 ${MIR.on ? '켬' : '끔'}`;

/* ---------- 실험 설정 (연구자 설정 패널) ---------- */
const EXP = Object.assign({practice:true}, (() => { try{ const o = JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); return {practice:o.practice !== false}; }catch(e){ return {}; } })(), {pair:['nav', 'ar'], order:'AB'});   // 늘 현대 → 우리
const saveExp = () => { try{ localStorage.setItem(CFG_KEY, JSON.stringify(EXP)); }catch(e){} renderExp(); };
function renderExp(){
  $('#practiceChk').checked = EXP.practice;
}
$('#practiceChk').onchange = e => { EXP.practice = e.target.checked; saveExp(); };
// 제시 순서: 늘 현대 HUD → 우리 HUD ('AB')
const orderFor = () => 'AB';

/* ---------- 진행 순서 ---------- */
const SES = {on:false, pid:'', steps:[], i:-1, rows:[], qs:[], prs:[], order:'AB', cur:null, timer:0, seq:0};
const CITY_BAG = 'hud-drive-citybag';
function takeMaps(n, pool, key){
  let bag = loadArr(key).filter(id => pool.some(m => m.id === id));
  const out = [];
  while(out.length < n){
    if(!bag.length) bag = shuffle(pool.map(m => m.id));
    const id = bag.pop(); if(!out.includes(id)) out.push(id);
  }
  saveArr(key, bag);
  return out;
}
/* 시나리오 하나 = 맵 · 상황 · 시간대 · 교통 번호(seed) · 시작 차로 · 목적지 · 신호 시각. 교통 번호에서 모두 정해짐 → 같은 번호면 다시 만들 수 있음.
   목적지는 늘 차로를 한 번 옮겨야 하는 곳(예전과 같음) */
function makeScenario(mapId, type, light, seed){
  const m = mapById(mapId), R = mulberry32(seed ^ 0x2c1b3c6d), lane = m.start[Math.floor(R()*m.start.length)];
  const leaves = leafIdxs(m, (l, i) => l.quiz && makeRoute(m, i, lane).side !== 0), leaf = leaves[Math.floor(R()*leaves.length)];
  const sigT = m.sig === 'left' ? 12 + mulberry32(seed ^ 0x5bd1)()*6 : 0;   // ④ 좌회전 화살표 켜지는 시각(12~18초) — 예전과 같은 식
  return {map:mapId, type, light, seed, lane, leaf, sigT, jam:type === 'jam' ? 3 : 0, scn:`${mapId}-${type}-${light === 'night' ? 'N' : 'D'}-${seed}`};
}
// 블록 = 고속도로 2판(뒤차 1 + 정체 1) + 일반도로 1판 (D68). 두 블록이 같은 시나리오 셋을 순서만 섞어 씀
function buildSteps(order){
  const [A, B] = takeMaps(2, MAPS.filter(m => !m.city), BAG_KEY), [C] = takeMaps(1, MAPS.filter(m => m.city), CITY_BAG);
  const lights = shuffle(['day', 'night', pick(['day', 'night'])]), seed = () => 1 + Math.floor(Math.random()*999999);
  const scns = [makeScenario(A, 'rear', lights[0], seed()), makeScenario(B, 'jam', lights[1], seed()), makeScenario(C, 'city', lights[2], seed())];
  const [h1, h2] = order === 'AB' ? EXP.pair : EXP.pair.slice().reverse();
  const block = (hud, no) => shuffle(scns.slice()).map((p, i) => ({kind:'run', hud, block:no, no:i + 1, ...p}));
  return [...(EXP.practice ? [{kind:'practice'}] : []), ...block(h1, 1), {kind:'survey', hud:h1, block:1}, ...block(h2, 2), {kind:'survey', hud:h2, block:2}, {kind:'done'}];
}
function runCfg(st){ return {map:mapById(st.map), leaf:st.leaf, lane:st.lane, type:st.type, jam:st.jam, seed:st.seed, sigT:st.sigT}; }

/* ---------- 카드 · 카운트다운 ---------- */
function sesCard({icon = '', tone = '', eyebrow = '', title, body = '', btn, btn2}){
  $('#sesIcon').innerHTML = icon ? ico(icon) : ''; $('#sesIcon').className = icon ? 'card-icon ' + tone : '';
  $('#sesEyebrow').textContent = eyebrow; $('#sesTitle').textContent = title; $('#sesBody').innerHTML = body;
  const b1 = $('#sesBtn'), b2 = $('#sesBtn2');
  b1.textContent = btn[0]; b1.onclick = btn[1]; b1.disabled = false;
  b2.hidden = !btn2; if(btn2){ b2.textContent = btn2[0]; b2.onclick = btn2[1]; }
  $('#intro').hidden = true; $('#sess').hidden = false;
  const inp = $('#sesPid'); (inp ? inp : b1).focus();
}
const hideCard = () => { $('#sess').hidden = true; };
const KEY_HINT = '<div class="keyrow"><span><kbd>←</kbd><kbd>→</kbd> 핸들</span><span><kbd>↑</kbd> 가속</span><span><kbd>↓</kbd> 브레이크</span></div>';
function lockUi(on){
  $('#setup').classList.toggle('locked', on);
  $$('#scenario button, #modeSeg button, #lightSeg button, #expSetup button, #expSetup input, #mirrorChk').forEach(b => b.disabled = on);
  if(!on && S.map && S.map.city) $$('#jamSeg button').forEach(b => b.disabled = true);
}

/* ---------- 흐름 ---------- */
function openSession(){
  stopDemo(); openSetup(false); setScreen('prep');
  const pid = $('#pid').value || 'P1';
  sesCard({eyebrow:'주행 테스트', title:'참가자 정보', body:`<label class="pid">참가자 ID<input type="text" id="sesPid" value="${esc(pid)}" autocomplete="off"></label>
    <p class="ses-note">HUD를 보고 <b>목적지 출구</b>로 가 주세요. 3회씩 두 번, 모두 6회 주행합니다.</p>${KEY_HINT}
    <p class="ses-meta" id="sesMeta"></p>`,
    btn:['시작', beginSession], btn2:['뒤로', goHome]});
  const meta = () => { const o = orderFor($('#sesPid').value || 'P1'), [x, y] = o === 'AB' ? EXP.pair : EXP.pair.slice().reverse();
    $('#sesMeta').innerHTML = `연구자 확인 · 순서 <b>${modeShort(x)} → ${modeShort(y)}</b> · 연습 주행 ${EXP.practice ? '있음' : '없음'} · ${envName()}`; };
  $('#sesPid').oninput = meta; meta();
}
function beginSession(){
  SES.pid = ($('#sesPid').value || 'P1').trim(); $('#pid').value = SES.pid;
  SES.order = orderFor(SES.pid);
  SES.on = true; S.testing = true; SES.prevMode = S.mode; SES.prevLight = S.light; SES.steps = buildSteps(SES.order); SES.i = -1; SES.rows = []; SES.qs = []; SES.prs = []; SES.seq = 0;
  lockUi(true); setScreen('drive'); nextStep();
}
function nextStep(){
  const st = SES.steps[++SES.i];
  if(st.kind === 'run') runStep(st);
  else if(st.kind === 'practice') practiceCard();
  else if(st.kind === 'survey') surveyCard(st);
  else doneSession();
}
// 3 · 2 · 1 동안 화면을 멈춰 두고 키 안내
function countdown(keepHint){
  D.frozen = true; hideCard();
  const cnt = $('#count'), hint = $('#keyHint');
  hint.hidden = false; cnt.hidden = false; $('#abortBtn').hidden = false;
  let n = 3; cnt.textContent = n;
  const tick = () => {
    if(--n > 0){ cnt.textContent = n; SES.timer = setTimeout(tick, 800); return; }
    cnt.hidden = true; D.frozen = false;
    if(!keepHint) hint.hidden = true;
  };
  SES.timer = setTimeout(tick, 800);
}
function runStep(st){
  const cfg = runCfg(st); SES.cur = {st, cfg};
  setMode(st.hud); setLight(st.light);
  startDrive(cfg);
  countdown(SES.seq === 0 && !EXP.practice);   // 연습이 없으면 첫 판은 키 안내를 끝까지
}

/* 연습 주행: HUD 없이 ① IC 오른쪽 진출, 앞차와 옆 차로 차만 (급정거 · 뒤차 무리 · 정체 없음). 기록은 따로 */
function practiceCard(){
  sesCard({eyebrow:'연습 주행 · 기록에 들어가지 않음', title:'조작 익히기', body:`<p class="ses-note">HUD 없이 운전해 봅니다. 차로를 <b>오른쪽으로 한 번 옮겨</b> 오른쪽 출구(용인·기흥)로 나가 보세요.</p>${KEY_HINT}`,
    btn:['연습 시작', runPractice], btn2:SES.on ? null : ['처음으로', goHome]});
}
function runPractice(){
  const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥');
  SES.cur = {practice:true, cfg:{map:m, leaf, lane:1, type:'practice', jam:0, seed:4242, sigT:0}};
  if(!SES.on){ if(S.mode !== 'off') SES.prevMode = S.mode; S.testing = true; setScreen('drive'); }
  setMode('off'); setLight('day');
  startDrive(SES.cur.cfg);
  countdown(true);
}

/* 블록 끝 질문 2개 (2026-10-29: ② '대기' 이해 질문 추가 — 로드맵 2회차). 문항은 [가정 — 파일럿에서 확인] */
const Q_TEXT = '차로를 옮길 때 얼마나 확신했나요?';
const Q2_TEXT = '옆 차로로 옮기려는데 뒤차 때문에 HUD에 기다리라는 표시가 나왔을 때, 그 뜻을 어떻게 이해했나요?';
const Q2_OPTS = ['지금 차로를 유지하고 기다린다', '브레이크를 밟아 멈춘다', '빨리 옮긴다', '표시를 못 봤다 · 모르겠다'];
function surveyCard(st){
  SES.rate = 0; SES.wait = -1;
  sesCard({eyebrow:`${st.block}/2 블록 끝 · 질문`, title:'방금 3회 주행', body:`<div class="q"><p class="q-title">1. ${Q_TEXT}</p>
      <div class="rate" id="rate">${[1,2,3,4,5].map(n => `<button data-r="${n}">${n}</button>`).join('')}</div>
      <div class="rate-ends"><span>전혀</span><span>매우</span></div></div>
    <div class="q"><p class="q-title">2. ${Q2_TEXT}</p>
      <div class="choice" id="choice">${Q2_OPTS.map((o, i) => `<button data-c="${i}"><span>${'ABCD'[i]}</span>${o}</button>`).join('')}</div></div>`,
    btn:[st.block === 1 ? '다음 블록' : '마치기', () => {
      if(!SES.rate || SES.wait < 0) return;
      const q = {p:SES.pid, block:st.block, hud:st.hud, ver:HUD_VER[st.hud], rate:SES.rate, wait:SES.wait + 1, waitText:Q2_OPTS[SES.wait], order:SES.order, at:new Date().toISOString()};
      surveys.push(q); saveArr(QKEY, surveys); SES.qs.push(q); nextStep();
    }]});
  $('#sesBtn').disabled = true; $('#sesBtn').focus();
  $$('#rate button').forEach(b => b.onclick = () => setRate(+b.dataset.r));
  $$('#choice button').forEach(b => b.onclick = () => setWait(+b.dataset.c));
}
const surveyReady = () => { $('#sesBtn').disabled = !(SES.rate && SES.wait >= 0); };
function setRate(n){ SES.rate = n; $$('#rate button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.r === n))); surveyReady(); }
function setWait(i){ SES.wait = i; $$('#choice button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.c === i))); surveyReady(); }

/* 한 판에서 뽑는 새 값 (이벤트에서): 대기 표시 시간 · 대기(또는 확인) 중 옮기기 시작한 횟수 · 이동 판단 뒤 옮기기까지 · 위험 발생 횟수.
   판단(S.G)은 어느 HUD에서든 같게 계산 — 화면에 보인 건 우리 HUD뿐(이벤트 shown) */
function eventStats(ev, tEnd){
  let waitSecs = 0, waitFrom = null, lastGo = null, goReact = null, waitMoves = 0, hazards = 0;
  ev.forEach(e => {
    if(e.type === 'gate'){
      if(e.to === 'wait' && waitFrom === null) waitFrom = e.t;
      if(e.from === 'wait' && e.to !== 'wait' && waitFrom !== null){ waitSecs += e.t - waitFrom; waitFrom = null; }
      if(e.to === 'go') lastGo = e.t;
    }
    if(e.type === 'hazardOn') hazards++;
    if(e.type === 'lcStart' && e.toward){
      if(e.gate === 'wait' || e.gate === 'clearing') waitMoves++;
      if(goReact === null && e.gate === 'go' && lastGo !== null) goReact = +(e.t - lastGo).toFixed(2);
    }
  });
  if(waitFrom !== null) waitSecs += tEnd - waitFrom;
  return {waitSecs:+waitSecs.toFixed(2), waitMoves, goReact, hazards};
}

// drive.js가 판이 끝나면 부름
function onDriveEnd(){
  if(!SES.cur) return;
  const {st, cfg, practice} = SES.cur; SES.cur = null;
  $('#keyHint').hidden = true; $('#abortBtn').hidden = true;
  const res = D.result, good = res === 'ok', ev = D.events || [], es = eventStats(ev, D.t);
  const lcN = ev.filter(e => e.type === 'lcDone').length, riskyWith = ev.filter(e => e.type === 'cutIn' && e.risky).map(e => e.with).join(' / ');
  const row = {p:SES.pid || $('#pid').value, block:st ? st.block : 0, no:st ? st.no : 0, hud:practice ? 'off' : st.hud, light:S.light, map:cfg.map.id, type:cfg.type, jam:cfg.jam, rearN:cfg.rearN, brake:cfg.brake, seed:cfg.seed,
    lane:cfg.lane + 1, dest:exitName(cfg.map.leaves[cfg.leaf].path.slice(-1)[0]), exit:D.exitName, result:res,
    change:D.changeDist, react:D.reactT, risky:D.risky, offroad:D.offroad, ped:D.ped, crash:D.crashWith || '', secs:+D.t.toFixed(2), at:new Date().toISOString(),
    // 2026-10-29 추가 (예전 기록엔 없음)
    scn:st ? st.scn : 'practice-ICR', ver:practice ? '-' : HUD_VER[st.hud], env:envName(), order:SES.order, seq:practice ? 0 : ++SES.seq, practice:!!practice,
    waitSecs:es.waitSecs, waitMoves:es.waitMoves, goReact:es.goReact, hazards:es.hazards, lcN, riskyWith, events:ev};
  if(practice){
    practices.push(row); saveArr(PKEY, practices); SES.prs.push(row);
    if(!SES.on){ S.testing = false; stopDrive(); setMode(SES.prevMode || 'ar'); }   // 처음 화면에서 한 연습: 잠금 풀고 HUD 되돌림
    sesCard({icon:good ? 'check' : 'cross', tone:good ? 'ok' : 'bad', eyebrow:'연습 주행', title:RESULT[res], body:`<p class="ses-note">${good ? '잘 나갔어요.' : '한 번 더 해 봐도 됩니다.'} 연습은 기록에 들어가지 않습니다.</p>`,
      btn:SES.on ? ['본 주행 시작', nextStep] : ['처음으로', goHome], btn2:['다시 연습', runPractice]});
    return;
  }
  drives.push(row); saveArr(DKEY, drives); SES.rows.push(row); renderLog();
  const runs = SES.steps.filter(x => x.kind === 'run'), idx = runs.indexOf(st) + 1;
  sesCard({icon:good ? 'check' : 'cross', tone:good ? 'ok' : 'bad', eyebrow:`${modeName(st.hud)} ${st.no} / 3 · 전체 ${idx} / ${runs.length}`, title:RESULT[res], body:'', btn:['다음', nextStep]});
}
function doneSession(){
  const name = `주행테스트_${SES.pid}_${today()}`, rows = SES.rows, qs = SES.qs, prs = SES.prs;
  endSession();
  const m = SES.pid.match(/^(.*?)(\d+)$/);   // 다음 참가자 번호 (P7 → P8)
  if(m){ $('#pid').value = m[1] + (+m[2] + 1); try{ localStorage.setItem(PID_KEY, $('#pid').value); }catch(e){} }
  const xl = exportBook(rows, name, qs, prs);
  setScreen('home');
  sesCard({icon:'check', tone:'ok', eyebrow:SES.pid, title:'테스트 끝', body:summaryHtml(rows) + `<p class="ses-meta">${esc(name)}.${xl ? 'xlsx' : 'csv'} 저장됨 · 기록 서랍에도 남아 있습니다.</p>`,
    btn:['다음 참가자', openSession], btn2:['엑셀 다시 저장', () => exportBook(rows, name, qs, prs)]});
}
function endSession(){
  clearTimeout(SES.timer); SES.on = false; SES.cur = null; S.testing = false;
  stopDrive(); D.frozen = false; $('#count').hidden = true; $('#keyHint').hidden = true; $('#abortBtn').hidden = true;
  lockUi(false); setMode(SES.prevMode || 'ar'); if(SES.prevLight) setLight(SES.prevLight); prepDemo(); update(1);
}
function abortRun(){
  if(!S.testing) return;
  if(!confirm(SES.on ? '주행 테스트를 그만둘까요? 지금까지 끝난 판의 기록은 남아요.' : '연습을 그만둘까요?')) return;
  if(SES.on) endSession(); else { clearTimeout(SES.timer); SES.cur = null; S.testing = false; stopDrive(); D.frozen = false; $('#count').hidden = true; $('#keyHint').hidden = true; $('#abortBtn').hidden = true; prepDemo(); update(1); }
  goHome();
}
$('#testBtn').onclick = openSession;
$('#practiceBtn').onclick = () => { stopDemo(); SES.pid = $('#pid').value; SES.order = '-'; practiceCard(); };
$('#abortBtn').onclick = abortRun;

/* ---------- 요약 · 내보내기 (D70 — 디자이너가 읽을 칸만, 2026-10-29 새 칸은 뒤에) ---------- */
const avg = a => a.length ? a.reduce((x, y) => x + y, 0)/a.length : null;
const r1 = v => v === null ? '' : Math.round(v*10)/10;
const HUDS_IN = rows => ['nav', 'ar'].filter(h => rows.some(r => hudKey(r.hud) === h));
// 차로 옮긴 곳 평균은 위험한 끼어들기 0인 판만 (D65 분석 규칙)
function summarize(rows, hud, qs = [], kind = null){
  const l = rows.filter(r => hudKey(r.hud) === hud && (!kind || kindOf(r) === kind));
  const safe = l.filter(r => !r.risky).map(marginOf).filter(v => v !== null), re = l.map(r => r.react).filter(v => v !== null && v !== undefined);
  const q = kind ? [] : qs.filter(x => hudKey(x.hud) === hud), nw = l.filter(r => r.waitMoves !== undefined);
  return {n:l.length, rate:l.length ? Math.round(l.filter(r => r.result === 'ok').length/l.length*100) : null, margin:avg(safe), react:avg(re), sure:avg(q.map(x => x.rate)),
    risky:l.reduce((a, r) => a + r.risky, 0), crash:l.filter(r => r.result === 'crash').length, sig:l.filter(r => r.result === 'signal').length, wrong:l.filter(r => r.result === 'wrong').length,
    ped:l.reduce((a, r) => a + (r.ped || 0), 0), off:l.reduce((a, r) => a + (r.offroad || 0), 0),
    waitMoves:nw.length ? nw.reduce((a, r) => a + r.waitMoves, 0) : null, waitOk:q.filter(x => x.wait).length ? q.filter(x => x.wait === 1).length + '/' + q.filter(x => x.wait).length : ''};
}
const fx1 = v => v === null ? '-' : v.toFixed(1);
function summaryHtml(rows){
  return '<div class="ses-sum">' + HUDS_IN(rows).map(h => { const s = summarize(rows, h);
    return `<div><strong>${modeName(h)}</strong>성공 <em>${s.rate === null ? '-' : s.rate + '%'}</em> · 다른 출구 <em>${s.wrong}</em><br>충돌 <em>${s.crash}</em> · 위험 끼어들기 <em>${s.risky}</em><br>대기 중 이동 <em>${s.waitMoves ?? '-'}</em></div>`; }).join('') + '</div>';
}
// 기록: 한 판 = 한 줄. 앞 11칸은 예전 그대로, 뒤는 2026-10-29 추가
const HEAD = ['참가자','HUD','시간대','맵','상황','결과','차로 옮긴 곳 (마감선 앞 m)','안전해진 뒤 옮기기까지 (초)','위험한 끼어들기 (번)','보행자 양보 안 함 (번)','도로 벗어남 (번)',
  '시나리오 ID','HUD 버전','환경 버전','제시 순서','판 순서','대기 판단 시간 (초)','대기 · 확인 중 옮기기 시작 (번)','이동 판단 뒤 옮기기까지 (초)','위험 발생 (번)','차로 변경 완료 (번)','위험한 끼어들기 상대','충돌 상대'];
const rowCells = r => [r.p, modeName(r.hud), lightName(r.light), mapLabel(r.map), situName(r), resultName(r), marginOf(r) ?? '', r.react ?? '',
  r.risky, (mapById(r.map) || {}).cw ? (r.ped ?? '') : '', r.offroad,
  r.scn ?? '', r.ver ?? '', r.env ?? '', r.order ?? '', r.seq ?? '', r.waitSecs ?? '', r.waitMoves ?? '', r.goReact ?? '', r.hazards ?? '', r.lcN ?? '', r.riskyWith ?? '', r.crash ?? ''];
const SUM_HEAD = ['HUD','판 종류','판 수','성공률 (%)','다른 출구 (판)','충돌 (판)','위험한 끼어들기 (번)','신호 위반 (판)','보행자 양보 안 함 (번)','도로 벗어남 (번)','차로 옮긴 곳 평균 (마감선 앞 m, 위험 0인 판)','안전해진 뒤 옮기기까지 평균 (초)','확신 평균 (1~5)','대기 · 확인 중 옮기기 시작 (번)','대기 이해 정답 (A / 답한 수)'];
const sumCells = (rows, qs) => HUDS_IN(rows).flatMap(h => [null, '고속도로 뒤차', '고속도로 정체', '일반도로'].map(k => { const s = summarize(rows, h, qs, k);
  return [modeName(h), k || '전체', s.n, s.rate ?? '', s.wrong, s.crash, s.risky, s.sig, s.ped, s.off, r1(s.margin), s.react === null ? '' : Math.round(s.react*100)/100, k ? '' : r1(s.sure), s.waitMoves ?? '', k ? '' : (summarize(rows, h, qs).waitOk || '')]; }));
const Q_HEAD = ['참가자','HUD','질문','답 (1 전혀 ~ 5 매우)','질문 2','답 2','HUD 버전','제시 순서'];
const qCells = q => [q.p, modeName(q.hud), Q_TEXT, q.rate, q.wait ? Q2_TEXT : '', q.wait ? `${'ABCD'[q.wait - 1]} ${q.waitText}` : '', q.ver ?? '', q.order ?? ''];
const EV_NAME = {gate:'판단 상태', hazardOn:'위험 발생', hazardOff:'위험 해소', lcStart:'차로 변경 시작', lcDone:'차로 변경 완료', lcAbort:'차로 변경 취소', cutIn:'옆 차로 진입', crash:'충돌'};
const GATE_NAME = {none:'없음', wait:'대기', clearing:'확인', go:'이동'};
const EV_HEAD = ['참가자','HUD','시나리오 ID','판 순서','시각 (초)','이벤트','내용'];
const evDetail = e => e.type === 'gate' ? `${GATE_NAME[e.from]} → ${GATE_NAME[e.to]}${e.rel ? ' · 이유 ' + ({rear:'뒤차', side:'옆 차', front:'앞 간격'})[e.rel] : ''}${e.side ? ' · ' + (e.side > 0 ? '오른쪽' : '왼쪽') : ''}${e.shown ? '' : ' (화면에 안 보임)'}`
  : e.type === 'lcStart' ? `${e.from + 1} → ${e.to + 1}차로 · 그때 판단 ${GATE_NAME[e.gate] || '-'}${e.toward ? '' : ' (목표 반대쪽)'}` : e.type === 'lcDone' ? `${e.from + 1} → ${e.to + 1}차로 · ${e.dur}초`
  : e.type === 'cutIn' ? `${e.lane + 1}차로${e.risky ? ' · 위험 (' + e.with + ')' : ''}` : e.type === 'hazardOn' ? `${e.lane + 1}차로 · ${e.with}` : e.type === 'crash' ? e.with : e.type === 'lcAbort' ? `${e.from + 1} → ${e.to + 1}차로` : '';
const evRows = rows => rows.flatMap(r => (r.events || []).map(e => [r.p, modeName(r.hud), r.scn ?? '', r.seq ?? '', e.t, EV_NAME[e.type] || e.type, evDetail(e)]));
const EXPLAIN = [['칸','뜻','어떻게 읽나'],
  ['HUD','현대 HUD = 지금 차에 있는 HUD(대조군) · 우리 HUD = 초보자용으로 만든 HUD. 어느 때의 HUD였는지는 \'HUD 버전\' 칸(빈칸 = 1차 실험 때)','같은 사람이 현대 HUD 3판 → 우리 HUD 3판 (순서 고정)'],
  ['시간대','주간 · 야간 (시나리오마다, 같은 시나리오는 두 HUD가 같은 시간대)','야간에 차이가 더 커지는지 볼 수 있음'],
  ['맵 · 상황','고속도로 ① IC 진출 · ② JC 4차로 · ③ 연속 분기 / 일반도로 ④ 이중 좌회전 · ⑤ 우회전 · 횡단보도','같은 상황끼리 HUD를 비교'],
  ['결과','성공 = 목적지 출구로 감 · 다른 출구 · 충돌(무엇과) · 시간 초과 · 신호 위반','성공률이 높을수록 좋음'],
  ['차로 옮긴 곳 (마감선 앞 m)','목표 차로에 자리 잡은 곳이 마감선보다 몇 m 앞이었나 (고속도로 갈림 25m 앞 · 일반도로 백색실선 시작). 빈칸 = 끝까지 못 옮김','클수록 미리 옮김. 위험한 끼어들기 0인 판끼리 비교'],
  ['안전해진 뒤 옮기기까지 (초)','옮길 쪽 옆 차로가 안전해진 순간(뒤차 10m 넘게 · 3.5초 안에 안 닿음, 앞차 4m · 2초)부터 옮기기 시작할 때까지. 기준은 1차 실험과 같음','2026-10-29 우리 HUD는 위험이 풀린 뒤 0.8초 안정 확인을 거쳐 이동을 보여 주므로, 이 값이 그만큼 길어질 수 있음 — 1차 수치와 바로 비교하지 말 것'],
  ['위험한 끼어들기 (번)','옆 차로에 들어갈 때 그 차로 차와 4m보다 가깝거나 2초 안에 부딪힐 상황이었던 횟수 (기준 그대로)','적을수록 좋음'],
  ['보행자 양보 안 함 (번)','⑤에서 보행자가 건너거나 건너려 할 때 횡단보도에 들어간 횟수','0이 정답'],
  ['도로 벗어남 (번)','도로 끝(가드레일 · 연석)에 닿은 횟수','적을수록 좋음'],
  ['시나리오 ID','맵-상황-시간대(D 주간 · N 야간)-교통 번호. 같은 ID = 같은 교통 · 시작 차로 · 목적지','두 HUD가 같은 ID끼리 짝'],
  ['HUD 버전 · 환경 버전','HUD 그림 버전 · 시뮬레이터 환경(그래픽 · 미러) 버전','환경 2.0(그래픽 · 미러 추가) 결과를 1차(환경 1.x)와 비교할 때 HUD만의 효과로 읽지 말 것'],
  ['대기 판단 시간 (초)','옮겨야 하는데 목표 차로가 막혀 판단이 \'대기\'였던 시간 합. 판단은 어느 HUD에서든 같게 계산(화면엔 우리 HUD만 보임)','HUD끼리 같은 교통이면 비슷해야 함'],
  ['대기 · 확인 중 옮기기 시작 (번)','판단이 대기 · 확인일 때 목표 쪽으로 차로를 넘기 시작한 횟수','적을수록 \'기다려\'를 따른 것'],
  ['이동 판단 뒤 옮기기까지 (초)','판단이 \'이동\'이 된 뒤 목표 쪽으로 옮기기 시작하기까지 (우리 HUD에선 초록 꺾쇠가 보인 뒤)','짧을수록 바로 판단'],
  ['위험 발생 (번)','옮겨야 하는 동안 목표 차로가 막힌(위험) 횟수','교통 난이도 확인용'],
  ['질문 2','블록 끝 \"기다리라는 표시를 어떻게 이해했나\" A 유지하고 기다림 · B 멈춤 · C 빨리 옮김 · D 못 봄','A가 의도한 이해. [가정] 문항 — 파일럿에서 확인'],
  ['이벤트 시트','판마다 판단 상태 전환 · 위험 발생/해소 · 차로 변경 시작/완료 · 옆 차로 진입 · 충돌 시각','장면별로 다시 볼 때'],
  ['연습 시트','본 실험 전 연습 주행(HUD 없음). 요약 · 기록에는 들어가지 않음','']];
const toCsv = rows => rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
function download(text, name, type){
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
// 엑셀(.xlsx): 요약 · 기록 · 질문 · 이벤트 · 연습 · 설명. SheetJS를 못 불러오면 CSV로
function exportBook(rows, name, qs = [], prs = []){
  const sheets = [['요약', [SUM_HEAD, ...sumCells(rows, qs)]], ['기록', [HEAD, ...rows.map(rowCells)]], ['질문', [Q_HEAD, ...qs.map(qCells)]],
    ['이벤트', [EV_HEAD, ...evRows(rows)]], ['연습', [HEAD, ...prs.map(rowCells)]], ['설명', EXPLAIN]];
  if(window.XLSX){
    const wb = XLSX.utils.book_new();
    sheets.forEach(([n, aoa]) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = aoa[0].map((_, c) => ({wch:Math.min(48, Math.max(8, ...aoa.map(r => String(r[c] ?? '').length*1.6)))})); XLSX.utils.book_append_sheet(wb, ws, n); });
    XLSX.writeFile(wb, name + '.xlsx'); return true;
  }
  download('﻿' + sheets.map(([, aoa]) => toCsv(aoa)).join('\n\n'), name + '.csv', 'text/csv;charset=utf-8'); return false;
}
// 예전 클릭 판단 테스트 기록(6주까지) — 새 기록과 섞지 않고 따로 CSV로
function oldCsv(){
  const jamName = j => ({0:'없음',1:'보통',2:'심함'})[j] ?? '-', rows = [['참가자','HUD','시간대','맵','상황','정답','선택','선택지 수','결과','판단시간(초)','기록시각']];
  loadArr(OLD_KEY).forEach(t => {
    const dg = t.type === 'danger';
    rows.push([t.p, modeName(t.mode), t.light === 'night' ? '야간' : '주간', mapLabel(t.map), dg ? '뒤차' : jamName(t.jam), dg ? (t.rearDanger ? '대기' : '이동') : KEY_WORD[t.target],
      dg ? (t.choice === 'wait' ? '대기' : '이동') : KEY_WORD[t.choice], t.n, t.correct ? '정답' : '오답', (t.ms/1000).toFixed(3), t.at]);
  });
  return rows;
}

/* ---------- 기록 서랍 ---------- */
function renderLog(){
  $('#logCount').textContent = drives.length;
  $('#logEmpty').hidden = drives.length > 0;
  $('#logBody').innerHTML = drives.slice().reverse().map(r => {
    const m = mapById(r.map);
    return `<tr><td>${esc(r.p)}</td><td>${modeShort(r.hud)}</td><td>${lightName(r.light)}</td><td>${m ? m.no : '-'}</td><td>${situName(r)}</td><td class="${r.result === 'ok' ? 'ok' : 'bad'}">${resultName(r)}</td><td>${marginOf(r) ?? '-'}</td><td>${r.react ?? '-'}</td><td>${r.risky}</td><td>${r.waitMoves ?? '-'}</td></tr>`;
  }).join('');
  $('#summary').innerHTML = HUDS_IN(drives).map(h => { const s = summarize(drives, h);
    return `<div><strong>${modeShort(h)}</strong>${s.n}판 · 성공 <em>${s.rate === null ? '-' : s.rate + '%'}</em><br>위험 <em>${s.risky}</em> · 충돌 <em>${s.crash}</em></div>`; }).join('');
  $('#oldCsv').hidden = !loadArr(OLD_KEY).length;
}
$('#logBtn').onclick = () => $('#drawer').classList.toggle('open');
$('#closeDrawer').onclick = () => $('#drawer').classList.remove('open');
$('#allXlsx').onclick = () => exportBook(drives, `주행테스트_전체_${today()}`, surveys, practices);
$('#oldCsv').onclick = () => download('﻿' + toCsv(oldCsv()), `판단테스트_클릭기록_${today()}.csv`, 'text/csv;charset=utf-8');
$('#clearLog').onclick = () => { if(confirm('주행 테스트 기록을 모두 지울까요? (연습 · 예전 클릭 기록은 그대로)')){ drives = []; surveys = []; saveArr(DKEY, drives); saveArr(QKEY, surveys); renderLog(); } };

/* ---------- 방향키 · 단축키 ---------- */
const ARROW = {ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down'};
addEventListener('keydown', e => {
  if(e.target.tagName === 'INPUT'){ if(e.key === 'Enter' && e.target.id === 'sesPid'){ e.preventDefault(); $('#sesBtn').click(); } return; }
  if(ARROW[e.key] && S.testing){ e.preventDefault(); KEYS[ARROW[e.key]] = true; return; }
  if(e.key === 'Escape' && S.testing){ abortRun(); return; }
  if(/^[1-5]$/.test(e.key) && $('#rate')){ setRate(+e.key); return; }
  if(/^[a-dA-D]$/.test(e.key) && $('#choice')){ setWait('abcd'.indexOf(e.key.toLowerCase())); return; }
  if(e.key === 'Enter' && !$('#sess').hidden && !e.repeat && !$('#sesBtn').disabled){ e.preventDefault(); $('#sesBtn').click(); }
});
addEventListener('keyup', e => { if(ARROW[e.key]) KEYS[ARROW[e.key]] = false; });
addEventListener('blur', () => Object.keys(KEYS).forEach(k => KEYS[k] = false));

try{ const np = localStorage.getItem(PID_KEY); if(np) $('#pid').value = np; }catch(e){}
renderExp(); renderLog();
