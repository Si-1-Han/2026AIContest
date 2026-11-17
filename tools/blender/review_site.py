"""Render the actual web terrain, paving, retaining volumes and Blender buildings together."""
import argparse
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector

p = argparse.ArgumentParser()
p.add_argument('--recipe', required=True)
p.add_argument('--root', required=True)
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
r = json.loads(Path(a.recipe).read_text())
root = Path(a.root)
bpy.ops.wm.open_mainfile(filepath=str(root / 'assets/tour/campus-exteriors.blend'))
for o in list(bpy.data.objects):
    if o.type in {'CAMERA', 'LIGHT'} or o.name.startswith('Preview ground'):
        bpy.data.objects.remove(o, do_unlink=True)
for b in r['buildings']:
    for o in bpy.data.objects:
        if o.type == 'EMPTY' and o.name == b['id']:
            o.location.z = b['elevation']
# Root empty names are generated with a human-readable suffix.
for b in r['buildings']:
    col = bpy.data.collections.get(b['id'])
    if col:
        for o in col.objects:
            if o.type == 'EMPTY': o.location.z = b['elevation']
materials = {}
def mat(color):
    if color in materials: return materials[color]
    channels = [int(color[i:i+2], 16) / 255 for i in (1,3,5)]
    channels = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in channels]
    m = bpy.data.materials.new(color)
    m.diffuse_color = (*channels, 1)
    m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*channels, 1)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .9
    materials[color] = m
    return m

def pos(x,y,z): return (x,-z,y)
for s in r['surfaces']:
    pp = s['positions']
    mesh = bpy.data.meshes.new(s['name'])
    mesh.from_pydata([pos(*pp[i:i+3]) for i in range(0,len(pp),3)], [], s['faces'])
    mesh.materials.append(mat(s['color']))
    obj = bpy.data.objects.new(s['name'], mesh)
    bpy.context.scene.collection.objects.link(obj)

def box(name, pp, scale, color, ry=0, rz=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos(*pp))
    o = bpy.context.object; o.name = name
    o.scale = (scale[0],scale[2],scale[1])
    o.rotation_euler = (-rz * math.sin(ry), -rz * math.cos(ry), ry)
    o.data.materials.append(mat(color))
for part in r['parts']: box('Site detail', part['p'], part['s'], part['color'], part.get('ry',0), part.get('rz',0))
for s in r['shrubs']:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, location=(s['x'],-s['z'],s['y']+s['height']/2))
    o=bpy.context.object;o.scale=(s['radius'],s['radius'],s['height']/2);o.data.materials.append(mat('#3e682e'))
# Trees carry the web's actual positions. Simplified crowns make occlusion and planting levels reviewable.
for t in r['trees']:
    if not (-145<t['x']<95 and -245<t['z']<175): continue
    y, scale = t.get('y',0), t['scale']
    if t.get('shrub'): continue
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=.16*scale, depth=4.2*scale, location=(t['x'],-t['z'],y+2.1*scale))
    bpy.context.object.data.materials.append(mat('#655440'))
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=(t['x'],-t['z'],y+4.5*scale))
    o=bpy.context.object;o.scale=(2.5*scale,2.5*scale,2.8*scale);o.data.materials.append(mat('#47743c'))
for w in r.get('gateWalls',[]):
    aa,bb=w['a'],w['b'];nx,nz=w['nx']*.5,w['nz']*.5
    points=[(aa[0]+nx,aa[1],aa[2]+nz),(bb[0]+nx,bb[1],bb[2]+nz),(bb[0]-nx,bb[1],bb[2]-nz),(aa[0]-nx,aa[1],aa[2]-nz)]
    mesh=bpy.data.meshes.new('Gate wall');mesh.from_pydata([pos(*v) for v in points]+[pos(v[0],v[1]+3.3,v[2]) for v in points],[],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
    mesh.materials.append(mat('#d2d0c6'));obj=bpy.data.objects.new('Gate wall',mesh);scene_collection=bpy.context.scene.collection;scene_collection.objects.link(obj)
f=r['fountain'];x,z=f['center'];y=f['level'];radius=f['radius']
bpy.ops.mesh.primitive_torus_add(major_segments=96, minor_segments=8, major_radius=radius-.2, minor_radius=.2, location=(x,-z,y+.4))
bpy.context.object.data.materials.append(mat('#626961'))
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=radius-.39, depth=.03, location=(x,-z,y+.42))
bpy.context.object.data.materials.append(mat('#527e82'))
# The sign location and face direction are shared with the browser.
s=f['sign'];box('University sign plinth',[x+s['x'],y+.25,z+s['z']],[6.7,.5,.35],'#a5afa0',s['rotation'])
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=8;scene.cycles.use_denoising=True
scene.render.resolution_x=1440;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.68,.82,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.7
sun=bpy.data.objects.new('Site sun',bpy.data.lights.new('Site sun','SUN'));scene.collection.objects.link(sun);sun.data.energy=2.3;sun.rotation_euler=(.5,-.4,-.6)
cam=bpy.data.objects.new('Site review camera',bpy.data.cameras.new('Site review camera'));scene.collection.objects.link(cam);scene.camera=cam;cam.data.lens=25
out=root/'assets/tour/reviews/2026-11-17';out.mkdir(parents=True,exist_ok=True)
scene['review_note']='Actual web meshes; terrain, building bases, roads, planting and retaining structures rendered together. Tree crowns simplified only for review.'
for v in r['views']:
    cam.location=(v['eye'][0],-v['eye'][1],v['y']);target=Vector((v['target'][0],-v['target'][1],v['ty']))
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(out/(v['name']+'.png'));bpy.ops.render.render(write_still=True)
    print('SITE REVIEW:',v['name'],flush=True)

bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/tour/campus-site.blend'),compress=True)
