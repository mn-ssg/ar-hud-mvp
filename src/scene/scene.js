/* ============================================================
   scene.js — 3D 도로 장면 (렌더러 · 하늘 · 지형 · 도로 · 도로시설 · 나무 · 차량)
   config.js · maps.js 다음에 로드. 매 프레임 main.js가 renderScene()을 부른다. 맵별 장면은 buildMapScene() / showMap().
   실험에 걸린 것(차로·분기점 위치, 표지판 위치와 문구, 카메라 시야각, 차 길이 ≤4.8m)은 그대로 두고 겉모습만 다룬다.
   그래픽은 전부 코드로 생성 — 외부 3D 모델·이미지 없음(저작권 문제 없음).
   ============================================================ */

const cab = $('#cab');
const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
/* 그리기 비용 (2026-11-04 최적화): 화면 화소 배율을 최대 1.5로(예전 2 — 레티나에서 화소 수 44% 줄, 3D만 살짝 부드러워지고 HUD(SVG) · 글은 그대로).
   그래도 느리면(90프레임 중 절반이 25ms 넘음) 1.25 → 1로 한 단계씩 내리고 룸미러는 두 프레임에 한 번 갱신. 올리지는 않음(오락가락하지 않게). 캡처용 고정: ?dpr=2 */
const PERF = {tiers:[1.5, 1.25, 1], tier:0, n:0, slow:0, fixed:+(location.search.match(/[?&]dpr=([\d.]+)/) || [])[1] || 0};
const applyDpr = () => renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PERF.fixed || PERF.tiers[PERF.tier]));
applyDpr();
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('#view').appendChild(renderer.domElement);
/* WebGL 컨텍스트 소실 복구 (2026-11-04): 사파리는 탭을 오래 두거나 GPU 메모리가 모자라면 컨텍스트를 거둬 가고, 그러면 3D만 검게 남고 HUD(SVG)만 움직인다.
   three.js가 restored 이벤트에서 스스로 다시 초기화하므로 안내만 띄우고, 4초 안에 안 돌아오면 페이지를 다시 불러온다 (끝난 판 기록은 localStorage에 있어 남음) */
