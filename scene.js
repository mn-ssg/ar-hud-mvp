/* ============================================================
   scene.js — 3D 도로 장면 (renderer · scene · camera · 도로 · 차량 메시)
   config.js 다음에 로드.
   ============================================================ */

const cab = $('#cab');
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
$('#view').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x6f7a8c, 70, 560);
scene.background = (() => {
  const c = document.createElement('canvas'); c.width = 4; c.height = 512;
  const g = c.getContext('2d'); const gr = g.createLinearGradient(0,0,0,512);
  gr.addColorStop(0,'#4d5a70'); gr.addColorStop(.35,'#8a93a0'); gr.addColorStop(.5,'#b9bcbe');
  gr.addColorStop(.58,'#6f7a8c'); gr.addColorStop(.7,'#2a3038'); gr.addColorStop(1,'#141816');
  g.fillStyle = gr; g.fillRect(0,0,4,512);
  return new THREE.CanvasTexture(c);
})();
const camera = new THREE.PerspectiveCamera(58, 1, 0.5, 1500);
scene.add(new THREE.HemisphereLight(0xc9d3e0, 0x1f2420, 1.0));
const sun = new THREE.DirectionalLight(0xfff0e0, 0.35); sun.position.set(-60,60,-120); scene.add(sun);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000,3000), new THREE.MeshLambertMaterial({color:0x222b25}));
ground.rotation.x = -Math.PI/2; ground.position.y = -0.3; scene.add(ground);

