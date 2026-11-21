import * as THREE from "three";
import { mat, cloth, artTexture, canvasTexture } from "./materials.js";
import {
  box,
  ellipsoid,
  cylinder,
  tube,
  rod,
  arch,
  planeArt,
} from "./shapes.js";
import { furnitureConfig } from "./config.js";

function makeCookie() {
  const group = new THREE.Group();
  const cookie = cylinder(
    group,
    cloth("#d5ac70"),
    [0, 0, 0],
    0.115,
    0.034,
    0.112,
    20,
  );
  cookie.rotation.x = Math.PI / 2;
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4,
      r = 0.035 + (i % 3) * 0.022;
    ellipsoid(
      group,
      mat.ink,
      [Math.cos(a) * r, Math.sin(a) * r, 0.021],
      [0.013, 0.016, 0.009],
    );
  }
  return group;
}
function makeBook() {
  const g = new THREE.Group();
  box(g, mat.sage, [0, 0, 0], [0.38, 0.05, 0.29], 0.012);
  box(g, mat.cream, [0, 0.025, 0], [0.35, 0.022, 0.264], 0.006);
  const cover = planeArt(g, artTexture("book"), [0, 0.038, 0], 0.37, 0.278);
  cover.rotation.x = -Math.PI / 2;
  const page = new THREE.Group();
  page.position.set(-0.005, 0.04, 0);
  g.add(page);
  const sheet = box(
    page,
    mat.white,
    [0.084, 0, 0],
    [0.168, 0.004, 0.25],
    0.002,
  );
  for (let i = 0; i < 4; i++)
    box(
      page,
      mat.sage,
      [0.085, 0.004, -0.07 + i * 0.04],
      [0.115, 0.002, 0.007],
      0.001,
    );
  g.userData.page = page;
  return g;
}
function makeSpoon() {
  const g = new THREE.Group();
  rod(g, mat.wood, [0, -0.29, 0], [0, 0.08, 0], 0.019);
  ellipsoid(g, mat.wood, [0, -0.32, 0], [0.056, 0.076, 0.025]);
  return g;
}
function makeBroom() {
  const g = new THREE.Group();
  rod(g, mat.wood, [0, -0.35, 0], [0, 0.35, 0], 0.023);
  box(g, mat.scarf, [0, -0.41, 0], [0.29, 0.16, 0.072], 0.02);
  for (let i = 0; i < 17; i++)
    rod(
      g,
      mat.yellow,
      [-0.132 + i * 0.016, -0.41, 0.004],
      [-0.145 + i * 0.018, -0.55, 0.007],
      0.008,
    );
  tube(
    g,
    mat.rose,
    [
      [-0.135, -0.378, 0.045],
      [0, -0.389, 0.05],
      [0.135, -0.378, 0.045],
    ],
    0.012,
  );
  return g;
}
export function createFurniture(scene) {
  const items = new Map(),
    pickables = [];
  const props = new Map();
  function prop(id, object, parent, pos, rotation = [0, 0, 0]) {
    object.name = id;
    object.position.set(...pos);
    object.rotation.set(...rotation);
    parent.add(object);
    props.set(id, {
      object,
      homeParent: parent,
      homePosition: object.position.clone(),
      homeQuaternion: object.quaternion.clone(),
      homeScale: object.scale.clone(),
    });
    return object;
  }
  for (const config of furnitureConfig) {
    const group = new THREE.Group();
    group.position.set(...config.position);
    group.rotation.y = config.yaw;
    scene.add(group);
    const item = { ...config, group };
    items.set(config.id, item);
    switch (config.id) {
      case "sleep": {
        box(group, mat.pinkPaint, [0, 0.22, 0], [1.82, 0.4, 3.18], 0.12);
        box(group, mat.wood, [0, 0.22, 0.13], [1.66, 0.27, 2.96], 0.05);
        box(group, mat.cream, [0, 0.49, 0], [1.69, 0.26, 3.06], 0.16);
        const quiltMat = new THREE.MeshStandardMaterial({
          map: artTexture("quilt"),
          roughness: 1,
          bumpMap: mat.cream.bumpMap,
          bumpScale: 0.025,
        });
        box(group, quiltMat, [0, 0.668, 0.45], [1.71, 0.18, 1.89], 0.08);
        box(group, mat.white, [0, 0.68, -1.02], [1.28, 0.28, 0.6], 0.17);
        tube(
          group,
          mat.scarf,
          [
            [-0.6, 0.715, -1.3],
            [-0.68, 0.73, -1.05],
            [-0.6, 0.715, -0.76],
            [0.6, 0.715, -0.76],
            [0.68, 0.73, -1.05],
            [0.6, 0.715, -1.3],
          ],
          0.009,
          true,
        );
        box(group, mat.pinkPaint, [0, 0.4, -1.58], [1.86, 0.82, 0.12], 0.055);
        box(group, mat.pinkPaint, [0, 0.27, 1.59], [1.86, 0.5, 0.12], 0.055);
        const label = canvasTexture((ctx, s) => {
          ctx.fillStyle = "#ede0bd";
          ctx.fillRect(0, 0, s, s);
          ctx.strokeStyle = "#bda276";
          ctx.lineWidth = 10;
          ctx.strokeRect(25, 90, 462, 330);
          ctx.fillStyle = "#98775c";
          ctx.font = "48px Georgia";
          ctx.textAlign = "center";
          ctx.fillText("little dreams", 256, 260);
          ctx.font = "24px Georgia";
          ctx.fillText("MADE OF SOFT DAYS", 256, 325);
        });
        planeArt(group, label, [0, 0.28, 1.658], 0.77, 0.27);
        for (let i = 0; i < 21; i++)
          box(
            group,
            mat.darkwood,
            [0.916, 0.22, -1.22 + i * 0.12],
            [0.008, 0.22, 0.028],
            0.001,
          );
        const bedside = new THREE.Group();
        bedside.position.set(-0.23, 0, -2.13);
        group.add(bedside);
        cylinder(bedside, mat.wood, [0, 0.4, 0], 0.38, 0.1);
        cylinder(bedside, mat.darkwood, [0, 0.2, 0], 0.055, 0.37);
        cylinder(bedside, mat.brass, [0, 0.49, 0], 0.14, 0.05);
        cylinder(bedside, mat.brass, [0, 0.71, 0], 0.027, 0.42);
        const shadeMat = new THREE.MeshStandardMaterial({
          color: "#f5ddb0",
          roughness: 1,
          emissive: "#ecc782",
          emissiveIntensity: 0.23,
        });
        cylinder(bedside, shadeMat, [0, 0.93, 0], 0.16, 0.29, 0.28);
        const light = new THREE.PointLight("#ffda9a", 1.8, 3, 2);
        light.position.set(0, 0.89, 0.05);
        bedside.add(light);
        break;
      }
      case "cook": {
        group.scale.y = 0.8;
        box(group, mat.greenPaint, [0, 0.47, 0], [2.16, 0.92, 0.9], 0.065);
        box(group, mat.wood, [0, 0.96, 0], [2.31, 0.12, 1.02], 0.055);
        for (const x of [-0.54, 0.54]) {
          box(
            group,
            mat.wallGreen,
            [x, 0.48, 0.464],
            [0.91, 0.71, 0.035],
            0.035,
          );
          rod(
            group,
            mat.brass,
            [x - 0.13, 0.72, 0.5],
            [x + 0.13, 0.72, 0.5],
            0.018,
          );
        }
        cylinder(group, mat.ink, [0.1, 1.035, 0.2], 0.29, 0.024);
        cylinder(group, mat.pinkPaint, [0.1, 1.16, 0.2], 0.235, 0.22, 0.21);
        cylinder(group, mat.scarf, [0.1, 1.276, 0.2], 0.21, 0.008);
        for (const side of [-1, 1])
          tube(
            group,
            mat.pinkPaint,
            [
              [0.1 + side * 0.21, 1.2, 0.2],
              [0.1 + side * 0.35, 1.22, 0.2],
              [0.1 + side * 0.35, 1.14, 0.2],
              [0.1 + side * 0.22, 1.14, 0.2],
            ],
            0.027,
          );
        for (let i = 0; i < 5; i++)
          ellipsoid(
            group,
            i % 2 ? mat.sage : mat.rose,
            [0.1 + Math.sin(i * 2) * 0.13, 1.285, 0.2 + Math.cos(i * 2) * 0.12],
            [0.045, 0.012, 0.035],
          );
        box(group, mat.wood, [0.58, 1.045, 0.08], [0.55, 0.038, 0.46], 0.045);
        for (let i = 0; i < 2; i++) {
          ellipsoid(
            group,
            mat.yellow,
            [0.51 + i * 0.15, 1.102, 0.12],
            [0.06, 0.05, 0.11],
          );
        }
        cylinder(group, mat.ceramic, [0.67, 1.17, -0.28], 0.088, 0.26);
        prop("spoon", makeSpoon(), group, [0.1, 1.56, 0.38], [0.6, 0, 0]);
        const steam = new THREE.Group();
        group.add(steam);
        steam.position.set(0.1, 1.32, 0.2);
        const steamMat = new THREE.MeshBasicMaterial({
          color: "#ffffff",
          transparent: true,
          opacity: 0.14,
          depthWrite: false,
        });
        for (let i = 0; i < 3; i++)
          tube(
            steam,
            steamMat,
            [
              [i * 0.08 - 0.08, 0, 0],
              [i * 0.08 - 0.05, 0.13, 0],
              [i * 0.08 - 0.1, 0.26, 0],
              [i * 0.08 - 0.06, 0.38, 0],
            ],
            0.013,
          );
        item.steam = steam;
        break;
      }
      case "eat": {
        cylinder(group, mat.wood, [0, 0.88, 0], 0.86, 0.12);
        for (const x of [-0.47, 0.47])
          for (const z of [-0.43, 0.43])
            rod(
              group,
              mat.wood,
              [x, 0.84, z],
              [x * 1.18, 0.04, z * 1.18],
              0.048,
            );
        const placemat = cylinder(
          group,
          mat.sage,
          [0.05, 0.95, 0.18],
          0.46,
          0.014,
        );
        const plate = cylinder(
          group,
          mat.bluePaint,
          [0, 0.975, 0.66],
          0.255,
          0.046,
        );
        for (let i = 0; i < 28; i++) {
          const a = (i / 28) * Math.PI * 2;
          box(
            group,
            mat.bluePaint,
            [Math.cos(a) * 0.253, 0.98, 0.66 + Math.sin(a) * 0.253],
            [0.012, 0.045, 0.018],
            0.005,
          ).rotation.y = -a;
        }
        cylinder(group, mat.cream, [0, 1.001, 0.66], 0.219, 0.006);
        prop(
          "cookie",
          makeCookie(),
          group,
          [0, 1.025, 0.78],
          [-Math.PI / 2, 0, 0.2],
        );
        const cheese = new THREE.Group();
        group.add(cheese);
        cheese.position.set(0.29, 0.986, 0.04);
        const shape = new THREE.Shape();
        shape.moveTo(-0.1, -0.12);
        shape.lineTo(0.13, 0);
        shape.lineTo(-0.1, 0.12);
        shape.closePath();
        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: 0.1,
          bevelEnabled: true,
          bevelSize: 0.007,
          bevelThickness: 0.007,
          bevelSegments: 2,
          steps: 1,
        });
        const cheeseMesh = new THREE.Mesh(geo, mat.yellow);
        cheeseMesh.rotation.x = -Math.PI / 2;
        cheese.add(cheeseMesh);
        for (let i = 0; i < 3; i++)
          cylinder(
            cheese,
            mat.scarf,
            [-0.06 + i * 0.04, 0.112, (i % 2) * 0.07 - 0.035],
            0.013,
            0.002,
          );
        cylinder(group, mat.ceramic, [0.4, 1.085, -0.34], 0.1, 0.24, 0.085);
        cylinder(group, mat.scarf, [0.4, 1.21, -0.34], 0.08, 0.005);
        tube(
          group,
          mat.ceramic,
          [
            [0.49, 1.15, -0.34],
            [0.57, 1.14, -0.34],
            [0.58, 1.03, -0.34],
            [0.49, 1.02, -0.34],
          ],
          0.018,
        );
        const chair = new THREE.Group();
        chair.position.set(0, 0, 1.45);
        group.add(chair);
        cylinder(chair, mat.wood, [0, 0.42, 0], 0.38, 0.09);
        cylinder(chair, mat.blush, [0, 0.49, 0], 0.34, 0.08);
        for (const x of [-0.24, 0.24])
          for (const z of [-0.2, 0.2])
            rod(
              chair,
              mat.wood,
              [x, 0.4, z],
              [x * 1.13, 0.035, z * 1.13],
              0.032,
            );
        for (const x of [-0.28, 0.28])
          rod(chair, mat.wood, [x, 0.39, 0.22], [x, 0.94, 0.25], 0.032);
        tube(
          chair,
          mat.wood,
          [
            [-0.28, 0.87, 0.25],
            [0, 0.97, 0.3],
            [0.28, 0.87, 0.25],
          ],
          0.055,
        );
        break;
      }
      case "read": {
        for (const x of [-0.98, 0.98])
          box(group, mat.wood, [x, 0.74, 0], [0.095, 1.48, 0.52], 0.025);
        for (const y of [0.12, 0.64, 1.18])
          box(group, mat.wood, [0, y, 0], [2.03, 0.09, 0.57], 0.02);
        box(group, mat.pinkPaint, [0, 0.73, -0.25], [1.99, 1.45, 0.045], 0.015);
        const colors = [mat.sage, mat.blue, mat.rose, mat.cream, mat.yellow];
        for (let i = 0; i < 9; i++) {
          const x = -0.81 + i * 0.175,
            h = 0.28 + (i % 3) * 0.055;
          const book = box(
            group,
            colors[i % 5],
            [x, 0.7 + h / 2, 0.005],
            [0.115, h, 0.32],
            0.014,
          );
          book.rotation.z = i === 7 ? -0.16 : 0;
          box(group, mat.cream, [x, 0.77, 0.174], [0.077, 0.014, 0.005], 0.001);
        }
        for (let i = 0; i < 4; i++)
          box(
            group,
            colors[(i + 1) % 5],
            [-0.47, 0.22 + i * 0.065, 0.03],
            [0.55, 0.056, 0.37],
            0.01,
          );
        box(group, mat.sage, [0.52, 0.34, 0], [0.6, 0.34, 0.38], 0.03);
        box(group, mat.white, [0.52, 0.36, 0.198], [0.24, 0.1, 0.01], 0.01);
        prop("book", makeBook(), group, [-0.23, 0.637, 1.0]);
        const spool = new THREE.Group();
        spool.position.set(-0.23, 0, 1);
        group.add(spool);
        cylinder(spool, mat.wood, [0, 0.085, 0], 0.39, 0.11);
        cylinder(spool, mat.scarf, [0, 0.25, 0], 0.26, 0.28);
        for (let i = 0; i < 10; i++) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.264, 0.009, 5, 32),
            mat.cream,
          );
          ring.rotation.x = Math.PI / 2;
          ring.position.y = 0.13 + i * 0.026;
          spool.add(ring);
        }
        cylinder(spool, mat.wood, [0, 0.42, 0], 0.39, 0.09);
        ellipsoid(spool, mat.sage, [0, 0.5, 0], [0.35, 0.1, 0.35]);
        plant(group, [0.62, 1.23, 0], 0.65);
        break;
      }
      case "draw": {
        for (const x of [-0.44, 0.44])
          rod(group, mat.wood, [x, 0.03, 0.26], [x * 0.56, 1.94, -0.13], 0.039);
        rod(group, mat.wood, [0, 0.05, -0.44], [0, 1.8, -0.14], 0.035);
        box(group, mat.wood, [0, 0.72, 0.19], [1.08, 0.09, 0.19], 0.02);
        box(group, mat.wood, [0, 1.3, -0.02], [1.04, 1.08, 0.075], 0.02);
        const painting = planeArt(
          group,
          artTexture("drawing"),
          [0, 1.31, 0.022],
          0.96,
          1,
        );
        item.painting = painting;
        const markMat = new THREE.MeshStandardMaterial({
          color: "#b8c797",
          transparent: true,
          opacity: 0,
          roughness: 1,
        });
        item.mark = box(
          group,
          markMat,
          [0.33, 1.13, 0.03],
          [0.1, 0.24, 0.004],
          0.001,
        );
        prop(
          "crayon",
          cylinder(null, mat.rose, [0, 0, 0], 0.022, 0.2, 0.022, 8),
          group,
          [-0.32, 0.805, 0.2],
          [0, 0, Math.PI / 2],
        );
        for (let i = 0; i < 4; i++)
          cylinder(
            group,
            [mat.sage, mat.blue, mat.yellow, mat.rose][i],
            [-0.32 + i * 0.065, 0.803, 0.21],
            0.018,
            0.16,
            0.018,
            8,
          ).rotation.z = Math.PI / 2 + 0.1 * i;
        box(
          group,
          mat.cream,
          [-0.21, 0.03, 0.68],
          [0.66, 0.023, 0.46],
          0.014,
        ).rotation.y = 0.22;
        break;
      }
      case "sweep": {
        cylinder(group, mat.scarf, [0, 0.29, 0], 0.48, 0.53, 0.39);
        cylinder(group, mat.ink, [0, 0.563, 0], 0.415, 0.01);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          rod(
            group,
            mat.cream,
            [Math.cos(a) * 0.38, 0.04, Math.sin(a) * 0.38],
            [Math.cos(a) * 0.48, 0.56, Math.sin(a) * 0.48],
            0.012,
          );
        }
        for (let i = 0; i < 9; i++) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.4 + i * 0.009, 0.012, 5, 40),
            mat.cream,
          );
          ring.rotation.x = Math.PI / 2;
          ring.position.y = 0.07 + i * 0.057;
          group.add(ring);
        }
        tube(
          group,
          mat.scarf,
          [
            [-0.43, 0.51, 0],
            [-0.46, 0.78, 0],
            [0.46, 0.78, 0],
            [0.43, 0.51, 0],
          ],
          0.034,
        );
        ellipsoid(group, mat.blush, [-0.13, 0.57, 0.01], [0.25, 0.24, 0.24]);
        ellipsoid(group, mat.blue, [0.22, 0.56, 0.12], [0.18, 0.28, 0.18]);
        prop("broom", makeBroom(), group, [-0.45, 0.56, 0.46], [0, 0, -0.17]);
        const dust = new THREE.Group();
        scene.add(dust);
        for (let i = 0; i < 6; i++)
          ellipsoid(
            dust,
            mat.scarf,
            [2.07 + (i % 3) * 0.16, 0.018, 2.36 + Math.floor(i / 3) * 0.15],
            [0.03, 0.007, 0.016],
          );
        item.dust = dust;
        break;
      }
      case "blocks": {
        const colors = [mat.sage, mat.bluePaint, mat.pinkPaint, mat.yellow];
        for (let i = 0; i < 4; i++) {
          const x = -0.05 + (i % 2) * 0.26,
            z = 0.67 + Math.floor(i / 2) * 0.25;
          box(group, colors[i], [x, 0.13, z], [0.23, 0.23, 0.23], 0.028);
        }
        prop(
          "block",
          box(null, mat.bluePaint, [0, 0, 0], [0.23, 0.23, 0.23], 0.028),
          group,
          [-0.52, 0.13, 0.54],
        );
        const triangle = new THREE.ConeGeometry(0.2, 0.23, 4);
        const roof = new THREE.Mesh(triangle, mat.pinkPaint);
        roof.rotation.y = Math.PI / 4;
        roof.position.set(0.09, 0.36, 0.67);
        group.add(roof);
        for (let i = 0; i < 2; i++)
          box(
            group,
            colors[i + 2],
            [0.74 + i * 0.2, 0.11, 0.2],
            [0.18, 0.18, 0.18],
            0.02,
          ).rotation.y = 0.2 + i;
        break;
      }
      case "idle": {
        const cushion = box(
          group,
          mat.sage,
          [0, 0.15, 0],
          [0.91, 0.25, 0.74],
          0.12,
        );
        tube(
          group,
          mat.cream,
          [
            [-0.39, 0.2, -0.3],
            [-0.43, 0.2, 0],
            [-0.39, 0.2, 0.3],
            [0.39, 0.2, 0.3],
            [0.43, 0.2, 0],
            [0.39, 0.2, -0.3],
          ],
          0.009,
          true,
        );
        const cuddle = new THREE.Group();
        box(cuddle, mat.blush, [0, 0, 0], [0.45, 0.38, 0.17], 0.11);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          ellipsoid(
            cuddle,
            mat.white,
            [Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0.091],
            [0.046, 0.048, 0.012],
          );
        }
        ellipsoid(cuddle, mat.yellow, [0, 0, 0.107], [0.029, 0.03, 0.009]);
        prop("cushion", cuddle, group, [0.14, 0.38, 0.06], [0.12, 0, -0.15]);
        break;
      }
    }
    group.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        object.userData.furnitureId = config.id;
        pickables.push(object);
      }
    });
  }
  return { items, props, pickables };
}

export function plant(parent, pos, scale = 1) {
  const g = new THREE.Group();
  g.position.set(...pos);
  g.scale.setScalar(scale);
  parent.add(g);
  cylinder(g, mat.ceramic, [0, 0.16, 0], 0.2, 0.3, 0.14);
  cylinder(g, mat.darkwood, [0, 0.31, 0], 0.17, 0.01);
  for (let i = 0; i < 6; i++) {
    const a = i * 2.4,
      h = 0.34 + (i % 3) * 0.13,
      x = Math.sin(a) * 0.19,
      z = Math.cos(a) * 0.16;
    rod(g, mat.green, [0, 0.28, 0], [x, h + 0.16, z], 0.012);
    const leaf = ellipsoid(
      g,
      i % 2 ? mat.sage : mat.green,
      [x, h + 0.16, z],
      [0.09, 0.17, 0.028],
    );
    leaf.rotation.set(0.4, -a, -0.6 * Math.sin(a));
  }
  return g;
}
