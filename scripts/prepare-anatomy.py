"""Build and validate NeuroScope cortical GLBs offline; see ANATOMY.md.

Inputs are immutable, publisher-verified Brain for Blender pial surfaces.
No smoothing, independent hemisphere scaling, fibers, or application edits.
"""

import argparse
import gzip
import hashlib
import io
import json
import platform
import struct
from importlib.metadata import version
from pathlib import Path

import numpy as np
import trimesh
import pymeshlab

ROOT = Path(__file__).resolve().parents[1]
NAMES = ("cortex_left", "cortex_right")
PROFILES = {
    "full": {"faces_per_hemisphere": 100000, "p99_mm": 0.35, "max_mm": 1.0,
             "area_relative": 0.03, "volume_relative": 0.01, "max_bytes": 5000000},
    "compact": {"faces_per_hemisphere": 30000, "p99_mm": 0.8, "max_mm": 2.0,
                "area_relative": 0.08, "volume_relative": 0.03, "max_bytes": 1600000},
}
LICENSE = "https://creativecommons.org/licenses/by-sa/3.0/"
CREDIT = "Brain for Blender by Anderson Winkler; adapted for NeuroScope; CC BY-SA 3.0"
# RAS -> right, superior, posterior: determinant +1, never a reflection.
ROTATION = np.array([[1., 0., 0.], [0., 0., 1.], [0., -1., 0.]])
SAMPLES = 6000


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def validate_mesh(mesh, label):
    require(isinstance(mesh, trimesh.Trimesh), f"{label}: not a triangle mesh")
    v, f = mesh.vertices, mesh.faces
    require(len(v) > 3 and len(f) > 3, f"{label}: empty geometry")
    require(v.shape[1] == 3 and f.shape[1] == 3, f"{label}: invalid dimensions")
    require(np.isfinite(v).all(), f"{label}: nonfinite positions")
    require(f.min() >= 0 and f.max() < len(v), f"{label}: invalid indices")
    require(len(np.unique(f)) == len(v), f"{label}: unreferenced vertices")
    require(np.all(mesh.area_faces > 1e-14), f"{label}: degenerate triangles")
    require(np.all(mesh.unique_faces()), f"{label}: duplicate triangles")
    require(mesh.is_watertight, f"{label}: open or nonmanifold surface")
    require(mesh.is_winding_consistent, f"{label}: inconsistent winding")
    require(mesh.volume > 0, f"{label}: inward winding")
    components = trimesh.graph.connected_components(
        mesh.face_adjacency, nodes=np.arange(len(f)), engine="scipy")
    require(len(components) == 1, f"{label}: disconnected surface")
    require(mesh.euler_number == 2, f"{label}: topology changed from sphere")
    normals = mesh.vertex_normals
    require(np.isfinite(normals).all(), f"{label}: nonfinite normals")
    require(np.allclose(np.linalg.norm(normals, axis=1), 1, atol=1e-5),
            f"{label}: nonunit normals")
    return {"vertices": len(v), "triangles": len(f), "bounds": mesh.bounds.tolist(),
            "extents": mesh.extents.tolist(), "centroid": mesh.centroid.tolist(),
            "area": float(mesh.area), "volume": float(mesh.volume),
            "watertight": True, "consistent_outward_winding": True,
            "connected_components": 1, "euler_number": int(mesh.euler_number),
            "finite_unit_normals": True, "nondegenerate_unique_faces": True}


def validate_pair(meshes):
    require(len(meshes) == 2, "Expected exactly two hemispheres")
    require(meshes[0].centroid[0] < 0 < meshes[1].centroid[0],
            "Left/right orientation is reversed or shifted")
    bounds = np.array([m.bounds for m in meshes])
    extent = bounds[:, 1].max(axis=0) - bounds[:, 0].min(axis=0)
    require(np.all(extent > 2) and np.all(extent < 3.4), "Unexpected model scale")
    require(abs(extent[2] - 3.25) < 0.04, "Unexpected anterior-posterior length")
    return {"bounds": [bounds[:, 0].min(axis=0).tolist(),
                       bounds[:, 1].max(axis=0).tolist()], "extents": extent.tolist()}


