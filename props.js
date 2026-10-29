/* ============================================================
   props.js — 입체 소품 (2026-10-29): 3D 가로수 · 버스 정류장 · 연석 · 갓길 콘크리트 띠
   · 가로수: 줄기(가늘어지는 원기둥) + 가지 4개 + 수관 = 잎 덩어리 9개(각각 엇갈린 판 3장, Higgsfield 잎 텍스처 assets/tex/leaves.png).
     모양이 다른 3종을 인스턴스로 심고, 자리 · 크기 · 방향 · 색을 흔들어 반복이 드러나지 않게. 판 하나짜리 그림이 아니라 돌면서 보면 입체로 보임
   · 버스 정류장: 기둥 · 기울어진 지붕 · 뒤/옆 유리(틀) · 의자 · 노선 표지 기둥 · 광고 상자(밤에 켜짐, 글자 없음)
   · Higgsfield 3D 생성(tripo)으로 나무 · 정류장을 만들어 봤으나(2026-10-29) 형태가 뭉개져 쓰지 않음 — 04_리서치 AI 생성 기록
   scene.js · cabin.js 다음, city.js 전에 로드. 맵을 지을 때(scene.js buildMapScene · city.js buildCityScene) 부른다
   ============================================================ */

const PROPS = (() => {
  const barkMat = new THREE.MeshStandardMaterial({color:lin('#5f5348'), roughness:.95});
  const leafFallback = canvasTex(128, 128, (g, w, h) => {   // 잎 텍스처를 못 불러왔을 때: 잎 점 덩어리
    for(let i = 0; i < 900; i++){ const a = Math.random()*6.3, r = Math.sqrt(Math.random())*w*.46, k = .6 + Math.random()*.5;
      g.fillStyle = `rgb(${54*k|0},${92*k|0},${40*k|0})`; g.beginPath(); g.ellipse(w/2 + Math.cos(a)*r, h/2 + Math.sin(a)*r, 4, 2.4, a, 0, 6.3); g.fill(); }
  });
  const leafMat = new THREE.MeshStandardMaterial({map:leafFallback, alphaTest:.42, side:THREE.DoubleSide, roughness:.9, envMapIntensity:.25});
  const leafDepth = new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking, map:leafFallback, alphaTest:.42});
  // 잎 덩어리 판이 네모로 보이지 않게: 불러온 잎 그림에 들쭉날쭉한 둥근 가장자리(잡음 섞인 원)를 곱함
  loadTex('assets/tex/leaves.png', t => {
    const img = t.image, c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), W = c.width, H = c.height;
    for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
      const dx = (x - W/2)/(W/2), dy = (y - H/2)/(H/2), a = Math.atan2(dy, dx), r = Math.hypot(dx, dy), edge = .78 + .14*Math.sin(a*5 + 1.3) + .08*Math.sin(a*11);
      if(r > edge) d.data[(y*W + x)*4 + 3] = 0; else if(r > edge - .12) d.data[(y*W + x)*4 + 3] *= (edge - r)/.12;
    }
    g.putImageData(d, 0, 0);
    const ct = new THREE.CanvasTexture(c); ct.encoding = THREE.sRGBEncoding; ct.anisotropy = MAX_ANISO;
    leafMat.map = ct; leafDepth.map = ct; leafMat.needsUpdate = leafDepth.needsUpdate = true;
  });

  // 나무 한 그루 모양 (원점 = 밑동, 높이 ≈ 8m). r: 이 모양만의 난수
  function treeShape(R){
    const trunk = [], crown = [], up = new THREE.Vector3(0, 1, 0);
    const limb = (from, dir, len, r0, r1) => {   // from에서 dir로 len만큼 가늘어지는 원기둥
      const g = new THREE.CylinderGeometry(r1, r0, len, 7, 1, true); g.translate(0, len/2, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
      trunk.push([g, M4().compose(from, q, new THREE.Vector3(1, 1, 1))]);
      return from.clone().add(dir.clone().normalize().multiplyScalar(len));
    };
    const lean = new THREE.Vector3((R() - .5)*.12, 1, (R() - .5)*.12), top = limb(new THREE.Vector3(0, 0, 0), lean, 3.3 + R()*.6, .2, .14);
    const tips = [limb(top, new THREE.Vector3((R() - .5)*.2, 1, (R() - .5)*.2), 2.2, .14, .08)];
    const nb = 4;
    for(let b = 0; b < nb; b++){
      const a = b*2*Math.PI/nb + R()*.8, tilt = .55 + R()*.35, d = new THREE.Vector3(Math.cos(a)*Math.sin(tilt), Math.cos(tilt), Math.sin(a)*Math.sin(tilt));
      const start = top.clone().add(new THREE.Vector3(0, -.3 + R()*.6, 0));
      tips.push(limb(start, d, 1.8 + R()*.9, .1, .05));
    }
    // 잎 덩어리: 가지 끝마다 + 사이를 채움. 덩어리 하나 = 엇갈린 판 3장, 법선은 수관 가운데에서 바깥으로(부드러운 음영)
    const center = top.clone().add(new THREE.Vector3(0, 1.6, 0)), spots = tips.slice();
    for(let i = 0; i < 4; i++) spots.push(center.clone().add(new THREE.Vector3((R() - .5)*2.6, (R() - .3)*1.8, (R() - .5)*2.6)));
    spots.forEach(c => {
      const s = 2.3 + R()*1.1;
      for(let k = 0; k < 3; k++){
        const g = new THREE.PlaneGeometry(s, s*.85), rot = M4().makeRotationY(k*Math.PI/3 + R()*.5).multiply(M4().makeRotationX((R() - .5)*.6));
        g.applyMatrix4(rot); g.translate(c.x, c.y, c.z);
        const pos = g.attributes.position, nor = g.attributes.normal, v = new THREE.Vector3();
        for(let i = 0; i < pos.count; i++){ v.set(pos.getX(i) - center.x, (pos.getY(i) - center.y)*.8 + .5, pos.getZ(i) - center.z).normalize(); nor.setXYZ(i, v.x, v.y, v.z); }
        crown.push([g, M4()]);
      }
    });
    return {trunk:merge(trunk), crown:merge(crown)};
  }
  const shapes = [11, 23, 37].map(sd => { let a = sd; const R = () => { a = (a*16807) % 2147483647; return (a - 1)/2147483646; }; return treeShape(R); });

  /* 나무 심기: spots = [[x, y, z, 크기, 방향]] → 모양 3종 인스턴스. 반환: 그룹에 넣은 메시 목록 */
  function plantTrees(group, spots, rnd){
    const by = shapes.map(() => []);
    spots.forEach(sp => by[Math.floor(rnd()*shapes.length)].push(sp));
    const d = new THREE.Object3D(), c = new THREE.Color();
    by.forEach((list, k) => {
      if(!list.length) return;
      const tr = new THREE.InstancedMesh(shapes[k].trunk, barkMat, list.length), cr = new THREE.InstancedMesh(shapes[k].crown, leafMat, list.length);
      cr.customDepthMaterial = leafDepth;
      list.forEach(([x, y, z, s, a], i) => {
        d.position.set(x, y, z); d.rotation.set(0, a, 0); d.scale.set(s*(.9 + rnd()*.2), s, s*(.9 + rnd()*.2)); d.updateMatrix();
        tr.setMatrixAt(i, d.matrix); cr.setMatrixAt(i, d.matrix);
        cr.setColorAt(i, c.setRGB(.72 + rnd()*.24, .78 + rnd()*.2, .66 + rnd()*.22));
      });
      tr.castShadow = cr.castShadow = true; tr.receiveShadow = cr.receiveShadow = true;
      group.add(tr, cr);
    });
  }

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
  const concrete = new THREE.MeshStandardMaterial({color:lin('#a8a59d'), roughness:.9, polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1});
  function curbs(group, segs){
    const parts = [];
    segs.forEach(([x0, z0, x1, z1]) => {
      const len = Math.hypot(x1 - x0, z1 - z0); if(len < .05) return;
      const g = new THREE.BoxGeometry(.2, .17, len); g.translate(0, .085, 0);
      parts.push([g, M4().makeRotationY(Math.atan2(x1 - x0, z1 - z0)).premultiply(M4().makeTranslation((x0 + x1)/2, 0, (z0 + z1)/2))]);
    });
    if(parts.length){ const m = new THREE.Mesh(merge(parts), curbMat); m.receiveShadow = true; m.castShadow = true; group.add(m); }
  }
  return {plantTrees, shelter, curbs, concrete, night, leafMat};
})();
