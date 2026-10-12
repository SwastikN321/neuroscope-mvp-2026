"""Offline asset build. See public/models/ATTRIBUTION.md for provenance/license.

python prepare-anatomy.py --source /path/to/pial_Full_obj --output public/models
Requires numpy, scipy, trimesh, fast-simplification. Never runs in the browser.
"""

import argparse
import hashlib
import json
import struct
from pathlib import Path

import numpy as np
import trimesh
from scipy.sparse import coo_matrix, diags
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import cKDTree

PROFILES = {"full": (100000, 192, 112), "compact": (24000, 80, 80)}
CREDIT = "Brain for Blender — Anderson Winkler, CC BY-SA 3.0. Adapted for NeuroScope."


def graph(mesh):
    edges = mesh.edges_unique
    weights = np.linalg.norm(mesh.vertices[edges[:, 0]] - mesh.vertices[edges[:, 1]], axis=1)
    return coo_matrix((np.tile(weights, 2), (edges.flatten(order="F"), edges[:, ::-1].flatten(order="F"))), shape=(len(mesh.vertices),) * 2).tocsr()


def attributes(mesh):
    adjacency = graph(mesh)
    adjacency.data[:] = 1
    average = diags(1 / np.maximum(1, np.array(adjacency.sum(axis=1)).ravel())) @ adjacency
    smooth = mesh.vertices.copy()
    for _ in range(18):
        smooth = average @ smooth
    concavity = np.sum((smooth - mesh.vertices) * mesh.vertex_normals, axis=1)
    cavity = np.clip(concavity / .032, 0, 1)
    # Fold-aware occlusion supplements dynamic self shadows, including on mobile.
    shade = .96 - .64 * cavity
    color = np.stack([shade * .92, shade * .97, shade, np.ones_like(shade)], axis=1)
    return np.round(color * 255).astype(np.uint8), cavity


def write_glb(filename, meshes):
    blob = bytearray()
    views, accessors, primitives = [], [], []

    def accessor(array, component, kind, normalized=False):
        while len(blob) % 4:
            blob.append(0)
        offset = len(blob)
        blob.extend(array.tobytes())
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": array.nbytes})
        item = {"bufferView": len(views) - 1, "componentType": component, "count": len(array), "type": kind}
        if normalized:
            item["normalized"] = True
        if kind == "VEC3" and component == 5126:
            item.update(min=array.min(axis=0).tolist(), max=array.max(axis=0).tolist())
        accessors.append(item)
        return len(accessors) - 1

    for mesh in meshes:
        colors, cavity = attributes(mesh)
        positions = np.array(mesh.vertices, dtype="<f4")
        normals = np.array(mesh.vertex_normals, dtype="<f4")
        uv = np.column_stack((cavity, np.zeros(len(cavity)))).astype("<f4")
        primitives.append({"attributes": {"POSITION": accessor(positions, 5126, "VEC3"), "NORMAL": accessor(normals, 5126, "VEC3"), "COLOR_0": accessor(colors, 5121, "VEC4", True), "TEXCOORD_0": accessor(uv, 5126, "VEC2")}, "indices": accessor(mesh.faces.ravel().astype("<u2"), 5123, "SCALAR"), "material": 0})
    while len(blob) % 4:
        blob.append(0)
    doc = {"asset": {"version": "2.0", "generator": "NeuroScope anatomical asset pipeline", "copyright": CREDIT}, "scene": 0, "scenes": [{"nodes": [0, 1]}], "nodes": [{"mesh": 0, "name": "cortex_left"}, {"mesh": 1, "name": "cortex_right"}], "meshes": [{"primitives": [p]} for p in primitives], "materials": [{"pbrMetallicRoughness": {"baseColorFactor": [.34, .48, .56, 1], "metallicFactor": .2, "roughnessFactor": .48}}], "buffers": [{"byteLength": len(blob)}], "bufferViews": views, "accessors": accessors}
    raw = json.dumps(doc, separators=(",", ":")).encode()
    raw += b" " * ((-len(raw)) % 4)
    filename.write_bytes(struct.pack("<III", 0x46546C67, 2, 28 + len(raw) + len(blob)) + struct.pack("<II", len(raw), 0x4E4F534A) + raw + struct.pack("<II", len(blob), 0x004E4942) + blob)


