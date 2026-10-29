/* ============================================================
   hud.js — 유리 위 HUD 상자(SVG) 그리기
   · 현대 HUD(대조군): 사용자가 준 현대 HUD 사진을 그대로 재현 — 근거는 01_프로젝트/13_현대HUD_재현.md
   · 우리 HUD 1.10: 중간고사 1차 실험 v1.9(커밋 470a8f7) 위에 옆 공간 괄호 · 이동 연결선 · 같은 모양 차 — 이 파일 아래쪽 drawAr()
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
  $('#limA').textContent = $('#nvLimitN').textContent = m.limit || 80;
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

/* ============================================================
   우리 HUD — 중간고사 1차 실험 v1.9(커밋 470a8f7)를 이어서 고침 (2026-10-29, 설계 01_프로젝트/10_HUD_GUI_설계.md 0-9절)
   V1에서 그대로 둔 것: 미니 도로(원근) · 들어갈 차로 청록 면 + 테두리 · 위 갈 방향 화살표 · 다음 행동까지 막대 · 마감선 · 제한속도 표지 ·
                       일반도로 빨간 멈춤 막대(정지선 · 횡단보도) · 보행자 점
   바꾼 것 — '주변 차의 상대 위치 + 내 차 옆 공간의 점유 + 이동 연결선':
     · 내 차 · 다른 차 = 같은 모양의 위에서 본 차(앞 = 위, 앞유리가 앞). 내 차는 밝게, 보통 차는 회색, 위험 차는 빨강
     · 내 차 아래에 '뒤 띠' — 내 차 기준 평면도(옆 ±4m는 1m = 5px, 그 뒤는 압축). 원근 미니 도로와 가까운 면(내 차 앞 4m)에서 이어짐
     · 옆 공간 점유 = 내 차로와 옮길 차로 사이 경계에 선 짧은 괄호(내 차 길이만큼). 위험 차 때문 = 빨강 실선, 정체 줄로 자리 없음 = 흰 실선,
       위험이 풀려 확인 중 = 회색 점선이 0.8초 동안 옅어짐 (색을 빼도 실선 / 점선 · 차 위치로 구분)
     · 이동 연결선 = 내 차 옆에서 바로 옆 차로로 이어지는 짧은 초록 선 + 작은 화살 끝. 판단이 '이동'일 때만, 처음 0.26초 동안 그려지며 나타남(반복 없음)
     · 정체 = 줄 차를 같은 차 모양으로(빗금 · 깜빡이는 칸 · 막대 없음). 들어갈 수 있는 틈만 얇은 초록 모서리 표시
     · 빨강 = 부딪힐 위험(차 · 괄호 · 앞쪽 멈춤 막대)만. 마감 임박은 주황, 정체로 자리 없음은 흰색, 이동은 초록, 경로는 청록
   판단은 guide.js 하나(main.js guideStep → S.G): 대기 · 확인 · 이동, 대기 이유 차, 옮길 바로 옆 차로, 정체 줄 끝. 여기는 그리기만.
   차로 변경 판단 기준은 1차 실험 우리 HUD 기준과 같은 값(뒤 10m · 3.5초) + 옮길 차로 앞차 4m · 2초(위험한 끼어들기 기준) — 10_HUD_GUI_설계 0-9절
   ============================================================ */

/* ---------- 공통 값: 크기 · 선 · 투명도 · 시간 ---------- */
const HK = {
  HX:260, YF:84, YN:186, NEAR:4, K:55, PXM:24, FAR:300, LAT:10.5,   // 원근: 가까운 면 = 내 차 앞 4m(y 186), 1m = 24px(가까운 면)
  EGO_Y:206, RATE:5,                                                 // 내 차 중심 y · 내 차 옆(앞뒤 ±4m) 1m = 5px
  REAR_Y0:226, REAR_H:36, REAR_K:12, REAR_MAX:44, EDGE_Y:262,        // 뒤 띠: 4m 뒤 y 226 → 압축, 44m 넘게 뒤면 아래 가장자리 표시
  car:{w:19, h:28}, ego:{w:21, h:31},                              // 1366 화면에서 차 한 대 ≈ 10 × 14px
  sw:{line:1.4, bracket:4, bracketQ:2.8, intent:5.5, link:4.2, corner:2.4, trail:2, carLine:1.4},
  bracketHalf:18, bracketSerif:5,                                    // 괄호 반 길이(px, 내 차 길이보다 조금 길게) · 끝 갈고리
  op:{car:.2, carLine:.85, edge:.45, dash:.28, rearLine:.22, laneFlat:.2},
  qAhead:2, qBehind:1, qFar:30,                                      // 정체 줄 차: 바로 옆 차로에서 앞 2대(30m 안) · 뒤 1대만 — 틈을 이루는 차
  t:{bracketIn:300, link:260}                                         // ms: 괄호 처음 강조가 가라앉는 시간 · 연결선이 그려지는 시간
};
const AC = {lane:C_NOW, go:C_GO, hazard:C_DANGER, hazLine:'#ffe3df', deadline:C_WARN, full:'#f2f5f8', car:'#aab4bf', ego:'#f4f8fb', idle:'#b4bec9', glass:'#0b0d10', ink:'#eaf6ff'};
const ROUTE_END = 70;   // 경로 끝: 마지막 갈림 뒤 이만큼(m)까지 안내 (main.js 시연 종료는 +88m)
const ease = t => 1 - Math.pow(1 - t, 3);
const f1 = v => v.toFixed(1);

