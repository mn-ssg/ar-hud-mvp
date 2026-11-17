"""나무 모델 (3회차 MVP 작업 3, 2026-11-17) — 느티나무(가로수 · 활엽) 3그루 · 소나무(고속도로 숲) 3그루.
실행: /Applications/Blender.app/Contents/MacOS/Blender -b --python assets/blender/trees.py
결과: assets/models/trees.glb (나무마다 <이름>_wood · <이름>_leaf 두 물체) · assets/blender/trees.blend

만드는 법 (바깥에서 가져온 모양 없음):
· 뼈대: 줄기 → 굵은 가지 → 잔가지를 규칙으로 뻗는다(느티나무 = 낮은 줄기에서 부채꼴로 올라가 둥근 수관 / 소나무 = 곧고 붉은 줄기, 위쪽 절반에 층층이 수평 가지).
· 나무(wood): 뼈대를 따라 가늘어지는 대롱. UV는 둘레 × 길이(2m마다 한 장) → 나무껍질 텍스처(assets/tex/bark_*.jpg)가 감긴다.
· 잎(leaf): 잔가지 끝 · 중간마다 잎 덩어리 판(느티나무는 엇갈린 3장, 소나무는 수평 솔잎 판 + 세운 판). 텍스처는 잎 덩어리 사진(assets/tex/leaves.png · needles_pine.png).
  법선은 수관 가운데에서 바깥을 향하게 해 판이 아니라 덩어리처럼 빛을 받고, 꼭짓점 색으로 수관 안쪽 · 아래쪽을 어둡게 한다(자기 그림자 흉내).
텍스처는 glb에 넣지 않는다 — 코드(src/scene/trees.js)가 재질 이름(bark_zelkova · leaf_zelkova · bark_pine · leaf_pine)으로 붙인다.
좌표: 위 = +Z(glb에서는 +Y), 원점 = 밑동."""
import bpy, math, os, random
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
UP = Vector((0, 0, 1))

def perp(v):
    a = Vector((1, 0, 0)) if abs(v.x) < .9 else Vector((0, 1, 0))
    return v.cross(a).normalized()

class Mesh:
    def __init__(self):
        self.v, self.f, self.uv, self.n, self.c = [], [], [], [], []
    def tube(self, pts, radii, sides, vtile=2.0, urep=1):
        """pts를 따라 반지름 radii의 대롱. 이음매 꼭짓점을 겹쳐 UV가 끊기지 않게"""
        n = None; L = 0.0; base = len(self.v)
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            n = perp(t) if n is None else (n - t*n.dot(t)).normalized()
            b = t.cross(n)
            if i > 0: L += (p - pts[i-1]).length
            for j in range(sides + 1):
                a = 2*math.pi*j/sides
                self.v.append(p + (n*math.cos(a) + b*math.sin(a))*radii[i]); self.uv.append((urep*j/sides, L/vtile))
        for i in range(len(pts) - 1):
            for j in range(sides):
                a = base + i*(sides + 1) + j; b2 = a + sides + 1
                self.f.append((a, a + 1, b2 + 1, b2))
    def card(self, c, ax_u, ax_v, su, sv, normal, shade):
        b = len(self.v)
        for du, dv, uv in ((-1, -1, (0, 0)), (1, -1, (1, 0)), (1, 1, (1, 1)), (-1, 1, (0, 1))):
            p = c + ax_u*du*su/2 + ax_v*dv*sv/2
            self.v.append(p); self.uv.append(uv); self.n.append((normal + (p - c).normalized()*.35).normalized()); self.c.append(shade)
        self.f.append((b, b + 1, b + 2, b + 3))
    def build(self, name, mat, smooth=True):
        me = bpy.data.meshes.new(name); me.from_pydata([tuple(p) for p in self.v], [], self.f); me.update()
        uvl = me.uv_layers.new(name='UVMap')
        for li, loop in enumerate(me.loops): uvl.data[li].uv = self.uv[loop.vertex_index]
        for p in me.polygons: p.use_smooth = smooth
        if self.c:
            ca = me.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='POINT')
            for i, s in enumerate(self.c): ca.data[i].color = (s, s, s, 1)
            me.color_attributes.active_color = ca
            try: me.color_attributes.render_color_index = 0
            except Exception: pass
        if self.n: me.normals_split_custom_set_from_vertices([tuple(q) for q in self.n])
        me.materials.append(mat)
        o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o); return o

