# assets — AI 생성 이미지 (Higgsfield, 2026-10-29)

> 2026-11-03 폴더 정리: 화면에 쓰지 않는 참고 시안(`ref/*.jpg` 8장)은 `04_리서치/assets/2026-10-29_Higgsfield시안/`으로 옮김. 아래 표의 `ref/` 줄은 그 폴더에서 찾는다. 여기엔 코드가 읽는 `tex/`만 남음.

생성 도구: Higgsfield `gpt_image_2_5` (medium · 1k) + 배경 제거 (2026-10-29), `gpt_image_2_6` + `tripo_h3_1_image_to_3d` (2026-11-07). 출처 · 프롬프트 · 이용 조건 기록 원본은 `../../04_리서치/2026-10-29_AI생성에셋_Higgsfield.md` (4 · 6절).

| 파일 | 구분 | 쓰인 곳 | 처리 |
|---|---|---|---|
| `tex/asphalt.jpg` | **실제 적용** | `scene.js` 아스팔트 재질(`asphalt.map`, 세계 좌표 10m 한 장) | 반 칸 밀어 겹치기로 이음새 제거, 1024px JPEG |
| `tex/facade.jpg` | **실제 적용** | `scene.js` · `city.js` 건물 벽(`facadeMats`, 한 장 18 × 21m) + 밤 창(같은 그림의 유리 부분에서 생성) | 512px JPEG |
| `tex/sidewalk.jpg` | **실제 적용** | `city.js` 보도(`cityMats.walk`, 한 장 1.8m) | 512px JPEG |
| `ref/0_art_day.jpg` · `ref/1_art_night.jpg` | 참고 시안 | 실내 · 미러 배치 · 계기판 정리 방향 (`mirrors.js` · `cabin.js`) | 화면에 쓰지 않음 |
| `ref/2_hud_states.jpg` | 참고 시안 | 리뉴얼 HUD 상태(이동 · 대기 · 확인 · 정체) 첫 시안 — 오전 작업 비교용. 정체 '틈 없음'의 가로 막대는 '정지'로 읽힐 수 있어 채택 안 함 | 화면에 쓰지 않음 |
| `ref/6_vehicles.jpg` · `ref/7_peds.jpg` | 참고 시안 | 차량 앞모습(전조등 · 그릴) · 버스 · 보행자 비례 — `scene.js` · `city.js` 메시 | 화면에 쓰지 않음 |
| `tex/tree_zelkova.png` · `tex/tree_pine.png` | **실제 적용** | `scene.js` 고속도로 판 나무 그림 | Higgsfield 배경 제거 + 흰 잔여 제거, PNG(투명) |
| `tex/leaves.png` | **실제 적용** | `props.js` 입체 가로수 잎 덩어리 | 배경 제거 + 둥근 가장자리(코드) |
| `tex/facade_apt.jpg` · `tex/facade_glass.jpg` · `tex/shopfront.jpg` | **실제 적용** | `scene.js BUILD` · `city.js` 건물 종류 · 1층 상가 · 먼 아파트 | 512 · 1024px JPEG, 밤 창은 같은 그림에서 생성 |
| `ref/2_0_hud_grid.jpg` · `ref/2_7_interior.jpg` · `ref/2_tree_sources.jpg` | 참고 시안 | 리뉴얼 HUD 상태 비교 · 실내 · 나무 원본 | 화면에 쓰지 않음 |

| `tex/grass.jpg` · `tex/verge.jpg` | **실제 적용** (2026-11-07) | `scene.js` 지형 잔디(한 장 7m, vertexColors와 곱함) · 길가 흙 띠(`verge`, 한 장 ≈ 5m) | 반 칸 밀어 겹치기로 이음새 제거, 1024px JPEG |
| `tex/galv.jpg` | **실제 적용** (2026-11-07) | `scene.js` 가드레일 빔(`steel`, 세계 좌표 2m) · 가로등 · 지주 · 기둥(`galv`) | 512px JPEG |
| `tex/gore.jpg` | **실제 적용** (2026-11-07) | `scene.js` 갈림목 충격흡수대(`goreMats`) | 512px JPEG |
| ~~`tex/tire.jpg`~~ | **삭제** (2026-11-17, 쓰는 곳 없음) | 코드 버스 바퀴용 — 3D 모델에 바퀴가 있어 지금은 안 씀 | 512px JPEG |
| `tex/tree_pine.png` · `tree_zelkova.png` · `leaves.png` | **교체** (2026-11-07) | 위와 같은 자리 — 그림자 없는 평평한 빛의 1k 사진으로 다시 만듦(장면 빛이 음영을 줌), `alphaToCoverage` | 배경 제거 + 흰 테 제거(코드), PNG |
| `models/sedan.glb` · `suv.glb` · `hatch.glb` · `truck.glb` · `bus.glb` | **실제 적용** (2026-11-07) | `scene.js loadCarModels` — 차체 · 유리 · 바퀴를 GLB로, 등화 · 깜빡이 · 그림자는 코드 메시. `city.js` 버스도 같음 | Tripo H3.1 image-to-3D, 텍스처 2048 → 1024(0.8 ~ 1.3MB), 삼각형 1.3 ~ 2.1만. 못 불러오면 코드 메시 |

