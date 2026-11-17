"""주행 테스트 안내 모션그래픽 — 3D 장면 렌더 (2026-11-17 밤, 사용자: '블렌더나 힉스필드로 고퀄리티 모션그래픽').
src/app/intro.js(TOUR)의 장면 뒤에 깔리는 영상 · 그림을 만든다. 글자 · 자막은 영상에 넣지 않는다(페이지가 그 위에 그림 — 문장을 고쳐도 다시 렌더할 필요 없음).

실행: /Applications/Blender.app/Contents/MacOS/Blender -b --python assets/blender/intro_mg.py -- <장면> <출력 폴더> [시작 프레임 끝 프레임] [--still]
  장면: a(시작 5.5초) · b(조작 14.2초) · c(눌러 보기 — 그림 7장: 바탕 + 키 6개가 하나씩 켜진 것) · d(할 일 14초)
  PNG 프레임을 출력 폴더에 쓴다 → assets/blender/intro_encode.sh가 ffmpeg로 빛 번짐을 얹어 mp4 · webp로 만든다.
차는 hud_car.blend(직접 만든 세단), 가로등은 props.blend에서 가져온다. 바깥에서 가져온 모양 · 그림 없음.
시간 식(T · sway · speed)은 intro.js의 조작 장면과 같은 값이라 영상과 자막 · 속도 숫자가 맞는다 — 한쪽을 고치면 다른 쪽도."""
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:]
SHOT, OUT = argv[0], argv[1]
STILL = '--still' in argv
nums = [int(a) for a in argv[2:] if a.lstrip('-').isdigit()]
FPS, W, H = 30, 1280, 720
LANE = 3.5

cl = lambda x, a=0.0, b=1.0: min(b, max(a, x))
ss = lambda t: (lambda u: u*u*(3 - 2*u))(cl(t))
seg = lambda t, a, b: cl((t - a)/(b - a))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x, scene.render.resolution_y, scene.render.fps = W, H, FPS
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
ee = scene.eevee
for k, v in (('taa_render_samples', 40), ('use_raytracing', True), ('use_shadows', True), ('use_gtao', True)):
    if hasattr(ee, k): setattr(ee, k, v)
scene.render.use_motion_blur = SHOT in ('a', 'b', 'd')
scene.render.motion_blur_shutter = .45
try: scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Medium High Contrast'
except Exception: pass

# ---------- 재질 ----------
def mat(name, color=(1, 1, 1), rough=.5, metal=0, emit=None, estr=0, coat=0, alpha=1):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if coat and 'Coat Weight' in b.inputs: b.inputs['Coat Weight'].default_value = coat; b.inputs['Coat Roughness'].default_value = .06
    if emit is not None:
        b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = estr
    if alpha < 1: b.inputs['Alpha'].default_value = alpha
    return m
def emis(m): return m.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength']
def emcol(m): return m.node_tree.nodes.get('Principled BSDF').inputs['Emission Color']
def key_val(sock, frame, v):
    sock.default_value = v; sock.keyframe_insert('default_value', frame=frame)