def branch(start, d, length, nseg, r0, r1, R, up=.0, wob=.12):
    """start에서 d 방향으로 length만큼. up > 0이면 위로 휘고(< 0 처짐), wob만큼 흔들림. 돌려줌: (점, 반지름, 방향)"""
    pts, rad, p, d = [start.copy()], [r0], start.copy(), d.normalized()
    for i in range(nseg):
        d = (d + UP*up/nseg + Vector((R.uniform(-1, 1), R.uniform(-1, 1), R.uniform(-1, 1)))*wob/nseg*2).normalized()
        p = p + d*length/nseg; pts.append(p.copy()); rad.append(r0 + (r1 - r0)*(i + 1)/nseg)
    return pts, rad, d

def at(pts, u):
    f = u*(len(pts) - 1); i = min(int(f), len(pts) - 2); return pts[i].lerp(pts[i+1], f - i), (pts[i+1] - pts[i]).normalized()

def side_dir(d, R, ang):
    """d에서 ang(라디안)만큼 벌어진 방향 — 둘레 아무 쪽"""
    a = perp(d); b = d.cross(a); t = R.uniform(0, 2*math.pi)
    return (d*math.cos(ang) + (a*math.cos(t) + b*math.sin(t))*math.sin(ang)).normalized()

def zelkova(name, seed, mats):
    """느티나무: 높이 9 ~ 11m · 수관 폭 8 ~ 9m. 줄기 2.6 ~ 3.4m에서 굵은 가지 4 ~ 5개가 부채꼴로"""
    R = random.Random(seed); W, Lf = Mesh(), Mesh(); tips = []
    th = R.uniform(2.6, 3.4)
    tp, tr, td = branch(Vector((0, 0, 0)), UP + Vector((R.uniform(-.06, .06), R.uniform(-.06, .06), 0)), th, 5, .27, .2, R, 0, .05)
    tr[0] = .40; tr[1] = .29                                   # 밑동이 벌어짐
    W.tube(tp, tr, 10, 2.0, 2)
    top = tp[-1]; nl = R.choice((4, 5, 5)); a0 = R.uniform(0, 6.28)
    for k in range(nl):
        az = a0 + k*2*math.pi/nl + R.uniform(-.35, .35); tilt = R.uniform(.42, .72)
        d = Vector((math.cos(az)*math.sin(tilt), math.sin(az)*math.sin(tilt), math.cos(tilt)))
        lp, lr, ld = branch(top + Vector((0, 0, R.uniform(-.35, .1))), d, R.uniform(3.2, 4.3), 5, .145, .065, R, .5, .18)
        W.tube(lp, lr, 7)
        for s in range(4):                                       # 가지 → 잔가지
            u = .32 + s*.2 + R.uniform(-.05, .05); p, dd = at(lp, min(u, .98))
            sp, sr, sd = branch(p, side_dir(dd, R, R.uniform(.5, .95)), R.uniform(1.7, 2.7)*(1.1 - u*.35), 4, .06*(1.15 - u*.5), .022, R, .25, .22)
            W.tube(sp, sr, 5)
            tips.append(sp[-1]); tips.append(at(sp, .55)[0])
            for q in range(2):
                pp, d2 = at(sp, R.uniform(.35, .85))
                wp, wr, wd = branch(pp, side_dir(d2, R, R.uniform(.5, 1.0)), R.uniform(.9, 1.5), 2, .022, .008, R, .15, .2)
                W.tube(wp, wr, 3); tips.append(wp[-1]); tips.append(at(wp, .5)[0])
        tips.append(lp[-1]); tips.append(at(lp, .75)[0])
    # 수관 가운데 · 크기(가지 끝 자리에서). 잎 덩어리는 가지 끝 · 중간(뼈대를 따라) + 수관 겉면을 고르게 채우는 자리(둥근 수관이 비어 보이지 않게)
    cc = sum(tips, Vector())/len(tips); rx = max(abs(t.x - cc.x) for t in tips) + .5; ry = max(abs(t.y - cc.y) for t in tips) + .5; rz = max(abs(t.z - cc.z) for t in tips) + .5; rad = max(rx, ry, rz)
    spots = [t + Vector((R.uniform(-.3, .3), R.uniform(-.3, .3), R.uniform(-.15, .3))) for t in tips]
    spots += [t + Vector((R.uniform(-.7, .7), R.uniform(-.7, .7), R.uniform(-.3, .6))) for t in tips]
    for i in range(110):
        z = R.uniform(-.35, 1.0); a = R.uniform(0, 6.283); r = math.sqrt(max(0.0, 1 - min(1, abs(z))**2)); k = R.uniform(.72, 1.0)
        spots.append(cc + Vector((math.cos(a)*r*rx*k, math.sin(a)*r*ry*k, z*rz*k)))
    for t in spots:
        out = (t - cc); dist = min(1.0, out.length/rad); nrm = (out.normalized()*.8 + UP*.35).normalized()
        shade = min(1.0, .42 + .58*dist + .14*max(0.0, (t.z - cc.z)/rad))
        sz = R.uniform(1.25, 1.75); ax = perp(nrm); ay = nrm.cross(ax)
        for q in range(2):                                       # 엇갈린 판 2장 — 잎 덩어리 사진 한 장이 약 1.5m(잎 한 장 6 ~ 8cm)
            a = q*math.pi/2 + R.uniform(-.5, .5); u = (ax*math.cos(a) + ay*math.sin(a)).normalized(); v = (nrm*R.uniform(.3, .9) + ay*math.cos(a + 1.3)*.7 - ax*math.sin(a + 1.3)*.7).normalized()
            v = (v - u*v.dot(u)).normalized()
            Lf.card(t, u, v, sz, sz, nrm, shade*R.uniform(.88, 1.0))
    return [W.build(name + '_wood', mats['bark_zelkova']), Lf.build(name + '_leaf', mats['leaf_zelkova'])]

