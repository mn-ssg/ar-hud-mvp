/* ============================================================
   main.js — 상태 · 경로 · 정체 대기열 · 매 프레임 루프 · 흐름 · 기록 · 이벤트
   config.js, scene.js, hud.js 다음(마지막)에 로드.
   ============================================================ */

/* ---------- 경로 ---------- */
function buildPath(i, jam){
  const tx = (i-1)*LANE;
  let pts;
  if(jam > 0 && i !== 1){
    // 정체 시: 대기열 뒤끝(back)보다 더 뒤(양의 z)에서 합류를 끝낸다 → 줄 맨 뒤에 붙음(관통 없음)
    const mEnd = JAM_LV[jam].back + 20, mStart = Math.min(0, mEnd + 50);
    pts = [V(0,40), V(0,mStart), V(tx*.5,(mStart+mEnd)/2), V(tx,mEnd), V(tx,-218)].concat(BRANCH_PTS[i].map(a=>V(a[0],a[1])));
  } else {
    pts = [V(0,40),V(0,0),V(0,-100),V(0,-128),V(tx*.5,-170),V(tx,-203),V(tx,-218)].concat(BRANCH_PTS[i].map(a=>V(a[0],a[1])));
  }
  const curve = curveOf(pts,800);
  return {curve, L:curve.getLength(), sStart:40};
}

/* ---------- 상태 ---------- */
const S = {mode:'ar', target:2, running:false, paused:false, s:40, testing:false, asked:false, t0:0,
  band:0, fill:0, info:.8, danger:0, car:null, lastTrial:null, jam:0, speedFactor:1, q:null, jamHoldT:0, streak:0,
  qType:'branch', rearDanger:false, rearDist:0, rearGap:56, rearActive:false, demoTarget:2, demoJam:0};
let path = buildPath(S.target);
const stageOf = z => z > -60 ? 1 : z > -115 ? 2 : z > CHANGE_END ? 3 : z > -275 ? 4 : 5;

