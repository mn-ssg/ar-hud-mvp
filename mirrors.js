/* ============================================================
   mirrors.js — 룸미러 1 · 왼쪽/오른쪽 사이드미러 (2026-10-29)
   · 같은 3D 장면을 내 차 자리의 '뒤 보기' 카메라로 따로 그려(렌더 타깃) 화면 가장자리에 거울 모양으로 얹는다 → 고정 그림 · 영상 없음
   · 거울처럼 가로로 뒤집는다: 뒤를 보는 카메라의 왼쪽 = 차의 오른쪽 → 뒤집으면 오른쪽 뒤 차가 거울 오른쪽에 (실제 거울과 같음)
   · HUD(SVG) · 실내(cabinScene) · 안내 카드는 이 장면에 없어서 거울에 비치지 않고, 거울은 장면 밖이라 자기 자신을 비추지 않는다
   · 카메라는 main.js EGO(내 차 자세)를 따라감 → HUD · 판단(guide.js)과 같은 차가 보인다. 현대 HUD · 우리 HUD v1 · v2 모두 같은 미러
   · 성능: 그림자 맵은 앞 화면 것을 다시 씀. 프레임이 느리면(평균 > 24ms) 룸미러 · 사이드미러를 번갈아 갱신(각각 최소 2프레임에 1번)
   위치 · 화각은 실제 승용차 값에 맞춘 추정 [가정]: 운전석 평면 거울 수평 화각 ≈ 20°, 조수석 볼록 거울 ≈ 28°, 룸미러 ≈ 42°
   ============================================================ */

