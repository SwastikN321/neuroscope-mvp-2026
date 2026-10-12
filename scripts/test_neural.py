"""Check delivered fibers against the real profile geometry, independently of WebGL."""
import json
import unittest
from pathlib import Path
import numpy as np
import trimesh

ROOT = Path(__file__).resolve().parents[1]

class NeuralSurfaceTests(unittest.TestCase):
    def test_projection_and_continuity(self):
        for quality in ['full', 'compact']:
            asset = json.loads((ROOT / f'public/models/neural-{quality}.json').read_text())
            scene = trimesh.load(ROOT / f'public/models/cortex-{quality}.glb', force='scene', process=False)
            for hemisphere, name in enumerate(sorted(scene.geometry)):
                mesh = scene.geometry[name]
                routes = [p for p in asset['paths'] if p['region'] // 6 == hemisphere]
                self.assertGreater(len(routes), 10)
                positions, midpoints = [], []
                for route in routes:
                    p = np.array(route['positions']).reshape(-1, 3)
                    n = np.array(route['normals']).reshape(-1, 3)
                    self.assertTrue(np.isfinite(p).all())
                    self.assertTrue(np.allclose(np.linalg.norm(n, axis=1), 1, atol=2e-5))
                    self.assertLess(np.max(np.linalg.norm(np.diff(p, axis=0), axis=1)), .08)
                    positions.append(p)
                    midpoints.append((p[:-1] + p[1:]) * .5)
                positions = np.concatenate(positions)
                midpoints = np.concatenate(midpoints)
                _, offsets, _ = trimesh.proximity.closest_point(mesh, positions)
                _, midpoint_offsets, _ = trimesh.proximity.closest_point(mesh, midpoints)
                self.assertLess(offsets.max(), .0091)
                self.assertLess(midpoint_offsets.max(), .012)
                print(f'{quality}/{name}: {len(routes)} fibers; vertex offset {offsets.max():.6f}; segment midpoint offset {midpoint_offsets.max():.6f}')

if __name__ == '__main__':
    unittest.main()
