/* ============================================================
   explain.js — 발표용 'HUD 설명 보기'
   HUD를 크게 키우고 층마다 이름표를 붙여, 정보 위계를 화면에서 바로 보여준다.
   HUD가 아니라 발표 자료다. 판단 테스트 중에는 저절로 꺼진다. main.js 다음에 로드.
   ============================================================ */
(() => {
  const btn = $('#explainBtn'), cabEl = $('#cab'), layer = $('#explain'), desc = $('#modeDesc');
  const MODE_DESC = {
    ar: '초보자용 정보 위계 — 들어갈 차로·경로 → 갈 방향 → 다음 행동까지 → 속도. 상태는 글자 없이 차로 강조·막대 길이와 색으로',
    nav: '현대 HUD 화면을 그대로 재현한 비교 기준(대조군)'
  };
  // side: 이름표를 HUD 왼쪽/오른쪽 어디에 둘지
  const NOTES = {
    ar: [
      {sel:'#laneFill', n:'1', t:'들어갈 차로 · 경로', s:'가장 크고 진하게 · 화살표가 상태', side:'L'},
      {sel:'#act', n:'2', t:'갈 방향', s:'다음 갈림에서 갈 쪽 · 글자 없음', side:'L'},
      {sel:'#cd', n:'3', t:'다음 행동까지', s:'길이 = 남은 거리 · 색 = 여유', side:'R'},
      {sel:'#info', n:'4', t:'속도', s:'작고 흐리게 — 보조 정보', side:'R'}
    ],
    nav: [
      {sel:'#nvTbt', t:'경로 안내', s:'회전 화살표 · 거리 · 목적지', side:'L'},
      {sel:'#nvLanes', t:'차로 안내', s:'권장 차로 화살표를 파랑으로', side:'R'},
      {sel:'#nvLimit', t:'제한속도', s:'왼쪽', side:'L'},
      {sel:'#nvRoad', t:'주변 차량 · 차로 유지', s:'옆 차로 · 앞차 · 초록 핸들', side:'R'},
      {sel:'#nvSpd', t:'차속 · 주행 보조', s:'크게 아래 · HDA · 설정 속도', side:'R'}
    ]
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const W = 214, H = 52, GAP = 10;

  function setOn(on){
    cabEl.classList.toggle('explain', on); btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? 'HUD 설명 끄기' : 'HUD 설명 보기';
  }
  btn.onclick = () => setOn(!cabEl.classList.contains('explain'));

  function targetRect(n, cr){
    const el = $(n.sel);
    if(!el || el.closest('[style*="display: none"]')) return null;
    const r = el.getBoundingClientRect();
    if(r.width < 2 || r.height < 2) return null;
    return {x:r.left-cr.left, y:r.top-cr.top, w:r.width, h:r.height};
  }

  let frame = 0;
  function loop(){
    requestAnimationFrame(loop);
    desc.textContent = MODE_DESC[S.mode] || '';
    btn.disabled = S.testing;
    if(S.testing && cabEl.classList.contains('explain')) setOn(false);
    if(!cabEl.classList.contains('explain') || (frame++ % 3)) return;   // 3프레임마다 갱신
    const cr = cabEl.getBoundingClientRect(), hr = $('#hudWrap').getBoundingClientRect();
    const hudL = hr.left - cr.left, hudR = hr.right - cr.left;
    const items = (NOTES[S.mode] || []).map(n => ({n, r: targetRect(n, cr)})).filter(it => it.r);
    // 이름표 자리: HUD 바깥 왼쪽/오른쪽 칸, 겹치면 아래로 민다
    const col = {L: [], R: []};
    items.forEach(it => {
      const cy = it.r.y + it.r.h/2;
      it.lx = it.n.side === 'L' ? Math.max(8, hudL - 28 - W) : Math.min(cr.width - W - 8, hudR + 28);
      it.ly = cy - H/2; col[it.n.side].push(it);
    });
    Object.values(col).forEach(list => { list.sort((a,b) => a.ly - b.ly); for(let i=1;i<list.length;i++) list[i].ly = Math.max(list[i].ly, list[i-1].ly + H + GAP); });
    let out = '';
    items.forEach(it => {
      const {r, n} = it, left = n.side === 'L';
      const ax = left ? r.x : r.x + r.w, ay = r.y + r.h/2;                 // 대상 쪽 끝점
      const bx = left ? it.lx + W : it.lx, by = it.ly + H/2;               // 이름표 쪽 끝점
      out += `<rect x="${r.x-4}" y="${r.y-4}" width="${r.w+8}" height="${r.h+8}" rx="8" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-dasharray="4 4"/>`;
      out += `<path d="M${ax} ${ay} C${(ax+bx)/2} ${ay} ${(ax+bx)/2} ${by} ${bx} ${by}" fill="none" stroke="#ffffff" stroke-opacity=".7" stroke-width="1.5"/>`;
      out += `<circle cx="${ax}" cy="${ay}" r="3.5" fill="#ffffff"/>`;
      out += `<g transform="translate(${it.lx} ${it.ly})"><rect width="${W}" height="${H}" rx="12" fill="#0c1016" fill-opacity=".86" stroke="#ffffff" stroke-opacity=".16"/>`;
      const tx = n.n ? 44 : 14;
      if(n.n) out += `<circle cx="24" cy="${H/2}" r="12" fill="${C_NOW}"/><text x="24" y="${H/2+4.5}" text-anchor="middle" font-size="13" font-weight="800" fill="#0c1016">${n.n}</text>`;
      out += `<text x="${tx}" y="22" font-size="14" font-weight="700" fill="#ffffff">${esc(n.t)}</text>`;
      out += `<text x="${tx}" y="40" font-size="12" fill="#b8c4d0">${esc(n.s)}</text></g>`;
    });
    layer.innerHTML = out;
  }
  setOn(false);
  requestAnimationFrame(loop);
})();