(() => {
  const note = document.createElement('div'); note.id = 'glLost'; note.hidden = true; note.textContent = '화면을 다시 불러오는 중…'; $('#view').appendChild(note);
  let timer = 0;
  renderer.domElement.addEventListener('webglcontextlost', () => { note.hidden = false; clearTimeout(timer); timer = setTimeout(() => location.reload(), 4000); });
  renderer.domElement.addEventListener('webglcontextrestored', () => { clearTimeout(timer); note.hidden = true; });
})();

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
// 파일 텍스처(Higgsfield 생성 재질 등, assets/README.md): 불러오면 apply로 바꿔 끼움. 못 불러오면 코드 텍스처 그대로
const texLoader = new THREE.TextureLoader();
function loadTex(url, apply){
  texLoader.load(url, t => { t.encoding = THREE.sRGBEncoding; t.anisotropy = MAX_ANISO; t.wrapS = t.wrapT = THREE.RepeatWrapping; apply(t); },
    undefined, () => console.warn('텍스처를 못 불러와 코드 텍스처로 둠:', url));
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
// 달은 앞-왼쪽 위: 운전석에서 하늘에 보이고, 앞차 뒷모습은 어둡게(미등·전조등으로 보임)
const MOON_DIR = new THREE.Vector3(-0.45, 0.42, -0.79).normalize();
let lightDir = SUN_DIR;
const HORIZON = lin('#d4dee7');
const skyMat = new THREE.ShaderMaterial({
  uniforms:{ top:{value:lin('#3f78cc')}, horizon:{value:HORIZON}, ground:{value:lin('#a3aeb4')}, sunDir:{value:SUN_DIR}, sunCol:{value:lin('#fff0d4')},
    haloK:{value:.18}, discPow:{value:900}, discK:{value:20}, stars:{value:0}, cloudK:{value:1}, cloudLo:{value:new THREE.Vector3(.70,.74,.80)}, cloudHi:{value:new THREE.Vector3(1.05,1.05,1.05)} },
  vertexShader:`varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader:`
    varying vec3 vDir;
    uniform vec3 top, horizon, ground, sunDir, sunCol, cloudLo, cloudHi;
    uniform float haloK, discPow, discK, stars, cloudK;
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
      col += sunCol * (pow(s, discPow)*discK + pow(s, 8.0)*haloK);   // 해(낮) · 달(밤: 작고 또렷하게)
      if(h > 0.0){
        if(stars > 0.0){                             // 별(밤): 하늘을 격자로 나눠 드문드문
          vec2 sp = vec2(atan(d.z, d.x), asin(clamp(h, -1.0, 1.0))) * 180.0, cell = floor(sp);
          float r = hash(cell);
          if(r > 0.995) col += vec3(.85, .9, 1.0) * smoothstep(.38, 0.0, length(fract(sp) - .5)) * (.25 + .75*hash(cell + 3.1)) * stars * smoothstep(.03, .2, h);
        }
        vec2 uv = d.xz / (h + 0.08) * 1.6;           // 구름: 하늘 평면에 투영한 노이즈
        float c = smoothstep(0.5, 0.78, fbm(uv + vec2(3.0, 7.0))) * smoothstep(0.0, 0.18, h) * cloudK;
        vec3 cc = mix(cloudLo, cloudHi, smoothstep(0.5, 0.9, fbm(uv*1.7)));
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

const hemi = new THREE.HemisphereLight(lin('#d6e4f5'), lin('#55643f'), 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(lin('#fff1dc'), 2.0);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {left:-45, right:45, top:45, bottom:-45, near:1, far:420});   // 좁혀서 그림자 경계를 매끈하게
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
// 내 차 전조등: 밤에만 켬(낮엔 세기 0 — 빛 개수를 그대로 둬야 재질을 다시 컴파일하지 않음)
const headlight = new THREE.SpotLight(lin('#fff4e2'), 0, 150, .42, .55, 1.4);
scene.add(headlight, headlight.target);

/* ---------- 공용 재질 · 텍스처 (맵마다 같이 씀) ---------- */
const grassTex = canvasTex(256, 256, (g,w,h) => {
  g.fillStyle = '#87907a'; g.fillRect(0,0,w,h);
  for(let i=0;i<6000;i++){ const v = 110 + Math.random()*110 | 0; g.fillStyle = `rgba(${v*.78|0},${v},${v*.55|0},.35)`; g.fillRect(Math.random()*w, Math.random()*h, 1.4, 1.5 + Math.random()*3.5); }
}, true);
const terrainMat = (() => { const tex = grassTex.clone(); tex.needsUpdate = true; tex.repeat.set(280, 280); return new THREE.MeshStandardMaterial({map:tex, vertexColors:true, roughness:.96}); })();
// 2026-11-07 (D105): 위에서 본 잔디 사진 텍스처(assets/tex/grass.jpg, 한 장 7m, 반 칸 밀어 겹치기로 이음새 제거) — 넓은 면의 반복은 vertexColors 색 변화(fbm)와 곱해져 가려짐. 못 불러오면 위 코드 잔디
loadTex('assets/tex/grass.jpg', t => { t.repeat.set(2200/7, 2200/7); terrainMat.map = t; terrainMat.needsUpdate = true; });
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
// 곡선을 따라 띠 — 가장자리 옆 거리를 u의 함수로 (안쪽 가장자리 선이 V자로 벌어지게, D108)
function fillRibbonFn(g, curve, u0, u1, offFn, y){
  const pos = g.attributes.position.array, n = pos.length/6;
  for(let i=0;i<n;i++){
    const u = clamp(u0+(u1-u0)*i/(n-1)), p = curve.getPointAt(u), tg = curve.getTangentAt(u), [a, b] = offFn(u);
    let nx = -tg.z, nz = tg.x; const l = Math.hypot(nx,nz)||1; nx/=l; nz/=l;
    pos[i*6]=p.x+nx*a; pos[i*6+1]=y; pos[i*6+2]=p.z+nz*a; pos[i*6+3]=p.x+nx*b; pos[i*6+4]=y; pos[i*6+5]=p.z+nz*b;
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
// 길가 띠(콘크리트 띠 바깥 3.3 ~ 3.6m): 흙 · 자갈 사진 텍스처(assets/tex/verge.jpg, 한 장 ≈ 5m) — 잔디 언덕과 포장 사이의 갓길 흙 (D105)
loadTex('assets/tex/verge.jpg', t => { verge.map = t; verge.color = lin('#cfc8b8'); verge.needsUpdate = true; });
const paint = new THREE.MeshStandardMaterial({color:lin('#e9e9e3'), emissive:lin('#d8dbd4'), emissiveIntensity:0, roughness:.55, side:THREE.DoubleSide, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2});   // 밤엔 재귀반사처럼 살짝 빛남(setSceneLight)
const trackMat = new THREE.MeshBasicMaterial({color:0x000000, transparent:true, opacity:.06, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1});
// 가는 물체(가로등·표지판 기둥·가드레일)는 그림자를 드리우지 않는다: 도로 위에 선·띠 그림자가 생기면 부자연스럽고 차선으로 오인될 수 있음
const steel = worldUV(new THREE.MeshStandardMaterial({color:lin('#c3c8ce'), metalness:.8, roughness:.35, side:THREE.DoubleSide}), .5);   // 가드레일 W빔: 세계 좌표 2m 한 장
const galv = new THREE.MeshStandardMaterial({color:lin('#8e949b'), metalness:.6, roughness:.5});
// 2026-11-07 (D105): 아연도금 강판 사진 텍스처(assets/tex/galv.jpg) — 가드레일 빔(세계 좌표) · 가로등 기둥 · 지주 · 문형 표지 기둥(UV). 밤 반사체(reflMat)는 그대로
loadTex('assets/tex/galv.jpg', t => { steel.map = t; steel.color = lin('#d8dde2'); steel.metalness = .55; steel.roughness = .42; steel.needsUpdate = true;
  const t2 = t.clone(); t2.needsUpdate = true; t2.repeat.set(1, 4); galv.map = t2; galv.color = lin('#b9bec4'); galv.metalness = .5; galv.needsUpdate = true; });
const reflMat = new THREE.MeshStandardMaterial({color:lin('#ffb347'), emissive:lin('#ff9a1f'), emissiveIntensity:.35});
const lampMat = new THREE.MeshStandardMaterial({color:lin('#e8eef2'), emissive:lin('#fff6e0'), emissiveIntensity:.15, roughness:.3});
const footMat = new THREE.MeshStandardMaterial({color:lin('#9a9a95'), roughness:.9});
// 밤 전용: 가로등 바닥 불빛 · 등 머리 빛 (더하기 합성), 표지판 재질 목록
const nightOnly = [], signMats = [];
const poolGeo = new THREE.PlaneGeometry(17, 17).rotateX(-Math.PI/2);
// 밤 가로등 색 (D105): 국내 고속도로 LED 가로등 ≈ 4000K 따뜻한 흰색(예전 '255,206,150'은 나트륨등 주황에 가까웠음)
const poolMat = new THREE.MeshBasicMaterial({map:radialTex('255,228,196', .42), transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
  polygonOffset:true, polygonOffsetFactor:-6, polygonOffsetUnits:-6});
const glowMat = new THREE.SpriteMaterial({map:radialTex('255,240,214', .8), transparent:true, depthWrite:false, blending:THREE.AdditiveBlending});
let NIGHT = false;
// 가드레일: W자 단면 + 지주 + 반사체
const railBeam = (() => {
  const sh = new THREE.Shape([[0,0],[.07,.05],[.07,.12],[.03,.155],[.07,.19],[.07,.26],[0,.31],[-.006,.31],[.064,.262],[.064,.192],[.024,.155],[.064,.118],[.064,.052],[-.006,0]].map(p => new THREE.Vector2(p[0],p[1])));
  return new THREE.ExtrudeGeometry(sh, {depth:268, bevelEnabled:false});
})();
// 가로등 (D105): 받침(바닥 플랜지)이 있는 가늘어지는 기둥 · 살짝 꺾인 팔 · 납작한 등 머리 + 아래 렌즈 면(밤에 빛남, lampMat). 그림자는 드리우지 않음(가는 물체 원칙)
const lampGeo = (() => {
  const pole = merge([[new THREE.CylinderGeometry(.075,.12,10,12), M4()], [new THREE.CylinderGeometry(.2,.24,.08,16), M4().makeTranslation(0,-4.96,0)], [new THREE.CylinderGeometry(.13,.16,.5,12), M4().makeTranslation(0,-4.7,0)]]);
  const arm = merge([[new THREE.CylinderGeometry(.045,.055,1.6,8), M4().makeRotationZ(Math.PI/2).premultiply(M4().makeTranslation(-.75,0,0))], [new THREE.CylinderGeometry(.04,.045,1.0,8), M4().makeRotationZ(Math.PI/2 - .18).premultiply(M4().makeTranslation(-2.0,.09,0))]]);
  const head = merge([[new THREE.BoxGeometry(.95,.1,.34), M4()], [new THREE.BoxGeometry(.7,.04,.24), M4().makeTranslation(0,-.06,0)]]);
  return {pole, arm, head, lens:new THREE.PlaneGeometry(.62,.2).rotateX(Math.PI/2).translate(0,-.085,0)};
})();
// 갈림목 충격흡수대: 노랑 + 검은 사선
const goreMats = (() => {
  const stripes = canvasTex(128, 128, g => {
    g.fillStyle = '#f2c230'; g.fillRect(0,0,128,128); g.fillStyle = '#1b1b1b';
    for(let k=-128;k<256;k+=40){ g.beginPath(); g.moveTo(k,128); g.lineTo(k+20,128); g.lineTo(k+84,0); g.lineTo(k+64,0); g.fill(); }
  });
  const yellow = new THREE.MeshStandardMaterial({color:lin('#f2c230'), roughness:.6}), face = new THREE.MeshStandardMaterial({map:stripes, roughness:.6});
  // 2026-11-07 (D105): 칸이 나뉜 실제 제품처럼 — 오염된 노랑 · 검정 사선 사진 텍스처(assets/tex/gore.jpg). 앞면 + 옆면(세로로 늘려)
  loadTex('assets/tex/gore.jpg', t => { face.map = t; face.color = lin('#ffffff'); face.roughness = .7; face.needsUpdate = true; const ts = t.clone(); ts.needsUpdate = true; ts.repeat.set(2.5, 1); yellow.map = ts; yellow.color = lin('#ffffff'); yellow.roughness = .7; yellow.needsUpdate = true; });
  return [yellow,yellow,yellow,yellow,face,yellow];
})();
// 나무: 그린 나무 그림을 세 방향으로 교차시킨 판(앞뒤 따로) — 멀리서 보면 입체로 보이고 그림자도 잎 모양으로 진다
const treeKinds = (() => {
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
  // 2026-10-29: 판에 그리는 그림을 Higgsfield 소나무 · 느티나무 사진(배경 제거, assets/tex/tree_*.png)으로 — 판 비율도 그림 비율로. 못 불러오면 위 코드 그림
  // 2026-11-07 (D105): 그림을 그림자가 구워지지 않은 평평한 빛의 사진(1k, 배경 제거 · 흰 테 제거)으로 바꿈 — 장면 빛이 음영을 준다. 판 비율 = 그림 비율(소나무 688 × 1012 · 느티나무 838 × 1024).
  // 가장자리: alphaTest를 낮추고 alphaToCoverage(MSAA)로 부드럽게 — 예전 320px 그림은 가장자리 반투명 픽셀이 42 ~ 82%라 alphaTest .5에서 잎이 뜯겨 보였음
  return [[pineTex, cross(.68,1), 10, 7, 'assets/tex/tree_pine.png'], [leafTex, cross(.82,1), 8, 4, 'assets/tex/tree_zelkova.png']].map(([map, geo, hMin, hVar, url]) => {
    const mat = new THREE.MeshStandardMaterial({map, alphaTest:.3, alphaToCoverage:true, roughness:.95, envMapIntensity:.25});
    const depth = new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking, map, alphaTest:.5});
    loadTex(url, t => { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; mat.map = t; depth.map = t; mat.needsUpdate = depth.needsUpdate = true; });
    return {geo, mat, depth, hMin, hVar};
  });
})();
// 건물 벽: 한 장 = 가로 18m × 세로 21m (창 6열 × 7층, 창 하나 ≈ 3m). 2026-10-29: Higgsfield 생성 텍스처(assets/tex/facade.jpg)를 불러와 바꿔 끼움.
// 아래 코드 텍스처는 불러오기 전 · 실패했을 때 쓰는 같은 격자의 대체품
const FACADE_TILE = [18, 21];
const facadeMat = new THREE.MeshStandardMaterial({roughness:.85, map:canvasTex(192, 224, (g,w,h) => {
  g.fillStyle = '#dcd8cf'; g.fillRect(0,0,w,h);
  for(let r=0;r<7;r++) for(let c=0;c<6;c++){ g.fillStyle = Math.random() < .12 ? '#94a8b8' : `rgba(64,78,92,${.5+Math.random()*.3})`; g.fillRect(c*32+5, r*32+6, 22, 18); }
}, true), emissive:lin('#ffffff'), emissiveIntensity:0, emissiveMap:canvasTex(192, 224, (g,w,h) => {   // 밤에 켜지는 창 (낮 텍스처와 같은 격자)
  g.fillStyle = '#000'; g.fillRect(0,0,w,h);
  for(let r=0;r<7;r++) for(let c=0;c<6;c++) if(Math.random() < .3){ g.fillStyle = Math.random() < .7 ? '#ffd9a0' : '#cfe0ff'; g.fillRect(c*32+5, r*32+6, 22, 18); }
}, true)});
const facadeMats = [facadeMat];   // city.js가 색만 다른 복사본을 더함 — 텍스처를 바꿀 때 모두
// 상자 건물: 면마다 UV를 실제 크기(m)에 맞춰 창 크기가 건물마다 같게
function facadeBox(w, h, d, tile = FACADE_TILE){
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, fw = [d, d, 0, 0, w, w];   // 면 순서 +x −x +y −y +z −z
  for(let f = 0; f < 6; f++) for(let k = 0; k < 4; k++){ const i = f*4 + k; uv.setXY(i, uv.getX(i)*fw[f]/tile[0], uv.getY(i)*h/tile[1]); }
  return g;
}

/* ---------- Higgsfield 생성 재질 (2026-10-29, 출처 · 프롬프트 assets/README.md) ----------
   아스팔트(이음새 없게 처리) · 보도 블록 · 건물 벽. 불러오기 전 · 실패 시엔 위 코드 텍스처 그대로 → 주행 판정과 무관(그림만) */
loadTex('assets/tex/asphalt.jpg', t => { asphalt.map = t; asphalt.color = lin('#d2d6da'); asphalt.needsUpdate = true; });
// 밤 창: 같은 그림에서 유리(어두운 곳)만, 창 칸(6 × 7)마다 30% 켬. lumMax: 유리로 볼 밝기 한계(유리 외벽은 밝아서 높게)
function facadeNight(img, lumMax = 95){
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height), on = Array.from({length:42}, () => Math.random() < .3 ? (Math.random() < .7 ? [255,214,160] : [205,222,255]) : null);
  for(let y = 0; y < c.height; y++) for(let x = 0; x < c.width; x++){
    const i = (y*c.width + x)*4, lum = .3*d.data[i] + .59*d.data[i+1] + .11*d.data[i+2], cell = on[Math.min(6, Math.floor(y/c.height*7))*6 + Math.min(5, Math.floor(x/c.width*6))];
    const lit = cell && lum < lumMax; d.data[i] = lit ? cell[0] : 0; d.data[i+1] = lit ? cell[1] : 0; d.data[i+2] = lit ? cell[2] : 0;
  }
  g.putImageData(d, 0, 0);
  const em = new THREE.CanvasTexture(c); em.encoding = THREE.sRGBEncoding; em.wrapS = em.wrapT = THREE.RepeatWrapping; return em;
}
loadTex('assets/tex/facade.jpg', t => { const em = facadeNight(t.image); facadeMats.forEach(m => { m.map = t; m.emissiveMap = em; m.needsUpdate = true; }); });
/* 건물 종류 (2026-10-29, Higgsfield 생성 입면 — 창 6열 × 7층, 한 장 크기 = 층 높이에 맞춤):
   사무(facadeMat · 층 3m) · 아파트(층 2.8m) · 유리 업무(층 3.5m) + 1층 상가(높이 4.2m, 한 장 18m = 가게 3칸) + 지붕 테 · 옥상 설비 */
const BUILD = {
  office:{tile:FACADE_TILE, mats:facadeMats},
  apt:{tile:[18, 19.6], mats:['#ffffff', '#efe9df', '#e3e8eb'].map(hex => new THREE.MeshStandardMaterial({color:lin(hex), roughness:.85, emissive:lin('#ffffff'), emissiveIntensity:0}))},
  glass:{tile:[18, 24.5], mats:['#ffffff', '#dfe7ee'].map(hex => new THREE.MeshStandardMaterial({color:lin(hex), roughness:.22, metalness:.35, emissive:lin('#ffffff'), emissiveIntensity:0}))},
  shop:new THREE.MeshStandardMaterial({color:lin('#ffffff'), roughness:.6, emissive:lin('#ffffff'), emissiveIntensity:0}),
  roof:new THREE.MeshStandardMaterial({color:lin('#8b8d8a'), roughness:.92})
};
loadTex('assets/tex/facade_apt.jpg', t => { const em = facadeNight(t.image, 110); BUILD.apt.mats.forEach(m => { m.map = t; m.emissiveMap = em; m.needsUpdate = true; }); });
loadTex('assets/tex/facade_glass.jpg', t => { const em = facadeNight(t.image, 175); BUILD.glass.mats.forEach(m => { m.map = t; m.emissiveMap = em; m.needsUpdate = true; }); });
loadTex('assets/tex/shopfront.jpg', t => { BUILD.shop.map = t; BUILD.shop.emissiveMap = t; BUILD.shop.needsUpdate = true; });

/* ---------- 잔디 덩어리 (D105): 길가 흙 띠 바깥 1 ~ 6m에 낮은 풀 판(엇갈린 2장)을 인스턴스로 — 멀리는 지형 텍스처만 ---------- */
const tuftTex = canvasTex(128, 64, (g, w, h) => {
  for(let i = 0; i < 70; i++){ const x = 6 + Math.random()*(w - 12), k = .55 + Math.random()*.5, hh = 18 + Math.random()*40, lean = (Math.random() - .5)*14;
    g.strokeStyle = `rgba(${80*k|0},${118*k|0},${48*k|0},.9)`; g.lineWidth = 1.2 + Math.random()*1.4; g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + lean*.4, h - hh*.6, x + lean, h - hh); g.stroke(); }
});
const tuftMat = new THREE.MeshStandardMaterial({map:tuftTex, alphaTest:.4, side:THREE.DoubleSide, roughness:.95, color:lin('#b8c4a2')});
const tuftGeo = merge([[new THREE.PlaneGeometry(1.2, .6), M4().makeTranslation(0, .3, 0)], [new THREE.PlaneGeometry(1.2, .6), M4().makeRotationY(Math.PI/2).premultiply(M4().makeTranslation(0, .3, 0))]]);
function plantTufts(spots){   // spots = [[x, y, z]] → 인스턴스 하나. 그림자 없음(가는 물체)
  if(!spots.length) return;
  const im = new THREE.InstancedMesh(tuftGeo, tuftMat, spots.length), d = new THREE.Object3D();
  spots.forEach(([x, y, z], i) => { d.position.set(x, y, z); d.rotation.set(0, rnd()*6.3, 0); const s = .7 + rnd()*.7; d.scale.set(s, .6 + rnd()*.7, s); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
  im.receiveShadow = true; MG.add(im);
}

/* ---------- 먼 풍경: 겹겹이 산 (맵과 무관) ---------- */
const farMats = [];   // 기본 재질(빛 무시) → 밤엔 setSceneLight가 색을 낮춘다
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
    m.renderOrder = -1; scene.add(m); farMats.push(m.material);
  });
})();