function setTarget(i){
  // 테스트는 판단을 먼저 하도록 중앙 차로 유지(합류 없음), 시연은 정체 시 줄 뒤로 합류
  S.target = i; path = buildPath(i, S.testing ? 0 : S.jam); S.s = path.sStart; S.asked = false;
  S.band = 0; S.fill = 0; S.danger = 0; S.jamHoldT = 0;
  S.car = null; otherCar.visible = false;
  tagEls.forEach(t => t.op = 0);
  $$('#targetSeg button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.t===i)));
}
function setMode(m){
  S.mode = m;
  $('#arHud').style.display = m==='ar' ? '' : 'none';
  $('#navHud').style.display = m==='nav' ? '' : 'none';
  $$('#modeSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode===m)));
}
function setJam(lv){ S.jam = lv; $$('#jamSeg button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.j===lv))); }

/* ---------- 정체 대기열 ----------
   줄이 분기점 쪽으로 천천히 빠진다(qShift). 카메라는 update()의 하드 클램프로
   '맨 뒤차 뒤'에 고정돼 줄을 따라 서행할 뿐 절대 통과하지 않는다. */
let qShift = 0; // 대기열 누적 전진량(주행마다 0)
function tailZ(){ return JAM_LV[S.jam] ? JAM_LV[S.jam].back - qShift : null; } // 현재 맨 뒤차 z
function updateQueue(p, dt){
  const lv = JAM_LV[S.jam];
  if(!lv || !S.running){ queueCars.forEach(c => c.visible = false); return {backZ:null, mergeNear:false}; }
  if(!S.paused && !S.testing) qShift += 6*dt; // 정체 서서히 해소
  const tx = (S.target-1)*LANE, t = performance.now()/1000, back = lv.back - qShift;
  const n = Math.min(queueCars.length, Math.max(1, Math.round((lv.back - Q_FRONT)/Q_SPACE)));
  const zs = [];
  for(let k=0;k<queueCars.length;k++){
    const c = queueCars[k];
    if(k >= n){ c.visible = false; continue; }
    const z = back - k*Q_SPACE + Q_WAVE*Math.sin(t*1.4 + k*0.7); // 늘어선 줄 + 서행 물결
    if(z < Q_FRONT - 4){ c.visible = false; continue; } // 분기점 지난 차는 빠져나감
    zs.push(z);
    if(Math.abs(tx - p.x) < 1.4 && Math.abs(z - p.z) < 7){ c.visible = false; continue; } // 안전망: 카메라 클리핑 방지
    c.visible = true; c.position.set(tx, 0, z); c.rotation.y = 0;
  }
  const backZ = zs.length ? Math.max(...zs) : null;
  let mergeNear = false;
  for(let i=0;i<zs.length-1;i++){ if(zs[i] - zs[i+1] > Q_MERGE){ const mz=(zs[i]+zs[i+1])/2; if(Math.abs(mz - p.z) < 13) mergeNear = true; } }
  return {backZ, mergeNear };
}

/* ---------- 매 프레임 ---------- */
let lastStage = 0;
function update(dt){
  // 정체(시연): 맨 뒤차(빠지면서 앞으로 이동)보다 앞으로 못 가게 하드 클램프.
  // 줄을 따라 서행하다 정체가 풀리면 다시 주행.
  const tz = tailZ();
  const jamActive = S.jam > 0 && S.running && !S.testing && tz !== null && tz > Q_FRONT;
  if(jamActive){
    const guardZ = tz + 9; // 맨 뒤차보다 9m 뒤
    let z = path.curve.getPointAt(clamp(S.s/path.L)).z, g = 0;
    while(z < guardZ && S.s > 0 && g++ < 80){ S.s -= 1; z = path.curve.getPointAt(clamp(S.s/path.L)).z; }
    if(z <= guardZ + 2.5){ S.jamHoldT += dt; if(S.jamHoldT > 5){ finish(); } } // 5초 서행 뒤 마무리
  }

  const u = clamp(S.s/path.L);
  const p = path.curve.getPointAt(u), f = path.curve.getTangentAt(u);
  const ahead = path.curve.getPointAt(clamp((S.s+22)/path.L));
  camera.position.set(p.x,1.25,p.z); camera.lookAt(ahead.x,1.05,ahead.z);

  const st = stageOf(p.z), k = Math.min(1, dt*4), d = DEST[S.target];

  // 정체 대기열 + 줄 뒤에 다가갈수록 부드럽게 감속(시연)
  S.q = updateQueue(p, dt);
  S.speedFactor = 1;
  if(jamActive){
    const df = p.z - (tz + 9);
    if(df < 30) S.speedFactor = clamp(df/30, 0, 1); // 줄 뒤 30m부터 서서히 감속
  }

  // 뒤차 이벤트 — 가운데 도로 HUD로만 표시(옆 레이더 없음). 관통 없음.
  let dangerOn = false;
  const rtx = (S.target-1)*LANE;
  if(S.rearActive){
    if(S.testing){                              // 판단 테스트: 최종 거리까지 다가와 멈춤
      if(!S.paused) S.rearGap += (S.rearDist - S.rearGap) * Math.min(1, dt*1.3);
      S.danger = clamp((22 - S.rearGap)/8, 0, 1);
      dangerOn = S.rearGap < 22;
      otherCar.visible = false;                 // 뒤(화면 밖) → HUD로만
    } else {                                     // 시연: 뒤에서 다가와 옆 차로로 실제 지나감
      if(!S.paused) S.rearGap -= 13*dt;
      dangerOn = S.rearGap < 24 && S.rearGap > -12;
      S.danger += ((dangerOn?1:0) - S.danger) * Math.min(1, dt*6);
      // 옆 차로(rtx)에 3D 차 배치 — 뒤에서 와서 앞으로 지나감. 내 차는 중앙이라 관통 없음.
      otherCar.visible = S.target !== 1 && S.rearGap < 60 && S.rearGap > -95;
      if(otherCar.visible){ otherCar.position.set(rtx, 0, p.z + S.rearGap); otherCar.rotation.y = 0; }
      if(S.rearGap < -95) S.rearActive = false;
    }
    S.car = { pos:{ x:rtx, z: p.z + S.rearGap } };
  } else {
    S.danger += (0 - S.danger) * Math.min(1, dt*8);
    otherCar.visible = false; S.car = null;
  }

  if(S.running && S.testing && !S.asked && p.z <= TEST_Z) askQuestion();
  if(S.running && (u >= .985 || p.z < -318)) finish();

  if(st !== lastStage){ lastStage = st; $$('#stages li').forEach(li => li.classList.toggle('on', +li.dataset.s === st)); }

  const kmh = S.running && !S.paused ? Math.round(SPEED*3.6 + Math.sin(performance.now()/900)) : 0;
  const remainKm = Math.max(0, 3.4 - (S.s-40)/1000).toFixed(1);

  if(S.mode === 'ar') drawAr(p, f, st, d, k, dangerOn, kmh, remainKm);
  else drawNav(st, p, d, kmh, remainKm, dangerOn);
}

let prev = performance.now();
function frame(now){
  const dt = Math.min(.05,(now-prev)/1000); prev = now;
  if(S.running && !S.paused) S.s += SPEED*(S.speedFactor||1)*dt;
  update(dt);
  renderer.render(scene,camera);
  requestAnimationFrame(frame);
}

/* ---------- 흐름 ---------- */
function start(testing){
  $('#intro').hidden = true; $('#drawer').classList.remove('open');
  S.testing = testing;
  if(testing){
    // 판단 테스트: 문제 유형을 무작위로 — 지선 선택 / 뒤차 판단
    S.qType = Math.random() < 0.45 ? 'danger' : 'branch';
    if(S.qType === 'danger'){
      setJam(0);
      setTarget(Math.random() < 0.5 ? 0 : 2);   // 뒤차는 옆 차로로 옮기는 상황
      // 뒤차 최종 거리 무작위(가까우면 위험) + 멀리서 시작해 다가온다
      S.rearDist = Math.random() < 0.5 ? (8 + Math.random()*6) : (30 + Math.random()*12);
      S.rearDanger = S.rearDist < 20;
      S.rearGap = 56; S.rearActive = true;
    } else {
      setJam(Math.floor(Math.random()*3));
      setTarget(Math.floor(Math.random()*3));
      S.rearActive = false;
    }
    // 왼쪽 '시연 상황' 표시는 사용자가 고른 값 그대로 유지 (테스트가 덮어쓰지 않음)
    $$('#targetSeg button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.t===S.demoTarget)));
    $$('#jamSeg button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.j===S.demoJam)));
  } else {
    // 시연: 사용자가 왼쪽에서 고른 목적지·정체 그대로
    S.qType = 'branch';
    setJam(S.demoJam); setTarget(S.demoTarget);
    // 옆 차로 목적지 + 정체 없음이면 뒤차가 뒤에서 다가와 옆으로 지나가는 상황
    S.rearActive = (S.demoTarget !== 1 && S.demoJam === 0);
    if(S.rearActive) S.rearGap = 45;
  }
  qShift = 0;
  $('#scenario').style.opacity = testing ? '.4' : '';   // 테스트 중엔 시연 설정 비활성 느낌
  $$('#scenario button').forEach(b => b.disabled = testing);
  $$('#modeSeg button').forEach(b => b.disabled = testing);
  S.running = true; S.paused = false; $('#pauseBtn').textContent = '일시정지';
  update(1);
}
function finish(){
  S.running = false;
  const wasTest = S.testing; S.testing = false;
  $('#scenario').style.opacity = ''; $$('#scenario button').forEach(b => b.disabled = false);
  $$('#modeSeg button').forEach(b => b.disabled = false);
  if(wasTest && S.lastTrial){
    const t = S.lastTrial;
    let why = '';
    if(!t.correct){
      if(t.type === 'danger') why = t.rearDanger ? ' — 뒤차가 접근 중이라 기다려야 했어요.' : ' — 뒤차가 없어 옮겨도 됐어요.';
      else why = ` — 정답은 ${DEST[t.target].side} 지선이었어요.`;
    }
    const rating = !t.correct ? '' : t.ms < 900 ? '아주 빠름 · ' : t.ms < 1600 ? '좋아요 · ' : '조금 늦음 · ';
    const streakTxt = (t.correct && S.streak >= 2) ? ` · ${S.streak}연속` : '';
    $('#cardTitle').textContent = t.correct ? '정답' : '오답';
    $('#cardTitle').style.color = t.correct ? 'var(--ok)' : 'var(--bad)';
    $('#cardText').textContent = t.correct
      ? `${rating}판단 시간 ${(t.ms/1000).toFixed(2)}초${streakTxt}`
      : `판단 시간 ${(t.ms/1000).toFixed(2)}초${why}`;
    $('#demoBtn').textContent = '시연 보기'; $('#testBtn').textContent = '다음 테스트';
  } else if(S.jam > 0){
    $('#cardTitle').style.color = '';
    $('#cardTitle').textContent = '줄 뒤에서 대기';
    $('#cardText').textContent = '정체 구간, 줄 맨 뒤에 안전하게 정지했습니다.';
    $('#demoBtn').textContent = '다시 보기'; $('#testBtn').textContent = '판단 테스트';
  } else {
    $('#cardTitle').style.color = '';
    $('#cardTitle').textContent = '주행 완료';
    $('#cardText').textContent = '다시 볼 수 있습니다.';
    $('#demoBtn').textContent = '다시 보기'; $('#testBtn').textContent = '판단 테스트';
  }
  $('#intro').hidden = false;
}
function askQuestion(){
  S.asked = true; S.paused = true; S.t0 = performance.now();
  const danger = S.qType === 'danger';
  $('#quizTitle').textContent = danger ? `${DEST[S.target].side} 차로로 지금 옮겨도 될까요?` : '어느 지선으로 가야 하나요?';
  $('#quizSub').textContent = danger ? '가운데 HUD의 뒤차 경고를 보고 판단하세요.' : 'HUD를 보고 최대한 빨리 고르세요.';
  $('#choicesBranch').hidden = danger;
  $('#choicesDanger').hidden = !danger;
  $('#quiz').hidden = false;
}
function answer(val){
  if($('#quiz').hidden) return;
  const ms = performance.now() - S.t0;
  const base = {p:($('#pid').value||'P1').trim(), mode:S.mode, jam:S.jam, ms:Math.round(ms), at:new Date().toISOString()};
  let trial;
  if(S.qType === 'danger'){
    if(val !== 'wait' && val !== 'go') return;          // 뒤차: ↑ 기다린다 / → 옮긴다
    const correct = (val === 'wait') === S.rearDanger;   // 위험하면 기다려야 정답
    trial = {...base, type:'danger', target:S.target, choice:val, rearDanger:S.rearDanger, correct};
  } else {
    if(typeof val !== 'number') return;                  // 지선: 0/1/2
    trial = {...base, type:'branch', target:S.target, choice:val, correct: val === S.target};
  }
  $('#quiz').hidden = true;
  S.lastTrial = trial; trials.push(trial); save(); renderLog();
  S.streak = trial.correct ? (S.streak||0) + 1 : 0;
  finish(); // 답하면 즉시 멈추고 결과를 보여준다 (계속 주행하지 않음)
}

/* ---------- 기록 ---------- */
const KEY = 'hud-mvp-trials-v1';
let trials = [];
try{ trials = JSON.parse(localStorage.getItem(KEY) || '[]'); if(!Array.isArray(trials)) trials = []; }catch(e){ trials = []; }
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(trials)); }catch(e){} }
const modeName = m => m==='ar' ? '우리 HUD' : '기존 HUD';
const jamName = j => ({0:'없음',1:'보통',2:'심함'})[j] ?? '-';
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function renderLog(){
  $('#logCount').textContent = trials.length;
  $('#logEmpty').hidden = trials.length > 0;
  $('#logBody').innerHTML = trials.slice().reverse().map(t => {
    const dg = t.type === 'danger';
    const situ = dg ? '뒤차' : jamName(t.jam);
    const ans = dg ? (t.rearDanger ? '대기' : '이동') : DEST[t.target].side;
    const cho = dg ? (t.choice === 'wait' ? '대기' : '이동') : DEST[t.choice].side;
    return `<tr><td>${esc(t.p)}</td><td>${modeName(t.mode)}</td><td>${situ}</td><td>${ans}</td><td>${cho}</td><td class="${t.correct?'ok':'bad'}">${t.correct?'정답':'오답'}</td><td>${(t.ms/1000).toFixed(2)}</td></tr>`;
  }).join('');
  $('#summary').innerHTML = ['ar','nav'].map(m => {
    const list = trials.filter(t => t.mode===m), ok = list.filter(t => t.correct);
    const rate = list.length ? Math.round(ok.length/list.length*100)+'%' : '-';
    const avg = ok.length ? (ok.reduce((a,t)=>a+t.ms,0)/ok.length/1000).toFixed(2)+'초' : '-';
    return `<div><strong>${modeName(m)}</strong>시도 <em>${list.length}</em>회<br>정답률 <em>${rate}</em><br>평균 판단 시간 <em>${avg}</em></div>`;
  }).join('');
}
function csv(){
  const rows = [['참가자','HUD','상황','정답','선택','결과','판단시간(초)','기록시각']];
  trials.forEach(t => {
    const dg = t.type === 'danger';
    const situ = dg ? '뒤차' : jamName(t.jam);
    const ans = dg ? (t.rearDanger ? '대기' : '이동') : DEST[t.target].side;
    const cho = dg ? (t.choice === 'wait' ? '대기' : '이동') : DEST[t.choice].side;
    rows.push([t.p, modeName(t.mode), situ, ans, cho, t.correct?'정답':'오답', (t.ms/1000).toFixed(3), t.at]);
  });
  return rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
}

/* ---------- 이벤트 ---------- */
$('#demoBtn').onclick = $('#demoSide').onclick = () => start(false);
$('#testBtn').onclick = $('#testSide').onclick = () => start(true);
$$('#modeSeg button').forEach(b => b.onclick = () => { setMode(b.dataset.mode); update(1); });
$$('#targetSeg button').forEach(b => b.onclick = () => { if(!S.running){ S.demoTarget = +b.dataset.t; setTarget(S.demoTarget); update(1); } });
$$('#jamSeg button').forEach(b => b.onclick = () => { if(!S.running){ S.demoJam = +b.dataset.j; setJam(S.demoJam); update(1); } });
$$('#choicesBranch button').forEach(b => b.onclick = () => answer(+b.dataset.c));
$$('#choicesDanger button').forEach(b => b.onclick = () => answer(b.dataset.a));
function togglePause(){
  if(!S.running || !$('#quiz').hidden) return;
  S.paused = !S.paused; $('#pauseBtn').textContent = S.paused ? '계속' : '일시정지';
}
$('#pauseBtn').onclick = togglePause;
$('#logBtn').onclick = () => $('#drawer').classList.toggle('open');
$('#closeDrawer').onclick = () => $('#drawer').classList.remove('open');
$('#copyCsv').onclick = async () => {
  const text = csv();
  try{ await navigator.clipboard.writeText(text); $('#copyCsv').textContent = '복사했습니다'; setTimeout(()=>$('#copyCsv').textContent='CSV 복사',1400); }
  catch(e){ const box = $('#csvBox'); box.hidden = false; box.value = text; box.select(); }
};
$('#clearLog').onclick = () => { if(confirm('테스트 기록을 모두 지울까요?')){ trials = []; save(); renderLog(); } };
addEventListener('keydown', e => {
  if(e.target.tagName === 'INPUT') return;
  if(!$('#quiz').hidden){
    if(S.qType === 'danger'){                              // ↑ 기다린다 / → 옮긴다
      if(e.key === 'ArrowUp'){ e.preventDefault(); answer('wait'); }
      else if(e.key === 'ArrowRight'){ e.preventDefault(); answer('go'); }
    } else {
      const map = {ArrowLeft:0, ArrowUp:1, ArrowRight:2};  // 지선: 화살표만
      if(e.key in map){ e.preventDefault(); answer(map[e.key]); }
    }
  } else if(e.code === 'Space'){ e.preventDefault(); togglePause(); }
});

/* ---------- 시작 ---------- */
setMode('ar'); setJam(0); setTarget(2); renderLog(); update(1);
requestAnimationFrame(frame);
