import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export function batchStatic(world, furniture) {
  const excluded = new Set([world.selection]);
  furniture.props.forEach((p) => p.object.traverse((o) => excluded.add(o)));
  furniture.items.forEach((f) =>
    [f.steam, f.dust, f.mark]
      .filter(Boolean)
      .forEach((o) => o.traverse((c) => excluded.add(c))),
  );
  world.scene.updateMatrixWorld(true);
  const groups = new Map();
  world.scene.traverse((o) => {
    if (
      !o.isMesh ||
      o.isInstancedMesh ||
      excluded.has(o) ||
      Array.isArray(o.material)
    )
      return;
    const key = `${o.material.uuid}:${o.userData.furnitureId || "room"}:${o.castShadow}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map((m) => {
      const g = m.geometry.index
        ? m.geometry.toNonIndexed()
        : m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      for (const key of Object.keys(g.attributes))
        if (!["position", "normal", "uv"].includes(key)) g.deleteAttribute(key);
      return g;
    });
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((g) => g.dispose());
    if (!merged) continue;
    const first = meshes[0],
      batch = new THREE.Mesh(merged, first.material);
    batch.castShadow = first.castShadow;
    batch.receiveShadow = true;
    batch.userData = { ...first.userData };
    world.scene.add(batch);
    meshes.forEach((m) => m.removeFromParent());
  }
  furniture.pickables.length = 0;
  world.scene.traverse((o) => {
    if (o.isMesh && o.userData.furnitureId) furniture.pickables.push(o);
  });
}
