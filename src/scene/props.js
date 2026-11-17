/* ============================================================
   props.js — 입체 소품 (2026-10-29): 버스 정류장 · 연석 · 갓길 콘크리트 띠
   · 가로수는 2026-11-17에 trees.js(Blender 모델)로 옮김 — 여기 있던 코드 나무(줄기 원기둥 + 잎 덩어리 판)는 삭제
   · 버스 정류장: 기둥 · 기울어진 지붕 · 뒤/옆 유리(틀) · 의자 · 노선 표지 기둥 · 광고 상자(밤에 켜짐, 글자 없음)
   scene.js · cabin.js 다음, city.js 전에 로드. 맵을 지을 때(scene.js buildMapScene · city.js buildCityScene) 부른다
   ============================================================ */

const PROPS = (() => {
  /* 버스 정류장: 길이 6.2m · 깊이 1.8m · 높이 2.7m. (x, z) = 가운데 바닥, back = 뒤판이 있는 쪽(+1 = +x) */
  const steel = new THREE.MeshStandardMaterial({color:lin('#4b535c'), metalness:.6, roughness:.4});
  const roofMat = new THREE.MeshStandardMaterial({color:lin('#d9dde0'), roughness:.5, metalness:.2});
  const glassMat = new THREE.MeshStandardMaterial({color:lin('#c6d6df'), transparent:true, opacity:.28, roughness:.05, metalness:.1, depthWrite:false});
  const benchMat = new THREE.MeshStandardMaterial({color:lin('#8a6a4a'), roughness:.7});
  const lightBox = new THREE.MeshStandardMaterial({color:lin('#e8ecef'), emissive:lin('#fff6e6'), emissiveIntensity:0, roughness:.4});
  const signMat = new THREE.MeshStandardMaterial({color:lin('#1f4f9c'), roughness:.6});
  function shelter(group, x, z, back){
    const g = new THREE.Group(), add = (geo, mat, px, py, pz, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; };
    const B = (w, h, d) => new THREE.BoxGeometry(w, h, d), L = 6.2, Dp = 1.8, H = 2.65;
    for(const sz of [-L/2 + .1, L/2 - .1]) for(const sx of [-Dp/2 + .08, Dp/2 - .08]) add(B(.07, H, .07), steel, sx, H/2, sz);
    const roof = add(B(Dp + .35, .1, L + .3), roofMat, 0, H + .05, 0); roof.rotation.z = -.05;
    add(B(Dp + .4, .14, .06), steel, 0, H - .02, -L/2 - .12); add(B(Dp + .4, .14, .06), steel, 0, H - .02, L/2 + .12);
    add(B(.02, 1.85, L - .3), glassMat, Dp/2 - .08, 1.2, 0, false);                          // 뒤 유리
    add(B(.05, .05, L - .3), steel, Dp/2 - .08, 2.15, 0); add(B(.05, .05, L - .3), steel, Dp/2 - .08, .26, 0);   // 유리 틀 위 · 아래
    add(B(Dp - .25, 1.85, .02), glassMat, .05, 1.2, -L/2 + .1, false);                         // 옆 유리
    add(B(.1, 1.75, 1.15), lightBox, Dp/2 - .1, 1.25, L/2 - .75);                             // 광고 상자 (글자 없음, 밤에 켜짐)
    add(B(.42, .05, 2.6), benchMat, Dp/2 - .4, .46, -.6); for(const bz of [-1.7, .5]) add(B(.36, .44, .05), steel, Dp/2 - .4, .22, bz);
    g.position.set(x, .15, z); g.rotation.y = back > 0 ? 0 : Math.PI; group.add(g);
    // 노선 표지 기둥 (도로 쪽 앞)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 2.9, 8), steel); pole.position.set(x - back*1.6, .15 + 1.45, z - L/2 - .8); pole.castShadow = true; group.add(pole);
    const plate = new THREE.Mesh(B(.04, .55, .4), signMat); plate.position.set(x - back*1.6, .15 + 2.6, z - L/2 - .8); group.add(plate);
  }
  const night = on => { lightBox.emissiveIntensity = on ? 1.1 : 0; };

  /* 연석: (x0, z0) → (x1, z1) 직선을 따라 폭 0.2m · 높이 0.17m (보도 면 0.15m보다 조금 높게) */
  const curbMat = new THREE.MeshStandardMaterial({color:lin('#b4b2ab'), roughness:.82});
  const concrete = new THREE.MeshStandardMaterial({color:lin('#8d8b84'), roughness:.92, polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1});   // 2026-11-07 D108: '#a8a59d' → 더 진한 콘크리트(햇빛에 흰 띠처럼 보였음)
  function curbs(group, segs){
    const parts = [];
    segs.forEach(([x0, z0, x1, z1]) => {
      const len = Math.hypot(x1 - x0, z1 - z0); if(len < .05) return;
      const g = new THREE.BoxGeometry(.2, .17, len); g.translate(0, .085, 0);
      parts.push([g, M4().makeRotationY(Math.atan2(x1 - x0, z1 - z0)).premultiply(M4().makeTranslation((x0 + x1)/2, 0, (z0 + z1)/2))]);
    });
    if(parts.length){ const m = new THREE.Mesh(merge(parts), curbMat); m.receiveShadow = true; m.castShadow = true; group.add(m); }
  }
  return {shelter, curbs, concrete, night};
})();

