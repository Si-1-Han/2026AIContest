"""Build editable, beveled exterior models from the web renderer's shared recipe.

Run through `npm --prefix web run models:tour -- --blender /path/to/blender`.
No interior geometry, remote textures, or measured-dimension claims are added.
"""

import argparse
import json
import math
import struct
import sys
from collections import defaultdict
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--recipe", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--blend", required=True)
    parser.add_argument("--preview", action="store_true")
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])


def linear(hex_color):
    channels = [int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    return [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in channels]


def preserve_gltf_tints(path):
    """Blender's MixRGB export keeps the texture but drops its constant tint."""
    data = path.read_bytes()
    json_size = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20 : 20 + json_size])
    for mat in document["materials"]:
        color = "#" + mat["name"].split("_")[1]
        mat.setdefault("pbrMetallicRoughness", {})["baseColorFactor"] = [*linear(color), 1]
    payload = json.dumps(document, separators=(",", ":")).encode()
    payload += b" " * (-len(payload) % 4)
    binary_chunk = data[20 + json_size :]
    path.write_bytes(struct.pack("<4sII", b"glTF", 2, 20 + len(payload) + len(binary_chunk)) + struct.pack("<I4s", len(payload), b"JSON") + payload + binary_chunk)


def transform(point, position, angle=0, rz=0, center=(0, 0)):
    x, y, z = point
    x, y = math.cos(rz) * x - math.sin(rz) * y, math.sin(rz) * x + math.cos(rz) * y
    x, z = math.cos(angle) * x + math.sin(angle) * z, -math.sin(angle) * x + math.cos(angle) * z
    # Web Y-up / south-positive Z -> Blender Z-up / north-positive Y.
    return (x + position[0] - center[0], -(z + position[2] - center[1]), y + position[1])


def primitive(kind, scale):
    sx, sy, sz = scale
    if kind in ("stone", "frames", "glass"):
        vertices = [(x * sx / 2, y * sy / 2, z * sz / 2) for x, y, z in [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1), (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]]
        return vertices, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)]
    count = 24
    bottom = [(math.cos(i / count * math.tau) * sx, -sy / 2, math.sin(i / count * math.tau) * sz) for i in range(count)]
    if kind == "cone":
        vertices = bottom + [(0, sy / 2, 0)]
        return vertices, [tuple(range(count))] + [(i, count, (i + 1) % count) for i in range(count)]
    vertices = bottom + [(x, sy / 2, z) for x, _, z in bottom]
    faces = [tuple(range(count)), tuple(range(count * 2 - 1, count - 1, -1))]
    faces += [(i, i + count, (i + 1) % count + count, (i + 1) % count) for i in range(count)]
    return vertices, faces


