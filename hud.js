/* ============================================================
   hud.js — 유리 위 HUD 상자(SVG) 그리기
   · 기존 HUD(대조군): 현대·기아 순정 HUD 구성 재현 — 근거는 01_프로젝트/03_MVP_정의.md
   · 우리 HUD v1.2: 정보 위계대로 ① 지금 할 한 가지(아이콘 + 한 단어, 신호등 색) ② 언제(막대·마감선) ③ 어디로(미니 도로) ④ 속도
     설계 근거는 01_프로젝트/10_HUD_GUI_설계.md
   · 고스트카: 속도만 (안내는 main.js updateGhost의 가상 차)
   config.js, scene.js 다음에 로드. 상태 S·path는 main.js에서 정의(호출 시점엔 존재).
   ============================================================ */

const NAV_BLUE = '#35b1ff';   // 순정 HUD의 경로 안내 파랑

/* ---------- 기존 HUD 틀 (대조군) ----------
   왼쪽 주행 경로 안내(남은 거리 막대 · 분기 그림 · 거리 · 방면) / 가운데 위 차로 안내 칸 / 가운데 차속 + 차로 유지 보조 선 /
   오른쪽 제한속도 / 양옆 후측방 안전(주황) */
function baseMarkup(p, lanes){
  const bcw = '<rect x="-5" y="-9" width="10" height="18" rx="3" fill="#ffb020"/><path d="M-10 -6 Q-14 0 -10 6 M-15 -9 Q-20 0 -15 9" stroke="#ffb020" stroke-width="2" fill="none" stroke-linecap="round"/>';
  const head = (i, t) => `<path id="${p}H${i}" d="M-8 0 L0 -11 L8 0 Z" transform="${t}" fill="${NAV_BLUE}"/>`;
  return `
    <rect x="72" y="160" width="5" height="54" rx="2.5" fill="#fff" fill-opacity=".2"/>
    <rect id="${p}Bar" x="72" y="160" width="5" height="54" rx="2.5" fill="${NAV_BLUE}"/>
    <g id="${p}Fork" transform="translate(104 190)" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path id="${p}B0" d="M0 6 Q0 -6 -15 -21"/><path id="${p}B1" d="M0 6 V-22"/><path id="${p}B2" d="M0 6 Q0 -6 15 -21"/>
      <path d="M0 26 V6" stroke="${NAV_BLUE}" stroke-width="7"/>
      ${head(0,'translate(-16 -21) rotate(-45)')}${head(1,'translate(0 -22)')}${head(2,'translate(16 -21) rotate(45)')}
    </g>
    <g id="${p}Straight" transform="translate(104 190)"><path d="M0 26 V-16 M-10 -6 L0 -18 L10 -6" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></g>
    <text x="132" y="190" fill="#fff"><tspan id="${p}Dist" font-size="24" font-weight="700">0</tspan><tspan id="${p}Unit" font-size="13" dx="3" font-weight="500">m</tspan></text>
    <text id="${p}Name" x="133" y="209" font-size="12" fill="#fff" fill-opacity=".75"></text>
    ${lanes ? `<g id="${p}Lanes" transform="translate(260 146)"></g>` : ''}
    <path d="M214 238 L229 176 M306 238 L291 176" stroke="#fff" stroke-opacity=".45" stroke-width="3" stroke-linecap="round"/>
    <text id="${p}Spd" x="260" y="216" text-anchor="middle" font-size="40" font-weight="700" fill="#fff">0</text>
    <text x="260" y="233" text-anchor="middle" font-size="11" fill="#fff" fill-opacity=".7">km/h</text>
    <circle cx="372" cy="192" r="17" fill="#fff" stroke="#e03a3a" stroke-width="4"/>
    <text x="372" y="198" text-anchor="middle" font-size="15" font-weight="700" fill="#111">80</text>
    <g id="${p}BcwL" transform="translate(190 202)" opacity="0">${bcw}</g>
    <g id="${p}BcwR" transform="translate(330 202) scale(-1 1)" opacity="0">${bcw}</g>`;
}
$('#navHud').innerHTML = baseMarkup('nv', true);

