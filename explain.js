/* ============================================================
   explain.js — 발표용 'HUD 설명 보기'
   HUD를 크게 키우고 층마다 이름표를 붙여, 정보 위계를 화면에서 바로 보여준다.
   HUD가 아니라 발표 자료다. 판단 테스트 중에는 저절로 꺼진다. main.js 다음에 로드.
   ============================================================ */
(() => {
  const btn = $('#explainBtn'), cabEl = $('#cab'), layer = $('#explain'), desc = $('#modeDesc');
  const MODE_DESC = {
    ar: '초보자용 정보 위계 — 지금 할 한 가지 → 언제 → 어디로 → 속도',
    nav: '현대·기아 순정 HUD 구성을 재현한 비교 기준'
  };
  // side: 이름표를 HUD 왼쪽/오른쪽 어디에 둘지
  const NOTES = {
    ar: [
      {sel:'#act', n:'1', t:'지금 할 한 가지', s:'아이콘 + 한 단어 · 신호등 색', side:'L'},
      {sel:'#cd', n:'2', t:'언제까지', s:'남은 시간 막대 · 숫자 없음', side:'R'},
      {sel:'#laneFill', n:'3', t:'어디로', s:'내 차로 · 옮길 방향 · 주변 차', side:'L'},
      {sel:'#info', n:'4', t:'속도', s:'작게 — 거리·방면은 계기판 몫', side:'R'}
    ],
    nav: [
      {sel:'#nvFork', t:'주행 경로 안내', s:'분기 그림 · 거리 · 방면', side:'L'},
      {sel:'#nvLanes', t:'차로 안내', s:'권장 차로를 파랑으로', side:'R'},
      {sel:'#nvSpd', t:'차속', s:'가운데 크게', side:'L'},
      {sel:'#navHud circle', t:'도로 정보', s:'제한속도', side:'R'}
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
      if(n.n) out += `<circle cx="24" cy="${H/2}" r="12" fill="#46e6ff"/><text x="24" y="${H/2+4.5}" text-anchor="middle" font-size="13" font-weight="800" fill="#0c1016">${n.n}</text>`;
      out += `<text x="${tx}" y="22" font-size="14" font-weight="700" fill="#ffffff">${esc(n.t)}</text>`;
      out += `<text x="${tx}" y="40" font-size="12" fill="#b8c4d0">${esc(n.s)}</text></g>`;
    });
    layer.innerHTML = out;
  }
  setOn(false);
  requestAnimationFrame(loop);
})();
