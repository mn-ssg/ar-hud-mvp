/* ============================================================
   main.js — 상태 · 맵 · 경로 · 정체 대기열 · 매 프레임 루프 · 흐름 · 기록 · 이벤트
   config.js, maps.js, scene.js, hud.js 다음(마지막)에 로드.
   ============================================================ */

/* ---------- 경로 ----------
   시작 차로 → (옮길 차로) → 첫 갈림 → 목적지. 갈림 뒤는 maps.js makeRoute()의 after(내 차로 선) */
function buildPath(R, jam){
  const x0 = R.x0, tx = R.tx;
  let pts, mergeZ = -128;
  if(jam > 0 && tx !== x0){
    // 정체 시: 대기열 뒤끝(back)보다 더 뒤(양의 z)에서 합류를 끝낸다 → 줄 맨 뒤에 붙음(관통 없음)
    const mEnd = JAM_LV[jam].back + 20, mStart = Math.min(0, mEnd + 50);
    mergeZ = mStart;
    pts = [V(x0,40), V(x0,mStart), V((x0+tx)/2,(mStart+mEnd)/2), V(tx,mEnd), V(tx,-218)];
  } else {
    pts = [V(x0,40),V(x0,0),V(x0,-100),V(x0,-128),V((x0+tx)/2,-170),V(tx,-203),V(tx,-218)];
  }
  const curve = curveOf(pts.concat(R.after), 1000), L = curve.getLength();
  // 갈림마다 경로 위 거리(s): 첫 갈림은 z = FORK_Z를 지나는 곳, 다음 갈림은 갈림 점에 가장 가까운 곳
  const samples = []; for(let s=0; s<=L; s+=1) samples.push(curve.getPointAt(s/L));
  const nodeS = R.nodes.map((n, i) => {
    let best = 0, bd = Infinity;
    samples.forEach((q, s) => { const d = i === 0 ? Math.abs(q.z - FORK_Z) : Math.hypot(q.x - n.pt[0], q.z - n.pt[1]); if(d < bd){ bd = d; best = s; } });
    return best;
  });
  return {curve, L, sStart:40, mergeZ, nodeS};
}
// 다음 갈림: 번호 i · 남은 거리 d(경로 위 m) · 진행 단계 st(1 접근 · 2 지선 구분 · 3 차로 옮김 · 4 진입 · 5 도착)
function navCtx(s){
  const ns = path.nodeS; let i = 0;
  while(i < ns.length - 1 && s > ns[i] + 45) i++;
  const d = ns[i] - s;
  return {i, d, node:S.route.nodes[i], st: d > 170 ? 1 : d > 115 ? 2 : d > 25 ? 3 : d > -45 ? 4 : 5};
}

/* ---------- 상태 ---------- */
const S = {mode:'ar', map:null, route:null, target:0, startLane:1, running:false, paused:false, s:40, testing:false, asked:false, t0:0,
  fill:0, danger:0, car:null, lastTrial:null, jam:0, speedFactor:1, q:null, jamHoldT:0, streak:0, qIdx:0, qS:0,
  qType:'branch', rearDanger:false, rearDist:0, rearGap:56, rearActive:false, demoMap:'Y3', demoTarget:2, demoJam:0};
let path = null;
const pick = a => a[Math.floor(Math.random()*a.length)];
const mapLabel = id => { const m = mapById(id); return m ? `${m.no} ${m.name}` : '-'; };

function loadMap(m){
  if(S.map === m) return;
  S.map = m; showMap(m); buildNavLanes(m);
}
// 시연에서 기본 목적지: 차로를 옮겨야 하는 마지막 목적지(뒤차가 지나가는 상황을 볼 수 있게)
const defaultLeaf = m => { const c = leafIdxs(m, (l, i) => makeRoute(m, i, m.start[0]).side !== 0); return c.length ? c[c.length-1] : 0; };

