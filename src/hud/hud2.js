/* ============================================================
   hud2.js — 우리 HUD 2.2 (개선 후 — 2026-11-03 2.1, 2026-11-07 그래픽 2.2 D107: 위에서 본 실루엣 아이콘 · 채움 .7 · 윤곽 .34 · 번짐 1.6 · 먼 곳 소실. 정보 구조 · 상태 6개 · 판단은 2.1 그대로) · 10주차 발표 '2차 HUD 디자인 근거 · 상태 6개'를 그대로 옮김
   · 자리 · 크기 · 정보 구조 · 길 안내(① 들어갈 차로 ② 갈 방향 ③ 막대 ④ 제한속도)는 개선 전(hud.js drawAr, 1차 실험 v1.9)과 같다
   · 바뀐 것은 뒤차 표현뿐 — 움직이는 뒤차(가장 가까운 한 대, 꺾쇠 = 접근 속도) · 거리 구간(내 차 뒤부터 뒤차까지, 간격 막대 대신) · 더 오는 차 흐름 띠 · 가장자리 빛 · 깜빡임 (2026-11-03 사용자 선택 4-C · 7-B).
     뺀 것: 작은 경고 아이콘(#carBehind) · 크기 변화(원근 도로에서 반대로 읽힘)
   · 상태 6개 (data-level): 0 안전 / 1 감지(흐린 흰색, fade in) / 2 주의(주황, 뒤차가 올라옴, 같은 쪽 가장자리 빛) /
     3 대기(빨강, 이동 화살표 빨간 점으로 멈춤, 위험 구간, 깜빡임, 갈 방향 흐리게, 막대 회색) / 4 위험 강화(차로 경계 빨간 선, 가장자리 빛 최대, 깜빡임 속도 그대로) /
     해소(뒤차 fade out · 초록 해소 신호 한 번 = 들어갈 차로 전체가 초록으로 찼다 천천히 빠짐 + 빨간 점이 초록 화살표로 바뀌며 한 번 커짐 · 화살표 다시 흐름)
   · 2026-11-04 보이는 정도만 고침(구조 그대로): 갈 방향 화살표 키움(네모 바탕 · 모양 그림자는 넣었다가 사용자 요청으로 삭제) · 깜빡임 켜짐/꺼짐 딱 끊김(REAR2.blink · blinkDuty · blinkLow) · 해소 신호 차로 전체 초록 + 화살표 한 번 커짐(REAR2.clearT, 사용자 선택 A+C)
   · 2026-11-07 (D102): 미니 도로 투영을 내 차 기준 → 도로 기준으로(roadFrame · makeProjRoad) — 핸들을 틀어도 미니 도로는 제자리, 내 차 아이콘만 옆으로 움직이고 살짝 기울어짐. 정보 · 판단은 그대로
   · 판단: 대기 · 해소는 guide.js 게이트(S.G.gate — 1차와 같은 10m · 3.5초, 해제는 1.2배 + 0.8초 유지 → 경계값에서 깜빡이지 않음).
     감지 · 주의 값은 config.js REAR2 (파일럿에서 정함). 내릴 때는 REAR2.dwell초 머문 뒤 · 올릴 때는 바로
   · 색 · 굵기 · 투명도 · 시간은 hud.css 맨 위 토큰(--h2-*)을 읽어 쓴다 — 상태에 따라 바뀌는 값만 여기서 넣고, 정적인 값은 CSS
   config.js · guide.js · hud.js 다음에 로드. S · path · EGO는 main.js (호출 시점엔 존재)
   ============================================================ */

const B_BEHIND = 14;   // 미니 도로를 내 차 뒤 이만큼(m)까지 그린다 — 뒤차가 실제 쪽 차로에서 내 차 쪽으로 올라오는 자리
const ICON_Y = 30;     // 갈 방향 화살표 가운데 y (HUD 상자 단위). 막대 y = ICON_Y + 13 × --h2-icon-scale + --h2-sp3 (2026-11-04)
/* ---------- 미니 도로 투영: 도로 기준 (2026-11-07, D102) ----------
   예전(makeProj2)은 내 차 위치 · 방향 기준이라 핸들을 조금만 틀어도 미니 도로 전체가 좌우로 밀리고 돌았다.
   · 기준 방향 = 내 차가 있는 도로의 진행 방향: 본선(갈림 전)은 -z 고정, 갈림을 지나면 내 차가 올라탄 출구 곡선의 접선(일반도로 우회전 뒤엔 가로 도로 방향)
   · 기준 옆 위치 = 도로 가운데(본선 가운데 · 출구 가운데)에 고정 → 차로를 바꿔도 미니 도로는 제자리, 내 차 아이콘(#bEgo)이 차로 사이를 옆으로 움직인다
   · 앞뒤 기준은 내 차(도로가 앞으로 흘러오는 것은 그대로). 원근식(K · PXM · HY_*)은 hud.js makeProj와 같고 뒤(d < 0)는 B_BEHIND까지
   · 기준이 바뀌어 튈 때(본선 → 출구, 출구 → 다음 출구: 한 프레임에 0.5m · 5° 넘게)는 그 차이를 corr에 담아 RF.tau초에 걸쳐 흘려보낸다 — 차가 움직여서 생긴 변화는 그대로(지연 없음).
     내 차 아이콘은 도로 방향과 내 차 방향의 차이만큼 기울어짐(최대 ±RF.tiltMax°) */
