import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const sphere = new THREE.SphereGeometry(1, 32, 24);
const cache = new Map();
export function mesh(geometry, material, parent, position = [0, 0, 0]) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...position);
  m.castShadow = true;
  m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
export function ellipsoid(parent, material, position, scale) {
  const m = mesh(sphere, material, parent, position);
  m.scale.set(...scale);
  return m;
}
export function box(parent, material, position, size, radius = 0.06) {
  const key = [...size, radius].join(",");
  if (!cache.has(key))
    cache.set(
      key,
      new RoundedBoxGeometry(
        ...size,
        3,
        Math.min(radius, ...size.map((v) => v * 0.49)),
      ),
    );
  return mesh(cache.get(key), material, parent, position);
}
export function cylinder(
  parent,
  material,
  position,
  radius,
  height,
  bottom = radius,
  segments = 32,
) {
  const key = `c${radius},${bottom},${height},${segments}`;
  if (!cache.has(key))
    cache.set(
      key,
      new THREE.CylinderGeometry(radius, bottom, height, segments),
    );
  return mesh(cache.get(key), material, parent, position);
}
export function tube(parent, material, points, radius = 0.025, closed = false) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(...p)),
    closed,
  );
  return mesh(
    new THREE.TubeGeometry(
      curve,
      Math.max(12, points.length * 6),
      radius,
      6,
      closed,
    ),
    material,
    parent,
  );
}
export function rod(parent, material, a, b, radius = 0.03) {
  const start = new THREE.Vector3(...a),
    end = new THREE.Vector3(...b),
    diff = end.clone().sub(start);
  const m = cylinder(
    parent,
    material,
    start.clone().add(end).multiplyScalar(0.5).toArray(),
    radius,
    diff.length(),
    radius,
    12,
  );
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), diff.normalize());
  return m;
}
export function archShape(width, height, base = 0) {
  const r = width / 2,
    shape = new THREE.Shape();
  shape.moveTo(-r, base);
  shape.lineTo(r, base);
  shape.lineTo(r, base + height - r);
  shape.absarc(0, base + height - r, r, 0, Math.PI, false);
  shape.lineTo(-r, base);
  return shape;
}
export function arch(parent, material, pos, width, height, depth = 0.08) {
  const geo = new THREE.ExtrudeGeometry(archShape(width, height), {
    depth,
    bevelEnabled: true,
    bevelSize: 0.035,
    bevelThickness: 0.025,
    bevelSegments: 3,
    steps: 1,
    curveSegments: 28,
  });
  return mesh(geo, material, parent, pos);
}
export function planeArt(parent, texture, position, width, height) {
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  return mesh(
    new THREE.PlaneGeometry(width, height),
    material,
    parent,
    position,
  );
}