M = {
    'asphalt': mat('asphalt', (.028, .031, .036), .62),
    'paint': mat('paint', (.82, .84, .86), .5, 0, (1, 1, 1), .35),
    'ground': mat('ground', (.012, .016, .02), .9),
}
# 아스팔트 결: 잔 알갱이 거칠기
def asphalt_grain(m):
    nt = m.node_tree; b = nt.nodes['Principled BSDF']; n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 90; n.inputs['Detail'].default_value = 6
    r = nt.nodes.new('ShaderNodeMapRange'); r.inputs['To Min'].default_value = .42; r.inputs['To Max'].default_value = .8
    nt.links.new(n.outputs['Fac'], r.inputs['Value']); nt.links.new(r.outputs['Result'], b.inputs['Roughness'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .25; nt.links.new(n.outputs['Fac'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
asphalt_grain(M['asphalt'])

# ---------- 하늘(반사용): 어두운 남색 바탕 + 위쪽 넓은 부드러운 빛 + 뒤쪽 청록 띠 — 차체 · 키에 스튜디오 조명 같은 반사가 생긴다 ----------
def world():
    w = bpy.data.worlds.new('w'); scene.world = w; w.use_nodes = True; nt = w.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld'); bg = nt.nodes.new('ShaderNodeBackground'); tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    def band(axis, lo, hi, col, strength):
        r = nt.nodes.new('ShaderNodeMapRange'); r.interpolation_type = 'SMOOTHSTEP'; r.inputs['From Min'].default_value = lo; r.inputs['From Max'].default_value = hi
        nt.links.new(sep.outputs[axis], r.inputs['Value']); c = nt.nodes.new('ShaderNodeMix'); c.data_type = 'RGBA'; c.inputs['A'].default_value = (0, 0, 0, 1); c.inputs['B'].default_value = (*[v*strength for v in col], 1)
        nt.links.new(r.outputs['Result'], c.inputs['Factor']); return c.outputs['Result']
    top = band('Z', .55, .98, (.75, .85, 1.0), 1.5)            # 머리 위 넓은 빛
    back = band('Y', -.2, -.95, (0, .75, 1.0), .9)             # 뒤쪽 청록
    side = band('X', .5, .98, (1.0, .72, .45), .35)            # 오른쪽 따뜻한 빛 조금
    a1 = nt.nodes.new('ShaderNodeMix'); a1.data_type = 'RGBA'; a1.blend_type = 'ADD'; a1.inputs['Factor'].default_value = 1; nt.links.new(top, a1.inputs['A']); nt.links.new(back, a1.inputs['B'])
    a2 = nt.nodes.new('ShaderNodeMix'); a2.data_type = 'RGBA'; a2.blend_type = 'ADD'; a2.inputs['Factor'].default_value = 1; nt.links.new(a1.outputs['Result'], a2.inputs['A']); nt.links.new(side, a2.inputs['B'])
    base = nt.nodes.new('ShaderNodeMix'); base.data_type = 'RGBA'; base.blend_type = 'ADD'; base.inputs['Factor'].default_value = 1; base.inputs['A'].default_value = (.006, .009, .016, 1); nt.links.new(a2.outputs['Result'], base.inputs['B'])
    lp = nt.nodes.new('ShaderNodeLightPath'); cam_mix = nt.nodes.new('ShaderNodeMix'); cam_mix.data_type = 'RGBA'; cam_mix.inputs['B'].default_value = (.004, .006, .011, 1)   # 카메라에 직접 보이는 하늘은 어두운 남색만
    nt.links.new(lp.outputs['Is Camera Ray'], cam_mix.inputs['Factor']); nt.links.new(base.outputs['Result'], cam_mix.inputs['A'])
    nt.links.new(cam_mix.outputs['Result'], bg.inputs['Color']); bg.inputs['Strength'].default_value = .55; nt.links.new(bg.outputs[0], out.inputs[0])
world()

def box(name, size, loc, material, parent=None, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o = bpy.context.active_object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL'); b.width = bevel; b.segments = 4
        for p in o.data.polygons: p.use_smooth = True
    o.data.materials.append(material)
    if parent: o.parent = parent
    return o
def empty(name, parent=None):
    e = bpy.data.objects.new(name, None); scene.collection.objects.link(e)
    if parent: e.parent = parent
    return e
def light(kind, name, energy, color, loc, rot=(0, 0, 0), size=1, parent=None, spot=None):
    d = bpy.data.lights.new(name, kind); d.energy = energy; d.color = color
    if kind == 'AREA': d.size = size
    if kind == 'SPOT' and spot: d.spot_size = spot[0]; d.spot_blend = spot[1]
    if hasattr(d, 'shadow_soft_size') and kind != 'AREA': d.shadow_soft_size = size
    o = bpy.data.objects.new(name, d); scene.collection.objects.link(o); o.location = loc; o.rotation_euler = rot
    if parent: o.parent = parent
    return o

# ---------- 차: 교통 차량 모델(assets/models/<종류>.glb — 주행 화면과 같은 차, Higgsfield Tripo 2026-11-07)을 앞 = +Y · 실제 크기로 맞춰 가져온다 ----------
# (처음엔 HUD 아이콘용 세단 hud_car.blend를 썼는데 가까이서는 찰흙 덩어리처럼 보였다 → 텍스처가 있는 주행용 모델로)
CARS = {'sedan': dict(L=4.6, W=1.84, tail=.84, hy=.72), 'suv': dict(L=4.7, W=1.9, tail=1.02, hy=.84), 'hatch': dict(L=4.1, W=1.78, tail=.9, hy=.7)}
def glow(name, size, loc, color, parent):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=.5, location=loc); o = bpy.context.active_object; o.name = name; o.scale = size
    for p in o.data.polygons: p.use_smooth = True
    m = mat(name + '_m', (0, 0, 0), .4, 0, color, 0); o.data.materials.append(m); o.parent = parent; return o, m
def car(name, kind='sedan', tint=None, glows=True):     # glows=False: 가까이 잡는 장면 — 등 자리의 빛 조각이 떠 보이므로 빼고 노면에 비치는 빛만
    T = CARS[kind]; before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(HERE, '..', 'models', kind + '.glb'))
    parts = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    bpy.context.view_layer.update()
    for o in parts: mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw          # 부모(빈 물체)의 회전 · 크기를 메시에 남긴 채 떼어 냄
    for o in [o for o in bpy.data.objects if o not in before and o.type != 'MESH']: bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts: o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1: bpy.ops.object.join()
    o = bpy.context.active_object; o.name = name; o.parent = None
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # 주축(길이)을 +Y로 — 주행 화면의 맞춤(scene.js alignModelGeo)과 같은 계산이라 앞뒤가 같다
    vs = [v.co.copy() for v in o.data.vertices]; mx = sum(v.x for v in vs)/len(vs); my = sum(v.y for v in vs)/len(vs)
    cxx = sum((v.x - mx)**2 for v in vs); czz = sum((v.y - my)**2 for v in vs); cxz = sum((v.x - mx)*(-(v.y - my)) for v in vs)
    o.rotation_mode = 'XYZ'      # glTF 가져오기는 회전 방식을 QUATERNION으로 둔다 — 그대로면 아래 오일러 값이 무시됨
    o.rotation_euler = (0, 0, .5*math.atan2(2*cxz, cxx - czz) + math.pi/2); bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    xs = [v.co.x for v in o.data.vertices]; ys = [v.co.y for v in o.data.vertices]; zs = [v.co.z for v in o.data.vertices]
    sx, sy = T['W']/(max(xs) - min(xs)), T['L']/(max(ys) - min(ys)); o.location = (-(max(xs) + min(xs))/2*sx, -(max(ys) + min(ys))/2*sy, -min(zs)*math.sqrt(sx*sy)); o.scale = (sx, sy, math.sqrt(sx*sy))
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)
    for p in o.data.polygons: p.use_smooth = True
    for m in o.data.materials:
        b = m.node_tree.nodes.get('Principled BSDF')
        if not b: continue
        b.inputs['Roughness'].default_value = .34; b.inputs['Metallic'].default_value = 0
        for nm in ('Roughness', 'Metallic'):
            for l in list(b.inputs[nm].links): m.node_tree.links.remove(l)
        if 'Coat Weight' in b.inputs: b.inputs['Coat Weight'].default_value = .7; b.inputs['Coat Roughness'].default_value = .08
        if tint:                                    # 텍스처 색에 곱해 어둡게(뒤차)
            link = b.inputs['Base Color'].links[0] if b.inputs['Base Color'].links else None
            if link:
                mx_ = m.node_tree.nodes.new('ShaderNodeMix'); mx_.data_type = 'RGBA'; mx_.blend_type = 'MULTIPLY'; mx_.inputs['Factor'].default_value = 1; mx_.inputs['B'].default_value = (*tint, 1)
                m.node_tree.links.new(link.from_socket, mx_.inputs['A']); m.node_tree.links.new(mx_.outputs['Result'], b.inputs['Base Color'])
    root = empty(name + '_root'); o.parent = root; L, Wd = T['L'], T['W']
    # 등: 텍스처에 그려진 등 자리에 납작한 빛 조각(빛 번짐으로 등처럼 보임) + 노면에 비치는 빛. 깜빡이는 꺼지면 크기 0
    tails = [glow(f'{name}_tl{sx}', (.44, .05, .1), (sx*(Wd/2 - .36), -L/2 + .015, T['tail']), (1, .04, .02), root) for sx in (-1, 1)] if glows else []
    for sx in ((-1, 1) if glows else ()):
        _, hm = glow(f'{name}_hl{sx}', (.36, .05, .1), (sx*(Wd/2 - .36), L/2 - .02, T['hy']), (1, .95, .8), root); emis(hm).default_value = 22
    bl = {sx: [glow(f'{name}_bl{sx}{sy}', (.18, .14, .1), (sx*(Wd/2 - .12), sy*(L/2 - .1), T['tail'] if sy < 0 else T['hy']), (1, .5, .03), root) for sy in (-1, 1)] for sx in (-1, 1)}
    for sx in (-1, 1):
        for g_, m_ in bl[sx]: emis(m_).default_value = 45
    light('SPOT', name + '_hl', 1500, (1, .95, .85), (0, L/2 - .2, .7), (math.radians(80), 0, 0), .15, root, (math.radians(70), .6))
    br = light('POINT', name + '_brl', 0, (1, .08, .04), (0, -L/2 - .3, .75), size=.3, parent=root)
    if not glows: light('POINT', name + '_tailglow', 55, (1, .06, .03), (0, -L/2 - .22, T['tail']), size=.5, parent=root)   # 미등이 켜진 느낌(뒤 범퍼 · 노면에 붉은 빛)
    return {'root': root, 'mesh': o, 'tails': tails, 'blink': bl, 'brake_light': br, 'L': L, 'W': Wd}

def car_state(c, frame, brake=False, blink=0):
    for g_, m_ in c['tails']: key_val(emis(m_), frame, 34 if brake else 2.4)
    c['brake_light'].data.energy = 300 if brake else 0; c['brake_light'].data.keyframe_insert('energy', frame=frame)
    for sx in (-1, 1):
        for g_, m_ in c['blink'][sx]:
            k = 1.0 if blink == sx else 0.0; g_.scale = (.18*k, .14*k, .1*k); g_.keyframe_insert('scale', frame=frame)

# ---------- 도로: 차로 n개 · 길이 length. 차선은 살짝 빛나는 흰 띠. parent에 붙여 통째로 뒤로 민다 ----------
def road(parent, lanes=3, y0=-120, y1=520, extra=None):
    wd = lanes*LANE; box('road', (wd + 1.2, y1 - y0, .1), (0, (y0 + y1)/2, -.05), M['asphalt'], parent)
    box('ground', (400, y1 - y0, .1), (0, (y0 + y1)/2, -.12), M['ground'], parent)
    for sx in (-1, 1): box('edge', (.18, y1 - y0, .012), (sx*(wd/2 + .1), (y0 + y1)/2, .006), M['paint'], parent)
    for i in range(1, lanes):
        x = -wd/2 + i*LANE; y = y0
        while y < y1: box('dash', (.15, 3, .012), (x, y + 1.5, .006), M['paint'], parent); y += 9
    return wd
def lamps(parent, wd, y0=-90, y1=500, step=38, sides=(1, -1)):
    with bpy.data.libraries.load(os.path.join(HERE, 'props.blend')) as (src, dst): dst.objects = [n for n in src.objects if n == 'lamp_hw']
    base = dst.objects[0]; galv = mat('galv', (.5, .52, .55), .45, .8); lens = mat('lens', (1, 1, 1), .2, 0, (1, .93, .8), 30); dk = mat('dark', (.03, .03, .035), .5)
    for i, s in enumerate(base.data.materials): base.data.materials[i] = {'galv': galv, 'lens': lens, 'dark': dk, 'refl': dk}.get(s.name.split('.')[0], galv) if s else galv
    k = 0; y = y0
    while y < y1:
        sx = sides[k % len(sides)]; o = base.copy(); scene.collection.objects.link(o); o.parent = parent; o.location = (sx*(wd/2 + 1.6), y, 0); o.rotation_euler = (0, 0, math.pi if sx > 0 else 0)
        light('SPOT', 'lampl', 5200, (1, .9, .74), (sx*(wd/2 + 1.6) - sx*2.5, y, 9.9), (0, 0, 0), .35, parent, (math.radians(120), .8)); k += 1; y += step

# ---------- 키 6개 묶음: 방향키(역 T) + Q · E. 한 변 s(m). 돌려줌 {root, keys:{이름:{obj, top, legend}}} ----------
FONT = None
for f in ('~/Library/Fonts/Pretendard-Bold.otf', '/Library/Fonts/Pretendard-Bold.otf'):
    f = os.path.expanduser(f)
    if os.path.exists(f): FONT = bpy.data.fonts.load(f); break
def text_obj(s, size, material, parent, loc, align='CENTER'):
    cu = bpy.data.curves.new('t', 'FONT'); cu.body = s; cu.size = size; cu.align_x = align; cu.align_y = 'CENTER'; cu.extrude = .0015
    if FONT: cu.font = FONT
    o = bpy.data.objects.new('t', cu); scene.collection.objects.link(o); o.data.materials.append(material); o.parent = parent; o.location = loc; return o
def keyboard(parent, s=.2):
    root = empty('kb', parent); keys = {}; g = s*1.16
    lay = {'up': (0, g*.5, '↑'), 'left': (-g, -g*.5, '←'), 'down': (0, -g*.5, '↓'), 'right': (g, -g*.5, '→'), 'q': (-g*3.5, 0, 'Q'), 'e': (-g*2.5, 0, 'E')}
    plate = mat('kb_plate', (.015, .018, .024), .35, .6)
    box('kb_plate', (g*5.9, g*2.45, s*.12), (-g*1.25, 0, -s*.3), plate, root, s*.05)
    for name, (x, y, ch) in lay.items():
        m = mat('key_' + name, (.05, .058, .07), .32, 0, (0, .62, .82) if name not in ('q', 'e') else (1, .42, .02), 0, coat=.6)
        lm = mat('leg_' + name, (.9, .93, .96), .4, 0, (1, 1, 1), 2.2)
        e = empty('k_' + name, root); e.location = (x, y, 0)
        top = box('kt_' + name, (s, s, s*.5), (0, 0, 0), m, e, s*.11)
        leg = text_obj(ch, s*.5, lm, e, (0, 0, s*.252))
        keys[name] = {'e': e, 'mat': m, 'leg': lm, 's': s}
    return {'root': root, 'keys': keys}
def key_state(k, frame, v, press=True):          # v: 0 ~ 1 눌림 · 빛남. press=False: 빛만(그림을 바탕 위에 겹쳐 쓰는 '눌러 보기'용 — 키가 내려가면 글자가 두 겹으로 보임)
    k['e'].location.z = -k['s']*.16*v*(1 if press else 0); k['e'].keyframe_insert('location', frame=frame, index=2)
    key_val(emis(k['mat']), frame, 3.2*v); key_val(emis(k['leg']), frame, 2.2*(1 - v)); key_val(k['leg'].node_tree.nodes['Principled BSDF'].inputs['Base Color'], frame, (.9*(1 - v) + .01, .93*(1 - v) + .03, .96*(1 - v) + .05, 1))

def camera(lens=35, shift=(0, 0), dof=None):
    cd = bpy.data.cameras.new('cam'); cd.lens = lens; cd.shift_x, cd.shift_y = shift; cd.clip_end = 900
    if dof: cd.dof.use_dof = True; cd.dof.focus_distance = dof[0]; cd.dof.aperture_fstop = dof[1]
    o = bpy.data.objects.new('cam', cd); scene.collection.objects.link(o); scene.camera = o; return o
def look(o, loc, target, roll=0):
    o.location = loc; d = Vector(target) - Vector(loc); o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); o.rotation_euler.rotate_axis('Z', roll)

# ---------- 장면 B(조작)의 시간 식 — intro.js 'keys' 장면과 같은 값 ----------
TB = [.6, 3.0, 5.4, 7.8, 10.2, 13.4]
def b_step(t): return -1 if t < TB[0] else 0 if t < TB[1] else 1 if t < TB[2] else 2 if t < TB[3] else 3 if t < TB[4] else 4
def b_speed(t):
    if t < TB[1]: return 50
    if t < TB[2]: return 50 + 30*ss(seg(t, TB[1] + .2, TB[2] - .3))
    if t < TB[3]: return 80 - 58*ss(seg(t, TB[2] + .1, TB[3] - .5))
    return 22 + 28*ss(seg(t, TB[3] + .2, TB[4] - .3))
def b_state(t):
    st = b_step(t); u = seg(t, TB[0], TB[1] - .2); sway = math.sin(u*math.pi*2) if st == 0 else 0
    return dict(step=st, u=u, sway=sway, kr=st == 0 and (u < .25 or u > .75) and u < 1, kl=st == 0 and .25 <= u <= .75, ku=st == 1 and t < TB[2] - .3, kd=st == 2 and t < TB[3] - .5,
                ke=st == 4 and t < TB[4] + .55, blink=st == 4 and TB[4] + .2 < t < TB[5] - .3 and int(t/.32) % 2 == 0, mv=ss(seg(t, TB[4] + 1.0, TB[5] - .6)))

def set_range(n): scene.frame_start, scene.frame_end = 1, n

# ================= 장면 =================
if SHOT == 'b':
    DUR = 14.2; N = round(DUR*FPS); set_range(N)
    wr = empty('world'); wd = road(wr, 3, -160, 420); lamps(wr, wd, -120, 400, 32, (-1,))     # 가로등은 왼쪽에만(오른쪽은 키 · 자막 자리)
    c = car('ego'); cam = camera(35, (.2, -.03))          # 가로로 밀어 도로를 화면 왼쪽 30%에(오른쪽은 자막 자리)
    look(cam, (0, -15.5, 12.5), (0, 7.5, 0))
    kb = keyboard(cam, .23); kb['root'].location = (2.86, .2, -5.2); kb['root'].rotation_euler = (math.radians(-24), math.radians(-8), 0)
    light('AREA', 'kbl', 70, (.9, .95, 1), (2.2, 1.9, -3.4), (math.radians(-38), 0, 0), 2.4, cam)
    light('AREA', 'fill', 520, (.6, .75, 1), (-7, -5, 10), (math.radians(35), math.radians(-32), 0), 9)
    light('SPOT', 'rim', 1300, (0, .8, 1), (0, -7.5, 3.2), (math.radians(62), 0, 0), .6, c['root'], (math.radians(42), .8))
    dist = 0; prev = {}
    for f in range(0, N + 2):
        t = f/FPS; s = b_state(t); v = b_speed(t); dist += v/3.6/FPS
        wr.location = (0, -dist, 0); wr.keyframe_insert('location', frame=f)
        r = c['root']; r.location = (s['sway']*1.15 + LANE*s['mv'], 0, 0)
        yaw = -math.radians(7)*math.cos(s['u']*math.pi*2) if s['sway'] else -math.radians(8)*math.sin(math.pi*s['mv'])
        r.rotation_euler = (0, 0, yaw); r.keyframe_insert('location', frame=f); r.keyframe_insert('rotation_euler', frame=f)
        car_state(c, f, s['kd'], 1 if s['blink'] else 0)
        for name, on in (('left', s['kl']), ('right', s['kr']), ('up', s['ku']), ('down', s['kd']), ('e', s['ke']), ('q', False)):
            tgt = 1.0 if on else 0.0; cur = prev.get(name, 0.0); cur += cl(tgt - cur, -.34, .34); prev[name] = cur; key_state(kb['keys'][name], f, cur)

elif SHOT == 'a':
    DUR = 5.5; N = round(DUR*FPS); set_range(N)
    wr = empty('world'); wd = road(wr, 3, -200, 420); lamps(wr, wd, -180, 400, 30)
    c = car('ego', 'sedan', None, False); cam = camera(32, (0, .12), (9, 1.6))
    # 멀리 도시 불빛: 작은 빛 점들 — 초점 밖이라 둥근 빛망울로 번진다
    import random; R = random.Random(7); far = empty('far', wr)
    for i in range(110):
        colr = R.choice([(1, .82, .6), (1, .9, .78), (.7, .85, 1), (0, .8, 1), (1, .55, .3)])
        g_, m_ = glow(f'city{i}', (R.uniform(.5, 1.3),)*3, (R.choice((-1, 1))*R.uniform(26, 120), R.uniform(140, 560), R.uniform(1.5, 34)), colr, far); emis(m_).default_value = R.uniform(6, 20)
    light('AREA', 'rim', 1400, (0, .8, 1), (0, -7, 3), (math.radians(70), 0, 0), 5, c['root'])
    light('AREA', 'key', 500, (1, .9, .8), (4, 3, 5), (math.radians(-30), math.radians(30), 0), 4, c['root'])
    for f in range(0, N + 2):
        t = f/FPS; d = 16*t
        wr.location = (0, -d, 0); wr.keyframe_insert('location', frame=f)
        u = ss(t/DUR); ang = math.radians(205 - 70*u); rad = 8.8 - 1.4*u
        look(cam, (math.sin(ang)*rad, math.cos(ang)*rad, 1.35 + 1.5*u), (0, 1.0 + 2*u, .75)); cam.keyframe_insert('location', frame=f); cam.keyframe_insert('rotation_euler', frame=f)
        cam.data.dof.focus_distance = rad; cam.data.dof.keyframe_insert('focus_distance', frame=f)
        car_state(c, f, False, 0)

elif SHOT == 'c':
    N = 7; set_range(N)
    cam = camera(50, (0, .1), (2.9, 2.8))
    look(cam, (0, -1.85, 2.25), (0, -.02, 0))
    kbr = empty('kbroot'); kb = keyboard(kbr, .2); kb['root'].location = (.29, 0, 0)
    box('floor', (30, 30, .1), (0, 0, -.14), mat('floor', (.012, .014, .018), .28, .2))
    light('AREA', 'k1', 190, (.85, .93, 1), (-1.4, -1.2, 2.2), (math.radians(35), math.radians(-28), 0), 2.4)
    light('AREA', 'k2', 120, (0, .8, 1), (1.6, 1.4, .8), (math.radians(-70), math.radians(40), 0), 1.6)
    order = ['left', 'right', 'up', 'down', 'q', 'e']
    for f in range(1, N + 1):
        for i, name in enumerate(order): key_state(kb['keys'][name], f, 1.0 if f == i + 2 else 0.0, False)
    for fc in [fc for a in bpy.data.actions for fc in getattr(a, 'fcurves', [])]:
        for kp in fc.keyframe_points: kp.interpolation = 'CONSTANT'
    # 키가 화면 어디에 찍히는지(0 ~ 1280 · 0 ~ 720) — intro.js의 이름표 자리에 쓴다
    from bpy_extras.object_utils import world_to_camera_view
    bpy.context.view_layer.update(); scene.frame_set(1)
    for name in order:
        p = world_to_camera_view(scene, cam, kb['keys'][name]['e'].matrix_world.translation); print('KEYPOS', name, round(p.x*W), round((1 - p.y)*H))

elif SHOT == 'd':
    DUR = 14.0; N = round(DUR*FPS); set_range(N)
    wr = empty('world'); YF = 150.0            # 갈림 y
    # 본선 3차로(갈림까지) → 2차로, 셋째 차로는 오른쪽으로 휘어 나감
    box('road', (3*LANE + 1.2, YF + 160, .1), (0, (YF - 160)/2, -.05), M['asphalt'], wr); box('road2', (2*LANE + 1.2, 400, .1), (-LANE/2, YF + 200, -.05), M['asphalt'], wr)
    box('ground', (600, 900, .1), (0, 200, -.12), M['ground'], wr)
    def ramp_pt(u):   # 셋째 차로 가운데선: 갈림에서 오른쪽으로 휘는 2차 곡선
        a, b, c_ = Vector((LANE, YF, 0)), Vector((LANE, YF + 70, 0)), Vector((LANE + 34, YF + 150, 0)); v = 1 - u; return a*v*v + b*2*v*u + c_*u*u
    bm = bmesh.new(); prevv = None
    for i in range(41):
        u = i/40; p = ramp_pt(u); q = ramp_pt(min(1, u + .01)); tdir = (q - p).normalized() if u < 1 else (p - ramp_pt(.99)).normalized(); nrm = Vector((tdir.y, -tdir.x, 0))
        a = bm.verts.new(p - nrm*(LANE/2 + .6)); b = bm.verts.new(p + nrm*(LANE/2 + .6))
        if prevv: bm.faces.new((prevv[0], prevv[1], b, a))
        prevv = (a, b)
    me = bpy.data.meshes.new('ramp'); bm.to_mesh(me); bm.free(); ro = bpy.data.objects.new('ramp', me); scene.collection.objects.link(ro); ro.data.materials.append(M['asphalt']); ro.location.z = -.002; ro.parent = wr
    def strip(fn, u0=0, u1=1, n=50, w=.18):
        bm = bmesh.new(); pv = None
        for i in range(n + 1):
            u = u0 + (u1 - u0)*i/n; p = fn(u); q = fn(min(u1, u + .005)); d = (q - p); d = d.normalized() if d.length > 1e-6 else Vector((0, 1, 0)); nr = Vector((d.y, -d.x, 0))
            a = bm.verts.new(p - nr*w/2 + Vector((0, 0, .008))); b = bm.verts.new(p + nr*w/2 + Vector((0, 0, .008)))
            if pv: bm.faces.new((pv[0], pv[1], b, a))
            pv = (a, b)
        m2 = bpy.data.meshes.new('line'); bm.to_mesh(m2); bm.free(); o = bpy.data.objects.new('line', m2); scene.collection.objects.link(o); o.data.materials.append(M['paint']); o.parent = wr
    def off(fn, dx): return lambda u: (lambda p, q: p + Vector(((q - p).normalized().y, -(q - p).normalized().x, 0))*dx)(fn(u), fn(min(1, u + .01)) if u < .99 else fn(u) + (fn(u) - fn(u - .01)))
    strip(off(ramp_pt, LANE/2 + .1)); strip(off(ramp_pt, -LANE/2 - .1), .16, 1)
    box('edgeL', (.18, 720, .012), (-1.5*LANE - .1, 200, .006), M['paint'], wr); box('edgeR', (.18, YF + 160, .012), (1.5*LANE + .1, (YF - 160)/2, .006), M['paint'], wr)
    box('edgeR2', (.18, 400 - 24, .012), (.5*LANE + .1, YF + 24 + 188, .006), M['paint'], wr)
    for x, y1 in ((-LANE/2, 560), (LANE/2, YF - 4)):
        y = -150
        while y < y1: box('dash', (.15, 3, .012), (x, y + 1.5, .006), M['paint'], wr); y += 9
    # 갈림 코의 빗금 자리(짧은 흰 V)와 문형 표지: 초록 판 둘 — '직진'(1 · 2차로 위) · '목적지'(3차로 위, 흰 테가 빛남)
    galv = mat('galv', (.42, .44, .47), .45, .8); green = mat('green', (.02, .22, .1), .5, 0, (.02, .5, .2), .55); white = mat('signw', (1, 1, 1), .4, 0, (1, 1, 1), 3.2)
    frame_m = mat('frame', (1, 1, 1), .3, 0, (1, 1, 1), 6); YS = YF - 26
    for sx in (-1, 1): box('post', (.32, .32, 7.6), (sx*(1.5*LANE + 1.4), YS, 3.8), galv, wr)
    box('beam', (3*LANE + 3.2, .28, .34), (0, YS, 7.5), galv, wr)
    box('p1', (2*LANE - .5, .1, 1.9), (-LANE/2, YS - .12, 6.3), green, wr, .02); text_obj('직진', 1.0, white, wr, (-LANE/2, YS - .2, 6.3)).rotation_euler = (math.pi/2, 0, 0)
    box('p2', (LANE - .5, .1, 1.9), (LANE, YS - .12, 6.3), green, wr, .02); text_obj('목적지', .78, white, wr, (LANE, YS - .2, 6.3)).rotation_euler = (math.pi/2, 0, 0)
    for dx, dz, sx_, sz_ in ((0, .98, LANE - .4, .09), (0, -.98, LANE - .4, .09), (-(LANE - .5)/2, 0, .09, 2.0), ((LANE - .5)/2, 0, .09, 2.0)): box('pf', (sx_, .06, sz_), (LANE + dx, YS - .2, 6.3 + dz), frame_m, wr)
    lamps(wr, 3*LANE, -120, YF - 40, 44)
    ego = car('ego'); rear = car('rear', 'suv', (.45, .5, .56)); cam = camera(36, (.2, .04), None)
    light('AREA', 'fill', 700, (.6, .75, 1), (-8, 60, 14), (math.radians(20), math.radians(-30), 0), 14)
    light('AREA', 'rim', 800, (0, .8, 1), (0, -8, 4), (math.radians(65), 0, 0), 5, ego['root'])
    def ramp_follow(root, s):          # s: 갈림에서 길 따라 간 거리(m)
        u = cl(s/170); p = ramp_pt(u); q = ramp_pt(min(1, u + .01)); d = q - p; root.location = p; root.rotation_euler = (0, 0, -math.atan2(d.x, d.y))
    ey = 0.0; ry = -42.0; camp = None
    for f in range(0, N + 2):
        t = f/FPS
        v_e = 13.0 + 1.5*ss(seg(t, 8, 10)); v_r = 21.0 - 5*ss(seg(t, 5.5, 8))
        ey += v_e/FPS; ry += v_r/FPS
        mv = ss(seg(t, 6.6, 8.6)); yb = ey + 12.0                              # 12m 지점에서 시작(갈림은 150m)
        if yb < YF: ego['root'].location = (LANE*mv, yb, 0); ego['root'].rotation_euler = (0, 0, -math.radians(7)*math.sin(math.pi*mv))
        else: ramp_follow(ego['root'], yb - YF)
        if ry < YF: rear['root'].location = (LANE, ry, 0); rear['root'].rotation_euler = (0, 0, 0)
        else: ramp_follow(rear['root'], ry - YF)
        for c_ in (ego, rear): c_['root'].keyframe_insert('location', frame=f); c_['root'].keyframe_insert('rotation_euler', frame=f)
        car_state(ego, f, False, 1 if (5.6 < t < 8.8 and int(t/.32) % 2 == 0) else 0); car_state(rear, f, False, 0)
        e = ego['root'].location; tgt = Vector((e.x*.55 + 3.4, e.y - 15.5, 10.5)); camp = tgt if camp is None else camp.lerp(tgt, .12)
        look(cam, camp, (e.x*.6 + 3.1, e.y + 9, 0)); cam.keyframe_insert('location', frame=f); cam.keyframe_insert('rotation_euler', frame=f)

if SHOT == 'b':
    from bpy_extras.object_utils import world_to_camera_view
    scene.frame_set(1); bpy.context.view_layer.update()
    for name, k in kb['keys'].items():
        p = world_to_camera_view(scene, cam, k['e'].matrix_world.translation); print('KEYPOS', name, round(p.x*W), round((1 - p.y)*H))

# 곡선은 프레임마다 값을 넣었으므로 선형 보간
for a in bpy.data.actions:
    for fc in getattr(a, 'fcurves', []):
        for kp in fc.keyframe_points:
            if kp.interpolation != 'CONSTANT': kp.interpolation = 'LINEAR'

os.makedirs(OUT, exist_ok=True)
if STILL or SHOT == 'c':
    frames = nums if nums else list(range(scene.frame_start, scene.frame_end + 1))
    for f in frames:
        scene.frame_set(f); scene.render.filepath = os.path.join(OUT, f'{SHOT}_{f:04d}.png'); bpy.ops.render.render(write_still=True)
else:
    if len(nums) >= 2: scene.frame_start, scene.frame_end = nums[0], nums[1]
    scene.render.filepath = os.path.join(OUT, f'{SHOT}_'); bpy.ops.render.render(animation=True)
print('MG done', SHOT, scene.frame_start, scene.frame_end)