def surface_error(original, simplified, scale, limits):
    """Bidirectional deterministic area-weighted point-to-triangle samples.

    This is a sampled error estimate, NOT an exhaustive Hausdorff bound.
    Distances are converted back to the original source's millimetre units.
    """
    result = {}
    all_distances = []
    for label, source, target in (("source_to_output", original, simplified),
                                  ("output_to_source", simplified, original)):
        points, _ = trimesh.sample.sample_surface(source, SAMPLES, seed=1906)
        chunks = [trimesh.proximity.closest_point(target, p)[1]
                  for p in np.array_split(points, 12)]
        distances = np.concatenate(chunks) / scale
        all_distances.append(distances)
        result[label] = {"p99_mm": float(np.quantile(distances, .99)),
                         "max_mm": float(distances.max()),
                         "rms_mm": float(np.sqrt(np.mean(distances ** 2)))}
    distances = np.concatenate(all_distances)
    result["area_relative_error"] = abs(float(simplified.area / original.area) - 1)
    result["volume_relative_error"] = abs(float(simplified.volume / original.volume) - 1)
    result["bounds_max_displacement_mm"] = float(
        np.max(np.abs(simplified.bounds - original.bounds)) / scale)
    require(np.quantile(distances, .99) <= limits["p99_mm"], "Surface p99 error too large")
    require(distances.max() <= limits["max_mm"], "Sampled maximum error too large")
    require(result["area_relative_error"] <= limits["area_relative"], "Lost too much surface area")
    require(result["volume_relative_error"] <= limits["volume_relative"], "Volume changed excessively")
    require(result["bounds_max_displacement_mm"] < 1, "Silhouette bounds changed excessively")
    return result


def simplify(mesh, faces):
    """Quadric decimation with topology and normal preservation; no smoothing."""
    mesh_set = pymeshlab.MeshSet()
    mesh_set.add_mesh(pymeshlab.Mesh(vertex_matrix=np.asarray(mesh.vertices),
                                   face_matrix=np.asarray(mesh.faces, dtype=np.int32)))
    mesh_set.meshing_decimation_quadric_edge_collapse(
        targetfacenum=faces, qualitythr=0.3, preservetopology=True,
        preservenormal=True, preserveboundary=True, optimalplacement=True,
        planarquadric=False, autoclean=True)
    result = mesh_set.current_mesh()
    return trimesh.Trimesh(vertices=result.vertex_matrix(),
                           faces=result.face_matrix(), process=False)


def export_model(meshes):
    scene = trimesh.Scene()
    for name, mesh in zip(NAMES, meshes):
        mesh.visual = trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(
            name="neutral_cortex", baseColorFactor=[170, 185, 195, 255],
            metallicFactor=0.0, roughnessFactor=0.7, doubleSided=False))
        scene.add_geometry(mesh, geom_name=name, node_name=name)

    def metadata(tree):
        tree["asset"]["copyright"] = CREDIT
        tree["asset"]["extras"] = {"license": LICENSE,
            "source": "https://brainder.org/research/brain-for-blender/",
            "modifications": "Shared centering, uniform scale, proper rotation, topology-preserving decimation, recomputed normals, neutral material, GLB conversion",
            "axes": "+X right, +Y superior, -Z anterior", "anatomical_length_units": "normalized; not physical meters"}

    return trimesh.exchange.gltf.export_glb(scene, include_normals=True,
                                           tree_postprocessor=metadata)


