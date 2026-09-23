/* ============================================================
   hud.js — HUD 그리기 (미니 도로 투영 · 우리 HUD drawAr · 기존 HUD drawNav)
   config.js, scene.js 다음에 로드. 상태 S·path는 main.js에서 정의(호출 시점엔 존재).
   ============================================================ */

/* ---------- HUD 미니 도로 투영 ---------- */
const HX = 260, HY_NEAR = 228, HY_FAR = 112, HALF = 112, K = 55;
function makeProj(p, f){
  const rx = -f.z, rz = f.x;
  return (wx,wz) => {
    const dx = wx-p.x, dz = wz-p.z, d = dx*f.x + dz*f.z;
    if(d < 0 || d > 300) return null;
    const X = dx*rx + dz*rz, s = K/(d+K);
    return [HX + X*(HALF/5.25)*s, HY_FAR + (HY_NEAR-HY_FAR)*s, s, d];
  };
}
const fmt = q => q[0].toFixed(1)+' '+q[1].toFixed(1);
function polyline(pts){ let o='', pen=false; for(const q of pts){ if(!q){pen=false;continue;} o += (pen?'L':'M')+fmt(q); pen=true; } return o; }
function strip(L,R){ const a=[],b=[]; L.forEach((q,i)=>{ if(q&&R[i]){ a.push(q); b.push(R[i]); } }); return a.length>1 ? 'M'+a.map(fmt).join('L')+'L'+b.reverse().map(fmt).join('L')+'Z' : ''; }
function offsetPts(curve,u0,u1,off,proj,n=24){
  const out=[];
  for(let i=0;i<n;i++){ const u=u0+(u1-u0)*i/(n-1), q=curve.getPointAt(u), t=curve.getTangentAt(u); let nx=-t.z,nz=t.x; const l=Math.hypot(nx,nz)||1; out.push(proj(q.x+nx/l*off, q.z+nz/l*off)); }
  return out;
}

// 이름표 (지선 라벨) — SVG 요소 미리 생성
const tagEls = DEST.map(() => {
  const g = document.createElementNS(SVGNS,'g');
  const mk = n => document.createElementNS(SVGNS,n);
  const line = mk('line'), rect = mk('rect'), sub = mk('text'), txt = mk('text');
  txt.setAttribute('text-anchor','middle'); txt.setAttribute('class','hud-t'); txt.setAttribute('font-weight','700');
  sub.setAttribute('text-anchor','middle'); sub.setAttribute('class','hud-t'); sub.setAttribute('font-size','11'); sub.setAttribute('font-weight','600');
  rect.setAttribute('rx','8'); line.setAttribute('stroke-width','1.2');
  g.append(line, rect, sub, txt); $('#tags').appendChild(g);
  return {g, line, rect, sub, txt, op:0};
});
// 기존 HUD 차로 화살표
(() => {
  const g = $('#navLanes');
  [-28,0,28].forEach((rot,i) => {
    const a = document.createElementNS(SVGNS,'path');
    a.setAttribute('d','M0 -7 L5 -1 H2 V7 H-2 V-1 H-5 Z');
    a.setAttribute('transform',`translate(${(i-1)*15} 0) rotate(${rot})`); a.dataset.i = i; g.appendChild(a);
  });
})();
const navLaneEls = $$('#navLanes path');
const icons = ['icoFork','icoRight','icoLeft','icoUp','icoCheck','icoWarn'];
function showIcon(id, color){ icons.forEach(n => $('#'+n).style.display = n===id ? '' : 'none'); $('#nowIcon').setAttribute('stroke', color); $('#nowIcon').style.display = id ? '' : 'none'; }