/* ============================================================
   맵별 장면 — 도로에 딸린 것(지형 · 도로 · 차선 · 가드레일 · 가로등 · 표지판 · 충격흡수대 · 나무 · 먼 건물)
   처음 쓸 때 한 번 짓고 보관 → 두 번째부터는 보이기만 바꾼다(showMap). 난수 씨앗을 맵마다 고정해 같은 맵은 늘 같은 모습.
   ============================================================ */
let MG = null;   // 지금 짓는 맵 묶음
const addMesh = (geo, mat, shadow = 'r') => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = shadow.includes('r'); m.castShadow = shadow.includes('c'); MG.add(m); return m; };

// 표지판 판: 칸(lane 몫)마다 녹색 패널 — {from, to: 칸 번호, lines: 방면 글자 줄, arrow: 화살표 각도(0=↓)}
function signTex(cells, panels, bg = '#0d6b3c'){   // bg: 고속도로 녹색 · 일반도로 파랑(city.js)
  return canvasTex(800*cells, 400, g => {
    g.scale(4/3, 4/3);
    g.fillStyle = '#dfe4e1'; g.fillRect(0,0,600*cells,300);
    panels.forEach(pn => {
      const x = pn.from*600, w = (pn.to - pn.from + 1)*600;
      g.fillStyle = bg; g.fillRect(x+12,12,w-24,276);
      g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(x+28,28,w-56,244);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      if(pn.lines.length === 1){ g.font = `700 92px ${FONT}`; g.fillText(pn.lines[0], x+w/2, 118); }
      else { g.font = `700 62px ${FONT}`; pn.lines.forEach((t, i) => g.fillText(t, x+w/2, 82 + i*70)); }
      for(let c=pn.from; c<=pn.to; c++){
        g.save(); g.translate(c*600+300, 222); g.rotate(pn.arrow || 0);
        g.beginPath(); g.moveTo(0,38); g.lineTo(24,6); g.lineTo(9,6); g.lineTo(9,-34); g.lineTo(-9,-34); g.lineTo(-9,6); g.lineTo(-24,6); g.closePath(); g.fill();
        g.restore();
      }
    });
  });
}
// 트러스 문형 표지: 중심(cx,cz), 도로 방향(tx,tz), 판 폭 BW
function gantry(tex, BW, cx, cz, tx, tz){
  const grp = new THREE.Group(), rotY = Math.atan2(-tx, -tz);
  const add = (geo, mat, x, y, z, sh = '') => { const m = new THREE.Mesh(geo, mat); m.position.set(x,y,z); m.castShadow = sh.includes('c'); grp.add(m); return m; };
  const signMat = new THREE.MeshStandardMaterial({map:tex, roughness:.5, emissive:lin('#ffffff'), emissiveMap:tex, emissiveIntensity:NIGHT ? LIGHT.night.sign : 0});
  signMats.push(signMat);
  add(new THREE.PlaneGeometry(BW,2.3), signMat, 0,7,0);
  add(new THREE.BoxGeometry(BW+.2,2.46,.1), galv, 0,7,-.07);
  for(const x of [-(BW/2+.7), BW/2+.7]){ add(new THREE.CylinderGeometry(.24,.28,8.8,14), galv, x,4.4,-.4); add(new THREE.BoxGeometry(1,.25,1), footMat, x,.12,-.4); }
  // 트러스: 위·아래 현재 + 사선 부재
  for(const y of [6.1, 7.9]){ const c = add(new THREE.CylinderGeometry(.09,.09,BW+1.4,8), galv, 0,y,-.45); c.rotation.z = Math.PI/2; }
  const n = Math.floor((BW+1.2)/1.6);
  for(let i=0;i<n;i++){ const d = add(new THREE.CylinderGeometry(.04,.04,Math.hypot(1.6,1.8),6), galv, -n*.8 + i*1.6 + .8, 7, -.45); d.rotation.z = (i%2 ? 1 : -1)*Math.atan2(1.6,1.8); }
  grp.position.set(cx, 0, cz); grp.rotation.y = rotY; MG.add(grp);
}

