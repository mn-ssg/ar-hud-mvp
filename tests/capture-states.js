/* 개선 전 · 개선 후 HUD를 같은 장면(상태 6개)에서 주간 · 야간으로 찍어 한 장으로 모은다 (2026-11-03).
   실행: cd tests && node capture-states.js <출력 폴더>   → <폴더>/상태6_주간.png · 상태6_야간.png (각 행 = 개선 전 / 개선 후 A / 개선 후 B) + 낱장 png
   뒤차는 실제 시뮬레이터 차 한 대를 정해진 간격 · 속도로 놓는다(hud2 자동 테스트와 같은 방법). 사람 실험이 아님 */
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), OUT = process.argv[2] || path.join(__dirname, 'shots');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TYPES = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.jpg':'image/jpeg', '.png':'image/png'};
const serve = () => new Promise(res => { const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const p = path.join(ROOT, u === '/' ? 'index.html' : u);
  if(!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()){ r.writeHead(404); r.end(); return; } r.writeHead(200, {'Content-Type':TYPES[path.extname(p)] || 'application/octet-stream'}); fs.createReadStream(p).pipe(r); }).listen(0, '127.0.0.1', () => res(srv)); });
const STATES = [
  {id:'01', name:'안전', gap:80, closing:2, secs:1.5},
  {id:'02', name:'감지', gap:50, closing:1, secs:1.5},
  {id:'03', name:'주의', gap:20, closing:2.5, secs:1.5},
  {id:'04', name:'대기', gap:7, closing:4, secs:1.6},
  {id:'05', name:'위험 강화', gap:7, closing:4, secs:1.6, offset:.6},
  {id:'06', name:'해소', gap:7, closing:4, secs:2.1, jumpAt:1}   // 1초 뒤 지나감 → 확인 0.8초 → 이동 0.3초(훑기 중)
];
(async () => {
  fs.mkdirSync(OUT, {recursive:true});
  const srv = await serve(), url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch({executablePath:CHROME, headless:true, args:['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']});
  const page = await browser.newPage({viewport:{width:1366, height:768}, deviceScaleFactor:2});
  await page.goto(url, {waitUntil:'networkidle'}); await page.waitForTimeout(800);
  await page.evaluate(() => { const _sp = stepPlayer; window.__off = 0; stepPlayer = function(dt){ const tx = S.map.laneX(1) + window.__off, tz = D.z - 10, fx = Math.sin(D.psi), fz = -Math.cos(D.psi), dx = tx - D.x, dz = tz - D.z, l = Math.hypot(dx, dz) || 1;
    const sinA = (fx*dz - fz*dx)/l, dMax = Math.min(DRV.wheelMax, Math.atan(DRV.latMax*WHEELBASE/Math.max(D.v*D.v, .01))); KEYS.left = KEYS.right = false; _sp(dt); D.steer = clamp(Math.atan(2*WHEELBASE*sinA/l)/dMax, -1, 1); D.wheel = D.steer*dMax; };
    window.setupScene = (hud, light, tone, st) => {
      setTone(tone); setMode(hud); setLight(light); MIR.on = true; setScreen('drive'); $('#intro').hidden = true; $('#sess').hidden = true;
      const m = mapById('ICR'), leaf = m.leaves.findIndex(l => l.dest === '용인·기흥');
      startDrive({map:m, leaf, lane:1, type:'rear', jam:0, seed:5, sigT:0}); D.frozen = false;
      D.cars.forEach(c => c.mesh.visible = false); const car = D.cars.find(c => c.kind === 'rear') || D.cars[1]; D.cars = [car]; car.mesh.visible = true; car.lane = 2; car.P = lanePath(S.map, 2, 0); car.kind = 'rear'; car.brakeAt = null;
      car.s = LANE_START - (D.z + st.gap + car.len/2 + DRV.carL/2); car.v = car.v0 = car.base = D.v + st.closing; car.T = 5; car.s0 = 1; window.__off = st.offset || 0; if(st.offset) D.x += st.offset; placeCars();
      resetGuide(); resetHud2(); resetHud(); update(0);   // 첫 프레임(원래 교통)으로 올라간 판단 · 단계를 지움
      let jumped = false;
      for(let k = 0; k < st.secs*60; k++){ if(st.jumpAt && !jumped && D.t >= st.jumpAt){ jumped = true; car.s = LANE_START - (D.z - 40); car.v = car.v0 = D.v + 2; } update(1/60); }
      // 대기 · 위험 강화는 깜빡임 '켜짐' 순간에 멈춤 (2026-11-04: 꺼짐 밝기 0이라 꺼진 순간을 찍으면 뒤차 · 빛이 안 보임)
      for(let k = 0; k < 30 && hud === 'ar2' && +$('#arHud2').dataset.level >= 3 && +$('#bRear').getAttribute('opacity') < .5; k++) update(1/60);
      D.frozen = true; update(0);
      const r = $('#hudWrap').getBoundingClientRect(), c = $('#cab').getBoundingClientRect();
      return {x:r.left - 60, y:r.top - 40, w:r.width + 120, h:r.height + 70, lv:$('#arHud2').dataset.level, gate:S.G && S.G.gate, cab:[c.left, c.top, c.width, c.height]}; };
  });
  const shots = {};
  const ROWS = [['ar', 'B', '', '개선 전 (1차 v1.9)'], ['ar2', 'B', '', '개선 후 (2.4)']];
  for(const light of ['day', 'night']) for(const [hud, tone, skin, label] of ROWS){
    for(const st of STATES){
      const box = await page.evaluate(([hud, light, tone, st]) => setupScene(hud, light, tone, st), [hud, light, tone, st]);
      await page.waitForTimeout(120);
      const name = `${light}_${hud}${hud === 'ar2' ? tone + skin : ''}_${st.id}`;
      const buf = await page.screenshot({clip:{x:box.x, y:box.y, width:box.w, height:box.h}});
      fs.writeFileSync(path.join(OUT, name + '.png'), buf); shots[name] = {buf, label, st, light, lv:box.lv, gate:box.gate};
      // 대비: 요소마다 HUD 켬 / 끔 같은 프레임 (E20 방법). 달라진 픽셀 = HUD 픽셀, 그 자리의 끈 화면 밝기 = 배경
      const els = hud === 'ar2' ? {'들어갈 차로 테두리':'#bRails', '갈 방향':'#bIcon', '막대':'#bCdBar', '이동 화살표 머리':'#bHead', '뒤차':'#bRearBody', '거리 구간':'#bDistBand', '가장자리 빛':'#bEdgeR', '경계 빨간 선':'#bBound'} : {'들어갈 차로 테두리':'#laneRails', '갈 방향':'#nowIcon', '막대':'#cdBar', '이동 화살표 머리':'#moveHead', '뒤차(대기)':'#carBehind rect', '멈춤 막대':'#moveStop'};
      const boxes = await page.evaluate(sel => { const o = {}; Object.entries(sel).forEach(([k, q]) => { const e = document.querySelector(q); if(!e) return; const b = e.getBoundingClientRect(); if(b.width > 1 && b.height > 1) o[k] = [b.left, b.top, b.width, b.height]; }); return o; }, els);
      const on = await page.screenshot(); fs.writeFileSync(path.join(OUT, name + '_full.png'), on);   // 운전석 전체(실내 · 앞유리 · HUD)도 저장 (2026-11-07) 
      await page.evaluate(() => { $('#hudWrap').style.visibility = 'hidden'; }); await page.waitForTimeout(60);
      const off = await page.screenshot(); await page.evaluate(() => { $('#hudWrap').style.visibility = ''; });
      const ct = await page.evaluate(async ([a, b, boxes]) => {
        const load = s => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + s; });
        const [A, Bm] = await Promise.all([load(a), load(b)]), c = document.createElement('canvas'); c.width = A.width; c.height = A.height; const g = c.getContext('2d');
        g.drawImage(A, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data; g.drawImage(Bm, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
        const lum = (r, gg, bb) => { const f = v => { v /= 255; return v <= .03928 ? v/12.92 : Math.pow((v + .055)/1.055, 2.4); }; return .2126*f(r) + .7152*f(gg) + .0722*f(bb); };
        const out = {}, k = devicePixelRatio;
        Object.entries(boxes).forEach(([name, [x, y, w, h]]) => { let la = 0, lb = 0, n = 0; const xs = [], ys = [];
          for(let yy = Math.floor(y*k); yy < Math.ceil((y + h)*k); yy++) for(let xx = Math.floor(x*k); xx < Math.ceil((x + w)*k); xx++){ const i = (yy*c.width + xx)*4; if(Math.abs(da[i]-db[i]) + Math.abs(da[i+1]-db[i+1]) + Math.abs(da[i+2]-db[i+2]) < 40) continue; xs.push(lum(da[i], da[i+1], da[i+2])); ys.push(lum(db[i], db[i+1], db[i+2])); }
          if(xs.length < 10){ out[name] = null; return; } xs.sort((p, q) => q - p); const top = xs.slice(0, Math.max(10, Math.floor(xs.length*.25))); la = top.reduce((p, q) => p + q, 0)/top.length; lb = ys.reduce((p, q) => p + q, 0)/ys.length;
          out[name] = +((Math.max(la, lb) + .05)/(Math.min(la, lb) + .05)).toFixed(2); });
        return out; }, [on.toString('base64'), off.toString('base64'), boxes]);
      shots[name].contrast = ct;
      console.log(name, '단계', box.lv, box.gate, '대비', JSON.stringify(ct));
      await page.evaluate(() => stopDrive());
    }
  }
  // 한 장으로: 행 = HUD(3) · 열 = 상태(6)
  for(const light of ['day', 'night']){
    const rows = ROWS.map(([hud, tone, skin]) => ({label:shots[`${light}_${hud}${hud === 'ar2' ? tone + skin : ''}_01`].label, cells:STATES.map(st => shots[`${light}_${hud}${hud === 'ar2' ? tone + skin : ''}_${st.id}`])}));
    const html = `<html><body style="margin:0;background:#101418;color:#e7ecf1;font-family:-apple-system,'Pretendard','Apple SD Gothic Neo',sans-serif"><div style="padding:18px 22px 6px;font-size:20px;font-weight:700">우리 HUD 개선 전 · 후 — 상태 6개 · ${light === 'day' ? '주간' : '야간'} (2026-11-03, 같은 장면: ① IC 오른쪽 진출, 2차로 뒤차 한 대)</div>
      <table style="border-collapse:collapse;margin:8px 16px 18px"><tr><td></td>${STATES.map(s => `<td style="padding:6px 8px;font-size:14px;font-weight:600;color:#9fb3c8">${s.id} ${s.name}</td>`).join('')}</tr>
      ${rows.map(r => `<tr><td style="padding:6px 10px;font-size:13px;font-weight:700;white-space:nowrap;color:#e7ecf1">${r.label}</td>${r.cells.map(c => `<td style="padding:4px"><img src="data:image/png;base64,${c.buf.toString('base64')}" style="width:300px;display:block;border-radius:6px"></td>`).join('')}</tr>`).join('')}</table></body></html>`;
    const p2 = await browser.newPage({viewport:{width:1960, height:900}, deviceScaleFactor:1});
    await p2.setContent(html); await p2.waitForTimeout(300);
    await p2.screenshot({path:path.join(OUT, `상태6_${light === 'day' ? '주간' : '야간'}.png`), fullPage:true}); await p2.close();
  }
  // 대비 표 (요소별 최솟값 — 밝은 쪽 25% 픽셀 평균 vs 같은 자리 노면 밝기)
  const lines = ['| 화면 | 요소 | 대비 |', '|---|---|---|'];
  Object.entries(shots).forEach(([n, s]) => { if(!s.contrast) return; Object.entries(s.contrast).forEach(([el, v]) => { if(v !== null) lines.push(`| ${n} | ${el} | ${v}:1 |`); }); });
  fs.writeFileSync(path.join(OUT, '대비.md'), lines.join('\n'));
  const worst = {}; Object.entries(shots).forEach(([n, s]) => { if(!s.contrast) return; Object.entries(s.contrast).forEach(([el, v]) => { if(v === null) return; const key = `${n.split('_')[0]}_${n.split('_')[1]} ${el}`; if(!worst[key] || v < worst[key]) worst[key] = v; }); });
  console.log('요소별 최저 대비:', JSON.stringify(worst));
  await browser.close(); srv.close();
  console.log('done →', OUT);
})().catch(e => { console.error(e); process.exit(2); });