const RF = {tau:.4, tiltMax:12, psi:0, off:0, tilt:0, corrPsi:0, corrOff:0, prevPsi:0, prevOff:0, hints:null, init:false};
function roadFrame(p, m, dt){
  let tx = 0, tz = -1, off = p.x;   // 본선: -z 방향 · 본선 가운데(x = 0) 기준 → 옆 거리 = p.x
  if(p.z <= FORK_Z){
    if(!RF.hints || RF.hints.m !== m) RF.hints = {m, h:m.segs.map(() => -1)};
    let best = null;   // 내 차가 올라탄 출구(가운데선에서 가장 가까운 것, 포장 + 한 차로 안)
    m.segs.forEach((e, i) => { const r = project(segPts(e), p.x, p.z, RF.hints.h[i]); RF.hints.h[i] = r.i; if(Math.abs(r.d) <= e.half + LANE && (!best || Math.abs(r.d) < Math.abs(best.d))) best = r; });
    if(best){ tx = best.tx; tz = best.tz; off = best.d; }
    else if(RF.init){ tx = Math.sin(RF.psi); tz = -Math.cos(RF.psi); off = RF.off; }   // 갈림 코 · 도로 밖: 직전 기준 유지
  }
  const psiT = Math.atan2(tx, -tz);
  if(!RF.init){ RF.corrPsi = RF.corrOff = 0; RF.tilt = 0; RF.init = true; }
  else {
    const dO = off - RF.prevOff, dP = wrapA(psiT - RF.prevPsi);
    if(Math.abs(dO) > .5) RF.corrOff -= dO;   if(Math.abs(dP) > 5*Math.PI/180) RF.corrPsi -= dP;
    const k = Math.min(1, dt/RF.tau); RF.corrOff *= 1 - k; RF.corrPsi *= 1 - k;
  }
  RF.prevOff = off; RF.prevPsi = psiT;
  RF.off = off + RF.corrOff; RF.psi = psiT + RF.corrPsi;
  const tiltT = clamp(wrapA(EGO.psi - RF.psi)*180/Math.PI, -RF.tiltMax, RF.tiltMax);
  RF.tilt += (tiltT - RF.tilt)*Math.min(1, dt/.15);
  return {fx:Math.sin(RF.psi), fz:-Math.cos(RF.psi), off:RF.off, tilt:RF.tilt};
}
function makeProjRoad(p, F){
  const rx = -F.fz, rz = F.fx, off = F.off;
  return (wx, wz) => {
    const dx = wx - p.x, dz = wz - p.z, d = dx*F.fx + dz*F.fz;
    if(d < -B_BEHIND || d > 300) return null;
    const X = dx*rx + dz*rz + off, s = K/(d + K);
    return [HX + X*PXM*s, HY_FAR + (HY_NEAR - HY_FAR)*s, s, d];
  };
}
const B = {level:0, since:0, gate:'none', prevGate:'none', cand:null, others:[], gapDraw:null, alpha:0, edgeW:0, edgeA:0, blinkT0:0, clearT0:-9, lastT:null, tk:null, tkAt:-1e9, dir:0,
  primRef:null, old:null};   // old: 기준 차가 바뀔 때 이전 차 {ref, alpha, pt, col} — 제자리에서 0.3초에 걸쳐 사라짐 (튀지 않게)
const AS2 = {icon:null, since:0, doneUntil:0, wasMove:false, op:1};   // op: 갈 방향 투명도(대기 0.45 ↔ 평상시 1)를 t-fast(0.18초)에 걸쳐 옮김 — 상태가 바뀔 때 튀지 않게 (2026-11-04)
function resetHud2(){
  Object.assign(B, {level:0, since:0, gate:'none', prevGate:'none', cand:null, others:[], gapDraw:null, alpha:0, edgeW:0, edgeA:0, blinkT0:0, clearT0:-9, lastT:null, dir:0, primRef:null, old:null});
  AS2.icon = null; AS2.doneUntil = 0; AS2.wasMove = false; AS2.op = 1;
  $('#bRear').setAttribute('opacity', 0); $('#bRearOld').setAttribute('opacity', 0); $('#bDistBand').setAttribute('d', ''); $('#bFlow').setAttribute('d', ''); $('#bClearFill').setAttribute('d', '');
  $('#bBound').setAttribute('d', ''); $('#bBoundCore').setAttribute('d', ''); $('#bEdgeL').setAttribute('opacity', 0); $('#bEdgeR').setAttribute('opacity', 0); $('#bMoveGrp').removeAttribute('transform');
  $('#arHud2').dataset.level = 0;
  RF.init = false; RF.hints = null; $('#bEgo').setAttribute('transform', `translate(${HX} 221) scale(${B.tk ? B.tk.egoScale : 1.05})`);
}
// 디자인 토큰 읽기 (0.5초마다 — 시간대 · 마감 바뀌면 그때 반영). 빛 번짐은 여기서 #glow2에 넣는다
function tk2(now){
  if(B.tk && now - B.tkAt < 500) return B.tk;
  const cs = getComputedStyle($('#cab')), g = n => cs.getPropertyValue(n).trim();
  B.tk = {route:g('--h2-route'), go:g('--h2-go'), warn:g('--h2-warn'), danger:g('--h2-danger'), neutral:g('--h2-neutral'), idle:g('--h2-idle'), core:g('--h2-core'),
    opFill:+g('--h2-op-fill'), opCtx:+g('--h2-op-ctx'), opDetect:+g('--h2-op-detect'), opEdge:+g('--h2-op-edge'),
    glow:+g('--h2-glow'), w1:parseFloat(g('--h2-w1')), w2:parseFloat(g('--h2-w2')), w3:parseFloat(g('--h2-w3')),
    iconScale:+g('--h2-icon-scale') || 1.75, sp3:+g('--h2-sp3') || 16, opClear:+g('--h2-op-clear'), egoScale:+g('--h2-ego-scale') || 1.05};   // 2.2: 내 차 실루엣 크기
  B.tkAt = now;
  $('#glow2 feGaussianBlur').setAttribute('stdDeviation', B.tk.glow);
  return B.tk;
}
const bVehEls = Array.from({length:24}, () => { const r = document.createElementNS(SVGNS, 'rect'); r.setAttribute('rx', 2.5); r.setAttribute('class', 'b-q'); $('#bVeh').appendChild(r); return r; });

