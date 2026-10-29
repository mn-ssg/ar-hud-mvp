/* ============================================================
   hud.js — 유리 위 HUD 상자(SVG) 그리기
   · 현대 HUD(대조군): 사용자가 준 현대 HUD 사진을 그대로 재현 — 근거는 01_프로젝트/13_현대HUD_재현.md
   · 우리 HUD는 ourhud.js (2026-10-29 — 예전 v1.4 ~ v1.9 그리기 코드는 git 기록에)
   · 맵 5종(maps.js): 분기 그림 · 차로 안내 칸을 맵 데이터로 그린다. C = 다음 갈림 정보(main.js navCtx)
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
    <g id="nvLimit"><circle cx="49.4" cy="121.5" r="21.6" fill="#fff" stroke="#e5262b" stroke-width="5.6"/><text id="nvLimitN" x="49.4" y="128.2" text-anchor="middle" font-size="18.5" font-weight="700" fill="#111">80</text></g>
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

// 제한속도 · 고속도로 주행 보조(HDA)는 맵마다: 일반도로 50 · HDA 없음 (D69)
function setLimitSign(m){
  $('#ahLim').textContent = $('#nvLimitN').textContent = m.limit || 80;
  $('#nvAdas').style.display = m.city ? 'none' : '';
}
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
  // v3.3 (2026-10-29): 안내 단계를 거리(예전 d ≤ 25m → 진입)가 아니라 출구 확정으로 넘김(main.js navCtx).
  // 회전 접근 · 정지선 대기 · 회전 중(출구 확정 전)은 회전 화살표 + 거리(0까지) + 목적지를 유지, 확정 뒤에 다음 안내(마지막이면 직진 + km).
  // 다른 출구를 확정하면 '경로 재탐색' — 정상 직진처럼 보이지 않게. 대조군이라 그 밖의 표현은 그대로
  const R = S.route, dist = Math.max(0, Math.round(C.d)), before = C.phase === 'approach' || C.phase === 'turning', off = C.phase === 'off';
  // 회전 화살표 · 거리 | 목적지
  const key = C.node.key, turn = before && key !== 'S';
  $('#nvTurn').style.display = turn ? '' : 'none';
  $('#nvStraight').style.display = turn || off ? 'none' : '';
  $('#nvTurn').setAttribute('transform', key === 'L' ? 'translate(156 22) scale(-1 1)' : 'translate(104 22)');
  $('#nvDistN').textContent = before ? dist : off ? '' : remainKm;
  $('#nvUnit').textContent = before ? 'm' : off ? '' : 'km';
  $('#nvName').textContent = before ? R.leaf.dest : off ? '경로 재탐색' : '';
  $('#nvSep').style.display = before ? '' : 'none';
  // 차로 안내: 첫 갈림 전 본선에서만 (램프 위 ⑤ 두 번째 갈림엔 없음)
  $('#nvLanes').style.display = C.phase === 'approach' && C.i === 0 ? '' : 'none';
  nvLaneEls.forEach((l, i) => { const c = R.exitLanes.includes(i) ? HY.blue : HY.grey; l.stem.setAttribute('stroke', c); l.head.setAttribute('fill', c); });
  // 주변 차: 시뮬레이터의 정체 줄 차 · 옆 차로 차를 내 차 기준(앞 거리 d, 옆 차로)으로. 주행 테스트는 실제 교통 전부
  // 실제 HUD처럼 차로 칸(왼쪽 · 내 차로 · 오른쪽)에 맞춰 놓는다 — 내 차가 보는 방향 기준으로 두면 핸들을 조금만 틀어도
  // 먼 차가 옆으로 크게 밀려(60m 앞이면 3°에 약 3m) 고정된 차선 그림 밖으로 나감 (D63). 본선은 차로 번호 차, 갈림 뒤는 반올림
  const rx = -f.z, rz = f.x, cars = [], onMain = p.z > FORK_Z, myLane = laneOf(S.map, p.x);
  queueCars.concat(S.drive ? flowCars : [otherCar], [busMesh]).forEach(c => {
    if(!c.visible || c.userData.onc) return;   // 마주 오는 차(일반도로)는 그리지 않음
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

/* ---------- 공용 ---------- */
// 경로 끝: 마지막 갈림 뒤 이만큼(m)까지 안내 (우리 HUD ourhud.js · main.js 시연 종료는 +88m)
const ROUTE_END = 70;
const ease = t => 1 - Math.pow(1 - t, 3);
