/* ============================================================
   session.js — 주행 테스트 진행 · 기록 · 내보내기 (2026-10-29 개편, 예전 D60 · D64 · D65 · D68 · D70 위에)
   흐름(3차, 2026-11-17 밤 ~): 참가자 정보 → 안내 모션그래픽(intro.js — 연습 주행은 없앰) → 현대 · 리뉴얼을 판마다 교대로 6판 → 질문(현대: 확신 / 리뉴얼: 확신 + 대기 표시 이해) → 요약 + 엑셀 자동 저장
   흐름(2차까지): 참가자 정보 → (연습 주행) → HUD A 3회 → 질문 → HUD B 3회 → 질문 → 요약 + 엑셀 자동 저장
   · 비교 (2026-11-03 두 번째 개정, 2차 실험): 현대 HUD(nav, 1차 그대로) 3회 · 리뉴얼 HUD 2차(ar2, 2.1) 3회. 순서는 늘 현대 → 2차로 고정 (2026-11-04 사용자: 참가자 번호 홀수 · 짝수 교대를 없앰).
     1차 HUD(ar, v1.9)는 실험 조건에서 빠지고 시연에서만 열어 볼 수 있음. 'HUD 버전' 칸: 현대 3.3 · 리뉴얼 2.1-A/B (1차 기록의 '리뉴얼 HUD'는 빈칸 = v1.7~1.9)
   · 시나리오(맵 · 상황 · 시간대 · 교통 번호 · 시작 차로 · 목적지 · 신호 시각)는 짝마다 한 번 정해 두 HUD 블록이 그대로 다시 씀
     → HUD만 다르고 교통은 같다 (예전엔 블록마다 교통 번호 · 목적지를 새로 뽑았음)
   · 연습 주행은 2026-11-17 밤에 없앴다(사용자: 조작 · 내용은 안내 모션그래픽이 알려 주므로). 예전 연습 기록(hud-drive-practice-v1)은 지우지 않고, 남아 있으면 '엑셀 (전체)'의 '연습' 시트로만 나간다
   · 예전 기록 · 엑셀 칸은 그대로 두고 새 칸을 뒤에 붙임. 예전 기록의 새 칸은 빈칸
   방향키 · 기록 서랍도 여기. main.js 다음에 로드.
   ============================================================ */

