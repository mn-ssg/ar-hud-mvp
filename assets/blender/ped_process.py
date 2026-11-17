"""보행자 모델 가공 (3회차 MVP 작업 3, 2026-11-17).
입력: Higgsfield로 만든 사람 모델 — ① 사람 사진(gpt_image_2_6, A자세) → ② Tripo H3.1 image-to-3D(텍스처 포함)
       → ②' Tripo 모델은 옆(+x)을 보고 나온다. 리깅 도구는 정면(+z)을 본다고 가정하므로 그대로 넣으면 뼈대가 90° 어긋나 게걸음이 된다
            → assets/blender/ped_orient.py로 정면을 보게 돌리고 · 키를 맞추고 · 발을 바닥에 둔 glb를 올려서
       → ③ Meshy 리깅 + 걷는 동작(Casual_Walk, 24개 뼈대). 그 결과 glb를 assets/blender/src/ped_<번호>_rig.glb로 둔다.
       (2026-11-17 밤, 배포 전 정리: 그 원본 glb 4개(5.2MB)는 저장소에서 뺐다 — 같은 내용이 가공된 장면 ped_<번호>.blend에 들어 있고, 원본은 git 기록 b8b16de에 있다. 다시 돌리려면 거기서 꺼내 src/에 둔다)
하는 일: 쓸모없는 물체(리깅 도구가 넣은 구) 삭제 · 텍스처 2048 → 1024 JPEG · 키를 1.7m 안팎으로 맞춤(뼈대째) · 메시는 Draco 압축 → assets/models/ped_<번호>.glb, 고친 장면은 assets/blender/ped_<번호>.blend
실행: /Applications/Blender.app/Contents/MacOS/Blender -b --python assets/blender/ped_process.py -- 1 1.74   (번호, 키 m)"""
import bpy, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[sys.argv.index('--') + 1:]
no, height = args[0], float(args[1]) if len(args) > 1 else 1.7
src = os.path.join(HERE, 'src', 'ped_%s_rig.glb' % no)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and not o.vertex_groups: bpy.data.objects.remove(o, do_unlink=True)      # 리깅 도구가 넣은 표시용 구
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); mesh = next(o for o in bpy.data.objects if o.type == 'MESH')
mesh.name = 'ped'; arm.name = 'ped_rig'
# 키 맞추기: 뼈대(부모)를 통째로 늘림
h = mesh.dimensions.z
if h > 0: s = height/h; arm.scale = (arm.scale[0]*s, arm.scale[1]*s, arm.scale[2]*s)
for im in bpy.data.images:
    if im.size[0] > 1024: im.scale(1024, 1024)
for a in bpy.data.actions: a.name = 'walk'
print('PED', no, 'tris', sum(len(p.vertices) - 2 for p in mesh.data.polygons), 'height', round(mesh.dimensions.z, 2), 'bones', len(arm.data.bones), 'actions', [(a.name, tuple(round(v, 1) for v in a.frame_range)) for a in bpy.data.actions], 'fps', bpy.context.scene.render.fps)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'ped_%s.blend' % no))
out = os.path.join(HERE, '..', 'models', 'ped_%s.glb' % no)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_animations=True, export_skins=True, export_image_format='JPEG', export_image_quality=82,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6, export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12)
print('PED wrote', os.path.getsize(out))
