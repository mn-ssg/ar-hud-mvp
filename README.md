# AR-HUD 주행 실험 시뮬레이터 (website)

초보 운전자용 AR-HUD를 비교하는 웹 시뮬레이터. `index.html` 하나를 열면 돌아간다 (GitHub Pages: https://mn-ssg.github.io/ar-hud-mvp/). 설계 · 실험 기록은 상위 폴더 `01_프로젝트/`에 있다.

## 폴더 구조 (2026-11-03 정리)

모듈 시스템 없이 **전역 스크립트**를 `index.html`이 정해진 순서로 읽는다. 앞 파일이 정의한 이름을 뒤 파일이 쓰므로 순서를 바꾸면 안 된다.

```
index.html            화면 뼈대 · HUD SVG · 카드. 스크립트 읽는 순서가 여기 있음
styles/
  styles.css          페이지 뼈대 · 연구자 설정 · 기록 서랍
  hud.css             HUD 디자인 토큰(--h2-*) · 운전석 영역 · 카드 · HUD 애니메이션
src/
  core/
    config.js         공용 헬퍼 · 상수(차로 · 갈림 · 난이도 HARD · 뒤차 단계 REAR2) · 곡선 생성
    guide.js          안내 판단 로직(대기 → 확인 → 이동, 안내 단계). DOM 없음 — 단위 테스트 대상
    maps.js           맵 5종 데이터 · 경로 계산
  scene/
    scene.js          three.js 장면 · 하늘 · 도로 · 차량 메시 · 주야 조명
    cabin.js          3D 운전석 실내 · 핸들 · 계기판
    mirrors.js        룸미러
    props.js          가로수 · 건물 · 정류장 소품
    city.js           일반도로 교차로 장면 · 신호 · 보행자 · 버스
  hud/
    hud.js            현대 HUD(대조군) · 우리 HUD 개선 전(1차 실험 v1.9) · 미니 도로 공용 그리기 함수
    hud2.js           우리 HUD 개선 후(2.1) — hud.js의 투영 · 띠 함수를 씀
    explain.js        발표용 'HUD 설명 보기' 이름표
  drive/
    drive.js          주행 테스트: 내 차 조작 · 교통 AI · 도로 판정 · 기록 값
  app/
    main.js           상태 · 매 프레임 루프 · 시연 흐름 · 화면 전환
    session.js        참가자 진행 · 기록 · 엑셀 · 기록 서랍 · 방향키
assets/
  tex/                노면 · 벽 · 나무 재질 (코드가 읽음). 참고 시안은 ../04_리서치/assets/2026-10-29_Higgsfield시안/
tests/
  guide.test.js       판단 로직 단위 테스트        node --test guide.test.js
  drive-regression.js 브라우저 자동 운전 회귀 78항목   node drive-regression.js (Chrome 필요)
  capture-states.js   HUD 상태 6개 캡처 + 대비 측정
  autodrive-batch.js  자동 운전 묶음(기록 값 점검)
  demo-audit.js       시연 · 주행 교통 겹침 · 이상 움직임 점검
  cutin-batch.js      '앞질러 끼어들기' 막기 방법 비교(가속 끼어들기 vs HUD 따라가기 자동 운전)
```

읽는 순서: `core(config → guide → maps)` → `scene(scene → cabin → mirrors → props)` → `hud(hud → hud2)` → `drive` → `scene/city` → `app(main → session)` → `hud/explain`.

## 실행

- 열기: `index.html`을 정적 서버로 연다 (파일로 직접 열면 재질 이미지가 막힐 수 있음). 예: `python3 -m http.server` 뒤 `http://localhost:8000/`
- 테스트: `cd tests && npm i && npm test`
- 느린 기기: 화소 배율이 최대 1.5이고, 프레임이 자주 25ms를 넘으면 1.25 → 1로 내려가며 룸미러는 두 프레임에 한 번 갱신된다(`scene.js PERF`). 캡처처럼 선명하게 고정하려면 `?dpr=2`
- WebGL 컨텍스트가 끊기면(사파리가 오래 둔 탭에서 거둬 감) 안내를 띄우고 복구, 4초 안에 안 되면 새로고침한다(`scene.js`)

외부 라이브러리: three.js r128 · SheetJS 0.18.5 (cdnjs). 에셋 출처 · 라이선스는 `assets/README.md`와 `04_리서치/`.
