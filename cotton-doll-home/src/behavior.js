import * as THREE from "three";
import { Navigator } from "./navigation.js";
import { Activities } from "./activities.js";
import { furnitureConfig } from "./config.js";

const shortestAngle = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
export class Behavior {
  constructor(character, furniture, scene, onChange = () => {}) {
    this.c = character;
    this.furniture = furniture;
    this.onChange = onChange;
    this.navigator = new Navigator(furnitureConfig);
    this.activities = new Activities(character, furniture, scene);
    this.paused = false;
    this.autonomous = true;
    this.phase = "idle";
    this.timer = 0;
    this.time = 0;
    this.current = null;
    this.pending = null;
    this.path = [];
    this.walkDistance = 0;
    this.visits = [];
    this.history = [];
    this.error = null;
    this.c.root.position.set(0, 0.085, 0.05);
    this.wait = 1.2;
    this.lastId = null;
    this.speed = 0.68;
    this.manual = false;
  }
  notify(text) {
    this.status = text;
    this.onChange({
      text,
      id: this.current?.id,
      phase: this.phase,
      paused: this.paused,
    });
  }
  setPaused(value) {
    this.paused = value;
    this.notify(this.status || "瑣儿在安静待着");
  }
  setAutonomous(value) {
    this.autonomous = value;
    if (value && this.phase === "idle") this.wait = 0.4;
  }
  request(id) {
    if (!this.furniture.items.has(id)) return;
    this.pending = id;
    this.manual = true;
    if (!this.paused) this.interrupt();
  }
  interrupt() {
    if (!this.pending) return;
    if (
      this.phase === "idle" ||
      this.phase === "walk" ||
      this.phase === "turn"
    ) {
      this.c.resetPose();
      this.start(this.pending);
    } else if (this.phase === "active") {
      this.phase = "exit";
      this.timer = 0;
      this.activities.beginExit();
      this.notify("瑣儿先把手里的东西放好");
    }
    // Entering finishes the safe pickup before a pending instruction can exit.
  }
  start(id) {
    this.pending = null;
    this.current = this.furniture.items.get(id);
    this.lastId = id;
    const start = [this.c.root.position.x, this.c.root.position.z];
    this.path = this.navigator.route(start, this.current.point);
    if (!this.path.length) {
      this.error = `No route to ${id}`;
      this.phase = "idle";
      this.wait = 2;
      this.notify("瑣儿在想一想怎么走");
      return;
    }
    this.error = null;
    this.phase = "walk";
    this.timer = 0;
    this.notify(this.current.walking);
  }
  choose() {
    if (!this.lastId) return "blocks";
    const ids = furnitureConfig
      .map((f) => f.id)
      .filter((id) => id !== this.lastId);
    const unvisited = ids.filter((id) => !this.visits.includes(id));
    const pool = unvisited.length ? unvisited : ids;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  update(dt) {
    if (this.paused) return;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.timer += dt;
    if (this.pending && this.phase !== "exit" && this.phase !== "enter")
      this.interrupt();
    switch (this.phase) {
      case "idle":
        this.c.resetPose();
        this.c.idle(this.time);
        this.c.head.rotation.z = Math.sin(this.time * 0.7) * 0.035;
        if (this.pending) this.start(this.pending);
        else if (this.autonomous && this.timer > this.wait)
          this.start(this.choose());
        break;
      case "walk":
        this.walk(dt);
        break;
      case "turn": {
        const a = Math.atan2(
          this.current.look[0] - this.c.root.position.x,
          this.current.look[1] - this.c.root.position.z,
        );
        const d = shortestAngle(this.c.root.rotation.y, a);
        this.c.root.rotation.y += THREE.MathUtils.clamp(d, -dt * 2.8, dt * 2.8);
        this.c.resetPose();
        this.c.idle(this.time);
        if (Math.abs(d) < 0.025) {
          this.c.root.rotation.y = a;
          this.activities.enter(this.current);
          this.phase = "enter";
          this.timer = 0;
        }
        break;
      }
      case "enter":
        this.activities.updateEnter(Math.min(1, this.timer / 1.9), this.time);
        if (this.timer >= 1.9) {
          this.phase = "active";
          this.timer = 0;
          this.visits.push(this.current.id);
          this.notify(this.current.status);
          this.history.push({
            id: this.current.id,
            event: "enter",
            time: this.time,
          });
        }
        break;
      case "active":
        this.activities.update(dt, this.time);
        if (this.timer >= this.current.duration) {
          this.activities.beginExit();
          this.phase = "exit";
          this.timer = 0;
          this.notify("瑣儿把小东西放回原处");
        }
        break;
      case "exit":
        this.activities.updateExit(Math.min(1, this.timer / 2), this.time);
        if (this.timer >= 2) {
          this.history.push({
            id: this.current.id,
            event: "exit",
            time: this.time,
          });
          this.phase = "idle";
          this.timer = 0;
          this.wait = 1.5 + Math.random() * 1.8;
          this.current = null;
          this.notify("瑣儿在想下一件小事");
          if (this.pending) this.start(this.pending);
        }
        break;
    }
  }
  walk(dt) {
    const c = this.c;
    if (!this.path.length) {
      this.phase = "turn";
      this.timer = 0;
      c.resetPose();
      return;
    }
    const [x, z] = this.path[0],
      dx = x - c.root.position.x,
      dz = z - c.root.position.z,
      dist = Math.hypot(dx, dz);
    if (dist < 0.006) {
      this.path.shift();
      return;
    }
    const angle = Math.atan2(dx, dz),
      delta = shortestAngle(c.root.rotation.y, angle);
    c.root.rotation.y += THREE.MathUtils.clamp(delta, -dt * 3.2, dt * 3.2);
    const travel = Math.min(
      dist,
      dt * this.speed * Math.max(0.08, 1 - Math.abs(delta) / 1.7),
    );
    c.root.position.x += (dx / dist) * travel;
    c.root.position.z += (dz / dist) * travel;
    this.walkDistance += travel;
    const step = (this.walkDistance / 0.27) * Math.PI * 2;
    c.resetPose();
    c.idle(this.time);
    c.body.position.y = Math.abs(Math.sin(step)) * 0.02;
    c.body.rotation.z = Math.sin(step) * 0.055;
    c.legs[0].rotation.x = Math.sin(step) * 0.35;
    c.legs[1].rotation.x = -Math.sin(step) * 0.35;
    c.arms[0].rotation.x = -Math.sin(step) * 0.2;
    c.arms[1].rotation.x = Math.sin(step) * 0.2;
    c.head.rotation.z = -Math.sin(step) * 0.022;
    c.bag.rotation.z = -0.1 + Math.sin(step - 0.35) * 0.04;
    c.scarf.rotation.z = Math.sin(step - 0.4) * 0.026;
  }
  snapshot() {
    return {
      phase: this.phase,
      current: this.current?.id || null,
      pending: this.pending,
      paused: this.paused,
      autonomous: this.autonomous,
      time: this.time,
      timer: this.timer,
      position: this.c.root.position.toArray(),
      head: this.c.head.rotation.toArray().slice(0, 3),
      body: this.c.body.position.toArray(),
      breathing: this.c.torso.scale.y,
      arms: this.c.arms.map((a) => a.rotation.toArray().slice(0, 3)),
      path: this.path,
      status: this.status,
      visits: [...this.visits],
      history: [...this.history],
      prop: this.activities.prop?.object.name || null,
      error: this.error,
      props: [...this.furniture.props].map(([id, p]) => ({
        id,
        atHome:
          p.object.parent === p.homeParent &&
          p.object.position.distanceTo(p.homePosition) < 0.001,
        parent: p.object.parent?.name || p.object.parent?.type,
        position: p.object.getWorldPosition(new THREE.Vector3()).toArray(),
      })),
    };
  }
}