/* ---------- 좌표: 세계(x, z) → 내 차 기준(앞 lon, 오른쪽 lat) → HUD ----------
   원근(lon ≥ NEAR): 다각형을 가까운 면 · 먼 면 · 옆 ±LAT로 잘라서(Sutherland–Hodgman) 그림.
   V1은 가까운 면 = 내 차 줄(d = 0)이고 그 뒤 점을 빼고 남은 점을 한 띠로 이어, 교차로 직전 옆길이 내 차 높이에 가로로 깔렸다
   ('차 밑 90도 도로'). 이제 원근 그림은 가까운 면(y 186) 위에만 — 내 차 · 뒤 띠는 그 아래 평면도 */
const toE = (p, f) => (wx, wz) => { const dx = wx - p.x, dz = wz - p.z; return [dx*f.x + dz*f.z, dx*(-f.z) + dz*f.x]; };
const sOf = lon => HK.K/(lon - HK.NEAR + HK.K);
const prj = (lon, lat) => { const s = sOf(lon); return [HK.HX + lat*HK.PXM*s, HK.YF + (HK.YN - HK.YF)*s]; };
// 평면도(뒤 띠 · 내 차 옆): lon < NEAR
const planY = lon => lon >= -4 ? HK.EGO_Y - lon*HK.RATE : HK.REAR_Y0 + HK.REAR_H*(1 - Math.exp((lon + 4)/HK.REAR_K));
// 어느 lon이든 화면 자리 · 크기 배율 (가까운 면에서 두 방식이 같은 자리 · 같은 크기로 이어짐)
// 뒤 띠는 4m 뒤부터 압축 → 차도 조금씩 작게(바로 뒤 차끼리 겹침을 줄임)
const place = (lon, lat) => lon >= HK.NEAR ? [...prj(lon, lat), sOf(lon)] : [HK.HX + lat*HK.PXM, planY(lon), lon >= -4 ? 1 : .55 + .45*Math.exp((lon + 4)/8)];
const carBox = (lon, lat) => { const [x, y, s] = place(lon, lat), k = Math.max(.38, s); return {x, y, w:HK.car.w*k, h:HK.car.h*k}; };
function clipPoly(poly){
  const planes = [[0, HK.NEAR, 1], [0, HK.FAR, -1], [1, -HK.LAT, 1], [1, HK.LAT, -1]];
  let out = poly;
  for(const [k, v, sg] of planes){
    if(out.length < 3) return [];
    const inp = out; out = [];
    for(let i = 0; i < inp.length; i++){
      const a = inp[i], b = inp[(i + 1) % inp.length], ia = (a[k] - v)*sg >= 0, ib = (b[k] - v)*sg >= 0;
      if(ia) out.push(a);
      if(ia !== ib){ const t = (v - a[k])/(b[k] - a[k]); out.push([a[0] + (b[0] - a[0])*t, a[1] + (b[1] - a[1])*t]); }
    }
  }
  return out;
}
const polyD = poly => { const c = clipPoly(poly); return c.length > 2 ? 'M' + c.map(q => { const r = prj(q[0], q[1]); return f1(r[0]) + ' ' + f1(r[1]); }).join('L') + 'Z' : ''; };
// 점 목록([x, z, tx, tz]) 따라 옆 a ~ b 띠. 구간마다 사각형 하나 → 잘린 조각이 서로 이어지지 않음. taper: 끝 n점 동안 폭을 0으로
function bandAlong(T, pts, a, b, i0 = 0, i1 = pts.length - 1, taper = 0){
  let d = '';
  const side = (q, o) => T(q[0] - q[3]*o, q[1] + q[2]*o), w = i => taper ? clamp((i1 - i)/taper) : 1;
  for(let i = i0; i < i1; i++){
    const q0 = pts[i], q1 = pts[i + 1], A = side(q0, a*w(i)), B = side(q1, a*w(i + 1)), C2 = side(q1, b*w(i + 1)), D2 = side(q0, b*w(i));
    if(Math.max(A[0], B[0], C2[0], D2[0]) < HK.NEAR || Math.min(A[0], B[0], C2[0], D2[0]) > HK.FAR) continue;
    d += polyD([A, B, C2, D2]);
  }
  return d;
}
const zPts = (x, z0, z1, step = 4) => { const o = []; for(let z = z0; z > z1; z -= step) o.push([x, z, 0, -1]); o.push([x, z1, 0, -1]); return o; };
const bandZ = (T, x0, x1, z0, z1) => z0 <= z1 ? '' : bandAlong(T, zPts(x0, z0, z1), 0, x1 - x0);
// 곡선을 2m 간격 점으로 (앞에서부터 len m)
function curvePts(c, L, len = L, step = 2){
  const uMax = clamp(len/L), n = Math.max(2, Math.ceil(len/step)), o = [];
  for(let i = 0; i <= n; i++){ const u = uMax*i/n, q = c.getPointAt(u), t = c.getTangentAt(u), l = Math.hypot(t.x, t.z) || 1; o.push([q.x, q.z, t.x/l, t.z/l]); }
  return o;
}
const quadW = (T, pts) => polyD(pts.map(q => T(q[0], q[1])));