def main():
    args = arguments()
    recipe = json.loads(Path(args.recipe).read_text())
    output, blend = Path(args.output), Path(args.blend)
    output.mkdir(parents=True, exist_ok=True)
    blend.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    materials, images, collections, roots = {}, {}, {}, {}

    def material(role, color, surface=None):
        key = (role, color, surface)
        if key in materials:
            return materials[key]
        mat = bpy.data.materials.new(f"{role}_{color[1:]}_{surface or 'plain'}")
        mat.use_nodes = True
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        shader = nodes.get("Principled BSDF")
        shader.inputs["Base Color"].default_value = (*linear(color), 1)
        shader.inputs["Roughness"].default_value = 0.16 if role == "glass" else 0.32 if role == "frames" else 0.88
        shader.inputs["Metallic"].default_value = 0.05 if role == "glass" else 0.65 if role == "frames" else 0
        if role == "glass":
            shader.inputs["Coat Weight"].default_value = 1
            shader.inputs["Coat Roughness"].default_value = 0.1
            shader.inputs["IOR"].default_value = 1.5
        if surface:
            uv = nodes.new("ShaderNodeTexCoord")
            mapping = nodes.new("ShaderNodeMapping")
            mapping.inputs["Scale"].default_value = (*recipe["textures"][surface]["repeat"], 1)
            links.new(uv.outputs["UV"], mapping.inputs["Vector"])
            for channel in ("color", "normal", "roughness"):
                filename = recipe["textures"][surface][channel]
                if filename not in images:
                    image = bpy.data.images.load(filename, check_existing=True)
                    if channel != "color":
                        image.colorspace_settings.name = "Non-Color"
                    image.pack()
                    images[filename] = image
                texture = nodes.new("ShaderNodeTexImage")
                texture.image = images[filename]
                links.new(mapping.outputs["Vector"], texture.inputs["Vector"])
                if channel == "color":
                    multiply = nodes.new("ShaderNodeMixRGB")
                    multiply.blend_type = "MULTIPLY"
                    multiply.inputs[0].default_value = 1
                    multiply.inputs[2].default_value = (*linear(color), 1)
                    links.new(texture.outputs["Color"], multiply.inputs[1])
                    links.new(multiply.outputs[0], shader.inputs["Base Color"])
                elif channel == "normal":
                    normal = nodes.new("ShaderNodeNormalMap")
                    normal.inputs["Strength"].default_value = 0.35
                    links.new(texture.outputs["Color"], normal.inputs["Color"])
                    links.new(normal.outputs["Normal"], shader.inputs["Normal"])
                else:
                    links.new(texture.outputs["Color"], shader.inputs["Roughness"])
        materials[key] = mat
        return mat

    manifest = {"version": 1, "revision": recipe["revision"], "generator": f"Blender {bpy.app.version_string}", "attribution": recipe["attribution"], "accuracy": "photo-guided approximate exterior; no surveyed dimensions or interiors", "models": {}}
    for building in recipe["buildings"]:
        bid, center = building["id"], building["center"]
        collection = bpy.data.collections.new(f"{bid} · {building['name']}")
        bpy.context.scene.collection.children.link(collection)
        collections[bid] = collection
        root = bpy.data.objects.new(bid, None)
        collection.objects.link(root)
        roots[bid] = root
        root["building_id"], root["source_revision"] = bid, recipe["revision"]
        root["accuracy"] = manifest["accuracy"]
        groups = defaultdict(lambda: {"vertices": [], "faces": [], "uv": []})

        def append(role, color, vertices, faces, uvs=None, surface=None):
            group = groups[(role, color, surface)]
            offset = len(group["vertices"])
            group["vertices"].extend(vertices)
            group["faces"].extend([tuple(i + offset for i in face) for face in faces])
            group["uv"].extend(uvs if uvs else [(v[0], v[2]) for v in vertices])

        for role, parts in building["parts"].items():
            for part in parts:
                vertices, faces = primitive(role, part["s"])
                transformed = [transform(v, part["p"], part.get("ry", 0), part.get("rz", 0), center) for v in vertices]
                append(role, part["color"], transformed, faces)
        for mesh in building["meshes"]:
            positions = mesh["positions"]
            vertices = [transform(positions[i : i + 3], mesh["p"], mesh["angle"], center=center) for i in range(0, len(positions), 3)]
            faces = [(i, i + 1, i + 2) for i in range(0, len(vertices), 3)]
            uvs = [mesh["uv"][i : i + 2] for i in range(0, len(mesh["uv"]), 2)]
            append("body", mesh["color"], vertices, faces, uvs, mesh.get("surface"))

        for (role, color, surface), data in groups.items():
            mesh = bpy.data.meshes.new(f"{bid}_{role}")
            mesh.from_pydata(data["vertices"], [], data["faces"])
            mesh.materials.append(material(role, color, surface))
            uv = mesh.uv_layers.new(name="UVMap")
            for loop in mesh.loops:
                uv.data[loop.index].uv = data["uv"][loop.vertex_index]
            mesh.update()
            obj = bpy.data.objects.new(f"{bid}_{role}_{color[1:]}", mesh)
            collection.objects.link(obj)
            obj.parent = root
            # Weld the triangles of slabs before beveling; preserve the UV seams.
            bm = bmesh.new()
            bm.from_mesh(mesh)
            bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.00001)
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
            bm.to_mesh(mesh)
            bm.free()
            bevel = obj.modifiers.new("Edge highlights · 1–3cm bevel", "BEVEL")
            bevel.width = 0.012 if role in ("frames", "glass") else 0.025
            bevel.segments, bevel.limit_method = 1, "ANGLE"
            bevel.angle_limit = 0.35
            bevel.harden_normals = True
            bevel.use_clamp_overlap = True
            weighted = obj.modifiers.new("Weighted facade normals", "WEIGHTED_NORMAL")
            weighted.keep_sharp = True
            triangulate = obj.modifiers.new("glTF tangent-ready triangulation", "TRIANGULATE")
            triangulate.keep_custom_normals = True
            if role in ("cylinder", "cone"):
                for polygon in mesh.polygons:
                    polygon.use_smooth = True

        bpy.ops.object.select_all(action="DESELECT")
        for obj in collection.objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = root
        export = {"filepath": str(output / f"{bid}.glb"), "export_format": "GLB", "use_selection": True, "export_apply": True, "export_yup": True, "export_animations": False, "export_extras": True, "export_tangents": True, "export_keep_originals": False, "export_draco_mesh_compression_enable": True, "export_draco_mesh_compression_level": 8, "export_draco_position_quantization": 15, "export_draco_normal_quantization": 10, "export_draco_texcoord_quantization": 14}
        supported = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
        bpy.ops.export_scene.gltf(**{key: value for key, value in export.items() if key in supported})
        preserve_gltf_tints(output / f"{bid}.glb")
        root.location = (center[0], -center[1], 0)
        vertices = sum(len(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).data.vertices) for obj in collection.objects if obj.type == "MESH")
        manifest["models"][bid] = {"file": f"{bid}.glb", "name": building["name"], "center": center, "height": building["height"], "vertices": vertices, "bytes": (output / f"{bid}.glb").stat().st_size}
        print(f"MODEL {bid}: {vertices:,} vertices, {manifest['models'][bid]['bytes']:,} bytes", flush=True)

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 900, 600
    scene.render.resolution_percentage = 100
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.62, 0.76, 0.88, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.55
    light = bpy.data.lights.new("Afternoon sun", "SUN")
    light.energy, light.angle = 2.2, 0.12
    sun = bpy.data.objects.new("Afternoon sun", light)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(28), math.radians(-25), math.radians(-35))
    bpy.ops.mesh.primitive_plane_add(size=1800)
    ground = bpy.context.object
    ground.name = "Preview ground · not exported"
    ground.location.z = -0.03
    ground.data.materials.append(material("ground", "#a9b592"))
    camera = bpy.data.objects.new("Exterior review camera", bpy.data.cameras.new("Exterior review camera"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.lens = 46
    preview = blend.parent / "previews"
    preview.mkdir(exist_ok=True)
    for building in recipe["buildings"] if args.preview else recipe["buildings"][:1]:
        center, front = building["center"], building["front"]
        size = max(building["height"] * 2.4, building["radius"] * 2.9, 65)
        nx, nz = front["nx"], front["nz"]
        camera.location = (center[0] + nx * size - nz * size * 0.55, -center[1] - nz * size - nx * size * 0.55, building["height"] * 0.68 + 8)
        target = Vector((center[0], -center[1], building["height"] * 0.42))
        camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
        if args.preview:
            for bid, collection in collections.items():
                collection.hide_render = bid != building["id"]
            scene.render.filepath = str(preview / f"{building['id']}.png")
            bpy.ops.render.render(write_still=True)
            print(f"PREVIEW {building['id']}", flush=True)
    for collection in collections.values():
        collection.hide_render = False
    scene["source_revision"] = recipe["revision"]
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