function ribbonGeo(n){
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n*6),3));
  const idx = []; for(let i=0;i<n-1;i++){ const a=i*2,b=a+1,c=a+2,d=a+3; idx.push(a,b,c, b,d,c); }
  g.setIndex(idx); return g;
}
function fillRibbon(g, curve, u0, u1, width, offset, y){
  const pos = g.attributes.position.array, n = pos.length/6;
  for(let i=0;i<n;i++){
    const u = clamp(u0+(u1-u0)*i/(n-1));
    const p = curve.getPointAt(u), tg = curve.getTangentAt(u);
    let nx = -tg.z, nz = tg.x; const l = Math.hypot(nx,nz)||1; nx/=l; nz/=l;
    const a = offset-width/2, b = offset+width/2;
    pos[i*6]=p.x+nx*a; pos[i*6+1]=y; pos[i*6+2]=p.z+nz*a;
    pos[i*6+3]=p.x+nx*b; pos[i*6+4]=y; pos[i*6+5]=p.z+nz*b;
  }
  g.attributes.position.needsUpdate = true; g.computeBoundingSphere();
}
const asphalt = new THREE.MeshLambertMaterial({color:0x3a3e44, side:THREE.DoubleSide});
const paint = new THREE.MeshBasicMaterial({color:0xd6dade, side:THREE.DoubleSide});
const mainRoad = new THREE.Mesh(new THREE.PlaneGeometry(11.6,275), asphalt);
mainRoad.rotation.x = -Math.PI/2; mainRoad.position.set(0,0,(40-235)/2); scene.add(mainRoad);
(() => {
  const arr = [];
  const quad = (x0,z0,x1,z1,y) => arr.push(x0,y,z0, x1,y,z0, x0,y,z1, x1,y,z0, x1,y,z1, x0,y,z1);
  for(const x of [-LANE/2, LANE/2]) for(let z=38; z>-222; z-=9) quad(x-.075,z,x+.075,z-3,.01);
  for(const x of [-5.4,5.4]) quad(x-.08,40,x+.08,-228,.01);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr,3));
  scene.add(new THREE.Mesh(g, paint));
})();
branchCurves.forEach((c,i) => {
  const g = ribbonGeo(90); fillRibbon(g,c,0,1,4.6,0,.003+i*.002); scene.add(new THREE.Mesh(g,asphalt));
  for(const [off,start] of [[-2.25, i===0?0:.08],[2.25, i===2?0:.08]]){ const e = ribbonGeo(90); fillRibbon(e,c,start,1,.16,off,.013); scene.add(new THREE.Mesh(e,paint)); }
});
(() => {
  const mat = new THREE.MeshLambertMaterial({color:0x9aa0a6});
  for(const x of [-6.2,6.2]){ const r = new THREE.Mesh(new THREE.BoxGeometry(.12,.35,268), mat); r.position.set(x,.75,-94); scene.add(r); }
  const post = new THREE.BoxGeometry(.12,.8,.12);
  for(let z=38; z>-228; z-=4) for(const x of [-6.2,6.2]){ const p = new THREE.Mesh(post, mat); p.position.set(x,.4,z); scene.add(p); }
})();
(() => {
  const c = document.createElement('canvas'); c.width = 1800; c.height = 300;
  const g = c.getContext('2d');
  g.fillStyle = '#dfe4e1'; g.fillRect(0,0,1800,300);
  DEST.forEach((d,i) => {
    const x = i*600;
    g.fillStyle = '#0d6b3c'; g.fillRect(x+12,12,576,276);
    g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(x+28,28,544,244);
    g.fillStyle = '#fff'; g.font = `700 92px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(d.name, x+300, 118);
    g.save(); g.translate(x+300,222);
    g.beginPath(); g.moveTo(0,38); g.lineTo(24,6); g.lineTo(9,6); g.lineTo(9,-34); g.lineTo(-9,-34); g.lineTo(-9,6); g.lineTo(-24,6); g.closePath(); g.fill();
    g.restore();
  });
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 8;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(13.8,2.3), new THREE.MeshBasicMaterial({map:tex}));
  board.position.set(0,7,-150); scene.add(board);
  const steel = new THREE.MeshLambertMaterial({color:0x6b7078});
  for(const x of [-7.4,7.4]){ const p = new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,8.4,8), steel); p.position.set(x,4.2,-150.3); scene.add(p); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(15.2,.35,.35), steel); beam.position.set(0,8.3,-150.3); scene.add(beam);
})();
(() => {
  let seed = 7; const rnd = () => { seed = (seed*16807)%2147483647; return (seed-1)/2147483646; };
  const keep = [];
  for(let z=40; z>-236; z-=4) keep.push([0,z,7.5]);
  branchCurves.forEach(c => { for(let u=0; u<=1; u+=.015){ const p = c.getPointAt(u); keep.push([p.x,p.z,3.4]); } });
  keep.push([0,-150,9]);
  const spots = [];
  for(let k=0; k<2200 && spots.length<520; k++){
    const x = (rnd()-.5)*320, z = 30 - rnd()*600;
    if(keep.every(([kx,kz,r]) => (x-kx)**2+(z-kz)**2 > (r+4)**2)) spots.push([x,z,.9+rnd()*.9]);
  }
  const cone = new THREE.InstancedMesh(new THREE.ConeGeometry(1.8,5.5,7), new THREE.MeshLambertMaterial({color:0x2a3d2f}), spots.length);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.18,.22,1.4,5), new THREE.MeshLambertMaterial({color:0x3a2c22}), spots.length);
  const d = new THREE.Object3D();
  spots.forEach(([x,z,s],i) => {
    d.position.set(x,.7*s,z); d.scale.set(s,s,s); d.updateMatrix(); trunk.setMatrixAt(i,d.matrix);
    d.position.set(x,(1.4+2.75)*s,z); d.updateMatrix(); cone.setMatrixAt(i,d.matrix);
  });
  scene.add(cone, trunk);
  const bmat = new THREE.MeshLambertMaterial({color:0x4a5160});
  for(let i=0;i<46;i++){
    const w = 12+rnd()*30, h = 12+rnd()*60;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w,h,14), bmat);
    b.position.set(-420+i*19+rnd()*8, h/2, -640-rnd()*80); scene.add(b);
  }
})();

// 차량 메시 팩토리 (뒤차 · 정체 대기열 공용)
function makeCar(bodyColor){
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.85,.7,4.5), new THREE.MeshLambertMaterial({color:bodyColor})); body.position.y = .55; g.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.6,.55,2.3), new THREE.MeshLambertMaterial({color:0x2b3138})); top.position.set(0,1.15,.2); g.add(top);
  const tl = new THREE.MeshBasicMaterial({color:0xff3030});
  for(const x of [-.7,.7]){ const t = new THREE.Mesh(new THREE.BoxGeometry(.35,.15,.05), tl); t.position.set(x,.7,2.26); g.add(t); }
  g.visible = false; scene.add(g); return g;
}
// 옆 차로에서 다가오는 차 (위험 상황 시연용)
const otherCar = makeCar(0xd4d7db);
// 정체 대기열: 목표 차로에 늘어선 차들 (색을 섞어 실제 정체처럼)
const QCOLORS = [0xcfd3d8,0x8a929c,0xb84a4a,0x4a6ea8,0xd8c56a,0x6a8f6a,0x9a9aa2,0xc98a4a];
const queueCars = Array.from({length:22}, (_,i) => makeCar(QCOLORS[i%QCOLORS.length]));

/* ---------- 캔버스 크기 ---------- */
function resize(){
  const w = cab.clientWidth, h = cab.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w/Math.max(1,h); camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(cab); resize();