function buildMapScene(m){
  MG = new THREE.Group();
  seed = 7 + MAPS.indexOf(m)*977;
  const N = m.lanes, H = m.half;
  // 같은 갈림의 형제 출구 · 출구 중심선 표본(500점) — 갈림 안쪽 띠 시작점(sepU) · 도류화 빗금에 씀 (D108)
  const sibs = new Map(), samp = e => e._samp || (e._samp = Array.from({length:500}, (_, i) => e.vis.getPointAt(i/499)));
  [m, ...m.segs.filter(e => e.node).map(e => e.node)].forEach(nd => nd.exits.forEach(e => sibs.set(e, nd.exits.filter(f => f !== e))));
  const sepU = (e, side) => {   // 출구 e의 side(−1 왼쪽 · 1 오른쪽) 포장 가장자리가 형제 출구 포장에서 떨어지는 u
    const L = e.vis.getLength(), fs = sibs.get(e) || [];
    for(let i = 0; i <= 400; i++){ const u = i/400, p = e.vis.getPointAt(u), t = e.vis.getTangentAt(u), l = Math.hypot(t.x, t.z) || 1, x = p.x - t.z/l*side*(e.half + .3), z = p.z + t.x/l*side*(e.half + .3);
      if(fs.every(f => { let d2 = Infinity; for(const q of samp(f)){ const dd = (q.x - x)**2 + (q.z - z)**2; if(dd < d2) d2 = dd; } return Math.sqrt(d2) > f.half + .1; })) return u; if(u*L > 160) return u; }
    return 1;
  };

  /* 도로까지 거리 → 지형 높이 */
  const BUCKET = 70, buckets = new Map();
  const put = (x,z) => { const k = Math.floor(x/BUCKET)+','+Math.floor(z/BUCKET); if(!buckets.has(k)) buckets.set(k, []); buckets.get(k).push([x,z]); };
  for(let z=60; z>=-236; z-=4) put(0, z);
  m.segs.forEach(e => { const L = e.vis.getLength(); for(let s=0; s<=L; s+=4){ const p = e.vis.getPointAt(s/L); put(p.x, p.z); } });
  const roadDist = (x,z) => {   // 가장 가까운 도로 중심선까지 거리(최대 70m)
    const bx = Math.floor(x/BUCKET), bz = Math.floor(z/BUCKET); let d2 = BUCKET*BUCKET;
    for(let i=-1;i<=1;i++) for(let j=-1;j<=1;j++){
      const arr = buckets.get((bx+i)+','+(bz+j)); if(!arr) continue;
      for(const p of arr){ const dx = p[0]-x, dz = p[1]-z, dd = dx*dx+dz*dz; if(dd < d2) d2 = dd; }
    }
    return Math.sqrt(d2);
  };
  const terrainH = (x,z) => {   // 도로 옆 16m까지는 평평, 70m까지 완만하게 올라 언덕
    const t = clamp((roadDist(x,z) - 16)/54);
    return -0.35 + t*t*(3-2*t) * (fbm(x*.011, z*.011)*46 - 9);
  };

  /* 지형 */
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
    const terrain = new THREE.Mesh(tg, terrainMat); terrain.receiveShadow = true; MG.add(terrain);
  })();

  /* 본선: 포장 · 갓길 풀 · 바퀴 자국 */
  const mainRoad = addMesh(new THREE.PlaneGeometry(H*2,275), asphalt);
  mainRoad.rotation.x = -Math.PI/2; mainRoad.position.set(0,0,(40-235)/2);
  const mainLine = curveOf([V(0,60), V(0,-236)], 50);
  for(const s of [-1,1]) addMesh(fillRibbon(ribbonGeo(40), mainLine, 0, 1, s*H, s*(H+3.6), -0.01, -0.45), verge);
  for(const s of [-1,1]) addMesh(fillRibbon(ribbonGeo(40), mainLine, 0, 1, s*(H + .05), s*(H + .5), .004), PROPS.concrete);   // 포장 끝 콘크리트 띠 — 포장 바깥(H + .05 ~ .5)에만, 가드레일 지주가 그 위에 섬 (2026-11-07 D108: 예전 H − .05부터라 포장 위에 흰 띠처럼 보였음)
  for(let i=0;i<N;i++) for(const o of [-.85,.85]){ const t = addMesh(new THREE.PlaneGeometry(.75, 268), trackMat); t.rotation.x = -Math.PI/2; t.position.set(m.laneX(i)+o, .002, -94); }

  /* 차선: 본선 점선 · 가장자리 실선 + 갈림 뒤 구간의 차로 사이 점선 (3m 칠 · 6m 빈칸, hud.js 미니 도로와 같은 간격) */
  const arr = [];
  const quad = (x0,z0,x1,z1,y) => arr.push(x0,y,z0, x1,y,z0, x0,y,z1, x1,y,z0, x1,y,z1, x0,y,z1);
  for(let i=1;i<N;i++){ const x = m.laneX(i) - LANE/2; for(let z=38; z>-222; z-=9) quad(x-.075,z,x+.075,z-3,.01); }
  for(const x of [-m.edgeX, m.edgeX]) quad(x-.08,40,x+.08,-228,.01);
  const at = (c, u, off) => { const p = c.getPointAt(clamp(u)), t = c.getTangentAt(clamp(u)); return [p.x - t.z*off, p.z + t.x*off]; };
  m.segs.forEach(e => {
    const c = e.vis, Lv = c.getLength(), hw = e.k*LANE/2;
    addMesh(fillRibbon(ribbonGeo(300), c, 0, 1, -e.half, e.half, .003 + e.layer*.002), asphalt);
    for(const s of [-1,1]) addMesh(fillRibbon(ribbonGeo(300), c, 0, 1, s*e.half, s*(e.half+3.3), -0.02, -0.45), verge);
    // 콘크리트 띠: 포장 바깥(half + .05 ~ .5)에, 갈림 안쪽은 옆 출구 포장과 겹치지 않게 된 곳(sepU)부터 (D108 — 예전엔 u = 0부터 옆 출구 노면 위에 깔려 두꺼운 흰 띠로 보였음)
    for(const s of [-1,1]){ const u0 = (s < 0 ? e.outerL : e.outerR) ? 0 : sepU(e, s); if(u0 < 1) addMesh(fillRibbon(ribbonGeo(300), c, u0, 1, s*(e.half + .05), s*(e.half + .5), .006 + e.layer*.002), PROPS.concrete); }
    // 가장자리 실선(폭 .16): 본선 가장자리 선과 같은 차로 끝 + .15 (2026-11-07 D108 — 예전 + .5는 본선 선과 0.35m 어긋나 갈림에서 두 겹으로 보였음).
    // 갈림 안쪽 선은 u = 0(차로 경계 ± .075)부터 바깥쪽으로 .15까지 10m에 걸쳐 벌어져 두 출구의 선이 V자를 이룸(예전엔 30m 뒤부터 갑자기 시작)
    for(const [sgn, outer] of [[-1, e.outerL], [1, e.outerR]]) addMesh(fillRibbonFn(ribbonGeo(300), c, 0, 1, u => { const o = outer ? hw + .15 : hw + .075 + .075*clamp(u*Lv/10); return [sgn*(o - .08), sgn*(o + .08)]; }, .013), paint);
    for(let i=1;i<e.k;i++){
      const off = -hw + i*LANE;
      for(let s=8; s<Lv-3; s+=9){
        const [ax,az] = at(c, s/Lv, off-.075), [bx,bz] = at(c, s/Lv, off+.075), [cx,cz] = at(c, (s+3)/Lv, off-.075), [dx,dz] = at(c, (s+3)/Lv, off+.075);
        arr.push(ax,.013,az, bx,.013,bz, cx,.013,cz, bx,.013,bz, dx,.013,dz, cx,.013,cz);
      }
    }
  });
  (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr,3)); g.computeVertexNormals(); addMesh(g, paint); })();

  /* 가드레일 · 지주 · 반사체 */
  (() => {
    const posts = [], refl = [], GX = H + .4;
    for(const x of [-GX, GX]){
      const b = addMesh(railBeam, steel); b.position.set(x, .45, -228); if(x > 0) b.scale.x = -1;   // 볼록한 면이 도로 쪽
      for(let z=38; z>-228; z-=4){ posts.push([x + Math.sign(x)*.1, z]); if(((Math.round(z) % 20) + 20) % 20 === 18) refl.push([x - Math.sign(x)*.05, z]); }
    }
    const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(.1,.8,.14), galv, posts.length), d = new THREE.Object3D();
    posts.forEach(([x,z],i) => { d.position.set(x,.4,z); d.updateMatrix(); pm.setMatrixAt(i, d.matrix); });
    pm.receiveShadow = true; MG.add(pm);
    const rm = new THREE.InstancedMesh(new THREE.BoxGeometry(.03,.09,.07), reflMat, refl.length);
    refl.forEach(([x,z],i) => { d.position.set(x,.83,z); d.updateMatrix(); rm.setMatrixAt(i, d.matrix); });
    MG.add(rm);
  })();

  /* 가로등: 양쪽에 엇갈려 */
  for(const [x, z0] of [[H+1.5, 25], [-(H+1.5), 1]]) for(let z=z0; z>-225; z-=48){
    const s = Math.sign(x);
    const p = addMesh(lampGeo.pole, galv); p.position.set(x, 5, z);
    const a = addMesh(lampGeo.arm, galv, ''); a.position.set(x, 9.95, z); a.scale.x = -s;   // 팔은 도로 쪽(-s)으로
    const h = addMesh(lampGeo.head, galv, ''); h.position.set(x - s*2.5, 10.05, z);
    const lens = addMesh(lampGeo.lens, lampMat, ''); lens.position.copy(h.position);
    // 밤에만: 바닥 불빛 웅덩이 · 등 머리 빛 (실제 조명 대신 가벼운 그림 — 가로등 10여 개에 빛을 다 켜면 무거움)
    const pool = new THREE.Mesh(poolGeo, poolMat); pool.position.set(x - s*3.2, .03, z); pool.renderOrder = 1;
    const glow = new THREE.Sprite(glowMat); glow.scale.set(2.6, 2.6, 1); glow.position.set(x - s*2.35, 9.78, z);
    for(const o of [pool, glow]){ o.visible = NIGHT; nightOnly.push(o); MG.add(o); }
  }

  /* 분기점 표지판 (z = -150, 갈림 80m 앞): 출구마다 해당 차로 위에 패널, 차로마다 ↓ */
  const panelOf = e => ({from:e.lanes[0], to:e.lanes[e.k-1], lines: e.node ? e.node.exits.map(c => c.dest) : [e.dest]});
  gantry(signTex(N, m.exits.map(panelOf)), N*LANE*(13.8/10.5), 0, -150, 0, -1);
  // 램프 위 두 번째 갈림 표지 (갈림 80m 앞, 칸마다 갈 방향 화살표)
  m.segs.filter(e => e.node).forEach(e => {
    const u = clamp((e.L - 80)/e.L), p = e.curve.getPointAt(u), t = e.curve.getTangentAt(u);
    const panels = e.node.exits.map((c, i) => ({from:i, to:i, lines:[c.dest], arrow: c.key === 'L' ? Math.PI*.75 : c.key === 'R' ? -Math.PI*.75 : Math.PI}));
    gantry(signTex(panels.length, panels), 9.2, p.x, p.z, t.x, t.z);
  });

  /* 갈림목 코(gore)마다 노란 충격흡수대 */
  const hatch = [];
  const goreAt = (node, z0) => {
    const samples = node.exits.map(e => Array.from({length:500}, (_,i) => e.vis.getPointAt(i/499)));
    const xAt = (i,z) => { let best = samples[i][0]; for(const p of samples[i]) if(Math.abs(p.z-z) < Math.abs(best.z-z)) best = p; return best.x; };
    for(let a=0; a<node.exits.length-1; a++){
      const need = node.exits[a].half + node.exits[a+1].half + 1.8;
      // 도류화 빗금 (D108): 두 출구의 안쪽 가장자리 선(차로 끝 + .15) 사이 삼각형에 흰 사선(폭 .3 · 간격 1.5m · 45°, 별표 6 531 안전지대표시 [가정]) — 선이 .6m 넘게 벌어진 곳부터 코까지
      { const ea = node.exits[a], eb = node.exits[a+1], hwA = ea.k*LANE/2 + .15, hwB = eb.k*LANE/2 + .15;
        for(let z = z0 - 2; z > z0 - 120; z -= 1.5){ const xa = xAt(a, z) + hwA, xb = xAt(a+1, z) - hwB, gap = xb - xa; if(gap < .6) continue; if(gap > need - ea.half - eb.half + 1.2) break;
          const z2 = z - gap; const q = [[xa + .1, z], [xb - .1, z2], [xb - .1, z2 - .42], [xa + .1, z - .42]];   // 45° 사선 한 줄(가로 폭 .3 ≈ 세로 .42)
          hatch.push(q[0][0],.013,q[0][1], q[1][0],.013,q[1][1], q[2][0],.013,q[2][1], q[0][0],.013,q[0][1], q[2][0],.013,q[2][1], q[3][0],.013,q[3][1]); } }
      for(let z=z0-6; z>z0-120; z-=1){
        const xa = xAt(a,z), xb = xAt(a+1,z);
        if(xb - xa < need) continue;
        const g = new THREE.Mesh(new THREE.BoxGeometry(.9,.95,2.4), goreMats);
        const mx = (xa+xb)/2, dx = (xAt(a,z-6)+xAt(a+1,z-6))/2 - mx;   // 6m 앞 가운데선 쪽으로 향함
        g.position.set(mx, .47, z - 1.2); g.rotation.y = Math.atan2(-dx, 6);
        g.castShadow = g.receiveShadow = true; MG.add(g); break;
      }
    }
  };
  goreAt(m, FORK_Z);
  m.segs.filter(e => e.node).forEach(e => goreAt(e.node, e.node.pt[1]));
  if(hatch.length){ const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(hatch,3)); g.computeVertexNormals(); addMesh(g, paint); }

  /* 잔디 덩어리: 본선 양옆 흙 띠 바깥(H + 3.6 ~ 9m)과 갈림 뒤 출구 처음 160m */
  (() => {
    const spots = [];
    for(let z = 40; z > -230; z -= 1.3) for(const s of [-1, 1]){ const x = s*(H + 3.8 + rnd()*5); spots.push([x, terrainH(x, z) + .02, z + (rnd() - .5)]); }
    m.segs.forEach(e => { const L = e.vis.getLength(); for(let d = 4; d < Math.min(L, 160); d += 1.6) for(const s of [-1, 1]){ const p = e.vis.getPointAt(d/L), t = e.vis.getTangentAt(d/L), off = s*(e.half + 3.5 + rnd()*4); const x = p.x - t.z*off, z = p.z + t.x*off; if(roadDist(x, z) < e.half + 3.4) continue; spots.push([x, terrainH(x, z) + .02, z]); } });
    plantTufts(spots);
  })();

  /* 나무 */
  (() => {
    const spots = [];
    for(let k=0; k<60000 && spots.length<5200; k++){
      const x = (rnd()-.5)*1000, z = 90 - rnd()*900;
      if(roadDist(x,z) < 13 || Math.hypot(x, z+150) < 14) continue;
      if(fbm(x*.02+3, z*.02) < .33) continue;                             // 숲 덩어리와 빈 들판
      spots.push([x, terrainH(x,z) - .2, z]);
    }
    // 도로에서 30m 안 나무는 입체(줄기 · 가지 · 잎 덩어리, props.js) — 지나가며 시차가 보이게. 나머지는 판 나무
    const near3d = [];
    for(let i = spots.length - 1; i >= 0; i--){ const [x, y, z] = spots[i]; if(roadDist(x, z) < 30 && near3d.length < 260 && hash2(i, 5) < .55){ near3d.push([x, y, z, .95 + rnd()*.45, rnd()*6.3]); spots.splice(i, 1); } }
    PROPS.plantTrees(MG, near3d, rnd);
    const d = new THREE.Object3D(), c = new THREE.Color();
    treeKinds.forEach(({geo, mat, depth, hMin, hVar}, ti) => {
      const list = spots.filter((_,i) => (hash2(i, 3) < .7) === (ti === 0));   // 침엽 70% · 활엽 30%
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      im.customDepthMaterial = depth;
      list.forEach(([x,y,z],i) => {
        const s = hMin + rnd()*hVar; d.position.set(x,y,z); d.rotation.set(0, rnd()*6.3, 0); d.scale.set(s*(.85+rnd()*.3), s, s*(.85+rnd()*.3)); d.updateMatrix();
        im.setMatrixAt(i, d.matrix); im.setColorAt(i, c.setRGB(.8+rnd()*.35, .85+rnd()*.3, .75+rnd()*.3));
      });
      im.castShadow = im.receiveShadow = true; MG.add(im);
    });
  })();

  /* 먼 아파트 단지 */
  for(const [cx, cz, n] of [[-330,-760,9],[400,-720,8],[60,-990,7]]) for(let i=0;i<n;i++){
    const w = 34+rnd()*14, h = 55+rnd()*45, x = cx+(rnd()-.5)*220, z = cz+(rnd()-.5)*120;
    const b = new THREE.Mesh(facadeBox(w,h,13, BUILD.apt.tile), BUILD.apt.mats[i % BUILD.apt.mats.length]); b.position.set(x, terrainH(x,z) + h/2 - 2, z); b.rotation.y = (rnd()-.5)*.5; MG.add(b);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + .4, .5, 13.4), BUILD.roof); cap.position.set(x, terrainH(x,z) + h - 1.75, z); cap.rotation.y = b.rotation.y; MG.add(cap);
  }

  const g = MG; MG = null; return g;
}