/* ---------- 차 모양 (모두 같은 모양, 위에서 본 차 · 앞 = 위) ---------- */
function carShape(cx, cy, w, h){
  const x0 = cx - w/2, x1 = cx + w/2, y0 = cy - h/2, y1 = cy + h/2, r = w*.34, rb = w*.22;
  const body = `M${f1(x0 + r)} ${f1(y0)}H${f1(x1 - r)}Q${f1(x1)} ${f1(y0)} ${f1(x1)} ${f1(y0 + r)}V${f1(y1 - rb)}Q${f1(x1)} ${f1(y1)} ${f1(x1 - rb)} ${f1(y1)}H${f1(x0 + rb)}Q${f1(x0)} ${f1(y1)} ${f1(x0)} ${f1(y1 - rb)}V${f1(y0 + r)}Q${f1(x0)} ${f1(y0)} ${f1(x0 + r)} ${f1(y0)}Z`;
  const gy0 = y0 + h*.24, gy1 = y0 + h*.4, gx = w*.36, gx2 = w*.42;   // 앞유리(앞쪽, 넓음) · 뒷유리(뒤쪽, 좁음)
  const glass = `M${f1(cx - gx)} ${f1(gy0)}H${f1(cx + gx)}L${f1(cx + gx2)} ${f1(gy1)}H${f1(cx - gx2)}Z` +
    `M${f1(cx - w*.32)} ${f1(y1 - h*.2)}H${f1(cx + w*.32)}L${f1(cx + w*.28)} ${f1(y1 - h*.1)}H${f1(cx - w*.28)}Z`;
  return {body, glass};
}

/* ---------- 요소 만들기 ---------- */
const mkS = (n, parent, attrs = {}) => { const e = document.createElementNS(SVGNS, n); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); parent.appendChild(e); return e; };
const carEls = Array.from({length:16}, () => {
  const g = mkS('g', $('#cars')), trail = mkS('path', g, {fill:'none', 'stroke-width':HK.sw.trail, 'stroke-linecap':'round'}), body = mkS('path', g, {'stroke-linejoin':'round'}), glass = mkS('path', g, {fill:AC.glass, 'fill-opacity':.55});
  return {g, trail, body, glass};
});
const edgeEls = Array.from({length:3}, () => mkS('path', $('#cars'), {fill:'none', 'stroke-width':2.6, 'stroke-linecap':'round', 'stroke-linejoin':'round'}));   // 44m 넘게 뒤 · 화면 밖 차: 아래 가장자리 꺾쇠(차 모양 아님 → 정확한 자리가 아니라는 표시)
(() => { const s = carShape(HK.HX, HK.EGO_Y, HK.ego.w, HK.ego.h); $('#egoBody').setAttribute('d', s.body); $('#egoGlass').setAttribute('d', s.glass); })();

