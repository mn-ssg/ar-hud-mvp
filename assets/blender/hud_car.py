"""HUD 차 아이콘용 세단 모델 (리뉴얼 HUD 3차, 2026-11-17).
실행: /Applications/Blender.app/Contents/MacOS/Blender -b --python assets/blender/hud_car.py
결과: assets/models/hud_car.glb (HUD가 읽음) · assets/blender/hud_car.blend (고칠 때 여는 원본)

만드는 법: 차 길이 방향으로 단면(반쪽 8점 → 한 바퀴 14점)을 여러 장 세우고 이어 붙인 뒤(loft) 곡면 분할(Subdivision)로 다듬는다.
옆모습(지붕선) · 평면(폭) · 바닥선은 아래 표의 숫자로 정한다 — 준중형 세단(길이 4.65 · 폭 1.83 · 높이 1.43m, 축거 2.72m) 비례.
유리 · 미등 · 전조등은 따로 붙인 조각이 아니라 차체 면의 재질을 나눈 것(면을 따라 감김). 바퀴만 따로 만든 원기둥.
좌표: 앞 = +Y, 위 = +Z, 원점 = 바닥 가운데 (glb로 내보내면 앞 = -Z, 위 = +Y — three.js 장면의 차와 같은 방향)."""
import bpy, bmesh, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_GLB = os.path.join(HERE, '..', 'models', 'hud_car.glb')
OUT_BLEND = os.path.join(HERE, 'hud_car.blend')
L, W = 4.65, 1.825
HL, HW = L/2, W/2

def lerp_tab(tab, y):
    for (y0, v0), (y1, v1) in zip(tab, tab[1:]):
        if y <= y1:
            t = (y - y0)/(y1 - y0) if y1 > y0 else 0
            t = max(0.0, min(1.0, t)); t = t*t*(3 - 2*t)      # 구간마다 부드럽게
            return v0 + (v1 - v0)*t
    return tab[-1][1]

# 옆모습: 위쪽 윤곽선 (y, z) — 뒤(-) → 앞(+). 트렁크 끝 → 트렁크 → 뒤 유리 → 지붕 → 앞 유리 → 보닛 → 코
ROOF = [(-HL, .98), (-2.05, 1.035), (-1.64, 1.06), (-1.08, 1.31), (-.70, 1.405), (-.25, 1.43), (.25, 1.42), (.55, 1.355), (1.22, 1.03), (1.78, .96), (2.12, .875), (HL, .76)]
BELT = .975                      # 창 아래선 높이
SIDE_WIN = (-.94, .94)           # 옆 유리 구간 — 그 뒤는 C필러, 앞은 A필러 밑동
B_PILLAR = (-.16, -.06)
REAR_WIN, WIND = (-1.64, -.70), (.55, 1.22)
WHEEL_Y, WHEEL_R = 1.36, .33
STATIONS = [-HL, -2.27, -2.08, -1.92, -1.78, -1.64, -1.50, -1.36, -1.22, -1.08, -.94, -.70, -.42, -.16, -.06, .25, .55, .76, .94, 1.08, 1.22, 1.36, 1.50, 1.64, 1.78, 1.94, 2.10, 2.26, HL]

def half_width(y):
    a = abs(y)/HL
    return HW*(1 - .055*a**3 - .10*max(0, (a - .86)/.14)**2)      # 가운데가 가장 넓고 양 끝은 둥글게 좁아짐

def floor_z(y):
    a = max(0, (abs(y) - 1.95)/(HL - 1.95))
    return .20 + .13*a*a                                           # 범퍼 아래는 살짝 들림

def section(y):
    """한 단면의 오른쪽 반(x >= 0) 8점: 바닥 가운데 → 바닥 모서리 → 문턱 → 허리선 아래 → 창 아래선 → 지붕 모서리 → 지붕 어깨 → 지붕 가운데"""
    w, z0, zr = half_width(y), floor_z(y), lerp_tab(ROOF, y)
    zb = min(zr - .025, BELT + .012*(y/HL))
    gh = max(0.0, min(1.0, (zr - zb)/.40))                         # 유리 구간이면 1 — 위로 갈수록 안으로 기움(텀블홈)
    inset = .035 + .215*gh
    dy = abs(abs(y) - WHEEL_Y); arch = WHEEL_R + .075 + math.sqrt(max(0.0, .42**2 - dy**2)) - .42 + .34 if dy < .42 else 0.0     # 휠 아치: 바퀴 위로 반원
    za, zk = max(z0, arch), max(z0 + .15, arch + .02)
    return [(0, z0), (w*.78, za), (w*.985, zk), (w, zb - .17), (w*.992, zb), (w - inset, zr - .045 - .02*gh), (w - inset - .13, zr - .004), (0, zr + .012)]

def ring(y, k=1.0, zc=.62):
    h = section(y)
    pts = h + [(-x, z) for x, z in reversed(h[1:-1])]
    return [(x*k, y, zc + (z - zc)*k) for x, z in pts]

