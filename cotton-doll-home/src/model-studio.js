import "./model-studio.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createIcons, ArrowLeft, ArrowRight } from "lucide";
import { createCharacter } from "./character.js";
import {
  characterDesigns,
  readCharacterPreference,
} from "./character-design.js";

const $ = (id) => document.getElementById(id);
let cleanup = () => {};
try {
  const renderer = new THREE.WebGLRenderer({
    canvas: $("studio-canvas"),
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#edf0e8");
  const camera = new THREE.OrthographicCamera(-3.5, 3.5, 2.5, -2.5, 0.1, 40);
  camera.position.set(0, 1.95, 8);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.81, 0);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minPolarAngle = 0.7;
  controls.maxPolarAngle = 1.66;
  controls.minZoom = 0.75;
  controls.maxZoom = 1.9;
  controls.rotateSpeed = 0.6;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  scene.add(new THREE.HemisphereLight("#fff7e8", "#b9c7b6", 2.0));
  const key = new THREE.DirectionalLight("#fff0de", 2.6);
  key.position.set(-3.5, 7, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, {
    left: -5,
    right: 5,
    top: 4,
    bottom: -4,
    near: 0.5,
    far: 20,
  });
  key.shadow.normalBias = 0.018;
  key.shadow.bias = -0.0002;
  key.shadow.radius = 4;
  scene.add(key);
  const fill = new THREE.DirectionalLight("#e8f0fc", 1.1);
  fill.position.set(4, 3, 2);
  scene.add(fill);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshBasicMaterial({ color: "#edf0e8", toneMapped: false }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.023;
  scene.add(floor);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.ShadowMaterial({ color: "#7a7767", opacity: 0.13 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.022;
  shadow.receiveShadow = true;
  scene.add(shadow);

  const preference = readCharacterPreference();
  let selected = preference.variant,
    dressed = false,
    mobile = false,
    angle = "front";
  const characters = characterDesigns.map((design) => {
    const character = createCharacter({ variant: design.id, outfit: false });
    scene.add(character.root);
    return character;
  });
  const labels = [];
  characterDesigns.forEach((design) => {
    const button = document.createElement("button");
    button.type = "button";
    button.role = "radio";
    button.dataset.design = design.id;
    button.innerHTML = `<span class="number">${design.number}</span>${design.name}`;
    button.setAttribute("aria-checked", String(design.id === selected));
    document.querySelector(".design-picker").append(button);
    const label = document.createElement("div");
    label.className = "model-label";
    label.innerHTML = `<span class="number">${design.number}</span>${design.name}`;
    $("model-labels").append(label);
    labels.push(label);
  });
  const listeners = [];
  function listen(el, type, fn) {
    el.addEventListener(type, fn);
    listeners.push(() => el.removeEventListener(type, fn));
  }
  function layout() {
    const width = innerWidth,
      height = innerHeight,
      aspect = width / height;
    mobile = width <= 700;
    const span = mobile
      ? Math.max(3.45, 1.9 / aspect)
      : Math.max(3.25, 6.15 / aspect);
    camera.left = (-span * aspect) / 2;
    camera.right = (span * aspect) / 2;
    camera.top = span / 2;
    camera.bottom = -span / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    characters.forEach((character, i) => {
      character.root.visible = !mobile || character.variant === selected;
      character.root.position.x = mobile ? 0 : (i - 1) * 1.91;
    });
  }
  function pick(id) {
    selected = id;
    document
      .querySelectorAll("[data-design]")
      .forEach((button) =>
        button.setAttribute(
          "aria-checked",
          String(button.dataset.design === id),
        ),
      );
    layout();
  }
  function setOutfit(value) {
    dressed = value;
    characters.forEach((character) => {
      character.setOutfit(value);
      character.resetPose();
    });
    document
      .querySelectorAll("[data-outfit]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.outfit === String(value)),
        ),
      );
  }
  function setAngle(value) {
    angle = value;
    // Rotate the models together so their comparison spacing stays readable at every preset.
    characters.forEach(
      (character) =>
        (character.root.rotation.y =
          value === "side" ? -Math.PI / 2 : value === "back" ? Math.PI : 0),
    );
    camera.position.set(0, 1.95, 8);
    controls.target.set(0, 0.81, 0);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    controls.update();
    document
      .querySelectorAll("[data-angle]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.angle === value),
        ),
      );
  }
  document
    .querySelectorAll("[data-design]")
    .forEach((button) =>
      listen(button, "click", () => pick(button.dataset.design)),
    );
  document
    .querySelectorAll("[data-outfit]")
    .forEach((button) =>
      listen(button, "click", () =>
        setOutfit(button.dataset.outfit === "true"),
      ),
    );
  document
    .querySelectorAll("[data-angle]")
    .forEach((button) =>
      listen(button, "click", () => setAngle(button.dataset.angle)),
    );
  listen($("apply-design"), "click", () => {
    try {
      localStorage.setItem(
        "suoer.character.v2",
        JSON.stringify({ variant: selected, outfit: dressed }),
      );
      location.href = "/";
    } catch {
      $("save-status").textContent =
        "浏览器没有保存成功，请允许此站点使用本地存储。";
    }
  });
  listen(window, "resize", layout);
  createIcons({ icons: { ArrowLeft, ArrowRight } });
  layout();
  setAngle("front");
  let time = 0,
    last = performance.now();
  renderer.setAnimationLoop((now) => {
    time += Math.max(0, Math.min((now - last) / 1000, 0.05));
    last = now;
    characters.forEach((character, i) => {
      character.idle(time);
      character.head.rotation.z = Math.sin(time * 0.6) * 0.012;
      character.root.updateWorldMatrix(true, false);
      const point = character.root
        .localToWorld(new THREE.Vector3(0, -0.105, 0))
        .project(camera);
      labels[i].hidden = !character.root.visible;
      labels[i].style.left = `${((point.x + 1) * innerWidth) / 2}px`;
      labels[i].style.top = `${((1 - point.y) * innerHeight) / 2 + 16}px`;
      labels[i].classList.toggle("selected", character.variant === selected);
    });
    controls.update();
    renderer.render(scene, camera);
  });
  cleanup = () => {
    renderer.setAnimationLoop(null);
    listeners.forEach((fn) => fn());
    controls.dispose();
    characters.forEach((character) => character.dispose());
    floor.geometry.dispose();
    floor.material.dispose();
    shadow.geometry.dispose();
    shadow.material.dispose();
    renderer.dispose();
    delete window.__modelStudio;
  };
  if (import.meta.env.DEV && new URLSearchParams(location.search).has("qa")) {
    window.__modelStudio = {
      snapshot: () => ({
        selected,
        dressed,
        angle,
        mobile,
        time,
        camera: camera.position.toArray(),
        characters: characters.map((character) => ({
          variant: character.variant,
          visible: character.root.visible,
          outfit: character.outfit,
          head: character.head.rotation.toArray().slice(0, 3),
          furMeshes: (() => {
            let count = 0;
            character.root.traverse((o) => {
              if (o.isInstancedMesh) count++;
            });
            return count;
          })(),
          bounds: new THREE.Box3()
            .setFromObject(character.root)
            .getSize(new THREE.Vector3())
            .toArray(),
        })),
      }),
    };
  }
} catch (error) {
  cleanup();
  $("studio-error").hidden = false;
  console.error(error);
}
if (import.meta.hot) import.meta.hot.dispose(() => cleanup());
