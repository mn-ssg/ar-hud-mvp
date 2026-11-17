#!/bin/zsh
# 안내 모션그래픽: Blender가 쓴 PNG 프레임(intro_mg.py) → 빛 번짐을 얹어 mp4 · webp (2026-11-17 밤)
# 쓰는 법: assets/blender/intro_encode.sh <프레임 폴더>   → assets/video/intro_a · b · d.mp4, intro_keys_0.webp(바탕) · intro_key_<이름>.webp(눌리는 그림띠) · intro_keys.json(자리), intro_bg.webp
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
ffmpeg -y -loglevel error -start_number 1 -i "$SRC/c_%04d.png" -vf "$GLOW" -start_number 1 "$TMP/c_%04d.png"
# 기록 · 준비 장면 바탕: 시작 장면의 한 프레임을 흐리고 어둡게
ffmpeg -y -loglevel error -i "$SRC/a_0150.png" -vf "$GLOW,gblur=sigma=9,eq=brightness=-0.06:saturation=0.9" "$TMP/bg.png"
python3 - "$TMP" "$OUT" "$SRC/c_rects.json" <<'PY'
# '직접 눌러 보기': 바탕 1장(intro_keys_0.webp) + 키마다 눌리는 8프레임을 옆으로 이은 그림띠(intro_key_<이름>.webp, 투명 바탕).
# 투명도 = 그 프레임이 바탕과 달라진 정도 — 눌린 키와 그 빛만 남고, 안 바뀐 옆 키는 투명(먼저 켜진 옆 키를 덮어 지우지 않게). 자리는 intro_keys.json
import sys, json
from PIL import Image, ImageChops, ImageFilter
tmp, out, rj = sys.argv[1], sys.argv[2], sys.argv[3]
R = json.load(open(rj)); n = R['frames']; M = 44
base = Image.open(f'{tmp}/c_0001.png').convert('RGB'); W, H = base.size
base.save(f'{out}/intro_keys_0.webp', 'WEBP', quality=86, method=6)
meta = {'frames': n, 'size': [W, H], 'keys': {}}
for i, name in enumerate(R['order']):
    x0, y0, x1, y1 = R['rects'][name]; x0 = max(0, x0 - M); y0 = max(0, y0 - M); x1 = min(W, x1 + M); y1 = min(H, y1 + M); w, h = x1 - x0, y1 - y0
    strip = Image.new('RGBA', (w*n, h), (0, 0, 0, 0)); b = base.crop((x0, y0, x1, y1))
    for j in range(n):
        f = Image.open(f'{tmp}/c_{2 + i*n + j:04d}.png').convert('RGB').crop((x0, y0, x1, y1))
        d = ImageChops.difference(f, b); r, g, bl = d.split(); m = ImageChops.lighter(ImageChops.lighter(r, g), bl)
        a = m.point(lambda v: 0 if v < 5 else 255 if v > 34 else int((v - 5)/29*255)).filter(ImageFilter.GaussianBlur(1.2))
        f.putalpha(a); strip.paste(f, (j*w, 0))
    strip.save(f'{out}/intro_key_{name}.webp', 'WEBP', quality=90, method=6)
    meta['keys'][name] = [x0, y0, w, h]
json.dump(meta, open(f'{out}/intro_keys.json', 'w'))
Image.open(f'{tmp}/bg.png').convert('RGB').save(f'{out}/intro_bg.webp', 'WEBP', quality=78, method=6)
PY
rm -rf "$TMP"
ls -la "$OUT"