/* ---------- 우리 HUD ---------- */
function drawAr(p, f, st, d, k, dangerOn, kmh, remainKm){
  const proj = makeProj(p, f), tx = (S.target-1)*LANE;

  // 도로 윤곽
  const lines = [];
  for(const x of [-5.4,5.4]){ const pts=[]; for(let z=40; z>=-230; z-=5) pts.push(proj(x,z)); lines.push(polyline(pts)); }
  branchCurves.forEach((c,i) => { lines.push(polyline(offsetPts(c, i===0?0:.06, 1, -2.3, proj, 40))); lines.push(polyline(offsetPts(c, i===2?0:.06, 1, 2.3, proj, 40))); });
  $('#rdLines').setAttribute('d', lines.join(''));
  const dashes = [];
  for(const x of [-LANE/2,LANE/2]){ const pts=[]; for(let z=40; z>=-224; z-=5) pts.push(proj(x,z)); dashes.push(polyline(pts)); }
  $('#rdDash').setAttribute('d', dashes.join(''));

  // 목표 차선 채우기
  const fillTarget = st===1 ? .25 : (st===2||st===3) ? 1 : st===4 ? .5 : 0;
  S.fill += (fillTarget - S.fill)*k;
  const Lp=[],Rp=[]; for(let z=-110; z>=-230; z-=5){ Lp.push(proj(tx-1.75,z)); Rp.push(proj(tx+1.75,z)); }
  const bc = branchCurves[S.target];
  const fillD = strip(Lp,Rp) + strip(offsetPts(bc,0,.35,-2.3,proj), offsetPts(bc,0,.35,2.3,proj));
  const lf = $('#laneFill'); lf.setAttribute('d', fillD);
  const jamMerge = S.jam > 0 && S.target !== 1 && Math.abs(p.x - tx) > 1.2;
  lf.setAttribute('fill', (S.danger > .5 || jamMerge) ? C_WARN : C_NOW); lf.setAttribute('fill-opacity', (.22*S.fill).toFixed(3));

  // 경로 띠
  let len = 60, bt = .45;
  if(st===2 || st===3){ len = 150; bt = 1; }
  else if(st===4){ const t = clamp((-205 - p.z)/70); len = 60 - 45*t; bt = .75 - .45*t; }
  else if(st===5){ len = 10; bt = 0; }
  S.band += (bt - S.band)*k;
  const BL=[],BR=[];
  for(let i=0;i<32;i++){
    const ss = Math.min(path.L, S.s + 1 + (len-1)*i/31), q = path.curve.getPointAt(ss/path.L), t = path.curve.getTangentAt(ss/path.L);
    let nx=-t.z,nz=t.x; const l=Math.hypot(nx,nz)||1; nx/=l; nz/=l;
    BL.push(proj(q.x-nx*1.3,q.z-nz*1.3)); BR.push(proj(q.x+nx*1.3,q.z+nz*1.3));
  }
  const band = $('#band'); band.setAttribute('d', strip(BL,BR)); band.setAttribute('opacity', S.band.toFixed(3));
  const warn = S.danger > .5;
  band.setAttribute('fill', warn ? 'url(#bandWarn)' : 'url(#bandNow)');
  band.setAttribute('stroke', warn ? C_WARN : '#8ff1ff');

  // 정체 구간 표시: 목표 차로의 막힌 구간을 빗금 띠 + '정체 Xm' 핀으로
  const jb = $('#jamBand'), jp = $('#jamPin');
  if(S.jam > 0 && S.q && S.q.backZ !== null){
    const tail = S.q.backZ, Ljp=[], Rjp=[];
    for(let z=tail; z>=Q_FRONT; z-=4){ Ljp.push(proj(tx-1.7,z)); Rjp.push(proj(tx+1.7,z)); }
    const dj = strip(Ljp, Rjp);
    jb.setAttribute('d', dj); jb.setAttribute('opacity', dj ? '.9' : '0');
    const tp = proj(tx, tail);
    if(tp){ jp.setAttribute('opacity','1'); jp.setAttribute('transform', `translate(${tp[0].toFixed(1)} ${(tp[1]-16).toFixed(1)})`); $('#jamPinT').textContent = `정체 ${Math.max(0, Math.round(p.z - tail))}m`; }
    else jp.setAttribute('opacity','0');
  } else { jb.setAttribute('opacity','0'); jp.setAttribute('opacity','0'); }

  // 이름표
  const anchors = branchCurves.map(c => { const q = c.getPointAt(.16); return proj(q.x,q.z); });
  const fs = anchors[1] ? clamp(12 + anchors[1][2]*26, 13, 20) : 13;
  const w = DEST.map((dd,i) => dd.name.length*fs + (i===S.target?24:14));
  const xs = anchors.map(a => a ? a[0] : HX);
  if(anchors[1]){ xs[0] = Math.min(xs[0], xs[1]-(w[0]+w[1])/2-8); xs[2] = Math.max(xs[2], xs[1]+(w[1]+w[2])/2+8); }
  const tagY = anchors[1] ? Math.max(114, Math.min(...anchors.filter(Boolean).map(a=>a[1])) - 28) : 114;
  tagEls.forEach((t,i) => {
    const mine = i===S.target, a = anchors[i];
    let tgt = 0;
    if(a && p.z > -215 && (st===2 || st===3)) tgt = mine ? 1 : (st===2 ? .4 : .2);
    if(S.danger > .5) tgt *= .35;
    t.op += (tgt - t.op)*k;
    t.g.setAttribute('opacity', t.op.toFixed(3)); t.g.style.display = t.op < .01 ? 'none' : '';
    if(!a) return;
    const h = fs+14, x = xs[i], y = tagY;
    t.txt.setAttribute('x',x); t.txt.setAttribute('y', y+fs*.36); t.txt.setAttribute('font-size', (mine?fs:fs*.85).toFixed(1));
    t.txt.textContent = DEST[i].name; t.txt.setAttribute('fill', mine ? C_NOW : '#ffffff');
    t.rect.setAttribute('x', x-w[i]/2); t.rect.setAttribute('y', y-h/2); t.rect.setAttribute('width', w[i]); t.rect.setAttribute('height', h);
    t.rect.setAttribute('fill', mine ? C_NOW : 'none'); t.rect.setAttribute('fill-opacity', mine ? '.14' : '0');
    t.rect.setAttribute('stroke', mine ? C_NOW : 'none'); t.rect.setAttribute('stroke-width', mine ? 2 : 0);
    t.sub.textContent = mine ? '내 지선' : ''; t.sub.setAttribute('x',x); t.sub.setAttribute('y', y-h/2-6); t.sub.setAttribute('fill', C_NOW);
    t.line.setAttribute('x1',x); t.line.setAttribute('y1',y+h/2); t.line.setAttribute('x2',a[0]); t.line.setAttribute('y2',a[1]);
    t.line.setAttribute('stroke', mine ? C_NOW : '#ffffff'); t.line.setAttribute('stroke-opacity', mine ? '.9' : '.35');
  });

  // 지금 할 행동 / 다음 행동 + 남은 시간·거리
  const sideIcon = S.target===0 ? 'icoLeft' : S.target===2 ? 'icoRight' : 'icoUp';
  let now = '', next = '', icon = null, cdDist = null, cdTotal = 1, nowSize = 29, nowColor = C_NOW;
  if(st===1){ icon='icoFork'; now='세 갈래 분기점'; next=`다음  ${d.side} 지선 (${d.name})`; cdDist = p.z-FORK_Z; cdTotal = 230; }
  else if(st===2){ icon=sideIcon; now=`${d.side} 지선으로`; next= S.target===1 ? '다음  현재 차로 유지' : `다음  ${d.side} 차로로 이동`; cdDist = p.z-FORK_Z; cdTotal = 230; }
  else if(st===3){
    if(S.target===1){ icon='icoUp'; now='현재 차로 유지'; next=`다음  ${d.name} 지선 진입`; cdDist = p.z-FORK_Z; cdTotal = 115; }
    else { icon=sideIcon; now=`${d.side} 차로로 이동`; next=`다음  ${d.name} 지선 진입`; cdDist = p.z-CHANGE_END; cdTotal = 90; }
  }
  else if(st===4){
    if(p.z < -238){ icon='icoCheck'; now='진입 완료'; next='다음  경로 따라 직진'; }
    else { icon=sideIcon; now=`${d.name} 진입`; next='다음  경로 따라 직진'; }
  }
  else { icon=null; now='경로 안내 중'; next=''; nowSize = 17; nowColor = 'rgba(255,255,255,.55)'; }

  // 정체 대응 (핵심 차별점): 분기점 전 구간에서 미리 이동 / 대기 / 끼어들기 위험을 대신 판단
  if(S.jam > 0 && S.q && S.q.backZ !== null && st >= 1 && st <= 3 && p.z > -206){
    const inLane = Math.abs(p.x - tx) < 1.2, distBack = p.z - S.q.backZ;
    if(S.target !== 1 && !inLane && distBack > 2){
      icon = sideIcon; cdDist = Math.max(0, distBack); cdTotal = 60; nowSize = 28;
      if(S.q.mergeNear){ now = `지금 ${d.side}으로!`; next = '틈 열림 · 지금 차로 이동'; nowColor = C_NOW; }
      else { now = `${d.side}으로 미리`; next = `${d.side} 차로 정체 · 늦으면 끼어들기 위험`; nowColor = C_WARN; }
    } else if(S.target !== 1 && !inLane){
      icon = 'icoWarn'; now = '서행하며 틈 대기'; next = '무리한 끼어들기 금지'; nowColor = C_WARN; cdDist = null; nowSize = 26;
    } else {
      icon = 'icoUp'; now = '여기서 대기'; next = `앞차 따라 서행 · ${d.name} 정체`; nowColor = C_NOW; cdDist = null; nowSize = 27;
    }
  }

  // 위험 경고: 모든 안내보다 우선
  if(S.danger > .5){
    icon='icoWarn'; now=`${d.side} 뒤 차량 접근`; next='지나간 뒤 차로를 옮기세요'; nowColor = C_WARN; cdDist = null;
  }
  showIcon(icon, nowColor);
  const nt = $('#nowText'); nt.textContent = now; nt.setAttribute('fill', nowColor); nt.setAttribute('font-size', nowSize);
  nt.setAttribute('x', icon ? 78 : 40); nt.setAttribute('y', icon ? 46 : 40);
  $('#nextText').textContent = next;

  // 애니메이션(목적형): 긴급할 때만 아이콘 맥박 + 이동 안내 시 경로 흐름
  const urgent = (S.danger > .5) || (S.jam > 0 && /지금 |서행하며/.test(now));
  const halo = $('#nowHalo');
  halo.classList.toggle('on', urgent && !!icon);
  halo.setAttribute('stroke', nowColor);
  if(!(urgent && icon)) halo.setAttribute('opacity', '0');
  const moving = st===2 || st===3 || (S.jam > 0 && /미리|지금|이동/.test(now));
  band.classList.toggle('flow', moving && !warn);
  band.setAttribute('stroke-dasharray', moving ? (warn ? '6 5' : '10 8') : (warn ? '6 5' : 'none'));
  const cd = $('#cd');
  if(cdDist !== null && cdDist > 0 && !(S.testing && S.qType === 'danger')){
    cd.style.display = '';
    const sec = cdDist/SPEED, urg = sec < 3;
    $('#cdSec').textContent = sec < 10 ? `${sec.toFixed(1)}초` : `${Math.round(sec)}초`;
    $('#cdSec').setAttribute('font-size', urg ? 32 : 26);
    $('#cdM').textContent = `${Math.round(cdDist)}m`;
    $('#cdBar').setAttribute('width', (138*clamp(cdDist/cdTotal)).toFixed(1));
  } else cd.style.display = 'none';

  // 위험 표시: 가장자리 빛 + 차량 표시
  const dz = S.danger;
  $('#edgeL').setAttribute('opacity', S.target===0 ? dz : 0);
  $('#edgeR').setAttribute('opacity', S.target===2 ? dz : 0);
  const cb = $('#carBehind');
  if(S.car && S.car.pos){
    const q = proj(S.car.pos.x, S.car.pos.z), ca = $('#carAhead');
    // 앞으로 지나가면 도로 위에, 뒤에 있으면 하단 마커로 — 다가올수록 커짐
    if(q && dz > .05){ ca.setAttribute('x', q[0]-8*q[2]*2); ca.setAttribute('y', q[1]-12*q[2]); ca.setAttribute('width', 16*q[2]*2); ca.setAttribute('height', 12*q[2]*2); ca.setAttribute('opacity', dz); }
    else ca.setAttribute('opacity', 0);
    cb.setAttribute('opacity', (!q ? dz : 0).toFixed(2));
    const sc = (0.85 + dz*0.9).toFixed(2);   // 가까울수록 크게
    cb.setAttribute('transform', `translate(${S.target===0 ? 150 : 354} 214) scale(${sc})`);
  } else { cb.setAttribute('opacity',0); $('#carAhead').setAttribute('opacity',0); }

  // 부수 정보 흐리게
  const infoT = S.danger > .5 ? .12 : ({1:.55, 2:.35, 3:.2, 4:.4, 5:.85})[st];
  S.info += (infoT - S.info)*k;
  $('#info').setAttribute('opacity', S.info.toFixed(3));
  $('#spdA').textContent = kmh;
  $('#remainA').textContent = `남은 거리 ${remainKm}km`;
}

