/* ============================================================
   trees.js — 나무 (3회차 MVP 작업 3, 2026-11-17): Blender로 만든 느티나무 3 · 소나무 3그루(assets/models/trees.glb, 원본 assets/blender/trees.py · .blend)
   · 예전: 도로 가까운 나무만 코드로 만든 입체(props.js), 나머지는 사진을 붙인 판(scene.js treeKinds) → 가까운 것과 먼 것이 다른 나무로 보였다(사용자: '어느 것만 하고 어느 것만 안 하면').
     지금: **모든 나무가 같은 모델**. 가까운 나무 = 모델 그대로(줄기 · 가지 · 잎 덩어리, 인스턴싱), 먼 나무 = 그 모델을 이 자리에서 한 번 찍어 만든 그림을 붙인 엇갈린 판(같은 생김새 · 같은 색)
   · 재질: 나무껍질 · 솔잎은 Higgsfield 생성 사진(assets/tex/bark_*.jpg · needles_pine.webp), 느티나무 잎은 예전 잎 덩어리 사진(leaves.webp). 잎은 꼭짓점 색으로 수관 안쪽이 어둡다
   · 모델은 늦게 도착한다(비동기) → plant · far는 자리 · 크기 · 색을 먼저 정해 두고, 모델이 오면 그때 인스턴스를 만든다. 맵의 난수(rnd)는 예전 코드와 같은 횟수만 쓴다 — 나무 뒤에 정해지는 것(먼 아파트 등)의 자리가 2차와 같게
   · 못 불러오면 나무 없이 진행(콘솔에 알림)
   scene.js · props.js 다음에 로드. scene.js buildMapScene · city.js buildCityScene이 부른다. 밤 색은 scene.js setSceneLight → TREES.tint
   ============================================================ */
