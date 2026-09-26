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

const MAPS = [
  { id:'Y3', no:'①', name:'세 갈래', lanes:3, start:[1],
    exits:[
      {key:'L', label:'왼쪽',   lanes:[0], dest:'서울·과천', pts:bendPts(-1,-3.5)},
      {key:'S', label:'가운데', lanes:[1], dest:'안양·의왕', pts:straightPts(0)},
      {key:'R', label:'오른쪽', lanes:[2], dest:'수원·영통', pts:bendPts(1,3.5)} ]},
  { id:'ICR', no:'②', name:'IC 오른쪽 진출', lanes:3, start:[1],
    exits:[
      {key:'S', label:'본선', lanes:[0,1], dest:'대전·천안', pts:straightPts(-1.75)},
      {key:'R', label:'출구', lanes:[2],   dest:'용인·기흥', pts:bendPts(1,3.5)} ]},
  { id:'ICL', no:'③', name:'왼쪽 진출', lanes:3, start:[1],
    exits:[
      {key:'L', label:'출구', lanes:[0],   dest:'춘천·가평', pts:bendPts(-1,-3.5)},
      {key:'S', label:'본선', lanes:[1,2], dest:'강릉·원주', pts:straightPts(1.75)} ]},
  { id:'JC4', no:'④', name:'JC 4차로', lanes:4, start:[1,2],
    exits:[
      {key:'L', label:'왼쪽',   lanes:[0,1], dest:'인천·부천',   pts:[[-3.5,-230],[-5,-262],[-11,-305],[-25,-352],[-45,-400],[-72,-450],[-102,-500],[-135,-550]]},
      {key:'R', label:'오른쪽', lanes:[2,3], dest:'의정부·구리', pts:[[3.5,-230],[5,-262],[11,-305],[25,-352],[45,-400],[72,-450],[102,-500],[135,-550]]} ]},
  { id:'SEQ', no:'⑤', name:'연속 분기', lanes:3, start:[1],
    exits:[
      {key:'S', label:'본선', lanes:[0,1], dest:'광주·전주', quiz:false, pts:straightPts(-1.75)},
      {key:'R', label:'출구', lanes:[2], pts:[[3.5,-230],[5.5,-262],[11,-300],[19,-340],[27,-380],[33,-410]],
        node:{ exits:[
          {key:'L', label:'출구→왼쪽',   lanes:[0], dest:'청주·세종', pts:[[33,-410],[35,-445],[36,-485],[36,-535],[36,-595]]},
          {key:'R', label:'출구→오른쪽', lanes:[0], dest:'공주·논산', pts:[[33,-410],[38,-440],[50,-475],[70,-515],[95,-555],[125,-595]]} ]}} ]}
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
