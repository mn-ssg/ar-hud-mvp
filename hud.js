/* ============================================================
   hud.js — 유리 위 HUD 상자(SVG) 그리기
   · 기존 HUD(대조군): 현대·기아 순정 HUD 구성 재현 — 근거는 01_프로젝트/03_MVP_정의.md
   · 우리 HUD v1.2: 정보 위계대로 ① 지금 할 한 가지(아이콘 + 한 단어, 신호등 색) ② 언제(막대·마감선) ③ 어디로(미니 도로) ④ 속도
     설계 근거는 01_프로젝트/10_HUD_GUI_설계.md
   · 맵 5종(maps.js): 분기 그림·차로 안내 칸·미니 도로를 맵 데이터로 그린다. C = 다음 갈림 정보(main.js navCtx)
   config.js, maps.js, scene.js 다음에 로드. 상태 S·path는 main.js에서 정의(호출 시점엔 존재).
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

function drawBase(pf, C, kmh, remainKm, dangerOn){
  const dist = Math.max(0, Math.round(C.d)), before = C.st <= 3 && dist > 0, R = S.route;
  // 주행 경로 안내: 다음 갈림의 분기 그림(있는 갈래만, 갈 갈래는 파랑) · 거리 · 방면 · 남은 거리 막대(300m부터 줄어듦)
  $('#'+pf+'Fork').style.display = before ? '' : 'none';
  $('#'+pf+'Straight').style.display = before ? 'none' : '';
  const ti = KEY_IDX[C.node.key], have = C.node.keys.map(k => KEY_IDX[k]);
  [0,1,2].forEach(i => {
    const on = i === ti, b = $('#'+pf+'B'+i);
    b.style.display = have.includes(i) ? '' : 'none';
    b.setAttribute('stroke', on ? NAV_BLUE : '#ffffff'); b.setAttribute('stroke-opacity', on ? 1 : .35); b.setAttribute('stroke-width', on ? 7 : 5);
    $('#'+pf+'H'+i).style.display = on ? '' : 'none';
  });
  $('#'+pf+'Dist').textContent = before ? dist : remainKm;
  $('#'+pf+'Unit').textContent = before ? 'm' : 'km';
  $('#'+pf+'Name').textContent = before ? `${R.leaf.dest} 방면` : '';
  const f = before ? clamp(dist/300) : 0, bar = $('#'+pf+'Bar');
  bar.setAttribute('y', (160 + 54*(1-f)).toFixed(1)); bar.setAttribute('height', (54*f).toFixed(1));
  $('#'+pf+'Spd').textContent = kmh;
  // 후측방 안전: 옮기려는 쪽에 주황 아이콘
  $('#'+pf+'BcwL').setAttribute('opacity', dangerOn && R.side < 0 ? 1 : 0);
  $('#'+pf+'BcwR').setAttribute('opacity', dangerOn && R.side > 0 ? 1 : 0);
  return before;
}

/* ---------- 기존 HUD (대조군) ---------- */
// 차로 안내 칸: 본선 차로 수만큼, 칸마다 그 차로가 가는 방향 화살표. 권장 차로(목적지 출구의 차로)는 파랑으로 채운다
let nvLaneEls = [];
function buildNavLanes(m){
  const wrap = $('#nvLanes'); wrap.innerHTML = '';
  nvLaneEls = Array.from({length:m.lanes}, (_, i) => {
    const key = m.exits.find(e => e.lanes.includes(i)).key, rot = {L:-30, S:0, R:30}[key];
    const mk = n => document.createElementNS(SVGNS, n), g = mk('g'), box = mk('rect'), arrow = mk('path');
    g.setAttribute('transform', `translate(${(i-(m.lanes-1)/2)*30} 0)`);
    Object.entries({x:-12, y:-15, width:24, height:30, rx:5, 'stroke-width':1.6}).forEach(([k,v]) => box.setAttribute(k, v));
    Object.entries({d:'M0 9 V-7 M-5 -2 L0 -8 L5 -2', transform:`rotate(${rot})`, fill:'none', stroke:'#ffffff',
      'stroke-width':2.6, 'stroke-linecap':'round', 'stroke-linejoin':'round'}).forEach(([k,v]) => arrow.setAttribute(k, v));
    g.append(box, arrow); wrap.appendChild(g);
    return {box, arrow};
  });
}
function drawNav(C, kmh, remainKm, dangerOn){
  const before = drawBase('nv', C, kmh, remainKm, dangerOn);
  $('#nvLanes').style.display = before && C.i === 0 ? '' : 'none';   // 램프 위(⑤ 두 번째 갈림)는 차로 안내 없음
  nvLaneEls.forEach((l, i) => {
    const on = S.route.exitLanes.includes(i);
    l.box.setAttribute('fill', on ? NAV_BLUE : 'none'); l.box.setAttribute('fill-opacity', on ? .9 : 0);
    l.box.setAttribute('stroke', on ? NAV_BLUE : '#ffffff'); l.box.setAttribute('stroke-opacity', on ? 1 : .35);
    l.arrow.setAttribute('stroke-opacity', on ? 1 : .45);
  });
}

