# AR-HUD 주행 실험 시뮬레이터 (website)

초보 운전자용 AR-HUD를 비교하는 웹 시뮬레이터 — 현대 HUD(대조군)와 리뉴얼 HUD(실험군, 3차 = 3.0). `index.html` 하나를 열면 돌아간다 (GitHub Pages: https://mn-ssg.github.io/ar-hud-mvp/). 설계 · 실험 기록은 상위 폴더 `01_프로젝트/`에 있다.

## 폴더 구조 (2026-11-03 정리)

모듈 시스템 없이 **전역 스크립트**를 `index.html`이 정해진 순서로 읽는다. 앞 파일이 정의한 이름을 뒤 파일이 쓰므로 순서를 바꾸면 안 된다.

```
index.html            화면 뼈대 · HUD SVG · 카드. 스크립트 읽는 순서가 여기 있음
styles/
  styles.css          페이지 뼈대 · 연구자 설정 · 기록 서랍
  hud.css             HUD 디자인 토큰(--h2-*) · 운전석 영역 · 카드 · HUD 애니메이션
src/
  core/
    screen.js         화면 맞추기(신용카드 · 보는 거리, 연구자 설정) — HUD가 참가자 눈에 몇 도로 보였는지 기록 4칸으로 남김 (D116). HUD 크기는 안 바꿈
    config.js         공용 헬퍼 · 상수(차로 · 갈림 · 난이도 HARD · 2차 뒤차 단계 REAR2 · 3차 HUD3) · 곡선 생성. **파일럿에서 바꿀 값 = HUD3 맨 위 네 줄**(주의 시작 · 대기 기준 · 확인 시간 · 앞쪽 위험 시작)
    guide.js          안내 판단 로직(대기 → 확인 → 이동, 안내 단계, 3차 상태 h3Step). DOM 없음 — 단위 테스트 대상
    maps.js           맵 5종 데이터 · 경로 계산
  scene/
    scene.js          three.js 장면 · 하늘 · 도로 · 차량 메시 · 3D 차량 모델(GLB) 읽기 · 주야 조명
    cabin.js          운전석 실내 — Higgsfield 이미지 층(바탕 · 핸들 CSS 3D) + 계기판 · 센터 화면 캔버스 (2026-11-07 D111). HUD 상자 크기를 장면 각도(config.js HUD_DEG 14° × 7.3°, D116)로 px 환산, 아래끝은 대시보드 윗선 위, 야간 덮개는 바탕 알파 마스크
    mirrors.js        룸미러 — 실내 이미지의 받침 자리 · 실제 거울 크기 각도 (2026-11-07 저녁 D115), 크기는 cabin.js layoutCabin이 다시 놓음
    props.js          정류장 · 연석 등 코드 소품 + PROPM(Blender 가로등 · 가드레일 기둥 모델 props.glb를 인스턴스로 놓음)
    trees.js          나무 — Blender 모델 6그루(trees.glb). 가까운 나무는 모델, 먼 나무는 같은 모델을 찍은 판 (2026-11-17). 고속도로만 — 일반도로 가로수는 없앰(config.js CITY_TREES)
    city.js           일반도로 교차로 장면 · 신호 · 횡단보도 보행자 · 버스(정류장 흐름) · 보도를 걷는 사람들(WALK — 장식, 판정과 무관)
  hud/
    hud.js            현대 HUD(대조군) · 리뉴얼 HUD 1차(1차 실험 v1.9) · 미니 도로 공용 그리기 함수
    hud2.js           리뉴얼 HUD 2차(2.4, 2차 실험) — 도로 기준 미니 도로 투영, hud.js의 띠 함수를 씀. 시연 비교용
    hud3.js           리뉴얼 HUD 3차(3.0, 3차 실험 조건) — 상태 6가지(안전 · 주의 · 대기 · 확인 · 이동 · 앞쪽 위험), 미니 도로 · 차 아이콘을 장면 카메라와 같은 투영으로. 값은 config.js HUD3
    explain.js        발표용 'HUD 설명 보기' 이름표
  drive/
    drive.js          주행 테스트: 내 차 조작 · 깜빡이(Q · E) · 교통 AI(양보) · 도로 판정 · 기록 값
  app/
    main.js           상태 · 매 프레임 루프 · 시연 흐름 · 화면 전환
    session.js        참가자 진행 · 기록 · 엑셀 · 기록 서랍 · 방향키
assets/
  tex/                노면 · 벽 · 잔디 · 금속 · 나무 재질 (코드가 읽음). 참고 시안은 ../04_리서치/assets/
  models/             차량 · 버스 GLB 5개(Higgsfield Tripo, 2026-11-07 · Draco 압축 2026-11-17) · 나무 · 가로등 · 가드레일 기둥(Blender) · 보행자 4명(Higgsfield + 리깅) · HUD 아이콘 2개. 못 불러오면 코드 메시
  blender/            Blender 원본(.blend)과 만드는 스크립트(.py)
  cabin/              실내 바탕 · 핸들(WebP, 앞유리 투명) · 센터 화면 지도. 못 불러오면 단순 대시보드
tests/
  guide.test.js       판단 로직 단위 테스트        node --test guide.test.js
  drive-regression.js 브라우저 자동 운전 회귀 139항목  node drive-regression.js (Chrome 필요)
  capture-states.js   리뉴얼 HUD 3차 상태 6가지 캡처(주간 · 야간, 현대 HUD 줄 포함) + 대비 측정   node capture-states.js <폴더>
  handling-check.js   조작감 점검(보조 켬 → handling-check-assist.json · ASSIST=0 이면 실제 값 → handling-check.json) — 새 조작 모델을 키 입력으로 돌려 차로 변경 시간 · 우회전 핸들 각도 · 가속 · 제동을 실제 값과 견줌(결과 handling-check.json)
  perf-check.js       성능 재기 — 장면 4개 프레임 시간 · 삼각형 · 그리기 호출 · 로딩 용량   node perf-check.js after (결과 perf-after.json, 그래픽 작업 전 값 perf-before.json)
  autodrive-batch.js  자동 운전 묶음(현대 · 리뉴얼 같은 시나리오의 기록 값이 같은지, 3차 상태 통계)
  demo-audit.js       시연 · 주행 교통 겹침 · 이상 움직임 점검 (ONLY=CRT 처럼 맵 하나만)
  cutin-batch.js      '앞질러 끼어들기' 막기 방법 비교(가속 끼어들기 vs HUD 따라가기 자동 운전)
```

읽는 순서: `core(config → guide → maps)` → `scene(scene → cabin → mirrors → props)` → `hud(hud → hud2 → hud3)` → `drive` → `scene/city` → `app(main → session)` → `hud/explain`.

## 실행

- 열기: `index.html`을 정적 서버로 연다 (파일로 직접 열면 재질 이미지가 막힐 수 있음). 예: `python3 -m http.server` 뒤 `http://localhost:8000/`
- 테스트: `cd tests && npm i && npm test`
- 조작: ← → 핸들 · ↑ 가속 · ↓ 브레이크 · Q E 깜빡이(차로 변경이 끝나면 자동으로 꺼짐). 차 움직임은 아반떼(CN7) 제원 · 실측 기준(`config.js VEH`): 키를 누르고 있는 동안 핸들이 점점 돌아가고(빠를수록 덜), 떼면 가운데로 돌아옴. ↓는 누르고 있을수록 세게. 키보드 운전이 어려운 부분은 조작 보조(`VEH.assist`)가 덜어 줌 — 2차 실험 때의 조작 느낌: 누르면 0.55초에 끝 각도, 떼면 0.33초에 가운데. 핸들이 스스로 움직이는 보정은 없음(2026-11-17 밤).
- ⑤ 우회전 맵: 가운데 차로가 공사로 막혀 있음(`config.js CITY_WORK`, `maps.js` CRT `work`) — 미리 오른쪽 차로로 옮겨 버스 뒤에 섰다가 따라가 우회전. 공사 구간에 들어가면 충돌 '공사 구간'.
- 주행 테스트 순서(3차): 연습(HUD 없음) → 현대 · 리뉴얼을 판마다 교대로 6판 → 질문(현대: 확신 / 리뉴얼: 확신 + 대기 표시 이해). `session.js EXP.alternate`
- 느린 기기: 화소 배율이 최대 1.5이고, 프레임이 자주 25ms를 넘으면 1.25 → 1로 내려가며 룸미러는 두 프레임에 한 번 갱신된다(`scene.js PERF`). 캡처처럼 선명하게 고정하려면 `?dpr=2`
- WebGL 컨텍스트가 끊기면(사파리가 오래 둔 탭에서 거둬 감) 안내를 띄우고 복구, 4초 안에 안 되면 새로고침한다(`scene.js`)

외부 라이브러리: three.js r128 · GLTFLoader r128(jsdelivr) · SheetJS 0.18.5 (cdnjs). 에셋 출처 · 라이선스는 `assets/README.md`와 `04_리서치/`.