| `cabin/base.webp` · `cabin/wheel.webp` · `cabin/map.jpg` | **실제 적용** (2026-11-07) | `cabin.js` 실내 바탕(앞유리 크로마키로 투명, 4K 업스케일) · 핸들(정면, CSS 3D 회전) · 센터 화면 지도(글자 없음) | WebP 583 · 202KB, JPEG 900 × 506 |
| `models/sedan.glb` | **교체** (2026-11-07 오후) | 첫 세단 모델은 텍스처가 단색 회색이라 버리고 은색 참고로 다시 생성 | 1.2MB |

- 차선 · 정지선 · 횡단보도 · 차량 · 보행자 위치는 모두 맵 좌표로 코드가 그린다. 생성 이미지는 노면 · 벽 · 보도의 **재질**로만 쓴다(주행 가능 영역과 무관).
- 텍스처를 못 불러오면 예전처럼 코드로 그린 텍스처가 그대로 쓰인다(`loadTex`). 3D 모델도 같다(`loadCarModels` — 코드 차량 메시가 그대로).

## Blender로 만든 모델 (2026-11-17 ~)

| 파일 | 쓰인 곳 | 만든 법 | 라이선스 |
|---|---|---|---|
| `models/hud_car.glb` (298KB, 삼각형 1.6만) | 리뉴얼 HUD 3차의 차 아이콘 — `src/hud/hud3.js` CAR3 층이 미니 도로와 같은 가상 카메라로 그림 | `blender/hud_car.py`(Blender 5.3 백그라운드 실행: 단면을 이어 붙이고 곡면 분할) → 원본 `blender/hud_car.blend`. 바깥에서 가져온 모양 · 텍스처 없음 | 직접 만든 것 |
| `models/hud_ped.glb` (57KB, 삼각형 3천) | 리뉴얼 HUD 3차의 보행자 아이콘 — 걷는 자세의 사람 | `blender/hud_ped.py`(둥근 덩어리를 합쳐 복셀 리메시) → `blender/hud_ped.blend` | 직접 만든 것 |
| `models/trees.glb` (819KB, 6그루 · 그루당 삼각형 1.9 ~ 3.2천) | 모든 나무 — `src/scene/trees.js`. 가까운 나무는 모델 그대로(인스턴싱, 90 ~ 180m 구역으로 묶어 화면 밖은 안 그림), 먼 나무는 같은 모델을 한 번 찍은 그림을 붙인 엇갈린 판 | `blender/trees.py`(줄기 · 가지를 대롱으로, 잎은 잎 덩어리 판) → `blender/trees.blend` | 모양은 직접 만든 것. 재질 사진은 아래 표 |
| `models/props.glb` (111KB, 2026-11-17 밤에 공사 구간 소품 추가) | 고속도로 가로등 `lamp_hw` · 도심 가로등 `lamp_city` · 가드레일 기둥 `rail_post` · **라바콘 `cone` · 방호 울타리 `barricade` · 공사 표지 `work_sign`**(⑤ 공사 구간, `city.js`) — `src/scene/props.js PROPM`(인스턴싱) | `blender/props.py` → `blender/props.blend` | 직접 만든 것(바깥에서 가져온 모양 없음) |

- 다시 만들기: `/Applications/Blender.app/Contents/MacOS/Blender -b --python assets/blender/<이름>.py`

## 3회차 그래픽 (2026-11-17) — Higgsfield 생성 + Blender 가공