const icons = ['icoRight','icoLeft','icoUp'];
function showIcon(id){ icons.forEach(n => $('#'+n).style.display = n===id ? '' : 'none'); }
const AS = {icon:null, since:0, gate:'none', gateAt:0, route:null};
function resetHud(){ AS.icon = null; AS.gate = 'none'; AS.gateAt = 0; AS.route = null; }

/* ---------- 매 프레임 ---------- */
function drawAr(p, f, C, k){
  const m = S.map, R = S.route, G = S.G, T = toE(p, f), now = performance.now(), st = C.st;
  const onMain = C.i === 0 && (C.phase === 'approach' || C.phase === 'turning') && p.z > FORK_Z - 1;
  const straight = onMain && Math.abs(f.x) < .2;                 // 본선을 곧게 달리는 중: 뒤 띠 · 옆 공간 · 연결선은 이때만 (차로 번호가 뜻이 있음)
  const need = G.need, wait = need && G.gate === 'wait', clearing = need && G.gate === 'clearing', go = need && G.gate === 'go';
  const jam = G.jam, tx = m.laneX(G.tl), zNear = Math.min(p.z, 40);
  if(G.gate !== AS.gate){ AS.gate = G.gate; AS.gateAt = now; }   // UI 전환 시각 (판단 자체는 guide.js — 그림 때문에 늦어지지 않음)

  /* 갈 방향 (V1): 다음 갈림에서 갈 쪽, 출구를 확정할 때까지 */
  const icon = C.phase === 'approach' || C.phase === 'turning' ? {L:'icoLeft', S:'icoUp', R:'icoRight'}[C.node.key] : null;
  if(icon !== AS.icon){ AS.icon = icon; AS.since = now; }
  const act = $('#act'), e = ease(clamp((now - AS.since)/200));
  showIcon(icon); act.style.display = icon ? '' : 'none';
  act.setAttribute('transform', `translate(${HK.HX} 32) scale(${(.88 + .12*e).toFixed(3)})`); act.setAttribute('opacity', e.toFixed(3));

  /* 다음 행동까지 (V1 막대): 옮겨야 하면 마감선(정체면 줄 끝)까지 — 흰색, 마감 직전(25% 미만) 주황. 기다리는 동안 회색. 빨강 · 초록은 쓰지 않음 */
  // 정체: 줄 끝에 닿기 전엔 줄 끝까지, 이미 줄 옆이면 원래 마감선까지 (V1은 줄 옆에서도 줄 끝 기준이라 막대가 0 · 주황으로 떴음)
  const gateZ = jam && need && !jam.beside ? jam.tail + 10 : changeEndOf(m), frac = clamp((p.z - gateZ)/(0 - gateZ));
  let bar = null, bi = C.i, bd = C.d;
  if(bd <= 0 && bi < path.nodeS.length - 1){ bi++; bd = path.nodeS[bi] - S.s; }
  if(need) bar = wait || clearing ? {fr:frac, col:AC.idle, op:.55} : {fr:frac, col:frac < .25 ? AC.deadline : AC.full, op:.9};
  else if(bd > 0 && C.phase !== 'off') bar = {fr:clamp(bd/(bi === 0 ? path.nodeS[0] - path.sStart : path.nodeS[bi] - path.nodeS[bi-1])), col:AC.full, op:.5};
  $('#cd').style.display = bar ? '' : 'none';
  if(bar){ const b = $('#cdBar'); b.setAttribute('width', f1(120*bar.fr)); b.setAttribute('x', f1(260 - 60*bar.fr)); b.setAttribute('fill', bar.col); b.setAttribute('fill-opacity', bar.op); $('#cdBg').setAttribute('fill', bar.col); $('#cdBg').setAttribute('fill-opacity', .16); }
  $('#gate').setAttribute('d', need ? bandZ(T, tx - 1.75, tx + 1.75, gateZ + .3, gateZ - .3) : '');
  if(bar){ $('#gate').setAttribute('fill', bar.col); $('#gate').setAttribute('fill-opacity', bar.op); }

  /* 도로 (V1 그림 · 잘라서): 면 · 가장자리 · 점선 */
  let surf = bandZ(T, -m.edgeX, m.edgeX, zNear, FORK_Z - 2), edges = bandZ(T, -m.edgeX - .09, -m.edgeX + .09, zNear, FORK_Z - 2) + bandZ(T, m.edgeX - .09, m.edgeX + .09, zNear, FORK_Z - 2), dash = '';
  for(let i = 1; i < m.lanes; i++){ const x = m.laneX(i) - LANE/2; for(let z = 38; z > FORK_Z + 6; z -= 9) if(z - 3 < zNear) dash += bandZ(T, x - .075, x + .075, Math.min(z, zNear), z - 3); }
  if(!m._hudSegs) m._hudSegs = m.segs.map(sg => { const L = sg.vis.getLength(); return {sg, pts:curvePts(sg.vis, L, Math.min(L, 260))}; });
  m._hudSegs.forEach(({sg, pts}) => {
    surf += bandAlong(T, pts, -sg.half, sg.half);
    const n = pts.length - 1, in0 = Math.min(13, n);
    edges += bandAlong(T, pts, -sg.half - .09, -sg.half + .09, sg.outerL ? 0 : in0) + bandAlong(T, pts, sg.half - .09, sg.half + .09, sg.outerR ? 0 : in0);
    const hw = sg.k*LANE/2;
    for(let j = 1; j < sg.k; j++) for(let s = 4; s < n - 2; s += 4.5) dash += bandAlong(T, pts, -hw + j*LANE - .075, -hw + j*LANE + .075, Math.floor(s), Math.floor(s) + 1);
  });
  $('#roadSurf').setAttribute('d', surf); $('#roadEdges').setAttribute('d', edges); $('#roadDash').setAttribute('d', dash);

  /* ① 들어갈 차로 · 경로 (V1, 청록): 상태와 상관없이 같은 진하기. 정체면 줄 끝까지만 칠하고 테두리는 끝까지(경로가 줄 차를 지나가 보이지 않게) */
  if(!AS.route || AS.route.R !== R){ const len = path.nodeS[path.nodeS.length - 1] + ROUTE_END - path.nodeS[0]; AS.route = {R, pts:curvePts(R.afterCurve, R.afterL, Math.min(R.afterL, len))}; }
  const rp = AS.route.pts, bh = R.leaf.path[0].k === 1 ? 2.3 : 1.75, off = C.phase === 'off';
  S.fill += ((st === 1 ? .85 : 1) - S.fill)*k;
  let fillTo = FORK_Z;
  if(jam && onMain){
    if(need) fillTo = jam.tail + 3.3;
    else { const ahead = G.cars.filter(c => c.lane === G.my && c.z < p.z - 1).map(c => c.z + c.halfL); if(ahead.length) fillTo = Math.max(...ahead) + .5; }
  }
  let lane = onMain && fillTo < zNear ? bandZ(T, tx - 1.75, tx + 1.75, zNear, fillTo) : '';
  let rails = onMain ? bandZ(T, tx - 1.85, tx - 1.65, zNear, FORK_Z) + bandZ(T, tx + 1.65, tx + 1.85, zNear, FORK_Z) : '';
  if(!off){ lane += bandAlong(T, rp, -bh, bh, 0, rp.length - 1, 9); rails += bandAlong(T, rp, -bh - .1, -bh + .1, 0, rp.length - 1, 9) + bandAlong(T, rp, bh - .1, bh + .1, 0, rp.length - 1, 9); }
  $('#laneFill').setAttribute('d', lane); $('#laneRails').setAttribute('d', rails);
  $('#laneFill').setAttribute('opacity', S.fill.toFixed(3)); $('#laneRails').setAttribute('opacity', S.fill.toFixed(3));

  /* 뒤 띠 (평면도): 내 차 옆 · 뒤 차로선 + 들어갈 차로 테두리가 내 차 옆까지. 이미 들어갈 차로면 테두리가 내 차를 감쌈 */
  let rl = '', rr = '', rf = '';
  if(straight){
    const X = lat => HK.HX + lat*HK.PXM, yb = HK.EDGE_Y, col = (lat, w, y1 = yb) => `M${f1(X(lat) - w)} ${HK.YN}H${f1(X(lat) + w)}V${f1(y1)}H${f1(X(lat) - w)}Z`;
    for(let i = 1; i < m.lanes; i++) rl += col(T(m.laneX(i) - LANE/2, p.z)[1], .7);
    rl += col(T(-m.edgeX, p.z)[1], .9) + col(T(m.edgeX, p.z)[1], .9);
    const lL = T(tx - 1.75, p.z)[1], lR = T(tx + 1.75, p.z)[1], yEnd = planY(-4.6);
    rr = col(lL, 1.2, yEnd) + col(lR, 1.2, yEnd);
    rf = `M${f1(X(lL))} ${HK.YN}H${f1(X(lR))}V${f1(yEnd)}H${f1(X(lL))}Z`;
  }
  $('#rearLines').setAttribute('d', rl); $('#rearRails').setAttribute('d', rr); $('#rearFill').setAttribute('d', rf);
  $('#rearRails').setAttribute('opacity', S.fill.toFixed(3));

  /* ② 차: 판단에 쓴 바로 그 차(S.G.cars)만 — 옮길 바로 옆 차로의 차 · 대기 이유인 차 · 정체 줄(들어갈 차로, 줄 안이면 바로 앞차)
       자리 = 실제 위치(내 차 기준 앞뒤 · 좌우). 대기 이유 차 = 빨강 속 찬 차, 그 밖 = 회색 테두리 차(속 빔) → 색을 빼도 모양으로 구분.
       다가오는(나보다 빠른) 위험 차는 뒤에 짧은 두 줄. 대기 이유 차는 몇 대든 모두 그림(두 번째 위험 차도 빠지지 않음) */
  // 대기 이유 = 해제 기준(1.2배)까지 본 차 — 기준 1배는 벗어났지만 아직 대기인 동안에도 그 차가 빨강으로 남음(괄호만 흰색이 되지 않게)
  const hot = new Set((wait ? G.A.strict : []).filter(b => b.c.kind !== 'queue').map(b => b.c));
  const fading = new Set((clearing ? G.A.strict : []).filter(b => b.c.kind !== 'queue').map(b => b.c));
  let shown = [];
  if(onMain){
    const qLane = jam ? (need ? G.next : G.my) : null;
    G.cars.forEach(c => {
      const [lon, lat] = T(c.x, c.z);
      const rel = (need && c.lane === G.next) || hot.has(c) || (jam && c.kind === 'queue' && c.lane === qLane && (need || (c.z < p.z && lon < 30)));
      if(!rel || lon > 90 || lon < -70) return;
      shown.push({c, lon, lat});
    });
  }
  // 정체 줄: 틈을 이루는 차만 — 바로 옆 차로면 앞 3대(30m 안) · 뒤 1대, 줄 안(합류 뒤)이면 바로 앞차 하나. 위험 차는 그대로
  if(jam){
    const q = shown.filter(v => v.c.kind === 'queue' && !hot.has(v.c)), rest = shown.filter(v => !q.includes(v));
    const ahead = q.filter(v => v.lon > 0 && v.lon < HK.qFar).sort((a, b) => a.lon - b.lon), behind = q.filter(v => v.lon <= 0).sort((a, b) => b.lon - a.lon);
    shown = need ? [...rest, ...ahead.slice(0, HK.qAhead), ...behind.slice(0, HK.qBehind)] : ahead.slice(0, 1);
  }
  // 가까운 차가 위에 그려지게: 먼 차부터
  shown.sort((a, b) => Math.abs(a.lon) - Math.abs(b.lon)); shown = shown.slice(0, carEls.length).reverse();
  let ei = 0;
  edgeEls.forEach(el => el.setAttribute('d', ''));
  carEls.forEach((el, i) => {
    const v = shown[i]; if(!v){ el.g.setAttribute('opacity', 0); return; }
    const isHot = hot.has(v.c), col = isHot ? AC.hazard : AC.car, closing = v.c.v - EGO.v > 1;
    if(v.lon < -HK.REAR_MAX){   // 화면 밖 뒤: 아래 가장자리 꺾쇠(차 모양 아님)
      el.g.setAttribute('opacity', 0);
      if(ei < edgeEls.length){ const x = clamp(HK.HX + v.lat*HK.PXM, 14, 506), y = HK.EDGE_Y + 2; const ed = edgeEls[ei++];
        ed.setAttribute('d', `M${f1(x - 7)} ${f1(y + 4)}L${f1(x)} ${f1(y - 2)}L${f1(x + 7)} ${f1(y + 4)}`); ed.setAttribute('stroke', col); ed.setAttribute('opacity', isHot ? 1 : .6); }
      return;
    }
    const {x, y, w, h} = carBox(v.lon, v.lat), sh = carShape(x, y, w, h);
    el.body.setAttribute('d', sh.body); el.glass.setAttribute('d', sh.glass);
    el.body.setAttribute('fill', col); el.body.setAttribute('fill-opacity', isHot ? 1 : HK.op.car);
    // 위험 차 = 빨강 속 + 밝은 테두리(흑백에서도 노면과 구분), 보통 차 = 회색 테두리만
    el.body.setAttribute('stroke', isHot ? AC.hazLine : col); el.body.setAttribute('stroke-width', HK.sw.carLine); el.body.setAttribute('stroke-opacity', isHot ? 1 : HK.op.carLine);
    el.glass.setAttribute('fill-opacity', isHot ? .55 : 0);
    el.trail.setAttribute('d', isHot && closing && v.lon < HK.NEAR ? `M${f1(x - w*.28)} ${f1(y + h/2 + 2)}V${f1(y + h/2 + 8)}M${f1(x + w*.28)} ${f1(y + h/2 + 2)}V${f1(y + h/2 + 8)}` : '');
    el.trail.setAttribute('stroke', col); el.trail.setAttribute('opacity', .7);
    el.g.setAttribute('opacity', fading.has(v.c) ? .8 : 1);
  });

  /* ③ 옆 공간 점유: 내 차로 · 옮길 차로 경계에 짧은 괄호(내 차 길이만큼, 끝 갈고리는 내 차 쪽). 내 차 앞을 가로막지 않음.
       위험 차 = 빨강 굵은 실선 + 밝은 심 · 정체 줄로 자리 없음 = 흰 가는 실선 · 확인 중 = 회색 점선이 옅어짐 (색을 빼도 굵기 · 점선으로 구분)
       처음 생길 때만 0.3초 굵게 → 가라앉음. 깜빡이지 않음 — 대기인데 그쪽으로 넘어가기 시작하면 더 굵게(고정) */
  let br = '', brCol = AC.hazard, brW = HK.sw.bracket, brDash = '', brOp = 0;
  if(straight && (wait || clearing)){
    const sd = G.side, xb = HK.HX + T(m.laneX(G.my) + sd*LANE/2, p.z)[1]*HK.PXM, xs = sd > 0 ? Math.max(xb, HK.HX + 15) : Math.min(xb, HK.HX - 15);
    const y0 = HK.EGO_Y - HK.bracketHalf, y1 = HK.EGO_Y + HK.bracketHalf, sx = xs - sd*HK.bracketSerif;
    br = `M${f1(sx)} ${y0}H${f1(xs)}V${y1}H${f1(sx)}`;
    if(wait){
      const haz = hot.size > 0;                         // 위험 차가 하나라도 있으면 빨강, 정체 줄로만 막혔으면 흰색
      brCol = haz ? AC.hazard : AC.full;
      brW = (G.intent ? HK.sw.intent : haz ? HK.sw.bracket : HK.sw.bracketQ) + 2*(1 - ease(clamp((now - AS.gateAt)/HK.t.bracketIn)));
      brOp = 1;
    } else { brCol = AC.idle; brW = 2.4; brDash = '3 3'; brOp = .9*(1 - clamp((S.cityT - (G.since ?? S.cityT))/GUIDE.hold)); }
  }
  const bEl = $('#bracket');
  bEl.setAttribute('d', br); bEl.setAttribute('stroke', brCol); bEl.setAttribute('stroke-width', f1(brW)); bEl.setAttribute('stroke-dasharray', brDash); bEl.setAttribute('opacity', brOp.toFixed(2));
  const core = $('#bracketCore'); core.setAttribute('d', wait && brCol === AC.hazard ? br : ''); core.setAttribute('opacity', brOp.toFixed(2));

  /* ④ 들어갈 수 있는 틈 (정체): 판단이 '이동'일 때만, 실제 앞뒤 줄 차 사이를 얇은 초록 모서리 네 개로 */
  let slot = null, corners = '';
  if(go && jam && straight){
    const q = G.cars.filter(c => c.kind === 'queue' && c.lane === G.next);
    const front = q.filter(c => c.z < p.z + 2).sort((a, b) => b.z - a.z)[0], back = q.filter(c => c.z >= p.z + 2).sort((a, b) => a.z - b.z)[0];
    const lonF = front ? T(front.x, front.z + front.halfL)[0] - .4 : 8, lonB = back ? T(back.x, back.z - back.halfL)[0] + .4 : -8;
    if(lonF - lonB > 2){
      const lat = T(m.laneX(G.next), p.z)[1], [xl] = place(0, lat - 1.25), [xr] = place(0, lat + 1.25);
      // 모서리는 그려진 줄 차 모양의 가장자리에 맞춤 — 뒤 띠는 거리를 압축하므로 실제 범퍼 자리로 그리면 뒤 줄 차 그림과 겹쳐 보임
      const bx = c => { const [lon, la] = T(c.x, c.z), b = carBox(lon, la); return b; };
      const yF = front ? (b => b.y + b.h/2 + 2)(bx(front)) : place(lonF, lat)[1], yB = back ? (b => b.y - b.h/2 - 2)(bx(back)) : place(lonB, lat)[1], c = 6;
      slot = {lonF, lonB, yF, yB};
      corners = `M${f1(xl)} ${f1(yF + c)}V${f1(yF)}H${f1(xl + c)}M${f1(xr - c)} ${f1(yF)}H${f1(xr)}V${f1(yF + c)}M${f1(xr)} ${f1(yB - c)}V${f1(yB)}H${f1(xr - c)}M${f1(xl + c)} ${f1(yB)}H${f1(xl)}V${f1(yB - c)}`;
    }
  }
  $('#gapCorners').setAttribute('d', corners);

  /* ⑤ 이동 연결선: 판단이 '이동'일 때만, 내 차 옆 → 바로 옆 차로(틈이 있으면 틈 가운데). 처음 0.26초 동안 그려지며 나타남, 반복 없음 */
  let link = '', head = '';
  if(go && straight){
    const sd = G.side, lat = T(m.laneX(G.next), p.z)[1];
    let end = slot ? place(clamp((slot.lonF + slot.lonB)/2, -3, 10), lat) : place(HK.NEAR + 7, lat);
    if(slot) end = [end[0], clamp(end[1], slot.yF + 4, Math.max(slot.yF + 4, slot.yB - 4))];   // 화살 끝은 틈 모서리 안
    const sx = HK.HX + sd*(HK.ego.w/2 + 3), sy = HK.EGO_Y - HK.ego.h*.25, cx = (sx + end[0])/2, cy = Math.min(sy, end[1]) - 6;
    link = `M${f1(sx)} ${f1(sy)}Q${f1(cx)} ${f1(cy)} ${f1(end[0])} ${f1(end[1])}`;
    let dx = end[0] - cx, dy = end[1] - cy; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const hs = 7, hw = 5.5, bx = end[0] - dx*hs, by = end[1] - dy*hs;
    head = `M${f1(end[0] + dx*2)} ${f1(end[1] + dy*2)}L${f1(bx - dy*hw)} ${f1(by + dx*hw)}L${f1(bx + dy*hw)} ${f1(by - dx*hw)}Z`;
  }
  const lk = $('#link'), lh = $('#linkHead'), drawIn = ease(clamp((now - AS.gateAt)/HK.t.link));
  const lc = $('#linkCore');
  lk.setAttribute('d', link); lh.setAttribute('d', head); lc.setAttribute('d', link);
  if(link){ const L = lk.getTotalLength(), da = f1(L), off = f1(L*(1 - drawIn)); [lk, lc].forEach(e => { e.setAttribute('stroke-dasharray', da); e.setAttribute('stroke-dashoffset', off); }); lh.setAttribute('opacity', drawIn > .85 ? 1 : 0); }

  /* ⑥ 일반도로 멈춤 (V1): 빨간불 정지선 · 보행자 앞 횡단보도 = 지금 차로를 가로지르는 빨간 막대(옆 괄호와 모양이 다름). 보행자 = 흰 점 */
  let cs = '', pd = '';
  if(m.city){
    const t = S.cityT, e1 = R.leaf.path[0];
    if(onMain && p.z > FORK_Z - 1 && sigOf(e1.key, t) === 'red') cs += bandZ(T, m.laneX(e1.lanes[0]) - 1.75, m.laneX(e1.lanes[e1.k-1]) + 1.75, FORK_Z + .6, FORK_Z - .6);
    if(m.cw){
      if(pedBlock(t) && p.x < m.cw.x0) cs += quadW(T, [[m.cw.x0 - 1.5, CZ.near], [m.cw.x0 - .4, CZ.near], [m.cw.x0 - .4, CZ.mid], [m.cw.x0 - 1.5, CZ.mid]]);
      pedsAt(t).forEach(q => { if(q.phase === 'done') return; const [lon, lat] = T(q.x, q.z); if(lon < HK.NEAR || Math.abs(lat) > HK.LAT) return;
        const c = prj(lon, lat), r = Math.max(1.8, 4.5*sOf(lon));
        pd += `M${f1(c[0] - r)} ${f1(c[1])}a${f1(r)} ${f1(r)} 0 1 0 ${f1(2*r)} 0a${f1(r)} ${f1(r)} 0 1 0 ${f1(-2*r)} 0Z`; });
    }
  }
  $('#cityStop').setAttribute('d', cs); $('#pedDots').setAttribute('d', pd);
}