function setTarget(i, lane){
  // 테스트는 판단을 먼저 하도록 질문 전엔 차로를 옮기지 않음(정체 경로 없음), 시연은 정체 시 줄 뒤로 합류
  S.target = i; S.startLane = lane ?? S.map.start[0];
  S.route = makeRoute(S.map, i, S.startLane);
  path = buildPath(S.route, S.testing ? 0 : S.jam); S.s = path.sStart; S.asked = false;
  S.fill = 0; S.danger = 0; S.jamHoldT = 0;
  S.car = null; otherCar.visible = false;
  resetHud();
}
function setMode(m){
  S.mode = m;
  $('#arHud').style.display = m==='ar' ? '' : 'none';
  $('#navHud').style.display = m==='nav' ? '' : 'none';
  $$('#modeSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode===m)));
}
// 왼쪽 '시연 상황' 패널: 사용자가 고른 맵 · 목적지 · 정체 (테스트가 덮어쓰지 않음)
function renderScenario(){
  const m = mapById(S.demoMap);
  $$('#mapSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === S.demoMap)));
  $('#mapName').textContent = `${m.no} ${m.name}`;
  const seg = $('#targetSeg');
  if(seg.dataset.map !== m.id){
    seg.dataset.map = m.id; seg.innerHTML = '';
    m.leaves.forEach((l, i) => {
      const b = document.createElement('button'); b.dataset.t = i; b.textContent = l.label;
      b.onclick = () => { if(stopDemo()){ S.demoTarget = i; prepDemo(); update(1); } };
      seg.appendChild(b);
    });
  }
  $$('#targetSeg button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.t === S.demoTarget)));
  $$('#jamSeg button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.j === S.demoJam)));
}
// 시연 중에 시연 상황을 바꾸면 시연을 멈추고 바로 바꾼다 (판단 테스트 중에는 잠금)
function stopDemo(){
  if(S.testing) return false;
  if(S.running){ S.running = false; S.paused = false; $('#pauseBtn').textContent = '일시정지'; $('#cardTitle').style.color = ''; $('#demoBtn').textContent = '시연 보기'; $('#testBtn').textContent = '판단 테스트'; $('#intro').hidden = false; }
  return true;
}
function prepDemo(){
  loadMap(mapById(S.demoMap)); renderScenario();
  S.jam = S.demoJam; setTarget(S.demoTarget);
  if(!S.running){ $('#cardTitle').style.color = ''; }
}

/* ---------- 정체 대기열 ----------
   줄이 분기점 쪽으로 천천히 빠진다(qShift). 카메라는 update()의 하드 클램프로
   '맨 뒤차 뒤'에 고정돼 줄을 따라 서행할 뿐 절대 통과하지 않는다. */
let qShift = 0; // 대기열 누적 전진량(주행마다 0)
function tailZ(){ return JAM_LV[S.jam] ? JAM_LV[S.jam].back - qShift : null; } // 현재 맨 뒤차 z
function updateQueue(p, dt){
  const lv = JAM_LV[S.jam];
  if(!lv || !S.running){ queueCars.forEach(c => c.visible = false); return {backZ:null, mergeNear:false}; }
  if(!S.paused && !S.testing) qShift += 6*dt; // 정체 서서히 해소
  const tx = S.route.tx, t = performance.now()/1000, back = lv.back - qShift;
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

/* ---------- 핸들 ----------
   곡률을 바로 쓰면 경로 제어점마다 각도가 튀어서, 1초 앞 지점을 겨누는 방식(pure pursuit)으로 부드럽게.
   판단 테스트 질문 시점(갈림 150m 앞)까지는 경로가 곧아 0° → 핸들이 정답을 흘리지 않는다. */
const wheelTurn = $$('#wheel .turn');
let steer = 0;
function updateWheel(p, f, dt){
  const q = path.curve.getPointAt(clamp((S.s + STEER_LOOK)/path.L));
  const dx = q.x - p.x, dz = q.z - p.z, sinA = (f.x*dz - f.z*dx)/(Math.hypot(dx,dz)||1); // + = 오른쪽
  const deg = Math.atan(2*WHEELBASE*sinA/STEER_LOOK)*STEER_RATIO*STEER_GAIN*180/Math.PI;
  steer += (deg - steer)*Math.min(1, dt*4);
  wheelTurn.forEach(g => g.setAttribute('transform', `rotate(${steer.toFixed(2)} 200 200)`));
}

/* ---------- 매 프레임 ---------- */
let lastStage = 0;
function update(dt){
  // 정체(시연): 맨 뒤차(빠지면서 앞으로 이동)보다 앞으로 못 가게 하드 클램프.
  // 줄을 따라 서행하다 정체가 풀리면 다시 주행.
  const tz = tailZ();
  const jamActive = S.jam > 0 && S.running && !S.testing && tz !== null && tz > Q_FRONT;
  const guardZ = tz + 9; // 맨 뒤차보다 9m 뒤
  if(jamActive){
    let z = path.curve.getPointAt(clamp(S.s/path.L)).z, g = 0;
    while(z < guardZ && S.s > 0 && g++ < 80){ S.s -= 1; z = path.curve.getPointAt(clamp(S.s/path.L)).z; }
    if(z <= guardZ + 2.5){ S.jamHoldT += dt; if(S.jamHoldT > 5){ finish(); } } // 5초 서행 뒤 마무리
  }

  const u = clamp(S.s/path.L);
  const p = path.curve.getPointAt(u), f = path.curve.getTangentAt(u);
  const ahead = path.curve.getPointAt(clamp((S.s+22)/path.L));
  camera.position.set(p.x,1.25,p.z); camera.lookAt(ahead.x,1.05,ahead.z);
  updateWheel(p, f, dt);

  const C = navCtx(S.s), k = Math.min(1, dt*4), R = S.route;

  // 정체 대기열 + 줄 뒤에 다가갈수록 부드럽게 감속(시연)
  S.q = updateQueue(p, dt);
  S.speedFactor = 1;
  if(jamActive){
    const df = p.z - guardZ;
    if(df < 30) S.speedFactor = clamp(df/30, 0, 1); // 줄 뒤 30m부터 서서히 감속
  }

  // 뒤차 이벤트 — 가운데 도로 HUD로만 표시(옆 레이더 없음). 관통 없음.
  let dangerOn = false;
  const rtx = R.tx;
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
      // 옮길 차로(rtx)에 3D 차 배치 — 뒤에서 와서 앞으로 지나감. 내 차는 아직 옆 차로라 관통 없음.
      otherCar.visible = R.side !== 0 && S.rearGap < 60 && S.rearGap > -95;
      if(otherCar.visible){ otherCar.position.set(rtx, 0, p.z + S.rearGap); otherCar.rotation.y = 0; }
      if(S.rearGap < -95) S.rearActive = false;
    }
    S.car = { pos:{ x:rtx, z: p.z + S.rearGap } };
  } else {
    S.danger += (0 - S.danger) * Math.min(1, dt*8);
    otherCar.visible = false; S.car = null;
  }

  if(S.running && S.testing && !S.asked && S.s >= S.qS) askQuestion();
  if(S.running && (u >= .985 || S.s > path.nodeS[path.nodeS.length-1] + 88)) finish();

  if(C.st !== lastStage){ lastStage = C.st; $$('#stages li').forEach(li => li.classList.toggle('on', +li.dataset.s === C.st)); }

  const kmh = S.running && !S.paused ? Math.round(SPEED*3.6 + Math.sin(performance.now()/900)) : 0;
  const remainKm = Math.max(0, 3.4 - (S.s-40)/1000).toFixed(1);

  if(S.mode === 'ar') drawAr(p, f, C, k, dangerOn, kmh);
  else drawNav(C, kmh, remainKm, dangerOn);
}

let prev = performance.now();
function frame(now){
  const dt = Math.min(.05,(now-prev)/1000); prev = now;
  if(S.running && !S.paused) S.s += SPEED*(S.speedFactor||1)*dt;
  update(dt);
  renderScene();
  requestAnimationFrame(frame);
}

/* ---------- 흐름 ---------- */
// 판단 테스트 맵: 섞어서 한 바퀴씩 (다 쓰면 다시 섞음) → HUD마다 맵이 고르게 돈다
const TEST_MAPS = MAPS.map(m => m.id);
let testBag = [];
function nextTestMap(){
  if(!testBag.length){ testBag = TEST_MAPS.slice(); for(let i=testBag.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [testBag[i], testBag[j]] = [testBag[j], testBag[i]]; } }
  return mapById(testBag.pop());
}
function start(testing){
  $('#intro').hidden = true; $('#drawer').classList.remove('open');
  S.testing = testing;
  if(testing){
    const m = nextTestMap(); loadMap(m);
    const lane = pick(m.start);
    // 판단 테스트: 문제 유형을 무작위로 — 지선 선택 / 뒤차 판단
    S.qType = Math.random() < 0.45 ? 'danger' : 'branch';
    if(S.qType === 'danger'){
      S.jam = 0;
      setTarget(pick(leafIdxs(m, (l, i) => l.quiz && makeRoute(m, i, lane).side !== 0)), lane);   // 뒤차는 옆 차로로 옮기는 상황
      // 뒤차 최종 거리 무작위(가까우면 위험) + 멀리서 시작해 다가온다
      S.rearDist = Math.random() < 0.5 ? (8 + Math.random()*6) : (30 + Math.random()*12);
      S.rearDanger = S.rearDist < 20;
      S.rearGap = 56; S.rearActive = true;
      S.qIdx = 0;
    } else {
      S.jam = m.id === 'SEQ' ? 0 : Math.floor(Math.random()*3);   // ⑤는 램프 질문까지 가야 해서 정체 없음 (설계 C6)
      setTarget(pick(leafIdxs(m, l => l.quiz)), lane);
      S.rearActive = false;
      S.qIdx = S.route.nodes.length - 1;                            // 경로의 마지막 갈림을 묻는다
    }
    S.qS = path.nodeS[S.qIdx] - Q_LEAD;
  } else {
    // 시연: 사용자가 왼쪽에서 고른 맵·목적지·정체 그대로
    S.qType = 'branch';
    prepDemo();
    // 옮겨야 하는 목적지 + 정체 없음이면 뒤차가 뒤에서 다가와 옆으로 지나가는 상황
    S.rearActive = (S.route.side !== 0 && S.demoJam === 0);
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
      else why = ` — 정답은 ${KEY_WORD[t.target]}이었어요.`;
    }
    const rating = !t.correct ? '' : t.ms < 900 ? '아주 빠름 · ' : t.ms < 1600 ? '좋아요 · ' : '조금 늦음 · ';
    const streakTxt = (t.correct && S.streak >= 2) ? ` · ${S.streak}연속` : '';
    $('#cardTitle').textContent = t.correct ? '정답' : '오답';
    $('#cardTitle').style.color = t.correct ? 'var(--ok)' : 'var(--bad)';
    $('#cardText').textContent = t.correct
      ? `${mapLabel(t.map)} · ${rating}판단 시간 ${(t.ms/1000).toFixed(2)}초${streakTxt}`
      : `${mapLabel(t.map)} · 판단 시간 ${(t.ms/1000).toFixed(2)}초${why}`;
    $('#demoBtn').textContent = '시연 보기'; $('#testBtn').textContent = '다음 테스트';
  } else if(S.jam > 0){
    $('#cardTitle').style.color = '';
    $('#cardTitle').textContent = '줄 뒤에서 대기';
    $('#cardText').textContent = '정체 구간, 줄 맨 뒤에 안전하게 정지했습니다.';
    $('#demoBtn').textContent = '다시 보기'; $('#testBtn').textContent = '판단 테스트';
  } else {
    $('#cardTitle').style.color = '';
    $('#cardTitle').textContent = '주행 완료';
    $('#cardText').textContent = `${mapLabel(S.map.id)} · 다시 볼 수 있습니다.`;
    $('#demoBtn').textContent = '다시 보기'; $('#testBtn').textContent = '판단 테스트';
  }
  $('#intro').hidden = false;
}
function askQuestion(){
  S.asked = true; S.paused = true; S.t0 = performance.now();
  const danger = S.qType === 'danger', keys = S.route.nodes[S.qIdx].keys;
  $('#quizTitle').textContent = danger ? `${S.route.side < 0 ? '왼쪽' : '오른쪽'} 차로로 지금 옮겨도 될까요?` : '어느 쪽으로 가야 하나요?';
  $('#quizSub').textContent = danger ? 'HUD를 보고 판단하세요.' : 'HUD를 보고 최대한 빨리 고르세요.';
  // 그 갈림에 있는 갈래만 보인다 (② ↑ → · ③ ← ↑ · ④⑤ ← →)
  $$('#choicesBranch button').forEach(b => b.hidden = !keys.includes('LSR'[+b.dataset.c]));
  $('#choicesBranch').classList.toggle('two', keys.length === 2);
  $('#choicesBranch').hidden = danger;
  $('#choicesDanger').hidden = !danger;
  $('#quiz').hidden = false;
}
function answer(val){
  if($('#quiz').hidden) return;
  const ms = performance.now() - S.t0, node = S.route.nodes[S.qIdx];
  const base = {p:($('#pid').value||'P1').trim(), mode:S.mode, map:S.map.id, jam:S.jam, ms:Math.round(ms), at:new Date().toISOString()};
  let trial;
  if(S.qType === 'danger'){
    if(val !== 'wait' && val !== 'go') return;          // 뒤차: ↑ 기다린다 / → 옮긴다
    const correct = (val === 'wait') === S.rearDanger;   // 위험하면 기다려야 정답
    trial = {...base, type:'danger', n:2, choice:val, rearDanger:S.rearDanger, correct};
  } else {
    if(typeof val !== 'number' || !node.keys.includes('LSR'[val])) return;   // 그 갈림에 없는 방향 키는 무시
    const target = KEY_IDX[node.key];
    trial = {...base, type:'branch', n:node.keys.length, target, choice:val, correct: val === target};
  }
  $('#quiz').hidden = true;
  S.lastTrial = trial; trials.push(trial); save(); renderLog();
  S.streak = trial.correct ? (S.streak||0) + 1 : 0;
  finish(); // 답하면 즉시 멈추고 결과를 보여준다 (계속 주행하지 않음)
}

/* ---------- 기록 ----------
   v2: 맵 · 선택지 수 추가 (맵 5종, D29). v1 기록은 브라우저에 그대로 남는다 */
const KEY = 'hud-mvp-trials-v2';
let trials = [];
try{ trials = JSON.parse(localStorage.getItem(KEY) || '[]'); if(!Array.isArray(trials)) trials = []; }catch(e){ trials = []; }
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(trials)); }catch(e){} }
const modeName = m => m==='ar' ? '우리 HUD' : m==='nav' ? '기존 HUD' : m;
const jamName = j => ({0:'없음',1:'보통',2:'심함'})[j] ?? '-';
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const cells = t => {
  const dg = t.type === 'danger';
  return {situ: dg ? '뒤차' : jamName(t.jam), ans: dg ? (t.rearDanger ? '대기' : '이동') : KEY_WORD[t.target], cho: dg ? (t.choice === 'wait' ? '대기' : '이동') : KEY_WORD[t.choice]};
};
function renderLog(){
  $('#logCount').textContent = trials.length;
  $('#logEmpty').hidden = trials.length > 0;
  $('#logBody').innerHTML = trials.slice().reverse().map(t => {
    const c = cells(t), m = mapById(t.map);
    return `<tr><td>${esc(t.p)}</td><td>${modeName(t.mode)}</td><td>${m ? m.no : '-'}</td><td>${c.situ}</td><td>${c.ans}</td><td>${c.cho}</td><td class="${t.correct?'ok':'bad'}">${t.correct?'정답':'오답'}</td><td>${(t.ms/1000).toFixed(2)}</td></tr>`;
  }).join('');
  $('#summary').innerHTML = ['ar','nav'].map(m => {
    const list = trials.filter(t => t.mode===m), ok = list.filter(t => t.correct);
    const rate = list.length ? Math.round(ok.length/list.length*100)+'%' : '-';
    const avg = ok.length ? (ok.reduce((a,t)=>a+t.ms,0)/ok.length/1000).toFixed(2)+'초' : '-';
    return `<div><strong>${modeName(m)}</strong>시도 <em>${list.length}</em>회<br>정답률 <em>${rate}</em><br>평균 판단 시간 <em>${avg}</em></div>`;
  }).join('');
}
function csv(){
  const rows = [['참가자','HUD','맵','상황','정답','선택','선택지 수','결과','판단시간(초)','기록시각']];
  trials.forEach(t => {
    const c = cells(t);
    rows.push([t.p, modeName(t.mode), mapLabel(t.map), c.situ, c.ans, c.cho, t.n, t.correct?'정답':'오답', (t.ms/1000).toFixed(3), t.at]);
  });
  return rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
}