const builtMaps = {};
function showMap(m){
  if(!builtMaps[m.id]){ builtMaps[m.id] = m.city ? buildCityScene(m) : buildMapScene(m); scene.add(builtMaps[m.id]); }   // 일반도로는 city.js
  Object.entries(builtMaps).forEach(([id, g]) => g.visible = id === m.id);
}
// 멈춰 있을 때 남은 맵을 미리 지어 둔다 (맵을 바꿀 때 멈칫하지 않게)
function prebuildMaps(isIdle){
  const next = MAPS.find(m => !builtMaps[m.id]);
  if(!next) return;
  setTimeout(() => {
    if(isIdle()){ const g = next.city ? buildCityScene(next) : buildMapScene(next); g.visible = false; builtMaps[next.id] = g; scene.add(g); }
    prebuildMaps(isIdle);
  }, 400);
}

/* ---------- 차량 ---------- */
// 옆모습 윤곽(s=앞뒤, y=높이)을 옆으로 밀어낸 차체 + 유리 캐빈 + C필러 + 바퀴 + 등화.
// 원점 = 바닥 중심, 앞 = -z, 뒤 = +z. 길이 4.1~4.8m (정체 간격 Q_SPACE 6.8m 안에 들어가게)
// hy · hz: 전조등 높이 · 앞면 z (2026-10-29 — 앞 · 뒤가 구분되게 전조등 · 그릴 · 앞 번호판 추가, 참고 시안 assets/ref/6_vehicles.jpg)
const CAR_TYPES = {
  sedan:{L:4.6, W:1.84, r:.33, wf:1.42, wr:-1.38, tail:.84, tz:2.31, pz:2.365, hy:.72, hz:-2.29,
    body:[[-2.2,.3],[-2.3,.38],[-2.32,.64],[-2.22,.92],[-1.95,.99],[1.02,1.0],[2.08,.86],[2.3,.68],[2.3,.42],[2.2,.3]],
    cabin:[[-1.4,.99],[-.62,1.43],[.32,1.46],[1.02,1.0]]},
  suv:{L:4.7, W:1.9, r:.37, wf:1.45, wr:-1.45, tail:1.02, tz:2.42, pz:2.405, hy:.84, hz:-2.35,
    body:[[-2.22,.36],[-2.35,.46],[-2.36,1.08],[1.3,1.1],[2.15,.98],[2.35,.8],[2.35,.48],[2.22,.36]],
    cabin:[[-2.3,1.08],[-2.14,1.72],[.6,1.75],[1.3,1.1]]},
  hatch:{L:4.1, W:1.78, r:.31, wf:1.27, wr:-1.25, tail:.9, tz:2.13, pz:2.11, hy:.7, hz:-2.06,
    body:[[-1.95,.3],[-2.05,.4],[-2.07,.96],[.95,.98],[1.86,.84],[2.05,.66],[2.05,.42],[1.95,.3]],
    cabin:[[-2.0,.96],[-1.78,1.47],[.3,1.5],[.95,.98]]},
  truck:{L:4.8, W:1.76, r:.33, wf:1.55, wr:-1.35, tail:.5, tz:2.44, pz:2.43, hy:.78, hz:-2.38}
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
// 옆면 기울기 (2026-10-29): 밀어낸 판이라 옆면이 수직 벽이었음 → 허리선(belt) 위로 갈수록 안쪽으로(텀블홈), 유리 캐빈은 더 많이 좁힘
function tumble(g, y0, y1, k){
  const p = g.attributes.position;
  for(let i = 0; i < p.count; i++){ const y = p.getY(i), t = clamp((y - y0)/(y1 - y0)); p.setX(i, p.getX(i)*(1 - k*t)); }
  p.needsUpdate = true; g.computeVertexNormals(); return g;
}
function carGeo(type){
  if(carGeoCache[type]) return carGeoCache[type];
  const T = CAR_TYPES[type], cw = T.W - .26, out = {}, belt = T.cabin[0][1] - .02, top = Math.max(...T.cabin.map(q => q[1]));
  out.body = tumble(profileGeo(T.body, T, T.W - .1, true, true), belt - .35, belt, .05);
  out.cabin = tumble(profileGeo(T.cabin, T, cw, true, false), belt, top, .24);
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
    head: std('#cfd5da', {emissive:lin('#fff4e0'), emissiveIntensity:.18, metalness:.3, roughness:.15}),   // 전조등 (밤에 밝아짐 — setSceneLight)
    grille: std('#0d0f12', {roughness:.5, metalness:.4}),
    brake: std('#4a0606', {emissive:lin('#ff0a0a'), emissiveIntensity:1.5, roughness:.25}),   // 세기는 setSceneLight(LIGHT.brake): 낮 1.5 · 밤 2.6 (예전 #ff1c1c · 3 고정 — 톤 매핑에서 주황으로 떴음)
    // 방향 지시등 (2026-11-07, D103): 주황 렌즈. 켜짐은 applyBlink()이 재질을 바꿔 끼움 — 밤엔 더 밝게(setSceneLight)
    indOff: std('#b8742c', {emissive:lin('#ff9a1f'), emissiveIntensity:0, roughness:.3}),
    indOn: std('#ffb340', {emissive:lin('#ff9a1f'), emissiveIntensity:1.6, roughness:.3}),
    // 차 밑 그림자 (D105): 순수 검정 방사형(불투명도 .65)이 '검은 판'처럼 보였음 → 하늘 · 땅 색이 섞인 어두운 색, 차 바로 밑만 진하고 바깥으로 빠르게 옅어짐, 바퀴 닿는 네 곳이 가장 진함. 밤엔 setSceneLight가 더 옅게
    shadow: new THREE.MeshBasicMaterial({map:canvasTex(128, 256, (g, w, h) => {
      const gr = g.createRadialGradient(w/2, h/2, 0, w/2, h/2, w*.62); gr.addColorStop(0, 'rgba(22,26,34,.62)'); gr.addColorStop(.55, 'rgba(22,26,34,.38)'); gr.addColorStop(.85, 'rgba(22,26,34,.1)'); gr.addColorStop(1, 'rgba(22,26,34,0)');
      g.save(); g.translate(w/2, h/2); g.scale(1, h/w); g.translate(-w/2, -h/2); g.fillStyle = gr; g.fillRect(-w, -h, 3*w, 3*h); g.restore();   // 세로로 늘린 타원 그라데이션
      for(const [fx, fy] of [[.2,.28],[.8,.28],[.2,.72],[.8,.72]]){ const r2 = g.createRadialGradient(w*fx, h*fy, 0, w*fx, h*fy, w*.17); r2.addColorStop(0, 'rgba(10,12,16,.55)'); r2.addColorStop(1, 'rgba(10,12,16,0)'); g.fillStyle = r2; g.fillRect(0, 0, w, h); }
    }), transparent:true, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-4})
  };
})();
const headGlowMat = new THREE.SpriteMaterial({map:radialTex('255,244,225', .9), transparent:true, depthWrite:false, blending:THREE.AdditiveBlending});
const paintCache = new Map();
const paintOf = hex => { if(!paintCache.has(hex)) paintCache.set(hex, new THREE.MeshStandardMaterial({color:lin(hex), metalness:.55, roughness:.3})); return paintCache.get(hex); };
const tireGeo = r => { const g = new THREE.CylinderGeometry(r, r, .23, 22); g.rotateZ(Math.PI/2); return g; };
const rimGeo = r => { const g = new THREE.CylinderGeometry(r*.62, r*.62, .236, 16); g.rotateZ(Math.PI/2); return g; };
// 부품을 재질(역할)별로 합쳐 차종마다 한 번만 만든다 → 차 한 대 = 그리기 호출 8번 안팎 (정체 22대여도 가볍게)
const carPartsCache = {};
function carParts(type){
  if(carPartsCache[type]) return carPartsCache[type];
  const T = CAR_TYPES[type], P = {paint:[], glass:[], trim:[], box:[], lamp:[], head:[], grille:[], plate:[], tire:[], rim:[]};
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
    // 문 거울: 앞 유리 기둥 밑, 받침(검정) + 덮개(차체색)
    for(const sx of [-1,1]){ P.trim.push([box(.12, .05, .08), at(sx*(T.W/2 + .02), fy + .04, -(fx - .22))]); P.paint.push([box(.1, .13, .19), at(sx*(T.W/2 + .1), fy + .1, -(fx - .2))]); }
    // 뒤 범퍼 아래 검은 띠 · 바퀴집 아래 옆 검은 띠
    P.trim.push([box(T.W - .1, .16, .1), at(0, .3, T.pz - .02)]);
    for(const sx of [-1,1]) P.trim.push([box(.04, .1, Math.abs(T.wf - T.wr) - .9), at(sx*(T.W/2 - .03), .3, -(T.wf + T.wr)/2)]);
  }
  for(const sx of [-1,1]) P.lamp.push([box(.46, .12, .05), at(sx*(T.W/2-.31), T.tail, T.tz)]);
  if(type !== 'truck') P.lamp.push([box(T.W - 1.2, .025, .04), at(0, T.tail + .03, T.tz)]);   // 가운데 이어진 미등 선
  P.plate.push([box(.52, .12, .02), at(0,.52,T.pz)]);
  // 앞: 전조등 2 · 주간등 띠 · 그릴 · 앞 번호판 · 범퍼 아래 검은 띠 → 미러 · 마주 오는 차에서 앞모습이 읽힘
  for(const sx of [-1,1]){ P.head.push([box(.42, .11, .06), at(sx*(T.W/2-.32), T.hy, T.hz)]); P.head.push([box(.3, .025, .065), at(sx*(T.W/2-.36), T.hy + .085, T.hz)]); }
  P.grille.push([box(T.W*.42, .17, .05), at(0, T.hy - .1, T.hz - .005)]);
  P.grille.push([box(T.W - .3, .1, .05), at(0, .36, T.hz + .02)]);
  P.plate.push([box(.52, .11, .02), at(0, T.hy - .3, T.hz - .03)]);
  for(const s of [T.wf, T.wr]) for(const sx of [-1,1]){ P.tire.push([tireGeo(T.r), at(sx*(T.W/2-.13), T.r, -s)]); P.rim.push([rimGeo(T.r), at(sx*(T.W/2-.13), T.r, -s)]); }
  // 방향 지시등: 앞 · 뒤 모서리(바깥쪽) — 왼쪽 · 오른쪽을 따로 모아 한 쪽씩 켤 수 있게 (D103)
  for(const sx of [-1,1]){ const k = sx < 0 ? 'indL' : 'indR'; P[k] = P[k] || []; P[k].push([box(.14, .09, .1), at(sx*(T.W/2-.07), T.hy + .01, T.hz + .03)], [box(.14, .1, .07), at(sx*(T.W/2-.08), T.tail + .02, T.tz - .01)]); }
  const out = {};
  for(const k in P) if(P[k].length) out[k] = merge(P[k]);
  out.shadow = new THREE.PlaneGeometry(T.W + .5, T.L + .7).rotateX(-Math.PI/2).translate(0, .02, 0);
  return carPartsCache[type] = out;
}
function makeCar(type, hex, braking){
  const parts = carParts(type), g = new THREE.Group();
  const mats = {paint:paintOf(hex), glass:carMats.glass, trim:carMats.trim, box:carMats.box, lamp:braking ? carMats.brake : carMats.tail,
    head:carMats.head, grille:carMats.grille, plate:carMats.plate, tire:carMats.tire, rim:carMats.rim, shadow:carMats.shadow, indL:carMats.indOff, indR:carMats.indOff};
  g.userData.ind = {}; g.userData.brake = braking;
  for(const k in parts){
    const m = new THREE.Mesh(parts[k], mats[k]); m.userData.part = k;
    m.castShadow = !['lamp','head','plate','rim','shadow','indL','indR'].includes(k); m.receiveShadow = k !== 'shadow';
    if(k === 'indL') g.userData.ind.L = m; if(k === 'indR') g.userData.ind.R = m;
    g.add(m);
  }
  carRegistry.push({group:g, type, hex}); applyCarModel(carRegistry[carRegistry.length - 1]);   // 3D 모델이 이미 왔으면 바로, 아니면 올 때 바꿔 끼움 (D106)
  // 밤: 전조등 빛 번짐 (미러 · 앞 화면에서 다가오는 차가 보이게). 실제 빛(조명)은 무거워 그림으로만
  const T = CAR_TYPES[type];
  for(const sx of [-1,1]){ const sp = new THREE.Sprite(headGlowMat); sp.scale.set(1.1, 1.1, 1); sp.position.set(sx*(T.W/2-.32), T.hy, T.hz - .12); sp.visible = NIGHT; nightOnly.push(sp); g.add(sp); }
  g.userData.L = CAR_TYPES[type].L; g.userData.W = CAR_TYPES[type].W;   // 충돌 판정 크기 = 차체 크기 (drive.js)
  g.visible = false; scene.add(g); return g;
}
// 방향 지시등 켜기 (D103): side −1 왼쪽 · 1 오른쪽 · 2 비상등(양쪽) · 0 끔. on = 깜빡임 켜짐 순간. 버스(city.js)도 userData.ind가 있어 같이 쓴다
function applyBlink(mesh, side, on){
  if(mesh.userData.lights) mesh.userData.lights.blink = on ? side : 0;   // 모델 차: 셰이더 (D110)
  const I = mesh.userData.ind; if(!I || !I.L) return;
  I.L.material = on && (side < 0 || side === 2) ? carMats.indOn : carMats.indOff;
  I.R.material = on && (side > 0) ? carMats.indOn : carMats.indOff;
}
// 깜빡임 켜짐 순간인가: 시계 t(초) · 차마다 박자를 어긋나게(i) — 실제 교통처럼 서로 맞지 않음
const blinkOn = (t, i = 0) => ((t*BLINK.hz + i*.37) % 1) < .5;
/* ---------- 차량 3D 모델 (2026-11-07, D106): Higgsfield Tripo H3.1 image-to-3D GLB (assets/models, 텍스처 1024) ----------
   차체 · 유리 · 바퀴 · 그릴을 GLB 한 메시로 바꾸고, 등화(미등 · 브레이크 · 전조등 · 깜빡이) · 밤 빛 번짐 · 바닥 그림자는 코드 메시를 그대로 둔다 → setBrake · applyBlink · 밤 전조등이 전과 같이 동작.
   GLB의 길이 축은 PCA로 찾아 z에 맞추고(앞 = -z, 다섯 모델 모두 뒤집기 없이 맞음 — 2026-11-07 눈으로 확인), 판정 크기(CAR_TYPES L · W)에 정확히 맞춰 늘린다(길이 · 폭 따로, 높이는 그 기하평균).
   도장 색은 흰 바탕 텍스처에 색을 곱해(mat.color) 차마다 다르게. 못 불러오면 지금 코드 메시 그대로(loadTex와 같은 방식) */