/* ---------- 우리 HUD: 미니 도로 투영 (v1 크기·위치, y 112~228) ---------- */
const HX = 260, HY_NEAR = 228, HY_FAR = 112, HALF = 112, K = 55, PXM = HALF/5.25;   // PXM: 가장 가까운 곳 1m = px
function makeProj(p, f){
  const rx = -f.z, rz = f.x;
  return (wx,wz) => {
    const dx = wx-p.x, dz = wz-p.z, d = dx*f.x + dz*f.z;
    if(d < 0 || d > 300) return null;
    const X = dx*rx + dz*rz, s = K/(d+K);
    return [HX + X*PXM*s, HY_FAR + (HY_NEAR-HY_FAR)*s, s, d];
  };
}
const fmt = q => q[0].toFixed(1)+' '+q[1].toFixed(1);
function strip(L,R){ const a=[],b=[]; L.forEach((q,i)=>{ if(q&&R[i]){ a.push(q); b.push(R[i]); } }); return a.length>1 ? 'M'+a.map(fmt).join('L')+'L'+b.reverse().map(fmt).join('L')+'Z' : ''; }
function offsetPts(curve,u0,u1,off,proj,n=24){
  const out=[];
  for(let i=0;i<n;i++){ const u=u0+(u1-u0)*i/(n-1), q=curve.getPointAt(u), t=curve.getTangentAt(u); let nx=-t.z,nz=t.x; const l=Math.hypot(nx,nz)||1; out.push(proj(q.x+nx/l*off, q.z+nz/l*off)); }
  return out;
}
// 선을 '원근 굵기'의 띠로 그린다 — 가까운 선은 굵고 먼 선은 가늘게 (실제 도로를 옮긴 모형처럼)
function bandX(x0, x1, z0, z1, proj, step=4){ const L=[],R=[]; for(let z=z0; z>=z1; z-=step){ L.push(proj(x0,z)); R.push(proj(x1,z)); } return strip(L,R); }
const lineX = (x, z0, z1, hw, proj) => bandX(x-hw, x+hw, z0, z1, proj);
const lineC = (c, u0, u1, off, hw, proj, n=40) => strip(offsetPts(c,u0,u1,off-hw,proj,n), offsetPts(c,u0,u1,off+hw,proj,n));
function quadZ(x0, x1, za, zb, proj){ const q = [proj(x0,za), proj(x1,za), proj(x1,zb), proj(x0,zb)]; return q.every(Boolean) ? 'M'+q.map(fmt).join('L')+'Z' : ''; }
// 점선은 3D 도로와 같은 간격(3m 칠 · 6m 빈칸)
function dashX(x, hw, zNear, proj){ let o=''; for(let z=38; z>-222; z-=9){ if(z > zNear + 3) continue; o += quadZ(x-hw, x+hw, z, z-3, proj); } return o; }