/* ---------- 뒤차 단계 ----------
   cand = 보여 줄 차 하나: 대기 이유 차(guide.js)가 있으면 그 차, 아니면 옮길 차로에서 내 뒤 · 옆의 가장 가까운 차(정체 줄 차는 뺌 — 줄은 개선 전처럼 주황 테 · 틈으로).
   단계: 0 안전 · 1 감지 · 2 주의(REAR2) · 3 대기 · 4 위험 강화(게이트 wait + 그쪽으로 넘어가기 시작). 게이트 '확인'(clearing)은 3으로 두되 깜빡이지 않음 */
function rearLevel2(G, needMove, t){
  let cand = null;
  if(G && needMove && G.side){
    const ego = EGO;
    const list = G.cars.filter(c => c.lane === G.next && c.kind !== 'queue').map(c => {
      const dz = c.z - ego.z, gap = Math.abs(dz) - c.halfL - ego.halfL, cl = c.v - ego.v;
      return {c, dz, gap, cl, behind:dz > 0, ttc:dz > 0 && cl > 0 ? gap/cl : Infinity};
    });
    const rc = G.reason && G.reason.car && G.reason.kind !== 'queue' ? list.find(o => o.c.ref === G.reason.car.ref) : null;
    cand = rc || list.filter(o => o.behind || o.gap < 1).sort((a, b) => a.gap - b.gap)[0] || null;
    B.others = list.filter(o => o !== cand && o.behind && o.gap < REAR2.detect).sort((a, b) => a.gap - b.gap);   // 기준 차 뒤에 더 오는 차들(감지 범위 안)
  } else B.others = [];
  const gate = G ? G.gate : 'none';
  const rearWait = (gate === 'wait' || gate === 'clearing') && !!(G.reason && G.reason.kind !== 'queue');
  let want = 0;
  if(rearWait) want = gate === 'wait' && G.intent ? 4 : 3;
  else if(cand){
    const k2 = B.level >= 2 ? REAR2.exitK : 1, k1 = B.level >= 1 ? REAR2.exitK : 1;
    if(cand.gap < 1 || cand.ttc < REAR2.cautionTtc*k2 || cand.gap < REAR2.cautionGap*k2) want = 2;
    else if(cand.gap < REAR2.detect*k1) want = 1;
  }
  if(want > B.level || (want < B.level && t - B.since >= REAR2.dwell)){
    if(want >= 3 && B.level < 3) B.blinkT0 = t;
    B.level = want; B.since = t;
  }
  if((B.prevGate === 'wait' || B.prevGate === 'clearing') && gate === 'go') B.clearT0 = t;   // 06 해소
  B.prevGate = gate; B.gate = gate; B.cand = cand;
  B.dir = G && G.dir && G.dir.side ? G.dir.side : (G ? G.side : 0);   // 빛 · 뒤차 쪽: 내 차 자세 기준 (없으면 옮길 쪽)
  return B.level;
}

