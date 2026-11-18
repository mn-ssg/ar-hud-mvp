/* ============================================================
   ui.js — 화면 UI의 가벼운 움직임 (2026-11-18 D137). 맨 마지막에 로드(다른 파일이 만든 버튼 · 값을 지켜봄)
   · 세그먼트: 고른 칸 뒤의 흰 칸(.seg-thumb)이 새 칸으로 미끄러져 감. 고르는 코드(setMode · setLight · renderScenario …)는 그대로 aria-pressed만 바꾸고,
     여기서 그 변화를 지켜보다 흰 칸을 옮긴다(MutationObserver). 처음 보일 때 · 크기가 바뀔 때는 움직임 없이 바로 그 자리
   · 기록 수 배지: 숫자가 늘었고 화면에 보일 때 한 번 톡(.count.pop). 주행 중(위 막대가 숨은 동안) 는 숫자는 끝나고 처음 보일 때 한 번
   · 시간 · 이징은 styles.css 토큰(--t2 · --ease). prefers-reduced-motion이면 CSS가 움직임을 끔
   ============================================================ */
(() => {
  /* ---------- 세그먼트의 흰 칸 ---------- */
  function place(seg, instant){
    const th = seg._thumb;
    if(!seg.contains(th)) seg.prepend(th);   // renderScenario가 목적지 세그먼트를 innerHTML로 다시 채우면 다시 넣음
    const b = seg.querySelector('button[aria-pressed="true"]');
    if(!b || !seg.offsetWidth){ th.style.opacity = 0; seg._placed = false; return; }
    const jump = instant || !seg._placed;
    if(jump) th.style.transition = 'none';
    th.style.opacity = 1; th.style.width = b.offsetWidth + 'px'; th.style.transform = `translateX(${b.offsetLeft}px)`;
    if(jump){ void th.offsetWidth; th.style.transition = ''; }
    seg._placed = true;
  }
  $$('.seg').forEach(seg => {
    const th = document.createElement('i'); th.className = 'seg-thumb'; th.setAttribute('aria-hidden', 'true');
    seg._thumb = th; seg.prepend(th); seg.classList.add('has-thumb');
    new MutationObserver(() => place(seg)).observe(seg, {subtree:true, childList:true, attributes:true, attributeFilter:['aria-pressed']});
    new ResizeObserver(() => place(seg, true)).observe(seg);
    place(seg, true);
  });

  /* ---------- 기록 수 배지 ---------- */
  const badge = $('#logCount'), app = $('#app');
  const shown = () => app.dataset.screen !== 'drive';
  let seen = +badge.textContent || 0;
  function check(){
    const n = +badge.textContent || 0;
    if(!shown()) return;
    if(n > seen){ badge.classList.remove('pop'); void badge.offsetWidth; badge.classList.add('pop'); }
    seen = n;
  }
  badge.addEventListener('animationend', () => badge.classList.remove('pop'));
  new MutationObserver(check).observe(badge, {childList:true, characterData:true, subtree:true});
  new MutationObserver(check).observe(app, {attributes:true, attributeFilter:['data-screen']});
})();