const DKEY = 'hud-drive-v1', OLD_KEY = 'hud-mvp-trials-v2', BAG_KEY = 'hud-drive-mapbag', PID_KEY = 'hud-drive-nextpid', QKEY = 'hud-drive-survey-v1', PKEY = 'hud-drive-practice-v1';
const loadArr = k => { try{ const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; }catch(e){ return []; } };
const saveArr = (k, v) => { try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} };
let drives = loadArr(DKEY), surveys = loadArr(QKEY), practices = loadArr(PKEY);
const shuffle = (a, R = Math.random) => { for(let i=a.length-1;i>0;i--){ const j = Math.floor(R()*(i+1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// HUD 이름. 'ar' = 1차 실험 때 리뉴얼 HUD(개선 전) — 1차 기록의 '리뉴얼 HUD'와 같은 HUD. 'ar2' = 개선 후(2026-11-03). 'HUD 버전' 칸이 비어 있으면 1차 실험 기록
const hudKey = h => h;
const modeName = m => ({ar:'리뉴얼 HUD (1차)', ar2:'리뉴얼 HUD (2차)', ar3:'리뉴얼 HUD', nav:'현대 HUD', off:'HUD 없음'})[m] || m;   // 3차 실험 조건(ar3)이 '리뉴얼 HUD'. 1 · 2차는 예전 기록 구분용
const modeShort = m => ({ar:'1차', ar2:'2차', ar3:'리뉴얼', nav:'현대'})[m] || m;
const hudVerOf = m => m === 'ar2' ? HUD_VER.ar2 + '-' + (S.tone || 'A') : HUD_VER[m] || '';   // 2차만 마감(A 절제 · B 선명)을 뒤에 붙임
const orderText = (o, pair = EXP.pair) => o === 'ALT' ? `${modeShort(pair[0])} · ${modeShort(pair[1])} 교대 (${modeShort(pair[0])} 먼저)` : o === 'AB' ? `${modeShort(pair[0])} → ${modeShort(pair[1])}` : o === 'BA' ? `${modeShort(pair[1])} → ${modeShort(pair[0])}` : o || '';
const RESULT = {ok:'성공', wrong:'다른 출구', crash:'충돌', timeout:'시간 초과', signal:'신호 위반'};   // 신호 위반: 일반도로(D69)
const CITY_SITU = {CL2:'좌회전 대기 줄 · 신호', CRT:'정류장 버스 · 보행자'};
const situName = r => (r.type === 'practice' ? '연습' : r.type === 'city' ? (r.work ? '공사 구간 · ' : '') + (CITY_SITU[r.map] || '일반도로') : r.type === 'jam' ? ({1:'정체 보통(예전)', 2:'정체 심함(예전)'}[r.jam] || '정체') : `뒤차 ${r.rearN}대`) + (r.brake ? ' · 앞차 급정거' : '');
const kindOf = r => r.type === 'city' ? '일반도로' : r.type === 'jam' ? '고속도로 정체' : r.type === 'practice' ? '연습' : '고속도로 뒤차';
const lightName = l => l === 'night' ? '야간' : '주간';
const resultName = r => r.result === 'crash' && r.crash ? `충돌 (${r.crash.split(' · ')[0]})` : RESULT[r.result];
// 차로 옮긴 곳 = 목표 차로에 자리 잡은 곳이 '마감선' 몇 m 앞인가 (기준 그대로). change = 갈림 앞 m, 마감선 = 갈림 25m 앞(고속도로) · 35m 앞(일반도로) → 마감선 앞 = change − 25 (· 35)
// 2026-11-03 고침: 1차 실험 때 코드(470a8f7)는 change − (FORK_Z − changeEnd) = change + 25로 부호가 뒤집혀 있었음 → 1차 엑셀의 이 칸은 고속도로 +50m · 일반도로 +70m 치우침
// (저장된 change 값은 맞음 — 브라우저 기록을 다시 내보내면 바른 값). 1차 문서 수치는 그대로 두고 04_실험로그 EXP-01에 적어 둠
// ce: 그 판의 마감선 z(2026-11-17 밤부터 기록에 남김 — ⑤에 공사 구간이 생겨 마감선이 -195 → -100으로 바뀜). 없는 예전 기록은 그때 값(백색실선 시작 · 고속도로 갈림 25m 앞)
const marginOf = r => { if(r.change === null || r.change === undefined) return null; const m = mapById(r.map) || MAPS_OFF.find(o => o.id === r.map), ce = r.ce !== undefined && r.ce !== null ? r.ce : ((m && m.changeEnd) || CHANGE_END); return Math.round(r.change - (ce - FORK_Z)); };
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const envName = () => `환경 ${ENV_VER} · 미러 ${MIR.on ? '켬' : '끔'}`;

/* ---------- 실험 설정 ---------- */
// 비교 쌍 A = 현대 · B = 리뉴얼(3차). 맨 앞은 안내 모션그래픽(intro.js TOUR) — 연습 주행은 2026-11-17 밤에 없앰
const EXP = {pair:['nav', 'ar3'], alternate:true};   // 3차 실험(2026-11-17 ~): 현대 HUD 3회 · 리뉴얼 HUD(3.0) 3회
// 제시 순서: 늘 현대 먼저('AB'). 2026-11-03엔 참가자 번호 홀수 AB · 짝수 BA로 교대했으나 2026-11-04 사용자가 고정을 택함 (짝수 참가자에게 2차가 먼저 나와 혼란). 순서 효과는 상쇄되지 않으므로 분석 때 참고
// 3차 실험(2026-11-17, 피그마 '3차 검증 계획'): **판마다 교대**('ALT') — 연습 → 현대 → 리뉴얼 → 현대 → 리뉴얼 → 현대 → 리뉴얼. 2차의 한계였던 '현대 3판 뒤 리뉴얼 3판'(익숙해진 효과가 리뉴얼에 몰림)을 없애려는 것.
// 첫 판은 모든 참가자 현대 HUD [가정 — 참가자마다 첫 HUD를 바꿀지는 사용자 판단]. 예전 블록 방식은 EXP.alternate = false
const orderFor = pid => { void pid; return EXP.alternate ? 'ALT' : 'AB'; };

/* ---------- 진행 순서 ---------- */
const SES = {on:false, pid:'', steps:[], i:-1, rows:[], qs:[], order:'AB', cur:null, timer:0, seq:0};
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
  if(order === 'ALT'){
    // 판마다 교대. 두 HUD가 같은 장면 3개를 한 번씩 — 같은 장면이 연달아 나오지 않게 둘째 HUD의 순서는 첫째를 두 칸 민 것(X Z Y X Z Y)
    const a = shuffle(scns.slice()), b = [a[2], a[0], a[1]], runs = [];
    a.forEach((p, i) => { runs.push({kind:'run', hud:EXP.pair[0], block:1, no:i + 1, ...p}); runs.push({kind:'run', hud:EXP.pair[1], block:2, no:i + 1, ...b[i]}); });
    return [{kind:'tour'}, ...runs, {kind:'survey', hud:EXP.pair[0], block:1}, {kind:'survey', hud:EXP.pair[1], block:2}, {kind:'done'}];
  }
  return [{kind:'tour'}, ...block(h1, 1), {kind:'survey', hud:h1, block:1}, ...block(h2, 2), {kind:'survey', hud:h2, block:2}, {kind:'done'}];
}
function runCfg(st){ return {map:mapById(st.map), leaf:st.leaf, lane:st.lane, type:st.type, jam:st.jam, seed:st.seed, sigT:st.sigT}; }

/* ---------- 카드 · 카운트다운 ---------- */
// 카드 움직임(styles.css): 처음 뜰 때 = 뒤가 어두워지며 카드가 조금 위로 올라옴 / 이미 떠 있던 카드의 다음 단계 = 내용만 옆으로 밀리며 바뀜(.swap) / 처음 화면 카드에서 넘어올 때 = 뒤 어둡기는 그대로(.keep)
function sesCard({icon = '', tone = '', eyebrow = '', title, body = '', btn, btn2}){
  const box = $('#sess'), card = box.querySelector('.card'), swap = !box.hidden, keep = swap || !$('#intro').hidden;
  $('#sesIcon').innerHTML = icon ? ico(icon) : ''; $('#sesIcon').className = icon ? 'card-icon ' + tone : '';
  $('#sesEyebrow').textContent = eyebrow; $('#sesTitle').textContent = title; $('#sesBody').innerHTML = body;
  const b1 = $('#sesBtn'), b2 = $('#sesBtn2');
  [b1, b2].forEach(unTick);
  b1.textContent = btn[0]; b1.onclick = btn[1]; b1.disabled = false;
  b2.hidden = !btn2; if(btn2){ b2.textContent = btn2[0]; b2.onclick = btn2[1]; }
  box.classList.toggle('keep', keep); card.classList.remove('swap');
  $('#intro').hidden = true; box.hidden = false;
  if(swap){ void card.offsetWidth; card.classList.add('swap'); }
  const inp = $('#sesPid'); (inp ? inp : b1).focus();
}
const hideCard = () => { $('#sess').hidden = true; };
// 엑셀 저장이 끝나면 그 버튼 자리에 짧은 체크(1.4초 뒤 원래 글자로) — styles.css .btn.saved
function savedTick(b){
  if(!b) return; unTick(b); b.dataset.label = b.innerHTML;
  b.innerHTML = ico('check') + '저장됨'; b.classList.add('saved');
  b._tick = setTimeout(() => unTick(b), 1400);
}
function unTick(b){ clearTimeout(b._tick); if(b.dataset.label !== undefined){ b.innerHTML = b.dataset.label; delete b.dataset.label; } b.classList.remove('saved'); }

function lockUi(on){
  $('#setup').classList.toggle('locked', on);
  $$('#scenario button, #modeSeg button, #lightSeg button').forEach(b => b.disabled = on);
  if(!on && S.map && S.map.city) $$('#jamSeg button').forEach(b => b.disabled = true);
}

/* ---------- 흐름 ---------- */
function openSession(){
  stopDemo(); openSetup(false); setScreen('prep'); TOUR.preload();   // 안내 모션그래픽을 미리 그려 둔다(참가자 번호를 적는 동안)
  const pid = $('#pid').value || 'P1';
  sesCard({eyebrow:'주행 테스트', title:'참가자 정보', body:`<label class="pid">참가자 ID<input type="text" id="sesPid" value="${esc(pid)}" autocomplete="off"></label>
`,
    btn:['시작', beginSession], btn2:['뒤로', goHome]});
}
function beginSession(){
  SES.pid = ($('#sesPid').value || 'P1').trim(); $('#pid').value = SES.pid;
  SES.order = orderFor(SES.pid);
  SES.on = true; S.testing = true; SES.prevMode = S.mode; SES.prevLight = S.light; SES.steps = buildSteps(SES.order); SES.i = -1; SES.rows = []; SES.qs = []; SES.seq = 0;
  lockUi(true); setScreen('drive'); nextStep();
}
function nextStep(){
  const st = SES.steps[++SES.i];
  if(st.kind === 'run') runStep(st);
  else if(st.kind === 'tour'){ hideCard(); $('#abortBtn').hidden = true; TOUR.show(nextStep); }   // 안내 모션그래픽 — 마지막 장면의 '주행 시작'에서 첫 판으로
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
  countdown(SES.seq === 0);   // 키 안내: 첫 판은 끝까지 보여 준다(연습 주행이 없으므로), 그 뒤는 3 · 2 · 1 동안만
}

/* 질문: ① 확신 1~5(1차와 같음). 2차(2026-11-07 밤 ~)에는 ②를 뺐다(사용자: 뜻이 없어 삭제). 3차는 리뉴얼 HUD에만 ② 대기 표시 이해를 다시 묻는다(Q2_TEXT3).
   Q2_TEXT는 예전 기록(2026-11-03 ~ 11-07)의 '질문' 시트를 읽을 때만 쓴다. 판마다 교대(ALT)면 여섯 판이 모두 끝난 뒤 현대 → 리뉴얼 순서로 묻는다 */
const Q_TEXT = '차로를 옮길 때 얼마나 확신했나요?';
const Q2_TEXT = '옆 차로로 옮기려는데 뒤차 때문에 HUD에 \'기다려\' 표시가 나왔을 때, 그 표시를 봤나요? 봤다면 어떤 뜻으로 읽었나요?';
const Q2_OPTS = ['봤다 · 지금 차로를 유지하고 기다린다', '봤다 · 브레이크를 밟아 멈춘다', '봤다 · 빨리 옮긴다', '못 봤다 · 모르겠다'];
// 3차(2026-11-17, 피그마 '3차 검증 계획 — 질문: 확신 + 대기 표시 이해 1문항'): 리뉴얼 HUD 질문에만 ② 기다려 표시(화살표 옆의 빨간 금지 표시)를 어떻게 읽었는지. 뜻은 알려 주지 않고 모양만 말한다. 문장 [가정 — 사용자 확인 대기, 2026-11-18 표시가 바뀌어 고침]
const Q2_TEXT3 = '옆 차로로 옮기려는데 뒤차가 가까워서 HUD 위쪽 화살표 옆에 빨간 금지 표시가 나왔을 때, 그 표시를 봤나요? 봤다면 어떤 뜻으로 읽었나요?';
const HUD_HINT = {nav:'화살표와 차로 칸이 나오던 화면', ar3:'미니 도로에 들어갈 차로가 색으로 칠해져 있던 화면'};
function surveyCard(st){
  SES.rate = 0; SES.wait = -1;
  const two = st.hud === 'ar3', alt = SES.order === 'ALT';
  sesCard({eyebrow:`${st.block} / 2`, title:'질문', body:(alt ? `<p class="lead"><b>${modeName(st.hud)}</b>(${HUD_HINT[st.hud] || ''})로 달린 3번을 떠올려 답해 주세요.</p>` : '') + `<div class="q"><p class="q-title">${two ? '1. ' : ''}${Q_TEXT}</p>
      <div class="rate" id="rate">${[1,2,3,4,5].map(n => `<button data-r="${n}">${n}</button>`).join('')}</div>
      <div class="rate-ends"><span>전혀</span><span>매우</span></div></div>` + (two ? `
    <div class="q"><p class="q-title">2. ${Q2_TEXT3}</p>
      <div class="choice" id="choice">${Q2_OPTS.map((o, i) => `<button data-c="${i}"><span>${'ABCD'[i]}</span>${o}</button>`).join('')}</div></div>` : ''),
    btn:[st.block === 1 ? (alt ? '다음 질문' : '다음 블록') : '마치기', () => {
      if(!SES.rate || (two && SES.wait < 0)) return;
      const q = {p:SES.pid, block:st.block, hud:st.hud, ver:hudVerOf(st.hud), rate:SES.rate, wait:two ? SES.wait + 1 : 0, ...(two ? {waitText:Q2_OPTS[SES.wait], q2:Q2_TEXT3} : {}), order:SES.order, at:new Date().toISOString()};   // wait 0 = ② 문항 없음
      surveys.push(q); saveArr(QKEY, surveys); SES.qs.push(q); nextStep();
    }]});
  SES.two = two;
  $('#sesBtn').disabled = true; $('#sesBtn').focus();
  $$('#rate button').forEach(b => b.onclick = () => setRate(+b.dataset.r));
  $$('#choice button').forEach(b => b.onclick = () => setWait(+b.dataset.c));
}
const surveyReady = () => { $('#sesBtn').disabled = !(SES.rate && (!SES.two || SES.wait >= 0)); };
function setRate(n){ SES.rate = n; $$('#rate button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.r === n))); surveyReady(); }
function setWait(i){ SES.wait = i; $$('#choice button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.c === i))); surveyReady(); }

/* 한 판에서 뽑는 새 값 (이벤트에서): 대기 표시 시간 · 대기(또는 확인) 중 옮기기 시작한 횟수 · 이동 판단 뒤 옮기기까지 · 위험 발생 횟수.
   판단(S.G)은 어느 HUD에서든 같게 계산 — 화면에 보인 건 리뉴얼 HUD뿐(이벤트 shown) */
function eventStats(ev, tEnd){
  let waitSecs = 0, waitFrom = null, lastGo = null, goReact = null, waitMoves = 0, hazards = 0, lcState = null;
  ev.forEach(e => {
    if(e.type === 'gate'){
      if(e.to === 'wait' && waitFrom === null) waitFrom = e.t;
      if(e.from === 'wait' && e.to !== 'wait' && waitFrom !== null){ waitSecs += e.t - waitFrom; waitFrom = null; }
      if(e.to === 'go') lastGo = e.t;
    }
    if(e.type === 'hazardOn') hazards++;
    if(e.type === 'lcStart' && e.toward){
      if(lcState === null && e.hs) lcState = e.hs;   // 목표 쪽으로 처음 옮기기 시작한 순간의 리뉴얼 HUD 상태
      if(e.gate === 'wait' || e.gate === 'clearing') waitMoves++;
      if(goReact === null && e.gate === 'go' && lastGo !== null) goReact = +(e.t - lastGo).toFixed(2);
    }
  });
  if(waitFrom !== null) waitSecs += tEnd - waitFrom;
  return {waitSecs:+waitSecs.toFixed(2), waitMoves, goReact, hazards, lcState};
}

// drive.js가 판이 끝나면 부름
function onDriveEnd(){
  if(!SES.cur) return;
  const {st, cfg} = SES.cur, practice = false; SES.cur = null;   // practice: 연습 주행을 없앤 뒤로 늘 false(기록의 '연습 여부' 칸은 예전 기록과 맞추려고 남김)
  $('#keyHint').hidden = true; $('#abortBtn').hidden = true;
  const res = D.result, good = res === 'ok', ev = D.events || [], es = eventStats(ev, D.t);
  const lcN = ev.filter(e => e.type === 'lcDone').length, riskyWith = ev.filter(e => e.type === 'cutIn' && e.risky).map(e => e.with).join(' / ');
  const row = {p:SES.pid || $('#pid').value, block:st ? st.block : 0, no:st ? st.no : 0, hud:practice ? 'off' : st.hud, light:S.light, map:cfg.map.id, ce:changeEndOf(cfg.map), ...(cfg.map.work ? {work:true} : {}), type:cfg.type, jam:cfg.jam, rearN:cfg.rearN, brake:cfg.brake, seed:cfg.seed,
    lane:cfg.lane + 1, dest:exitName(cfg.map.leaves[cfg.leaf].path.slice(-1)[0]), exit:D.exitName, result:res,
    change:D.changeDist, react:D.reactT, risky:D.risky, offroad:D.offroad, ped:D.ped, crash:D.crashWith || '', secs:+D.t.toFixed(2), at:new Date().toISOString(),
    // 2026-10-29 추가 (예전 기록엔 없음)
    scn:st ? st.scn : 'practice-ICR', ver:practice ? '-' : hudVerOf(st.hud), env:envName(), order:SES.order, seq:practice ? 0 : ++SES.seq, practice:!!practice,
    waitSecs:es.waitSecs, waitMoves:es.waitMoves, goReact:es.goReact, hazards:es.hazards, lcN, riskyWith, events:ev,
    cutAhead:D.cutAhead, cutAheadGap:D.cutAheadGap, cutAheadTtc:D.cutAheadTtc,   // 2026-11-03 앞으로 끼어들기
    blinkUsed:D.blinkUsed, blinkLead:D.blinkLead, blinkResp:D.blinkResp,   // 2026-11-07 깜빡이 (D103)
    lcState:es.lcState,   // 2026-11-17 차로를 옮기기 시작한 순간의 리뉴얼 HUD 상태(1 ~ 6)
    aeb:D.aebN,   // 2026-11-18 자동 급제동 횟수(D134 — 환경 3.3부터, 어느 HUD든 같게 작동)
    ppc:+SCR.ppc().toFixed(2) + (SCR.calibrated() ? '' : ' (기본값)'), dist:SCR.distCm, vfov:camera.fov, hudPx:LAY && LAY.hud ? `${Math.round(LAY.hud.w)} × ${Math.round(LAY.hud.h)} (눈에서 ${LAY.hud.eyeDegW.toFixed(1)}°)` : ''};   // 2026-11-07 밤 화면 맞추기 (D116)
  drives.push(row); saveArr(DKEY, drives); SES.rows.push(row); renderLog();
  const runs = SES.steps.filter(x => x.kind === 'run'), idx = runs.indexOf(st) + 1;
  sesCard({icon:good ? 'check' : 'cross', tone:good ? 'ok' : 'bad', eyebrow:`${idx} / ${runs.length}`, title:RESULT[res], body:'', btn:['다음', nextStep]});
}
function doneSession(){
  const name = `주행테스트_${SES.pid}_${today()}`, rows = SES.rows, qs = SES.qs;
  endSession();
  const m = SES.pid.match(/^(.*?)(\d+)$/);   // 다음 참가자 번호 (P7 → P8)
  if(m){ $('#pid').value = m[1] + (+m[2] + 1); try{ localStorage.setItem(PID_KEY, $('#pid').value); }catch(e){} }
  const xl = exportBook(rows, name, qs);
  setScreen('home');
  sesCard({icon:'check', tone:'ok', eyebrow:SES.pid, title:'끝', body:summaryHtml(rows) + `<p class="ses-meta">${esc(name)}.${xl ? 'xlsx' : 'csv'}</p>`,
    btn:['다음 참가자', openSession], btn2:['엑셀 다시 저장', () => { exportBook(rows, name, qs); savedTick($('#sesBtn2')); }]});
}
function endSession(){
  clearTimeout(SES.timer); SES.on = false; SES.cur = null; S.testing = false; TOUR.hide();
  stopDrive(); D.frozen = false; $('#count').hidden = true; $('#keyHint').hidden = true; $('#abortBtn').hidden = true;
  lockUi(false); setMode(SES.prevMode || 'ar3'); if(SES.prevLight) setLight(SES.prevLight); prepDemo(); update(1);
}
function abortRun(){
  if(!S.testing) return;
  if(!confirm('주행 테스트를 그만둘까요? 지금까지 끝난 판의 기록은 남아요.')) return;
  if(SES.on) endSession(); else { clearTimeout(SES.timer); SES.cur = null; S.testing = false; stopDrive(); D.frozen = false; $('#count').hidden = true; $('#keyHint').hidden = true; $('#abortBtn').hidden = true; prepDemo(); update(1); }
  goHome();
}
$('#testBtn').onclick = openSession;
$('#abortBtn').onclick = abortRun;

/* ---------- 요약 · 내보내기 (D70 — 디자이너가 읽을 칸만, 2026-10-29 새 칸은 뒤에) ---------- */
const avg = a => a.length ? a.reduce((x, y) => x + y, 0)/a.length : null;
const r1 = v => v === null ? '' : Math.round(v*10)/10;
const HUDS_IN = rows => ['nav', 'ar', 'ar2', 'ar3'].filter(h => rows.some(r => hudKey(r.hud) === h));
// 차로 옮긴 곳 평균은 위험한 끼어들기 0인 판만 (D65 분석 규칙)
function summarize(rows, hud, qs = [], kind = null){
  const l = rows.filter(r => hudKey(r.hud) === hud && (!kind || kindOf(r) === kind));
  const safe = l.filter(r => !r.risky).map(marginOf).filter(v => v !== null), re = l.map(r => r.react).filter(v => v !== null && v !== undefined);
  const q = kind ? [] : qs.filter(x => hudKey(x.hud) === hud), nw = l.filter(r => r.waitMoves !== undefined);
  return {n:l.length, rate:l.length ? Math.round(l.filter(r => r.result === 'ok').length/l.length*100) : null, margin:avg(safe), react:avg(re), sure:avg(q.map(x => x.rate)),
    risky:l.reduce((a, r) => a + r.risky, 0), crash:l.filter(r => r.result === 'crash').length, sig:l.filter(r => r.result === 'signal').length, wrong:l.filter(r => r.result === 'wrong').length,
    ped:l.reduce((a, r) => a + (r.ped || 0), 0), off:l.reduce((a, r) => a + (r.offroad || 0), 0),
    waitMoves:nw.length ? nw.reduce((a, r) => a + r.waitMoves, 0) : null, aeb:l.some(r => r.aeb !== undefined) ? l.reduce((a, r) => a + (r.aeb || 0), 0) : null, waitOk:q.filter(x => x.wait).length ? q.filter(x => x.wait === 1).length + '/' + q.filter(x => x.wait).length : ''};
}
function summaryHtml(rows){
  return '<div class="ses-sum">' + HUDS_IN(rows).map(h => { const s = summarize(rows, h);
    return `<div><strong>${modeName(h)}</strong>성공 <em>${s.rate === null ? '-' : s.rate + '%'}</em> · 다른 출구 <em>${s.wrong}</em><br>충돌 <em>${s.crash}</em> · 위험 끼어들기 <em>${s.risky}</em><br>대기 중 이동 <em>${s.waitMoves ?? '-'}</em></div>`; }).join('') + '</div>';
}
// 기록: 한 회 = 한 줄. 앞 11칸은 1차 실험 그대로(정의 · 순서 바꾸지 않음), 뒤는 2026-10-29 추가(시나리오 ~ 충돌 상대), 맨 뒤 '연습 여부'는 2026-11-03 추가
const HEAD = ['참가자','HUD','시간대','맵','상황','결과','차로 옮긴 곳 (마감선 앞 m)','안전해진 뒤 옮기기까지 (초)','위험한 끼어들기 (번)','보행자 양보 안 함 (번)','도로 벗어남 (번)',
  '시나리오 ID','HUD 버전','환경 버전','제시 순서','판 순서','대기 판단 시간 (초)','대기 · 확인 중 옮기기 시작 (번)','이동 판단 뒤 옮기기까지 (초)','위험 발생 (번)','차로 변경 완료 (번)','위험한 끼어들기 상대','충돌 상대','연습 여부','정체 줄 합류 방식','앞으로 끼어들기 (번)','그때 뒤차 간격 (m)','그때 닿기까지 (초)',
  '깜빡이 켬 (차로 변경 때)','깜빡이 → 차선 넘기 시작 (초)','옮길 차로 뒤차 반응',   // 2026-11-07 깜빡이 (D103)
  '화면 1cm당 px','보는 거리 (cm)','장면 세로 시야각 (°)','HUD 상자 (px)',
  '옮기기 시작 때 리뉴얼 HUD 상태',
  '자동 급제동 (번)'];   // 2026-11-18 (D134): 환경 3.3부터. 그 전 기록은 빈칸   // 2026-11-17 3차: 01 안전 · 02 주의 · 03 대기 · 04 확인 · 05 이동 · 06 앞쪽 위험   // 2026-11-07 밤 화면 맞추기 (D116) — HUD가 참가자 눈에 몇 도로 보였는지 되짚을 수 있게
// 정체 판 성공이 '줄 합류'였는지, 줄을 건너뛰고 갈림 뒤에 출구로 들어갔는지 (2026-11-03 — 자동 운전에서 후자가 '성공 · 옮긴 곳 빈칸 · 반응 빈칸'으로 남는 것을 확인, 결과 정의는 바꾸지 않고 칸만 추가)
const jamJoinOf = r => r.type !== 'jam' ? '' : r.result !== 'ok' ? '' : /줄 합류$/.test(r.exit || '') ? '줄 합류' : '줄 건너뜀 (갈림 뒤 진입)';
const rowCells = r => [r.p, modeName(r.hud), lightName(r.light), mapLabel(r.map), situName(r), resultName(r), marginOf(r) ?? '', r.react ?? '',
  r.risky, (mapById(r.map) || {}).cw ? (r.ped ?? '') : '', r.offroad,
  r.scn ?? '', r.ver ?? '', r.env ?? '', orderText(r.order), r.seq ?? '', r.waitSecs ?? '', r.waitMoves ?? '', r.goReact ?? '', r.hazards ?? '', r.lcN ?? '', r.riskyWith ?? '', r.crash ?? '', r.practice ? '연습' : r.scn ? '본 실험' : '', jamJoinOf(r), r.cutAhead ?? '', r.cutAheadGap ?? '', r.cutAheadTtc ?? '',
  r.blinkUsed === undefined ? '' : r.blinkUsed === null ? '(안 옮김)' : r.blinkUsed ? '켬' : '안 켬', r.blinkLead ?? '', r.blinkResp ?? '',
  r.ppc ?? '', r.dist ?? '', r.vfov ?? '', r.hudPx ?? '', r.lcState === undefined ? '' : r.lcState === null ? '(안 옮김)' : h3Label(r.lcState), r.aeb ?? ''];
const SUM_HEAD = ['HUD','판 종류','판 수','성공률 (%)','다른 출구 (판)','충돌 (판)','위험한 끼어들기 (번)','신호 위반 (판)','보행자 양보 안 함 (번)','도로 벗어남 (번)','차로 옮긴 곳 평균 (마감선 앞 m, 위험 0인 판)','안전해진 뒤 옮기기까지 평균 (초)','확신 평균 (1~5)','대기 · 확인 중 옮기기 시작 (번)','대기 이해 정답 (A / 답한 수)','자동 급제동 (번)'];
const sumCells = (rows, qs) => HUDS_IN(rows).flatMap(h => [null, '고속도로 뒤차', '고속도로 정체', '일반도로'].map(k => { const s = summarize(rows, h, qs, k);
  return [modeName(h), k || '전체', s.n, s.rate ?? '', s.wrong, s.crash, s.risky, s.sig, s.ped, s.off, r1(s.margin), s.react === null ? '' : Math.round(s.react*100)/100, k ? '' : r1(s.sure), s.waitMoves ?? '', k ? '' : (summarize(rows, h, qs).waitOk || ''), s.aeb ?? '']; }));
const Q_HEAD = ['참가자','HUD','질문','답 (1 전혀 ~ 5 매우)','질문 2','답 2','HUD 버전','제시 순서'];
const qCells = q => [q.p, modeName(q.hud), Q_TEXT, q.rate, q.wait ? (q.q2 || Q2_TEXT) : '', q.wait ? `${'ABCD'[q.wait - 1]} ${q.waitText}` : '', q.ver ?? '', orderText(q.order)];
const EV_NAME = {h3:'리뉴얼 HUD 상태', gate:'판단 상태', hazardOn:'위험 발생', hazardOff:'위험 해소', lcStart:'차로 변경 시작', lcDone:'차로 변경 완료', lcAbort:'차로 변경 취소', cutIn:'옆 차로 진입', crash:'충돌', blink:'깜빡이', blinkResp:'뒤차 반응', peds:'보행자 건너기 시작 시각 정함', aebOn:'자동 급제동 시작', aebOff:'자동 급제동 끝', h3red:'앞쪽 위험 빨강'};
const AEB_WHY = {stop:'멈춤', override:'가속으로 풀림', clear:'위험 사라짐', crash:'충돌', end:'판 끝'};
const GATE_NAME = {none:'없음', wait:'대기', clearing:'확인', go:'이동'};
const EV_HEAD = ['참가자','HUD','시나리오 ID','판 순서','시각 (초)','이벤트','내용'];
const evDetail = e => e.type === 'h3' ? `${h3Label(e.from)} → ${h3Label(e.to)}${e.shown ? '' : ' (화면에 안 보임)'}` : e.type === 'gate' ? `${GATE_NAME[e.from]} → ${GATE_NAME[e.to]}${e.rel ? ' · 이유 ' + ({rear:'뒤차', side:'옆 차', front:'앞 간격'})[e.rel] : ''}${e.side ? ' · ' + (e.side > 0 ? '오른쪽' : '왼쪽') : ''}${e.shown ? '' : ' (화면에 안 보임)'}`
  : e.type === 'lcStart' ? `${e.from + 1} → ${e.to + 1}차로 · 그때 판단 ${GATE_NAME[e.gate] || '-'}${e.hs ? ' · 리뉴얼 HUD 상태 ' + h3Label(e.hs) : ''}${e.toward ? '' : ' (목표 반대쪽)'}` : e.type === 'lcDone' ? `${e.from + 1} → ${e.to + 1}차로 · ${e.dur}초`
  : e.type === 'cutIn' ? `${e.lane + 1}차로${e.risky ? ' · 위험 (' + e.with + ')' : ''}${e.ahead ? ' · 뒤차 앞에 끼어듦 (간격 ' + e.gap + 'm' + (e.ttc !== null && e.ttc !== undefined ? ' · ' + e.ttc + '초' : '') + ')' : ''}` : e.type === 'hazardOn' ? `${e.lane + 1}차로 · ${e.with}` : e.type === 'crash' ? e.with : e.type === 'lcAbort' ? `${e.from + 1} → ${e.to + 1}차로`
  : e.type === 'blink' ? (e.side ? (e.side < 0 ? '왼쪽 켬' : '오른쪽 켬') : (e.auto ? '자동 끔 (차로 변경 완료)' : '끔')) : e.type === 'blinkResp' ? `${e.with} · ${e.yield ? '양보' : '양보 안 함'} (${e.notice}초 뒤 알아챔)`
  : e.type === 'aebOn' ? `대상 ${e.with} · 그때 시속 ${e.kmh}km · 남은 거리 ${e.gap}m · 필요 감속도 ${e.need} m/s²` : e.type === 'aebOff' ? `${AEB_WHY[e.why] || e.why} · ${e.dur}초 동안 · 그때 시속 ${e.kmh}km`
  : e.type === 'h3red' ? `${e.on ? '켜짐 (' + (e.kind === 'ped' ? '보행자' : '앞차') + ')' : '꺼짐'}${e.shown ? '' : ' (화면에 안 보임)'}` : '';
const evRows = rows => rows.flatMap(r => (r.events || []).map(e => [r.p, modeName(r.hud), r.scn ?? '', r.seq ?? '', e.t, EV_NAME[e.type] || e.type, evDetail(e)]));
const EXPLAIN = [['칸','뜻','어떻게 읽나'],
  ['HUD','현대 HUD = 지금 차에 있는 HUD(1 · 2차와 같은 대조군) · 리뉴얼 HUD = 3차 실험의 실험군(3.0, 2026-11-17) · 리뉴얼 HUD (2차) = 2차 실험 때 HUD(2.4) · 리뉴얼 HUD (1차) = 1차 실험 때 HUD(1.9). \'HUD 버전\' 칸이 빈칸이면 1차 실험 기록, \'우리 2.4-B\'는 2차 실험 기록(그때 이름)','3차: 같은 사람이 현대 3회 · 리뉴얼 3회. 같은 시나리오 ID끼리 짝'],
  ['옮기기 시작 때 리뉴얼 HUD 상태','목표 쪽으로 차로를 처음 넘기 시작한 순간 리뉴얼 HUD가 어느 상태였나: 01 안전 · 02 주의 · 03 대기 · 04 확인 · 05 이동 · 06 앞쪽 위험. 현대 HUD로 달릴 때도 같은 계산을 해서 남김(화면엔 안 보임). (안 옮김) = 끝까지 안 옮김, 빈칸 = 2026-11-17 전 기록','03 대기 · 04 확인에서 옮겼으면 \'기다려\'를 따르지 않은 것. \'대기 · 확인 중 옮기기 시작\' 칸은 예전과 같은 기준(판단 게이트)으로 그대로 셈'],
  ['제시 순서','3차(2026-11-17 ~): 현대 · 리뉴얼 교대 — 연습 뒤 현대 → 리뉴얼 → 현대 → 리뉴얼 → 현대 → 리뉴얼(모든 참가자 현대 먼저). 2차: 현대 → 리뉴얼(현대 3판 뒤 리뉴얼 3판)','2차 기록의 리뉴얼 HUD 결과엔 익숙해진 효과가 섞일 수 있음. 2026-11-03 이전 기록은 짝수 번호가 2차 → 현대'],
  ['연습 여부','본 실험. (2026-11-17 밤부터 연습 주행 없음 — 그 전 기록의 연습 주행은 \'연습\' 시트에만)',''],
  ['정체 줄 합류 방식','정체 판 성공이 \'줄 합류\'(목표 차로 줄 뒤에 붙어 3초)였는지 \'줄 건너뜀\'(줄 옆을 지나 갈림 뒤에 출구로 들어감)이었는지. 건너뜀이면 차로 옮긴 곳 · 반응 시간이 빈칸으로 남음','정체 판 성공률을 읽을 때 둘을 나눠 볼 것. 1차 엑셀엔 이 칸이 없음'],
  ['앞으로 끼어들기 (번) · 그때 뒤차 간격 · 닿기까지','옮길 차로에서 내 뒤 60m 안에 차가 있는데 그 앞에 들어간 횟수, 그때 가장 가까운 뒤차와의 범퍼 간격(m)과 닿기까지 시간(초, 뒤차가 더 빠를 때만). 위험 여부와 상관없이 셈','2차 가설의 \'위험한 차로 변경\' 지표. 간격 · 시간이 작을수록 무리한 끼어들기'],
  ['깜빡이 켬 · 깜빡이 → 차선 넘기 시작 · 옮길 차로 뒤차 반응','목표 쪽으로 처음 옮기기 시작할 때 깜빡이(Q · E)가 켜져 있었나, 켠 뒤 몇 초 만에 차선을 넘기 시작했나, 깜빡이에 반응한 옮길 차로 뒤차가 양보했나(양보 · 양보 안 함, 반응한 차 없으면 빈칸). 양보 여부는 교통 번호로 정해져 두 HUD가 같음 (2026-11-07)','깜빡이를 켜야 양보받을 가능성이 생김. 안 켜고 옮긴 판은 \'안 켬\''],
  ['시간대','주간 · 야간 (시나리오마다, 같은 시나리오는 두 HUD가 같은 시간대)','야간에 차이가 더 커지는지 볼 수 있음'],
  ['맵 · 상황','고속도로 ① IC 진출 · ② JC 4차로 · ③ 연속 분기 / 일반도로 ④ 이중 좌회전 · ⑤ 우회전 · 횡단보도','같은 상황끼리 HUD를 비교'],
  ['결과','성공 = 목적지 출구로 감 · 다른 출구 · 충돌(무엇과) · 시간 초과 · 신호 위반','성공률이 높을수록 좋음. 환경 3.3(2026-11-18)부터는 자동 급제동이 충돌 일부를 막음 — 그 전 기록과 충돌 수를 바로 비교하지 말 것'],
  ['자동 급제동 (번)','앞차 · 횡단보도 보행자 앞에서 차가 스스로 급제동한 횟수(환경 3.3, 2026-11-18 ~). 멈추려면 6 m/s² 넘게 밟아야 하는데 운전자가 그만큼 안 밟고 있을 때 걸림 — 어느 HUD로 달리든 같은 기준. 걸리면 SCC가 꺼져 ↑를 누르기 전까지 혼자 출발하지 않음. 언제 걸리고 어떻게 풀렸는지(멈춤 · 가속으로 풀림 · 위험 사라짐)는 이벤트 시트. 빈칸 = 그 전 기록','적을수록 운전자가 스스로 먼저 대처한 것. 가속으로 풀린 뒤 충돌했으면 경고를 무시한 것'],
  ['차로 옮긴 곳 (마감선 앞 m)','목표 차로에 자리 잡은 곳이 마감선보다 몇 m 앞이었나 (고속도로 갈림 25m 앞 · 일반도로 백색실선 시작). 빈칸 = 끝까지 못 옮김','클수록 미리 옮김. 위험한 끼어들기 0인 판끼리 비교'],
  ['안전해진 뒤 옮기기까지 (초)','옮길 쪽 옆 차로가 안전해진 순간(뒤차 10m 넘게 · 3.5초 안에 안 닿음, 앞차 4m · 2초)부터 옮기기 시작할 때까지. 기준은 1차 실험과 같음','2026-10-29 리뉴얼 HUD는 위험이 풀린 뒤 0.8초 안정 확인을 거쳐 이동을 보여 주므로, 이 값이 그만큼 길어질 수 있음 — 1차 수치와 바로 비교하지 말 것'],
  ['위험한 끼어들기 (번)','옆 차로에 들어갈 때 그 차로 차와 4m보다 가깝거나 2초 안에 부딪힐 상황이었던 횟수 (기준 그대로)','적을수록 좋음'],
  ['보행자 양보 안 함 (번)','⑤에서 보행자가 건너거나 건너려 할 때 횡단보도에 들어간 횟수','0이 정답'],
  ['도로 벗어남 (번)','도로 끝(가드레일 · 연석)에 닿은 횟수','적을수록 좋음'],
  ['시나리오 ID','맵-상황-시간대(D 주간 · N 야간)-교통 번호. 같은 ID = 같은 교통 · 시작 차로 · 목적지','두 HUD가 같은 ID끼리 짝'],
  ['HUD 버전 · 환경 버전','HUD 그림 버전 · 시뮬레이터 환경(그래픽 · 미러) 버전','환경 2.0(그래픽 · 미러 추가) 결과를 1차(환경 1.x)와 비교할 때 HUD만의 효과로 읽지 말 것. 환경 3.0(2026-11-17)은 차 조작감이 실제 차 기준으로 바뀜 — 2차(환경 2.1) 수치와 바로 비교하지 말 것. 환경 3.3(2026-11-18)은 자동 급제동 추가 — 이전 기록과 충돌 수를 바로 비교하지 말 것. 환경 3.4(같은 날 밤)는 급제동이 너무 일찍 풀리던 것 · 옆 폭 등을 고침 — 3.3 기록과 급제동 · 충돌 수를 바로 비교하지 말 것'],
  ['화면 1cm당 px · 보는 거리 · 장면 세로 시야각 · HUD 상자 (px)','연구자 설정 \'화면 맞추기\'(신용카드 크기 맞춤) 값과 보는 거리, 장면 카메라 세로 화각, 그때 HUD 상자의 CSS px. HUD는 참가자 눈에서 가로 10°가 되게 이 값으로 계산(D116)','\'(기본값)\'이 붙어 있으면 맞추지 않은 것 — 같은 기기 · 같은 값으로 고정해야 조건이 같음'],
  ['대기 판단 시간 (초)','옮겨야 하는데 목표 차로가 막혀 판단이 \'대기\'였던 시간 합. 판단은 어느 HUD에서든 같게 계산(화면엔 리뉴얼 HUD만 보임)','HUD끼리 같은 교통이면 비슷해야 함'],
  ['대기 · 확인 중 옮기기 시작 (번)','판단이 대기 · 확인일 때 목표 쪽으로 차로를 넘기 시작한 횟수','적을수록 \'기다려\'를 따른 것'],
  ['이동 판단 뒤 옮기기까지 (초)','판단이 \'이동\'이 된 뒤 목표 쪽으로 옮기기 시작하기까지 (리뉴얼 HUD에선 초록 꺾쇠가 보인 뒤)','짧을수록 바로 판단'],
  ['위험 발생 (번)','옮겨야 하는 동안 목표 차로가 막힌(위험) 횟수','교통 난이도 확인용'],
  ['질문 2','블록 끝 \"기다리라는 표시를 어떻게 이해했나\" A 유지하고 기다림 · B 멈춤 · C 빨리 옮김 · D 못 봄','A가 의도한 이해. [가정] 문항 — 파일럿에서 확인'],
  ['이벤트 시트','판마다 판단 상태 전환 · 위험 발생/해소 · 차로 변경 시작/완료 · 옆 차로 진입 · 충돌 시각 · 자동 급제동 시작(대상 · 그때 속도)/끝(멈춤 · 가속으로 풀림 · 위험 사라짐) · 앞쪽 위험 빨강 켜짐/꺼짐','장면별로 다시 볼 때'],
  ['연습 시트','2026-11-17 밤 이전의 연습 주행 기록이 이 브라우저에 남아 있을 때만 \'엑셀 (전체)\'에 나옴. 요약 · 기록에는 들어가지 않음','']];
const toCsv = rows => rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
function download(text, name, type){
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
// 엑셀(.xlsx): 요약 · 기록 · 질문 · 이벤트 · (예전 연습 기록이 있으면) 연습 · 설명. SheetJS를 못 불러오면 CSV로
function exportBook(rows, name, qs = [], prs = []){
  const sheets = [['요약', [SUM_HEAD, ...sumCells(rows, qs)]], ['기록', [HEAD, ...rows.map(rowCells)]], ['질문', [Q_HEAD, ...qs.map(qCells)]],
    ['이벤트', [EV_HEAD, ...evRows(rows)]], ...(prs.length ? [['연습', [HEAD, ...prs.map(rowCells)]]] : []), ['설명', EXPLAIN]];
  if(window.XLSX){
    const wb = XLSX.utils.book_new();
    sheets.forEach(([n, aoa]) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = aoa[0].map((_, c) => ({wch:Math.min(48, Math.max(8, ...aoa.map(r => String(r[c] ?? '').length*1.6)))})); XLSX.utils.book_append_sheet(wb, ws, n); });
    XLSX.writeFile(wb, name + '.xlsx'); return true;
  }
  download('﻿' + sheets.map(([, aoa]) => toCsv(aoa)).join('\n\n'), name + '.csv', 'text/csv;charset=utf-8'); return false;
}
// 예전 클릭 판단 테스트 기록(6주까지, localStorage 'hud-mvp-trials-v2')을 CSV로 내보내던 버튼은 2026-11-17에 없앰(사용자: 안 씀). 브라우저에 남은 그 기록은 건드리지 않는다

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
}
$('#logBtn').onclick = () => $('#drawer').classList.toggle('open');
$('#closeDrawer').onclick = () => $('#drawer').classList.remove('open');
$('#allXlsx').onclick = () => { exportBook(drives, `주행테스트_전체_${today()}`, surveys, practices); savedTick($('#allXlsx')); };
$('#clearLog').onclick = () => { if(confirm('주행 테스트 기록을 모두 지울까요? (연습 · 예전 클릭 기록은 그대로)')){ drives = []; surveys = []; saveArr(DKEY, drives); saveArr(QKEY, surveys); renderLog(); } };

/* ---------- 방향키 · 단축키 ---------- */
const ARROW = {ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down'};
addEventListener('keydown', e => {
  if(e.target.tagName === 'INPUT'){ if(e.key === 'Enter' && e.target.id === 'sesPid'){ e.preventDefault(); $('#sesBtn').click(); } return; }
  if(ARROW[e.key] && S.testing){ e.preventDefault(); KEYS[ARROW[e.key]] = true; return; }
  if(S.testing && S.drive && !e.repeat && (e.code === 'KeyQ' || e.code === 'KeyE')){ setBlink(e.code === 'KeyQ' ? -1 : 1); return; }   // 깜빡이 (D103): Q 왼쪽 · E 오른쪽, 다시 누르면 끔
  if(e.key === 'Escape' && S.testing){ abortRun(); return; }
  if(/^[1-5]$/.test(e.key) && $('#rate')){ setRate(+e.key); return; }
  if(/^[a-dA-D]$/.test(e.key) && $('#choice')){ setWait('abcd'.indexOf(e.key.toLowerCase())); return; }
  if(e.key === 'Enter' && !$('#sess').hidden && !e.repeat && !$('#sesBtn').disabled){ e.preventDefault(); $('#sesBtn').click(); }
});
addEventListener('keyup', e => { if(ARROW[e.key]) KEYS[ARROW[e.key]] = false; });
addEventListener('blur', () => Object.keys(KEYS).forEach(k => KEYS[k] = false));

try{ const np = localStorage.getItem(PID_KEY); if(np) $('#pid').value = np; }catch(e){}
renderLog();

/* ---------- 화면 맞추기 (D116, screen.js SCR) ---------- */
{
  const det = $('#calib'), card = $('#calCard'), range = $('#calRange'), dist = $('#calDist');
  const show = () => { const ppc = SCR.ppc(), hp = LAY && LAY.hud ? LAY.hud : {w:0, h:0};
    range.value = ppc.toFixed(1); dist.value = SCR.distCm;
    card.style.width = (8.56*ppc).toFixed(1) + 'px'; card.style.height = (5.398*ppc).toFixed(1) + 'px';
    $('#calSum').textContent = `1cm = ${ppc.toFixed(1)}px · ${SCR.distCm}cm${SCR.calibrated() ? '' : ' [기본값]'}`;
    $('#calInfo').textContent = `${SCR.calibrated() ? '맞춘 값' : '기본값 [가정]: ' + SCR.model + ' 가로 ' + SCR.widthCm + 'cm'} → HUD 상자 ${Math.round(hp.w)} × ${Math.round(hp.h)}px는 눈에서 ${SCR.degOfPx(hp.w).toFixed(1)}° × ${SCR.degOfPx(hp.h).toFixed(1)}° (장면 각도 ${HUD_DEG.w}°), 화면 세로 ${SCR.degOfPx(cab.clientHeight).toFixed(1)}°. 기록에만 남음`; };
  range.oninput = () => { SCR.pxPerCm = +range.value; SCR.save(); show(); };
  dist.onchange = () => { SCR.distCm = Math.min(120, Math.max(30, +dist.value || 55)); SCR.save(); show(); };
  $('#calReset').onclick = () => { SCR.pxPerCm = null; SCR.distCm = 55; try{ localStorage.removeItem(SCR.key); }catch(e){} show(); };
  det.ontoggle = () => { card.hidden = !det.open; };
  show();
}