/* ---------- Blender 소품 모델 (2026-11-17, assets/models/props.glb — 원본 assets/blender/props.py · .blend): 가로등 2종 · 가드레일 기둥 ----------
   PROPM.place(group, 이름, x, y, z, 방향, 크기)로 자리를 모아 두면, 모델이 도착했을 때 이름 · 재질마다 인스턴스 한 덩어리로 만든다(가로등 수십 개 · 기둥 수백 개를 그리기 호출 몇 번에).
   재질은 glb의 재질 이름으로 장면 재질을 붙인다: galv(아연도금 강 — 가드레일과 같은 재질) · lens(등 렌즈 — 밤에 빛남, scene.js lampMat) · dark · refl.
   모델의 팔은 +x로 뻗는다 → 방향(y 회전)으로 도로 쪽에 맞춘다. 못 불러오면 그 소품 없이 진행(밤의 불빛 웅덩이 · 빛 번짐은 코드라 그대로) */
const PROPM = (() => {
  const models = {}, dirty = new Set(); let ready = false, timer = 0;
  const dark = new THREE.MeshStandardMaterial({color:lin('#24282d'), roughness:.6, metalness:.35});
  // 공사 구간 소품(2026-11-17 밤): 주황 플라스틱 · 흰 반사 띠 · 노란 판
  const coneMat = new THREE.MeshStandardMaterial({color:lin('#f2591c'), roughness:.55}), bandMat = new THREE.MeshStandardMaterial({color:lin('#eef0ec'), roughness:.35, emissive:lin('#ffffff'), emissiveIntensity:.08}), signMat = new THREE.MeshStandardMaterial({color:lin('#f0c11a'), roughness:.5});
  const matOf = n => ({galv, lens:lampMat, dark, refl:reflMat, cone:coneMat, band:bandMat, sign:signMat})[n] || galv;
  function flush(){
    timer = 0; if(!ready) return;
    dirty.forEach(group => { const pm = group.userData.pm; group.userData.pm = null; if(!pm) return;
      Object.entries(pm).forEach(([name, list]) => (models[name] || []).forEach(part => { const im = new THREE.InstancedMesh(part.geo, matOf(part.mat), list.length);
        list.forEach((mx, i) => im.setMatrixAt(i, mx)); im.receiveShadow = true; im.castShadow = /^(cone|barricade|work_sign)$/.test(name); im.frustumCulled = false; group.add(im); })); });
    dirty.clear();
  }
  const d = new THREE.Object3D();
  function place(group, name, x, y, z, rotY = 0, s = 1){
    d.position.set(x, y, z); d.rotation.set(0, rotY, 0); d.scale.setScalar(s); d.updateMatrix();
    const pm = group.userData.pm || (group.userData.pm = {}); (pm[name] = pm[name] || []).push(d.matrix.clone());
    dirty.add(group); if(ready && !timer) timer = setTimeout(flush, 0);
  }
  if(GLTF) GLTF.load('assets/models/props.glb', g => {   // Draco 압축본(2026-11-17 밤)
    g.scene.updateMatrixWorld(true);
    g.scene.traverse(o => { if(!o.isMesh) return; const name = o.parent && o.parent.isGroup && o.parent !== g.scene ? o.parent.name : o.name.replace(/_\d+$/, ''); const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); (models[name] = models[name] || []).push({geo, mat:o.material.name}); });
    ready = true; flush();
  }, undefined, () => console.warn('소품 모델(props.glb)을 못 불러옴 → 가로등 · 가드레일 기둥 없이 진행'));
  return {place, models, isReady:() => ready};
})();
