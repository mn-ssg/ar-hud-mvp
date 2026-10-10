/* ============================================================
   session.js — 주행 테스트 진행 (D60, 01_프로젝트/14_주행테스트_설계.md 8장)
   참가자 ID → 현대 HUD 3판(고속도로 2 + 일반도로 1, D68) → 질문 → 우리 HUD 3판 → 질문 → 요약 + 엑셀 자동 다운로드 (연습 판은 D61에서 뺌, 3판은 D64)
   기록(브라우저 hud-drive-v1) · 기록 서랍 · 엑셀/CSV 내보내기 · 방향키. main.js 다음에 로드.
   ============================================================ */

const DKEY = 'hud-drive-v1', OLD_KEY = 'hud-mvp-trials-v2', BAG_KEY = 'hud-drive-mapbag', PID_KEY = 'hud-drive-nextpid', QKEY = 'hud-drive-survey-v1';
const loadArr = k => { try{ const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; }catch(e){ return []; } };
const saveArr = (k, v) => { try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} };
let drives = loadArr(DKEY), surveys = loadArr(QKEY);   // surveys: 블록 끝 질문 (D65)
const shuffle = a => { for(let i=a.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const modeName = m => m==='ar' ? '우리 HUD' : m==='nav' ? '현대 HUD' : m;   // 'nav' = 현대 HUD(대조군)
const RESULT = {ok:'성공', wrong:'다른 출구', crash:'충돌', timeout:'시간 초과', signal:'신호 위반'};   // 신호 위반: 일반도로(D69)
// 상황: 고속도로 = 뒤차 n대 / 정체 (+ 앞차 급정거), 일반도로 = 맵에 딸린 상황
const CITY_SITU = {CL2:'좌회전 대기 줄 · 신호', CRT:'정류장 버스 · 보행자'};
const situName = r => (r.type === 'city' ? CITY_SITU[r.map] || '일반도로' : r.type === 'jam' ? ({1:'정체 보통(예전)', 2:'정체 심함(예전)'}[r.jam] || '정체') : `뒤차 ${r.rearN}대`) + (r.brake ? ' · 앞차 급정거' : '');
const kindOf = r => r.type === 'city' ? '일반도로' : r.type === 'jam' ? '고속도로 정체' : '고속도로 뒤차';
const lightName = l => l === 'night' ? '야간' : '주간';
const resultName = r => r.result === 'crash' && r.crash ? `충돌 (${r.crash.split(' · ')[0]})` : RESULT[r.result];   // 충돌이면 무엇과
// 차로 옮긴 곳 = 목표 차로에 자리 잡은 곳이 '마감선' 몇 m 앞인가 (+ 일찍 · − 마감 지남). 마감선: 고속도로 갈림 25m 앞(HUD 막대 끝) · 일반도로 백색실선 시작(정지선 35m 앞)
const marginOf = r => { if(r.change === null || r.change === undefined) return null; const m = mapById(r.map) || MAPS_OFF.find(o => o.id === r.map); return Math.round(r.change - (FORK_Z - changeEndOf(m))); };   // D67: 정체는 한 가지(3), 1 · 2는 예전 기록
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

/* ---------- 진행 순서 ---------- */
const SES = {on:false, pid:'', steps:[], i:-1, rows:[], prevMode:'ar', cur:null, timer:0};
// 맵: 브라우저의 '맵 주머니'에서 섞어 차례로 꺼냄 → 여러 참가자를 거치면 고르게. 고속도로 · 일반도로 주머니는 따로
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
// 블록 = 고속도로 2판(뒤차 1 + 정체 1) + 일반도로 1판 (D68 — 사용자). 두 블록이 같은 짝을 순서만 섞어 쓴다 (D64).
// 교통(뒤차 수 · 간격 · 급정거 · 일반도로 신호 시각 · 보행자)은 판마다 새 교통 번호로 랜덤, 정체 정도는 한 가지(D67) (D63 — 사용자: '늘 4대씩 정직하게 옴')
function buildSteps(){
  const [A, B] = takeMaps(2, MAPS.filter(m => !m.city), BAG_KEY), [C] = takeMaps(1, MAPS.filter(m => m.city), CITY_BAG), seed = () => 1 + Math.floor(Math.random()*999999);
  const pairs = [{map:A, type:'rear'}, {map:B, type:'jam'}, {map:C, type:'city'}];
  // 주간 · 야간: 짝마다 랜덤(사용자 — D70), 한 사람에 둘 다 나오게. 같은 짝은 두 블록(두 HUD)이 같은 시간대 → HUD 비교에 섞이지 않음
  shuffle(['day', 'night', pick(['day', 'night'])]).forEach((l, i) => pairs[i].light = l);
  const block = (hud, no) => shuffle(pairs.slice()).map((p, i) => ({kind:'run', hud, block:no, no:i + 1, ...p, seed:seed(), jam:p.type === 'jam' ? 3 : 0}));   // 정체 판은 늘 '정체'(D67 — 보통 · 심함 랜덤 취소)
  // 블록 끝마다 질문 카드 (D65) — 현대 HUD 뒤 카드가 쉬는 화면을 겸함
  return [...block('nav', 1), {kind:'survey', hud:'nav', block:1}, ...block('ar', 2), {kind:'survey', hud:'ar', block:2}, {kind:'done'}];
}
// 한 판: 시작 차로 · 목적지(늘 차로를 한 번 옮겨야 하는 곳)는 랜덤, 교통은 짝의 seed로 (drive.js driveReset)
function runCfg(st){
  const m = mapById(st.map), lane = pick(m.start);
  const leaf = pick(leafIdxs(m, (l, i) => l.quiz && makeRoute(m, i, lane).side !== 0));
  const sigT = m.sig === 'left' ? 12 + mulberry32(st.seed ^ 0x5bd1)()*6 : 0;   // ④ 좌회전 화살표가 켜지는 시각(12~18초) — 교통 번호로 정해짐
  return {map:m, leaf, lane, type:st.type, jam:st.jam, seed:st.seed, sigT};
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
  if(!on && S.map && S.map.city) $$('#jamSeg button').forEach(b => b.disabled = true);   // 일반도로는 정체 고르기 없음
}

/* ---------- 흐름 ---------- */
function openSession(){
  if(S.running){ S.running = false; S.paused = false; $('#pauseBtn').textContent = '일시정지'; }   // 시연 중이면 멈춤
  sesCard({title:'주행 테스트', body:`<label class="pid">참가자 <input type="text" id="sesPid" value="${esc($('#pid').value || 'P1')}" autocomplete="off"></label>
    <p class="ses-note"><b>현대 HUD</b> 3판 → <b>우리 HUD</b> 3판 (약 4분). 주간 · 야간은 판마다 바뀌어요. HUD를 보고 목적지로 가세요.</p>${KEY_HINT}`,
    btn:['시작', beginSession], btn2:['닫기', closeCard]});
}
function closeCard(){ hideCard(); $('#intro').hidden = false; }
function beginSession(){
  SES.pid = ($('#sesPid').value || 'P1').trim(); $('#pid').value = SES.pid;
  SES.on = true; S.testing = true; SES.prevMode = S.mode; SES.prevLight = S.light; SES.steps = buildSteps(); SES.i = -1; SES.rows = []; SES.qs = [];
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
  setMode(st.hud); if(st.light) setLight(st.light);
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
// 블록 끝 질문: '차로를 옮길 때 얼마나 확신했나요?' 1~5 (숫자 키도 됨). 문항은 [가정 — 파일럿에서 확인]
// D68: 한마디 글 칸 삭제(사용자). 엑셀 '한마디' 칸은 예전 기록 때문에 남김
const Q_TEXT = '차로를 옮길 때 얼마나 확신했나요?';
function surveyCard(st){
  SES.rate = 0;
  sesCard({title:modeName(st.hud), body:`<p class="ses-note">${Q_TEXT}</p>
    <div class="rate" id="rate">${[1,2,3,4,5].map(n => `<button data-r="${n}">${n}</button>`).join('')}</div>
    <div class="rate-ends"><span>전혀</span><span>매우</span></div>`,
    btn:[st.block === 1 ? '다음: 우리 HUD' : '끝', () => {
      if(!SES.rate) return;
      const q = {p:SES.pid, block:st.block, hud:st.hud, rate:SES.rate, at:new Date().toISOString()};
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
    change:D.changeDist, react:D.reactT, risky:D.risky, offroad:D.offroad, ped:D.ped, crash:D.crashWith || '', secs:+D.t.toFixed(2), at:new Date().toISOString()};   // 목적지 · 교통 번호 · 시각은 엑셀엔 안 나가고 브라우저 기록에만
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
  lockUi(false); setMode(SES.prevMode); if(SES.prevLight) setLight(SES.prevLight); prepDemo(); setCard({title:mapLabel(S.demoMap)}); update(1);
}
function abortSession(){
  if(!confirm('주행 테스트를 그만둘까요? 지금까지 끝난 판의 기록은 남아요.')) return;
  endSession(); hideCard(); $('#intro').hidden = false;
}
$('#testBtn').onclick = openSession;
$('#testSide').onclick = () => SES.on ? abortSession() : openSession();

/* ---------- 요약 · 내보내기 (D70 — 디자이너가 읽을 칸만) ---------- */
const avg = a => a.length ? a.reduce((x, y) => x + y, 0)/a.length : null;
const r1 = v => v === null ? '' : Math.round(v*10)/10;
// rows 중 HUD(hud)와 판 종류(kind, 없으면 전체)에 맞는 판의 요약. 차로 옮긴 곳 평균은 위험한 끼어들기 0인 판만 (D65 분석 규칙)
function summarize(rows, hud, qs = [], kind = null){
  const l = rows.filter(r => r.hud === hud && (!kind || kindOf(r) === kind));
  const safe = l.filter(r => !r.risky).map(marginOf).filter(v => v !== null), re = l.map(r => r.react).filter(v => v !== null && v !== undefined);
  const q = kind ? [] : qs.filter(x => x.hud === hud).map(x => x.rate);
  return {n:l.length, rate:l.length ? Math.round(l.filter(r => r.result === 'ok').length/l.length*100) : null, margin:avg(safe), react:avg(re), sure:avg(q),
    risky:l.reduce((a, r) => a + r.risky, 0), crash:l.filter(r => r.result === 'crash').length, sig:l.filter(r => r.result === 'signal').length,
    ped:l.reduce((a, r) => a + (r.ped || 0), 0), off:l.reduce((a, r) => a + (r.offroad || 0), 0)};
}
const fx1 = v => v === null ? '-' : v.toFixed(1);
function summaryHtml(rows){
  return '<div class="ses-sum">' + ['nav','ar'].map(h => { const s = summarize(rows, h);
    return `<div><strong>${modeName(h)}</strong>성공 <em>${s.rate === null ? '-' : s.rate + '%'}</em><br>차로 옮긴 곳 <em>${s.margin === null ? '-' : '마감선 ' + Math.round(s.margin) + 'm 앞'}</em><br>위험 끼어들기 <em>${s.risky}</em> · 충돌 <em>${s.crash}</em></div>`; }).join('') + '</div>';
}
// 기록: 한 판 = 한 줄
const HEAD = ['참가자','HUD','시간대','맵','상황','결과','차로 옮긴 곳 (마감선 앞 m)','안전해진 뒤 옮기기까지 (초)','위험한 끼어들기 (번)','보행자 양보 안 함 (번)','도로 벗어남 (번)'];
const rowCells = r => [r.p, modeName(r.hud), lightName(r.light), mapLabel(r.map), situName(r), resultName(r), marginOf(r) ?? '', r.react ?? '',
  r.risky, (mapById(r.map) || {}).cw ? (r.ped ?? '') : '', r.offroad];
// 요약: HUD × 판 종류
const SUM_HEAD = ['HUD','판 종류','판 수','성공률 (%)','충돌 (판)','위험한 끼어들기 (번)','신호 위반 (판)','보행자 양보 안 함 (번)','도로 벗어남 (번)','차로 옮긴 곳 평균 (마감선 앞 m, 위험 0인 판)','안전해진 뒤 옮기기까지 평균 (초)','확신 평균 (1~5)'];
const sumCells = (rows, qs) => ['nav','ar'].flatMap(h => [null, '고속도로 뒤차', '고속도로 정체', '일반도로'].map(k => { const s = summarize(rows, h, qs, k);
  return [modeName(h), k || '전체', s.n, s.rate ?? '', s.crash, s.risky, s.sig, s.ped, s.off, r1(s.margin), s.react === null ? '' : Math.round(s.react*100)/100, k ? '' : r1(s.sure)]; }));
const Q_HEAD = ['참가자','HUD','질문','답 (1 전혀 ~ 5 매우)'];
const qCells = q => [q.p, modeName(q.hud), Q_TEXT, q.rate];
// 설명: 칸마다 뜻 · 읽는 법
const EXPLAIN = [['칸','뜻','어떻게 읽나'],
  ['HUD','현대 HUD = 지금 차에 있는 HUD(비교 기준) · 우리 HUD = 초보자용으로 만든 것','같은 사람이 현대 HUD 3판 → 우리 HUD 3판 (순서 고정)'],
  ['시간대','주간 · 야간 (판마다 랜덤, 같은 맵 · 상황은 두 HUD가 같은 시간대)','야간에 차이가 더 커지는지 볼 수 있음'],
  ['맵 · 상황','고속도로 ① IC 진출 · ② JC 4차로 · ③ 연속 분기 / 일반도로 ④ 이중 좌회전 · ⑤ 우회전 · 횡단보도. 상황 = 뒤차 n대 · 정체 · 앞차 급정거 · 좌회전 대기 줄 · 정류장 버스 · 보행자','같은 상황끼리 두 HUD를 비교'],
  ['결과','성공 = 목적지 출구로 감 · 다른 출구 · 충돌(무엇과) · 시간 초과 · 신호 위반(빨간불에 정지선을 넘음)','성공률이 높을수록 좋음'],
  ['차로 옮긴 곳 (마감선 앞 m)','목표 차로에 자리 잡은 곳이 마감선보다 몇 m 앞이었나. 마감선 = 고속도로는 갈림 25m 앞(HUD 막대가 끝나는 곳), 일반도로는 백색실선이 시작하는 곳(정지선 35m 앞). 빈칸 = 끝까지 못 옮김','클수록 미리 옮김(여유 있게 판단). 0 근처 = 막판에 옮김, 음수 = 마감을 넘겨 옮김. 뒤차 판은 기다리는 게 맞을 때가 있어 위험한 끼어들기 0인 판끼리 비교'],
  ['안전해진 뒤 옮기기까지 (초)','옮길 쪽 옆 차로가 안전해진 순간부터 실제로 옮기기 시작할 때까지. 빈칸 = 안전하지 않을 때 끼어듦(위험한 끼어들기로 잡힘)','짧을수록 HUD를 보고 바로 판단'],
  ['위험한 끼어들기 (번)','옆 차로에 들어갈 때 그 차로 차와 4m보다 가깝거나 2초 안에 부딪힐 상황이었던 횟수','적을수록 좋음'],
  ['보행자 양보 안 함 (번)','⑤에서 보행자가 건너거나 건너려 할 때 횡단보도에 들어간 횟수 (⑤가 아니면 빈칸)','0이 정답'],
  ['도로 벗어남 (번)','도로 끝(가드레일 · 연석)에 닿은 횟수','적을수록 좋음'],
  ['확신 (질문 시트)','블록이 끝날 때 \"차로를 옮길 때 얼마나 확신했나요?\" 1 전혀 ~ 5 매우','높을수록 좋음']];
const toCsv = rows => rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
function download(text, name, type){
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
// 엑셀(.xlsx, 시트 '요약' · '기록' · '질문' · '설명'). SheetJS를 못 불러오면 같은 내용을 CSV로 (엑셀에서 열림)
function exportBook(rows, name, qs = []){
  const sheets = [['요약', [SUM_HEAD, ...sumCells(rows, qs)]], ['기록', [HEAD, ...rows.map(rowCells)]], ['질문', [Q_HEAD, ...qs.map(qCells)]], ['설명', EXPLAIN]];
  if(window.XLSX){
    const wb = XLSX.utils.book_new();
    sheets.forEach(([n, aoa]) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = aoa[0].map((_, c) => ({wch:Math.min(48, Math.max(8, ...aoa.map(r => String(r[c] ?? '').length*1.6)))})); XLSX.utils.book_append_sheet(wb, ws, n); });
    XLSX.writeFile(wb, name + '.xlsx'); return true;
  }
  download('﻿' + sheets.map(([, aoa]) => toCsv(aoa)).join('\n\n'), name + '.csv', 'text/csv;charset=utf-8'); return false;
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
    return `<tr><td>${esc(r.p)}</td><td>${modeName(r.hud)}</td><td>${lightName(r.light)}</td><td>${m ? m.no : '-'}</td><td>${situName(r)}</td><td class="${r.result === 'ok' ? 'ok' : 'bad'}">${resultName(r)}</td><td>${marginOf(r) ?? '-'}</td><td>${r.react ?? '-'}</td><td>${r.risky}</td><td>${m && m.cw ? r.ped ?? '-' : ''}</td></tr>`;
  }).join('');
  $('#summary').innerHTML = ['nav','ar'].map(h => { const s = summarize(drives, h);
    return `<div><strong>${modeName(h)}</strong>${s.n}판 · 성공 <em>${s.rate === null ? '-' : s.rate + '%'}</em><br>차로 옮긴 곳 <em>${s.margin === null ? '-' : '마감선 ' + fx1(s.margin) + 'm 앞'}</em><br>위험 <em>${s.risky}</em> · 충돌 <em>${s.crash}</em></div>`; }).join('');
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
  if(e.target.tagName === 'INPUT'){ if(e.key === 'Enter' && e.target.id === 'sesPid'){ e.preventDefault(); $('#sesBtn').click(); } return; }
  if(ARROW[e.key] && S.testing){ e.preventDefault(); KEYS[ARROW[e.key]] = true; return; }
  if(/^[1-5]$/.test(e.key) && $('#rate')){ setRate(+e.key); return; }                 // 블록 끝 질문: 숫자 키
  if(e.key === 'Enter' && !$('#sess').hidden && !e.repeat){ e.preventDefault(); $('#sesBtn').click(); }
});
addEventListener('keyup', e => { if(ARROW[e.key]) KEYS[ARROW[e.key]] = false; });
addEventListener('blur', () => Object.keys(KEYS).forEach(k => KEYS[k] = false));

try{ const np = localStorage.getItem(PID_KEY); if(np) $('#pid').value = np; }catch(e){}
renderLog();
