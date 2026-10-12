"""Render source/full/compact comparison from actual geometry without a browser."""
import argparse
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("MPLCONFIGDIR", str(ROOT / ".cache/matplotlib"))
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
import numpy as np
import trimesh


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models", type=Path, default=ROOT / "public/models")
    parser.add_argument("--source", type=Path, default=ROOT / "work/anatomy/pial_Full_obj")
    parser.add_argument("--output", type=Path, default=ROOT / "work/anatomy-preview/comparison.png")
    args = parser.parse_args()
    manifest = json.loads((args.models / "manifest.json").read_text())
    source = [trimesh.load(args.source / f"{s}.pial.obj", process=False) for s in ("lh", "rh")]
    for m in source:
        m.apply_transform(np.array(manifest["transform"]["matrix"]))
    rows = [("Original cortical surfaces · 579,114 triangles", source)]
    for profile in ("full", "compact"):
        scene = trimesh.load(args.models / f"cortex-{profile}.glb", force="scene", process=False)
        rows.append((f"{profile.title()} · {manifest['profiles'][profile]['triangles']:,} triangles",
                     [scene.geometry[n] for n in ("cortex_left", "cortex_right")]))
    views = [("Right lateral", [1, .05, 0], [0, 1, 0]),
             ("Superior · anterior at top", [0, 1, 0], [0, 0, -1]),
             ("Anterior three-quarter", [.6, .3, -1], [0, 1, 0])]
    fig, axes = plt.subplots(3, 3, figsize=(12, 12), facecolor="#101722")
    for row, (label, meshes) in enumerate(rows):
        combined = trimesh.util.concatenate(meshes)
        for col, (title, direction, up) in enumerate(views):
            camera = np.array(direction, dtype=float)
            camera /= np.linalg.norm(camera)
            right = np.cross(up, camera)
            right /= np.linalg.norm(right)
            vertical = np.cross(camera, right)
            visible = combined.face_normals @ camera > 0
            triangles = combined.triangles[visible]
            normals = combined.face_normals[visible]
            depth = triangles.mean(axis=1) @ camera
            order = np.argsort(depth)
            projected = np.stack((triangles @ right, triangles @ vertical), axis=-1)
            light = camera + .8 * vertical - .35 * right
            light /= np.linalg.norm(light)
            shade = .22 + .78 * np.maximum(0, normals @ light)
            colors = np.clip(shade[:, None] * np.array([.73, .82, .89]), 0, 1)
            ax = axes[row, col]
            ax.add_collection(PolyCollection(projected[order], facecolors=colors[order],
                                             edgecolors="none", antialiaseds=False))
            ax.set(xlim=(-1.8, 1.8), ylim=(-1.8, 1.8), aspect="equal")
            ax.axis("off")
            ax.set_title(title if row == 0 else "", color="#dce9ef", fontsize=11)
        axes[row, 0].text(0, -1.97, label, color="#dce9ef", fontsize=10,
                          ha="left", transform=axes[row, 0].transData)
        print("Rendered", label, flush=True)
    fig.suptitle("NeuroScope · anatomical asset comparison", color="white", fontsize=19, y=.97)
    fig.text(.5, .027, "Brain for Blender — Anderson Winkler · CC BY-SA 3.0 · Adapted for NeuroScope\n"
             "Offline geometry preview; identical scale and views. No smoothing. Not the website renderer.",
             ha="center", color="#aabcc9", fontsize=9)
    fig.subplots_adjust(left=.02, right=.98, top=.92, bottom=.07, hspace=.12, wspace=.02)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(args.output, dpi=150, facecolor=fig.get_facecolor())
    plt.close(fig)
    print(args.output)


if __name__ == "__main__":
    main()