def pine(name, seed, mats):
    """소나무(적송): 높이 11 ~ 15m. 곧은 붉은 줄기, 아래쪽 절반은 가지 없음, 위쪽에 층층이 수평 가지와 납작한 솔잎 덩어리"""
    R = random.Random(seed); W, Lf = Mesh(), Mesh()
    H = R.uniform(11, 15); lean = Vector((R.uniform(-.09, .09), R.uniform(-.09, .09), 0))
    tp, tr, td = branch(Vector((0, 0, 0)), UP + lean, H, 12, .27, .07, R, .12, .09)
    tr[0] = .36
    W.tube(tp, tr, 9, 2.0, 2)
    pads = []; z = H*R.uniform(.42, .5); k = 0
    while z < H*.97:
        u = z/H; p, dd = at(tp, u); nb = 3 if u < .8 else 2; a0 = R.uniform(0, 6.28)
        span = (1.3 + 1.6*math.sin(math.pi*min(1, (u - .38)/.6)))*R.uniform(.85, 1.1)*(H/13)     # 가운데 층이 가장 넓음
        for b in range(nb):
            az = a0 + b*2*math.pi/nb + R.uniform(-.4, .4); el = R.uniform(-.12, .16)
            d = Vector((math.cos(az)*math.cos(el), math.sin(az)*math.cos(el), math.sin(el)))
            bp, br, bd = branch(p, d, span, 4, .075*(1.25 - u), .02, R, .28, .16)
            W.tube(bp, br, 5)
            for q in (.55, .8, 1.0):
                c, _ = at(bp, q); pads.append((c + Vector((0, 0, .12)), 1.5 + .5*q))
            pp, d2 = at(bp, .5); sp, sr, sd = branch(pp, side_dir(d2, R, .7).lerp(d2, .3), span*.5, 2, .03, .012, R, .2, .15)
            W.tube(sp, sr, 4); pads.append((sp[-1] + Vector((0, 0, .1)), 1.35))
        z += R.uniform(.95, 1.35)*(H/13); k += 1
    pads.append((tp[-1] + Vector((0, 0, .25)), 1.7))
    zmin = min(c.z for c, _ in pads); zmax = max(c.z for c, _ in pads)
    for c, s0 in pads:
        t = (c.z - zmin)/max(.1, zmax - zmin)
        for q in range(6):                                       # 가지 끝마다 작은 솔잎 뭉치 6개 — 크기 · 기울기 · 자리가 제각각이라 원반처럼 보이지 않음
            o = c + Vector((R.uniform(-.55, .55), R.uniform(-.55, .55), R.uniform(-.18, .32)))*s0*.62
            sz = R.uniform(.85, 1.25)*s0*.62; shade = (.5 + .5*t)*R.uniform(.82, 1.0)*(1.0 if q < 4 else .82)
            nrm = (UP + Vector((o.x, o.y, 0))*.1 + Vector((R.uniform(-.25, .25), R.uniform(-.25, .25), 0))).normalized(); a = R.uniform(0, 3.14)
            if q < 4:                                            # 눕힌 판(위에서 본 솔잎 뭉치), ±30° 기울어짐
                tilt = Vector((R.uniform(-.5, .5), R.uniform(-.5, .5), 1)).normalized(); u = perp(tilt); u = (u*math.cos(a) + tilt.cross(u)*math.sin(a)).normalized(); v = tilt.cross(u).normalized()
                Lf.card(o, u, v, sz, sz, nrm, shade)
            else:                                                # 세운 판(옆에서 봐도 두께가 있게)
                u = Vector((math.cos(a), math.sin(a), R.uniform(-.2, .2))).normalized(); v = (UP + Vector((R.uniform(-.3, .3), R.uniform(-.3, .3), 0))).normalized(); v = (v - u*v.dot(u)).normalized()
                Lf.card(o + Vector((0, 0, -.1)), u, v, sz*1.1, sz*.7, nrm, shade)
    return [W.build(name + '_wood', mats['bark_pine']), Lf.build(name + '_leaf', mats['leaf_pine'])]