const CAR_MODELS = {}, carRegistry = [];
const MODEL_HIDE = new Set(['paint', 'glass', 'trim', 'box', 'grille', 'plate', 'tire', 'rim', 'body', 'door']);   // 숨길 코드 부품 (등화 · 지시등 · 그림자 · 행선지 표시는 남김)
function alignModelGeo(geo, L, W){
  const p = geo.attributes.position; let mx = 0, mz = 0; for(let i = 0; i < p.count; i++){ mx += p.getX(i); mz += p.getZ(i); } mx /= p.count; mz /= p.count;
  let cxx = 0, cxz = 0, czz = 0; for(let i = 0; i < p.count; i++){ const x = p.getX(i) - mx, z = p.getZ(i) - mz; cxx += x*x; cxz += x*z; czz += z*z; }
  geo.rotateY(.5*Math.atan2(2*cxz, cxx - czz) + Math.PI/2);   // 주축(길이) → z
  geo.computeBoundingBox(); let b = geo.boundingBox, s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
  geo.translate(-c.x, -b.min.y, -c.z); const sx = W/s.x, sz = L/s.z; geo.scale(sx, Math.sqrt(sx*sz), sz); geo.computeBoundingBox(); geo.computeBoundingSphere();
  return geo;
}
// 모델 차의 등화: 코드 차의 큰 등 상자(.46 × .12)는 GLB에 구워진 등 위에 떠 보여 → 얇은 띠(.34 × .06)로 바꿔 표면에 살짝 붙임 (미등 ↔ 브레이크 재질 바꿔 끼우기는 그대로)
const modelLampCache = {};
function modelLamps(type){
  if(modelLampCache[type]) return modelLampCache[type]; const T = CAR_TYPES[type]; if(!T) return null;
  const at = (x, y, z) => M4().makeTranslation(x, y, z), box = (w, h, d) => new THREE.BoxGeometry(w, h, d), lamp = [], head = [];
  for(const sx of [-1, 1]){ lamp.push([box(.34, .06, .04), at(sx*(T.W/2 - .33), T.tail + .02, T.tz + .005)]); head.push([box(.3, .07, .04), at(sx*(T.W/2 - .33), T.hy + .01, T.hz - .005)]); }
  return modelLampCache[type] = {lamp:merge(lamp), head:merge(head)};
}
/* ---------- 등화 (2026-11-07, D110): 모델 차체 표면 자체가 빛난다 ----------
   코드 메시로 붙이던 등 상자(몸체 밖에 뜬 납작한 네모)를 버리고, 차체 재질 셰이더에 등 영역을 심는다.
   등 영역 = 차 좌표(앞 = −z)에서 뒷면 · 앞면 가까이 × 등 높이 × 바깥쪽 폭 — 모델의 실제 곡면 위에서만 빛나므로 떠 보이지 않고 겹침(z-fighting)도 없다.
   텍스처에 그려진 빨강(뒤 등) · 주황(깜빡이) · 밝은 면(앞등)은 색으로 골라 그 자리를 더 세게 — 텍스처가 흐린 모델도 영역만으로 보인다.
   상태(uniform): tail(미등, 밤) · brake · head(전조등, 밤) · dayHead(주간등) · blink L/R. 꺼진 뒤 등엔 빨간 렌즈 색을 살짝 곱한다 */
