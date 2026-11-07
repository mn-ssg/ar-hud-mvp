# assets — AI 생성 이미지 (Higgsfield, 2026-10-29)

> 2026-11-03 폴더 정리: 화면에 쓰지 않는 참고 시안(`ref/*.jpg` 8장)은 `04_리서치/assets/2026-10-29_Higgsfield시안/`으로 옮김. 아래 표의 `ref/` 줄은 그 폴더에서 찾는다. 여기엔 코드가 읽는 `tex/`만 남음.

생성 도구: Higgsfield `gpt_image_2_5` (medium · 1k) + 배경 제거 (2026-10-29), `gpt_image_2_6` + `tripo_h3_1_image_to_3d` (2026-11-07). 출처 · 프롬프트 · 이용 조건 기록 원본은 `../../04_리서치/2026-10-29_AI생성에셋_Higgsfield.md` (4 · 6절).

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

| `tex/grass.jpg` · `tex/verge.jpg` | **실제 적용** (2026-11-07) | `scene.js` 지형 잔디(한 장 7m, vertexColors와 곱함) · 길가 흙 띠(`verge`, 한 장 ≈ 5m) | 반 칸 밀어 겹치기로 이음새 제거, 1024px JPEG |
| `tex/galv.jpg` | **실제 적용** (2026-11-07) | `scene.js` 가드레일 빔(`steel`, 세계 좌표 2m) · 가로등 · 지주 · 기둥(`galv`) | 512px JPEG |
| `tex/gore.jpg` | **실제 적용** (2026-11-07) | `scene.js` 갈림목 충격흡수대(`goreMats`) | 512px JPEG |
| `tex/tire.jpg` | 예비 | 코드 버스 바퀴용 — 3D 모델에 바퀴가 있어 지금은 안 씀 | 512px JPEG |
| `tex/tree_pine.png` · `tree_zelkova.png` · `leaves.png` | **교체** (2026-11-07) | 위와 같은 자리 — 그림자 없는 평평한 빛의 1k 사진으로 다시 만듦(장면 빛이 음영을 줌), `alphaToCoverage` | 배경 제거 + 흰 테 제거(코드), PNG |
| `models/sedan.glb` · `suv.glb` · `hatch.glb` · `truck.glb` · `bus.glb` | **실제 적용** (2026-11-07) | `scene.js loadCarModels` — 차체 · 유리 · 바퀴를 GLB로, 등화 · 깜빡이 · 그림자는 코드 메시. `city.js` 버스도 같음 | Tripo H3.1 image-to-3D, 텍스처 2048 → 1024(0.8 ~ 1.3MB), 삼각형 1.3 ~ 2.1만. 못 불러오면 코드 메시 |

| `cabin/base.webp` · `cabin/wheel.webp` · `cabin/map.jpg` | **실제 적용** (2026-11-07) | `cabin.js` 실내 바탕(앞유리 크로마키로 투명, 4K 업스케일) · 핸들(정면, CSS 3D 회전) · 센터 화면 지도(글자 없음) | WebP 583 · 202KB, JPEG 900 × 506 |
| `models/sedan.glb` | **교체** (2026-11-07 오후) | 첫 세단 모델은 텍스처가 단색 회색이라 버리고 은색 참고로 다시 생성 | 1.2MB |

- 차선 · 정지선 · 횡단보도 · 차량 · 보행자 위치는 모두 맵 좌표로 코드가 그린다. 생성 이미지는 노면 · 벽 · 보도의 **재질**로만 쓴다(주행 가능 영역과 무관).
- 텍스처를 못 불러오면 예전처럼 코드로 그린 텍스처가 그대로 쓰인다(`loadTex`). 3D 모델도 같다(`loadCarModels` — 코드 차량 메시가 그대로).
