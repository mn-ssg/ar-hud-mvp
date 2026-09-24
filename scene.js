/* ============================================================
   scene.js — 3D 도로 장면 (렌더러 · 하늘 · 지형 · 도로 · 도로시설 · 나무 · 차량 · 고스트카)
   config.js 다음에 로드. 매 프레임 main.js가 renderScene()을 부른다.
   실험에 걸린 것(차로·분기점 위치, 표지판 위치와 문구, 카메라 시야각, 차 길이 ≤4.8m)은 그대로 두고 겉모습만 다룬다.
   그래픽은 전부 코드로 생성 — 외부 3D 모델·이미지 없음(저작권 문제 없음).
   ============================================================ */

const cab = $('#cab');
const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('#view').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.5, 2600);

/* ---------- 공용 도구 ---------- */
const lin = hex => new THREE.Color(hex).convertSRGBToLinear();   // 색은 sRGB로 적고 선형으로 바꿔 쓴다
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
function canvasTex(w, h, draw, repeat){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = MAX_ANISO;
  if(repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const radialTex = (rgb, a) => canvasTex(64, 64, g => {
  const gr = g.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,`rgba(${rgb},${a})`); gr.addColorStop(1,`rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0,0,64,64);
});
// 텍스처를 월드 좌표(xz)로 깐다 → 본도로와 지선이 이음새 없이 같은 무늬
function worldUV(mat, scale){
  mat.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>',
    `#ifdef USE_UV\n  vUv = (modelMatrix * vec4(position, 1.0)).xz * ${scale.toFixed(4)};\n#endif`); };
  return mat;
}
let seed = 7; const rnd = () => { seed = (seed*16807)%2147483647; return (seed-1)/2147483646; };
const hash2 = (x,z) => { const s = Math.sin(x*127.1 + z*311.7)*43758.5453; return s - Math.floor(s); };
function vnoise(x,z){
  const ix = Math.floor(x), iz = Math.floor(z), fx = x-ix, fz = z-iz, ux = fx*fx*(3-2*fx), uz = fz*fz*(3-2*fz);
  const a = hash2(ix,iz), b = hash2(ix+1,iz), c = hash2(ix,iz+1), d = hash2(ix+1,iz+1), ab = a+(b-a)*ux;
  return ab + (c+(d-c)*ux - ab)*uz;
}
function fbm(x,z){ let v = 0, a = .5; for(let i=0;i<4;i++){ v += a*vnoise(x,z); x = x*2.03+17; z = z*2.03+9; a *= .5; } return v; }
function merge(parts){   // [[geometry, matrix]] → 비인덱스 지오메트리 하나
  const pos = [], nor = [], uv = [], hasUV = parts.every(([g]) => g.attributes.uv);
  for(const [g0, m] of parts){
    const g = (g0.index ? g0.toNonIndexed() : g0.clone()).applyMatrix4(m);
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    if(hasUV) uv.push(...g.attributes.uv.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor,3));
  if(uv.length) out.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
  return out;
}
const M4 = () => new THREE.Matrix4();

/* ---------- 하늘 · 빛 ---------- */
// 해는 뒤-왼쪽 위: 앞차 뒷모습이 밝고, 그림자가 앞으로 떨어져 차가 땅에 붙어 보인다
const SUN_DIR = new THREE.Vector3(-0.42, 0.62, 0.66).normalize();
const HORIZON = lin('#d4dee7');
const skyMat = new THREE.ShaderMaterial({
  uniforms:{ top:{value:lin('#3f78cc')}, horizon:{value:HORIZON}, ground:{value:lin('#a3aeb4')}, sunDir:{value:SUN_DIR}, sunCol:{value:lin('#fff0d4')} },
  vertexShader:`varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader:`
    varying vec3 vDir;
    uniform vec3 top, horizon, ground, sunDir, sunCol;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y); }
    float fbm(vec2 p){ float v = 0.0, a = 0.5; for(int i=0; i<5; i++){ v += a*noise(p); p = p*2.03 + 17.1; a *= 0.5; } return v; }
    void main(){
      vec3 d = normalize(vDir);
      float h = d.y;
      vec3 col = mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.5));
      col = mix(col, ground, smoothstep(0.0, -0.1, h));
      float s = max(dot(d, sunDir), 0.0);
      col += sunCol * (pow(s, 900.0)*20.0 + pow(s, 8.0)*0.18);
      if(h > 0.0){                                   // 구름: 하늘 평면에 투영한 노이즈
        vec2 uv = d.xz / (h + 0.08) * 1.6;
        float c = smoothstep(0.5, 0.78, fbm(uv + vec2(3.0, 7.0))) * smoothstep(0.0, 0.18, h);
        vec3 cc = mix(vec3(0.70, 0.74, 0.80), vec3(1.05), smoothstep(0.5, 0.9, fbm(uv*1.7)));
        col = mix(col, cc, c*0.9);
      }
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }`,
  side:THREE.BackSide, depthWrite:false
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 48, 24), skyMat);
sky.renderOrder = -2; sky.frustumCulled = false; scene.add(sky);
scene.fog = new THREE.Fog(HORIZON, 110, 950);

scene.add(new THREE.HemisphereLight(lin('#d6e4f5'), lin('#55643f'), 0.6));
const sun = new THREE.DirectionalLight(lin('#fff1dc'), 2.0);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {left:-45, right:45, top:45, bottom:-45, near:1, far:420});   // 좁혀서 그림자 경계를 매끈하게
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
// 하늘을 반사·간접광으로 (차 도장·유리·가드레일에 하늘이 비친다)
(() => {
  const pm = new THREE.PMREMGenerator(renderer), s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat));
  scene.environment = pm.fromScene(s).texture; pm.dispose();
})();

/* ---------- 도로 곡선 · 도로까지 거리 ---------- */
// 지선은 화면 끝까지 이어지게 마지막 방향으로 600m 늘린 '보이는 용도' 곡선을 따로 둔다 (주행 경로 branchCurves는 그대로)
const branchVis = BRANCH_PTS.map(pts => {
  const n = pts.length, [x1,z1] = pts[n-1], [x0,z0] = pts[n-2], l = Math.hypot(x1-x0, z1-z0);
  const ext = pts.map(a => V(a[0],a[1]));
  for(let k=1;k<=10;k++) ext.push(V(x1 + (x1-x0)/l*60*k, z1 + (z1-z0)/l*60*k));
  return curveOf(ext, 1200);
});
const BUCKET = 70, buckets = new Map();
(() => {
  const put = (x,z) => { const k = Math.floor(x/BUCKET)+','+Math.floor(z/BUCKET); if(!buckets.has(k)) buckets.set(k, []); buckets.get(k).push([x,z]); };
  for(let z=60; z>=-236; z-=4) put(0, z);
  branchVis.forEach(c => { const L = c.getLength(); for(let s=0; s<=L; s+=4){ const p = c.getPointAt(s/L); put(p.x, p.z); } });
})();
function roadDist(x,z){   // 가장 가까운 도로 중심선까지 거리(최대 70m)
  const bx = Math.floor(x/BUCKET), bz = Math.floor(z/BUCKET); let d2 = BUCKET*BUCKET;
  for(let i=-1;i<=1;i++) for(let j=-1;j<=1;j++){
    const arr = buckets.get((bx+i)+','+(bz+j)); if(!arr) continue;
    for(const p of arr){ const dx = p[0]-x, dz = p[1]-z, dd = dx*dx+dz*dz; if(dd < d2) d2 = dd; }
  }
  return Math.sqrt(d2);
}
function terrainH(x,z){   // 도로 옆 16m까지는 평평, 70m까지 완만하게 올라 언덕
  const t = clamp((roadDist(x,z) - 16)/54);
  return -0.35 + t*t*(3-2*t) * (fbm(x*.011, z*.011)*46 - 9);
}

/* ---------- 지형 ---------- */
const grassTex = canvasTex(256, 256, (g,w,h) => {
  g.fillStyle = '#87907a'; g.fillRect(0,0,w,h);
  for(let i=0;i<6000;i++){ const v = 110 + Math.random()*110 | 0; g.fillStyle = `rgba(${v*.78|0},${v},${v*.55|0},.35)`; g.fillRect(Math.random()*w, Math.random()*h, 1.4, 1.5 + Math.random()*3.5); }
}, true);
(() => {
  const tg = new THREE.PlaneGeometry(2200, 2200, 220, 220); tg.rotateX(-Math.PI/2); tg.translate(0, 0, -300);
  const tp = tg.attributes.position, cols = [], c = new THREE.Color();
  const lush = lin('#41552c'), dry = lin('#7a744e'), rock = lin('#67655e');
  for(let i=0;i<tp.count;i++){
    const x = tp.getX(i), z = tp.getZ(i), y = terrainH(x,z); tp.setY(i, y);
    c.copy(lush).lerp(dry, clamp((fbm(x*.03+50, z*.03)-.45)*2.4)*.7).lerp(rock, clamp((y-16)/14)*.5).multiplyScalar(.8 + .35*vnoise(x*.15, z*.15));
    cols.push(c.r, c.g, c.b);
  }
  tg.setAttribute('color', new THREE.Float32BufferAttribute(cols,3)); tg.computeVertexNormals();
  const tex = grassTex.clone(); tex.needsUpdate = true; tex.repeat.set(280, 280);
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({map:tex, vertexColors:true, roughness:.96}));
  terrain.receiveShadow = true; scene.add(terrain);
})();

/* ---------- 도로 ---------- */
function ribbonGeo(n){
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n*6),3));
  const nor = new Float32Array(n*6); for(let i=0;i<n*2;i++) nor[i*3+1] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nor,3));
  const idx = []; for(let i=0;i<n-1;i++){ const a=i*2,b=a+1,c=a+2,d=a+3; idx.push(a,b,c, b,d,c); }
  g.setIndex(idx); return g;
}
// 곡선을 따라 띠: 한쪽 가장자리(offA, 높이 yA) ~ 다른 쪽(offB, yB)
function fillRibbon(g, curve, u0, u1, offA, offB, yA, yB = yA){
  const pos = g.attributes.position.array, n = pos.length/6;
  for(let i=0;i<n;i++){
    const u = clamp(u0+(u1-u0)*i/(n-1)), p = curve.getPointAt(u), tg = curve.getTangentAt(u);
    let nx = -tg.z, nz = tg.x; const l = Math.hypot(nx,nz)||1; nx/=l; nz/=l;
    pos[i*6]=p.x+nx*offA; pos[i*6+1]=yA; pos[i*6+2]=p.z+nz*offA;
    pos[i*6+3]=p.x+nx*offB; pos[i*6+4]=yB; pos[i*6+5]=p.z+nz*offB;
  }
  g.attributes.position.needsUpdate = true; g.computeBoundingSphere(); return g;
}
const asphaltTex = canvasTex(512, 512, (g,w,h) => {
  g.fillStyle = '#2d3034'; g.fillRect(0,0,w,h);
  for(let i=0;i<42000;i++){ const v = 28 + Math.random()*56 | 0; g.fillStyle = `rgba(${v},${v},${v+3},${.2+Math.random()*.3})`; g.fillRect(Math.random()*w, Math.random()*h, 1+Math.random()*.8, 1+Math.random()*.8); }
  for(let i=0;i<7;i++){ g.fillStyle = 'rgba(18,20,23,.10)'; g.beginPath(); g.ellipse(Math.random()*w, Math.random()*h, 30+Math.random()*90, 10+Math.random()*30, Math.random()*3, 0, 6.3); g.fill(); }
}, true);
const asphalt = worldUV(new THREE.MeshStandardMaterial({map:asphaltTex, roughness:.95, envMapIntensity:.35, side:THREE.DoubleSide}), .1);
const verge = worldUV(new THREE.MeshStandardMaterial({map:grassTex, color:lin('#53683a'), roughness:.97, side:THREE.DoubleSide,
  polygonOffset:true, polygonOffsetFactor:2, polygonOffsetUnits:2}), .15);
const paint = new THREE.MeshStandardMaterial({color:lin('#e9e9e3'), roughness:.55, side:THREE.DoubleSide, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2});
const addMesh = (geo, mat, shadow = 'r') => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = shadow.includes('r'); m.castShadow = shadow.includes('c'); scene.add(m); return m; };

const mainRoad = addMesh(new THREE.PlaneGeometry(11.6,275), asphalt);
mainRoad.rotation.x = -Math.PI/2; mainRoad.position.set(0,0,(40-235)/2);
const mainLine = curveOf([V(0,60), V(0,-236)], 50);
for(const s of [-1,1]) addMesh(fillRibbon(ribbonGeo(40), mainLine, 0, 1, s*5.8, s*9.4, -0.01, -0.45), verge);
// 바퀴 자국: 차로마다 두 줄 살짝 어둡게
(() => {
  const mat = new THREE.MeshBasicMaterial({color:0x000000, transparent:true, opacity:.06, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1});
  for(const lx of [-LANE,0,LANE]) for(const o of [-.85,.85]){ const m = addMesh(new THREE.PlaneGeometry(.75, 268), mat); m.rotation.x = -Math.PI/2; m.position.set(lx+o, .002, -94); }
})();
// 차선: 위치는 이전과 같다 (hud.js 미니 도로와 맞물림)
(() => {
  const arr = [];
  const quad = (x0,z0,x1,z1,y) => arr.push(x0,y,z0, x1,y,z0, x0,y,z1, x1,y,z0, x1,y,z1, x0,y,z1);
  for(const x of [-LANE/2, LANE/2]) for(let z=38; z>-222; z-=9) quad(x-.075,z,x+.075,z-3,.01);
  for(const x of [-5.4,5.4]) quad(x-.08,40,x+.08,-228,.01);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr,3)); g.computeVertexNormals();
  addMesh(g, paint);
})();
branchVis.forEach((c,i) => {
  addMesh(fillRibbon(ribbonGeo(300), c, 0, 1, -2.3, 2.3, .003+i*.002), asphalt);
  for(const s of [-1,1]) addMesh(fillRibbon(ribbonGeo(300), c, 0, 1, s*2.3, s*5.6, -0.02, -0.45), verge);
  const inner = .08*branchCurves[i].getLength()/c.getLength();   // 안쪽 차선은 이전처럼 분기 뒤 약 30m부터
  for(const [off,start] of [[-2.25, i===0?0:inner],[2.25, i===2?0:inner]]) addMesh(fillRibbon(ribbonGeo(300), c, start, 1, off-.08, off+.08, .013), paint);
});

/* ---------- 도로 시설 ----------
   가는 물체(가로등·표지판 기둥·가드레일)는 그림자를 드리우지 않는다: 도로 위에 선·띠 그림자가 생기면 부자연스럽고 차선으로 오인될 수 있음 */
const steel = new THREE.MeshStandardMaterial({color:lin('#c3c8ce'), metalness:.8, roughness:.35, side:THREE.DoubleSide});
const galv = new THREE.MeshStandardMaterial({color:lin('#8e949b'), metalness:.6, roughness:.5});
// 가드레일: W자 단면 + 지주 + 반사체
(() => {
  const sh = new THREE.Shape([[0,0],[.07,.05],[.07,.12],[.03,.155],[.07,.19],[.07,.26],[0,.31],[-.006,.31],[.064,.262],[.064,.192],[.024,.155],[.064,.118],[.064,.052],[-.006,0]].map(p => new THREE.Vector2(p[0],p[1])));
  const beam = new THREE.ExtrudeGeometry(sh, {depth:268, bevelEnabled:false});
  const posts = [], refl = [];
  for(const x of [-6.2, 6.2]){
    const m = addMesh(beam, steel); m.position.set(x, .45, -228); if(x > 0) m.scale.x = -1;   // 볼록한 면이 도로 쪽
    for(let z=38; z>-228; z-=4){ posts.push([x + Math.sign(x)*.1, z]); if(((Math.round(z) % 20) + 20) % 20 === 18) refl.push([x - Math.sign(x)*.05, z]); }
  }
  const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(.1,.8,.14), galv, posts.length), d = new THREE.Object3D();
  posts.forEach(([x,z],i) => { d.position.set(x,.4,z); d.updateMatrix(); pm.setMatrixAt(i, d.matrix); });
  pm.receiveShadow = true; scene.add(pm);
  const rm = new THREE.InstancedMesh(new THREE.BoxGeometry(.03,.09,.07), new THREE.MeshStandardMaterial({color:lin('#ffb347'), emissive:lin('#ff9a1f'), emissiveIntensity:.35}), refl.length);
  refl.forEach(([x,z],i) => { d.position.set(x,.83,z); d.updateMatrix(); rm.setMatrixAt(i, d.matrix); });
  scene.add(rm);
})();
// 가로등: 양쪽에 엇갈려
(() => {
  const pole = new THREE.CylinderGeometry(.08,.13,10,10), arm = new THREE.CylinderGeometry(.045,.045,2.4,6), head = new THREE.BoxGeometry(.75,.14,.3);
  const lampMat = new THREE.MeshStandardMaterial({color:lin('#e8eef2'), emissive:lin('#fff6e0'), emissiveIntensity:.15, roughness:.3});
  for(const [x, z0] of [[7.3, 25], [-7.3, 1]]) for(let z=z0; z>-225; z-=48){
    const s = Math.sign(x);
    const p = addMesh(pole, galv); p.position.set(x, 5, z);
    const a = addMesh(arm, galv, ''); a.rotation.z = Math.PI/2; a.position.set(x - s*1.2, 9.95, z);
    const h = addMesh(head, lampMat, ''); h.position.set(x - s*2.35, 9.9, z);
  }
})();
// 분기점 표지판: 문구·위치는 이전과 같고(실험 자극), 해상도와 구조물만 바꿈
(() => {
  const tex = canvasTex(2400, 400, g => {
    g.scale(4/3, 4/3);
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
  });
  const board = addMesh(new THREE.PlaneGeometry(13.8,2.3), new THREE.MeshStandardMaterial({map:tex, roughness:.5}));
  board.position.set(0,7,-150);
  const back = addMesh(new THREE.BoxGeometry(14.0,2.46,.1), galv); back.position.set(0,7,-150.07);
  for(const x of [-7.6,7.6]){
    const p = addMesh(new THREE.CylinderGeometry(.24,.28,8.8,14), galv); p.position.set(x,4.4,-150.4);
    const b = addMesh(new THREE.BoxGeometry(1,.25,1), new THREE.MeshStandardMaterial({color:lin('#9a9a95'), roughness:.9})); b.position.set(x,.12,-150.4);
  }
  // 트러스: 위·아래 현재 + 사선 부재
  for(const y of [6.1, 7.9]){ const c = addMesh(new THREE.CylinderGeometry(.09,.09,15.2,8), galv, ''); c.rotation.z = Math.PI/2; c.position.set(0,y,-150.45); }
  for(let i=0;i<10;i++){
    const x0 = -7.2 + i*1.6, d = addMesh(new THREE.CylinderGeometry(.04,.04,Math.hypot(1.6,1.8),6), galv, '');
    d.position.set(x0+.8, 7, -150.45); d.rotation.z = (i%2 ? 1 : -1)*Math.atan2(1.6,1.8);
  }
})();
// 갈림목 코(gore)마다 노란 충격흡수대
(() => {
  const samples = branchVis.map(c => Array.from({length:500}, (_,i) => c.getPointAt(i/499)));
  const xAt = (i,z) => { let best = samples[i][0]; for(const p of samples[i]) if(Math.abs(p.z-z) < Math.abs(best.z-z)) best = p; return best.x; };
  const stripes = canvasTex(128, 128, g => {
    g.fillStyle = '#f2c230'; g.fillRect(0,0,128,128); g.fillStyle = '#1b1b1b';
    for(let k=-128;k<256;k+=40){ g.beginPath(); g.moveTo(k,128); g.lineTo(k+20,128); g.lineTo(k+84,0); g.lineTo(k+64,0); g.fill(); }
  });
  const yellow = new THREE.MeshStandardMaterial({color:lin('#f2c230'), roughness:.6}), face = new THREE.MeshStandardMaterial({map:stripes, roughness:.6});
  for(const [a,b] of [[0,1],[1,2]]) for(let z=-236; z>-340; z-=1){
    const xa = xAt(a,z), xb = xAt(b,z);
    if(xb - xa < 6.4) continue;
    const m = new THREE.Mesh(new THREE.BoxGeometry(.9,.95,2.4), [yellow,yellow,yellow,yellow,face,yellow]);
    const mx = (xa+xb)/2, dx = (xAt(a,z-6)+xAt(b,z-6))/2 - mx;   // 6m 앞 가운데선 쪽으로 향함
    m.position.set(mx, .47, z - 1.2); m.rotation.y = Math.atan2(-dx, 6);
    m.castShadow = m.receiveShadow = true; scene.add(m); break;
  }
})();

/* ---------- 나무 ---------- */
// 그린 나무 그림을 세 방향으로 교차시킨 판(앞뒤 따로) — 멀리서 보면 입체로 보이고 그림자도 잎 모양으로 진다
(() => {
  const pineTex = canvasTex(256, 512, (g,w,h) => {
    g.fillStyle = '#3b2a1e'; g.fillRect(w/2-6, h*.62, 12, h*.38);
    const top = 10, bot = h*.9;
    for(let i=0;i<3400;i++){
      const t = Math.pow(Math.random(), .75), y = top + t*(bot-top);
      const half = w*.47 * t * (.6 + .4*((t*9) % 1));                  // 층층이 가지
      const x = w/2 + (Math.random()*2-1) * half * Math.sqrt(.4 + Math.random()*.6);
      const k = .55 + .5*(Math.abs(x-w/2)/Math.max(half,1))*Math.random() + .3*(1-t);
      g.fillStyle = `rgb(${28*k|0},${60*k|0},${36*k|0})`;
      g.beginPath(); g.ellipse(x, y, 3+Math.random()*6, 1.6+Math.random()*2.4, (x<w/2?1:-1)*(.25+Math.random()*.35), 0, 6.3); g.fill();
    }
  });
  const leafTex = canvasTex(256, 256, (g,w,h) => {
    g.strokeStyle = '#4a3a2c'; g.lineWidth = 8; g.beginPath(); g.moveTo(w/2,h); g.lineTo(w/2,h*.55); g.stroke();
    g.lineWidth = 3; for(const a of [-.6,.5,-.2]){ g.beginPath(); g.moveTo(w/2,h*.72); g.lineTo(w/2+a*80,h*.42); g.stroke(); }
    for(let c=0;c<14;c++){
      const cx = w/2 + (Math.random()*2-1)*w*.3, cy = h*.2 + Math.random()*h*.4, r = 22 + Math.random()*26;
      for(let i=0;i<260;i++){
        const a = Math.random()*6.3, dd = Math.sqrt(Math.random())*r, x = cx + Math.cos(a)*dd, y = cy + Math.sin(a)*dd*.85;
        const k = .6 + .55*(1 - (y-cy+r)/(2*r)) + Math.random()*.2;
        g.fillStyle = `rgb(${50*k|0},${82*k|0},${38*k|0})`;
        g.beginPath(); g.arc(x, y, 2+Math.random()*3, 0, 6.3); g.fill();
      }
    }
  });
  const cross = (w, h) => {
    const parts = [];
    for(const a of [0, Math.PI/3, 2*Math.PI/3]) for(const back of [0, Math.PI])
      parts.push([new THREE.PlaneGeometry(w, h), M4().makeRotationY(a + back).multiply(M4().makeTranslation(0, h/2, 0))]);
    const g = merge(parts), p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3();
    for(let i=0;i<p.count;i++){ v.set(p.getX(i), (p.getY(i) - h*.55)*.7 + h*.6, p.getZ(i)).normalize(); n.setXYZ(i, v.x, v.y, v.z); }   // 둥글게 음영
    return g;
  };
  const spots = [];
  for(let k=0; k<60000 && spots.length<5200; k++){
    const x = (rnd()-.5)*1000, z = 90 - rnd()*900;
    if(roadDist(x,z) < 13 || Math.hypot(x, z+150) < 12) continue;
    if(fbm(x*.02+3, z*.02) < .33) continue;                             // 숲 덩어리와 빈 들판
    spots.push([x, terrainH(x,z) - .2, z]);
  }
  const d = new THREE.Object3D(), c = new THREE.Color();
  [[pineTex, cross(.56,1), 10, 7], [leafTex, cross(1,1), 7, 4]].forEach(([map, geo, hMin, hVar], ti) => {
    const list = spots.filter((_,i) => (hash2(i, 3) < .7) === (ti === 0));   // 침엽 70% · 활엽 30%
    const mat = new THREE.MeshStandardMaterial({map, alphaTest:.5, roughness:.95});
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    im.customDepthMaterial = new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking, map, alphaTest:.5});
    list.forEach(([x,y,z],i) => {
      const s = hMin + rnd()*hVar; d.position.set(x,y,z); d.rotation.set(0, rnd()*6.3, 0); d.scale.set(s*(.85+rnd()*.3), s, s*(.85+rnd()*.3)); d.updateMatrix();
      im.setMatrixAt(i, d.matrix); im.setColorAt(i, c.setRGB(.8+rnd()*.35, .85+rnd()*.3, .75+rnd()*.3));
    });
    im.castShadow = im.receiveShadow = true; scene.add(im);
  });
})();

/* ---------- 먼 풍경: 겹겹이 산 · 아파트 단지 ---------- */
(() => {
  const C = new THREE.Vector3(0,0,-300);
  [[760,.34,72,'#3e5a45'],[1020,.55,115,'#556f7c'],[1320,.72,175,'#7891a4']].forEach(([R, haze, H, hex], li) => {
    const N = 300, pos = [], col = [], idx = [], topC = lin(hex).lerp(HORIZON, haze);
    for(let i=0;i<=N;i++){
      const a = -2.6 + 5.2*i/N, x = C.x + Math.sin(a)*R, z = C.z - Math.cos(a)*R;
      const h = H*(.3 + .7*fbm(a*3.1 + li*11, li*5.3)) + H*.22*Math.sin(a*2.3 + li);
      pos.push(x,-20,z, x,h*.45,z, x,h,z);
      col.push(HORIZON.r,HORIZON.g,HORIZON.b, topC.r,topC.g,topC.b, topC.r*.92,topC.g*.92,topC.b*.92);
      if(i<N){ const k = i*3; idx.push(k,k+3,k+1, k+1,k+3,k+4, k+1,k+4,k+2, k+2,k+4,k+5); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col,3)); g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({vertexColors:true, fog:false, side:THREE.DoubleSide}));
    m.renderOrder = -1; scene.add(m);
  });
  const facade = canvasTex(128, 256, (g,w,h) => {
    g.fillStyle = '#dcd8cf'; g.fillRect(0,0,w,h);
    for(let y=8;y<h;y+=10) for(let x=6;x<w-4;x+=12){ g.fillStyle = Math.random() < .12 ? '#94a8b8' : `rgba(64,78,92,${.5+Math.random()*.3})`; g.fillRect(x,y,8,6); }
    g.fillStyle = '#b6b0a5'; g.fillRect(0,0,w,5);
  });
  const mat = new THREE.MeshStandardMaterial({map:facade, roughness:.85});
  for(const [cx, cz, n] of [[-330,-760,9],[400,-720,8],[60,-990,7]]) for(let i=0;i<n;i++){
    const w = 34+rnd()*14, h = 55+rnd()*45, x = cx+(rnd()-.5)*220, z = cz+(rnd()-.5)*120;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w,h,13), mat); b.position.set(x, terrainH(x,z) + h/2 - 2, z); b.rotation.y = (rnd()-.5)*.5; scene.add(b);
  }
})();

/* ---------- 차량 ---------- */
// 옆모습 윤곽(s=앞뒤, y=높이)을 옆으로 밀어낸 차체 + 유리 캐빈 + C필러 + 바퀴 + 등화.
// 원점 = 바닥 중심, 앞 = -z, 뒤 = +z. 길이 4.1~4.8m (정체 간격 Q_SPACE 6.8m 안에 들어가게)
const CAR_TYPES = {
  sedan:{L:4.6, W:1.84, r:.33, wf:1.42, wr:-1.38, tail:.84, tz:2.31, pz:2.365,
    body:[[-2.2,.3],[-2.3,.38],[-2.32,.64],[-2.22,.92],[-1.95,.99],[1.02,1.0],[2.08,.86],[2.3,.68],[2.3,.42],[2.2,.3]],
    cabin:[[-1.4,.99],[-.62,1.43],[.32,1.46],[1.02,1.0]]},
  suv:{L:4.7, W:1.9, r:.37, wf:1.45, wr:-1.45, tail:1.02, tz:2.42, pz:2.405,
    body:[[-2.22,.36],[-2.35,.46],[-2.36,1.08],[1.3,1.1],[2.15,.98],[2.35,.8],[2.35,.48],[2.22,.36]],
    cabin:[[-2.3,1.08],[-2.14,1.72],[.6,1.75],[1.3,1.1]]},
  hatch:{L:4.1, W:1.78, r:.31, wf:1.27, wr:-1.25, tail:.9, tz:2.13, pz:2.11,
    body:[[-1.95,.3],[-2.05,.4],[-2.07,.96],[.95,.98],[1.86,.84],[2.05,.66],[2.05,.42],[1.95,.3]],
    cabin:[[-2.0,.96],[-1.78,1.47],[.3,1.5],[.95,.98]]},
  truck:{L:4.8, W:1.76, r:.33, wf:1.55, wr:-1.35, tail:.5, tz:2.44, pz:2.43}
};
function profileGeo(pts, T, depth, bevel, arches){
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]);
  for(let i=1;i<pts.length;i++) sh.lineTo(pts[i][0], pts[i][1]);
  if(arches){ const yb = pts[pts.length-1][1], ar = T.r + .07; for(const s of [T.wf, T.wr]){ sh.lineTo(s+ar, yb); sh.absarc(s, yb, ar, 0, Math.PI, false); } }
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, {depth, curveSegments:10, ...(bevel ? {bevelEnabled:true, bevelThickness:.05, bevelSize:.04, bevelSegments:2} : {bevelEnabled:false})});
  g.rotateY(Math.PI/2); g.translate(-depth/2, 0, 0);   // 윤곽의 s(앞=+) → 월드 -z, 밀어낸 방향 → x
  return g;
}
const carGeoCache = {};
function carGeo(type){
  if(carGeoCache[type]) return carGeoCache[type];
  const T = CAR_TYPES[type], cw = T.W - .34, out = {};
  out.body = profileGeo(T.body, T, T.W - .1, true, true);
  out.cabin = profileGeo(T.cabin, T, cw, true, false);
  // 뒷유리 양옆 C필러 + 윗테 (차체색) — 뒤에서 봤을 때 유리 덩어리가 아니라 창으로 보이게
  const [p0, p1] = T.cabin, ds = p1[0]-p0[0], dy = p1[1]-p0[1], len = Math.hypot(ds,dy), nx = -dy/len, ny = ds/len;
  const off = .065, mid = [(p0[0]+p1[0])/2 + nx*off, (p0[1]+p1[1])/2 + ny*off], rot = Math.atan2(-ds, dy);
  out.pillars = [-1,1].map(sx => { const g = new THREE.BoxGeometry(.2, len, .04); g.rotateX(rot); g.translate(sx*(cw/2 - .05), mid[1], -mid[0]); return g; });
  const hdr = new THREE.BoxGeometry(cw+.1, .08, .04); hdr.rotateX(rot); hdr.translate(0, p1[1] - dy/len*.04 + ny*off, -(p1[0] - ds/len*.04 + nx*off));
  out.pillars.push(hdr);
  return carGeoCache[type] = out;
}
const carMats = (() => {
  const std = (hex, o = {}) => new THREE.MeshStandardMaterial({color:lin(hex), ...o});
  return {
    glass: std('#0b1015', {metalness:.2, roughness:.05}),
    tire: std('#141517', {roughness:.92}),
    rim: std('#c2c6cc', {metalness:.9, roughness:.28}),
    trim: std('#17191c', {roughness:.6}),
    plate: std('#f1f1ec', {roughness:.45}),
    box: std('#d8dbde', {metalness:.35, roughness:.45}),
    tail: std('#4a0606', {emissive:lin('#ff1c1c'), emissiveIntensity:.7, roughness:.25}),
    brake: std('#4a0606', {emissive:lin('#ff1c1c'), emissiveIntensity:3, roughness:.25}),
    shadow: new THREE.MeshBasicMaterial({map:radialTex('0,0,0',.65), transparent:true, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-4})
  };
})();
const paintCache = new Map();
const paintOf = hex => { if(!paintCache.has(hex)) paintCache.set(hex, new THREE.MeshStandardMaterial({color:lin(hex), metalness:.55, roughness:.3})); return paintCache.get(hex); };
const tireGeo = r => { const g = new THREE.CylinderGeometry(r, r, .23, 22); g.rotateZ(Math.PI/2); return g; };
const rimGeo = r => { const g = new THREE.CylinderGeometry(r*.62, r*.62, .236, 16); g.rotateZ(Math.PI/2); return g; };
// 부품을 재질(역할)별로 합쳐 차종마다 한 번만 만든다 → 차 한 대 = 그리기 호출 8번 안팎 (정체 22대여도 가볍게)
const carPartsCache = {};
function carParts(type){
  if(carPartsCache[type]) return carPartsCache[type];
  const T = CAR_TYPES[type], P = {paint:[], glass:[], trim:[], box:[], lamp:[], plate:[], tire:[], rim:[]};
  const at = (x, y, z) => M4().makeTranslation(x, y, z), box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  if(type === 'truck'){   // 1톤 탑차: 캡 + 짐칸 상자
    P.trim.push([box(T.W, .26, T.L-.3), at(0,.5,0)]);
    P.paint.push([box(T.W, 1.4, 1.3), at(0,1.3,-1.72)]);
    P.glass.push([box(T.W-.12, .55, .04), at(0,1.62,-2.38)]);
    for(const sx of [-1,1]) P.glass.push([box(.04, .5, .8), at(sx*(T.W/2+.001),1.62,-1.75)]);
    P.box.push([box(T.W+.04, 1.95, 3.1), at(0,1.6,.85)]);
    for(const x of [-.02, .02]) P.trim.push([box(.02, 1.8, .01), at(x,1.6,2.405)]);
    P.trim.push([box(T.W, .14, .12), at(0,.5,T.L/2-.04)]);
  } else {
    const geo = carGeo(type), I = M4();
    P.paint.push([geo.body, I], ...geo.pillars.map(pg => [pg, I]));
    P.glass.push([geo.cabin, I]);
    P.trim.push([box(T.W-.24, .13, .08), at(0,.38,T.pz-.04)]);
    const [fx, fy] = T.cabin[3];
    for(const sx of [-1,1]) P.paint.push([box(.2, .12, .1), at(sx*(T.W/2+.06), fy+.06, -(fx-.15))]);
  }
  for(const sx of [-1,1]) P.lamp.push([box(.4, .13, .05), at(sx*(T.W/2-.3), T.tail, T.tz)]);
  P.plate.push([box(.52, .12, .02), at(0,.52,T.pz)]);
  for(const s of [T.wf, T.wr]) for(const sx of [-1,1]){ P.tire.push([tireGeo(T.r), at(sx*(T.W/2-.13), T.r, -s)]); P.rim.push([rimGeo(T.r), at(sx*(T.W/2-.13), T.r, -s)]); }
  const out = {};
  for(const k in P) if(P[k].length) out[k] = merge(P[k]);
  out.shadow = new THREE.PlaneGeometry(T.W + .7, T.L + .9).rotateX(-Math.PI/2).translate(0, .02, 0);
  return carPartsCache[type] = out;
}
function makeCar(type, hex, braking){
  const parts = carParts(type), g = new THREE.Group();
  const mats = {paint:paintOf(hex), glass:carMats.glass, trim:carMats.trim, box:carMats.box, lamp:braking ? carMats.brake : carMats.tail,
    plate:carMats.plate, tire:carMats.tire, rim:carMats.rim, shadow:carMats.shadow};
  for(const k in parts){
    const m = new THREE.Mesh(parts[k], mats[k]);
    m.castShadow = !['lamp','plate','rim','shadow'].includes(k); m.receiveShadow = k !== 'shadow';
    g.add(m);
  }
  g.visible = false; scene.add(g); return g;
}
// 옆 차로에서 다가오는 차 (위험 상황 시연용)
const otherCar = makeCar('sedan', '#e8eaec', false);
// 정체 대기열: 목표 차로에 늘어선 차들. 서 있는 차라 브레이크등을 켠다
const QTYPES = ['sedan','suv','hatch','sedan','truck','suv','sedan','hatch','suv','sedan','truck'];
const QCOLORS = ['#f4f5f4','#1c1e22','#a4a9af','#f4f5f4','#f4f5f4','#5b6169','#233b5c','#f4f5f4','#7d2222','#c9ccd0','#f4f5f4','#2e3440','#f4f5f4'];
const queueCars = Array.from({length:22}, (_,i) => makeCar(QTYPES[i%QTYPES.length], QCOLORS[i%QCOLORS.length], true));

// 고스트카: AR-HUD가 도로 위에 띄운 가상 선행 차량(반투명 청록 + 윤곽선). 세단 윤곽을 그대로 쓴다.
// 유리에 맺힌 상이라 실제 물체에 가려지지 않는다 → depthTest 끔. 색은 HUD와 같게(톤매핑 끔). 움직임은 main.js updateGhost()
const ghost = (() => {
  const g = new THREE.Group(), T = CAR_TYPES.sedan, over = {transparent:true, depthTest:false, depthWrite:false, toneMapped:false};
  const fill = new THREE.MeshBasicMaterial({color:lin(C_NOW), opacity:.2, ...over});
  const edge = new THREE.LineBasicMaterial({color:lin('#a8f6ff'), opacity:.95, ...over});
  const shells = [profileGeo(T.body, T, T.W, false, true), profileGeo(T.cabin, T, T.W - .34, false, false)];
  shells.forEach(s => g.add(new THREE.Mesh(s, fill), new THREE.LineSegments(new THREE.EdgesGeometry(s, 20), edge)));
  for(const s of [T.wf, T.wr]) for(const sx of [-1,1]){
    const w = new THREE.LineSegments(new THREE.EdgesGeometry(tireGeo(T.r), 30), edge); w.position.set(sx*(T.W/2 - .13), T.r, -s); g.add(w);
  }
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.4,6.4), new THREE.MeshBasicMaterial({map:radialTex('70,230,255',.5), ...over}));
  glow.rotation.x = -Math.PI/2; glow.position.y = .03; g.add(glow);
  // 뒷면 등화: 방향지시(주황) 좌·우, 미등/브레이크(빨강)
  const lamp = (hex, lx) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(.36,.16,.05), new THREE.MeshBasicMaterial({color:lin(hex), opacity:0, ...over}));
    m.position.set(lx, T.tail, T.tz + .02); g.add(m); return m.material;
  };
  // 방향지시등은 22m 밖에서 몇 픽셀뿐이라 번짐을 붙여 '옮기려는 중'이 멀리서도 보이게
  const amber = radialTex('255,176,32',.9);
  const blinker = lx => {
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.3,1.3), new THREE.MeshBasicMaterial({map:amber, opacity:0, blending:THREE.AdditiveBlending, ...over}));
    halo.position.set(lx, T.tail, T.tz + .06); g.add(halo);
    return [lamp('#ffb020', lx), halo.material];
  };
  g.userData = {blinkL:blinker(-.74), blinkR:blinker(.74), brakeL:lamp('#ff3030',-.36), brakeR:lamp('#ff3030',.36)};
  g.children.forEach(o => o.renderOrder = 10); glow.renderOrder = 9;
  g.visible = false; scene.add(g); return g;
})();

/* ---------- 매 프레임 렌더: 하늘은 카메라를 따라가고, 그림자 범위는 카메라 앞 35m를 중심으로 ---------- */
const _fwd = new THREE.Vector3();
function renderScene(){
  sky.position.copy(camera.position);
  camera.getWorldDirection(_fwd);
  const cx = camera.position.x + _fwd.x*35, cz = camera.position.z + _fwd.z*35;
  sun.target.position.set(cx, 0, cz);
  sun.position.set(cx + SUN_DIR.x*200, SUN_DIR.y*200, cz + SUN_DIR.z*200);
  renderer.render(scene, camera);
}

/* ---------- 캔버스 크기 ---------- */
function resize(){
  const w = cab.clientWidth, h = cab.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w/Math.max(1,h); camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(cab); resize();
