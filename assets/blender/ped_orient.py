# Tripo 사람 모델을 정면(glTF +Z = Blender -Y)을 보게 돌리고, 키를 맞추고, 발을 바닥에 — 리깅 도구에 넣기 전 준비
import bpy, sys, os, math
from mathutils import Vector
src, dst, height = sys.argv[sys.argv.index('--') + 1:][:3]; height = float(height)
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=src)
o = next(x for x in bpy.data.objects if x.type == 'MESH')
bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM'); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
vs = [v.co.copy() for v in o.data.vertices]; zmin = min(v.z for v in vs); zmax = max(v.z for v in vs); H = zmax - zmin
up = [v for v in vs if (v.z - zmin)/H > .45 and (v.z - zmin)/H < .8]                       # 팔 · 몸통 높이
ex = max(v.x for v in up) - min(v.x for v in up); ey = max(v.y for v in up) - min(v.y for v in up)
lat = 'x' if ex > ey else 'y'                                                                # 팔을 벌린 쪽 = 좌우
f = Vector((0, 1, 0)) if lat == 'x' else Vector((1, 0, 0))
foot = [v for v in vs if (v.z - zmin)/H < .035]; shin = [v for v in vs if .09 < (v.z - zmin)/H < .2]
sgn = 1 if sum(v.dot(f) for v in foot)/len(foot) > sum(v.dot(f) for v in shin)/len(shin) else -1   # 발끝이 정강이보다 앞
o.rotation_mode = 'XYZ'   # glb를 읽으면 회전이 사원수 방식이라 오일러 값이 안 먹는다
fwd = f*sgn; ang = math.atan2(fwd.x, -fwd.y)                                                # fwd를 -Y로 보내는 z축 회전
o.rotation_euler = (0, 0, -ang) if abs(ang) > 1e-6 else (0, 0, 0)
# 회전 검산: R(z, a) * fwd == (0,-1,0)
import mathutils
R = mathutils.Matrix.Rotation(o.rotation_euler.z, 3, 'Z'); chk = R @ fwd
if (chk - Vector((0, -1, 0))).length > .01: o.rotation_euler = (0, 0, ang); chk = mathutils.Matrix.Rotation(ang, 3, 'Z') @ fwd
bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
s = height/H; o.scale = (s, s, s); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
vs = [v.co for v in o.data.vertices]; zmin = min(v.z for v in vs); cx = (max(v.x for v in vs) + min(v.x for v in vs))/2; cy = sum(v.y for v in vs)/len(vs)
o.location = (-cx, -cy, -zmin); bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
bpy.context.view_layer.update()
print('ORIENT', os.path.basename(src), 'lateral', lat, 'forward was', tuple(round(c, 1) for c in fwd), 'check', tuple(round(c, 2) for c in chk), 'dims', [round(d, 2) for d in o.dimensions])
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_yup=True, export_image_format='JPEG', export_image_quality=90)