function drawBase(pf, st, p, d, kmh, remainKm, dangerOn){
  const dist = Math.max(0, Math.round(p.z - FORK_Z)), before = st <= 3 && dist > 0;
  // 주행 경로 안내: 분기 그림(갈 지선만 파랑) · 거리 · 방면 · 남은 거리 막대(300m부터 줄어듦)
  $('#'+pf+'Fork').style.display = before ? '' : 'none';
  $('#'+pf+'Straight').style.display = before ? 'none' : '';
  [0,1,2].forEach(i => {
    const on = i === S.target, b = $('#'+pf+'B'+i);
    b.setAttribute('stroke', on ? NAV_BLUE : '#ffffff'); b.setAttribute('stroke-opacity', on ? 1 : .35); b.setAttribute('stroke-width', on ? 7 : 5);
    $('#'+pf+'H'+i).style.display = on ? '' : 'none';
  });
  $('#'+pf+'Dist').textContent = before ? dist : remainKm;
  $('#'+pf+'Unit').textContent = before ? 'm' : 'km';
  $('#'+pf+'Name').textContent = before ? `${d.name} 방면` : '';
  const f = before ? clamp(dist/300) : 0, bar = $('#'+pf+'Bar');
  bar.setAttribute('y', (160 + 54*(1-f)).toFixed(1)); bar.setAttribute('height', (54*f).toFixed(1));
  $('#'+pf+'Spd').textContent = kmh;
  // 후측방 안전: 옮기려는 쪽에 주황 아이콘
  $('#'+pf+'BcwL').setAttribute('opacity', dangerOn && S.target === 0 ? 1 : 0);
  $('#'+pf+'BcwR').setAttribute('opacity', dangerOn && S.target === 2 ? 1 : 0);
  return before;
}

/* ---------- 기존 HUD (대조군) ---------- */
// 차로 안내 칸 3개: 권장 차로는 파랑으로 채운다
const nvLaneEls = [-30, 0, 30].map((rot, i) => {
  const mk = n => document.createElementNS(SVGNS, n), g = mk('g'), box = mk('rect'), arrow = mk('path');
  g.setAttribute('transform', `translate(${(i-1)*30} 0)`);
  Object.entries({x:-12, y:-15, width:24, height:30, rx:5, 'stroke-width':1.6}).forEach(([k,v]) => box.setAttribute(k, v));
  Object.entries({d:'M0 9 V-7 M-5 -2 L0 -8 L5 -2', transform:`rotate(${rot})`, fill:'none', stroke:'#ffffff',
    'stroke-width':2.6, 'stroke-linecap':'round', 'stroke-linejoin':'round'}).forEach(([k,v]) => arrow.setAttribute(k, v));
  g.append(box, arrow); $('#nvLanes').appendChild(g);
  return {box, arrow};
});
function drawNav(st, p, d, kmh, remainKm, dangerOn){
  const before = drawBase('nv', st, p, d, kmh, remainKm, dangerOn);
  $('#nvLanes').style.display = before ? '' : 'none';
  nvLaneEls.forEach((l, i) => {
    const on = i === S.target;
    l.box.setAttribute('fill', on ? NAV_BLUE : 'none'); l.box.setAttribute('fill-opacity', on ? .9 : 0);
    l.box.setAttribute('stroke', on ? NAV_BLUE : '#ffffff'); l.box.setAttribute('stroke-opacity', on ? 1 : .35);
    l.arrow.setAttribute('stroke-opacity', on ? 1 : .45);
  });
}

/* ---------- 고스트카: 속도만 ---------- */
function drawMin(kmh){ $('#spdM').textContent = kmh; }

/* ---------- 우리 HUD: 미니 도로 투영 (v1 크기·위치 그대로, y 112~228) ---------- */
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
const icons = ['icoRight','icoLeft','icoUp','icoCheck','icoNoGo','icoPause','icoQueue'];
function showIcon(id, color){ icons.forEach(n => $('#'+n).style.display = n===id ? '' : 'none'); $('#nowIcon').setAttribute('stroke', color); $('#nowIcon').style.display = id ? '' : 'none'; }

