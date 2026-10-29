/* ============================================================
   mirrors.js — 실내 룸미러 (2026-10-29, hud-refine 브랜치의 미러 구현에서 룸미러만 가져옴. 좌우 사이드미러는 없음)
   · 같은 3D 장면을 내 차 자리의 '뒤 보기' 카메라로 따로 그려(렌더 타깃) 화면 위 가운데에 거울 모양으로 얹는다 → 고정 그림 · 영상 없음
   · 거울처럼 가로로 뒤집는다: 뒤를 보는 카메라의 왼쪽 = 차의 오른쪽 → 뒤집으면 오른쪽 뒤 차가 거울 오른쪽에 (실제 거울과 같음)
   · HUD(SVG) · 실내(cabinScene) · 안내 카드는 이 장면에 없어서 거울에 비치지 않고, 거울은 장면 밖이라 자기 자신을 비추지 않는다
   · 카메라는 운전자 눈 카메라(main.js가 매 프레임 놓음)에서 차 중심 · 방향을 구해 따라감 — 시연 · 주행 테스트, 현대 HUD · 우리 HUD 모두 같음
   · ?mirrors=0 이면 끔. 위치 · 화각은 추정값 [가정]: 수평 화각 ≈ 42°
   scene.js renderScene()이 매 프레임 MIR.render()를 부른다. cabin.js 다음에 로드
   ============================================================ */

const MIR = {on:!/[?&]mirrors=0/.test(location.search), hfov:42, w:.2, asp:3.7, cx:.555, top:.022, pos:[0, 1.3, .15], pitch:-.025};
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
  const cam = new THREE.PerspectiveCamera(30, MIR.asp, .6, 1400);
  const rt = new THREE.WebGLRenderTarget(64, 32, {minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter});
  rt.texture.encoding = THREE.sRGBEncoding;
  const mat = new THREE.ShaderMaterial({uniforms:{tex:{value:rt.texture}, size:{value:new THREE.Vector2(1, 1)}, rad:{value:10}, bezel:{value:5}, dim:{value:1}},
    vertexShader:vert, fragmentShader:frag, depthTest:false, depthWrite:false});
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); quad.renderOrder = 2; over.add(quad);
  const darkMat = new THREE.MeshBasicMaterial({color:0x101215, depthTest:false, depthWrite:false});
  const stem = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), darkMat); stem.renderOrder = 1; over.add(stem);     // 거울 기둥
  const cover = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), darkMat); cover.renderOrder = 1; over.add(cover);  // 앞유리 위 센서 덮개
  // 화면 크기가 바뀌면: 거울 자리(css px) · 렌더 타깃 해상도(DPR, 최대 1.5배) · 카메라 화각
  MIR.layout = () => {
    const W = cab.clientWidth, H = cab.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    ortho.right = W; ortho.top = H; ortho.updateProjectionMatrix();
    const w = Math.round(W*MIR.w), h = Math.round(w/MIR.asp), cx = W*MIR.cx, cy = H - (H*MIR.top + h/2);   // ortho y는 아래가 0
    MIR.box = {w, h, cx, cy};
    quad.position.set(cx, cy, 0); quad.scale.set(w, h, 1);
    mat.uniforms.size.value.set(w, h); mat.uniforms.rad.value = h*.42; mat.uniforms.bezel.value = Math.max(3, Math.round(w*.022));
    const y0 = cy + h/2 - 2; stem.position.set(cx, (H + y0)/2, 0); stem.scale.set(Math.max(6, w*.05), H - y0, 1);
    const ch = Math.max(14, h*.32); cover.position.set(cx, H - ch/2, 0); cover.scale.set(w*.22, ch, 1);
    rt.setSize(Math.max(32, Math.round(w*dpr)), Math.max(16, Math.round(h*dpr)));
    cam.aspect = w/h; cam.fov = 2*Math.atan(Math.tan(MIR.hfov*Math.PI/360)/cam.aspect)*180/Math.PI; cam.updateProjectionMatrix();
  };
  new ResizeObserver(() => MIR.layout()).observe(cab); MIR.layout();
  // 운전자 눈 카메라 → 차 앞 방향(수평) · 차 중심(눈은 중심에서 왼쪽 DRIVER_X) → 거울 자리에서 뒤를 봄
  const _d = new THREE.Vector3(), _t = new THREE.Vector3();
  MIR.aim = () => {
    camera.getWorldDirection(_d); const l = Math.hypot(_d.x, _d.z) || 1, fx = _d.x/l, fz = _d.z/l, rx = -fz, rz = fx;   // 앞 · 오른쪽
    const cx = camera.position.x + rx*DRIVER_X, cz = camera.position.z + rz*DRIVER_X, [ox, oy, oz] = MIR.pos;
    const px = cx + rx*ox + fx*oz, pz = cz + rz*ox + fz*oz;
    cam.position.set(px, oy, pz); _t.set(px - fx*10, oy + Math.tan(MIR.pitch)*10, pz - fz*10); cam.lookAt(_t);
  };
  MIR.cam = cam; MIR.rt = rt;
  MIR.render = () => {
    quad.visible = stem.visible = cover.visible = MIR.on;
    if(!MIR.on) return;
    const sm = renderer.shadowMap.autoUpdate, k = NIGHT ? .25 : 1;
    darkMat.color.setRGB(.063*k, .07*k, .082*k); mat.uniforms.dim.value = NIGHT ? .35 : 1;
    MIR.aim();
    renderer.shadowMap.autoUpdate = false;   // 그림자 맵은 앞 화면 것을 다시 씀
    renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null);
    renderer.shadowMap.autoUpdate = sm;
    renderer.autoClear = false; renderer.clearDepth(); renderer.render(over, ortho); renderer.autoClear = true;
  };
})();
