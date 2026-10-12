import {
  Box3,
  Mesh,
  PerspectiveCamera,
  Sphere,
  Vector3,
  type Group,
} from 'three';

export type Quality = 'full' | 'compact';
export const anatomyProfiles = {
  full: {
    url: '/models/cortex-full.glb',
    triangles: 200000,
    dpr: 1.5,
    shadow: 2048,
  },
  compact: {
    url: '/models/cortex-compact.glb',
    triangles: 60000,
    dpr: 1,
    shadow: 1024,
  },
} as const;

/** Validate the actual loaded scene, without cloning either hemisphere. */
export function inspectAnatomy(scene: Group, quality: Quality) {
  const meshes: Mesh[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    if (object instanceof Mesh) meshes.push(object);
  });
  if (
    meshes.length !== 2 ||
    !['cortex_left', 'cortex_right'].every((name) =>
      meshes.some((mesh) => mesh.name === name),
    )
  )
    throw new Error(
      'The anatomical asset must contain both named hemispheres.',
    );
  let triangles = 0;
  for (const mesh of meshes) {
    const positions = mesh.geometry.getAttribute('position');
    const normals = mesh.geometry.getAttribute('normal');
    const indices = mesh.geometry.getIndex();
    if (!positions || !normals || !indices || positions.count !== normals.count)
      throw new Error('The anatomical asset has incomplete geometry.');
    if (
      !Array.from(positions.array).every(Number.isFinite) ||
      !Array.from(normals.array).every(Number.isFinite)
    )
      throw new Error('The anatomical asset has nonfinite geometry.');
    triangles += indices.count / 3;
  }
  if (triangles !== anatomyProfiles[quality].triangles)
    throw new Error('Unexpected anatomical triangle count.');
  const bounds = new Box3().setFromObject(scene);
  const size = bounds.getSize(new Vector3());
  if (
    Math.min(size.x, size.y, size.z) < 2 ||
    Math.max(size.x, size.y, size.z) > 3.4
  )
    throw new Error('Unexpected anatomical proportions.');
  return {
    meshes,
    bounds,
    sphere: bounds.getBoundingSphere(new Sphere()),
    triangles,
  };
}

/** Fit a rotation-safe sphere, including at narrow portrait aspect ratios. */
export function fitAnatomy(
  camera: PerspectiveCamera,
  radius: number,
  aspect: number,
) {
  const vertical = (camera.fov * Math.PI) / 360;
  const horizontal = Math.atan(Math.tan(vertical) * aspect);
  const distance = (radius / Math.sin(Math.min(vertical, horizontal))) * 1.06;
  camera.aspect = aspect;
  camera.position.set(0, 0, distance);
  camera.near = Math.max(0.1, distance - radius * 1.6);
  camera.far = distance + radius * 2.5;
  camera.updateProjectionMatrix();
  return distance;
}
