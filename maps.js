/* ============================================================
   maps.js — 맵 5종 데이터 + 경로 계산 (설계: 01_프로젝트/11_시뮬레이터_맵_설계.md)
   config.js 다음, scene.js 전에 로드.
   · 모든 맵: 진입로는 곧게, 첫 갈림은 z = FORK_Z(-230) — 질문 시점·정체 길이가 맵끼리 같도록
   · 한 맵 = 본선(차로 N개) + 갈림 나무. 출구 key: 'L' 왼쪽 · 'S' 곧장 · 'R' 오른쪽
   · 목적지(leaf) = 나무의 잎. ⑤는 출구 램프 끝에서 다시 갈린다(node)
   ============================================================ */

const KEY_IDX = {L:0, S:1, R:2}, KEY_ARROW = ['←','↑','→'], KEY_WORD = ['왼쪽','직진','오른쪽'];
const straightPts = x => [[x,-230],[x,-290],[x,-350],[x,-410],[x,-470],[x,-530],[x,-590]];
const bendPts = (s, x0) => [[x0,-230],[x0+s*1.7,-262],[x0+s*8.5,-305],[x0+s*24.5,-352],[x0+s*46.5,-400],[x0+s*74.5,-450],[x0+s*104.5,-500],[x0+s*136.5,-550]];

/* ---------- 일반도로 교차로 (D69, 설계 11_시뮬레이터_맵_설계.md 2-4절) ----------
   내 쪽 정지선 z = FORK_Z(-230) → 횡단보도(-232 ~ -236) → 가로 도로(2+2차로, 가까운 보도 선 -238 ~ 먼 보도 선 -252, 가운데선 -245).
   가로 도로 동쪽(+x)으로 가는 차로는 가까운 쪽(-239.75 · -243.25), 서쪽(-x)으로 가는 차로는 먼 쪽(-246.75 · -250.25).
   D71: 4+4차로였을 때 ④ 좌회전 뒤 HUD는 2차로인데 실제 도로는 4차로라 3 · 4차로로 가면 판정이 어긋남(사용자) → 2+2차로로
   좌 · 우회전은 '90도로 꺾는 출구'로 그린다 → 고속도로 맵과 같은 갈림 · 경로 · 판정 코드를 그대로 씀 */
const CZ = {near:-238, far:-252, mid:-245};
// 원호 점: 중심 (cx, cz), 반지름 R, 각도 a0 → a1(도, x축 기준)
const arcPts = (cx, cz, R, a0, a1, n = 12) => Array.from({length:n+1}, (_, i) => { const a = (a0 + (a1 - a0)*i/n)*Math.PI/180; return [cx + R*Math.cos(a), cz + R*Math.sin(a)]; });
// 정지선 (x, FORK_Z)에서 출발해 반지름 R로 side(-1 왼쪽 · +1 오른쪽)로 꺾어 가로 도로 z = zEnd를 따라 len m
function turnPts(x, side, zEnd, R, len){
  const zA = zEnd + R, arc = side < 0 ? arcPts(x - R, zA, R, 0, -90) : arcPts(x + R, zA, R, 180, 270);
  const pts = [[x, FORK_Z]];
  if(zA < FORK_Z - .5) pts.push([x, zA]);
  pts.push(...arc.slice(1));
  const x1 = x + side*R;
  for(let d = 30; d < len; d += 30) pts.push([x1 + side*d, zEnd]);
  pts.push([x1 + side*len, zEnd]);
  return pts;
}
const cityStraight = x => [[x,-230],[x,-290],[x,-350],[x,-410],[x,-470],[x,-530],[x,-590]];

