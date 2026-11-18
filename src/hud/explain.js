/* ============================================================
   explain.js — 발표용 'HUD 설명 보기'
   HUD를 크게 키우고 층마다 이름표를 붙여, 정보 위계를 화면에서 바로 보여준다.
   HUD가 아니라 발표 자료다. 주행 테스트 중에는 저절로 꺼진다. main.js 다음에 로드.
   ============================================================ */
(() => {
  // 2026-10-29: 화면에 늘 떠 있던 설계 설명문(MODE_DESC)은 뺐다 — 설명은 발표 때 이 '설명 보기'에서만
  const btn = $('#explainBtn'), cabEl = $('#cab'), layer = $('#explain');
  // side: 이름표를 HUD 왼쪽/오른쪽 어디에 둘지
  const NOTES = {
    ar: [
      {sel:'#laneFill', n:'1', t:'들어갈 차로 · 경로', s:'가장 크고 진하게 · 화살표가 상태', side:'L'},
      {sel:'#act', n:'2', t:'갈 방향', s:'다음 갈림에서 갈 쪽 · 글자 없음', side:'R'},
      {sel:'#cd', n:'3', t:'다음 행동까지', s:'길이 = 남은 거리 · 색 = 여유', side:'R'},
      {sel:'#info', n:'4', t:'제한속도', s:'왼쪽 위 · 표지 모양 그대로', side:'L'}
    ],
    ar2: [
      {sel:'#bLaneFill', n:'1', t:'들어갈 차로 · 경로', s:'개선 전과 같음 · 위험 중에도 그대로', side:'L'},
      {sel:'#bAct', n:'2', t:'갈 방향', s:'대기 중엔 흐리게', side:'R'},
      {sel:'#bCd', n:'3', t:'다음 행동까지', s:'대기 중엔 회색으로 계속 줄어듦', side:'R'},
      {sel:'#bRear', n:'5', t:'뒤차 · 간격 막대', s:'실제 쪽 차로 · 흰 → 주황 → 빨강 · 꺾쇠 = 접근 속도', side:'R'},
      {sel:'#bInfo', n:'4', t:'제한속도', s:'왼쪽 위 · 표지 모양 그대로', side:'L'}
    ],
    ar3: [
      {sel:'#cLaneFill', n:'1', t:'들어갈 차로', s:'가장 크고 진하게 · 늘 청록', side:'L'},
      {sel:'#cAct', n:'2', t:'갈 방향', s:'가운데 위 · 경로 줄이 시작되는 곳', side:'R'},
      {sel:'#cCd', n:'3', t:'마감선까지 남은 거리', s:'색 없는 막대 · 대기 중엔 밝게', side:'R'},
      {sel:'#cChev', t:'이동 화살표', s:'초록 꺾쇠 = 옮겨도 됨', side:'L'},
      {sel:'#cHold', t:'기다려', s:'빨간 금지 표지 = 지금 옮기지 마', side:'R'},
      {sel:'#cGap', t:'틈', s:'확인 = 흰 점선 · 이동 = 초록', side:'R'},
      {sel:'#cRear', t:'뒤차', s:'주황 = 다가옴 · 빨강 = 옆 · 바로 뒤', side:'R'},
      {sel:'#cWarn', t:'앞쪽 위험', s:'주황 = 앞쪽 주의 · 빨강 = 부딪히기 직전', side:'L'}
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
  const W = 214, H = 54, GAP = 10;
  // 이름표 모양(2026-11-18 D137): 화면 UI 디자인 토큰(styles.css :root)을 따름 — 흰 이름표(모서리 16 · 옅은 그림자) · 먹색 제목 · 회색 설명 · 파란 번호 · 파란 연결선. HUD 색(청록)은 안 씀
  const tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const T = {bg:tok('--bg'), point:tok('--point'), ink:tok('--ink'), sub:tok('--sub')};
  const DEFS = `<defs><filter id="exShadow" x="-20%" y="-30%" width="140%" height="180%"><feDropShadow dx="0" dy="4" stdDeviation="7" flood-color="${T.ink}" flood-opacity=".16"/></filter></defs>`;

  // 켬/끔은 aria-pressed 하나로 — 버튼은 iOS식 스위치(ui.js, D138)라 글자는 'HUD 설명 보기 (발표용)' 그대로 두고 스위치가 켜짐 · 꺼짐을 보여 줌(예전: 켜면 글자가 'HUD 설명 끄기'로 바뀜)
  function setOn(on){
    cabEl.classList.toggle('explain', on); btn.setAttribute('aria-pressed', String(on));
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
    let out = DEFS;
    items.forEach(it => {
      const {r, n} = it, left = n.side === 'L';
      const ax = left ? r.x : r.x + r.w, ay = r.y + r.h/2;                 // 대상 쪽 끝점
      const bx = left ? it.lx + W : it.lx, by = it.ly + H/2;               // 이름표 쪽 끝점
      out += `<rect x="${r.x-4}" y="${r.y-4}" width="${r.w+8}" height="${r.h+8}" rx="8" fill="none" stroke="${T.point}" stroke-opacity=".9" stroke-width="1.5" stroke-dasharray="4 4"/>`;
      out += `<path d="M${ax} ${ay} C${(ax+bx)/2} ${ay} ${(ax+bx)/2} ${by} ${bx} ${by}" fill="none" stroke="${T.point}" stroke-width="1.5"/>`;
      out += `<circle cx="${ax}" cy="${ay}" r="4" fill="${T.point}" stroke="${T.bg}" stroke-width="2"/>`;
      out += `<g transform="translate(${it.lx} ${it.ly})"><rect width="${W}" height="${H}" rx="16" fill="${T.bg}" filter="url(#exShadow)"/>`;
      const tx = n.n ? 46 : 16;
      if(n.n) out += `<circle cx="25" cy="${H/2}" r="11" fill="${T.point}"/><text x="25" y="${H/2+4.5}" text-anchor="middle" font-size="12.5" font-weight="800" fill="${T.bg}">${n.n}</text>`;
      out += `<text x="${tx}" y="23" font-size="14" font-weight="700" fill="${T.ink}">${esc(n.t)}</text>`;
      out += `<text x="${tx}" y="41" font-size="12" font-weight="500" fill="${T.sub}">${esc(n.s)}</text></g>`;
    });
    layer.innerHTML = out;
  }
  setOn(false);
  requestAnimationFrame(loop);
})();
