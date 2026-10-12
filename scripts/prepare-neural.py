"""Deterministic artistic surface fibers. Uses the pinned anatomy virtualenv.
No anatomical connectivity is inferred. GLBs are read without modification.
"""
import json
from pathlib import Path
import numpy as np
import trimesh
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
from scipy.ndimage import gaussian_filter1d

ROOT = Path(__file__).resolve().parents[1]

def prepare(quality):
    scene = trimesh.load(ROOT / f'public/models/cortex-{quality}.glb', force='scene', process=False)
    paths = []
    max_projection = 0.0
    for hemisphere, name in enumerate(sorted(scene.geometry)):
        mesh = scene.geometry[name]
        v, normals = mesh.vertices, mesh.vertex_normals
        edges = mesh.edges_unique
        lengths = np.linalg.norm(v[edges[:, 0]] - v[edges[:, 1]], axis=1)
        graph = coo_matrix((np.r_[lengths, lengths],
                           (np.r_[edges[:, 0], edges[:, 1]], np.r_[edges[:, 1], edges[:, 0]])),
                          shape=(len(v), len(v))).tocsr()
        # Outer cortex and superior surface. Avoid routing hubs across medial caps.
        side = -1 if 'left' in name else 1
        candidates = np.flatnonzero((v[:, 0] * side > .38) & (normals[:, 0] * side > .12))
        selected = [candidates[np.argmax(v[candidates, 1])]]
        for _ in range(19):
            distance = np.min(np.linalg.norm(v[candidates, None] - v[selected][None], axis=2), axis=1)
            selected.append(candidates[np.argmax(distance)])
        distances, predecessors = dijkstra(graph, indices=selected, return_predecessors=True)
        pairs = set()
        for i in range(len(selected)):
            for j in np.argsort(distances[i, selected])[1:4]:
                pairs.add(tuple(sorted((i, int(j)))))
        for a, b in sorted(pairs):
            route = [selected[b]]
            while route[-1] != selected[a]:
                previous = int(predecessors[a, route[-1]])
                if previous < 0:
                    raise ValueError('Disconnected surface route')
                route.append(previous)
            original = v[route[::-1]]
            smooth = gaussian_filter1d(original, 1.0, axis=0, mode='nearest')
            delta = smooth - original
            # Bound smoothing displacement so deep sulci cannot be shortcut.
            delta *= np.minimum(1., .0015 / np.maximum(np.linalg.norm(delta, axis=1)[:, None], 1e-9))
            center = original + delta
            arc = np.r_[0., np.cumsum(np.linalg.norm(np.diff(center, axis=0), axis=1))]
            sample = np.linspace(0, arc[-1], max(24, int(arc[-1] / .006)))
            center = np.stack([np.interp(sample, arc, center[:, k]) for k in range(3)], axis=1)
            closest, _, face = trimesh.proximity.closest_point(mesh, center)
            n = normals[mesh.faces[face]].mean(axis=1)
            n /= np.linalg.norm(n, axis=1)[:, None]
            tangent = np.gradient(closest, axis=0)
            lateral = np.cross(n, tangent)
            lateral /= np.maximum(np.linalg.norm(lateral, axis=1)[:, None], 1e-9)
            # Three delicate lanes form each bundle; project every lane onto cortex.
            for lane in ([-1, 0, 1] if quality == 'full' else [0]):
                phase = np.linspace(0, np.pi * 2, len(center))
                width = lane * (.006 + .002 * np.sin(phase + a))
                candidate = closest + lateral * width[:, None]
                p, _, face = trimesh.proximity.closest_point(mesh, candidate)
                bary = trimesh.triangles.points_to_barycentric(mesh.triangles[face], p)
                n = (normals[mesh.faces[face]] * bary[:, :, None]).sum(axis=1)
                n /= np.linalg.norm(n, axis=1)[:, None]
                p += n * .009
                # Distance checked to the actual profile, not an abstract envelope.
                _, distance, _ = trimesh.proximity.closest_point(mesh, p)
                max_projection = max(max_projection, float(distance.max()))
                paths.append({'region': hemisphere * 6 + (3 if closest[:, 1].mean() > 0 else 0) + min(2, max(0, int((closest[:, 2].mean() + 1.65) / 1.1))), 'lane': lane,
                              'positions': np.round(p, 5).ravel().tolist(),
                              'normals': np.round(n, 5).ravel().tolist()})
    output = ROOT / f'public/models/neural-{quality}.json'
    output.write_text(json.dumps({'version': 1, 'quality': quality, 'paths': paths,
                                 'maxSurfaceDistance': round(max_projection, 6)}, separators=(',', ':')) + '\n')
    print(f'{quality}: {len(paths)} fibers, max offset {max_projection:.5f}, {output.stat().st_size:,} bytes')

if __name__ == '__main__':
    for quality in ['full', 'compact']:
        prepare(quality)
