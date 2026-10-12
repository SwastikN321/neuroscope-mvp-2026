"""Fast negative-input and export regression checks; no source mesh writes."""
import importlib.util
from pathlib import Path
import unittest

import numpy as np
import trimesh

spec = importlib.util.spec_from_file_location("prepare_anatomy", Path(__file__).with_name("prepare-anatomy.py"))
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)


class AnatomyValidationTests(unittest.TestCase):
    def setUp(self):
        self.mesh = trimesh.creation.icosphere(subdivisions=2)

    def test_accepts_closed_outward_mesh(self):
        pipeline.validate_mesh(self.mesh, "valid")

    def test_rejects_nonfinite_positions(self):
        self.mesh.vertices[0, 0] = np.nan
        with self.assertRaisesRegex(ValueError, "nonfinite"):
            pipeline.validate_mesh(self.mesh, "invalid")

    def test_rejects_open_surface(self):
        self.mesh.update_faces(np.arange(len(self.mesh.faces) - 1))
        with self.assertRaisesRegex(ValueError, "open or nonmanifold"):
            pipeline.validate_mesh(self.mesh, "open")

    def test_rejects_inward_winding(self):
        self.mesh.invert()
        with self.assertRaisesRegex(ValueError, "inward winding"):
            pipeline.validate_mesh(self.mesh, "inverted")

    def test_rejects_duplicate_faces(self):
        self.mesh.faces = np.vstack((self.mesh.faces, self.mesh.faces[0]))
        with self.assertRaisesRegex(ValueError, "duplicate"):
            pipeline.validate_mesh(self.mesh, "duplicate")

    def test_rotation_preserves_handedness_and_axes(self):
        self.assertAlmostEqual(np.linalg.det(pipeline.ROTATION), 1)
        np.testing.assert_array_equal(pipeline.ROTATION @ [0, 1, 0], [0, 0, -1])
        np.testing.assert_array_equal(pipeline.ROTATION @ [0, 0, 1], [0, 1, 0])

    def test_decimation_retains_closed_topology(self):
        mesh = trimesh.creation.icosphere(subdivisions=3)
        simplified = pipeline.simplify(mesh, 400)
        self.assertLessEqual(len(simplified.faces), 400)
        pipeline.validate_mesh(simplified, "simplified")

    def test_glb_roundtrip_and_truncation(self):
        right = self.mesh.copy()
        self.mesh.apply_translation([-1, 0, 0])
        right.apply_translation([1, 0, 0])
        meshes = [self.mesh, right]
        data = pipeline.export_model(meshes)
        pipeline.validate_glb(data, meshes)
        with self.assertRaisesRegex(ValueError, "Invalid GLB header"):
            pipeline.validate_glb(data[:-8], meshes)

    def test_rejects_swapped_hemispheres(self):
        left, right = self.mesh.copy(), self.mesh.copy()
        left.apply_translation([-1, 0, 0])
        right.apply_translation([1, 0, 0])
        with self.assertRaisesRegex(ValueError, "orientation"):
            pipeline.validate_pair([right, left])


if __name__ == "__main__":
    unittest.main()