def validate_glb(data, expected):
    require(struct.unpack_from("<III", data) == (0x46546C67, 2, len(data)), "Invalid GLB header")
    size, kind = struct.unpack_from("<II", data, 12)
    require(kind == 0x4E4F534A, "Missing GLB JSON chunk")
    doc = json.loads(data[20:20 + size])
    require(len(doc["meshes"]) == 2, "GLB lost a hemisphere")
    require(not any("uri" in b for b in doc["buffers"]), "Unexpected external buffer")
    require(not doc.get("images"), "Unexpected texture dependency")
    for mesh in doc["meshes"]:
        require("NORMAL" in mesh["primitives"][0]["attributes"], "GLB lacks normals")
    scene = trimesh.load(io.BytesIO(data), file_type="glb", force="scene", process=False)
    require(set(scene.geometry) == set(NAMES), "GLB hemisphere names changed")
    reloaded = []
    for name, before in zip(NAMES, expected):
        after = scene.geometry[name]
        validate_mesh(after, name + " GLB roundtrip")
        require(np.array_equal(before.faces, after.faces), "GLB changed topology")
        require(np.allclose(before.vertices, after.vertices, atol=1e-7, rtol=0), "GLB changed positions")
        require(np.allclose(before.vertex_normals, after.vertex_normals, atol=1e-6, rtol=0), "GLB changed normals")
        transform, geometry_name = scene.graph[name]
        require(geometry_name == name and np.allclose(transform, np.eye(4)), "Unexpected node transform")
        reloaded.append(after)
    return reloaded


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "work/anatomy/pial_Full_obj")
    parser.add_argument("--output", type=Path, default=ROOT / "public/models")
    args = parser.parse_args()
    require(args.source.resolve() != args.output.resolve(), "Output cannot be the source directory")
    provenance = json.loads((ROOT / "scripts/anatomy-source.json").read_text())
    originals, source_stats = [], {}
    for filename, name in zip(("lh.pial.obj", "rh.pial.obj"), NAMES):
        path = args.source / filename
        require(digest(path.read_bytes()) == provenance["files"][filename]["sha256"],
                f"{filename}: checksum differs from verified publisher input")
        mesh = trimesh.load(path, process=False, maintain_order=True)
        source_stats[name] = validate_mesh(mesh, filename)
        originals.append(mesh)
    print("Source integrity validated", flush=True)
    bounds = np.array([m.bounds for m in originals])
    center = (bounds[:, 0].min(axis=0) + bounds[:, 1].max(axis=0)) / 2
    scale = 3.25 / (bounds[:, 1, 1].max() - bounds[:, 0, 1].min())
    transform = np.eye(4)
    transform[:3, :3] = ROTATION * scale
    transform[:3, 3] = -(ROTATION @ center) * scale
    for mesh in originals:
        mesh.apply_transform(transform)
    validate_pair(originals)
    report = {"credit": CREDIT, "license": LICENSE, "provenance": provenance,
              "source_geometry": source_stats,
              "transform": {"matrix": transform.tolist(), "uniform_scale": float(scale),
                            "axes": "+X right, +Y superior, -Z anterior", "ap_length": 3.25},
              "toolchain": {p: version(p) for p in
                            ("numpy", "scipy", "trimesh", "pymeshlab", "rtree")},
              "python": platform.python_version(),
              "validation": {"samples_per_direction_per_hemisphere": SAMPLES,
                             "seed": 1906, "distance_method": "bidirectional sampled point-to-triangle",
                             "limitations": "Not an exhaustive Hausdorff or self-intersection test; no browser performance claim"},
              "profiles": {}}
    pending = {}
    for profile, limits in PROFILES.items():
        meshes, details = [], {}
        for name, original in zip(NAMES, originals):
            mesh = simplify(original, limits["faces_per_hemisphere"])
            stats = validate_mesh(mesh, profile + " " + name)
            require(len(mesh.faces) <= limits["faces_per_hemisphere"], "Triangle budget exceeded")
            stats["deviation"] = surface_error(original, mesh, scale, limits)
            details[name] = stats
            meshes.append(mesh)
            print(profile, name, len(mesh.faces), "triangles validated", flush=True)
        pair = validate_pair(meshes)
        data = export_model(meshes)
        validate_glb(data, meshes)
        require(len(data) <= limits["max_bytes"], "Browser delivery budget exceeded")
        filename = f"cortex-{profile}.glb"
        pending[filename] = data
        report["profiles"][profile] = {"file": filename, "triangles": sum(len(m.faces) for m in meshes),
            "vertices": sum(len(m.vertices) for m in meshes), "bytes": len(data),
            "gzip_bytes": len(gzip.compress(data, mtime=0)), "sha256": digest(data),
            "hemispheres": details, "combined": pair, "acceptance_limits": limits,
            "glb_roundtrip_passed": True}
    # Do not publish either profile until both have passed all checks.
    args.output.mkdir(parents=True, exist_ok=True)
    for name, data in pending.items():
        (args.output / name).write_bytes(data)
    (args.output / "manifest.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    print(json.dumps({k: {f: v[f] for f in ("triangles", "bytes", "sha256")}
                      for k, v in report["profiles"].items()}, indent=2))


if __name__ == "__main__":
    main()