const icons = ['icoRight','icoLeft','icoUp','icoCheck','icoNoGo','icoPause','icoQueue'];
function showIcon(id, color){ icons.forEach(n => $('#'+n).style.display = n===id ? '' : 'none'); $('#nowIcon').setAttribute('stroke', color); $('#nowIcon').style.display = id ? '' : 'none'; }
const hexRgb = h => [1,3,5].map(i => parseInt(h.slice(i,i+2),16));
const mix = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return '#'+A.map((v,i) => Math.round(v+(B[i]-v)*t).toString(16).padStart(2,'0')).join(''); };
const ease = t => 1 - Math.pow(1 - t, 3);
// 남은 몫에 따라 연속으로 초록 → 주황 → 빨강
const timeColor = fr => fr >= .5 ? C_GO : fr >= .2 ? mix(C_WARN, C_GO, (fr-.2)/.3) : mix(C_DANGER, C_WARN, fr/.2);

// 미니 도로의 차량 표시: 정체 줄 차(주황) · 뒤에서 와 앞지르는 차(빨강)
const vehEls = Array.from({length:24}, () => { const r = document.createElementNS(SVGNS,'rect'); r.setAttribute('rx', 2.5); r.setAttribute('stroke-width', 1.4); $('#veh').appendChild(r); return r; });

/* ① 행동 상태: 급한 경고(빨강)는 즉시, 나머지는 0.22초 이상 이어질 때만 바꾼다(깜빡거림 방지). 바뀔 땐 0.2초 동안 커지며 나타남 */
const AS = {key:'', cur:{icon:null, word:'', color:C_NOW}, since:0, pend:'', pendSince:0, doneUntil:0, wasMove:false};
function resetHud(){ AS.key = ''; AS.pend = ''; AS.doneUntil = 0; AS.wasMove = false; }
function commitAction(next, now){
  const key = (next.icon||'')+'|'+next.word+'|'+next.color;
  if(key === AS.key){ AS.pend = ''; return; }
  if(next.color === C_DANGER || !AS.key || (AS.pend === key && now - AS.pendSince > 220)){ AS.key = key; AS.cur = next; AS.since = now; AS.pend = ''; }
  else if(AS.pend !== key){ AS.pend = key; AS.pendSince = now; }
}

