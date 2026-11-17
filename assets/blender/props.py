"""도로가 소품 (3회차 MVP 작업 3, 2026-11-17) — 가로등 2종(고속도로 · 도심) · 가드레일 기둥.
실행: /Applications/Blender.app/Contents/MacOS/Blender -b --python assets/blender/props.py → assets/models/props.glb · assets/blender/props.blend
물체 이름 = 소품 이름(lamp_hw · lamp_city · rail_post). 재질 이름으로 코드(src/scene/props.js PROPM)가 장면 재질을 붙인다:
  galv = 아연도금 강(가드레일 · 기둥과 같은 재질) · lens = 등 렌즈(밤에 빛남) · dark = 검은 부품 · refl = 주황 반사체
  cone = 주황 플라스틱(라바콘 · 공사 표지) · band = 흰 반사 띠 · sign = 노란 판 (2026-11-17 밤: ⑤ 공사 구간 — cone · barricade · work_sign)
좌표: 위 = +Z, 팔은 +X(도로 쪽)로 뻗는다. 원점 = 기둥 밑동 가운데 바닥. 바깥에서 가져온 모양 없음."""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.read_factory_settings(use_empty=True)
MAT = {}
for n in ('galv', 'lens', 'dark', 'refl', 'cone', 'band', 'sign'):
    m = bpy.data.materials.new(n); m.use_nodes = True; MAT[n] = m

def finish(o, mat, smooth=True, bevel=0):
    o.data.materials.append(MAT[mat])
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL'); b.width = bevel; b.segments = 2; b.limit_method = 'ANGLE'; b.angle_limit = math.radians(40)
    for p in o.data.polygons: p.use_smooth = smooth
    return o
