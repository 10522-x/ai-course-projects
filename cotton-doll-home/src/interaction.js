import * as THREE from "three";
import {
  createIcons,
  House,
  Pause,
  Play,
  Scan,
  Plus,
  Minus,
  CookingPot,
  Cookie,
  BookOpen,
  Moon,
  Brush,
  Palette,
  Blocks,
  Cloud,
  UserRound,
  SunMoon,
} from "lucide";
import { furnitureConfig } from "./config.js";

const icons = {
  House,
  Pause,
  Play,
  Scan,
  Plus,
  Minus,
  CookingPot,
  Cookie,
  BookOpen,
  Moon,
  Brush,
  Palette,
  Blocks,
  Cloud,
  UserRound,
  SunMoon,
};
const iconName = (id) => (id === "brush-cleaning" ? "brush" : id);
export function createInteraction(world, furniture, behavior) {
  const canvas = world.renderer.domElement,
    raycaster = new THREE.Raycaster(),
    mouse = new THREE.Vector2();
  const $ = (id) => document.getElementById(id),
    listeners = [];
  let selected = null,
    down = null,
    hover = null,
    pointers = new Set(),
    dragged = false;
  const listen = (el, type, fn, options) => {
    el.addEventListener(type, fn, options);
    listeners.push(() => el.removeEventListener(type, fn, options));
  };
  const refresh = () => createIcons({ icons, attrs: { "stroke-width": 1.65 } });
  for (const f of furnitureConfig) {
    const button = document.createElement("button");
    button.className = "activity-button";
    button.dataset.id = f.id;
    button.dataset.tooltip = f.action;
    button.setAttribute("aria-label", f.action);
    button.innerHTML = `<i data-lucide="${iconName(f.icon)}"></i>`;
    $("activities").append(button);
    listen(button, "click", () => select(f.id));
  }
  refresh();
  function select(id) {
    selected = id;
    const f = furniture.items.get(id);
    behavior.request(id);
    $("furniture-label").hidden = true;
    world.selection.position.set(f.point[0], 0.143, f.point[1]);
    world.selection.visible = true;
    document
      .querySelectorAll(".activity-button")
      .forEach((el) => el.classList.toggle("selected", el.dataset.id === id));
  }
  function deselect() {
    selected = null;
    world.selection.visible = false;
    document
      .querySelectorAll(".activity-button")
      .forEach((el) => el.classList.remove("selected"));
  }
  let preference = {};
  try {
    preference = JSON.parse(localStorage.getItem("suoer.environment.v1") || "{}") || {};
  } catch {}
  $("background-color").value = /^#[0-9a-f]{6}$/i.test(preference.background)
    ? preference.background : "#e5ece5";
  $("time-of-day").value = Number.isFinite(preference.hour) ? preference.hour : 10;
  function updateEnvironment(persist = true) {
    const hour = Number($("time-of-day").value);
    const minutes = Math.round(hour * 60) % 1440;
    const text = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    $("time-display").textContent = text;
    $("time-of-day").setAttribute("aria-valuetext", text);
    const background = $("background-color").value;
    document.querySelector(".background-control").style.setProperty("--swatch", background);
    const color = new THREE.Color(background);
    const dark = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722 < 0.24;
    document.documentElement.style.setProperty("--scene-ink", dark ? "#f4f7ed" : "#435349");
    document.documentElement.style.setProperty("--scene-text-shadow", dark ? "0 1px 3px #0008" : "0 1px 3px #fff8");
    world.setEnvironment(hour, background);
    if (persist) {
      try {
        localStorage.setItem("suoer.environment.v1", JSON.stringify({
          hour, background: $("background-color").value,
        }));
      } catch {}
    }
  }
  listen($("background-color"), "input", () => updateEnvironment());
  listen($("time-of-day"), "input", () => updateEnvironment());
  updateEnvironment(false);
  let tooltipTarget = null;
  function positionLabel(label, x, y, below = false) {
    label.hidden = false;
    const rect = label.getBoundingClientRect();
    label.style.left = `${Math.max(8, Math.min(innerWidth - rect.width - 8, x - rect.width / 2))}px`;
    label.style.top = `${Math.max(8, Math.min(innerHeight - rect.height - 8,
      below ? y + 12 : y - rect.height - 12))}px`;
  }
  function hideTool() {
    tooltipTarget?.removeAttribute("aria-describedby");
    tooltipTarget = null;
    $("tool-label").hidden = true;
  }
  function showTool(target) {
    hideTool();
    if (!target) return;
    tooltipTarget = target;
    target.setAttribute("aria-describedby", "tool-label");
    $("tool-label").textContent = target.dataset.tooltip;
    const rect = target.getBoundingClientRect();
    positionLabel($("tool-label"), rect.left + rect.width / 2,
      rect.top < 240 ? rect.bottom : rect.top, rect.top < 240);
  }
  listen(document, "pointerover", (event) => {
    if (event.pointerType !== "touch") showTool(event.target.closest("[data-tooltip]"));
  });
  listen(document, "pointerout", (event) => {
    if (tooltipTarget && !tooltipTarget.contains(event.relatedTarget)) hideTool();
  });
  listen(document, "focusin", (event) => showTool(event.target.closest("[data-tooltip]")));
  listen(document, "focusout", hideTool);
  listen(window, "blur", () => { hideTool(); $("furniture-label").hidden = true; });
  listen(window, "resize", () => { hideTool(); $("furniture-label").hidden = true; });
  listen($("autonomy"), "change", (e) =>
    behavior.setAutonomous(e.target.checked),
  );
  listen($("pause"), "click", () => {
    behavior.setPaused(!behavior.paused);
    const text = behavior.paused ? "继续" : "暂停";
    $("pause").setAttribute("aria-label", text);
    $("pause").dataset.tooltip = text;
    $("pause").setAttribute("aria-pressed", String(behavior.paused));
    $("pause").innerHTML =
      `<i data-lucide="${behavior.paused ? "play" : "pause"}"></i>`;
    $("paused-badge").hidden = !behavior.paused;
    refresh();
  });
  listen($("reset"), "click", () => world.reset());
  listen($("character-design"), "click", () => {
    location.href = "/model-studio.html";
  });
  function zoom(factor) {
    world.camera.zoom = THREE.MathUtils.clamp(
      world.camera.zoom * factor,
      world.controls.minZoom,
      world.controls.maxZoom,
    );
    world.camera.updateProjectionMatrix();
  }
  listen($("zoom-in"), "click", () => zoom(1.15));
  listen($("zoom-out"), "click", () => zoom(1 / 1.15));
  function hit(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(mouse, world.camera);
    const hits = raycaster.intersectObjects(furniture.pickables, false);
    return hits.length ? hits[0].object.userData.furnitureId : null;
  }
  listen(canvas, "pointerdown", (event) => {
    $("furniture-label").hidden = true;
    pointers.add(event.pointerId);
    if (pointers.size > 1) dragged = true;
    else {
      down = { x: event.clientX, y: event.clientY, time: performance.now() };
      dragged = false;
    }
  });
  listen(canvas, "pointermove", (event) => {
    if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 7)
      dragged = true;
    if (event.pointerType === "touch" || pointers.size) return;
    hover = hit(event);
    canvas.style.cursor = hover ? "pointer" : "grab";
    $("furniture-label").hidden = !hover;
    if (hover) {
      $("furniture-label").textContent = furniture.items.get(hover).name;
      positionLabel($("furniture-label"), event.clientX, event.clientY);
    }
  });
  listen(canvas, "pointerup", (event) => {
    pointers.delete(event.pointerId);
    if (
      down &&
      !dragged &&
      performance.now() - down.time < 650 &&
      pointers.size === 0
    ) {
      const id = hit(event);
      if (id) select(id);
      else deselect();
    }
    if (!pointers.size) down = null;
  });
  listen(canvas, "pointercancel", (event) => {
    pointers.delete(event.pointerId);
    down = null;
    dragged = true;
  });
  listen(canvas, "pointerleave", () => {
    $("furniture-label").hidden = true;
  });
  listen(window, "pointerup", (event) => {
    pointers.delete(event.pointerId);
    if (!pointers.size) down = null;
  });
  return {
    setStatus({ text, id }) {
      if (selected && id !== selected) deselect();
      $("status-text").textContent = text;
      document.querySelectorAll(".activity-button").forEach((el) => {
        el.classList.toggle("active", el.dataset.id === id);
        el.setAttribute(
          "aria-current",
          el.dataset.id === id ? "true" : "false",
        );
      });
    },
    select,
    deselect,
    get selected() {
      return selected;
    },
    dispose() {
      listeners.forEach((fn) => fn());
    },
  };
}