/* ---------- 우리 HUD 2.1 ---------- */
function drawAr2(p, f, C, k){
  const m = S.map, R = S.route, st = C.st, onMain = C.i === 0, G = S.G;
  // 시계: 시뮬레이션 시간(주행 테스트 D.t · 시연 S.cityT — guide.js 게이트와 같은 시계). 단계 머무름 · 깜빡임 · 훑기 · 나타남이 모두 이 시계라 자동 테스트(빠른 시계)에서도 같게 돈다
  const now = performance.now(), t = S.drive ? D.t : S.cityT, dt = B.lastT === null ? 1/60 : clamp(t - B.lastT, 0, .1); B.lastT = t;
  const T = tk2(now);
  const F = roadFrame(p, m, dt), proj = makeProjRoad(p, F), tx = R.tx, sgn = R.side;   // 도로 기준 투영 (D102). f(내 차 방향)는 쓰지 않는다 — 핸들을 틀어도 미니 도로가 돌지 않게
  void f;
  // 내 차 아이콘: 옆 자리 = 실제 옆 위치를 같은 원근식으로(d = 0 → s = 1), 기울기 = 내 차 방향 − 도로 방향
  $('#bEgo').setAttribute('transform', `translate(${(HX + F.off*PXM).toFixed(1)} 221) rotate(${F.tilt.toFixed(1)}) scale(${T.egoScale})`);
  const inLane = !onMain || Math.abs(p.x - tx) < 1.2;
  const tail = onMain && S.jam > 0 && S.q && S.q.backZ !== null ? S.q.backZ : null;
  const needMove = onMain && !inLane && st <= 3;
  const besideQueue = tail !== null && needMove && p.z <= tail + 2;
  const gateZ = tail !== null ? tail + 10 : changeEndOf(m);
  const frac = clamp((p.z - gateZ)/(0 - gateZ));
  const zNear = Math.min(p.z + B_BEHIND - 1, 40);   // 미니 도로는 내 차 뒤 13m부터

  // ---- 뒤차 단계 (0 ~ 4) ----
  const lv = rearLevel2(G, needMove, t), wait = lv >= 3, cand = B.cand;
  // 깜빡임: 켜짐 · 꺼짐이 딱 끊기는 네모파 (켜짐 비율 blinkDuty, 꺼짐 밝기 blinkLow). 뒤차 · 거리 구간 · 가장자리 빛이 같은 blink 값을 곱해 같은 박자. 속도는 위험 강화에서도 그대로
  const blinkOn = lv >= 3 && B.gate === 'wait' ? ((t - B.blinkT0) % REAR2.blink) < REAR2.blink*REAR2.blinkDuty : true;
  const blink = blinkOn ? 1 : REAR2.blinkLow;
  $('#arHud2').dataset.level = lv;
  const col = lv >= 3 ? T.danger : lv === 2 ? T.warn : T.neutral;
  const mix2 = (a, b, u) => mix(a, b, u);
  const timeColor2 = fr => fr >= .5 ? T.go : fr >= .2 ? mix2(T.warn, T.go, (fr - .2)/.3) : mix2(T.danger, T.warn, fr/.2);
  const arrowColor2 = fr => fr >= .5 ? T.go : fr >= .2 ? mix2(T.warn, T.go, (fr - .2)/.3) : T.warn;

  /* ② 갈 방향 — 개선 전과 같음. 대기 중엔 흐리게(정보 우선순위: 위험 시 뒤차 · 간격 > 들어갈 차로 > 남은 시점) */
  if(AS2.wasMove && !needMove && inLane && st <= 3) AS2.doneUntil = now + 1400;
  AS2.wasMove = needMove;
  const icon = C.d >= -8 ? {L:'bIcoLeft', S:'bIcoUp', R:'bIcoRight'}[C.node.key] : null;
  if(icon !== AS2.icon){ AS2.icon = icon; AS2.since = now; }
  const act = $('#bAct'), e = ease(clamp((now - AS2.since)/200));
  ['bIcoRight', 'bIcoLeft', 'bIcoUp'].forEach(n => $('#' + n).style.display = n === icon ? '' : 'none');
  act.style.display = icon ? '' : 'none';
  // 자리: 화살표 가운데 y = ICON_Y, 아래끝 = ICON_Y + 13 × 크기. 막대는 그 아래 --h2-sp3만큼 띄움 (2026-11-04 사용자: 화살표와 막대가 붙어 보임). HUD 상자 · 미니 도로 자리는 그대로
  const actTr = `translate(${HX} ${ICON_Y}) scale(${(.88 + .12*e).toFixed(3)})`;
  act.setAttribute('transform', actTr);
  AS2.op += clamp((wait ? .45 : 1) - AS2.op, -dt/.18, dt/.18);   // 대기 ↔ 평상시 0.18초에 걸쳐 (hud.css --h2-t-fast와 같은 값)
  const iconOp = e*AS2.op;
  act.setAttribute('opacity', iconOp.toFixed(3));
  $('#bIcon').setAttribute('transform', `scale(${T.iconScale})`);
  const barY = Math.round(ICON_Y + 13*T.iconScale + T.sp3);
  $('#bCdBg').setAttribute('y', barY); $('#bCdBar').setAttribute('y', barY);

  /* ③ 다음 행동까지 — 개선 전과 같음. 뒤차로 기다리면 회색으로 계속 줄어듦 */
  let bar = null, bi = C.i, bd = C.d;
  if(bd <= 0 && bi < path.nodeS.length - 1){ bi++; bd = path.nodeS[bi] - S.s; }
  if(needMove) bar = besideQueue ? {fr:0, col:T.danger, op:1} : {fr:frac, col:wait ? T.idle : timeColor2(frac), op:wait ? .55 : 1};
  else if(bd > 0) bar = {fr:clamp(bd/(bi === 0 ? path.nodeS[0] - path.sStart : path.nodeS[bi] - path.nodeS[bi-1])), col:T.go, op:1};
  $('#bCd').style.display = bar ? '' : 'none';
  if(bar){
    const b = $('#bCdBar'); b.setAttribute('width', (120*bar.fr).toFixed(1)); b.setAttribute('x', (260 - 60*bar.fr).toFixed(1)); b.setAttribute('fill', bar.col); b.setAttribute('fill-opacity', bar.op);
    $('#bCdBg').setAttribute('fill', bar.col); $('#bCdBg').setAttribute('fill-opacity', bar.fr > .001 ? .16 : (.14 + .14*Math.sin(now/220)).toFixed(3));
  }
  const showGate = needMove && !besideQueue;
  $('#bGate').setAttribute('d', showGate ? quadZ(tx - 1.75, tx + 1.75, gateZ + .35, gateZ - .35, proj) : '');
  if(bar){ $('#bGate').setAttribute('fill', bar.col); $('#bGate').setAttribute('fill-opacity', bar.op); }

  /* ① 들어갈 차로 · 경로 — 개선 전과 같음. 다른 점: 대기 중에도 흐려지지 않음(어디로는 그대로), 미니 도로가 내 차 뒤까지 */
  let surf = bandX(-m.edgeX, m.edgeX, zNear, -232, proj), edges = lineX(-m.edgeX, zNear, -228, .09, proj) + lineX(m.edgeX, zNear, -228, .09, proj), dash = '';
  m.segs.forEach(e => {
    const c = e.curve, hw = e.k*LANE/2;
    surf += strip(offsetPts(c, 0, 1, -e.half, proj, 40), offsetPts(c, 0, 1, e.half, proj, 40));
    edges += lineC(c, 0, 1, -(hw + .15), .09, proj) + lineC(c, 0, 1, hw + .15, .09, proj);   // 2.2 (D108): 출구 가장자리 선을 본선과 같은 차로 끝 + .15에, 안쪽 선은 갈림부터(V자) — 예전 e.half(+.55) · 25m 뒤 시작은 3D 노면과 어긋나 두 겹으로 보였음
    for(let i=1;i<e.k;i++) for(let s=8; s<e.L-3; s+=9) dash += strip(offsetPts(c, s/e.L, (s+3)/e.L, -hw+i*LANE-.075, proj, 2), offsetPts(c, s/e.L, (s+3)/e.L, -hw+i*LANE+.075, proj, 2));
  });
  for(let i=1;i<m.lanes;i++) dash += dashX(m.laneX(i) - LANE/2, .075, zNear, proj);
  $('#bSurf').setAttribute('d', surf); $('#bEdges').setAttribute('d', edges); $('#bDash').setAttribute('d', dash);
  const fillTarget = st === 1 ? .85 : 1;
  S.fill += (fillTarget - S.fill)*k;
  const lastS = path.nodeS[path.nodeS.length-1], endT = clamp((S.s - lastS)/ROUTE_END);
  const bc = R.afterCurve, bu = clamp((lastS + ROUTE_END - path.nodeS[0])/R.afterL), bh = R.leaf.path[0].k === 1 ? 2.3 : 1.75, lf = S.fill;
  const mainFill = onMain ? bandX(tx - 1.75, tx + 1.75, zNear, -230, proj) : '', mainRails = onMain ? lineX(tx - 1.75, zNear, -230, .1, proj) + lineX(tx + 1.75, zNear, -230, .1, proj) : '';
  $('#bLaneFill').setAttribute('d', mainFill + bandC(bc, 0, bu, -bh, bh, 18, R.afterL, proj));
  $('#bLaneFill').setAttribute('opacity', lf.toFixed(3));
  $('#bRails').setAttribute('d', mainRails + bandC(bc, 0, bu, -bh - .1, -bh + .1, 18, R.afterL, proj) + bandC(bc, 0, bu, bh - .1, bh + .1, 18, R.afterL, proj));
  $('#bRails').setAttribute('opacity', lf.toFixed(3));
  const praise = clamp((AS2.doneUntil - now)/1400), g = Math.max(praise, ease(endT)), lc = g > 0 ? mix2(T.route, T.go, g) : T.route;
  ['#lg2A', '#lg2B', '#lg2C'].forEach(s => $(s).setAttribute('stop-color', lc));
  $('#bRails').setAttribute('fill', lc); $('#bPulses').setAttribute('fill', lc);
  let pul = '';
  if(onMain && !wait && st <= 3 && S.fill > .3) for(let i=0;i<3;i++){ const z = p.z - 7 - ((now/1000*15 + i*20) % 60); if(z > -226) pul += quadZ(tx - 1.55, tx + 1.55, z, z - 1.1, proj); }
  $('#bPulses').setAttribute('d', pul); $('#bPulses').setAttribute('fill-opacity', (.7*S.fill).toFixed(3));

  /* 이동 화살표 — 개선 전과 같은 자리 · 모양. 초록 흐름 = 옮겨도 됨 / 주황 점 = 틈 대기 / 빨간 점 = 대기(뒤차). 개선 전의 '멈춤 막대'는 없음 — 원인(뒤차)을 직접 보여 주므로 */
  const a0 = needMove ? proj(p.x, p.z - 7) : null, a1 = needMove ? proj(p.x, p.z - 19) : null, a2 = needMove ? proj(tx, p.z - 31) : null;
  const ma = $('#bMove'), mh = $('#bHead'), mg = $('#bMoveGrp');
  // 06 해소 진행도 0 ~ 1 (한 번만, REAR2.clearT초)
  const cu = (t - B.clearT0)/REAR2.clearT, clearing = cu >= 0 && cu < 1 && onMain && !wait;
  if(a0 && a1 && a2){
    const ac = wait ? T.danger : clearing ? T.go : besideQueue ? (S.q.mergeNear ? T.go : T.warn) : arrowColor2(frac);
    // 해소: 빨간 점 → 초록 화살표로 바뀌며 한 번 커졌다(1.35배, 화살표 가운데 기준) 제자리로 (2026-11-04 사용자 선택 C)
    if(clearing){ const k = 1 + .35*Math.sin(Math.PI*cu), cx = (a0[0] + a2[0])/2, cy = (a0[1] + a2[1])/2; mg.setAttribute('transform', `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) scale(${k.toFixed(3)}) translate(${(-cx).toFixed(1)} ${(-cy).toFixed(1)})`); }
    else mg.removeAttribute('transform');
    ma.setAttribute('d', `M${fmt(a0)}Q${fmt(a1)} ${fmt(a2)}`);
    const ag = $('#arrowGrad2'); ag.setAttribute('x1', a0[0]); ag.setAttribute('y1', a0[1]); ag.setAttribute('x2', a2[0]); ag.setAttribute('y2', a2[1]);
    $('#ag2A').setAttribute('stop-color', ac); $('#ag2B').setAttribute('stop-color', ac);
    const still = wait || (besideQueue && !S.q.mergeNear);
    ma.setAttribute('stroke-dasharray', still ? '.1 14' : '12 14'); ma.classList.toggle('flow', !still);
    let dx = a2[0] - a1[0], dy = a2[1] - a1[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const nx = -dy, ny = dx;
    mh.setAttribute('d', `M${(a2[0]+dx*9).toFixed(1)} ${(a2[1]+dy*9).toFixed(1)}L${(a2[0]-dx*8+nx*10).toFixed(1)} ${(a2[1]-dy*8+ny*10).toFixed(1)}L${(a2[0]-dx*8-nx*10).toFixed(1)} ${(a2[1]-dy*8-ny*10).toFixed(1)}Z`);
    mh.setAttribute('fill', ac); mh.setAttribute('opacity', wait ? .8 : 1);   // 대기: 머리는 조금만 낮춤(주간 대비 2.2:1 → 측정 뒤 .55에서 올림)
  } else { ma.setAttribute('d', ''); mh.setAttribute('d', ''); ma.classList.remove('flow'); mg.removeAttribute('transform'); }

  /* 정체 — 개선 전과 같음(빗금 · 설 칸 · 틈 · 줄 차 주황 테). 정체 줄 차는 뒤차 표현에 넣지 않음 */
  const jb = $('#bJam');
  if(tail !== null){ const dj = bandX(tx - 1.7, tx + 1.7, Math.min(tail, zNear), qFrontOf(m), proj); jb.setAttribute('d', dj); jb.setAttribute('opacity', dj ? '.45' : '0'); }
  else jb.setAttribute('opacity', '0');
  $('#bSlot').setAttribute('d', tail !== null && p.z > tail + 14 ? quadZ(tx - 1.3, tx + 1.3, tail + 10, tail + 5, proj) : '');
  $('#bSlot').setAttribute('opacity', (.7 + .3*Math.sin(now/260)).toFixed(2));
  let gapD = '';
  if(besideQueue && S.q.mergeNear){
    const zs = queueCars.filter(c => c.visible && Math.abs(c.position.x - tx) < 1).map(c => c.position.z).sort((a, b) => b - a);
    for(let i=0;i<zs.length-1;i++){ if(zs[i] - zs[i+1] > Q_MERGE){ const mz = (zs[i] + zs[i+1])/2; if(Math.abs(mz - p.z) < 16){ gapD = quadZ(tx - 1.45, tx + 1.45, mz + 1.6, mz - 1.6, proj); break; } } }
  }
  $('#bGapMark').setAttribute('d', gapD);
  const vs = [];
  if(tail !== null) queueCars.forEach(c => { if(c.visible) vs.push({x:c.position.x, z:c.position.z}); });
  vs.sort((a, b) => Math.abs(a.z - p.z) - Math.abs(b.z - p.z));
  bVehEls.forEach((r, i) => {
    const v = vs[i], a = v && proj(v.x, v.z + 2.25), b = v && proj(v.x, v.z - 2.25), c = v && proj(v.x, v.z);
    if(!a || !b || !c){ r.setAttribute('opacity', 0); return; }
    const w = 1.8*PXM*c[2], h = Math.max(2.5, a[1] - b[1]);
    r.setAttribute('x', (c[0] - w/2).toFixed(1)); r.setAttribute('y', b[1].toFixed(1)); r.setAttribute('width', w.toFixed(1)); r.setAttribute('height', h.toFixed(1)); r.setAttribute('opacity', 1);
  });

  /* ---- 뒤차 표현 4가지 ----
     자리: 뒤차는 실제 쪽 차로(옮길 차로) 안, 내 차 뒤 — 간격 0 ~ 감지 범위를 내 차 바로 뒤 2 ~ 13m 자리로 눌러 그린다(가까울수록 내 차 쪽으로 올라옴).
     크기는 고정(원근 축소 없음). 옆에 나란히(간격 < 1m)거나 앞이면 실제 자리 그대로 */
  const next = G ? G.next : null, laneX = next !== null && next >= 0 && next < m.lanes ? m.laneX(next) : tx;
  const zOfGap = g => p.z + 2 + 11*clamp(g/REAR2.detect);   // 뒤차 간격(m) → 미니 도로 위 자리(내 차 바로 뒤 2 ~ 13m로 눌러 그림)
  // 기준 차가 바뀌면(앞 차가 지나가 다음 차가 기준) 이전 차는 제자리에서 0.3초에 걸쳐 사라지고 새 차는 0에서 나타난다 — 표시가 튀지 않게
  const ref = cand ? cand.c.ref : null;
  if(ref !== B.primRef){ if(B.primRef && B.alpha > .05) B.old = {ref:B.primRef, alpha:B.alpha, col:B.lastCol || T.neutral, cl:B.lastCl || 0}; B.primRef = ref; B.alpha = cand ? 0 : B.alpha; B.gapDraw = null; }
  let carPt = null, zCar = null;
  if(cand){
    if(cand.behind && cand.gap >= 1){
      const g0 = Math.max(0, cand.gap); B.gapDraw = B.gapDraw === null ? g0 : B.gapDraw + (g0 - B.gapDraw)*Math.min(1, dt*10);
      zCar = zOfGap(B.gapDraw); carPt = proj(laneX, zCar);
    } else { zCar = cand.c.z; carPt = proj(cand.c.x, cand.c.z); B.gapDraw = null; }
  } else B.gapDraw = null;
  const alphaTo = lv >= 1 && carPt ? 1 : 0;
  B.alpha += clamp(alphaTo - B.alpha, -dt/REAR2.fade, dt/REAR2.fade);
  const rear = $('#bRear');
  B.lastCol = col; B.lastCl = cand ? cand.cl : 0;
  if(carPt && B.alpha > .001){
    rear.setAttribute('transform', `translate(${carPt[0].toFixed(1)} ${carPt[1].toFixed(1)})`);
    rear.setAttribute('opacity', (B.alpha*(lv === 1 ? T.opDetect : 1)*(lv >= 3 ? blink : 1)).toFixed(3));
    $('#bRearBody').setAttribute('fill', col); $('#bRearBody').setAttribute('stroke', lv >= 3 ? T.core : 'none'); $('#bRearBody').setAttribute('stroke-width', T.w1);
    // 꺾쇠 = 접근 속도 (주의부터). 내 차 쪽(위)을 가리킴
    const cl = cand.cl, n = lv >= 2 && cand.behind && cl > 0 ? (cl < REAR2.chevronV[0] ? 1 : cl < REAR2.chevronV[1] ? 2 : 3) : 0;
    $$('#bChev path').forEach((q, i) => { q.style.display = i < n ? '' : 'none'; q.setAttribute('stroke', col); });
  } else rear.setAttribute('opacity', 0);
  // 이전 기준 차: 지금 실제 자리(대개 내 차 옆 · 앞)에서 사라짐
  const old = $('#bRearOld');
  if(B.old){ B.old.alpha -= dt/REAR2.fade; const oc = G && G.cars.find(c => c.ref === B.old.ref), op = oc ? proj(oc.x, oc.z) : null;
    if(B.old.alpha <= 0 || !op) B.old = null; else { old.setAttribute('transform', `translate(${op[0].toFixed(1)} ${op[1].toFixed(1)})`); old.setAttribute('opacity', (B.old.alpha*.8).toFixed(3)); old.querySelector('rect').setAttribute('fill', B.old.col); } }
  if(!B.old) old.setAttribute('opacity', 0);
  // ---- 거리 (사용자 선택 7-B, 2026-11-03): 내 차 뒤부터 뒤차까지 옮길 차로를 칠한 구간 — 가까울수록 짧고 진하게, 색은 단계(흰 → 주황 → 빨강). 대기에선 깜빡임을 같이 탐. 간격 막대 대신 ----
  let band = '', bandOp = 0;
  if(cand && zCar !== null && B.alpha > .001 && cand.behind){
    const z1 = p.z + 2.4, z0 = Math.max(zCar - 1, z1 + 1);   // 뒤차 앞 ~ 내 차 뒤. 바짝 붙어도 최소 1m는 남겨 가장 위험할 때 구간이 사라지지 않게
    if(z0 - z1 > .3){ band = bandX(laneX - 1.55, laneX + 1.55, z0, z1, proj, 1); const near = 1 - clamp(B.gapDraw/REAR2.detect); bandOp = (REAR2.bandOp[0] + (REAR2.bandOp[1] - REAR2.bandOp[0])*near)*(lv === 1 ? .7 : 1); }
  }
  $('#bDistBand').setAttribute('d', band); $('#bDistBand').setAttribute('fill', col); $('#bDistBand').setAttribute('fill-opacity', (bandOp*B.alpha*(lv >= 3 ? blink : 1)).toFixed(3));
  // ---- 여러 대 (사용자 선택 4-C): 차 아이콘 · 거리 · 빛 · 깜빡임은 가장 가까운 한 대만. 뒤에 더 오는 차(감지 범위 안)가 있으면 옮길 차로 아래쪽에 위로 흐르는 흐린 띠 3개 — 글자 · 숫자 없이 '계속 온다' ----
  let flow = '';
  if(cand && cand.behind && B.others.length && B.alpha > .001){
    for(let i = 0; i < 3; i++){ const g = B.gapDraw + 6 + ((i*7 - now/1000*6) % 21 + 21) % 21; if(g > REAR2.detect) continue; const zf = zOfGap(g); flow += bandX(laneX - 1.1, laneX + 1.1, zf + .35, zf - .35, proj, .5); }
  }
  $('#bFlow').setAttribute('d', flow); $('#bFlow').setAttribute('fill-opacity', (REAR2.flowOp*B.alpha).toFixed(3));
  // 05 위험 강화: 넘으려는 차로 경계에 빨간 선 (내 차 뒤 6m ~ 앞 16m), 밝은 심
  let bnd = '', core = '';
  if(lv >= 4 && G){ const xb = m.laneX(G.my) + G.side*1.75; bnd = lineX(xb, p.z + 6, p.z - 16, .16, proj); core = lineX(xb, p.z + 6, p.z - 16, .09, proj); }   // 선 .13 → .16 · 밝은 심 .045 → .09 (2.2: 번짐을 줄여(2.2 → 1.6) 측정 대비가 5.9 → 3.8로 떨어진 것을 심 폭으로 보충, D107)
  $('#bBound').setAttribute('d', bnd); $('#bBoundCore').setAttribute('d', core);
  // 가장자리 빛: 뒤차 쪽, 주의부터. 위험할수록 넓고 밝게. 대기 · 위험 강화에선 뒤차와 같은 길이로 깜빡임
  const wTo = lv >= 4 ? 34 : lv === 3 ? 22 : lv === 2 ? 12 : 0, aTo = lv >= 4 ? 1 : lv === 3 ? .85 : lv === 2 ? .55 : 0;
  B.edgeW += (wTo - B.edgeW)*Math.min(1, dt*8); B.edgeA += clamp(aTo - B.edgeA, -dt/REAR2.fade, dt/REAR2.fade);
  const ec = lv >= 3 ? T.danger : T.warn;
  $$('.eg2').forEach(s => s.setAttribute('stop-color', ec));
  const side = B.dir || sgn, eL = $('#bEdgeL'), eR = $('#bEdgeR');
  const ea = (B.edgeA*T.opEdge*(lv >= 3 ? blink : 1)).toFixed(3);
  eL.setAttribute('width', side < 0 ? B.edgeW.toFixed(1) : 0); eL.setAttribute('opacity', side < 0 ? ea : 0);
  eR.setAttribute('width', side > 0 ? B.edgeW.toFixed(1) : 0); eR.setAttribute('x', (520 - B.edgeW).toFixed(1)); eR.setAttribute('opacity', side > 0 ? ea : 0);
  // 06 해소 채움 (2026-11-04 사용자 선택 A): 들어갈 차로 전체(내 차 뒤부터 갈림까지)가 0.1초 안에 초록으로 차고 나머지 동안 천천히 빠짐. 끝나면 지워져 화살표 흐름(평상시)만 남는다
  const onFast = u => u < .12 ? u/.12 : Math.cos(Math.PI/2*(u - .12)/.88);
  $('#bClearFill').setAttribute('d', clearing ? bandX(tx - 1.75, tx + 1.75, zNear, -230, proj) : ''); $('#bClearFill').setAttribute('fill-opacity', (clearing ? T.opClear*onFast(cu) : 0).toFixed(3));

  /* 일반도로 (D69) — 개선 전과 같음: 멈출 곳 빨간 막대 · 보행자 점 */
  let cs = '', pd = '';
  if(m.city){
    const ct = S.cityT, e1 = R.leaf.path[0];
    if(onMain && p.z > FORK_Z - 1 && sigOf(e1.key, ct) === 'red') cs += quadZ(m.laneX(e1.lanes[0]) - 1.75, m.laneX(e1.lanes[e1.k-1]) + 1.75, FORK_Z + .6, FORK_Z - .6, proj);
    if(m.cw){
      if(pedBlock(ct) && p.x < m.cw.x0) cs += quadW([[m.cw.x0 - 1.5, CZ.near], [m.cw.x0 - .4, CZ.near], [m.cw.x0 - .4, CZ.mid], [m.cw.x0 - 1.5, CZ.mid]], proj);
      pedsAt(ct).forEach(q => { if(q.phase === 'done') return; const c = proj(q.x, q.z); if(!c) return; const r = Math.max(1.8, 4.5*c[2]);
        pd += `M${(c[0] - r).toFixed(1)} ${c[1].toFixed(1)}a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(2*r).toFixed(1)} 0a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-2*r).toFixed(1)} 0Z`; });
    }
  }
  $('#bCityStop').setAttribute('d', cs); $('#bPed').setAttribute('d', pd);
}
