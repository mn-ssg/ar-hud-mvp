/* ============================================================
   session.js — 주행 테스트 진행 (D60, 01_프로젝트/14_주행테스트_설계.md 8장)
   참가자 ID → 현대 HUD 3판 → 쉬는 화면 → 우리 HUD 3판 → 요약 + 엑셀 자동 다운로드 (연습 판은 D61에서 뺌, 3판은 D64)
   기록(브라우저 hud-drive-v1) · 기록 서랍 · 엑셀/CSV 내보내기 · 방향키. main.js 다음에 로드.
   ============================================================ */

const DKEY = 'hud-drive-v1', OLD_KEY = 'hud-mvp-trials-v2', BAG_KEY = 'hud-drive-mapbag', PID_KEY = 'hud-drive-nextpid', QKEY = 'hud-drive-survey-v1';
const loadArr = k => { try{ const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; }catch(e){ return []; } };
const saveArr = (k, v) => { try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} };
let drives = loadArr(DKEY), surveys = loadArr(QKEY);   // surveys: 블록 끝 질문 (D65)
const shuffle = a => { for(let i=a.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const modeName = m => m==='ar' ? '우리 HUD' : m==='nav' ? '현대 HUD' : m;   // 'nav' = 현대 HUD(대조군)
const RESULT = {ok:'성공', wrong:'다른 출구', crash:'충돌', timeout:'시간 초과'};
const situName = r => (r.type === 'jam' ? '정체 ' + (r.jam === 2 ? '심함' : '보통') : `뒤차 ${r.rearN}대`) + (r.brake ? ' · 앞차 급정거' : '');
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

/* ---------- 진행 순서 ---------- */
const SES = {on:false, pid:'', steps:[], i:-1, rows:[], prevMode:'ar', cur:null, timer:0};
// 맵: 브라우저의 '맵 주머니'에서 섞어 차례로 꺼냄 → 여러 참가자를 거치면 5개가 고르게
function takeMaps(n){
  let bag = loadArr(BAG_KEY).filter(id => mapById(id));
  const out = [];
  while(out.length < n){
    if(!bag.length) bag = shuffle(MAPS.map(m => m.id));
    const id = bag.pop(); if(!out.includes(id)) out.push(id);
  }
  saveArr(BAG_KEY, bag);
  return out;
}
// 맵 3개에 판 종류를 짝짓고(뒤차 · 정체 · 둘 중 랜덤 하나, D64 — HUD당 3판), 두 블록이 같은 짝을 순서만 섞어 쓴다.
// 교통(뒤차 수 · 간격 · 급정거 · 정체 정도)은 판마다 새 교통 번호로 랜덤 (D63 — 사용자: '늘 4대씩 정직하게 옴'. D61의 두 블록 같은 교통은 취소)
function buildSteps(){
  const [A, B, C] = takeMaps(3), seed = () => 1 + Math.floor(Math.random()*999999);
  const pairs = [{map:A, type:'rear'}, {map:B, type:'jam'}, {map:C, type:pick(['rear', 'jam'])}];
  const block = (hud, no) => shuffle(pairs.slice()).map((p, i) => ({kind:'run', hud, block:no, no:i + 1, ...p, seed:seed(), jam:p.type === 'jam' ? 1 + Math.floor(Math.random()*2) : 0}));
  // 블록 끝마다 질문 카드 (D65) — 현대 HUD 뒤 카드가 쉬는 화면을 겸함
  return [...block('nav', 1), {kind:'survey', hud:'nav', block:1}, ...block('ar', 2), {kind:'survey', hud:'ar', block:2}, {kind:'done'}];
}
// 한 판: 시작 차로 · 목적지(늘 차로를 한 번 옮겨야 하는 곳)는 랜덤, 교통은 짝의 seed로 (drive.js driveReset)
function runCfg(st){
  const m = mapById(st.map), lane = pick(m.start);
  const leaf = pick(leafIdxs(m, (l, i) => l.quiz && makeRoute(m, i, lane).side !== 0));
  return {map:m, leaf, lane, type:st.type, jam:st.jam, seed:st.seed};
}

/* ---------- 카드 · 카운트다운 ---------- */
function sesCard({icon = '', tone = '', title, body = '', btn, btn2}){
  $('#sesIcon').innerHTML = icon ? ico(icon) : ''; $('#sesIcon').className = icon ? 'card-icon ' + tone : '';
  $('#sesTitle').textContent = title; $('#sesBody').innerHTML = body;
  const b1 = $('#sesBtn'), b2 = $('#sesBtn2');
  b1.textContent = btn[0]; b1.onclick = btn[1];
  b2.hidden = !btn2; if(btn2){ b2.textContent = btn2[0]; b2.onclick = btn2[1]; }
  $('#intro').hidden = true; $('#sess').hidden = false;
  const inp = $('#sesPid'); (inp ? inp : b1).focus();
}
const hideCard = () => { $('#sess').hidden = true; };
const KEY_HINT = '<div class="keyrow"><span><kbd>←</kbd><kbd>→</kbd> 핸들</span><span><kbd>↑</kbd> 가속</span><span><kbd>↓</kbd> 브레이크</span></div>';

function lockUi(on){
  $('#scenario').style.opacity = on ? '.4' : '';
  $$('#scenario button, #modeSeg button, #lightSeg button').forEach(b => b.disabled = on);
  $('#demoSide').disabled = on;
  $('#testSide').textContent = on ? '테스트 그만' : '주행 테스트';
}

/* ---------- 흐름 ---------- */
function openSession(){
  if(S.running){ S.running = false; S.paused = false; $('#pauseBtn').textContent = '일시정지'; }   // 시연 중이면 멈춤
  sesCard({title:'주행 테스트', body:`<label class="pid">참가자 <input type="text" id="sesPid" value="${esc($('#pid').value || 'P1')}" autocomplete="off"></label>
    <p class="ses-note"><b>현대 HUD</b> 3판 → <b>우리 HUD</b> 3판 (약 3분). HUD를 보고 목적지로 가세요.</p>${KEY_HINT}`,
    btn:['시작', beginSession], btn2:['닫기', closeCard]});
}
function closeCard(){ hideCard(); $('#intro').hidden = false; }
function beginSession(){
  SES.pid = ($('#sesPid').value || 'P1').trim(); $('#pid').value = SES.pid;
  SES.on = true; S.testing = true; SES.prevMode = S.mode; SES.steps = buildSteps(); SES.i = -1; SES.rows = []; SES.qs = [];
  lockUi(true); nextStep();
}
function nextStep(){
  const st = SES.steps[++SES.i];
  if(st.kind === 'run') runStep(st);
  else if(st.kind === 'survey') surveyCard(st);
  else doneSession();
}
// 3 · 2 · 1 동안 화면을 멈춰 두고 키 안내를 보여 준다
function runStep(st){
  const cfg = runCfg(st); SES.cur = {st, cfg};
  setMode(st.hud);
  startDrive(cfg); D.frozen = true;
  hideCard();
  const cnt = $('#count'), hint = $('#keyHint');
  hint.hidden = false; cnt.hidden = false;
  let n = 3; cnt.textContent = n;
  const tick = () => {
    if(--n > 0){ cnt.textContent = n; SES.timer = setTimeout(tick, 800); return; }
    cnt.hidden = true; D.frozen = false;
    if(!(st.block === 1 && st.no === 1)) hint.hidden = true;   // 연습 판이 없으니 첫 판은 키 안내를 끝까지
  };
  SES.timer = setTimeout(tick, 800);
}
// 블록 끝 질문: '차로를 옮길 때 얼마나 확신했나요?' 1~5 (숫자 키도 됨) + 한마디(선택). 문항은 [가정 — 파일럿에서 확인]
const Q_TEXT = '차로를 옮길 때 얼마나 확신했나요?';
function surveyCard(st){
  SES.rate = 0;
  sesCard({title:modeName(st.hud), body:`<p class="ses-note">${Q_TEXT}</p>
    <div class="rate" id="rate">${[1,2,3,4,5].map(n => `<button data-r="${n}">${n}</button>`).join('')}</div>
    <div class="rate-ends"><span>전혀</span><span>매우</span></div>
    <input type="text" id="sesNote" placeholder="한마디 (선택)" autocomplete="off">`,
    btn:[st.block === 1 ? '다음: 우리 HUD' : '끝', () => {
      if(!SES.rate) return;
      const q = {p:SES.pid, block:st.block, hud:st.hud, rate:SES.rate, note:($('#sesNote').value || '').trim(), at:new Date().toISOString()};
      surveys.push(q); saveArr(QKEY, surveys); SES.qs.push(q); nextStep();
    }]});
  $('#sesBtn').disabled = true; $('#sesBtn').focus();
  $$('#rate button').forEach(b => b.onclick = () => setRate(+b.dataset.r));
}
function setRate(n){
  SES.rate = n; $('#sesBtn').disabled = false;
  $$('#rate button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.r === n)));
}

// drive.js가 판이 끝나면 부름
function onDriveEnd(){
  if(!SES.on || !SES.cur) return;
  const {st, cfg} = SES.cur; SES.cur = null;
  $('#keyHint').hidden = true;
  const res = D.result, good = res === 'ok';
  const row = {p:SES.pid, block:st.block, no:st.no, hud:st.hud, light:S.light, map:cfg.map.id, type:cfg.type, jam:cfg.jam, rearN:cfg.rearN, brake:cfg.brake, seed:cfg.seed,
    lane:cfg.lane + 1, dest:exitName(cfg.map.leaves[cfg.leaf].path.slice(-1)[0]), exit:D.exitName, result:res,
    change:D.changeDist, react:D.reactT, risky:D.risky, offroad:D.offroad, secs:+D.t.toFixed(2), at:new Date().toISOString()};
  drives.push(row); saveArr(DKEY, drives); SES.rows.push(row); renderLog();
  sesCard({icon:good ? 'check' : 'cross', tone:good ? 'ok' : 'bad', title:RESULT[res],
    body:`<div class="chips"><span class="chip">${modeName(st.hud)} ${st.no}/${SES.steps.filter(x => x.block === st.block).length}</span></div>`, btn:['다음', nextStep]});
}
function doneSession(){
  endSession();
  const m = SES.pid.match(/^(.*?)(\d+)$/);   // 다음 참가자 번호 (P7 → P8), 새로 고쳐도 이어지게
  if(m){ $('#pid').value = m[1] + (+m[2] + 1); try{ localStorage.setItem(PID_KEY, $('#pid').value); }catch(e){} }
  const name = `주행테스트_${SES.pid}_${today()}`, xl = exportBook(SES.rows, name, SES.qs);
  sesCard({icon:'check', tone:'ok', title:'테스트 끝', body:summaryHtml(SES.rows) + `<p class="ses-note">${esc(name)}.${xl ? 'xlsx' : 'csv'} 내려받음</p>`,
    btn:['처음으로', closeCard], btn2:['엑셀 다시 받기', () => exportBook(SES.rows, name, SES.qs)]});
}
function endSession(){
  clearTimeout(SES.timer); SES.on = false; SES.cur = null; S.testing = false;
  stopDrive(); D.frozen = false; $('#count').hidden = true; $('#keyHint').hidden = true;
  lockUi(false); setMode(SES.prevMode); prepDemo(); setCard({title:mapLabel(S.demoMap)}); update(1);
}
function abortSession(){
  if(!confirm('주행 테스트를 그만둘까요? 지금까지 끝난 판의 기록은 남아요.')) return;
  endSession(); hideCard(); $('#intro').hidden = false;
}
$('#testBtn').onclick = openSession;
$('#testSide').onclick = () => SES.on ? abortSession() : openSession();

/* ---------- 요약 · 내보내기 ---------- */
const avg = a => a.length ? a.reduce((x, y) => x + y, 0)/a.length : null;
function summarize(rows, hud, qs = []){
  const l = rows.filter(r => r.hud === hud), ch = l.map(r => r.change).filter(v => v !== null && v !== undefined);
  const re = l.map(r => r.react).filter(v => v !== null && v !== undefined), q = qs.filter(x => x.hud === hud).map(x => x.rate);
  return {n:l.length, rate:l.length ? Math.round(l.filter(r => r.result === 'ok').length/l.length*100) : null, change:avg(ch), react:avg(re), sure:avg(q),
    risky:l.reduce((a, r) => a + r.risky, 0), crash:l.filter(r => r.result === 'crash').length, off:l.reduce((a, r) => a + r.offroad, 0), secs:avg(l.map(r => r.secs))};
}
const fx1 = v => v === null ? '-' : v.toFixed(1);
function summaryHtml(rows){
  return '<div class="ses-sum">' + ['nav','ar'].map(h => { const s = summarize(rows, h);
    return `<div><strong>${modeName(h)}</strong>성공 <em>${s.rate === null ? '-' : s.rate + '%'}</em><br>옮긴 지점 <em>${s.change === null ? '-' : Math.round(s.change) + 'm 앞'}</em><br>위험 끼어들기 <em>${s.risky}</em> · 충돌 <em>${s.crash}</em></div>`; }).join('') + '</div>';
}
const HEAD = ['참가자','블록','판','HUD','시간대','맵','상황','시작 차로','목적지','들어간 출구','결과','차로 변경 완료 지점(갈림 앞 m)','반응 시간(초)','위험 끼어들기','이탈','소요 시간(초)','교통 번호','기록시각'];
const rowCells = r => [r.p, r.block, r.no, modeName(r.hud), r.light === 'night' ? '야간' : '주간', mapLabel(r.map), situName(r), r.lane, r.dest, r.exit || '-', RESULT[r.result],
  r.change ?? '', r.react ?? '', r.risky, r.offroad, r.secs, r.seed ?? '', r.at];
const SUM_HEAD = ['HUD','판 수','출구 성공률(%)','평균 차로 변경 완료 지점(m)','평균 반응 시간(초)','위험 끼어들기 합','충돌','이탈 합','평균 소요 시간(초)','평균 확신(1~5)'];
const sumCells = (rows, qs) => ['nav','ar'].map(h => { const s = summarize(rows, h, qs); const r1 = v => v === null ? '' : Math.round(v*10)/10, r2 = v => v === null ? '' : Math.round(v*100)/100;
  return [modeName(h), s.n, s.rate ?? '', r1(s.change), r2(s.react), s.risky, s.crash, s.off, r1(s.secs), r1(s.sure)]; });
const Q_HEAD = ['참가자','블록','HUD','질문','답(1~5)','한마디','기록시각'];
const qCells = q => [q.p, q.block, modeName(q.hud), Q_TEXT, q.rate, q.note, q.at];
const toCsv = rows => rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
function download(text, name, type){
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
// 엑셀(.xlsx, 시트 '기록' + '요약'). SheetJS를 못 불러오면 같은 내용을 CSV로 (엑셀에서 열림)
function exportBook(rows, name, qs = []){
  const rec = [HEAD, ...rows.map(rowCells)], sum = [SUM_HEAD, ...sumCells(rows, qs)], qq = [Q_HEAD, ...qs.map(qCells)];
  if(window.XLSX){
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rec), '기록');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), '요약');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(qq), '질문');
    XLSX.writeFile(wb, name + '.xlsx'); return true;
  }
  download('\ufeff' + toCsv(rec) + '\n\n' + toCsv(sum) + '\n\n' + toCsv(qq), name + '.csv', 'text/csv;charset=utf-8'); return false;
}
// 예전 클릭 판단 테스트 기록(6주까지, hud-mvp-trials-v2) — 새 기록과 섞지 않고 따로 CSV로
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
    return `<tr><td>${esc(r.p)}</td><td>${modeName(r.hud)}</td><td>${m ? m.no : '-'}</td><td>${situName(r)}</td><td class="${r.result === 'ok' ? 'ok' : 'bad'}">${RESULT[r.result]}</td><td>${r.change ?? '-'}</td><td>${r.react ?? '-'}</td><td>${r.risky}</td><td>${r.offroad}</td><td>${r.secs.toFixed(1)}</td></tr>`;
  }).join('');
  $('#summary').innerHTML = ['nav','ar'].map(h => { const s = summarize(drives, h);
    return `<div><strong>${modeName(h)}</strong>${s.n}판 · 성공 <em>${s.rate === null ? '-' : s.rate + '%'}</em><br>옮긴 지점 평균 <em>${s.change === null ? '-' : fx1(s.change) + 'm'}</em><br>위험 <em>${s.risky}</em> · 충돌 <em>${s.crash}</em></div>`; }).join('');
  $('#oldCsv').hidden = !loadArr(OLD_KEY).length;
}
$('#logBtn').onclick = () => $('#drawer').classList.toggle('open');
$('#closeDrawer').onclick = () => $('#drawer').classList.remove('open');
$('#allXlsx').onclick = () => exportBook(drives, `주행테스트_전체_${today()}`, surveys);
$('#oldCsv').onclick = () => download('\ufeff' + toCsv(oldCsv()), `판단테스트_클릭기록_${today()}.csv`, 'text/csv;charset=utf-8');
$('#clearLog').onclick = () => { if(confirm('주행 테스트 기록을 모두 지울까요? (예전 클릭 기록은 그대로)')){ drives = []; surveys = []; saveArr(DKEY, drives); saveArr(QKEY, surveys); renderLog(); } };

/* ---------- 방향키 ---------- */
const ARROW = {ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down'};
addEventListener('keydown', e => {
  if(e.target.tagName === 'INPUT'){ if(e.key === 'Enter' && (e.target.id === 'sesPid' || e.target.id === 'sesNote')){ e.preventDefault(); $('#sesBtn').click(); } return; }
  if(ARROW[e.key] && S.testing){ e.preventDefault(); KEYS[ARROW[e.key]] = true; return; }
  if(/^[1-5]$/.test(e.key) && $('#rate')){ setRate(+e.key); return; }                 // 블록 끝 질문: 숫자 키
  if(e.key === 'Enter' && !$('#sess').hidden && !e.repeat){ e.preventDefault(); $('#sesBtn').click(); }
});
addEventListener('keyup', e => { if(ARROW[e.key]) KEYS[ARROW[e.key]] = false; });
addEventListener('blur', () => Object.keys(KEYS).forEach(k => KEYS[k] = false));

try{ const np = localStorage.getItem(PID_KEY); if(np) $('#pid').value = np; }catch(e){}
renderLog();
