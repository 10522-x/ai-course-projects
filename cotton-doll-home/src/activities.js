import * as THREE from "three";

const ease = (t) => {
  t = THREE.MathUtils.clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
const tempQuaternion = new THREE.Quaternion();
const specs = {
  cook: {
    prop: "spoon",
    hand: 1,
    offset: [-0.04, -0.02, 0.02],
    rotation: [0.65, 0, 0],
  },
  eat: {
    prop: "cookie",
    hand: 1,
    offset: [-0.08, 0, 0.045],
    rotation: [0, 0, 0],
  },
  read: {
    prop: "book",
    hand: 1,
    offset: [-0.16, -0.015, 0.045],
    rotation: [0.2, 0, 0],
  },
  sweep: { prop: "broom", hand: 1, offset: [0, 0, 0], rotation: [0, 0, 0.1] },
  draw: {
    prop: "crayon",
    hand: 1,
    offset: [0, -0.02, 0.035],
    rotation: [Math.PI / 2, 0, 0],
  },
  blocks: {
    prop: "block",
    hand: 1,
    offset: [0, -0.01, 0.04],
    rotation: [0, 0, 0],
  },
  idle: {
    prop: "cushion",
    hand: 1,
    offset: [-0.17, 0, 0.08],
    rotation: [0, 0, 0],
  },
  sleep: {},
};

export class Activities {
  constructor(character, furniture, scene) {
    this.c = character;
    this.furniture = furniture;
    this.scene = scene;
    this.prop = null;
    this.active = null;
    this.origin = new THREE.Vector3();
    this.originYaw = 0;
    this.exitPose = null;
    this.elapsed = 0;
    this.time = 0;
    this.lastBlockState = "held";
    this.transfers = 0;
    this.lastStroke = null;
    this.strokeClock = 0;
  }
  enter(item) {
    this.active = item;
    this.elapsed = 0;
    this.origin.copy(this.c.root.position);
    this.originYaw = this.c.root.rotation.y;
    this.spec = specs[item.id];
    this.prop = this.spec.prop
      ? this.furniture.props.get(this.spec.prop)
      : null;
    if (this.prop) {
      this.scene.updateMatrixWorld(true);
      this.scene.attach(this.prop.object);
      this.startPos = this.prop.object.position.clone();
      this.startQuat = this.prop.object.quaternion.clone();
      this.startScale = this.prop.object.scale.clone();
    }
    if (item.dust) item.dust.visible = true;
    this.lastBlockState = "held";
    this.lastStroke = null;
    this.strokeClock = 0;
  }
  handTransform() {
    const hand = this.c.hands[this.spec.hand];
    hand.updateWorldMatrix(true, false);
    const target = new THREE.Vector3(...this.spec.offset).applyMatrix4(
      hand.matrixWorld,
    );
    hand.getWorldQuaternion(tempQuaternion);
    const rotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(...this.spec.rotation),
    );
    if (["read", "eat", "idle"].includes(this.active.id)) {
      const left = this.c.hands[0].getWorldPosition(new THREE.Vector3());
      const right = this.c.hands[1].getWorldPosition(new THREE.Vector3());
      target.copy(left).add(right).multiplyScalar(0.5);
      const orientation = this.c.root.getWorldQuaternion(
        new THREE.Quaternion(),
      );
      target.add(
        new THREE.Vector3(
          0,
          this.active.id === "idle" ? -0.06 : 0.014,
          0.047,
        ).applyQuaternion(orientation),
      );
      return { position: target, quaternion: orientation.multiply(rotation) };
    }
    return {
      position: target,
      quaternion: tempQuaternion.clone().multiply(rotation),
    };
  }
  positionHeld(target) {
    const object = this.prop.object;
    object.parent.updateWorldMatrix(true, false);
    object.position.copy(object.parent.worldToLocal(target.position.clone()));
    const inverse = object.parent
      .getWorldQuaternion(new THREE.Quaternion())
      .invert();
    object.quaternion.copy(inverse.multiply(target.quaternion));
  }
  attach() {
    if (!this.prop) return;
    const hand = this.c.hands[this.spec.hand],
      object = this.prop.object;
    hand.add(object);
    object.position.set(...this.spec.offset);
    object.rotation.set(...this.spec.rotation);
    object.scale.copy(this.prop.homeScale);
    if (["read", "eat", "idle"].includes(this.active.id))
      this.positionHeld(this.handTransform());
    this.transfers++;
  }
  updateEnter(t, time) {
    this.time = time;
    const q = ease(this.prop ? (t - 0.48) / 0.52 : t);
    this.pose(this.active.id, 0, ease(this.prop ? t / 0.68 : t));
    if (this.prop) {
      const target = this.handTransform();
      this.prop.object.position.lerpVectors(this.startPos, target.position, q);
      this.prop.object.quaternion.slerpQuaternions(
        this.startQuat,
        target.quaternion,
        q,
      );
      if (t >= 1) this.attach();
    }
  }
  update(dt, time) {
    this.elapsed += dt;
    this.time = time;
    this.pose(this.active.id, this.elapsed, 1);
    const id = this.active.id,
      t = this.elapsed;
    if (["read", "eat", "idle"].includes(id))
      this.positionHeld(this.handTransform());
    if (id === "read") {
      const page = this.prop.object.userData.page;
      const cycle = t % 4;
      page.rotation.z =
        cycle > 2.9 ? -Math.sin(((cycle - 2.9) / 1.1) * Math.PI) * 2.7 : 0;
    }
    if (id === "cook") {
      this.active.steam.visible = true;
      this.active.steam.position.y = 1.32 + Math.sin(t * 1.4) * 0.06;
      this.active.steam.children.forEach((m, i) => {
        m.scale.y = 0.8 + Math.sin(t * 1.6 + i) * 0.17;
      });
      const position = this.c.hands[1].getWorldPosition(new THREE.Vector3());
      const bowl = new THREE.Vector3(
        -0.15 + Math.sin(t * 1.6) * 0.048,
        1.026,
        -2.92 + Math.cos(t * 1.6) * 0.047,
      );
      const direction = bowl.sub(position);
      this.positionHeld({
        position,
        quaternion: new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, -1, 0),
          direction.clone().normalize(),
        ),
      });
      this.prop.object.scale.y = direction.length() / 0.32;
    }
    if (id === "sweep")
      this.active.dust.scale.setScalar(
        1 - ease(t / this.active.duration) * 0.9,
      );
    if (id === "draw") this.updateDrawing(dt, t);
    if (id === "blocks") this.updateBlock(t);
  }
  pose(id, t, weight = 1) {
    const c = this.c,
      w = weight,
      sw = Math.sin(t * 2.3),
      slow = Math.sin(t * 0.8);
    c.resetPose();
    c.idle(this.time, id === "sleep" && w > 0.8);
    c.root.position.copy(this.origin);
    c.root.rotation.y = this.originYaw;
    if (this.active.pose) {
      c.root.position.lerp(new THREE.Vector3(...this.active.pose.position), w);
      const delta = this.active.pose.yaw - this.originYaw;
      c.root.rotation.y =
        this.originYaw + Math.atan2(Math.sin(delta), Math.cos(delta)) * w;
    }
    c.body.rotation.z = Math.sin(t * 1.7) * 0.018 * w;
    c.head.rotation.z = slow * 0.045 * w;
    switch (id) {
      case "cook":
        c.arms[1].rotation.x = (-2.16 + Math.sin(t * 1.6) * 0.1) * w;
        c.arms[1].rotation.z = (-0.68 + Math.cos(t * 1.6) * 0.13) * w;
        c.arms[0].rotation.x = -0.55 * w;
        c.head.rotation.x = (0.13 + Math.max(0, Math.sin(t * 0.7)) * 0.11) * w;
        c.body.rotation.x = 0.055 * w;
        break;
      case "eat": {
        const bite = Math.max(0, Math.sin(t * 1.1));
        c.body.position.y = 0.32 * w;
        c.legs.forEach(
          (l, i) => (l.rotation.x = (-1.24 + Math.sin(t * 2.5 + i) * 0.04) * w),
        );
        c.arms.forEach((a, i) => {
          a.rotation.x = (-1.65 - bite * 0.58) * w;
          a.rotation.z = (i === 0 ? 0.68 : -0.68) * w;
        });
        c.head.rotation.x = (0.1 - bite * 0.035) * w;
        c.body.rotation.z = Math.sin(t * 2.5) * 0.035 * w;
        c.head.scale.y = 1 + Math.sin(t * 11) * 0.004 * bite;
        break;
      }
      case "read":
        c.body.position.y = 0.32 * w;
        c.arms.forEach((a, i) => {
          a.rotation.x = -1.55 * w;
          a.rotation.z = (i === 0 ? 0.53 : -0.53) * w;
        });
        c.legs.forEach(
          (l, i) =>
            (l.rotation.x = (-1.18 + Math.sin(t * 2.2 + i * 0.9) * 0.11) * w),
        );
        c.head.rotation.x = 0.24 * w;
        c.head.rotation.z = Math.sin(t * 0.7) * 0.065 * w;
        break;
      case "sleep": {
        c.body.rotation.x = (-Math.PI / 2) * w;
        c.body.position.y = Math.sin(t * 1.25) * 0.012 * w;
        c.arms[0].rotation.z = -0.24 * w;
        c.arms[1].rotation.z = 0.24 * w;
        c.head.rotation.z = 0.1 * w;
        break;
      }
      case "sweep":
        c.arms[1].rotation.x = -0.52 * w;
        c.arms[1].rotation.z = (0.12 + sw * 0.22) * w;
        c.arms[0].rotation.x = -0.2 * w;
        c.body.rotation.x = 0.14 * w;
        c.body.rotation.z = sw * 0.055 * w;
        c.head.rotation.x = 0.19 * w;
        c.root.position.x += Math.sin(t * 0.75) * 0.17 * w;
        c.legs[0].rotation.x = Math.sin(t * 0.75) * 0.06 * w;
        c.legs[1].rotation.x = -Math.sin(t * 0.75) * 0.06 * w;
        break;
      case "draw": {
        const admire = t % 7 > 5;
        c.arms[1].rotation.x =
          (admire ? -0.25 : -2.08 + Math.sin(t * 3) * 0.15) * w;
        c.arms[1].rotation.z =
          (admire ? 0.1 : -0.3 + Math.cos(t * 2) * 0.17) * w;
        c.head.rotation.z = (admire ? -0.14 : 0.045 * Math.sin(t)) * w;
        c.head.rotation.x = 0.03 * w;
        const back = admire
          ? Math.sin((((t % 7) - 5) / 2) * Math.PI) * 0.12
          : 0;
        c.root.position.addScaledVector(
          new THREE.Vector3(
            -Math.sin(this.originYaw),
            0,
            -Math.cos(this.originYaw),
          ),
          back * w,
        );
        break;
      }
      case "blocks": {
        const p = t % 4,
          reach = Math.sin(Math.min(p / 2, 1) * Math.PI);
        c.body.position.y = -0.07 * w;
        c.legs.forEach((l, i) => {
          l.rotation.x = -1.3 * w;
          l.rotation.z = (i === 0 ? -0.15 : 0.15) * w;
        });
        c.arms[1].rotation.x = (-0.85 - reach * 0.55) * w;
        c.arms[1].rotation.z = (0.16 - reach * 0.12) * w;
        c.arms[0].rotation.x = -0.75 * w;
        c.head.rotation.x = (0.22 + reach * 0.1) * w;
        c.body.rotation.x = reach * 0.09 * w;
        break;
      }
      case "idle":
        c.body.position.y = 0.055 * w;
        c.legs.forEach((l, i) => {
          l.rotation.x = -1.28 * w;
          l.rotation.z = (i === 0 ? -0.13 : 0.13) * w;
        });
        c.arms.forEach((a, i) => {
          a.rotation.x = -1.55 * w;
          a.rotation.z = (i === 0 ? 0.54 : -0.54) * w;
        });
        c.head.rotation.z = Math.sin(t * 0.55) * 0.1 * w;
        c.head.rotation.x = (0.06 + Math.max(0, Math.sin(t * 0.8)) * 0.1) * w;
        break;
    }
  }
  updateBlock(t) {
    const object = this.prop.object,
      p = t % 5;
    const target = new THREE.Vector3(0.61, 0.36, 2.1);
    const hand = this.handTransform();
    if (object.parent !== this.scene) this.scene.attach(object);
    let mix = 0;
    if (p < 1.4) mix = ease(p / 1.4);
    else if (p < 3.2) mix = 1;
    else if (p < 4.6) mix = 1 - ease((p - 3.2) / 1.4);
    object.position.lerpVectors(hand.position, target, mix);
    object.quaternion.slerpQuaternions(
      hand.quaternion,
      new THREE.Quaternion(),
      mix,
    );
    this.lastBlockState = mix === 1 ? "placed" : "held";
  }
  updateDrawing(dt, t) {
    const admire = t % 7 > 5;
    if (admire) {
      this.lastStroke = null;
      return;
    }
    const x = -0.26 + Math.sin(t * 2) * 0.1,
      y = 1.09 + Math.sin(t * 3) * 0.073;
    this.active.group.updateWorldMatrix(true, false);
    const tip = new THREE.Vector3(x, y, 0.04).applyMatrix4(
      this.active.group.matrixWorld,
    );
    const hand = this.c.hands[1].getWorldPosition(new THREE.Vector3());
    const direction = tip.clone().sub(hand);
    this.positionHeld({
      position: hand,
      quaternion: new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, -1, 0),
        direction.clone().normalize(),
      ),
    });
    this.prop.object.scale.y = Math.min(1.8, direction.length() / 0.1);
    this.strokeClock += dt;
    if (this.strokeClock < 1 / 12) return;
    this.strokeClock = 0;
    const texture = this.active.painting.material.map,
      canvas = texture.image,
      ctx = canvas.getContext("2d");
    const next = [
      (x / 0.96 + 0.5) * canvas.width,
      (0.5 - (y - 1.31)) * canvas.height,
    ];
    if (this.lastStroke) {
      ctx.strokeStyle = "#bd887d";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(...this.lastStroke);
      ctx.lineTo(...next);
      ctx.stroke();
      ctx.globalAlpha = 1;
      texture.needsUpdate = true;
    }
    this.lastStroke = next;
  }
  beginExit() {
    this.exitTime = this.elapsed;
    this.exitRoot = this.c.root.position.clone();
    this.exitYaw = this.c.root.rotation.y;
    this.exitPose = {
      bodyPos: this.c.body.position.clone(),
      bodyRot: this.c.body.rotation.clone(),
      headRot: this.c.head.rotation.clone(),
      arms: this.c.arms.map((a) => a.rotation.clone()),
      legs: this.c.legs.map((a) => a.rotation.clone()),
    };
    if (this.prop) {
      this.scene.updateMatrixWorld(true);
      this.scene.attach(this.prop.object);
      this.exitPropPos = this.prop.object.position.clone();
      this.exitPropQuat = this.prop.object.quaternion.clone();
      this.exitPropScale = this.prop.object.scale.clone();
      this.prop.homeParent.updateWorldMatrix(true, false);
      this.homeWorld = this.prop.homePosition
        .clone()
        .applyMatrix4(this.prop.homeParent.matrixWorld);
      this.prop.homeParent.getWorldQuaternion(tempQuaternion);
      this.homeWorldQuat = tempQuaternion
        .clone()
        .multiply(this.prop.homeQuaternion);
      this.homeWorldScale = this.prop.homeParent
        .getWorldScale(new THREE.Vector3())
        .multiply(this.prop.homeScale);
    }
  }
  updateExit(t, time) {
    const q = ease(this.prop ? (t - 0.4) / 0.6 : t),
      propQ = ease(t / 0.65),
      c = this.c;
    c.resetPose();
    c.idle(time);
    c.root.position.lerpVectors(this.exitRoot, this.origin, q);
    c.root.rotation.y = THREE.MathUtils.lerp(this.exitYaw, this.originYaw, q);
    c.body.position.copy(this.exitPose.bodyPos).multiplyScalar(1 - q);
    const restore = (object, rot) =>
      object.rotation.set(rot.x * (1 - q), rot.y * (1 - q), rot.z * (1 - q));
    restore(c.body, this.exitPose.bodyRot);
    restore(c.head, this.exitPose.headRot);
    c.arms.forEach((a, i) => restore(a, this.exitPose.arms[i]));
    c.legs.forEach((a, i) => restore(a, this.exitPose.legs[i]));
    c.head.scale.y = 1;
    if (this.prop) {
      this.prop.object.position.lerpVectors(
        this.exitPropPos,
        this.homeWorld,
        propQ,
      );
      this.prop.object.position.y += Math.sin(propQ * Math.PI) * 0.08;
      this.prop.object.quaternion.slerpQuaternions(
        this.exitPropQuat,
        this.homeWorldQuat,
        propQ,
      );
      this.prop.object.scale.lerpVectors(
        this.exitPropScale,
        this.homeWorldScale,
        propQ,
      );
    }
    if (t >= 1) this.exit();
  }
  exit() {
    if (this.prop) {
      const p = this.prop;
      p.homeParent.add(p.object);
      p.object.position.copy(p.homePosition);
      p.object.quaternion.copy(p.homeQuaternion);
      p.object.scale.copy(p.homeScale);
      if (p.object.userData.page) p.object.userData.page.rotation.set(0, 0, 0);
    }
    if (this.active?.dust) {
      this.active.dust.visible = false;
      this.active.dust.scale.setScalar(1);
    }
    this.c.resetPose();
    this.c.head.scale.setScalar(1);
    this.c.root.position.copy(this.origin);
    this.c.root.rotation.y = this.originYaw;
    this.prop = null;
    this.active = null;
  }
}