def box(size, loc, mat, bevel=0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot); o = bpy.context.active_object; o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True); return finish(o, mat, False, bevel)
def cyl(r0, r1, depth, loc, mat, verts=12, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r0, radius2=r1, depth=depth, location=loc, rotation=rot); return finish(bpy.context.active_object, mat)
def tube(pts, r0, r1, mat, sides=10):
    """점 목록을 따라 가늘어지는 둥근 대롱(굽은 팔)"""
    bm = bmesh.new(); rings = []; n = None
    for i, p in enumerate(pts):
        p = Vector(p); t = (Vector(pts[min(i + 1, len(pts) - 1)]) - Vector(pts[max(i - 1, 0)])).normalized()
        n = (Vector((0, 1, 0)) if n is None else (n - t*n.dot(t))).normalized(); b = t.cross(n); r = r0 + (r1 - r0)*i/(len(pts) - 1)
        rings.append([bm.verts.new(p + (n*math.cos(2*math.pi*j/sides) + b*math.sin(2*math.pi*j/sides))*r) for j in range(sides)])
    for a, c in zip(rings, rings[1:]):
        for j in range(sides): bm.faces.new((a[j], a[(j + 1) % sides], c[(j + 1) % sides], c[j]))
    bm.faces.new(rings[-1]); bm.faces.new(list(reversed(rings[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('tube'); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new('tube', me); bpy.context.collection.objects.link(o); return finish(o, mat)
def join(name, parts):
    dg = bpy.context.evaluated_depsgraph_get()
    for o in parts:
        ev = o.evaluated_get(dg); nm = bpy.data.meshes.new_from_object(ev); o.modifiers.clear(); o.data = nm
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts: o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join(); o = bpy.context.active_object; o.name = name
    print('PROP', name, 'tris', sum(len(p.vertices) - 2 for p in o.data.polygons), 'size', [round(v, 2) for v in o.dimensions]); return o

def led_head(x, z, length=.78, width=.3, tilt=.09):
    """납작한 LED 등 머리: 몸통(모깎기) + 위 방열 날개 + 아래 렌즈 면 + 팔에 끼우는 목"""
    rot = (0, -tilt, 0); c = Vector((x, 0, z)); out = []
    out.append(box((length, width, .075), c, 'galv', .018, rot))
    for k in range(7): out.append(box((length*.62, .012, .03), c + Vector((-.03, (k - 3)*.036, .05)), 'galv', 0, rot))     # 방열 날개
    out.append(box((length*.74, width*.72, .012), c + Vector((.03, 0, -.041)), 'lens', 0, rot))                              # 렌즈
    out.append(box((length*.8, width*.8, .02), c + Vector((.03, 0, -.03)), 'dark', 0, rot))                                  # 렌즈 테
    out.append(cyl(.04, .04, .22, c + Vector((-length/2 - .08, 0, -.012)), 'galv', 10, (0, math.pi/2 - tilt, 0)))
    return out

def lamp_hw():
    """고속도로 가로등: 높이 10m 팔각 테이퍼 기둥, 2.4m 굽은 팔, LED 등"""
    p = [cyl(.115, .062, 9.3, (0, 0, 4.65), 'galv', 8)]
    p.append(box((.42, .42, .03), (0, 0, .015), 'galv', .004))                                    # 바닥 플랜지
    for sx in (-1, 1):
        for sy in (-1, 1): p.append(cyl(.018, .018, .06, (sx*.16, sy*.16, .05), 'dark', 6))        # 앵커 볼트
    p.append(cyl(.135, .125, .55, (0, 0, .3), 'galv', 8))                                          # 밑동 보강
    p.append(box((.012, .1, .22), (.118, 0, .75), 'dark', 0))                                      # 점검구 덮개
    arm = [(0, 0, 9.1), (.02, 0, 9.45), (.14, 0, 9.78), (.42, 0, 9.98), (.95, 0, 10.07), (1.6, 0, 10.08), (2.02, 0, 10.07)]
    p.append(tube(arm, .05, .038, 'galv'))
    p += led_head(2.5, 10.05)
    return join('lamp_hw', p)

def lamp_city():
    """도심 가로등: 높이 9m, 차도 쪽 팔 1.9m + 반대쪽 낮은 보행등(4.6m)"""
    p = [cyl(.105, .06, 8.4, (0, 0, 4.2), 'galv', 12)]
    p.append(cyl(.19, .16, .9, (0, 0, .45), 'dark', 12)); p.append(cyl(.21, .21, .04, (0, 0, .02), 'dark', 12))     # 주물 밑동
    p.append(cyl(.075, .075, .05, (0, 0, .93), 'galv', 12))
    arm = [(0, 0, 8.25), (.03, 0, 8.6), (.2, 0, 8.86), (.6, 0, 8.98), (1.2, 0, 9.0), (1.55, 0, 8.99)]
    p.append(tube(arm, .045, .035, 'galv')); p += led_head(2.0, 8.97, .7, .28)
    arm2 = [(0, 0, 4.3), (-.05, 0, 4.5), (-.25, 0, 4.62), (-.62, 0, 4.63)]
    p.append(tube(arm2, .032, .028, 'galv')); h = led_head(-.92, 4.62, .5, .2, -.09)
    p += h
    p.append(cyl(.068, .068, .1, (0, 0, 4.3), 'dark', 12))                                         # 팔 고정 밴드
    return join('lamp_city', p)

def rail_post():
    """가드레일 기둥: ㄷ형 강 기둥 + 간격재(블록아웃) + 볼트. 빔 · 주황 반사체(20m마다)는 코드가 둔다. 원점 = 기둥 바닥, 빔 쪽 = +X"""
    p = [box((.012, .125, .86), (-.03, 0, .43), 'galv'), box((.065, .012, .86), (0, .0565, .43), 'galv'), box((.065, .012, .86), (0, -.0565, .43), 'galv')]
    p.append(box((.1, .09, .3), (.052, 0, .56), 'galv', .006))                                     # 간격재
    p.append(cyl(.011, .011, .03, (.11, 0, .62), 'dark', 6, (0, math.pi/2, 0))); p.append(cyl(.011, .011, .03, (.11, 0, .5), 'dark', 6, (0, math.pi/2, 0)))
    return join('rail_post', p)

def cone():
    """라바콘: 높이 0.72m, 검은 고무 받침 + 주황 몸통 + 흰 반사 띠 2줄"""
    p = [box((.38, .38, .035), (0, 0, .0175), 'dark', .006)]
    seg = [(0.035, .20, .145, .112, 'cone'), (.20, .34, .112, .086, 'band'), (.34, .44, .086, .068, 'cone'), (.44, .54, .068, .050, 'band'), (.54, .72, .050, .022, 'cone')]   # (아래 z, 위 z, 아래 반지름, 위 반지름, 재질)
    for z0, z1, r0, r1, m in seg: p.append(cyl(r0, r1, z1 - z0, (0, 0, (z0 + z1)/2), m, 14))
    p.append(cyl(.022, .022, .012, (0, 0, .726), 'cone', 10))
    return join('cone', p)

def barricade():
    """A자 방호 울타리: 폭 1.3m · 높이 1.0m, 노랑 · 검정 빗금 판 2장 + 위에 주황 경고등. 판이 +Y · −Y를 본다(차가 오는 쪽으로 돌려 놓는다)"""
    p = []
    for sx in (-.58, .58):
        for sy, ang in ((-.16, .16), (.16, -.16)): p.append(box((.035, .035, 1.02), (sx, sy*.55, .5), 'galv', 0, (ang, 0, 0)))   # 다리 4개(앞뒤로 벌어짐)
    for z in (.82, .47):
        for k in range(8): p.append(box((.1625, .028, .2), (-.569 + k*.1625, 0, z), 'sign' if k % 2 == 0 else 'dark', 0))            # 빗금 대신 노랑 · 검정 칸
        p.append(box((1.32, .02, .22), (0, 0, z), 'galv', 0))
    p.append(cyl(.05, .05, .07, (-.45, 0, 1.0), 'refl', 10)); p.append(cyl(.05, .05, .07, (.45, 0, 1.0), 'refl', 10))                  # 경고등
    return join('barricade', p)

def work_sign():
    """공사 주의 표지: 삼각대 위 주황 마름모 판(0.8m) + 검은 느낌표. 판이 −Y(= 장면에서 차가 오는 쪽으로 돌려 놓음)를 본다"""
    p = []
    for a in (0, 2.1, 4.2): p.append(box((.03, .03, 1.05), (.2*math.cos(a), .12 + .2*math.sin(a), .5), 'galv', 0, (-.2*math.sin(a), .2*math.cos(a), 0)))
    p.append(box((.8, .02, .8), (0, 0, 1.25), 'cone', .01, (0, math.pi/4, 0)))
    p.append(box((.86, .012, .86), (0, .012, 1.25), 'dark', 0, (0, math.pi/4, 0)))                                                       # 뒤판(검은 테)
    p.append(box((.09, .012, .36), (0, -.014, 1.33), 'dark', 0)); p.append(box((.09, .012, .09), (0, -.014, 1.05), 'dark', 0))           # 느낌표
    return join('work_sign', p)

objs = [lamp_hw(), lamp_city(), rail_post(), cone(), barricade(), work_sign()]
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'props.blend'))
out = os.path.join(HERE, '..', 'models', 'props.glb')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_yup=True, export_texcoords=False, export_materials='EXPORT')
print('PROP wrote', os.path.getsize(out))
