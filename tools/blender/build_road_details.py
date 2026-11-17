"""Beveled road drainage fixture and an editable review of the shared pavement meshes."""
import argparse
import json
import sys
from pathlib import Path

import bpy


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--recipe', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--blend', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    recipe = json.loads(Path(args.recipe).read_text())
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.context.scene.unit_settings.system = 'METRIC'

    def material(name, color, metal=0):
        mat = bpy.data.materials.new(name)
        mat.diffuse_color = (*color, 1)
        mat.use_nodes = True
        shader = mat.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (*color, 1)
        shader.inputs['Metallic'].default_value = metal
        shader.inputs['Roughness'].default_value = 0.65
        return mat

    steel = material('Cast iron · satin edge highlights', (0.18, 0.22, 0.20), 0.65)
    parts = []

    def box(name, location, scale):
        bpy.ops.mesh.primitive_cube_add(size=1, location=location)
        obj = bpy.context.object
        obj.name = name
        obj.scale = scale
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        obj.data.materials.append(steel)
        bevel = obj.modifiers.new('3mm rounded cast edges', 'BEVEL')
        bevel.width, bevel.segments = 0.003, 3
        bevel.harden_normals = True
        obj.modifiers.new('Weighted metal normals', 'WEIGHTED_NORMAL')
        parts.append(obj)

    # 85 × 32cm, recessed below the road; open slots retain real depth.
    for y in [-0.144, 0.144]:
        box('Drain rim', (0, y, -0.012), (0.85, 0.032, 0.025))
    for x in [-0.409, 0.409]:
        box('Drain rim', (x, 0, -0.012), (0.032, 0.26, 0.025))
    for i in range(-4, 5):
        box('Cast grate slat', (i * 0.085, 0, -0.008), (0.032, 0.26, 0.018))
    for x in [-0.4, 0.4]:
        for y in [-0.14, 0.14]:
            bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.007, depth=0.003, location=(x, y, 0.002))
            bolt = bpy.context.object
            bolt.data.materials.append(steel)
            parts.append(bolt)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        for modifier in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    grate = bpy.context.object
    grate.name = 'drain_grate'
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=args.output, export_format='GLB', use_selection=True, export_yup=True, export_apply=True)
    grate.hide_render = True
    grate.hide_set(True)

    palette = {'asphalt': (0.25, 0.28, 0.29), 'sidewalks': (0.59, 0.48, 0.36), 'curbs': (0.73, 0.74, 0.67), 'tactile': (0.78, 0.61, 0.2), 'parkingLines': (0.91, 0.90, 0.82), 'walkways': (0.55, 0.51, 0.42), 'access': (0.51, 0.52, 0.48)}
    for item in recipe['surfaces']:
        p = item['positions']
        vertices = [(p[i], -p[i + 2], p[i + 1]) for i in range(0, len(p), 3)]
        indices = item.get('indices') or list(range(len(vertices)))
        faces = [indices[i:i + 3] for i in range(0, len(indices), 3)]
        mesh = bpy.data.meshes.new(item['name'])
        mesh.from_pydata(vertices, [], faces)
        mesh.materials.append(material(item['name'], palette[item['name']]))
        obj = bpy.data.objects.new(item['name'], mesh)
        bpy.context.collection.objects.link(obj)
        for face in mesh.polygons:
            face.use_smooth = item['name'] != 'sidewalks'
    scene = bpy.context.scene
    scene['pavement_revision'] = recipe['revision']
    scene['grade_note'] = 'Web and Blender use identical road, sidewalk and parking coordinates. No independent terrain shrinkwrap.'
    Path(args.blend).parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=args.blend, compress=True)
    print(f"ROAD DETAILS: {len(grate.data.vertices)} vertices; {len(recipe['surfaces'])} shared review surfaces")


if __name__ == '__main__':
    main()
