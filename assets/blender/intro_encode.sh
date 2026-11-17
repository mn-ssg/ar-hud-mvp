#!/bin/zsh
# 안내 모션그래픽: Blender가 쓴 PNG 프레임(intro_mg.py) → 빛 번짐을 얹어 mp4 · webp (2026-11-17 밤)
# 쓰는 법: assets/blender/intro_encode.sh <프레임 폴더>   → assets/video/intro_a · b · d.mp4, intro_keys_0 ~ 6.webp, intro_bg.webp
# 빛 번짐: 밝은 곳만 뽑아 흐리게 한 것을 스크린으로 얹는다(전조등 · 브레이크등 · 켜진 키가 번져 보임). 가장자리는 살짝 어둡게
set -e
SRC="$1"; OUT="$(cd "$(dirname "$0")/.." && pwd)/video"; mkdir -p "$OUT"
# format=gbrp: 섞기를 RGB 면에서 하게(그냥 두면 YUV 색차 면에 스크린이 걸려 화면 전체가 보라색이 된다)
GLOW="format=gbrp,split=2[a][b];[b]curves=all='0/0 0.55/0 1/1',gblur=sigma=16[g];[a][g]blend=all_mode=screen:all_opacity=0.75,format=gbrp,vignette=PI/5.5"
for s in a b d; do
  ffmpeg -y -loglevel error -framerate 30 -start_number 1 -i "$SRC/${s}_%04d.png" -vf "$GLOW,format=yuv420p" -c:v libx264 -preset slow -crf 23 -movflags +faststart -an "$OUT/intro_$s.mp4"
done
# 그림: 이 ffmpeg에는 webp 인코더가 없을 수 있어 PNG로 뽑은 뒤 Python(Pillow)으로 webp 저장
TMP="$(mktemp -d)"
for i in 1 2 3 4 5 6 7; do
  ffmpeg -y -loglevel error -i "$SRC/c_000$i.png" -vf "$GLOW" "$TMP/keys_$((i - 1)).png"
done
# 기록 · 준비 장면 바탕: 시작 장면의 한 프레임을 흐리고 어둡게
ffmpeg -y -loglevel error -i "$SRC/a_0150.png" -vf "$GLOW,gblur=sigma=9,eq=brightness=-0.06:saturation=0.9" "$TMP/bg.png"
python3 - "$TMP" "$OUT" <<'PY'
import sys
from PIL import Image
tmp, out = sys.argv[1], sys.argv[2]
for i in range(7): Image.open(f'{tmp}/keys_{i}.png').convert('RGB').save(f'{out}/intro_keys_{i}.webp', 'WEBP', quality=86, method=6)
Image.open(f'{tmp}/bg.png').convert('RGB').save(f'{out}/intro_bg.webp', 'WEBP', quality=78, method=6)
PY
rm -rf "$TMP"
ls -la "$OUT"