/* ---------- 우리 HUD v1.3 ---------- */
function drawAr(p, f, C, k, dangerOn, kmh){
  const m = S.map, R = S.route, st = C.st, onMain = C.i === 0;
  const proj = makeProj(p, f), tx = R.tx, sgn = R.side, now = performance.now();
  // 뒤차 판단: 시연은 다가오는 차가 내 옆을 지나갈 때까지, 테스트는 위험한 경우
  const block = S.rearActive && (S.testing ? S.rearDanger : (S.rearGap < 45 && S.rearGap > -8));
  const warn = block || S.danger > .5, inLane = !onMain || Math.abs(p.x - tx) < 1.2;
  const tail = onMain && S.jam > 0 && S.q && S.q.backZ !== null ? S.q.backZ : null;
  const needMove = onMain && !inLane && st <= 3;
  const besideQueue = tail !== null && needMove && p.z <= tail + 2;          // 이미 줄 옆까지 와 버림
  const gateZ = tail !== null ? tail + 10 : CHANGE_END;                      // 여기까지는 옮겨 있어야 함
  const frac = clamp((p.z - gateZ)/(0 - gateZ)), late = frac <= .35;
  const zNear = Math.min(p.z - 2, 40);

  /* ① 지금 할 한 가지 — 상황마다 하나만 */
  if(AS.wasMove && !needMove && inLane && st <= 3) AS.doneUntil = now + 1400;  // 차로를 다 옮기면 잠깐 '완료'로 칭찬
  AS.wasMove = needMove;
  const moveIco = sgn < 0 ? 'icoLeft' : 'icoRight';
  const dirIco = {L:'icoLeft', S:'icoUp', R:'icoRight'}[C.node.key];   // 다음 갈림에서 갈 방향
  let next = {icon:null, word:'', color:C_NOW};
  if(st === 4){ const done = C.d < -8; next = {icon: done ? 'icoCheck' : dirIco, word: done ? '완료' : '진입', color: done ? C_GO : C_NOW}; }   // '해냈다'는 늘 초록
  else if(st <= 3){
    if(needMove && warn) next = {icon:'icoNoGo', word:'대기', color:C_DANGER};
    else if(besideQueue){ const gap = S.q.mergeNear; next = {icon: gap ? moveIco : 'icoPause', word: gap ? '지금' : '틈 대기', color: gap ? C_GO : C_WARN}; }
    else if(needMove) next = {icon:moveIco, word: late ? '지금 이동' : '이동', color: late ? C_WARN : C_GO};
    else if(now < AS.doneUntil) next = {icon:'icoCheck', word:'완료', color:C_GO};
    else if(tail !== null) next = {icon:'icoQueue', word:'줄 서기', color:C_WARN};
    else next = {icon:dirIco, word:'유지', color:C_NOW};   // D31: 아이콘 = 갈 방향, 단어 = 할 일 (옮길 필요 없이 갈리면 ↖ 유지)
  }
  commitAction(next, now);
  const {icon, word, color} = AS.cur, act = $('#act');
  showIcon(icon, color);
  act.style.display = icon ? '' : 'none';
  const nt = $('#nowText'); nt.textContent = word; nt.setAttribute('fill', color);
  $('#nowRing').setAttribute('stroke', color); $('#nowRing').setAttribute('stroke-opacity', .45);
  const tw = word ? nt.getComputedTextLength() : 0, total = 44 + (word ? 12 + tw : 0);
  const e = ease(clamp((now - AS.since)/200));
  act.setAttribute('transform', `translate(${HX} 34) scale(${(.88 + .12*e).toFixed(3)}) translate(${(-total/2 + 22).toFixed(1)} 0)`);
  act.setAttribute('opacity', e.toFixed(3));
  // '이동'의 화살표는 실제 차의 방향지시등(초록 깜빡임)처럼 깜빡인다 → 글자 없이 "깜빡이 켜고 옮겨"
  const signal = (icon === 'icoLeft' || icon === 'icoRight') && color === C_GO;
  $('#nowIcon').setAttribute('opacity', signal && (now % 700) > 460 ? .3 : 1);
  const urgent = icon && (color === C_DANGER || word === '지금');
  const halo = $('#nowHalo'); halo.classList.toggle('on', !!urgent); halo.setAttribute('stroke', color);
  if(!urgent) halo.setAttribute('opacity', '0');

  /* ② 언제 — 옮겨야 할 때만. 막대가 가운데로 줄어들며 색이 연속으로 바뀜. 미니 도로의 마감선과 같은 색 */
  const showTiming = needMove && !warn && !besideQueue;
  const tcol = timeColor(frac);
  $('#cd').style.display = showTiming ? '' : 'none';
  if(showTiming){ const bar = $('#cdBar'); bar.setAttribute('width', (120*frac).toFixed(1)); bar.setAttribute('x', (260 - 60*frac).toFixed(1)); bar.setAttribute('fill', tcol); $('#cdBg').setAttribute('fill', tcol); }
  $('#gate').setAttribute('d', showTiming ? quadZ(tx-1.75, tx+1.75, gateZ+.35, gateZ-.35, proj) : ''); $('#gate').setAttribute('fill', tcol);

  /* ③ 어디로 — 미니 도로 */
  // 도로면 · 가장자리 · 점선 (원근 굵기)
  let surf = bandX(-m.edgeX, m.edgeX, zNear, -232, proj), edges = lineX(-m.edgeX, zNear, -228, .09, proj) + lineX(m.edgeX, zNear, -228, .09, proj), dash = '';
  m.segs.forEach(e => {
    const c = e.curve, hw = e.k*LANE/2, inner = 25/e.L;
    surf += strip(offsetPts(c,0,1,-e.half,proj,40), offsetPts(c,0,1,e.half,proj,40));
    edges += lineC(c, e.outerL?0:inner, 1, -e.half, .09, proj) + lineC(c, e.outerR?0:inner, 1, e.half, .09, proj);
    for(let i=1;i<e.k;i++) for(let s=8; s<e.L-3; s+=9) dash += strip(offsetPts(c,s/e.L,(s+3)/e.L,-hw+i*LANE-.075,proj,2), offsetPts(c,s/e.L,(s+3)/e.L,-hw+i*LANE+.075,proj,2));
  });
  for(let i=1;i<m.lanes;i++) dash += dashX(m.laneX(i) - LANE/2, .075, zNear, proj);
  $('#roadSurf').setAttribute('d', surf); $('#roadEdges').setAttribute('d', edges);
  $('#roadDash').setAttribute('d', dash);
  // 내 차로: 지금 위치 바로 앞부터 지선까지 빛 (차로마다 화살표 표지처럼 '이 차로가 목적지로 간다')
  const fillTarget = st===1 ? .75 : (st===2||st===3) ? 1 : st===4 ? .6 : 0;
  S.fill += (fillTarget - S.fill)*k;
  // 갈림 뒤: 목적지까지의 내 차로(다차로 출구면 그 차로만, 1차로면 출구 전체 폭). 260m 앞까지
  const bc = R.afterCurve, bu = clamp(260/R.afterL), bh = R.leaf.path[0].k === 1 ? 2.3 : 1.75, lf = (warn ? .45 : 1)*S.fill;
  const mainFill = onMain ? bandX(tx-1.75, tx+1.75, zNear, -230, proj) : '', mainRails = onMain ? lineX(tx-1.75, zNear, -230, .07, proj) + lineX(tx+1.75, zNear, -230, .07, proj) : '';
  $('#laneFill').setAttribute('d', mainFill + strip(offsetPts(bc,0,bu,-bh,proj,40), offsetPts(bc,0,bu,bh,proj,40)));
  $('#laneFill').setAttribute('opacity', lf.toFixed(3));
  $('#laneRails').setAttribute('d', mainRails + lineC(bc,0,bu,-bh,.07,proj,40) + lineC(bc,0,bu,bh,.07,proj,40));
  $('#laneRails').setAttribute('opacity', (.85*lf).toFixed(3));
  // 흐르는 빛 띠: 내 차로를 따라 앞으로 (활주로 유도등처럼)
  let pul = '';
  if(onMain && !warn && st <= 3 && S.fill > .3) for(let i=0;i<3;i++){ const z = p.z - 7 - ((now/1000*15 + i*20) % 60); if(z > -226) pul += quadZ(tx-1.55, tx+1.55, z, z-1.1, proj); }
  $('#pulses').setAttribute('d', pul); $('#pulses').setAttribute('fill-opacity', (.5*S.fill).toFixed(3));
  // 옮길 화살표: 내 위치 → 목표 차로. 꼬리는 흐리고 머리는 선명. 막히면 빨간 점선 + 머리에 막대
  const a0 = needMove ? proj(p.x, p.z-7) : null, a1 = needMove ? proj(p.x, p.z-19) : null, a2 = needMove ? proj(tx, p.z-31) : null;
  const ma = $('#moveArrow'), mh = $('#moveHead'), ms = $('#moveStop');
  if(a0 && a1 && a2){
    const ac = warn ? C_DANGER : besideQueue ? (S.q.mergeNear ? C_GO : C_WARN) : color;
    ma.setAttribute('d', `M${fmt(a0)}Q${fmt(a1)} ${fmt(a2)}`);
    const ag = $('#arrowGrad'); ag.setAttribute('x1', a0[0]); ag.setAttribute('y1', a0[1]); ag.setAttribute('x2', a2[0]); ag.setAttribute('y2', a2[1]);
    $('#agA').setAttribute('stop-color', ac); $('#agB').setAttribute('stop-color', ac);
    const still = warn || (besideQueue && !S.q.mergeNear);
    ma.setAttribute('stroke-dasharray', still ? '5 6' : '12 7'); ma.classList.toggle('flow', !still);
    let dx = a2[0]-a1[0], dy = a2[1]-a1[1]; const l = Math.hypot(dx,dy)||1; dx/=l; dy/=l;
    const nx = -dy, ny = dx;
    mh.setAttribute('d', `M${(a2[0]+dx*7).toFixed(1)} ${(a2[1]+dy*7).toFixed(1)}L${(a2[0]-dx*6+nx*8).toFixed(1)} ${(a2[1]-dy*6+ny*8).toFixed(1)}L${(a2[0]-dx*6-nx*8).toFixed(1)} ${(a2[1]-dy*6-ny*8).toFixed(1)}Z`);
    mh.setAttribute('fill', ac);
    const sx = a2[0]-dx*16, sy = a2[1]-dy*16;
    ms.setAttribute('d', warn ? `M${(sx+nx*11).toFixed(1)} ${(sy+ny*11).toFixed(1)}L${(sx-nx*11).toFixed(1)} ${(sy-ny*11).toFixed(1)}` : '');
  } else { ma.setAttribute('d', ''); mh.setAttribute('d', ''); ms.setAttribute('d', ''); ma.classList.remove('flow'); }
  // 정체: 막힌 구간 빗금 + 줄 맨 뒤 '설 칸' + 줄 옆이면 끼어들 틈
  const jb = $('#jamBand');
  if(tail !== null){ const dj = bandX(tx-1.7, tx+1.7, Math.min(tail, zNear), Q_FRONT, proj); jb.setAttribute('d', dj); jb.setAttribute('opacity', dj ? '.45' : '0'); }   // 차량이 함께 그려지므로 옅게
  else jb.setAttribute('opacity','0');
  $('#slot').setAttribute('d', tail !== null && p.z > tail + 14 ? quadZ(tx-1.3, tx+1.3, tail+10, tail+5, proj) : '');
  $('#slot').setAttribute('opacity', (.7 + .3*Math.sin(now/260)).toFixed(2));
  let gapD = '';
  if(besideQueue && S.q.mergeNear){
    const zs = queueCars.filter(c => c.visible).map(c => c.position.z).sort((a,b) => b-a);
    for(let i=0;i<zs.length-1;i++){ if(zs[i]-zs[i+1] > Q_MERGE){ const m = (zs[i]+zs[i+1])/2; if(Math.abs(m - p.z) < 16){ gapD = quadZ(tx-1.45, tx+1.45, m+1.6, m-1.6, proj); break; } } }
  }
  $('#gapMark').setAttribute('d', gapD);
  // 차량: 정체 줄(주황 테) · 뒤에서 와 앞으로 지나간 차(빨강)
  const vs = [];
  if(tail !== null) queueCars.forEach(c => { if(c.visible) vs.push({x:c.position.x, z:c.position.z, q:true}); });
  if(otherCar.visible) vs.push({x:otherCar.position.x, z:otherCar.position.z, q:false});
  vehEls.forEach((r,i) => {
    const v = vs[i], a = v && proj(v.x, v.z+2.25), b = v && proj(v.x, v.z-2.25), c = v && proj(v.x, v.z);
    if(!a || !b || !c){ r.setAttribute('opacity', 0); return; }
    const w = 1.8*PXM*c[2], h = Math.max(2.5, a[1]-b[1]);
    r.setAttribute('x', (c[0]-w/2).toFixed(1)); r.setAttribute('y', b[1].toFixed(1)); r.setAttribute('width', w.toFixed(1)); r.setAttribute('height', h.toFixed(1));
    r.setAttribute('fill', v.q ? '#0b0d10' : C_DANGER); r.setAttribute('fill-opacity', v.q ? .0 : .75);   // 정체 차는 테두리만 → 빗금과 겹쳐도 한 대씩 보임
    r.setAttribute('stroke', v.q ? C_WARN : C_DANGER); r.setAttribute('opacity', 1);
  });

  /* 뒤차가 아직 뒤(화면 밖)일 때: 목표 차로 아래쪽에 빨간 차 + 번지는 빛, 옆 가장자리 빛 */
  const dz = Math.max(S.danger, warn && S.rearActive ? .7 : 0), cb = $('#carBehind');
  $('#edgeL').setAttribute('opacity', sgn < 0 ? S.danger*.8 : 0);
  $('#edgeR').setAttribute('opacity', sgn > 0 ? S.danger*.8 : 0);
  const behind = S.rearActive && !otherCar.visible || (S.rearActive && S.rearGap > 0);
  cb.setAttribute('opacity', (behind && sgn !== 0 && !inLane ? dz*(.75 + .25*Math.sin(now/170)) : 0).toFixed(2));
  cb.setAttribute('transform', `translate(${(HX + sgn*80).toFixed(1)} 222) scale(${(0.8 + dz*.45).toFixed(2)})`);

  /* ④ 속도 */
  $('#spdA').textContent = kmh;
}