const LAMP_SHADER = {
  vert:['#include <begin_vertex>', '#include <begin_vertex>\n  vLp = position;'],
  frag:['#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  { float L = uDim.x, W = uDim.y; vec3 p = vLp, base = diffuseColor.rgb;
    float rear = smoothstep(L*0.5 - 0.5, L*0.5 - 0.15, p.z), front = smoothstep(L*0.5 - 0.5, L*0.5 - 0.15, -p.z);
    float side = smoothstep(W*0.5 - 0.5, W*0.5 - 0.34, abs(p.x)), outer = smoothstep(W*0.5 - 0.26, W*0.5 - 0.14, abs(p.x));
    float ty = 1.0 - smoothstep(0.07, 0.17, abs(p.y - uDim.z)), hy = 1.0 - smoothstep(0.07, 0.16, abs(p.y - uDim.w));
    float red = clamp((base.r - max(base.g, base.b))*2.5, 0.0, 1.0), amber = clamp((base.r - base.b)*2.0, 0.0, 1.0)*step(0.25, base.g)*step(base.g, 0.8);
    float lum = dot(base, vec3(0.333));
    float tailM = rear*side*ty*(0.35 + 1.0*red), headM = front*side*hy*(0.45 + 0.6*smoothstep(0.45, 0.8, lum)), blinkM = (rear*ty + front*hy)*outer*(0.45 + 0.8*amber);
    float bl = p.x < 0.0 ? uBlink.x : uBlink.y;
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(0.95, 0.3, 0.25), tailM*0.45);   // 꺼진 뒤 등: 빨간 렌즈
    totalEmissiveRadiance += vec3(1.0, 0.07, 0.05)*tailM*(uLamp.x*0.7 + uLamp.y*uLamp.y*2.4);
    totalEmissiveRadiance += vec3(1.0, 0.96, 0.86)*headM*(uLamp.z*2.6 + uLamp.w*0.4);
    totalEmissiveRadiance += vec3(1.0, 0.62, 0.12)*blinkM*bl*(1.8 + uLamp.z*1.2); }`]
};
function lampMaterial(mat, T){
  mat.onBeforeCompile = sh => {
    sh.uniforms.uLamp = {value:new THREE.Vector4(0, 0, 0, 1)}; sh.uniforms.uBlink = {value:new THREE.Vector2(0, 0)}; sh.uniforms.uDim = {value:new THREE.Vector4(T.L, T.W, T.tail, T.hy)};
    sh.vertexShader = 'varying vec3 vLp;\n' + sh.vertexShader.replace(LAMP_SHADER.vert[0], LAMP_SHADER.vert[1]);
    sh.fragmentShader = 'varying vec3 vLp; uniform vec4 uLamp; uniform vec2 uBlink; uniform vec4 uDim;\n' + sh.fragmentShader.replace(LAMP_SHADER.frag[0], LAMP_SHADER.frag[1]);
    mat.userData.u = sh.uniforms;
  };
  mat.customProgramCacheKey = () => 'lamp';
  return mat;
}
// 밤 바닥 빛: 전조등 부채꼴(앞) · 브레이크 붉은 반사(뒤) — 더하기 합성 그림, 실제 조명 아님
const fanTex = canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w/2, h, 0, w/2, h, h); gr.addColorStop(0, 'rgba(255,240,210,.55)'); gr.addColorStop(.5, 'rgba(255,240,210,.22)'); gr.addColorStop(1, 'rgba(255,240,210,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(w/2, h); g.lineTo(0, 0); g.lineTo(w, 0); g.closePath(); g.fill(); });
const fanMat = new THREE.MeshBasicMaterial({map:fanTex, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, polygonOffset:true, polygonOffsetFactor:-5, polygonOffsetUnits:-5});
const brakePoolMat = new THREE.MeshBasicMaterial({map:radialTex('255,40,30', .35), transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, polygonOffset:true, polygonOffsetFactor:-5, polygonOffsetUnits:-5});
const fanGeo = new THREE.PlaneGeometry(9, 14).rotateX(-Math.PI/2), brakePoolGeo = new THREE.PlaneGeometry(3, 2.4).rotateX(-Math.PI/2);
const _cv = new THREE.Vector3(), _cf = new THREE.Vector3();
function applyCarModel(car){
  const M = CAR_MODELS[car.type]; if(!M || car.group.userData.model) return;
  const g = car.group;
  // 코드 부품은 모두 숨김(등 · 깜빡이 상자 포함) — 등은 셰이더가 몸체 위에 그린다. 그림자 · 행선지 표시 · 밤 창 빛은 남김
  g.children.forEach(ch => { if(ch.userData.part && (MODEL_HIDE.has(ch.userData.part) || ['lamp', 'head', 'indL', 'indR', 'ind'].includes(ch.userData.part))) ch.visible = false; });
  const T = car.type === 'bus' ? {L:11.4, W:2.5, tail:1.05, hy:.72} : CAR_TYPES[car.type];
  const mat = lampMaterial(M.mat.clone(), T); mat.color = lin(car.hex); mat.envMapIntensity = .6; mat.metalness = Math.min(mat.metalness, .45); mat.roughness = Math.max(mat.roughness, .4); mat.side = THREE.FrontSide;
  const m = new THREE.Mesh(M.geo, mat); m.castShadow = m.receiveShadow = true; m.userData.part = 'model'; g.add(m); g.userData.model = m;
  // 밤 빛 그림: 전조등 번짐 스프라이트는 차마다 재질을 따로(앞에서 볼 때만 보이게 밝기를 바꿈), 바닥 부채꼴 · 브레이크 반사
  g.children.filter(ch => ch.isSprite).forEach(ch => { ch.material = headGlowMat.clone(); ch.scale.set(.9, .9, 1); ch.userData.glow = true; });
  const fan = new THREE.Mesh(fanGeo, fanMat.clone()); fan.position.set(0, .03, -T.L/2 - 7); fan.visible = false; fan.userData.fan = true; g.add(fan);
  const bp = new THREE.Mesh(brakePoolGeo, brakePoolMat.clone()); bp.position.set(0, .03, T.L/2 + 1.1); bp.visible = false; bp.userData.brakePool = true; g.add(bp);
  g.userData.lights = {brake:!!g.userData.brake, blink:0};
}
// 매 프레임(renderScene): 상태 → 셰이더 uniform · 빛 그림. 전조등 번짐은 차가 향한 방향과 카메라 방향의 각도로 밝기(뒤에서 보면 0), 거리에 따라 번짐 크기 제한
function updateCarLights(){
  carRegistry.forEach(car => { const g = car.group, m = g.userData.model; if(!m || !g.visible) return; const u = m.material.userData.u; const st = g.userData.lights;
    const night = NIGHT, brake = st.brake ? 1 : 0, bl = st.blink;
    if(u){ u.uLamp.value.set(night ? 1 : 0, brake, night ? 1 : 0, night ? 0 : 1); u.uBlink.value.set(bl === -1 || bl === 2 ? 1 : 0, bl === 1 || bl === 2 ? 1 : 0); }
    _cf.set(-Math.sin(g.rotation.y), 0, -Math.cos(g.rotation.y));   // 차 앞 방향(three rotation.y)
    _cv.copy(camera.position).sub(g.position); const dist = _cv.length(); _cv.normalize();
    const face = Math.max(0, _cf.dot(_cv)), k = night ? Math.pow(face, 1.5)*Math.min(1, 12/Math.max(dist, 6) + .35) : 0;   // 앞에서 볼 때만, 멀면 작게
    g.children.forEach(ch => { if(ch.userData.glow){ ch.visible = night && k > .02; ch.material.opacity = k; } else if(ch.userData.fan){ ch.visible = night; } else if(ch.userData.brakePool){ ch.visible = night && !!brake; } });
  });
}
function loadCarModels(){
  if(!THREE.GLTFLoader){ console.warn('GLTFLoader 없음 → 코드 차량 메시'); return; }
  const loader = new THREE.GLTFLoader();
  const sizes = {sedan:CAR_TYPES.sedan, suv:CAR_TYPES.suv, hatch:CAR_TYPES.hatch, truck:CAR_TYPES.truck, bus:{L:11.4, W:2.5}};
  Object.entries(sizes).forEach(([type, T]) => loader.load(`assets/models/${type}.glb`, g => {
    let mesh = null; g.scene.updateMatrixWorld(true); g.scene.traverse(o => { if(o.isMesh && !mesh) mesh = o; }); if(!mesh) return;
    const geo = alignModelGeo(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld), T.L, T.W);
    CAR_MODELS[type] = {geo, mat:mesh.material};
    carRegistry.filter(c => c.type === type).forEach(applyCarModel);
  }, undefined, () => console.warn('차량 모델을 못 불러와 코드 메시로 둠:', type)));
}
// 옆 차로에서 다가오는 차 (위험 상황 시연용)
const otherCar = makeCar('sedan', '#e8eaec', false);
// 정체 대기열: 목표 차로에 늘어선 차들. 서 있는 차라 브레이크등을 켠다
const QTYPES = ['sedan','suv','hatch','sedan','truck','suv','sedan','hatch','suv','sedan','truck'];
const QCOLORS = ['#f4f5f4','#1c1e22','#a4a9af','#f4f5f4','#f4f5f4','#5b6169','#233b5c','#f4f5f4','#7d2222','#c9ccd0','#f4f5f4','#2e3440','#f4f5f4'];
const queueCars = Array.from({length:22}, (_,i) => makeCar(QTYPES[i%QTYPES.length], QCOLORS[i%QCOLORS.length], true));
loadCarModels();


/* ---------- 주간 · 야간 ----------
   실험에 걸린 것(도로 · 표지판 위치와 문구 · 차량)은 그대로, 하늘 · 빛 · 발광만 바꾼다.
   밤: 달빛 + 내 차 전조등 + 가로등 불빛 웅덩이 · 표지판과 차선은 살짝 발광(실제 재귀반사처럼) · 앞차 미등 */
const LIGHT = {
  day:  {top:'#3f78cc', horizon:'#d4dee7', ground:'#a3aeb4', dir:SUN_DIR, sunCol:'#fff0d4', haloK:.18, discPow:900, discK:20, stars:0, cloudK:1, cloudLo:[.70,.74,.80], cloudHi:[1.05,1.05,1.05],
         hemi:['#cfe0fa','#5a6a42',.82], sun:['#fff1dc',1.8], exposure:.92, fog:[110,950], far:'#ffffff', head:0, lamp:.15, refl:.35, paint:0, sign:0, win:0, tail:.7, brake:1.5, headlamp:.18, ind:1.6, carShadow:1},   // D105: 간접광 .6 → .82 · 하늘색 더 푸르게(그림자 속이 파르스름), 해 2.0 → 1.8
  night:{top:'#02040a', horizon:'#141c2b', ground:'#06080b', dir:MOON_DIR, sunCol:'#3c4658', haloK:.025, discPow:12000, discK:60, stars:1, cloudK:.75, cloudLo:[.010,.012,.017], cloudHi:[.03,.034,.045],
         hemi:['#4a5a7a','#10140e',.32], sun:['#a9bce8',.2], exposure:.95, fog:[55,620], far:'#0c1018', head:1.8, lamp:5, refl:2.2, paint:.07, sign:.5, win:1.3, tail:2.2, brake:2.6, headlamp:3, ind:3, carShadow:.45}   // D105: 달빛 그림자 .28 → .2(아주 옅게) · 차 밑 그림자 45%
};
function applySky(L){
  const u = skyMat.uniforms;
  u.top.value = lin(L.top); u.horizon.value = lin(L.horizon); u.ground.value = lin(L.ground); u.sunDir.value = L.dir; u.sunCol.value = lin(L.sunCol);
  u.haloK.value = L.haloK; u.discPow.value = L.discPow; u.discK.value = L.discK; u.stars.value = L.stars; u.cloudK.value = L.cloudK; u.cloudLo.value.set(...L.cloudLo); u.cloudHi.value.set(...L.cloudHi);
}
// 하늘을 반사·간접광으로 (차 도장·유리·가드레일에 하늘이 비친다) — 낮 · 밤 하늘을 미리 하나씩 구워 둔다
const envOf = {};
(() => {
  const pm = new THREE.PMREMGenerator(renderer), s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat));
  for(const k of ['night','day']){ applySky(LIGHT[k]); envOf[k] = pm.fromScene(s).texture; }
  pm.dispose();
})();
function setSceneLight(night){
  const L = LIGHT[night ? 'night' : 'day'];
  NIGHT = night; applySky(L); lightDir = L.dir;
  scene.environment = envOf[night ? 'night' : 'day'];
  scene.fog.color.copy(lin(L.horizon)); scene.fog.near = L.fog[0]; scene.fog.far = L.fog[1];
  hemi.color.copy(lin(L.hemi[0])); hemi.groundColor.copy(lin(L.hemi[1])); hemi.intensity = L.hemi[2];
  sun.color.copy(lin(L.sun[0])); sun.intensity = L.sun[1];
  renderer.toneMappingExposure = L.exposure;
  farMats.forEach(mt => mt.color.copy(lin(L.far)));
  headlight.intensity = L.head;
  lampMat.emissiveIntensity = L.lamp; reflMat.emissiveIntensity = L.refl; paint.emissiveIntensity = L.paint;
  signMats.forEach(mt => mt.emissiveIntensity = L.sign); facadeMat.emissiveIntensity = L.win;
  carMats.tail.emissiveIntensity = L.tail; carMats.brake.emissiveIntensity = L.brake; carMats.head.emissiveIntensity = L.headlamp; carMats.indOn.emissiveIntensity = L.ind; carMats.shadow.opacity = L.carShadow;
  nightOnly.forEach(o => o.visible = night);
  // 나무 · 잎 색 (D105): 평평한 빛의 사진이라 낮엔 살짝 눌러 잔디와 맞추고, 밤엔 달빛 색으로 어둡게 (예전엔 밤에 잎이 낮처럼 밝았음)
  const treeTint = lin(night ? '#55627a' : '#d9ddd0'); treeKinds.forEach(k => k.mat.color.copy(treeTint)); if(typeof PROPS !== 'undefined') PROPS.leafMat.color.copy(treeTint);
  if(typeof cityLight === 'function') cityLight(night);   // 일반도로 건물 창 · 노란 칠 · 길바닥 화살표 (city.js)
}
setSceneLight(false);

/* ---------- 매 프레임 렌더: 하늘은 카메라를 따라가고, 그림자 범위는 카메라 앞 35m를 중심으로 ---------- */
const _fwd = new THREE.Vector3();
function renderScene(){
  sky.position.copy(camera.position);
  camera.getWorldDirection(_fwd);
  const cx = camera.position.x + _fwd.x*35, cz = camera.position.z + _fwd.z*35;
  sun.target.position.set(cx, 0, cz);
  sun.position.set(cx + lightDir.x*200, lightDir.y*200, cz + lightDir.z*200);
  // 전조등: 범퍼 높이에서 앞 30m 노면을 겨눔
  headlight.position.set(camera.position.x + _fwd.x*1.5, .7, camera.position.z + _fwd.z*1.5);
  headlight.target.position.set(camera.position.x + _fwd.x*30, 0, camera.position.z + _fwd.z*30);
  updateCarLights();
  renderer.render(scene, camera);
  // 실내는 2026-11-07(D111)부터 WebGL 밖 이미지 층(cabin.js, #cabin) — 여기서 그리지 않음
  // 룸미러 · 사이드미러 (mirrors.js): 같은 장면을 뒤 보기 카메라로 따로 그려 맨 위에 얹음. 프레임 시간을 넘겨 느리면 번갈아 갱신
  const now = performance.now(); renderScene.ms = now - (renderScene.last || now); renderScene.last = now;
  if(!PERF.fixed && PERF.tier < PERF.tiers.length - 1 && document.visibilityState === 'visible'){
    if(renderScene.ms > 25) PERF.slow++;
    if(++PERF.n >= 90){ if(PERF.slow*2 > PERF.n){ PERF.tier++; applyDpr(); } PERF.n = PERF.slow = 0; }
  }
  if(typeof MIR !== 'undefined') MIR.render(PERF.tier > 0);
}

/* ---------- 캔버스 크기 ---------- */
function resize(){
  const w = cab.clientWidth, h = cab.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w/Math.max(1,h); camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(cab); resize();
