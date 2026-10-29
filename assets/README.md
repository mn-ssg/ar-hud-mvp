# assets — AI 생성 이미지 (Higgsfield, 2026-10-29)

생성 도구: Higgsfield `gpt_image_2_5` (medium · 1k) + 배경 제거. 출처 · 프롬프트 · 이용 조건 기록 원본은 `../../04_리서치/2026-10-29_AI생성에셋_Higgsfield.md`.

| 파일 | 구분 | 쓰인 곳 | 처리 |
|---|---|---|---|
| `tex/asphalt.jpg` | **실제 적용** | `scene.js` 아스팔트 재질(`asphalt.map`, 세계 좌표 10m 한 장) | 반 칸 밀어 겹치기로 이음새 제거, 1024px JPEG |
| `tex/facade.jpg` | **실제 적용** | `scene.js` · `city.js` 건물 벽(`facadeMats`, 한 장 18 × 21m) + 밤 창(같은 그림의 유리 부분에서 생성) | 512px JPEG |
| `tex/sidewalk.jpg` | **실제 적용** | `city.js` 보도(`cityMats.walk`, 한 장 1.8m) | 512px JPEG |
| `ref/0_art_day.jpg` · `ref/1_art_night.jpg` | 참고 시안 | 실내 · 미러 배치 · 계기판 정리 방향 (`mirrors.js` · `cabin.js`) | 화면에 쓰지 않음 |
| `ref/2_hud_states.jpg` | 참고 시안 | 우리 HUD 상태(이동 · 대기 · 확인 · 정체) 첫 시안 — 오전 작업 비교용. 정체 '틈 없음'의 가로 막대는 '정지'로 읽힐 수 있어 채택 안 함 | 화면에 쓰지 않음 |
| `ref/6_vehicles.jpg` · `ref/7_peds.jpg` | 참고 시안 | 차량 앞모습(전조등 · 그릴) · 버스 · 보행자 비례 — `scene.js` · `city.js` 메시 | 화면에 쓰지 않음 |
| `tex/tree_zelkova.png` · `tex/tree_pine.png` | **실제 적용** | `scene.js` 고속도로 판 나무 그림 | Higgsfield 배경 제거 + 흰 잔여 제거, PNG(투명) |
| `tex/leaves.png` | **실제 적용** | `props.js` 입체 가로수 잎 덩어리 | 배경 제거 + 둥근 가장자리(코드) |
| `tex/facade_apt.jpg` · `tex/facade_glass.jpg` · `tex/shopfront.jpg` | **실제 적용** | `scene.js BUILD` · `city.js` 건물 종류 · 1층 상가 · 먼 아파트 | 512 · 1024px JPEG, 밤 창은 같은 그림에서 생성 |
| `ref/2_0_hud_grid.jpg` · `ref/2_7_interior.jpg` · `ref/2_tree_sources.jpg` | 참고 시안 | 우리 HUD 상태 비교 · 실내 · 나무 원본 | 화면에 쓰지 않음 |

- 차선 · 정지선 · 횡단보도 · 차량 · 보행자 위치는 모두 맵 좌표로 코드가 그린다. 생성 이미지는 노면 · 벽 · 보도의 **재질**로만 쓴다(주행 가능 영역과 무관).
- 텍스처를 못 불러오면 예전처럼 코드로 그린 텍스처가 그대로 쓰인다(`loadTex`).