const TREES = (() => {
  const KIND = {zelkova:{names:['zelkova_a', 'zelkova_b', 'zelkova_c'], h:8.6}, pine:{names:['pine_a', 'pine_b', 'pine_c'], h:13.4}};   // h: 모델 높이(m) — 심을 때 원하는 높이로 맞춤
  const mk = o => new THREE.MeshStandardMaterial(o);
  const M = {
    bark_zelkova:mk({color:lin('#8d857b'), roughness:.95}), bark_pine:mk({color:lin('#8a4f3c'), roughness:.95}),
    leaf_zelkova:mk({color:0xffffff, alphaTest:.42, side:THREE.DoubleSide, roughness:.85, envMapIntensity:.25, vertexColors:true}),
    leaf_pine:mk({color:0xffffff, alphaTest:.38, side:THREE.DoubleSide, roughness:.9, envMapIntensity:.2, vertexColors:true})
  };
  const depth = {leaf_zelkova:new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking, alphaTest:.42}), leaf_pine:new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking, alphaTest:.38})};
  const tex = (url, names, rep) => loadTex(url, t => { if(rep){ t.wrapS = t.wrapT = THREE.RepeatWrapping; } else t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    names.forEach(n => { M[n].map = t; M[n].color.set(0xffffff); M[n].needsUpdate = true; if(depth[n]){ depth[n].map = t; depth[n].needsUpdate = true; } }); rebake(); });
  tex('assets/tex/bark_zelkova.jpg', ['bark_zelkova'], true); tex('assets/tex/bark_pine.jpg', ['bark_pine'], true);
  tex('assets/tex/leaves.webp', ['leaf_zelkova']); tex('assets/tex/needles_pine.webp', ['leaf_pine']);

  const models = {}, queue = [], cards = {};   // models[이름] = {wood, leaf, box}, cards[이름] = {geo, mat, tex}
  let ready = false, tintNow = new THREE.Color(0xffffff);
  // 먼 나무용 그림: 모델을 옆에서 정사영으로 한 번 찍는다(투명 바탕). 빛은 거의 고르게 — 장면 빛이 판에 다시 비치므로 여기서 음영을 세게 넣으면 두 번 어두워진다
  function bake(name){
    const m = models[name], b = m.box, w = Math.max(b.max.x, -b.min.x, b.max.z, -b.min.z)*2, h = b.max.y;
    const sc = new THREE.Scene(); sc.add(new THREE.AmbientLight(0xffffff, .92)); const dl = new THREE.DirectionalLight(0xffffff, .35); dl.position.set(-.4, 1, .6); sc.add(dl);
    const wm = M[m.wood.mat].clone(), lm = M[m.leaf.mat].clone(); wm.color.set(0xffffff); lm.color.set(0xffffff);
    sc.add(new THREE.Mesh(m.wood.geo, wm), new THREE.Mesh(m.leaf.geo, lm));
    const cam = new THREE.OrthographicCamera(-w/2, w/2, h, 0, .1, 60); cam.position.set(0, 0, 30); cam.lookAt(0, 0, 0); cam.position.y = 0; cam.updateMatrixWorld();
    const H = 512, W = Math.max(128, Math.min(512, Math.pow(2, Math.round(Math.log2(H*w/h)))));
    const old = cards[name], rt = old ? old.rt : new THREE.WebGLRenderTarget(W, H, {minFilter:THREE.LinearMipmapLinearFilter, magFilter:THREE.LinearFilter, generateMipmaps:true});
    rt.texture.encoding = THREE.sRGBEncoding; rt.texture.anisotropy = MAX_ANISO;
    const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha(), tgt = renderer.getRenderTarget(), sm = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false; renderer.setRenderTarget(rt); renderer.setClearColor(0x39502c, 0); renderer.clear(); renderer.render(sc, cam);
    renderer.setRenderTarget(tgt); renderer.setClearColor(cc, ca); renderer.shadowMap.enabled = sm; wm.dispose(); lm.dispose();
    if(old) return;
    // 엇갈린 판 2장, 법선은 둥글게(덩어리처럼 빛을 받게)
    // 엇갈린 판 2장을 앞면 · 뒷면 따로(4장) — 양면 재질로 한 장만 쓰면 뒷면은 법선이 뒤집혀 한쪽 판만 어둡게 보인다(가까이서 두 색 상자처럼 보였음)
    const parts = [0, Math.PI/2, Math.PI, Math.PI*1.5].map(a => [new THREE.PlaneGeometry(w, h), M4().makeRotationY(a).multiply(M4().makeTranslation(0, h/2, 0))]), geo = merge(parts), p = geo.attributes.position, n = geo.attributes.normal, v = new THREE.Vector3();
    for(let i = 0; i < p.count; i++){ v.set(p.getX(i), (p.getY(i) - h*.6)*.7 + h*.35, p.getZ(i)).normalize(); n.setXYZ(i, v.x, v.y, v.z); }
    const mat = mk({map:rt.texture, alphaTest:.4, roughness:.95, envMapIntensity:.2, color:tintNow.clone()});
    cards[name] = {geo, mat, rt, depth:new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking, map:rt.texture, alphaTest:.5})};
  }
  function rebake(){ if(ready) Object.keys(models).forEach(bake); }
  if(THREE.GLTFLoader) new THREE.GLTFLoader().load('assets/models/trees.glb', g => {
    g.scene.updateMatrixWorld(true);
    g.scene.traverse(o => { if(!o.isMesh) return; const mm = /^(.+)_(wood|leaf)$/.exec(o.name); if(!mm) return; const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld);
      (models[mm[1]] = models[mm[1]] || {})[mm[2]] = {geo, mat:o.material.name}; });
    Object.values(models).forEach(m => { m.wood.geo.computeBoundingBox(); m.leaf.geo.computeBoundingBox(); m.box = m.wood.geo.boundingBox.clone().union(m.leaf.geo.boundingBox); });
    ready = true; rebake(); queue.splice(0).forEach(f => f());
  }, undefined, () => console.warn('나무 모델(trees.glb)을 못 불러옴 → 나무 없이 진행'));
  else console.warn('GLTFLoader 없음 → 나무 없이 진행');

  // 나무마다 쓰는 난수: 맵 난수와 따로(같은 자리 목록이면 늘 같은 나무)
  const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };
  const pick = (spots, kindOf, R, hOf) => spots.map((sp, i) => { const kind = kindOf(sp, i), K = KIND[kind]; return {sp, name:K.names[Math.floor(R()*K.names.length)], s:hOf(sp, kind, R)/K.h, w:.9 + R()*.2, rot:sp[4] !== undefined ? sp[4] : R()*6.3, col:[.8 + R()*.2, .84 + R()*.16, .76 + R()*.2]}; });
  // 같은 꼭짓점 버퍼를 쓰되 경계 구만 따로 가진 지오메트리(구역마다 화면 밖이면 통째로 안 그리게)
  const share = (geo, sphere) => { const g = new THREE.BufferGeometry(); g.attributes = geo.attributes; g.index = geo.index; g.groups = geo.groups; g.boundingSphere = sphere; g.userData.src = geo; return g; };
  const CELL = 180;   // 구역 한 변(m). 2026-11-17: 구역 없이 맵 전체를 한 덩어리로 그렸더니 삼각형이 4배(300만)로 늘어, 화면 · 그림자 범위 밖 구역은 건너뛰게 함
  function instances(group, list, far){
    const by = {}; list.forEach(t => { const k = far ? t.name : t.name + '|' + Math.floor(t.sp[0]/CELL) + '|' + Math.floor(t.sp[2]/CELL); (by[k] = by[k] || []).push(t); });   // 먼 나무 판은 가벼워서(그루당 삼각형 8개) 나누지 않는다 — 나누면 그리기 호출만 늘어 더 느림(재 봄)
    const d = new THREE.Object3D(), c = new THREE.Color(), v = new THREE.Vector3();
    Object.entries(by).forEach(([key, l]) => {
      const name = key.split('|')[0], m = models[name]; if(!m) return;
      const ctr = new THREE.Vector3(); l.forEach(t => ctr.add(v.set(t.sp[0], t.sp[1], t.sp[2]))); ctr.divideScalar(l.length);
      let r = 0; l.forEach(t => { r = Math.max(r, v.set(t.sp[0], t.sp[1], t.sp[2]).distanceTo(ctr) + 20*t.s*Math.max(1, t.w)); }); const sph = new THREE.Sphere(ctr, r);   // 20: 모델 원점에서 가장 먼 꼭짓점까지보다 넉넉히(높이 13.4m)
      const meshes = far ? [new THREE.InstancedMesh(share(cards[name].geo, sph), cards[name].mat, l.length)] : [new THREE.InstancedMesh(share(m.wood.geo, sph), M[m.wood.mat], l.length), new THREE.InstancedMesh(share(m.leaf.geo, sph), M[m.leaf.mat], l.length)];
      if(far) meshes[0].customDepthMaterial = cards[name].depth; else meshes[1].customDepthMaterial = depth[m.leaf.mat];
      l.forEach((t, i) => { d.position.set(t.sp[0], t.sp[1], t.sp[2]); d.rotation.set(0, t.rot, 0); d.scale.set(t.s*t.w, t.s, t.s*t.w); d.updateMatrix();
        meshes.forEach(q => q.setMatrixAt(i, d.matrix)); meshes[meshes.length - 1].setColorAt(i, c.setRGB(t.col[0], t.col[1], t.col[2])); });
      meshes.forEach((q, i) => { q.castShadow = true; q.receiveShadow = !far; q.userData.tree = far ? 'far' : i ? 'leaf' : 'wood'; q.frustumCulled = !far; group.add(q); });   // three r128의 InstancedMesh는 기본이 '항상 그림' → 구역 경계 구로 걸러내게 켠다
    });
  }
  /* 가까운 나무(모델 그대로). spots = [[x, y, z, 크기, 방향]] — 크기 1 = 느티나무 8m · 소나무 13m. kindOf(sp, i) → 'zelkova' | 'pine'
     rnd: 맵 난수 — 예전 코드가 쓰던 만큼 쓴다(입체 나무는 나무마다 6번 = per, 예전에 판 나무였던 자리는 7번) */
  function plant(group, spots, rnd, kindOf = () => 'zelkova', per = 6){
    for(let i = 0; i < spots.length*per; i++) rnd();
    const list = pick(spots, kindOf, rng(spots.length*7919 + 13), (sp, kind) => (kind === 'pine' ? 13 : 8)*(sp[3] || 1));
    const go = () => instances(group, list, false); if(ready) go(); else queue.push(go);
  }
  /* 먼 나무(엇갈린 판). spots = [[x, y, z]] — 높이는 예전 판 나무와 같은 범위(소나무 10 ~ 17m · 느티나무 8 ~ 12m). rnd는 예전처럼 나무마다 7번 */
  function far(group, spots, rnd, kindOf){
    for(let i = 0; i < spots.length*7; i++) rnd();
    const list = pick(spots, kindOf, rng(spots.length*104729 + 7), (sp, kind, R) => kind === 'pine' ? 10 + R()*7 : 8 + R()*4);
    const go = () => instances(group, list, true); if(ready) go(); else queue.push(go);
  }
  // 밤 · 낮 색 (scene.js setSceneLight)
  function tint(col){ tintNow.copy(col); ['leaf_zelkova', 'leaf_pine'].forEach(n => M[n].color.copy(col)); Object.values(cards).forEach(k => k.mat.color.copy(col)); }
  return {plant, far, tint, M, models, cards, isReady:() => ready};
})();
