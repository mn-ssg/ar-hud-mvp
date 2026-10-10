/* ============================================================
   hud.js — 유리 위 HUD 상자(SVG) 그리기
   · 현대 HUD(대조군): 사용자가 준 현대 HUD 사진을 그대로 재현 — 근거는 01_프로젝트/13_현대HUD_재현.md
   · 우리 HUD v1.4: 정보 위계대로 ① 들어갈 차로·경로(미니 도로, 가장 크고 진하게) ② 갈 방향(화살표만) ③ 언제(막대·마감선) ④ 속도(작고 흐리게)
     행동 단계 글자는 없다 — 상태는 미니 도로의 옮길 화살표와 막대만으로. 설계 근거는 01_프로젝트/10_HUD_GUI_설계.md
   · 맵 5종(maps.js): 분기 그림·차로 안내 칸·미니 도로를 맵 데이터로 그린다. C = 다음 갈림 정보(main.js navCtx)
   config.js, maps.js, scene.js 다음에 로드. 상태 S·path는 main.js에서 정의(호출 시점엔 존재).
   ============================================================ */

/* ---------- 현대 HUD (대조군) — 사용자가 준 현대 HUD 사진(website/현대 HUD.tiff)을 그대로 옮김 ----------
   사진의 HUD 부분(원본 685×437에서 x 209~459 · y 137~276)을 이 상자(520×270)에 0.47배로 옮긴 좌표. 근거 01_프로젝트/13_현대HUD_재현.md
   위: 회전 화살표(파랑) · 차로 화살표(권장 차로 파랑, 점선 구분) · 거리 | 목적지 / 왼쪽: 제한속도
   가운데: 원근 도로(내 차로 흰 선 · 바닥선 · 파란 차간 거리선) + 주변 차(회색 블록) + 초록 핸들(차로 유지 보조 켜짐)
   아래: HDA · NAV · 설정 속도 · 큰 차속 / 옆: 빨간 후측방 경고 물결
   시뮬레이터 상태를 따르는 것: 회전 화살표 · 거리 · 목적지 · 차로 화살표 · 주변 차 · 차속 · 후측방 경고. 나머지(HDA · 설정 속도 · 초록 핸들 · 차간 거리선)는 사진대로 고정 */
