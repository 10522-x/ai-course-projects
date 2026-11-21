import * as THREE from "three";
import { ellipsoid, box, tube, mesh, planeArt } from "./shapes.js";
import {
  resolveDesign,
  createCharacterPalette,
  dollFaceTexture,
  bagTexture,
} from "./character-design.js";

const signedPower = (value, exponent) =>
  Math.sign(value) * Math.abs(value) ** exponent;

function faceSurface(x, y, design) {
  const [a, b, c] = design.face,
    power = 2 / design.cheek;
  return (
    c *
    Math.max(0, 1 - Math.abs(x / a) ** power - Math.abs(y / b) ** power) **
      (1 / power)
  );
}

// One continuous cap follows the photographed scalloped hairline, not separate hair beads.
function createHair(design) {
  const outline = design.calibrated ? [
    [-1, -0.065], [-0.94, -0.002], [-0.86, 0.067],
    [-0.77, 0.105], [-0.69, 0.096], [-0.60, 0.132],
    [-0.51, 0.122], [-0.43, 0.146], [-0.33, 0.141],
    [-0.23, 0.152], [-0.14, 0.139], [-0.07, 0.143],
    [-0.045, 0.211], [-0.012, 0.238], [0.027, 0.224],
    [0.055, 0.179], [0.042, 0.142], [0.14, 0.15],
    [0.25, 0.154], [0.33, 0.14], [0.43, 0.153],
    [0.53, 0.136], [0.62, 0.135], [0.71, 0.106],
    [0.81, 0.082], [0.89, 0.025], [1, -0.065],
  ] : [
    [-1, -0.105],
    [-0.89, -0.035],
    [-0.8, 0.015],
    [-0.73, 0.001],
    [-0.66, 0.05],
    [-0.6, 0.032],
    [-0.51, 0.068],
    [-0.44, 0.05],
    [-0.37, 0.1],
    [-0.3, 0.077],
    [-0.23, 0.102],
    [-0.17, 0.068],
    [-0.115, 0.125],
    [-0.06, 0.143],
    [0.005, 0.133],
    [0.052, 0.095],
    [0.14, 0.115],
    [0.23, 0.107],
    [0.29, 0.147],
    [0.36, 0.124],
    [0.46, 0.135],
    [0.52, 0.105],
    [0.63, 0.12],
    [0.72, 0.065],
    [0.83, 0.03],
    [0.9, -0.025],
    [1, -0.105],
  ];
  function edge(x) {
    const end = outline.findIndex((p) => p[0] >= x);
    if (end <= 0) return outline[0][1];
    const a = outline[end - 1],
      b = outline[end];
    let t = (x - a[0]) / (b[0] - a[0]);
    t = t * t * (3 - 2 * t);
    return THREE.MathUtils.lerp(a[1], b[1], t) * design.fringe;
  }
  const vertices = [],
    uv = [],
    indices = [];
  const columns = 224,
    rows = 42;
  const [width, height, depth] = design.hair;
  for (let row = 0; row <= rows; row++) {
    const u = row / rows;
    for (let column = 0; column <= columns; column++) {
      const phi = (column / columns) * Math.PI * 2,
        front = Math.cos(phi);
      const boundary = front >= 0 ? edge(Math.sin(phi)) : -0.105 + front * 0.12;
      const limit = Math.acos(
        THREE.MathUtils.clamp((boundary - design.hairY) / height, -1, 1),
      );
      const theta = u * limit;
      const ripple = 1 + 0.008 * Math.sin(phi * 7 + 0.4) * Math.sin(theta) ** 2;
      const x = width * Math.sin(theta) * Math.sin(phi) * ripple;
      const y = design.hairY + height * Math.cos(theta);
      let z = depth * Math.sin(theta) * Math.cos(phi) - 0.028;
      if (front > 0) {
        const surface = faceSurface(x, y, design) + 0.011;
        z = 0.5 * (z + surface + Math.sqrt((z - surface) ** 2 + 0.00015));
      }
      vertices.push(x, y, z);
      uv.push(column / columns, u);
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column,
          b = a + columns + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createFaceGeometry(design) {
  const geometry = new THREE.SphereGeometry(1, 64, 44),
    p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = signedPower(p.getX(i), design.cheek) * design.face[0];
    let y = signedPower(p.getY(i), design.cheek) * design.face[1];
    // A shallow central lift leaves the two low cheek lobes seen in the reference.
    if (design.calibrated && y < -0.13)
      y += 0.021 * Math.exp(-((x / 0.15) ** 2)) *
        THREE.MathUtils.smoothstep(-y, 0.13, 0.26);
    p.setXYZ(
      i,
      x,
      y,
      signedPower(p.getZ(i), design.cheek) * design.face[2],
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}

function ribbon(parent, material, points, width, project = (point) => point) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(...p)),
  );
  const vertices = [],
    indices = [];
  for (let i = 0; i <= 32; i++) {
    const point = curve.getPoint(i / 32),
      tangent = curve.getTangent(i / 32);
    const across = new THREE.Vector3(-tangent.y, tangent.x, 0)
      .normalize()
      .multiplyScalar(width / 2);
    vertices.push(
      ...project(point.clone().sub(across)).toArray(),
      ...project(point.clone().add(across)).toArray(),
    );
    if (i < 32) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return mesh(geometry, material, parent);
}

export function createCharacter({ variant = "faithful", outfit = true } = {}) {
  const design = resolveDesign(variant),
    palette = createCharacterPalette();
  const root = new THREE.Group();
  root.name = "Suoer";
  const body = new THREE.Group();
  root.add(body);
  const torsoGeometry = new THREE.SphereGeometry(1, 48, 36);
  const tp = torsoGeometry.attributes.position;
  for (let i = 0; i < tp.count; i++)
    tp.setXYZ(
      i,
      signedPower(tp.getX(i), 0.76),
      signedPower(tp.getY(i), 0.76),
      signedPower(tp.getZ(i), 0.82),
    );
  torsoGeometry.computeVertexNormals();
  const torsoY = design.torsoY ?? 0.48;
  const torso = mesh(torsoGeometry, palette.skin, body, [0, torsoY, 0]);
  torso.scale.set(...design.belly);
  const neckline = ellipsoid(
    body,
    palette.skin,
    [0, 0.746, 0],
    [0.238, 0.08, 0.175],
  );
  const head = new THREE.Group();
  head.position.y = design.headY;
  body.add(head);
  mesh(createFaceGeometry(design), palette.skin, head);
  const hair = mesh(createHair(design), palette.hair, head);
  hair.name = "ContinuousHair";
  for (const side of [-1, 1]) {
    const ear = ellipsoid(
      head,
      palette.skin,
      [side * (design.face[0] - 0.013), -0.105, -0.035],
      design.calibrated ? [0.065, 0.074, 0.07] : [0.085, 0.093, 0.07],
    );
    ear.rotation.z = side * 0.13;
    ellipsoid(
      head,
      palette.ear,
      [side * (design.face[0] + 0.015), -0.105, 0.027],
      [0.033, 0.052, 0.009],
    );
  }
  const faceMaps = [
    dollFaceTexture(design, false),
    dollFaceTexture(design, true),
  ];
  const faceMaterial = new THREE.MeshStandardMaterial({
    map: faceMaps[0],
    transparent: true,
    roughness: 1,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const faceGeo = new THREE.PlaneGeometry(
    design.face[0] * 1.95,
    design.face[1] * 1.94,
    52,
    36,
  );
  const fp = faceGeo.attributes.position;
  for (let i = 0; i < fp.count; i++)
    fp.setZ(i, faceSurface(fp.getX(i), fp.getY(i), design) + 0.002);
  faceGeo.computeVertexNormals();
  const face = mesh(faceGeo, faceMaterial, head);
  face.castShadow = false;

  const bareDetails = new THREE.Group();
  body.add(bareDetails);
  if (design.calibrated) {
    for (const side of [-1, 1]) {
      tube(bareDetails, palette.pink, [
        [side * 0.155 - 0.012, 0.736, 0.163],
        [side * 0.155, 0.728, 0.169],
        [side * 0.155 + 0.012, 0.736, 0.163],
      ], 0.004);
    }
  }

  const clothing = new THREE.Group();
  clothing.name = "Clothing";
  body.add(clothing);
  const scarf = new THREE.Group();
  scarf.position.set(0, 0.797, 0);
  clothing.add(scarf);
  const loop = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    loop.push([
      Math.cos(a) * 0.315,
      Math.sin(a * 2) * 0.01,
      Math.sin(a) * 0.232,
    ]);
  }
  tube(scarf, palette.scarf, loop, 0.071, true);
  const knot = ellipsoid(
    scarf,
    palette.scarf,
    [-0.12, -0.01, 0.275],
    [0.1, 0.07, 0.051],
  );
  knot.rotation.z = -0.12;
  const leftTail = box(
    scarf,
    palette.scarf,
    [-0.193, -0.115, 0.272],
    [0.13, 0.207, 0.057],
    0.045,
  );
  leftTail.rotation.z = -0.32;
  const shortTail = box(
    scarf,
    palette.scarf,
    [0.045, -0.042, 0.285],
    [0.23, 0.105, 0.045],
    0.035,
  );
  shortTail.rotation.z = 0.13;
  tube(
    scarf,
    palette.scarfFold,
    [
      [-0.08, -0.025, 0.321],
      [0.035, -0.032, 0.311],
      [0.135, -0.018, 0.302],
    ],
    0.005,
  );
  for (let i = 0; i < 4; i++)
    tube(
      scarf,
      palette.scarfFold,
      [
        [-0.22 + i * 0.021, -0.17, 0.301],
        [-0.231 + i * 0.021, -0.206, 0.301],
      ],
      0.004,
    );
  const patchDepth = design.belly[2] - (design.calibrated ? 0.018 : 0);
  const patch = ellipsoid(
    clothing,
    palette.pink,
    [0.015, 0.412, patchDepth + 0.001],
    [0.115, 0.073, 0.015],
  );
  ellipsoid(
    clothing,
    palette.pinkLight,
    [0.015, 0.414, patchDepth + 0.016],
    [0.061, 0.04, 0.003],
  );
  for (const side of [-1, 1])
    ellipsoid(
      clothing,
      palette.pink,
      [0.015 + side * 0.022, 0.412, patchDepth + 0.02],
      [0.009, 0.017, 0.002],
    );
  tube(
    clothing,
    palette.seam,
    design.calibrated ? [
      [-0.28, 0.36, 0.153],
      [-0.18, 0.313, 0.177],
      [0, 0.296, 0.158],
      [0.18, 0.313, 0.177],
      [0.28, 0.36, 0.153],
    ] : [
      [-0.28, 0.27, 0.125],
      [-0.18, 0.21, 0.185],
      [0, 0.184, 0.199],
      [0.18, 0.21, 0.185],
      [0.28, 0.27, 0.125],
    ],
    0.004,
  );

  const arms = [],
    hands = [],
    legs = [],
    sleeves = [],
    feet = [],
    cuffs = [],
    palms = [],
    legSleeves = [],
    armSleeves = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.28, 0.742, 0.008);
    body.add(arm);
    arms.push(arm);
    const sleeveGeometry = new THREE.SphereGeometry(1, 32, 24),
      sp = sleeveGeometry.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const y = sp.getY(i),
        width = 0.91 + (0.12 * (y + 1)) / 2;
      sp.setXYZ(
        i,
        signedPower(sp.getX(i), 0.8) * width,
        signedPower(y, 0.82),
        signedPower(sp.getZ(i), 0.85) * width,
      );
    }
    sleeveGeometry.computeVertexNormals();
    const sleeve = mesh(sleeveGeometry, palette.skin, arm, [
      side * 0.035,
      -0.12,
      0,
    ]);
    sleeve.scale.set(0.126, 0.188, 0.128);
    sleeve.rotation.z = side * 0.15;
    sleeves.push(sleeve);
    armSleeves.push(sleeve);
    if (design.calibrated) {
      ellipsoid(arm, palette.pink, [side * 0.035, -0.147, 0.125],
        [0.036, 0.049, 0.006]).name = "PalmPad";
      for (const [x, y] of [[-0.042, 0.052], [0, 0.074], [0.042, 0.052]]) {
        const pad = ellipsoid(arm, palette.pinkLight,
          [side * 0.035 + x, -0.147 + y, 0.124],
          [0.012, 0.017, 0.006]);
        pad.name = "ToePad";
      }
    }
    cuffs.push(
      ellipsoid(
        arm,
        palette.cuff,
        [side * 0.06, -0.213, 0.006],
        [0.11, 0.052, 0.112],
      ),
    );
    const hand = new THREE.Group();
    hand.position.set(side * 0.076, -0.273, 0.016);
    arm.add(hand);
    hands.push(hand);
    palms.push(
      ellipsoid(hand, palette.skin, [0, 0.012, 0], [0.086, 0.08, 0.083]),
    );
    const leg = new THREE.Group();
    leg.position.set(side * 0.163, 0.226, 0);
    body.add(leg);
    legs.push(leg);
    const legSleeve = ellipsoid(
      leg,
      palette.skin,
      [0, -0.055, 0.017],
      [0.143, 0.171, 0.149],
    );
    sleeves.push(legSleeve);
    legSleeves.push(legSleeve);
    feet.push(
      ellipsoid(leg, palette.skin, [0, -0.17, 0.028], [0.125, 0.069, 0.132]),
    );
  }

  const bag = new THREE.Group();
  bag.name = "Satchel";
  bag.position.set(-0.36, 0.432, 0.105);
  bag.rotation.z = -0.075;
  clothing.add(bag);
  box(bag, palette.bag, [0, 0, 0], [0.231, 0.386, 0.104], 0.046);
  box(bag, palette.bagTrim, [0, 0, 0.05], [0.202, 0.351, 0.016], 0.026);
  planeArt(bag, bagTexture(), [-0.01, 0, 0.061], 0.164, 0.318);
  tube(
    bag,
    palette.bagTrim,
    [
      [0.078, 0.21, 0.023],
      [0.092, 0.12, 0.066],
      [0.092, -0.159, 0.068],
      [0.049, -0.179, 0.068],
      [0.043, 0.139, 0.068],
    ],
    0.012,
  );
  palette.bagTrim.side = THREE.DoubleSide;
  const conformStrap = (side) => (point) => {
    const [a, b, c] = design.belly;
    const depth =
      c *
      Math.max(
        0,
        1 -
          Math.abs(point.x / a) ** (2 / 0.76) -
          Math.abs((point.y - torsoY) / b) ** (2 / 0.76),
      ) **
        (0.82 / 2);
    const blend =
      (1 - THREE.MathUtils.smoothstep(point.y, 0.735, 0.795)) *
      (1 - THREE.MathUtils.smoothstep(Math.abs(point.x), a * 0.89, a * 1.07));
    point.z = THREE.MathUtils.lerp(point.z, side * (depth + 0.016), blend);
    return point;
  };
  ribbon(
    clothing,
    palette.bagTrim,
    [
      [0.265, 0.836, 0.132],
      [0.17, 0.715, 0.257],
      [-0.055, 0.589, design.belly[2] + 0.037],
      [-0.307, 0.449, 0.199],
    ],
    0.029,
    conformStrap(1),
  );
  ribbon(
    clothing,
    palette.bagTrim,
    [
      [0.265, 0.836, 0.132],
      [0.29, 0.841, 0],
      [0.236, 0.756, -0.16],
      [0.1, 0.665, -0.232],
      [-0.1, 0.526, -0.251],
      [-0.365, 0.444, 0.055],
    ],
    0.029,
    conformStrap(-1),
  );

  let isDressed = outfit;
  function setOutfit(value) {
    isDressed = Boolean(value);
    clothing.visible = isDressed;
    neckline.visible = isDressed || !design.calibrated;
    bareDetails.visible = !isDressed;
    arms.forEach((arm) => arm.children.forEach((part) => {
      if (part.name === "PalmPad" || part.name === "ToePad")
        part.visible = !isDressed;
    }));
    torso.material = isDressed ? palette.suit : palette.skin;
    neckline.material = isDressed ? palette.suit : palette.skin;
    sleeves.forEach(
      (part) => (part.material = isDressed ? palette.suit : palette.skin),
    );
    feet.forEach((part) => {
      part.material = palette.sole;
      part.visible = isDressed;
    });
    palms.forEach((part) => (part.visible = isDressed));
    legSleeves.forEach((part) => {
      part.scale.y = isDressed ? 0.146 : 0.171;
      if (design.calibrated) {
        part.scale.x = 0.151;
        part.position.y = isDressed ? -0.055 : -0.039;
        part.scale.y = isDressed ? 0.146 : 0.187;
      }
    });
    armSleeves.forEach((part) => {
      part.scale.y = isDressed ? 0.188 : 0.155;
      part.position.y = isDressed ? -0.12 : -0.106;
    });
    cuffs.forEach((part) => (part.visible = isDressed));
  }
  function resetPose() {
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    arms.forEach((arm, i) =>
      arm.rotation.set(
        0,
        0,
        (i === 0 ? -1 : 1) * design.restArm * (isDressed ? 0.58 : 1),
      ),
    );
    legs.forEach((leg) => leg.rotation.set(0, 0, 0));
    scarf.rotation.set(0, 0, 0);
    bag.rotation.set(0, 0, -0.075);
  }
  function idle(time, sleeping = false) {
    faceMaterial.map = faceMaps[sleeping || time % 5.8 > 5.62 ? 1 : 0];
    torso.scale.y = design.belly[1] * (1 + Math.sin(time * 1.7) * 0.012);
    scarf.rotation.z = Math.sin(time * 1.6) * 0.012;
    bag.rotation.z = -0.075 + Math.sin(time * 1.6 + 0.8) * 0.015;
  }
  function dispose() {
    const materials = new Set(Object.values(palette)),
      textures = new Set(faceMaps),
      geometries = new Set();
    root.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material)
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material])
          materials.add(material);
    });
    materials.forEach((material) => {
      for (const value of Object.values(material))
        if (value?.isTexture) textures.add(value);
      material.dispose();
    });
    textures.forEach((texture) => texture.dispose());
    geometries.forEach((geometry) => geometry.dispose());
    root.removeFromParent();
  }
  setOutfit(outfit);
  resetPose();
  return {
    root,
    body,
    torso,
    head,
    arms,
    hands,
    legs,
    scarf,
    bag,
    patch,
    face,
    resetPose,
    idle,
    setOutfit,
    dispose,
    variant: design.id,
    get outfit() {
      return isDressed;
    },
  };
}