/* ---------- 기존 HUD (대조군) ---------- */
function drawNav(st, p, d, kmh, remainKm, dangerOn){
  const dist = Math.max(0, Math.round(p.z - FORK_Z));
  const rot = st >= 5 ? 0 : [-40,0,40][S.target];
  $('#navTurn').setAttribute('transform', `translate(196 54) rotate(${rot})`);
  $('#navText').textContent = st >= 5 ? '경로 안내 중' : `${dist > 0 ? dist+'m' : '진입'}  |  ${d.name} 방향${S.jam > 0 ? ' · 정체' : ''}`;
  $('#navLanes').setAttribute('opacity', st <= 3 ? 1 : 0);
  navLaneEls.forEach(a => { const on = +a.dataset.i===S.target; a.setAttribute('fill', on ? C_NOW : '#f2f7fa'); a.setAttribute('fill-opacity', on ? 1 : .55); });
  $('#spdN').textContent = kmh;
  const now = new Date(Date.now() + (3.4 - (S.s-40)/1000)/65*3600000);
  $('#navInfo').textContent = `남은 거리 ${remainKm}km   도착 ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}   연비 16.2km/L`;
  $('#navBsd').setAttribute('opacity', dangerOn ? 1 : 0);
  $('#navBsd').setAttribute('transform', S.target===0 ? 'translate(152 196)' : 'translate(356 196)');
}