const MIR = {
  on:!/[?&]mirrors=0/.test(location.search),   // ?mirrors=0 이면 끔 (미러 전후 성능 비교용)
  slow:false, ema:16, frame:0,
  // 화면 자리: 운전석 영역(cab) 비율. side: 뒤 보기 방향을 바깥으로 돌리는 쪽(-1 왼쪽 · +1 오른쪽 · 0 룸미러)
  list:[
    {id:'room',  side:0,  hfov:42, w:.2,   asp:3.7,  cx:.555, cy:null, top:.022, pos:[0, 1.3, .15],   yaw:0,   pitch:-.025, body:0},
    {id:'left',  side:-1, hfov:20, w:.125, asp:1.75, cx:.07,  cy:.6,   pos:[-1.02, 1.02, .55], yaw:.17, pitch:-.035, body:1},
    {id:'right', side:1,  hfov:28, w:.125, asp:1.75, cx:.93,  cy:.6,   pos:[1.02, 1.0, .55],   yaw:.23, pitch:-.04,  body:1}
  ]
};
(() => {
  const ortho = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1), over = new THREE.Scene();
  const vert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  // 거울 유리 + 테: 둥근 사각형 바깥은 버림, 테 안쪽에 그림(가로 뒤집기), 사이드미러는 안쪽 가장자리에 내 차 옆면 띠
  const frag = `
    varying vec2 vUv; uniform sampler2D tex; uniform vec2 size; uniform float rad, bezel, body, dim, bodySide;
    float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
    void main(){
      vec2 p = (vUv - .5)*size, hs = size*.5;
      float dOut = sdBox(p, hs - 1.0, rad);
      if(dOut > 0.0) discard;
      float dIn = sdBox(p, hs - bezel, max(rad - bezel*.6, 2.0));
      vec3 housing = mix(vec3(.075, .08, .09), vec3(.16, .17, .19), smoothstep(-hs.y, hs.y, p.y));
      if(dIn > 0.0){ gl_FragColor = vec4(housing * (dIn > bezel - 2.0 ? .7 : 1.0), 1.0); return; }
      vec2 uv = vec2(1.0 - vUv.x, vUv.y);                       // 거울: 가로 뒤집기
      vec3 c = texture2D(tex, uv).rgb * .9 * dim;               // 거울 반사율 ≈ 90%
      float vig = 1.0 - smoothstep(-18.0, 0.0, dIn); c *= mix(.82, 1.0, vig);
      if(body > .5){                                            // 내 차 옆면 (안쪽 13%)
        float x = bodySide > 0.0 ? vUv.x : 1.0 - vUv.x;          // 0 = 안쪽 가장자리
        float k = 1.0 - smoothstep(.11, .13, x);
        vec3 paint = mix(vec3(.16, .17, .19), vec3(.42, .45, .49), smoothstep(.0, .13, x) * (1.0 - smoothstep(.3, .95, vUv.y))) * dim;
        c = mix(c, paint, k);
      }
      float edge = smoothstep(-1.5, 0.0, dIn); c = mix(c, vec3(.02), edge*.8);
      gl_FragColor = vec4(c, 1.0);
    }`;
  const stemMat = new THREE.MeshBasicMaterial({color:0x101215});
  // 거울을 차에 붙이는 부분 (2026-10-29): 사이드미러 = 화면 가장자리 문 쪽에서 거울 밑으로 오는 검은 받침(도어 삼각 패널), 룸미러 = 앞유리 위 센서 덮개
  const mountMat = new THREE.MeshBasicMaterial({vertexColors:true, side:THREE.DoubleSide, depthTest:false, depthWrite:false});
  const polyGeo = (pts, top, bot) => { const g = new THREE.BufferGeometry(), pos = [], col = [], ymin = Math.min(...pts.map(p => p[1])), ymax = Math.max(...pts.map(p => p[1]));
    for(let i = 1; i < pts.length - 1; i++) [pts[0], pts[i], pts[i+1]].forEach(([x, y]) => { pos.push(x, y, 0); const t = (y - ymin)/Math.max(1, ymax - ymin); col.push(bot[0] + (top[0] - bot[0])*t, bot[1] + (top[1] - bot[1])*t, bot[2] + (top[2] - bot[2])*t); });
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return g; };
  MIR.list.forEach(M => {
    M.cam = new THREE.PerspectiveCamera(30, M.asp, .6, 1400);
    M.rt = new THREE.WebGLRenderTarget(64, 32, {minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter});
    M.rt.texture.encoding = THREE.sRGBEncoding;   // 앞 화면과 같은 톤 매핑 · sRGB로 구워 두고 그대로 얹음
    M.mat = new THREE.ShaderMaterial({uniforms:{tex:{value:M.rt.texture}, size:{value:new THREE.Vector2(1, 1)}, rad:{value:10}, bezel:{value:5}, body:{value:M.body}, dim:{value:1}, bodySide:{value:M.side}},
      vertexShader:vert, fragmentShader:frag, depthTest:false, depthWrite:false});
    M.mount = new THREE.Mesh(new THREE.BufferGeometry(), mountMat); M.mount.renderOrder = 0; over.add(M.mount);
    M.quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), M.mat); M.quad.renderOrder = 2; over.add(M.quad);
    if(M.side === 0){ M.stem = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), stemMat); over.add(M.stem); }   // 룸미러 기둥 (앞유리 위로)
  });
  // 화면 크기가 바뀌면: 거울 자리(css px) · 렌더 타깃 해상도(DPR, 최대 1.5배) · 카메라 화각
  MIR.layout = () => {
    const W = cab.clientWidth, H = cab.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    ortho.right = W; ortho.top = H; ortho.updateProjectionMatrix();
    MIR.list.forEach(M => {
      const w = Math.round(W*M.w), h = Math.round(w/M.asp), cx = W*M.cx, cy = M.cy === null ? H - (H*M.top + h/2) : H*(1 - M.cy);   // ortho y는 아래가 0
      M.box = {w, h, cx, cy};
      M.quad.position.set(cx, cy, 0); M.quad.scale.set(w, h, 1);
      M.mat.uniforms.size.value.set(w, h); M.mat.uniforms.rad.value = M.side ? Math.min(h*.32, 30) : h*.42; M.mat.uniforms.bezel.value = Math.max(3, Math.round(w*.022));
      if(M.stem){ const top = H, y0 = cy + h/2 - 2; M.stem.position.set(cx, (top + y0)/2, 0); M.stem.scale.set(Math.max(6, w*.05), top - y0, 1); M.stem.renderOrder = 1; }
      const yc = H*(typeof cowlBottomPct === 'function' ? cowlBottomPct()/100 : .33), bot = cy - h/2, top = cy + h/2, dark = [.045, .05, .056], mid = [.1, .108, .118];
      let pts;
      if(M.side === 0) pts = [[cx - w*.13, H], [cx + w*.13, H], [cx + w*.08, H - Math.max(14, h*.32)], [cx - w*.08, H - Math.max(14, h*.32)]];      // 센서 덮개
      else { const e = M.side < 0 ? 0 : W, sgn = M.side < 0 ? 1 : -1, inner = cx - sgn*w*.5;
        pts = [[e, yc - 4], [e, top + h*.25], [e + sgn*w*.18, top + h*.05], [cx + sgn*w*.1, bot + h*.18], [inner + sgn*w*.95, yc - 4]]; }    // 도어 삼각 패널
      M.mount.geometry.dispose(); M.mount.geometry = polyGeo(pts, M.side === 0 ? mid : dark, M.side === 0 ? dark : mid);
      M.rt.setSize(Math.max(32, Math.round(w*dpr)), Math.max(16, Math.round(h*dpr)));
      M.cam.aspect = w/h; M.cam.fov = 2*Math.atan(Math.tan(M.hfov*Math.PI/360)/M.cam.aspect)*180/Math.PI; M.cam.updateProjectionMatrix();
    });
  };
  new ResizeObserver(() => MIR.layout()).observe(cab); MIR.layout();
  // 내 차 자세 → 거울 카메라: 차 기준 위치(오른쪽 x · 위 y · 앞 z) + 뒤를 보되 바깥으로 yaw, 아래로 pitch
  const _t = new THREE.Vector3();
  function aim(M){
    const fx = Math.sin(EGO.psi), fz = -Math.cos(EGO.psi), rx = -fz, rz = fx;   // 앞 · 오른쪽
    const [ox, oy, oz] = M.pos, px = EGO.x + rx*ox + fx*oz, pz = EGO.z + rz*ox + fz*oz;
    const dx = -fx*Math.cos(M.yaw) + M.side*rx*Math.sin(M.yaw), dz = -fz*Math.cos(M.yaw) + M.side*rz*Math.sin(M.yaw);
    M.cam.position.set(px, oy, pz); _t.set(px + dx*10, oy + Math.tan(M.pitch)*10, pz + dz*10); M.cam.lookAt(_t);
  }
  MIR.aim = aim;
  MIR.render = (frameMs) => {
    if(!MIR.on || typeof EGO === 'undefined') return;
    MIR.ema += (frameMs - MIR.ema)*.05; MIR.slow = MIR.ema > 24; MIR.frame++;
    const dim = NIGHT ? .92 : 1, sm = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    MIR.list.forEach((M, i) => {
      M.mat.uniforms.dim.value = dim;
      if(MIR.slow && ((MIR.frame + (i ? 1 : 0)) % 2)) return;   // 느리면 룸미러 ↔ 사이드미러 번갈아
      aim(M); renderer.setRenderTarget(M.rt); renderer.render(scene, M.cam);
    });
    renderer.setRenderTarget(null); renderer.shadowMap.autoUpdate = sm;
    renderer.autoClear = false; renderer.clearDepth(); renderer.render(over, ortho); renderer.autoClear = true;
  };
})();
// 미러 화면 자리(css px, 운전석 영역 기준) — 시각 검수 · 테스트용
const mirrorBoxes = () => MIR.list.map(M => ({id:M.id, ...M.box}));