/* ---------- 이벤트 ---------- */
$('#demoBtn').onclick = $('#demoSide').onclick = () => start(false);
$('#testBtn').onclick = $('#testSide').onclick = () => start(true);
$$('#modeSeg button').forEach(b => b.onclick = () => { setMode(b.dataset.mode); update(1); });
$$('#mapSeg button').forEach(b => b.onclick = () => {
  if(!stopDemo()) return;
  S.demoMap = b.dataset.m; S.demoTarget = defaultLeaf(mapById(S.demoMap)); prepDemo();
  $('#cardTitle').textContent = mapLabel(S.demoMap); $('#cardText').textContent = 'HUD가 가야 할 지선을 안내합니다.';
  update(1);
});
$$('#jamSeg button').forEach(b => b.onclick = () => { if(stopDemo()){ S.demoJam = +b.dataset.j; prepDemo(); update(1); } });
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
      const map = {ArrowLeft:0, ArrowUp:1, ArrowRight:2};  // 지선: 화살표만 (그 갈림에 없는 방향은 answer가 무시)
      if(e.key in map){ e.preventDefault(); answer(map[e.key]); }
    }
  } else if(e.code === 'Space'){ e.preventDefault(); togglePause(); }
});

/* ---------- 시작 ---------- */
setMode('ar'); prepDemo(); renderLog(); update(1);
$('#cardTitle').textContent = mapLabel(S.demoMap);
requestAnimationFrame(frame);
prebuildMaps(() => !S.running);   // 멈춰 있을 때 나머지 맵을 미리 지어 둔다