def mat(name, rgb, rough=.5, metal=0.0, emit=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = 1.0
    return m

bpy.ops.wm.read_factory_settings(use_empty=True)
MATS = [mat('body', (.86, .87, .88), .35, .3), mat('glass', (.03, .04, .05), .08, 0), mat('lamp_tail', (.75, .05, .04), .3, 0, (.6, .02, .02)),
        mat('lamp_head', (.95, .95, .9), .2, 0, (.8, .8, .7)), mat('tire', (.02, .02, .02), .9), mat('rim', (.55, .56, .58), .3, .8)]
BODY, GLASSM, TAIL, HEAD, TIRE, RIM = range(6)

bm = bmesh.new()
rings = [ring(-HL - .03, .60)] + [ring(y) for y in STATIONS] + [ring(HL + .028, .62)]
ys = [-HL - .03] + STATIONS + [HL + .028]
vr = [[bm.verts.new(p) for p in r] for r in rings]
N = len(rings[0])
crease = bm.edges.layers.float.new('crease_edge')
for i in range(len(vr) - 1):
    ym = (ys[i] + ys[i+1])/2
    for j in range(N):
        f = bm.faces.new((vr[i][j], vr[i][(j+1) % N], vr[i+1][(j+1) % N], vr[i+1][j]))
        side_win, top = j in (4, 9), j in (5, 6, 7, 8)
        m = BODY
        if side_win and SIDE_WIN[0] < ym < SIDE_WIN[1] and not (B_PILLAR[0] < ym < B_PILLAR[1]): m = GLASSM
        if top and (REAR_WIN[0] < ym < REAR_WIN[1] or WIND[0] < ym < WIND[1]): m = GLASSM
        if j in (3, 10):                         # 허리선 아래 띠: 맨 뒤 두 칸 = 미등, 맨 앞 두 칸 = 전조등 (면을 따라 모서리를 감쌈)
            if i <= 1: m = TAIL
            if i >= len(vr) - 3: m = HEAD
        f.material_index = m
bm.faces.new(list(reversed(vr[0]))).material_index = BODY
bm.faces.new(vr[-1]).material_index = BODY
bm.normal_update()
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
# 날을 세울 모서리: 창 아래선 · 지붕 모서리 · 문턱 · 앞뒤 끝 테두리 — 곡면 분할 뒤에도 덩어리지지 않게
for e in bm.edges:
    a, b = e.verts
    ia = [(i, r.index(a)) for i, r in enumerate(vr) if a in r][0]; ib = [(i, r.index(b)) for i, r in enumerate(vr) if b in r][0]
    if ia[1] == ib[1] and ia[0] != ib[0]:        # 길이 방향 모서리
        j = ia[1]
        if j in (4, 10): e[crease] = .55          # 창 아래선
        elif j in (5, 9): e[crease] = .5          # 지붕 모서리(유리 위)
        elif j in (2, 12): e[crease] = .45        # 문턱 · 휠 아치 가장자리
        elif j in (3, 11): e[crease] = .3
    elif ia[0] == ib[0] and ia[0] in (1, len(vr) - 2): e[crease] = .6      # 앞뒤 끝 테두리
    elif ia[0] == ib[0] and ia[0] in (0, len(vr) - 1): e[crease] = .45
me = bpy.data.meshes.new('hud_car_body'); bm.to_mesh(me); bm.free()
for m in MATS: me.materials.append(m)
body = bpy.data.objects.new('hud_car', me); bpy.context.collection.objects.link(body)
for p in me.polygons: p.use_smooth = True
sub = body.modifiers.new('subdiv', 'SUBSURF'); sub.levels = 2; sub.render_levels = 2   # HUD 아이콘은 60px 안팎 — 2단계면 충분

# 바퀴: 타이어(검정) + 휠(밝은 원판). 축거 2.72 · 윤거 1.58
def wheel(x, y, r=.33, wd=.225):
    bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=r, depth=wd, location=(x, y, r), rotation=(0, math.pi/2, 0))
    t = bpy.context.active_object; t.data.materials.append(MATS[TIRE])
    bv = t.modifiers.new('bevel', 'BEVEL'); bv.width = .045; bv.segments = 3; bv.limit_method = 'ANGLE'
    for p in t.data.polygons: p.use_smooth = True
    s = 1 if x > 0 else -1
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=r*.62, depth=.02, location=(x + s*(wd/2 - .012), y, r), rotation=(0, math.pi/2, 0))
    k = bpy.context.active_object; k.data.materials.append(MATS[RIM])
    return [t, k]
parts = []
for sx in (-1, 1):
    for wy in (-WHEEL_Y, WHEEL_Y): parts += wheel(sx*.79, wy, WHEEL_R)

bpy.ops.object.select_all(action='DESELECT')
dg = bpy.context.evaluated_depsgraph_get()
for o in [body] + parts:                           # 수정자(곡면 분할 · 모깎기)를 굳힌 뒤 하나로 합침
    ev = o.evaluated_get(dg); nm = bpy.data.meshes.new_from_object(ev); o.modifiers.clear(); o.data = nm
for o in [body] + parts: o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
for p in body.data.polygons: p.use_smooth = True
body.name = 'hud_car'
print('HUD_CAR tris', sum(len(p.vertices) - 2 for p in body.data.polygons), 'size', [round(v, 3) for v in body.dimensions])
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', export_apply=True, export_yup=True, export_materials='EXPORT', export_normals=True, export_texcoords=False, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6, export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12, export_draco_color_quantization=10)   # Draco 압축(2026-11-17 밤)
print('HUD_CAR wrote', OUT_GLB, os.path.getsize(OUT_GLB))