const HY = {blue:'#2aa7e6', grey:'#8b8f94', white:'#f3f4f5', green:'#3bd43c', red:'#ff2a2a', car:'#a6a9ad', carTop:'#d3d6da'};
const NV = {cx:289.5, base:207, hz:76.3, w0:289, K:12, side:.67};   // 원근 도로: 가운데 x · 내 차 바닥선 y · 소실선 y · 바닥선에서 내 차로 폭 · 원근 거리(m) · 옆 차로 간격(사진 비율)
const NAV_BLUE = HY.blue;
// 전체 크기: 사진 비율 그대로 상자를 꽉 채우면 수평선~대시보드 사이를 다 덮고 원근 차선이 실제 차선만큼 커서 겹쳐 보임
// → 가운데(260, 140) 기준 80%로 줄여 위아래에 여백(실제처럼 도로 위에 떠 보이게). 사용자 피드백 '너무 크고 비율이 안 맞음' (D53)
const NV_SCALE = .8, NV_ANCHOR = [260, 140];
// 두 점 사이를 아래는 굵고 위는 가는 띠로 (원근 차선)
function taperLine(ax, ay, bx, by, wa, wb){
  let dx = bx-ax, dy = by-ay; const l = Math.hypot(dx, dy); dx /= l; dy /= l; const nx = -dy, ny = dx;
  const P = [[ax+nx*wa, ay+ny*wa], [bx+nx*wb, by+ny*wb], [bx-nx*wb, by-ny*wb], [ax-nx*wa, ay-ny*wa]];
  return 'M' + P.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L') + 'Z';
}
// 납작한 호(타원 rx × ry), 각도 a0 → a1 시계 방향 (0° = 오른쪽, 90° = 아래)
const arcE = (cx, cy, rx, ry, a0, a1) => { const p = a => [cx + rx*Math.cos(a*Math.PI/180), cy + ry*Math.sin(a*Math.PI/180)]; const [x0,y0] = p(a0), [x1,y1] = p(a1); return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${rx} ${ry.toFixed(1)} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
const arcPath = (cx, cy, r, a0, a1) => { const p = a => [cx + r*Math.cos(a*Math.PI/180), cy + r*Math.sin(a*Math.PI/180)]; const [x0,y0] = p(a0), [x1,y1] = p(a1); return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
function navMarkup(){
  // 후측방 경고 물결: 사진처럼 오른쪽 차선 위 한 점(445, 219)에서 바깥 · 뒤(오른쪽 아래)로 퍼지는 납작한 호 3겹 — 뒤에서 오는 차 쪽을 가리킴.
  // (v3 ~ v3.1은 차로 안쪽에서 앞 · 위로 퍼져 앞쪽 경고처럼 보였음)
  const waves = [[22, 5, 1], [37, 4.2, .7], [52, 3.4, .42]].map(([r, w, o]) => `<path d="${arcE(445, 219, r, r*.72, -40, 75)}" fill="none" stroke="${HY.red}" stroke-width="${w}" stroke-opacity="${o}" stroke-linecap="round"/>`).join('');
  return `<g id="nvAll" transform="translate(${NV_ANCHOR[0]} ${NV_ANCHOR[1]}) scale(${NV_SCALE}) translate(${-NV_ANCHOR[0]} ${-NV_ANCHOR[1]})">
    <defs>
      <linearGradient id="nvLineL" gradientUnits="userSpaceOnUse" x1="97" y1="248" x2="262" y2="102"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".3" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity=".7"/></linearGradient>
      <linearGradient id="nvLineR" gradientUnits="userSpaceOnUse" x1="483" y1="253" x2="318" y2="102"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".3" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity=".7"/></linearGradient>
      <linearGradient id="nvLfaFade" gradientUnits="userSpaceOnUse" x1="0" y1="170" x2="0" y2="222"><stop offset="0" stop-color="${HY.green}"/><stop offset=".6" stop-color="${HY.green}"/><stop offset="1" stop-color="${HY.green}" stop-opacity=".25"/></linearGradient>
    </defs>
    <!-- 회전 화살표 · 거리 | 목적지 -->
    <g id="nvTbt">
      <g id="nvTurn" fill="${HY.blue}"><path d="M7.5 45.5 V20 Q7.5 9.3 18.5 9.3 H32" fill="none" stroke="${HY.blue}" stroke-width="10.3"/><path d="M31 -1.2 L53 9.3 L31 19.8 Z"/></g>
      <g id="nvStraight" fill="${HY.blue}" transform="translate(104 22)"><path d="M26 45.5 V15" fill="none" stroke="${HY.blue}" stroke-width="10.3"/><path d="M14 18 L26 -1 L38 18 Z"/></g>
      <text id="nvDist" x="266" y="70.7" text-anchor="end" fill="${HY.white}"><tspan id="nvDistN" font-size="24.4" font-weight="400">0</tspan><tspan id="nvUnit" font-size="16" dx="2" font-weight="400">m</tspan></text>
      <line id="nvSep" x1="277.4" y1="46.3" x2="277.4" y2="74.5" stroke="${HY.grey}" stroke-width="1.6" stroke-dasharray="2.4 2.4"/>
      <text id="nvName" x="288.7" y="69.8" font-size="20.7" font-weight="500" fill="${HY.white}"></text>
    </g>
    <g id="nvLanes"></g>
    <!-- 제한속도 -->
    <g id="nvLimit"><circle cx="49.4" cy="121.5" r="21.6" fill="#fff" stroke="#e5262b" stroke-width="5.6"/><text x="49.4" y="128.2" text-anchor="middle" font-size="18.5" font-weight="700" fill="#111">80</text></g>
    <!-- 원근 도로 · 주변 차 · 차로 유지 보조 -->
    <g id="nvRoad">
      <g filter="url(#glow)">
        <path d="${taperLine(97.4, 248.4, 144.4, 207, 2.4, 3.2)}" fill="url(#nvLineL)"/>
        <path d="${taperLine(144.4, 207, 261.9, 101.8, 3.2, 1.3)}" fill="url(#nvLineL)"/>
        <path d="${taperLine(482.8, 253, 433.4, 207, 2.4, 3.2)}" fill="url(#nvLineR)"/>
        <path d="${taperLine(433.4, 207, 318.3, 101.8, 3.2, 1.3)}" fill="url(#nvLineR)"/>
      </g>
      <line x1="144.4" y1="207" x2="433.4" y2="207" stroke="#c9d6dc" stroke-opacity=".35" stroke-width="1.1"/>
      <line x1="222" y1="145" x2="356" y2="145" stroke="${HY.blue}" stroke-width="3" stroke-linecap="round"/>
      <g id="nvCars"></g>
      <g id="nvLfa" transform="translate(288.7 194.4)" fill="url(#nvLfaFade)">
        <path d="M0 -24 A24 24 0 1 1 -0.01 -24 Z M0 -16.8 A16.8 16.8 0 1 0 0.01 -16.8 Z" fill-rule="evenodd"/>
        <path d="M-18.5 -2 Q0 -10 18.5 -2 L18.5 6 Q9 2.5 6.5 7 L5 20 H-5 L-6.5 7 Q-9 2.5 -18.5 6 Z"/>
      </g>
    </g>
    <!-- HDA · NAV · 설정 속도 · 차속 -->
    <g id="nvAdas">
      <text x="152" y="243.7" font-size="14" font-weight="600" fill="${HY.green}" letter-spacing=".3">HDA</text>
      <rect x="152.1" y="250.6" width="39" height="12" rx="1.5" fill="${HY.green}"/>
      <text x="171.6" y="260.4" text-anchor="middle" font-size="11" font-weight="800" fill="#0b0d10">NAV</text>
      <path d="${arcPath(213.9, 247, 13.5, 200, 340)}" fill="none" stroke="${HY.green}" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M192.5 225.5 L199.5 232.5 M199.8 227.5 V232.8 H194.5" fill="none" stroke="${HY.green}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="213.9" y="263.4" text-anchor="middle" font-size="14" fill="${HY.white}" class="tnum">80</text>
    </g>
    <text id="nvSpd" class="tnum" x="337" y="260" text-anchor="end" font-size="56" font-weight="300" fill="${HY.white}">0</text>
    <text x="345.5" y="261.6" font-size="17" fill="${HY.white}">km/h</text>
    <!-- 후측방 경고: 옮기려는 쪽 -->
    <g id="nvBcwR" opacity="0" filter="url(#glow)">${waves}</g>
    <g id="nvBcwL" opacity="0" filter="url(#glow)" transform="translate(${2*NV.cx} 0) scale(-1 1)">${waves}</g></g>`;
}
$('#navHud').innerHTML = navMarkup();

// 차로 화살표: 본선 차로마다 그 차로가 가는 방향(곧장 ↑ · 오른쪽 ↱ · 왼쪽 ↰), 권장 차로(목적지 출구의 차로)는 파랑, 사이는 점선
let nvLaneEls = [];
function buildNavLanes(m){
  const wrap = $('#nvLanes'); wrap.innerHTML = '';
  const gap = 41.2, x0 = 333.6 - (m.lanes-1)/2*gap, mk = n => document.createElementNS(SVGNS, n);
  nvLaneEls = Array.from({length:m.lanes}, (_, i) => {
    const key = m.exits.find(e => e.lanes.includes(i)).key, g = mk('g'), stem = mk('path'), head = mk('path');
    g.setAttribute('transform', `translate(${(x0 + i*gap).toFixed(1)} 6.3)${key === 'L' ? ' scale(-1 1)' : ''}`);
    if(key === 'S'){ stem.setAttribute('d', 'M0 27 V7'); head.setAttribute('d', 'M-6.2 9.5 L0 0 L6.2 9.5 Z'); }
    else { stem.setAttribute('d', 'M-3.5 27 V13 Q-3.5 8 1.5 8 H7'); head.setAttribute('d', 'M6.5 2 L14 8 L6.5 14 Z'); }
    stem.setAttribute('fill', 'none'); stem.setAttribute('stroke-width', 4.4);
    g.append(stem, head); wrap.appendChild(g);
    if(i > 0){ const sep = mk('line'); const sx = x0 + (i-.5)*gap; Object.entries({x1:sx, x2:sx, y1:6.3, y2:33.1, stroke:HY.grey, 'stroke-width':1.5, 'stroke-dasharray':'2 2.6'}).forEach(([k,v]) => sep.setAttribute(k, v)); wrap.appendChild(sep); }
    return {stem, head};
  });
}
// 주변 차: 회색 블록(앞면 + 밝은 윗면). 멀수록 작고 위로
const nvCarEls = Array.from({length:8}, () => {
  const g = document.createElementNS(SVGNS, 'g'), top = document.createElementNS(SVGNS, 'path'), front = document.createElementNS(SVGNS, 'rect');
  top.setAttribute('fill', HY.carTop); front.setAttribute('fill', HY.car); g.append(top, front); $('#nvCars').appendChild(g); return {g, top, front};
});
function drawNav(p, f, C, kmh, remainKm, dangerOn){
  const R = S.route, dist = Math.max(0, Math.round(C.d)), before = C.st <= 3 && dist > 0;
  // 회전 화살표 · 거리 | 목적지
  const key = C.node.key, turn = before && key !== 'S';
  $('#nvTurn').style.display = turn ? '' : 'none';
  $('#nvStraight').style.display = turn ? 'none' : '';
  $('#nvTurn').setAttribute('transform', key === 'L' ? 'translate(156 22) scale(-1 1)' : 'translate(104 22)');
  $('#nvDistN').textContent = before ? dist : remainKm;
  $('#nvUnit').textContent = before ? 'm' : 'km';
  $('#nvName').textContent = before ? R.leaf.dest : '';
  $('#nvSep').style.display = before ? '' : 'none';
  // 차로 안내: 첫 갈림 전 본선에서만 (램프 위 ⑤ 두 번째 갈림엔 없음)
  $('#nvLanes').style.display = before && C.i === 0 ? '' : 'none';
  nvLaneEls.forEach((l, i) => { const c = R.exitLanes.includes(i) ? HY.blue : HY.grey; l.stem.setAttribute('stroke', c); l.head.setAttribute('fill', c); });
  // 주변 차: 시뮬레이터의 정체 줄 차 · 옆 차로 차를 내 차 기준(앞 거리 d, 옆 차로)으로. 주행 테스트는 실제 교통 전부
  // 실제 HUD처럼 차로 칸(왼쪽 · 내 차로 · 오른쪽)에 맞춰 놓는다 — 내 차가 보는 방향 기준으로 두면 핸들을 조금만 틀어도
  // 먼 차가 옆으로 크게 밀려(60m 앞이면 3°에 약 3m) 고정된 차선 그림 밖으로 나감 (D63). 본선은 차로 번호 차, 갈림 뒤는 반올림
  const rx = -f.z, rz = f.x, cars = [], onMain = p.z > FORK_Z, myLane = laneOf(S.map, p.x);
  queueCars.concat(S.drive ? flowCars : [otherCar]).forEach(c => {
    if(!c.visible) return;
    const dx = c.position.x - p.x, dz = c.position.z - p.z, main = onMain && c.position.z > FORK_Z - 20;
    const d = (main ? -dz : dx*f.x + dz*f.z) - 2.3, k = main ? laneOf(S.map, c.position.x) - myLane : Math.round((dx*rx + dz*rz)/LANE);
    if(d < 3 || d > 90 || Math.abs(k) > 1) return;
    cars.push({d, lat:k*LANE});
  });
  // 차로마다 가까운 3대까지 (실제 HUD처럼 가까운 차만), 먼 차부터 그려 가까운 차가 위에
  const perLane = {}, near = cars.sort((a, b) => a.d - b.d).filter(c => { const k = Math.round(c.lat/LANE); perLane[k] = (perLane[k]||0) + 1; return perLane[k] <= 3; }).reverse();
  nvCarEls.forEach((el, i) => {
    const c = near[i]; if(!c){ el.g.style.display = 'none'; return; }
    const s = NV.K/(c.d + NV.K), yb = NV.hz + (NV.base - NV.hz)*s, x = NV.cx + c.lat/LANE*NV.side*NV.w0*s;
    const w = 96*s, h = 30*s, t = 16*s, ins = 7*s;
    el.g.style.display = '';
    el.front.setAttribute('x', (x - w/2).toFixed(1)); el.front.setAttribute('y', (yb - h).toFixed(1)); el.front.setAttribute('width', w.toFixed(1)); el.front.setAttribute('height', h.toFixed(1)); el.front.setAttribute('rx', (5*s).toFixed(1));
    el.top.setAttribute('d', `M${(x-w/2+ins).toFixed(1)} ${(yb-h-t).toFixed(1)}H${(x+w/2-ins).toFixed(1)}L${(x+w/2).toFixed(1)} ${(yb-h+2*s).toFixed(1)}H${(x-w/2).toFixed(1)}Z`);
  });
  $('#nvSpd').textContent = kmh;
  // 후측방 경고: 시연은 옮기려는 쪽에 빨간 물결, 주행 테스트는 실제 BCW처럼 양쪽 각각 (drive.js hudThreat)
  $('#nvBcwL').setAttribute('opacity', (S.drive ? S.bswL : dangerOn && R.side < 0) ? 1 : 0);
  $('#nvBcwR').setAttribute('opacity', (S.drive ? S.bswR : dangerOn && R.side > 0) ? 1 : 0);
}

/* ---------- 우리 HUD: 미니 도로 투영 (v1.4: 글자를 뺀 자리만큼 위·옆으로 키움, y 88~228 · 반폭 126) ---------- */
const HX = 260, HY_NEAR = 228, HY_FAR = 88, HALF = 126, K = 55, PXM = HALF/5.25;   // PXM: 가장 가까운 곳 1m = px
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
// 곡선을 따라 offset a~b 사이 띠. 끝 taper m 동안 폭이 0으로 좁아짐(경로 끝을 뾰족하게, v1.6). L = 곡선 길이
function bandC(c, u0, u1, a, b, taper, L, proj, n=48){
  const A=[], B=[];
  for(let i=0;i<n;i++){
    const u = u0+(u1-u0)*i/(n-1), q = c.getPointAt(u), t = c.getTangentAt(u), f = taper ? clamp((u1-u)*L/taper) : 1;
    let nx=-t.z, nz=t.x; const l=Math.hypot(nx,nz)||1; nx/=l; nz/=l;
    A.push(proj(q.x+nx*a*f, q.z+nz*a*f)); B.push(proj(q.x+nx*b*f, q.z+nz*b*f));
  }
  return strip(A,B);
}
// 경로 끝: 마지막 갈림 뒤 이만큼(m)까지 안내. 그 사이 남은 경로가 짧아지며 청록 → 초록, 끝나면 사라짐 (main.js 시연 종료는 +88m)
const ROUTE_END = 70;
// 점선은 3D 도로와 같은 간격(3m 칠 · 6m 빈칸)
function dashX(x, hw, zNear, proj){ let o=''; for(let z=38; z>-222; z-=9){ if(z > zNear + 3) continue; o += quadZ(x-hw, x+hw, z, z-3, proj); } return o; }

const icons = ['icoRight','icoLeft','icoUp'];
function showIcon(id){ icons.forEach(n => $('#'+n).style.display = n===id ? '' : 'none'); }
const hexRgb = h => [1,3,5].map(i => parseInt(h.slice(i,i+2),16));
const mix = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return '#'+A.map((v,i) => Math.round(v+(B[i]-v)*t).toString(16).padStart(2,'0')).join(''); };
const ease = t => 1 - Math.pow(1 - t, 3);
// 남은 몫에 따라 연속으로 초록 → 주황 → 빨강 (막대 · 마감선)
const timeColor = fr => fr >= .5 ? C_GO : fr >= .2 ? mix(C_WARN, C_GO, (fr-.2)/.3) : mix(C_DANGER, C_WARN, fr/.2);
// 옮길 화살표는 주황에서 멈춘다 — 빨강은 '대기'(빨간 점 + 멈춤 막대)에만 쓴다
const arrowColor = fr => fr >= .5 ? C_GO : fr >= .2 ? mix(C_WARN, C_GO, (fr-.2)/.3) : C_WARN;
// 뒤차로 기다리는 동안의 막대 · 마감선: 시간은 계속 줄지만 초록(해도 됨)과 겹치지 않게 회색으로 흐리게
const C_IDLE = '#b4bec9';

// 미니 도로의 차량 표시: 정체 줄 차(주황) · 뒤에서 와 앞지르는 차(빨강)
const vehEls = Array.from({length:24}, () => { const r = document.createElementNS(SVGNS,'rect'); r.setAttribute('rx', 2.5); r.setAttribute('stroke-width', 1.4); $('#veh').appendChild(r); return r; });

/* ② 갈 방향은 바뀔 때만 0.2초 동안 커지며 나타남 · 차로를 다 옮기면 1.4초 칭찬(들어간 차로가 초록 → 경로색) */
const AS = {icon:null, since:0, doneUntil:0, wasMove:false};
function resetHud(){ AS.icon = null; AS.doneUntil = 0; AS.wasMove = false; }

/* ---------- 우리 HUD v1.4 ---------- */
function drawAr(p, f, C, k, dangerOn, kmh){
  const m = S.map, R = S.route, st = C.st, onMain = C.i === 0;
  const proj = makeProj(p, f), tx = R.tx, sgn = R.side, now = performance.now();
  // 뒤차 판단: 시연은 다가오는 차가 내 옆을 지나갈 때까지, 주행 테스트는 실제 옆 차로 차가 위험할 때 (drive.js hudThreat)
  const block = S.drive ? S.rearBlock : S.rearActive && S.rearGap < 45 && S.rearGap > -8;
  const warn = block || S.danger > .5, inLane = !onMain || Math.abs(p.x - tx) < 1.2;
  const tail = onMain && S.jam > 0 && S.q && S.q.backZ !== null ? S.q.backZ : null;
  const needMove = onMain && !inLane && st <= 3;
  const besideQueue = tail !== null && needMove && p.z <= tail + 2;          // 이미 줄 옆까지 와 버림
  const gateZ = tail !== null ? tail + 10 : CHANGE_END;                      // 여기까지는 옮겨 있어야 함
  const frac = clamp((p.z - gateZ)/(0 - gateZ));
  const zNear = Math.min(p.z - 2, 40);

  /* ② 갈 방향 — 다음 갈림에서 갈 쪽만, 경로색 하나. 행동 단계 글자('이동'·'유지' 등)는 없다:
     상태는 ① 미니 도로의 옮길 화살표와 ③ 막대가 보여 준다. 갈림을 지나면 끔 */
  if(AS.wasMove && !needMove && inLane && st <= 3) AS.doneUntil = now + 1400;
  AS.wasMove = needMove;
  const icon = C.d >= -8 ? {L:'icoLeft', S:'icoUp', R:'icoRight'}[C.node.key] : null;
  if(icon !== AS.icon){ AS.icon = icon; AS.since = now; }
  const act = $('#act'), e = ease(clamp((now - AS.since)/200));
  showIcon(icon);
  act.style.display = icon ? '' : 'none';
  act.setAttribute('transform', `translate(${HX} 32) scale(${(.88 + .12*e).toFixed(3)})`);
  act.setAttribute('opacity', e.toFixed(3));

  /* ③ 다음 행동까지 — 주행 내내 보임 (v1.6, D49). 길이 = 다음 행동 지점까지 남은 거리, 색 = 남은 여유. 가운데로 줄어듦
     · 옮겨야 함: 옮김 마감선(정체면 줄 끝)까지, 초록 → 주황 → 빨강 연속. 뒤차로 기다리면 회색. 줄 옆까지 와 버렸으면 빈 빨간 막대(마감 지남)
     · 이미 맞는 차로: 다음 갈림까지, 초록 그대로(할 일이 없어 여유 충분). 차로를 옮기고 나면 이 길이로 바뀜
     · 갈림을 지나면 다음 갈림까지 다시 차오르고, 마지막 갈림을 지나면 사라짐. 미니 도로의 마감선은 옮겨야 할 때만, 막대와 같은 색 */
  let bar = null, bi = C.i, bd = C.d;
  if(bd <= 0 && bi < path.nodeS.length - 1){ bi++; bd = path.nodeS[bi] - S.s; }   // 갈림을 지나자마자 다음 갈림으로
  if(needMove) bar = besideQueue ? {fr:0, col:C_DANGER, op:1} : {fr:frac, col:warn ? C_IDLE : timeColor(frac), op:warn ? .55 : 1};
  else if(bd > 0) bar = {fr:clamp(bd/(bi === 0 ? path.nodeS[0] - path.sStart : path.nodeS[bi] - path.nodeS[bi-1])), col:C_GO, op:1};
  $('#cd').style.display = bar ? '' : 'none';
  if(bar){
    const b = $('#cdBar'); b.setAttribute('width', (120*bar.fr).toFixed(1)); b.setAttribute('x', (260 - 60*bar.fr).toFixed(1)); b.setAttribute('fill', bar.col); b.setAttribute('fill-opacity', bar.op);
    $('#cdBg').setAttribute('fill', bar.col); $('#cdBg').setAttribute('fill-opacity', bar.fr > .001 ? .16 : (.14 + .14*Math.sin(now/220)).toFixed(3));   // 빈 막대: 바탕만 옅게 깜빡임(마감 지남) — 꽉 찬 막대로 보이지 않게
  }
  const showGate = needMove && !besideQueue;
  $('#gate').setAttribute('d', showGate ? quadZ(tx-1.75, tx+1.75, gateZ+.35, gateZ-.35, proj) : '');
  if(bar){ $('#gate').setAttribute('fill', bar.col); $('#gate').setAttribute('fill-opacity', bar.op); }

  /* ① 들어갈 차로 · 경로 — 미니 도로. HUD에서 가장 크고 진하게 */
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
  // 들어갈 차로: 지금 위치 바로 앞부터 지선까지 빛 (차로마다 화살표 표지처럼 '이 차로가 목적지로 간다')
  const fillTarget = st===1 ? .85 : 1;   // v1.6: 갈림 뒤에도 흐려지지 않음 — 끝은 길이 · 색으로 보여 줌
  S.fill += (fillTarget - S.fill)*k;
  // 갈림 뒤: 목적지까지의 내 차로(다차로 출구면 그 차로만, 1차로면 출구 전체 폭). 안내 끝(마지막 갈림 + ROUTE_END)까지만 칠하고 끝은 뾰족하게
  // → 마지막 갈림을 지나면 남은 경로가 내 앞에서 짧아지다 사라진다 (v1.6, '완료' 글자 대신)
  const lastS = path.nodeS[path.nodeS.length-1], endT = clamp((S.s - lastS)/ROUTE_END);
  const bc = R.afterCurve, bu = clamp((lastS + ROUTE_END - path.nodeS[0])/R.afterL), bh = R.leaf.path[0].k === 1 ? 2.3 : 1.75, lf = (warn ? .45 : 1)*S.fill;
  const mainFill = onMain ? bandX(tx-1.75, tx+1.75, zNear, -230, proj) : '', mainRails = onMain ? lineX(tx-1.75, zNear, -230, .1, proj) + lineX(tx+1.75, zNear, -230, .1, proj) : '';
  $('#laneFill').setAttribute('d', mainFill + bandC(bc, 0, bu, -bh, bh, 18, R.afterL, proj));
  $('#laneFill').setAttribute('opacity', lf.toFixed(3));
  $('#laneRails').setAttribute('d', mainRails + bandC(bc, 0, bu, -bh-.1, -bh+.1, 18, R.afterL, proj) + bandC(bc, 0, bu, bh-.1, bh+.1, 18, R.afterL, proj));
  $('#laneRails').setAttribute('opacity', lf.toFixed(3));
  // 초록으로 바뀌는 두 순간 (글자 없이 색으로): 차로를 다 옮기면 1.4초 칭찬 · 마지막 갈림을 지나면 남은 경로가 짧아지며 청록 → 초록
  const praise = clamp((AS.doneUntil - now)/1400), g = Math.max(praise, ease(endT)), lc = g > 0 ? mix(C_NOW, C_GO, g) : C_NOW;
  ['#lgA','#lgB','#lgC'].forEach(s => $(s).setAttribute('stop-color', lc));
  $('#laneRails').setAttribute('fill', lc); $('#pulses').setAttribute('fill', lc);
  // 흐르는 빛 띠: 내 차로를 따라 앞으로 (활주로 유도등처럼)
  let pul = '';
  if(onMain && !warn && st <= 3 && S.fill > .3) for(let i=0;i<3;i++){ const z = p.z - 7 - ((now/1000*15 + i*20) % 60); if(z > -226) pul += quadZ(tx-1.55, tx+1.55, z, z-1.1, proj); }
  $('#pulses').setAttribute('d', pul); $('#pulses').setAttribute('fill-opacity', (.7*S.fill).toFixed(3));
  // 옮길 화살표: 내 위치 → 들어갈 차로. 글자 대신 이것이 상태를 말한다 —
  // 초록 흐름 = 옮겨도 됨(마감이 다가오면 주황으로) / 주황 점 = 틈 대기 / 빨간 점 + 맥박 치는 멈춤 막대 = 대기
  const a0 = needMove ? proj(p.x, p.z-7) : null, a1 = needMove ? proj(p.x, p.z-19) : null, a2 = needMove ? proj(tx, p.z-31) : null;
  const ma = $('#moveArrow'), mh = $('#moveHead'), ms = $('#moveStop');
  if(a0 && a1 && a2){
    const ac = warn ? C_DANGER : besideQueue ? (S.q.mergeNear ? C_GO : C_WARN) : arrowColor(frac);
    ma.setAttribute('d', `M${fmt(a0)}Q${fmt(a1)} ${fmt(a2)}`);
    const ag = $('#arrowGrad'); ag.setAttribute('x1', a0[0]); ag.setAttribute('y1', a0[1]); ag.setAttribute('x2', a2[0]); ag.setAttribute('y2', a2[1]);
    $('#agA').setAttribute('stop-color', ac); $('#agB').setAttribute('stop-color', ac);
    const still = warn || (besideQueue && !S.q.mergeNear);
    ma.setAttribute('stroke-dasharray', still ? '.1 14' : '12 14'); ma.classList.toggle('flow', !still);   // 굵기 8 · 둥근 끝 → 점 / 긴 대시
    let dx = a2[0]-a1[0], dy = a2[1]-a1[1]; const l = Math.hypot(dx,dy)||1; dx/=l; dy/=l;
    const nx = -dy, ny = dx;
    mh.setAttribute('d', `M${(a2[0]+dx*9).toFixed(1)} ${(a2[1]+dy*9).toFixed(1)}L${(a2[0]-dx*8+nx*10).toFixed(1)} ${(a2[1]-dy*8+ny*10).toFixed(1)}L${(a2[0]-dx*8-nx*10).toFixed(1)} ${(a2[1]-dy*8-ny*10).toFixed(1)}Z`);
    mh.setAttribute('fill', ac); mh.setAttribute('stroke', warn ? '#ffc4bd' : 'none'); mh.setAttribute('stroke-width', 1.4);   // 대기: 빨강 머리에 밝은 테(대비)
    const sx = a2[0]-dx*19, sy = a2[1]-dy*19;
    const stopD = warn ? `M${(sx+nx*13).toFixed(1)} ${(sy+ny*13).toFixed(1)}L${(sx-nx*13).toFixed(1)} ${(sy-ny*13).toFixed(1)}` : '';
    ms.setAttribute('d', stopD); $('#moveStopCore').setAttribute('d', stopD);
    const pulse = warn ? (.82 + .18*Math.sin(now/170)).toFixed(2) : 1;   // 대기: 멈춤 막대만 맥박(바닥 82% → 대비 유지)
    ms.setAttribute('opacity', pulse); $('#moveStopCore').setAttribute('opacity', pulse);
  } else { ma.setAttribute('d', ''); mh.setAttribute('d', ''); ms.setAttribute('d', ''); $('#moveStopCore').setAttribute('d', ''); ma.classList.remove('flow'); }
  // 정체: 막힌 구간 빗금 + 줄 맨 뒤 '설 칸' + 줄 옆이면 끼어들 틈
  const jb = $('#jamBand');
  if(tail !== null){ const dj = bandX(tx-1.7, tx+1.7, Math.min(tail, zNear), Q_FRONT, proj); jb.setAttribute('d', dj); jb.setAttribute('opacity', dj ? '.45' : '0'); }   // 차량이 함께 그려지므로 옅게
  else jb.setAttribute('opacity','0');
  $('#slot').setAttribute('d', tail !== null && p.z > tail + 14 ? quadZ(tx-1.3, tx+1.3, tail+10, tail+5, proj) : '');
  $('#slot').setAttribute('opacity', (.7 + .3*Math.sin(now/260)).toFixed(2));
  let gapD = '';
  if(besideQueue && S.q.mergeNear){
    const zs = queueCars.filter(c => c.visible && Math.abs(c.position.x - tx) < 1).map(c => c.position.z).sort((a,b) => b-a);   // 들어갈 차로의 줄만 (주행 테스트는 두 차로 줄도 있음)
    for(let i=0;i<zs.length-1;i++){ if(zs[i]-zs[i+1] > Q_MERGE){ const m = (zs[i]+zs[i+1])/2; if(Math.abs(m - p.z) < 16){ gapD = quadZ(tx-1.45, tx+1.45, m+1.6, m-1.6, proj); break; } } }
  }
  $('#gapMark').setAttribute('d', gapD);
  // 차량: 정체 줄(주황 테) · 뒤에서 와 앞으로 지나간 차(빨강)
  const vs = [];
  if(tail !== null) queueCars.forEach(c => { if(c.visible) vs.push({x:c.position.x, z:c.position.z, q:true}); });
  const rc = S.drive ? S.threatCar && S.threatCar.mesh : otherCar.visible && otherCar;   // 주행 테스트: 옮길 쪽 차로의 가장 가까운 차
  if(rc) vs.push({x:rc.position.x, z:rc.position.z, q:false});
  vs.sort((a, b) => Math.abs(a.z - p.z) - Math.abs(b.z - p.z));   // 칸(24)이 모자라면 가까운 차부터
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
  const behind = S.drive ? S.rearActive && S.rearGap > -3 : S.rearActive && !otherCar.visible || (S.rearActive && S.rearGap > 0);
  cb.setAttribute('opacity', (behind && sgn !== 0 && !inLane ? dz*(.85 + .15*Math.sin(now/170)) : 0).toFixed(2));   // 맥박 바닥을 높여 늘 대비 3:1 이상
  cb.setAttribute('transform', `translate(${(HX + sgn*LANE*PXM).toFixed(1)} 222) scale(${(0.8 + dz*.45).toFixed(2)})`);   // 옆 차로 한가운데

  /* ④ 속도 */
  $('#spdA').textContent = kmh;
}
