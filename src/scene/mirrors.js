/* ============================================================
   mirrors.js — 실내 룸미러 (2026-10-29, hud-refine 브랜치의 미러 구현에서 룸미러만 가져옴. 좌우 사이드미러는 없음)
   · 같은 3D 장면을 내 차 자리의 '뒤 보기' 카메라로 따로 그려(렌더 타깃) 화면 위 가운데에 거울 모양으로 얹는다 → 고정 그림 · 영상 없음
   · 거울처럼 가로로 뒤집는다: 뒤를 보는 카메라의 왼쪽 = 차의 오른쪽 → 뒤집으면 오른쪽 뒤 차가 거울 오른쪽에 (실제 거울과 같음)
   · HUD(SVG) · 실내(cabinScene) · 안내 카드는 이 장면에 없어서 거울에 비치지 않고, 거울은 장면 밖이라 자기 자신을 비추지 않는다
   · 카메라는 운전자 눈 카메라(main.js가 매 프레임 놓음)에서 차 중심 · 방향을 구해 따라감 — 시연 · 주행 테스트, 현대 HUD · 우리 HUD 모두 같음
   · 늘 켬 (2026-11-07: ?mirrors=0 · 연구자 설정 체크박스 삭제 — 실험 조건 고정). 거울에 비치는 수평 화각은 추정값 [가정] 42°
   · 자리 · 크기 (D115, 2026-11-07 저녁, 12_운전석_실내_설계.md 0-4절): 실내 이미지(cabin.js LAY)의 거울 받침(이미지 x 0.61 · 아래끝 y 0.054) 바로 밑에 매달림 → 창 크기가 바뀌어도 이미지와 같이 움직임.
     크기는 실제 거울 가로 270mm · 세로 70mm [가정]를 눈에서 650mm [가정]에서 본 각도(가로 23.5° · 세로 6.2°)를 세로 화각 58°로 px로 — 창 세로 H의 0.374 · 0.097.
     받침 자리 검산: 차 가운데선은 눈에서 오른쪽 DRIVER_X .37m → atan(.37/.65) = 29.6° → 화면 중심 오른쪽 0.51H. 이미지 받침은 기준점(0.39)에서 0.22·iw = 0.51H. 맞음
   scene.js renderScene()이 매 프레임 MIR.render(half)를 부른다 — half면(느린 기기, scene.js PERF) 거울 그림은 두 프레임에 한 번만 새로 그림. cabin.js 다음에 로드, cabin.js layoutCabin()이 MIR.layout()을 부른다
   ============================================================ */