/* ---------- 우리 HUD v1.2 ---------- */
function drawAr(p, f, st, d, k, dangerOn, kmh){
  const proj = makeProj(p, f), tx = (S.target-1)*LANE, sgn = Math.sign(tx), now = performance.now();
  // 뒤차 판단은 고스트카의 '기다림'과 같은 기준: 시연은 다가오는 차가 내 옆을 지나갈 때까지, 테스트는 위험한 경우
  const block = S.rearActive && (S.testing ? S.rearDanger : (S.rearGap < 45 && S.rearGap > -8));
  const warn = block || S.danger > .5, inLane = Math.abs(p.x - tx) < 1.2;
  const tail = S.jam > 0 && S.q && S.q.backZ !== null ? S.q.backZ : null;
  const needMove = S.target !== 1 && !inLane && st <= 3;
  const besideQueue = tail !== null && needMove && p.z <= tail + 2;          // 이미 줄 옆까지 와 버림
  const gateZ = tail !== null ? tail + 10 : CHANGE_END;                      // 여기까지는 옮겨 있어야 함
  const frac = clamp((p.z - gateZ)/(0 - gateZ)), late = frac <= .35;

  /* ① 지금 할 한 가지 — 상황마다 하나만. 색은 신호등(초록 해도 됨 · 주황 서두름/정체 · 빨강 대기), 경로 정보는 청록 */
  const moveIco = S.target === 0 ? 'icoLeft' : 'icoRight';
  let icon = null, word = '', color = C_NOW;
  if(st === 4){ const done = p.z < -238; icon = done ? 'icoCheck' : (S.target === 1 ? 'icoUp' : moveIco); word = done ? '완료' : '진입'; }
  else if(st <= 3){
    if(needMove && warn){ icon = 'icoNoGo'; word = '대기'; color = C_DANGER; }
    else if(besideQueue){ const gap = S.q.mergeNear; icon = gap ? moveIco : 'icoPause'; word = gap ? '지금' : '틈 대기'; color = gap ? C_GO : C_WARN; }
    else if(needMove){ icon = moveIco; word = late ? '지금 이동' : '이동'; color = late ? C_WARN : C_GO; }
    else if(tail !== null){ icon = 'icoQueue'; word = '줄 서기'; color = C_WARN; }
    else { icon = 'icoUp'; word = '유지'; }
  }
  showIcon(icon, color);
  const nt = $('#nowText'); nt.textContent = word; nt.setAttribute('fill', color);
  const tw = word ? nt.getComputedTextLength() : 0, total = 44 + (word ? 12 + tw : 0);   // 아이콘+단어를 한 덩어리로 가운데 정렬
  $('#act').setAttribute('transform', `translate(${(HX - total/2 + 22).toFixed(1)} 34)`);
  nt.setAttribute('x', 34);
  const urgent = icon && (color === C_DANGER || word === '지금');
  const halo = $('#nowHalo'); halo.classList.toggle('on', !!urgent); halo.setAttribute('stroke', color);
  if(!urgent) halo.setAttribute('opacity', '0');

  /* ② 언제 — 옮겨야 할 때만. 막대가 줄어들고 미니 도로 위 마감선과 같은 색 */
  const showTiming = needMove && !warn && !besideQueue;
  $('#cd').style.display = showTiming ? '' : 'none';
  if(showTiming){ $('#cdBar').setAttribute('width', (120*frac).toFixed(1)); $('#cdBar').setAttribute('x', (260 - 60*frac).toFixed(1)); $('#cdBar').setAttribute('fill', color); $('#cdBg').setAttribute('fill', color); }
  const g0 = showTiming ? proj(tx-1.75, gateZ) : null, g1 = showTiming ? proj(tx+1.75, gateZ) : null;
  $('#gate').setAttribute('d', g0 && g1 ? `M${fmt(g0)}L${fmt(g1)}` : ''); $('#gate').setAttribute('stroke', color);

  /* ③ 어디로 — 미니 도로 (v1 선 굵기보다 조금 진하게) */
  const lines = [];
  for(const x of [-5.4,5.4]){ const pts=[]; for(let z=40; z>=-230; z-=5) pts.push(proj(x,z)); lines.push(polyline(pts)); }
  branchCurves.forEach((c,i) => { lines.push(polyline(offsetPts(c, i===0?0:.06, 1, -2.3, proj, 40))); lines.push(polyline(offsetPts(c, i===2?0:.06, 1, 2.3, proj, 40))); });
  $('#rdLines').setAttribute('d', lines.join(''));
  const dashes = [];
  for(const x of [-LANE/2,LANE/2]){ const pts=[]; for(let z=40; z>=-224; z-=5) pts.push(proj(x,z)); dashes.push(polyline(pts)); }
  $('#rdDash').setAttribute('d', dashes.join(''));
  // 내 차로: 지금 위치 바로 앞부터 분기 지선까지 한 줄로 (차로마다 화살표 표지판처럼 '이 차로가 목적지로 간다')
  const fillTarget = st===1 ? .7 : (st===2||st===3) ? 1 : st===4 ? .6 : 0;
  S.fill += (fillTarget - S.fill)*k;
  const Lp=[],Rp=[]; for(let z=Math.min(p.z-3, 20); z>=-230; z-=4){ Lp.push(proj(tx-1.75,z)); Rp.push(proj(tx+1.75,z)); }
  const bc = branchCurves[S.target];
  const lf = $('#laneFill'); lf.setAttribute('d', strip(Lp,Rp) + strip(offsetPts(bc,0,.65,-2.3,proj,32), offsetPts(bc,0,.65,2.3,proj,32)));
  lf.setAttribute('fill', C_NOW); lf.setAttribute('fill-opacity', ((warn ? .14 : .26)*S.fill).toFixed(3));
  lf.setAttribute('stroke', C_NOW); lf.setAttribute('stroke-opacity', ((warn ? .4 : .75)*S.fill).toFixed(3)); lf.setAttribute('stroke-width', 1.6);
  // 옮길 방향 화살표: 내 위치 → 목표 차로. 막히면 빨간 점선 + 머리에 막대
  const a0 = needMove ? proj(p.x, p.z-7) : null, a1 = needMove ? proj(p.x, p.z-19) : null, a2 = needMove ? proj(tx, p.z-31) : null;
  const ma = $('#moveArrow'), mh = $('#moveHead'), ms = $('#moveStop');
  if(a0 && a1 && a2){
    ma.setAttribute('d', `M${fmt(a0)}Q${fmt(a1)} ${fmt(a2)}`); ma.setAttribute('stroke', color);
    ma.setAttribute('stroke-dasharray', warn ? '5 6' : besideQueue && !S.q.mergeNear ? '5 6' : '12 7');
    ma.classList.toggle('flow', !warn && !(besideQueue && !S.q.mergeNear));
    let dx = a2[0]-a1[0], dy = a2[1]-a1[1]; const l = Math.hypot(dx,dy)||1; dx/=l; dy/=l;
    const hx = a2[0]+dx*7, hy = a2[1]+dy*7, nx = -dy, ny = dx;
    mh.setAttribute('d', `M${(hx).toFixed(1)} ${(hy).toFixed(1)}L${(a2[0]-dx*6+nx*8).toFixed(1)} ${(a2[1]-dy*6+ny*8).toFixed(1)}L${(a2[0]-dx*6-nx*8).toFixed(1)} ${(a2[1]-dy*6-ny*8).toFixed(1)}Z`);
    mh.setAttribute('fill', color);
    const sx = a2[0]-dx*16, sy = a2[1]-dy*16;
    ms.setAttribute('d', warn ? `M${(sx+nx*11).toFixed(1)} ${(sy+ny*11).toFixed(1)}L${(sx-nx*11).toFixed(1)} ${(sy-ny*11).toFixed(1)}` : '');
  } else { ma.setAttribute('d', ''); mh.setAttribute('d', ''); ms.setAttribute('d', ''); ma.classList.remove('flow'); }
  // 정체: 막힌 구간 빗금(주황) + 줄 맨 뒤 '설 칸'
  const jb = $('#jamBand');
  if(tail !== null){
    const Ljp=[], Rjp=[];
    for(let z=tail; z>=Q_FRONT; z-=4){ Ljp.push(proj(tx-1.7,z)); Rjp.push(proj(tx+1.7,z)); }
    const dj = strip(Ljp, Rjp); jb.setAttribute('d', dj); jb.setAttribute('opacity', dj ? '.95' : '0');
  } else jb.setAttribute('opacity','0');
  const sq = tail !== null && p.z > tail + 14 ? [proj(tx-1.3,tail+5), proj(tx+1.3,tail+5), proj(tx+1.3,tail+10), proj(tx-1.3,tail+10)] : [];
  $('#slot').setAttribute('d', sq.length && sq.every(Boolean) ? 'M'+sq.map(fmt).join('L')+'Z' : '');
  $('#slot').setAttribute('opacity', (.7 + .3*Math.sin(now/260)).toFixed(2));

  /* 뒤차: 초보자는 옆·뒤를 잘 안 보므로 가운데로 끌어온다 — 목표 차로 아래쪽에 빨간 차 + 앞으로 지나가면 도로 위에 */
  const dz = S.danger, cb = $('#carBehind'), ca = $('#carAhead');
  $('#edgeL').setAttribute('opacity', S.target===0 ? dz*.8 : 0);
  $('#edgeR').setAttribute('opacity', S.target===2 ? dz*.8 : 0);
  const q = S.car && S.car.pos ? proj(S.car.pos.x, S.car.pos.z) : null;
  if(q && dz > .05){ ca.setAttribute('x', q[0]-8*q[2]*2); ca.setAttribute('y', q[1]-12*q[2]); ca.setAttribute('width', 16*q[2]*2); ca.setAttribute('height', 12*q[2]*2); ca.setAttribute('opacity', dz); }
  else ca.setAttribute('opacity', 0);
  cb.setAttribute('opacity', (S.car && !q ? dz : 0).toFixed(2));
  cb.setAttribute('transform', `translate(${(HX + sgn*80).toFixed(1)} 222) scale(${(0.8 + dz*.5).toFixed(2)})`);

  /* ④ 속도 */
  $('#spdA').textContent = kmh;
}
