import "./style.css";
import * as THREE from "three";
import { createWorld } from "./scene.js";
import { createCharacter } from "./character.js";
import { createFurniture } from "./furniture.js";
import { Behavior } from "./behavior.js";
import { createInteraction } from "./interaction.js";
import { batchStatic } from "./batching.js";
import { readCharacterPreference } from "./character-design.js";

const canvas = document.getElementById("world");
let cleanup = () => {};
try {
  const world = createWorld(canvas);
  const furniture = createFurniture(world.scene);
  batchStatic(world, furniture);
  const character = createCharacter(readCharacterPreference());
  world.scene.add(character.root);
  let ui;
  const behavior = new Behavior(character, furniture, world.scene, (state) =>
    ui?.setStatus(state),
  );
  ui = createInteraction(world, furniture, behavior);
  let last = performance.now(),
    disposed = false;
  function tick(now) {
    if (disposed) return;
    const dt = THREE.MathUtils.clamp((now - last) / 1000, 0, 0.05);
    last = now;
    behavior.update(dt);
    world.render();
  }
  world.renderer.setAnimationLoop(tick);
  const loading = document.getElementById("loading");
  loading.classList.add("done");
  const loadTimer = setTimeout(() => loading.remove(), 600);
  const visibility = () => {
    last = performance.now();
  };
  document.addEventListener("visibilitychange", visibility);
  cleanup = () => {
    disposed = true;
    clearTimeout(loadTimer);
    world.renderer.setAnimationLoop(null);
    ui.dispose();
    character.dispose();
    world.dispose();
    document.removeEventListener("visibilitychange", visibility);
    delete window.__littleLife;
  };
  // Deterministic inspection is available only in a local QA URL, never production.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has("qa")) {
    window.__littleLife = {
      snapshot: () => ({
        ...behavior.snapshot(),
        selected: ui.selected,
        camera: world.camera.position.toArray(),
        zoom: world.camera.zoom,
        drawCalls: world.renderer.info.render.calls,
        variant: character.variant,
        outfit: character.outfit,
        environment: world.environment,
      }),
      request: (id) => behavior.request(id),
      advance(seconds) {
        for (let i = 0; i < Math.ceil(seconds * 60); i++)
          behavior.update(1 / 60);
        world.render();
        return behavior.snapshot();
      },
      project(id) {
        const f = furniture.items.get(id);
        const point = new THREE.Vector3(...f.position);
        point.y = f.id === "sleep" ? 0.65 : f.id === "blocks" ? 0.18 : 0.7;
        point.project(world.camera);
        return {
          x: ((point.x + 1) * innerWidth) / 2,
          y: ((1 - point.y) * innerHeight) / 2,
        };
      },
      roomBounds() {
        const points = [
          [-5.16, -0.45, -4.25],
          [5.16, -0.45, -4.25],
          [-5.16, -0.45, 4.25],
          [5.16, -0.45, 4.25],
          [-5.16, 3.8, -4.1],
          [5.16, 3.8, -4.1],
          [-5.16, 3.8, 4.15],
        ].map((p) => new THREE.Vector3(...p).project(world.camera));
        return {
          minX: Math.min(...points.map((p) => p.x)),
          maxX: Math.max(...points.map((p) => p.x)),
          minY: Math.min(...points.map((p) => p.y)),
          maxY: Math.max(...points.map((p) => p.y)),
        };
      },
      portrait() {
        world.controls.target
          .copy(character.root.position)
          .add(new THREE.Vector3(0, 0.82, 0));
        world.camera.position
          .copy(character.root.position)
          .add(new THREE.Vector3(0, 1.9, 7));
        world.camera.zoom = 2.25;
        world.camera.updateProjectionMatrix();
        world.controls.update();
        world.render();
      },
      setAutonomous: (v) => {
        behavior.setAutonomous(v);
        document.getElementById("autonomy").checked = v;
      },
      paused: (v) => {
        if (behavior.paused !== v) document.getElementById("pause").click();
      },
    };
  }
} catch (error) {
  cleanup();
  document.getElementById("error").hidden = false;
  document.getElementById("loading")?.remove();
  console.error(error);
}
const onPageHide = (event) => {
  if (!event.persisted) cleanup();
};
window.addEventListener("pagehide", onPageHide);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    window.removeEventListener("pagehide", onPageHide);
    cleanup();
  });