const MIR = {on:true, hfov:42, mmW:270, mmH:70, eyeD:650, imgX:.61, imgTop:.0536, pos:[0, 1.3, .15], pitch:-.025};
(() => {
  const ortho = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1), over = new THREE.Scene();
  const vert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  // 거울 유리 + 테: 둥근 사각형 바깥은 버림, 테 안쪽에 그림(가로 뒤집기)
  const frag = `
    varying vec2 vUv; uniform sampler2D tex; uniform vec2 size; uniform float rad, bezel, dim;
    float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
    void main(){
      vec2 p = (vUv - .5)*size, hs = size*.5;
      float dOut = sdBox(p, hs - 1.0, rad);
      if(dOut > 0.0) discard;
      float dIn = sdBox(p, hs - bezel, max(rad - bezel*.6, 2.0));
      vec3 housing = mix(vec3(.075, .08, .09), vec3(.16, .17, .19), smoothstep(-hs.y, hs.y, p.y));
      if(dIn > 0.0){ gl_FragColor = vec4(housing * (dIn > bezel - 2.0 ? .7 : 1.0) * dim, 1.0); return; }
      vec2 uv = vec2(1.0 - vUv.x, vUv.y);                       // 거울: 가로 뒤집기
      vec3 c = texture2D(tex, uv).rgb * .9;                     // 거울 반사율 ≈ 90%
      float vig = 1.0 - smoothstep(-18.0, 0.0, dIn); c *= mix(.82, 1.0, vig);
      float edge = smoothstep(-1.5, 0.0, dIn); c = mix(c, vec3(.02), edge*.8);
      gl_FragColor = vec4(c, 1.0);
    }`;
  const cam = new THREE.PerspectiveCamera(30, 3.86, .6, 1400);   // 비율 · 화각은 MIR.layout이 다시 놓음
  const rt = new THREE.WebGLRenderTarget(64, 32, {minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter});
  rt.texture.encoding = THREE.sRGBEncoding;
  const mat = new THREE.ShaderMaterial({uniforms:{tex:{value:rt.texture}, size:{value:new THREE.Vector2(1, 1)}, rad:{value:10}, bezel:{value:5}, dim:{value:1}},
    vertexShader:vert, fragmentShader:frag, depthTest:false, depthWrite:false});
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); quad.renderOrder = 2; over.add(quad);
  // 화면 크기가 바뀌면(cabin.js layoutCabin이 부름): 거울 자리(css px, 실내 이미지 받침 밑) · 크기(각도) · 렌더 타깃 해상도(DPR, 최대 1.5배) · 카메라 화각. 기둥 · 센서 덮개는 이미지에 있음(D115: 코드 네모 삭제)
  MIR.layout = () => {
    const W = cab.clientWidth, H = cab.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const L = (typeof LAY !== 'undefined' && LAY) ? LAY : {left:0, top:0, iw:W, ih:H};
    ortho.right = W; ortho.top = H; ortho.updateProjectionMatrix();
    const ppt = H/(2*Math.tan(camera.fov*Math.PI/360));                       // 1 tan 단위 = ppt px (세로 화각 58°)
    const w = Math.round(MIR.mmW/MIR.eyeD*ppt), h = Math.round(MIR.mmH/MIR.eyeD*ppt);
    const cx = L.left + MIR.imgX*L.iw, topY = L.top + MIR.imgTop*L.ih, cy = H - (topY + h/2);   // ortho y는 아래가 0
    MIR.box = {w, h, cx, cy, topY};
    quad.position.set(cx, cy, 0); quad.scale.set(w, h, 1);
    mat.uniforms.size.value.set(w, h); mat.uniforms.rad.value = h*.42; mat.uniforms.bezel.value = Math.max(3, Math.round(w*.022));
    rt.setSize(Math.max(32, Math.round(w*dpr)), Math.max(16, Math.round(h*dpr)));
    cam.aspect = w/h; cam.fov = 2*Math.atan(Math.tan(MIR.hfov*Math.PI/360)/cam.aspect)*180/Math.PI; cam.updateProjectionMatrix();
  };
  MIR.layout();
  // 운전자 눈 카메라 → 차 앞 방향(수평) · 차 중심(눈은 중심에서 왼쪽 DRIVER_X) → 거울 자리에서 뒤를 봄
  const _d = new THREE.Vector3(), _t = new THREE.Vector3();
  MIR.aim = () => {
    camera.getWorldDirection(_d); const l = Math.hypot(_d.x, _d.z) || 1, fx = _d.x/l, fz = _d.z/l, rx = -fz, rz = fx;   // 앞 · 오른쪽
    const cx = camera.position.x + rx*DRIVER_X, cz = camera.position.z + rz*DRIVER_X, [ox, oy, oz] = MIR.pos;
    const px = cx + rx*ox + fx*oz, pz = cz + rz*ox + fz*oz;
    cam.position.set(px, oy, pz); _t.set(px - fx*10, oy + Math.tan(MIR.pitch)*10, pz - fz*10); cam.lookAt(_t);
  };
  MIR.cam = cam; MIR.rt = rt;
  let frameN = 0;
  MIR.render = (half) => {
    quad.visible = MIR.on;
    if(!MIR.on) return;
    const sm = renderer.shadowMap.autoUpdate;
    mat.uniforms.dim.value = NIGHT ? .35 : 1;   // 밤: 테 어둡게 · 비친 그림 그대로(장면이 이미 어두움)
    if(!half || (++frameN & 1)){   // 느리면 거울 그림은 한 프레임 걸러 갱신, 테 · 지난 그림은 매 프레임
      MIR.aim();
      renderer.shadowMap.autoUpdate = false;   // 그림자 맵은 앞 화면 것을 다시 씀
      renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null);
      renderer.shadowMap.autoUpdate = sm;
    }
    renderer.autoClear = false; renderer.clearDepth(); renderer.render(over, ortho); renderer.autoClear = true;
  };
})();