// 고속도로 3개 (D68 — 5개에서 줄임: 가장 흔한 진출 · 차로 묶음이 갈리는 JC · 연속 판단. 근거 11_시뮬레이터_맵_설계.md 2-0절)
// 번호는 D68에서 다시 매김(예전 ② → ①, ④ → ②, ⑤ → ③). 기록은 id로 남아 섞이지 않음
const MAPS = [
  { id:'ICR', no:'①', name:'IC 오른쪽 진출', lanes:3, start:[1],
    exits:[
      {key:'S', label:'본선', lanes:[0,1], dest:'대전·천안', pts:straightPts(-1.75)},
      {key:'R', label:'출구', lanes:[2],   dest:'용인·기흥', pts:bendPts(1,3.5)} ]},
  { id:'JC4', no:'②', name:'JC 4차로', lanes:4, start:[1,2],
    exits:[
      {key:'L', label:'왼쪽',   lanes:[0,1], dest:'인천·부천',   pts:[[-3.5,-230],[-5,-262],[-11,-305],[-25,-352],[-45,-400],[-72,-450],[-102,-500],[-135,-550]]},
      {key:'R', label:'오른쪽', lanes:[2,3], dest:'의정부·구리', pts:[[3.5,-230],[5,-262],[11,-305],[25,-352],[45,-400],[72,-450],[102,-500],[135,-550]]} ]},
  { id:'SEQ', no:'③', name:'연속 분기', lanes:3, start:[1],
    exits:[
      {key:'S', label:'본선', lanes:[0,1], dest:'광주·전주', quiz:false, pts:straightPts(-1.75)},
      {key:'R', label:'출구', lanes:[2], pts:[[3.5,-230],[5.5,-262],[11,-300],[19,-340],[27,-380],[33,-410]],
        node:{ exits:[
          {key:'L', label:'출구→왼쪽',   lanes:[0], dest:'청주·세종', pts:[[33,-410],[35,-445],[36,-485],[36,-535],[36,-595]]},
          {key:'R', label:'출구→오른쪽', lanes:[0], dest:'공주·논산', pts:[[33,-410],[38,-440],[50,-475],[70,-515],[95,-555],[125,-595]]} ]}} ]},
  // ④ 이중 좌회전 (D69): 1 · 2차로가 모두 좌회전인데, 꺾고 50m 뒤 오른쪽 골목(전통시장)으로 가려면 바깥쪽 2차로로 꺾어야 함.
  // 좌회전 화살표 신호를 기다리는 줄이 1 · 2차로에 있음. 정지선 35m 앞부터 백색실선(차로 변경 금지). 골목은 꺾은 뒤 50m
  { id:'CL2', no:'④', name:'이중 좌회전', city:true, lanes:4, start:[2,3], cruise:13.9, limit:50, sig:'left',
    changeEnd:-195, laneChange:[-95,-160], queue:{back:-198, lanes:[0,1]},
    exits:[
      {key:'L', label:'좌회전', lanes:[0,1], pts:turnPts(-3.5, -1, -248.5, 12.5, 50),
        node:{ exits:[
          {key:'S', label:'좌회전→직진', lanes:[0], dest:'시청·광장', quiz:false, pts:[[-66,-246.75],[-110,-246.75],[-170,-246.75],[-240,-246.75],[-310,-246.75]]},
          {key:'R', label:'좌회전→골목', lanes:[0], dest:'전통시장', pts:[[-66,-250.25], ...arcPts(-66, -258.25, 8, 90, 180).slice(1), [-74,-300],[-74,-360],[-74,-420],[-74,-480]]} ]}},
      {key:'S', label:'직진', lanes:[2], dest:'역·터미널', quiz:false, pts:cityStraight(1.75)},
      {key:'R', label:'우회전', lanes:[3], dest:'대학로', quiz:false, pts:turnPts(5.25, 1, -239.75, 9, 300)} ]},
  // ⑤ 우회전 + 횡단보도 (D69): 맨 오른쪽 차로에 버스가 서 있고(정류장), 꺾자마자 횡단보도에 보행자 — 건너거나 건너려 하면 일시정지
  { id:'CRT', no:'⑤', name:'우회전 · 횡단보도', city:true, lanes:3, start:[1], cruise:13.9, limit:50, sig:'green',
    changeEnd:-195, laneChange:[-152,-186], bus:{lane:2, z:-140}, cw:{x0:16, x1:20},
    exits:[
      {key:'L', label:'좌회전', lanes:[0], dest:'구청', quiz:false, pts:turnPts(-3.5, -1, -246.75, 10.75, 300)},
      {key:'S', label:'직진', lanes:[1], dest:'시청', quiz:false, pts:cityStraight(0)},
      {key:'R', label:'우회전', lanes:[2], dest:'종합병원', pts:turnPts(3.5, 1, -239.75, 9, 300)} ]}
];

