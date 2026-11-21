import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mat, artTexture, canvasTexture } from "./materials.js";
import {
  box,
  cylinder,
  ellipsoid,
  rod,
  tube,
  arch,
  archShape,
  planeArt,
  mesh,
} from "./shapes.js";
import { plant } from "./furniture.js";

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#e5ece5");
  const camera = new THREE.OrthographicCamera(-8, 8, 6, -6, 0.1, 70);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.minPolarAngle = 0.48;
  controls.maxPolarAngle = 1.17;
  controls.minAzimuthAngle = -0.58;
  controls.maxAzimuthAngle = 1.08;
  controls.minZoom = 0.8;
  controls.maxZoom = 2.25;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.7;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  let width = innerWidth,
    height = innerHeight;
  function reset() {
    camera.position.set(10.8, 11.2, 16);
    controls.target.set(0, 0.75, 0);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    controls.update();
  }
  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    const aspect = width / height,
      span = aspect < 0.8 ? 14.7 / aspect : 11.7;
    camera.left = (-span * aspect) / 2;
    camera.right = (span * aspect) / 2;
    camera.top = span / 2;
    camera.bottom = -span / 2;
    // Reserve the upper controls on short portrait screens without shrinking the house.
    const offset = aspect < 0.8 ? Math.max(0, 740 - height) * 0.6 * span / height : 0;
    camera.top += offset;
    camera.bottom += offset;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  const ambient = new THREE.HemisphereLight("#fff8ed", "#a1b5a0", 1.9);
  scene.add(ambient);
  const key = new THREE.DirectionalLight("#fff0db", 2.0);
  key.position.set(-3, 10, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, {
    left: -8,
    right: 8,
    top: 8,
    bottom: -8,
    near: 0.5,
    far: 25,
  });
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.025;
  key.shadow.radius = 4;
  scene.add(key);
  const fill = new THREE.DirectionalLight("#d8e7ed", 1.0);
  fill.position.set(7, 5, -2);
  scene.add(fill);
  const stage = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshBasicMaterial({ color: "#e5ece5", toneMapped: false }),
  );
  stage.rotation.x = -Math.PI / 2;
  stage.position.y = -0.48;
  scene.add(stage);
  const stageShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.ShadowMaterial({ color: "#536551", opacity: 0.14 }),
  );
  stageShadow.rotation.x = -Math.PI / 2;
  stageShadow.position.y = -0.475;
  stageShadow.receiveShadow = true;
  scene.add(stageShadow);
  const room = new THREE.Group();
  scene.add(room);
  box(room, mat.greenPaint, [0, -0.28, 0], [10.3, 0.37, 8.45], 0.2);
  box(room, mat.pinkPaint, [0, -0.1, 0], [10.1, 0.1, 8.26], 0.04);
  box(room, mat.darkwood, [0, -0.015, 0], [10.02, 0.12, 8.17], 0.07);
  // Individual planks keep wood grain aligned with their long direction.
  for (let z = 0; z < 13; z++) {
    for (let x = 0; x < 4; x++) {
      const plank = box(
        room,
        mat.wood,
        [-3.72 + x * 2.48, 0.049, -3.76 + z * 0.626],
        [2.465, 0.042, 0.616],
        0.006,
      );
      if ((x + z) % 3 === 0) {
        plank.material = mat.wood.clone();
        plank.material.color.set("#f1e9dc");
      }
    }
  }
  const backShape = new THREE.Shape();
  backShape.moveTo(-5, 0);
  backShape.lineTo(5, 0);
  const wallHeight = 3.7;
  backShape.lineTo(5, wallHeight);
  backShape.lineTo(-5, wallHeight);
  backShape.closePath();
  const hole = archShape(1.86, 2.08, 1.27);
  hole.curves.forEach((c) => {
    if (c.v1) c.v1.x += 2.65;
    if (c.v2) c.v2.x += 2.65;
    if (c.v0) c.v0.x += 2.65;
    if (c.v3) c.v3.x += 2.65;
    if (c.aX !== undefined) c.aX += 2.65;
  });
  backShape.holes.push(hole);
  mesh(
    new THREE.ExtrudeGeometry(backShape, {
      depth: 0.14,
      bevelEnabled: false,
      curveSegments: 32,
    }),
    mat.wall,
    room,
    [0, 0, -4.06],
  );
  box(room, mat.wallGreen, [-5, wallHeight / 2, 0], [0.15, wallHeight, 8.13], 0.035);
  box(room, mat.trim, [-5, wallHeight + 0.03, 0], [0.21, 0.11, 8.2], 0.025);
  box(room, mat.trim, [0, wallHeight + 0.03, -4], [10.17, 0.11, 0.24], 0.025);
  box(room, mat.trim, [0, 0.18, -3.87], [10, 0.24, 0.09], 0.012);
  box(room, mat.trim, [-4.88, 0.18, 0], [0.09, 0.24, 8.0], 0.012);
  // Soft blush wainscot and tiny wallpaper sprigs.
  box(room, mat.pinkPaint, [0, 0.52, -3.88], [9.9, 0.71, 0.035], 0.008);
  box(room, mat.trim, [0, 0.92, -3.85], [10, 0.055, 0.1], 0.01);
  for (let i = 0; i < 25; i++)
    box(
      room,
      mat.trim,
      [-4.8 + i * 0.4, 0.51, -3.85],
      [0.018, 0.72, 0.022],
      0.003,
    );
  for (let x = -4.6; x < 4.9; x += 0.55)
    for (let y = 1.28; y < 3.6; y += 0.47) {
      if (x > 1.6 && x < 3.7) continue;
      const sprig = new THREE.Group();
      sprig.position.set(x, y, -3.895);
      room.add(sprig);
      rod(sprig, mat.sage, [0, 0, 0], [0.02, 0.074, 0], 0.005);
      ellipsoid(sprig, mat.sage, [-0.012, 0.04, 0], [0.022, 0.009, 0.004]);
      ellipsoid(sprig, mat.sage, [0.032, 0.058, 0], [0.022, 0.009, 0.004]);
    }
  const windowGroup = new THREE.Group();
  windowGroup.position.set(2.65, 1.27, -3.89);
  room.add(windowGroup);
  const skyMat = new THREE.MeshBasicMaterial({ color: "#d3e2df" });
  arch(windowGroup, skyMat, [0, 0, -0.11], 1.86, 2.08, 0.01);
  const landscape = canvasTexture((ctx, s) => {
    ctx.fillStyle = "#dce8df";
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#f7edc6";
    ctx.beginPath();
    ctx.arc(370, 140, 45, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = ["#c0d2bc", "#adC5ab", "#9ab89c", "#8ba68a"][i];
      ctx.beginPath();
      ctx.ellipse(i * 170 - 10, 510, 220, 180 + i * 35, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  planeArt(windowGroup, landscape, [0, 0.78, -0.075], 1.8, 1.55);
  const frame = [];
  frame.push([-0.99, 0, 0], [-0.99, 1.12, 0]);
  for (let i = 0; i <= 32; i++) {
    const a = Math.PI - (i / 32) * Math.PI;
    frame.push([Math.cos(a) * 0.99, 1.12 + Math.sin(a) * 0.99, 0]);
  }
  frame.push([0.99, 0, 0]);
  tube(windowGroup, mat.trim, frame, 0.065);
  box(windowGroup, mat.trim, [0, 0.97, 0.015], [0.045, 1.93, 0.07], 0.01);
  box(windowGroup, mat.trim, [0, 0.99, 0.016], [1.85, 0.045, 0.07], 0.01);
  box(windowGroup, mat.wood, [0, -0.015, 0.13], [2.23, 0.11, 0.45], 0.035);
  for (const side of [-1, 1]) {
    const curtainMat = mat.white;
    for (let i = 0; i < 4; i++)
      ellipsoid(
        windowGroup,
        curtainMat,
        [side * (0.77 + i * 0.065), 0.92, 0.055],
        [0.073, 0.89, 0.052],
      );
    tube(
      windowGroup,
      mat.scarf,
      [
        [side * 0.73, 0.6, 0.1],
        [side * 0.86, 0.55, 0.14],
        [side * 1.0, 0.6, 0.08],
      ],
      0.024,
    );
  }
  plant(windowGroup, [-0.67, 0.055, 0.13], 0.44);
  const door = new THREE.Group();
  door.position.set(-2.05, 0, -3.84);
  room.add(door);
  arch(door, mat.trim, [0, 0, 0], 1.4, 2.87, 0.08);
  arch(door, mat.bluePaint, [0, 0.035, 0.09], 1.18, 2.65, 0.025);
  const doorFrame = arch(
    door,
    mat.wallGreen,
    [0, 0.24, 0.13],
    0.91,
    2.16,
    0.01,
  );
  arch(door, mat.bluePaint, [0, 0.27, 0.15], 0.84, 2.06, 0.01);
  ellipsoid(door, mat.brass, [0.38, 1.1, 0.2], [0.05, 0.05, 0.04]);
  const wreath = new THREE.Group();
  wreath.position.set(0, 2.0, 0.24);
  door.add(wreath);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ellipsoid(
      wreath,
      i % 3 === 0 ? mat.white : mat.sage,
      [Math.cos(a) * 0.15, Math.sin(a) * 0.17, 0],
      [0.048, 0.055, 0.026],
    ).rotation.z = -a;
  }
  tube(
    wreath,
    mat.rose,
    [
      [0, -0.14, 0.02],
      [-0.1, -0.22, 0.02],
      [0, -0.19, 0.025],
      [0.1, -0.22, 0.02],
      [0, -0.14, 0.02],
    ],
    0.014,
  );

  // Left-wall mini gallery faces inward.
  const gallery = new THREE.Group();
  gallery.position.set(-4.86, 1.96, 0.73);
  gallery.rotation.y = Math.PI / 2;
  room.add(gallery);
  box(gallery, mat.wood, [0, 0, 0], [1.27, 1.43, 0.09], 0.04);
  planeArt(gallery, artTexture("picture"), [0, 0, 0.048], 1.1, 1.27);
  box(gallery, mat.wood, [1.78, -0.43, 0.17], [1.18, 0.1, 0.44], 0.03);
  plant(gallery, [1.78, -0.37, 0.16], 0.64);
  tube(
    room,
    mat.scarf,
    [
      [-4.8, 2.89, -3.82],
      [-2.6, 3.18, -3.77],
      [0, 3.27, -3.77],
      [1.5, 3.29, -3.77],
    ],
    0.009,
  );
  const bulbs = [];
  for (let i = 0; i < 9; i++) {
    const x = -4.65 + i * 0.71,
      y = 3.2 - 0.3 * Math.pow((x + 0.8) / 4, 2);
    const material = new THREE.MeshStandardMaterial({
      color: "#ffe4ac",
      emissive: "#ffe4ac",
      emissiveIntensity: 0.5,
      roughness: 0.4,
    });
    bulbs.push(material);
    ellipsoid(room, material, [x, y - 0.1, -3.73], [0.036, 0.049, 0.034]);
    rod(room, mat.scarf, [x, y, -3.77], [x, y - 0.075, -3.73], 0.009);
  }
  const rugMat = new THREE.MeshStandardMaterial({
    map: artTexture("rug"),
    roughness: 1,
    bumpMap: mat.rose.bumpMap,
    bumpScale: 0.034,
  });
  box(room, rugMat, [0.08, 0.095, 1.1], [3.83, 0.055, 3.42], 0.08);
  for (const side of [-1, 1])
    for (let i = 0; i < 35; i++)
      rod(
        room,
        mat.cream,
        [-1.74 + i * 0.106, 0.09, 1.1 + side * 1.68],
        [-1.74 + i * 0.106, 0.09, 1.1 + side * 1.8],
        0.009,
      );
  // Front edge label is part of the handcrafted miniature, not an overlay.
  const label = canvasTexture((ctx, s) => {
    ctx.fillStyle = "#e7ebd9";
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#7d9273";
    ctx.textAlign = "center";
    ctx.font = "51px Georgia";
    ctx.fillText("a little life", s / 2, 280);
  });
  box(room, mat.trim, [0, -0.23, 4.24], [1.6, 0.24, 0.025], 0.012);
  planeArt(room, label, [0, -0.23, 4.258], 1.43, 0.22);
  const selection = new THREE.Mesh(
    new THREE.RingGeometry(0.49, 0.54, 64),
    new THREE.MeshBasicMaterial({
      color: "#f6f3ce",
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  selection.rotation.x = -Math.PI / 2;
  selection.position.y = 0.135;
  selection.visible = false;
  scene.add(selection);
  const eveningLight = new THREE.PointLight("#ffd19b", 0, 9, 1.5);
  eveningLight.position.set(-1.3, 2.8, -2.4);
  scene.add(eveningLight);
  let environment = { hour: 10, background: "#e5ece5" };
  function setEnvironment(hour, background) {
    hour = THREE.MathUtils.clamp(Number(hour) || 0, 0, 24);
    background = /^#[0-9a-f]{6}$/i.test(background) ? background : "#e5ece5";
    environment = { hour, background };
    const elevation = Math.sin(((hour - 6) / 24) * Math.PI * 2);
    const daylight = THREE.MathUtils.smoothstep(elevation, -0.12, 0.4);
    const dusk = Math.max(0, 1 - Math.abs(elevation) * 5) * daylight;
    scene.background.set(background);
    stage.material.color.set(background);
    ambient.intensity = THREE.MathUtils.lerp(0.65, 1.9, daylight);
    ambient.color.set("#b4c5f3").lerp(new THREE.Color("#fff8ed"), daylight);
    key.intensity = THREE.MathUtils.lerp(0.35, 2, daylight);
    key.color.set("#becdfb").lerp(new THREE.Color("#fff0db"), daylight)
      .lerp(new THREE.Color("#ffc38d"), dusk * 0.65);
    key.position.set(Math.cos((hour / 24) * Math.PI * 2) * 6, 5 + Math.max(0, elevation) * 5, 8);
    fill.intensity = THREE.MathUtils.lerp(0.35, 1, daylight);
    bulbs.forEach((material) => material.emissiveIntensity = 0.5 + (1 - daylight) * 1.3);
    scene.traverse((object) => {
      if (object.isPointLight) object.intensity = 1.8 + (1 - daylight) * 3;
    });
    eveningLight.intensity = (1 - daylight) * 5;
    const ctx = landscape.image.getContext("2d"), s = landscape.image.width;
    const sky = new THREE.Color("#263956").lerp(new THREE.Color("#dce8df"), daylight);
    skyMat.color.copy(sky);
    ctx.fillStyle = `#${sky.getHexString()}`;
    ctx.fillRect(0, 0, s, s);
    if (daylight < 0.5) {
      ctx.fillStyle = "#f8efcf";
      for (let i = 0; i < 19; i++) {
        ctx.beginPath();
        ctx.arc(25 + (i * 83) % 460, 24 + (i * 53) % 250, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = "#f7edc6";
    ctx.beginPath();
    ctx.arc(370, 140, 40, 0, Math.PI * 2);
    ctx.fill();
    if (daylight < 0.5) {
      ctx.fillStyle = `#${sky.getHexString()}`;
      ctx.beginPath();
      ctx.arc(385, 126, 36, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 4; i++) {
      const color = new THREE.Color(["#405267", "#35465b", "#293b50", "#233447"][i])
        .lerp(new THREE.Color(["#c0d2bc", "#adc5ab", "#9ab89c", "#8ba68a"][i]), daylight);
      ctx.fillStyle = `#${color.getHexString()}`;
      ctx.beginPath();
      ctx.ellipse(i * 170 - 10, 510, 220, 180 + i * 35, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    landscape.needsUpdate = true;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  reset();
  return {
    scene,
    camera,
    renderer,
    controls,
    selection,
    reset,
    resize,
    setEnvironment,
    get environment() { return { ...environment, wallHeights: [wallHeight, wallHeight] }; },
    render() {
      controls.update();
      renderer.render(scene, camera);
    },
    dispose() {
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          for (const m of Array.isArray(o.material)
            ? o.material
            : [o.material]) {
            for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
            m.dispose();
          }
        }
      });
      renderer.dispose();
    },
  };
}