| 파일 | 쓰인 곳 | 만든 법 | 라이선스 |
|---|---|---|---|
| `models/ped_1.glb` ~ `ped_4.glb` (234 ~ 272KB, 삼각형 약 1.4만, 뼈대 24개, 걷는 동작) | 횡단보도 보행자 — `src/scene/city.js PED_MODEL`(자리 6개에 4명을 돌려 씀, 걷는 속도에 맞춰 동작 재생) | ① 사람 사진(Higgsfield `gpt_image_2_6`, A자세 전신) → ② Tripo H3.1 image-to-3D(텍스처 포함) → ③ `blender/ped_orient.py`로 정면을 보게 돌리고 키 · 발 위치를 맞춤 → ④ Meshy 리깅 + 걷는 동작(Casual_Walk) → 원본 `blender/src/ped_N_rig.glb` → ⑤ `blender/ped_process.py`(텍스처 1024 JPEG · Draco 압축) → `blender/ped_N.blend` | AI 생성(실제 사람 아님). 이용 조건은 `../04_리서치/2026-10-29_AI생성에셋_Higgsfield.md` 2절 |
| `tex/bark_zelkova.jpg` · `tex/bark_pine.jpg` · `tex/needles_pine.webp` | 나무 껍질 · 솔잎 재질(`trees.js`) | Higgsfield `gpt_image_2_6` 생성 사진, 이음새 정리 · 배경 제거 | 위와 같음 |
| `tex/leaves.webp` | 느티나무 잎 덩어리(`trees.js`) | 2026-11-07 `leaves.png`를 WebP로 바꾼 것 | 위와 같음 |
| `models/sedan.glb` · `suv.glb` · `hatch.glb` · `truck.glb` · `bus.glb` | 교통 차량(모양 · 색 · 등화는 2026-11-07 그대로) | `blender/compress_glb.py`로 다시 내보냄 — Draco 압축 · 텍스처 1024 JPEG. 5개 합 6.0MB → 2.3MB | 2026-11-07과 같음 |

- 지운 파일: `tex/tree_pine.png` · `tex/tree_zelkova.png` · `tex/leaves.png`(나무를 모델로 바꿔 안 씀) · `tex/tire.jpg`(쓰는 곳 없음)
- Draco 압축본을 읽으려면 `DRACOLoader`가 필요(index.html, three r128 CDN). 보행자 뼈대 복제는 `SkeletonUtils`.
- 페이지 로딩 용량: 13.02MB → 8.72MB. 성능 수치는 `tests/perf-before.json` · `perf-after.json`(`node tests/perf-check.js after`)

## 배포 전 정리 · 최적화 (2026-11-17 밤)

- **텍스처 JPG → WebP**: `tex/*.jpg` 12장과 `cabin/map.jpg`를 WebP로 바꿨다(이 문서 위쪽 표의 `.jpg` 이름은 지금 모두 `.webp`). 아스팔트 · 잔디 · 길가 흙(1024px)은 품질 68, 나머지는 82 — 2배 확대 비교에서 차이가 보이지 않음. 1,882KB → 1,313KB
- **모델 Draco 압축**: 직접 만든 모델 4개도 압축해 내보낸다(`blender/*.py`의 내보내기 옵션). `trees.glb` 819 → 171KB · `props.glb` 111 → 29KB · `hud_car.glb` 298 → 37KB · `hud_ped.glb` 57 → 11KB. 읽는 쪽은 모두 `scene.js`의 공용 로더(`GLTF`, DRACOLoader)
- **저장소에서 뺀 것**: `blender/src/ped_N_rig.glb` 4개(5.2MB, 리깅 원본 — 같은 내용이 `blender/ped_N.blend`에 있음, git 기록 b8b16de) · 안 쓰는 코드(`modelLamps` · `grow3` · `WHEELBASE` · `KEY_ARROW` · `KEY_WORD`)
- 페이지 로딩 용량은 `tests/perf-after.json`

## 안내 모션그래픽 (2026-11-17 밤 → 2026-11-18 SVG로)

- 2026-11-18(D135 · D136): 안내 모션그래픽을 흰 바탕 · 파랑 하나의 2D(SVG + JS, `src/app/intro.js`)로 다시 만들면서 Blender 3D 렌더 파일 — `video/intro_*` 12개(2.7MB) · `blender/intro_mg.py` · `blender/intro_encode.sh` — 을 지웠다. 예전 파일은 git 기록 8b82bd4에 있음. 지금 안내는 그림 · 영상 파일 없이 코드로만 그린다