/* ---------- 맵 준비: 폭 · 곡선 · 구간(seg) · 목적지(leaf) ---------- */
function prepareMap(m){
  const N = m.lanes;
  m.laneX = i => (i - (N-1)/2)*LANE;
  m.edgeX = N*LANE/2 + .15;          // 가장자리 실선 (3차로 5.4)
  m.half = N*LANE/2 + .55;           // 포장면 반폭 (3차로 5.8)
  m.segs = []; m.leaves = [];
  let layer = 0;
  const walk = (node, depth, trail) => {
    node.exits.forEach((e, j) => {
      e.k = e.lanes.length;
      e.half = e.k*LANE/2 + .55;      // 1차로 2.3
      e.curve = curveOf(e.pts.map(a => V(a[0], a[1])), 400);
      e.L = e.curve.getLength();
      e.depth = depth; e.layer = layer++;
      e.outerL = j === 0; e.outerR = j === node.exits.length - 1;   // 갈림 바깥쪽 가장자리(처음부터 실선)
      e.keys = node.exits.map(x => x.key);
      m.segs.push(e);
      const path = trail.concat([e]);
      if(e.node){ e.node.pt = e.pts[e.pts.length-1]; walk(e.node, depth+1, path); }
      else m.leaves.push({dest:e.dest, label:e.label, quiz:e.quiz !== false, path});
    });
  };
  walk(m, 0, []);
  // 먼 곳까지 이어 보이도록 잎 구간은 마지막 방향으로 600m 늘린 '보이는 용도' 곡선을 따로
  m.segs.forEach(e => {
    const ext = e.pts.map(a => V(a[0], a[1]));
    if(!e.node){
      const n = e.pts.length, [x1,z1] = e.pts[n-1], [x0,z0] = e.pts[n-2], l = Math.hypot(x1-x0, z1-z0);
      for(let k=1;k<=10;k++) ext.push(V(x1 + (x1-x0)/l*60*k, z1 + (z1-z0)/l*60*k));
    }
    e.vis = curveOf(ext, 1200);
  });
  return m;
}
// D68에서 뺀 고속도로 맵 — 장면은 짓지 않고, 예전 기록의 맵 이름만 읽음. 되살리려면 MAPS로 옮기면 됨
const MAPS_OFF = [
  { id:'Y3', no:'(뺌)', name:'세 갈래', lanes:3, start:[1],
    exits:[
      {key:'L', label:'왼쪽',   lanes:[0], dest:'서울·과천', pts:bendPts(-1,-3.5)},
      {key:'S', label:'가운데', lanes:[1], dest:'안양·의왕', pts:straightPts(0)},
      {key:'R', label:'오른쪽', lanes:[2], dest:'수원·영통', pts:bendPts(1,3.5)} ]},
  { id:'ICL', no:'(뺌)', name:'왼쪽 진출', lanes:3, start:[1],
    exits:[
      {key:'L', label:'출구', lanes:[0],   dest:'춘천·가평', pts:bendPts(-1,-3.5)},
      {key:'S', label:'본선', lanes:[1,2], dest:'강릉·원주', pts:straightPts(1.75)} ]}
];
MAPS.forEach(prepareMap);
const mapById = id => MAPS.find(m => m.id === id);

/* ---------- 경로(route): 목적지 + 시작 차로 → 옮길 차로 · 방향 · 갈림 목록 ---------- */
function makeRoute(m, leafIdx, startLane){
  const leaf = m.leaves[leafIdx], e1 = leaf.path[0];
  const tl = e1.lanes.reduce((a, b) => Math.abs(b - startLane) < Math.abs(a - startLane) ? b : a);
  const x0 = m.laneX(startLane), tx = m.laneX(tl);
  const cx = (m.laneX(e1.lanes[0]) + m.laneX(e1.lanes[e1.k-1]))/2;
  // 갈림 뒤: 첫 구간은 내 차로만큼 옆으로 띄운 선(다차로 출구), 다음 구간은 그대로 이어 붙임
  const after = [];
  const off = tx - cx, n = 24;
  for(let i=0;i<n;i++){
    const u = i/(n-1), q = e1.curve.getPointAt(u), t = e1.curve.getTangentAt(u);
    after.push(V(q.x - t.z*off, q.z + t.x*off));
  }
  leaf.path.slice(1).forEach(e => e.pts.slice(1).forEach(a => after.push(V(a[0], a[1]))));
  // 갈림 목록: 경로가 지나는 갈림마다 {pt, keys, key}
  const nodes = [{pt:[cx, FORK_Z], keys:e1.keys, key:e1.key}];
  leaf.path.slice(1).forEach((e, i) => nodes.push({pt:leaf.path[i].node.pt, keys:e.keys, key:e.key}));
  const afterCurve = curveOf(after, 600);
  return {m, leaf, leafIdx, startLane, tl, x0, tx, side:Math.sign(tx - x0), after, afterCurve, afterL:afterCurve.getLength(), nodes,
    lastKey: nodes[nodes.length-1].key, exitLanes:e1.lanes};
}
// 목적지 목록 중 조건에 맞는 것의 번호
const leafIdxs = (m, f) => m.leaves.map((l, i) => i).filter(i => f(m.leaves[i], i));