bpy.ops.wm.read_factory_settings(use_empty=True)
mats = {}
for n in ('bark_zelkova', 'leaf_zelkova', 'bark_pine', 'leaf_pine'):
    m = bpy.data.materials.new(n); m.use_nodes = True; mats[n] = m
objs = []
for i, sd in enumerate((11, 23, 37)): objs += zelkova('zelkova_' + 'abc'[i], sd, mats)
for i, sd in enumerate((5, 17, 29)): objs += pine('pine_' + 'abc'[i], sd, mats)
for o in objs:
    print('TREE', o.name, 'tris', sum(len(p.vertices) - 2 for p in o.data.polygons), 'size', [round(v, 1) for v in o.dimensions])
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'trees.blend'))
out = os.path.join(HERE, '..', 'models', 'trees.glb')
# Draco 압축(2026-11-17 밤, 배포 전 최적화): 819KB → 약 1/4. 읽는 쪽은 scene.js GLTF(DRACOLoader)
kw = dict(filepath=out, export_format='GLB', export_apply=True, export_yup=True, export_normals=True, export_texcoords=True, export_materials='EXPORT', export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6, export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12, export_draco_color_quantization=10)
try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', export_all_vertex_colors=False, **kw)
except TypeError:
    try: bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError: bpy.ops.export_scene.gltf(export_colors=True, **kw)
print('TREE wrote', os.path.getsize(out))
