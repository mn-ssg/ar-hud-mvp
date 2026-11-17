"""HUD 보행자 아이콘 모델 (리뉴얼 HUD 3차, 2026-11-17) — 걷는 자세의 사람 한 명. 키 1.72m, 앞 = +Y(glb에서는 -Z), 원점 = 발 사이 바닥.
실행: /Applications/Blender.app/Contents/MacOS/Blender -b --python assets/blender/hud_ped.py → assets/models/hud_ped.glb · assets/blender/hud_ped.blend
HUD에서는 한 가지 색의 빛으로 그리므로(hud3.js) 재질은 하나. 몸통 · 머리 · 팔다리를 둥근 덩어리로 만들어 하나로 합친 뒤 곡면을 다듬는다.
왼발이 앞, 오른팔이 앞인 한 걸음 자세 — HUD가 0.45초마다 좌우를 뒤집어 걷는 것처럼 보이게 한다."""
import bpy, math, os
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.read_factory_settings(use_empty=True)
mat = bpy.data.materials.new('body'); mat.use_nodes = True
parts = []
def capsule(a, b, r0, r1, seg=14):
    """a → b로 가늘어지는 둥근 막대"""
    a, b = Vector(a), Vector(b); d = b - a; L = d.length
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r0, radius2=r1, depth=L, location=(a + b)/2)
    o = bpy.context.active_object; o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    parts.append(o)
    for p, r in ((a, r0), (b, r1)):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=8, radius=r, location=p); parts.append(bpy.context.active_object)
def blob(loc, scale, seg=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=12, radius=1, location=loc); o = bpy.context.active_object; o.scale = scale; parts.append(o)
# 몸통 · 골반 · 목 · 머리
blob((0, 0, 1.22), (.185, .115, .30)); blob((0, .005, .98), (.165, .11, .14)); capsule((0, 0, 1.46), (0, .01, 1.56), .05, .048)
blob((0, .015, 1.635), (.092, .105, .112))
# 다리: 왼발 앞 · 오른발 뒤 (엉덩이 0.94 → 무릎 → 발목), 발
for sx, hipA, kneeB in ((-1, .36, -.10), (1, -.30, -.46)):
    hip = Vector((sx*.085, 0, .94)); knee = hip + Vector((0, math.sin(hipA)*.44, -math.cos(hipA)*.44)); ank = knee + Vector((0, math.sin(hipA + kneeB)*.43, -math.cos(hipA + kneeB)*.43))
    capsule(hip, knee, .082, .062); capsule(knee, ank, .06, .044)
    blob((ank.x, ank.y + .055, max(.045, ank.z - .035)), (.05, .125, .045))
# 팔: 오른팔 앞 · 왼팔 뒤 (어깨 1.43 → 팔꿈치 → 손)
for sx, shA, elB in ((1, .42, .35), (-1, -.36, .18)):
    sh = Vector((sx*.215, 0, 1.43)); el = sh + Vector((sx*.02, math.sin(shA)*.29, -math.cos(shA)*.29)); hand = el + Vector((0, math.sin(shA + elB)*.27, -math.cos(shA + elB)*.27))
    capsule(sh, el, .052, .042); capsule(el, hand, .04, .034); blob(hand + Vector((0, .01, -.03)), (.036, .04, .05), 12)
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join()
body = bpy.context.active_object; body.name = 'hud_ped'
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
# 겹친 덩어리를 한 겉면으로(복셀 리메시) → 매끈하게 → 면 수 줄이기
rm = body.modifiers.new('remesh', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = .014; rm.use_smooth_shade = True
sm = body.modifiers.new('smooth', 'CORRECTIVE_SMOOTH'); sm.iterations = 8; sm.factor = .6
dc = body.modifiers.new('decimate', 'DECIMATE'); dc.ratio = .12
for m in list(body.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
body.data.materials.append(mat)
for p in body.data.polygons: p.use_smooth = True
print('HUD_PED tris', sum(len(p.vertices) - 2 for p in body.data.polygons), 'size', [round(v, 3) for v in body.dimensions])
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'hud_ped.blend'))
out = os.path.join(HERE, '..', 'models', 'hud_ped.glb')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_yup=True, export_texcoords=False, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6, export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12, export_draco_color_quantization=10)   # Draco 압축(2026-11-17 밤)
print('HUD_PED wrote', os.path.getsize(out))
