"""기존 GLB를 다시 내보내 용량을 줄인다 (3회차 MVP 작업 3, 2026-11-17): 메시는 Draco 압축, 텍스처는 1024 이하 JPEG. 모양 · 재질은 그대로.
실행: /Applications/Blender.app/Contents/MacOS/Blender -b --python assets/blender/compress_glb.py -- assets/models/sedan.glb [다른 파일 ...]
(차량 5종 sedan · suv · hatch · truck · bus — Higgsfield Tripo 모델, 원본은 git 기록 2026-11-07)"""
import bpy, os, sys
for path in sys.argv[sys.argv.index('--') + 1:]:
    before = os.path.getsize(path)
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=path)
    for im in bpy.data.images:
        if max(im.size) > 1024: im.scale(1024, 1024)
    tris = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == 'MESH' for p in o.data.polygons)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_image_format='JPEG', export_image_quality=84,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6, export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12)
    print('GLB', os.path.basename(path), 'tris', tris, before//1024, 'KB ->', os.path.getsize(path)//1024, 'KB')