def pathways(mesh, side, count, samples):
    """Surface geodesics fan out from four hubs; they are artwork, not tractography."""
    vertices = mesh.vertices
    normals = np.array(mesh.vertex_normals)
    adjacency = graph(mesh)
    tree = cKDTree(vertices)
    hubs = np.array([[side * .95, .65, .55], [side * 1.1, .05, -.45], [side * .7, .45, -1.2], [side * .75, -.45, .7]])
    roots = tree.query(hubs)[1]
    distances, predecessors = dijkstra(adjacency, indices=roots, return_predecessors=True)
    rng = np.random.default_rng(1906 + side)
    # Area-weighted destinations avoid the polar/latitude bands of the old mesh.
    areas = np.bincount(mesh.faces.ravel(), weights=np.repeat(mesh.area_faces / 3, 3), minlength=len(vertices))
    areas *= np.abs(vertices[:, 0]) > .15
    destinations = rng.choice(len(vertices), size=count * 8, p=areas / areas.sum())
    curves, metadata = [], []
    for destination in destinations:
        group = len(curves) % 4
        distance = distances[group, destination]
        if not .6 < distance < 5.8:
            continue
        path = [int(destination)]
        while path[-1] != roots[group]:
            parent = int(predecessors[group, path[-1]])
            if parent < 0:
                break
            path.append(parent)
        if path[-1] != roots[group]:
            continue
        path = np.array(path[::-1])
        # Dense original topology keeps the fibers on the actual folded surface.
        points = vertices[path] + normals[path] * .008
        arc = np.r_[0, np.cumsum(np.linalg.norm(np.diff(points, axis=0), axis=1))]
        t = np.linspace(0, arc[-1], samples)
        curve = np.column_stack([np.interp(t, arc, points[:, axis]) for axis in range(3)])
        curves.append(curve)
        metadata.append([arc[-1], group, 0 if side < 0 else 1, rng.uniform(.65, 1)])
        if len(curves) == count:
            break
    if len(curves) != count:
        raise RuntimeError("Insufficient connected paths")
    return curves, metadata


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    source = [trimesh.load(args.source / f"{s}.pial.obj", process=False) for s in ["lh", "rh"]]
    bounds = np.array([m.bounds for m in source])
    center = (bounds[:, 0].min(axis=0) + bounds[:, 1].max(axis=0)) / 2
    scale = 3.25 / (bounds[:, 1, 1].max() - bounds[:, 0, 1].min())
    # FreeSurfer RAS -> Three.js: x=right, y=superior, z=anterior. Proper rotation.
    for mesh in source:
        v = (mesh.vertices - center) * scale
        mesh.vertices = np.column_stack((v[:, 0], v[:, 2], -v[:, 1]))
        # Anterior faces -Z; the view is a lateral three-quarter portrait.
    report = {"credit": CREDIT, "source": "https://brainder.org/research/brain-for-blender/", "license": "https://creativecommons.org/licenses/by-sa/3.0/", "source_sha256": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in args.source.glob("*.obj")}, "profiles": {}}
    for quality, (faces, paths, samples) in PROFILES.items():
        meshes = [m.simplify_quadric_decimation(face_count=faces, aggression=5) for m in source]
        for mesh in meshes:
            assert len(mesh.vertices) < 65536
        write_glb(args.output / f"cortex-{quality}.glb", meshes)
        curves, metadata = [], []
        for mesh, side in zip(source, [-1, 1]):
            c, m = pathways(mesh, side, paths // 2, samples)
            curves.extend(c)
            metadata.extend(m)
        # 16-byte versioned header, then per-path metadata and tightly packed xyz.
        data = struct.pack("<4sIII", b"NSCP", 1, paths, samples)
        data += np.array(metadata, dtype="<f4").tobytes()
        data += np.array(curves, dtype="<f4").tobytes()
        (args.output / f"pathways-{quality}.bin").write_bytes(data)
        report["profiles"][quality] = {"triangles": sum(len(m.faces) for m in meshes), "vertices": sum(len(m.vertices) for m in meshes), "paths": paths, "samples": samples, "model_bytes": (args.output / f"cortex-{quality}.glb").stat().st_size, "path_bytes": len(data)}
        print(quality, report["profiles"][quality], flush=True)
    (args.output / "manifest.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
