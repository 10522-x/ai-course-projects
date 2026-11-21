import * as THREE from "three";
import { canvasTexture } from "./materials.js";

export const characterDesigns = [
  {
    id: "faithful",
    name: "新图校准",
    number: "01",
    face: [0.467, 0.283, 0.36],
    headY: 1.065,
    cheek: 0.77,
    hair: [0.505, 0.458, 0.43],
    hairY: 0.176,
    belly: [0.343, 0.25, 0.29],
    torsoY: 0.525,
    eyeWidth: 1.10,
    eyeHeight: 1.62,
    eyeGap: 106,
    fringe: 1,
    mouthY: 405,
    restArm: 0.35,
    calibrated: true,
  },
  {
    id: "round",
    name: "圆脸短身",
    number: "02",
    face: [0.562, 0.348, 0.308],
    headY: 1.052,
    cheek: 0.94,
    hair: [0.594, 0.324, 0.356],
    hairY: 0.138,
    belly: [0.332, 0.304, 0.265],
    eyeWidth: 1.02,
    eyeHeight: 1.43,
    eyeGap: 96,
    fringe: 0.88,
    mouthY: 366,
    restArm: 0.86,
  },
  {
    id: "soft",
    name: "软团比例",
    number: "03",
    face: [0.551, 0.325, 0.318],
    headY: 1.025,
    cheek: 0.79,
    hair: [0.593, 0.286, 0.369],
    hairY: 0.14,
    belly: [0.359, 0.299, 0.275],
    eyeWidth: 1.02,
    eyeHeight: 1.17,
    eyeGap: 100,
    fringe: 0.93,
    mouthY: 363,
    restArm: 0.91,
  },
];

export function resolveDesign(id) {
  return (
    characterDesigns.find((design) => design.id === id) || characterDesigns[0]
  );
}

export function readCharacterPreference() {
  try {
    const value = JSON.parse(
      localStorage.getItem("suoer.character.v2") || "{}",
    );
    return {
      variant: resolveDesign(value.variant).id,
      outfit: value.outfit !== false,
    };
  } catch {
    return { variant: "faithful", outfit: true };
  }
}

export function matte(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.92,
    metalness: 0,
  });
}

export function createCharacterPalette() {
  return {
    skin: matte("#f5e5ce"),
    suit: matte("#fff1dc"),
    cuff: matte("#f9ead5"),
    hair: matte("#624333"),
    ear: matte("#e9c6ab"),
    sole: matte("#e7c3a6"),
    scarf: matte("#aa9271"),
    scarfFold: matte("#a18a69"),
    bag: matte("#b88d77"),
    bagTrim: matte("#946d58"),
    pink: matte("#df9e95"),
    pinkLight: matte("#f5c7b1"),
    seam: matte("#eadac1"),
  };
}

export function dollFaceTexture(design, closed) {
  return canvasTexture((ctx) => {
    const lid = "#754839",
      iris = "#875642";
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(256 + side * design.eyeGap, design.calibrated ? 224 : 254);
      ctx.scale(design.eyeWidth, design.eyeHeight);
      ctx.rotate(side * (design.calibrated ? 0.075 : 0.035));
      ctx.strokeStyle = lid;
      ctx.lineJoin = ctx.lineCap = "round";
      if (closed) {
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(-42, 17);
        ctx.quadraticCurveTo(0, 36, 42, 17);
        ctx.stroke();
      } else {
        ctx.fillStyle = iris;
        ctx.beginPath();
        ctx.moveTo(-43, 1);
        ctx.lineTo(43, 1);
        ctx.lineTo(36, 52);
        ctx.bezierCurveTo(32, 79, -31, 81, -36, 51);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#a47654";
        ctx.beginPath();
        ctx.ellipse(0, 46, 29, 23, 0, 0, Math.PI);
        ctx.fill();
        ctx.strokeStyle = "#754b3733";
        ctx.lineWidth = 1.1;
        for (let i = -21; i <= 21; i += 14) {
          ctx.beginPath();
          ctx.moveTo(i, 16);
          ctx.lineTo(i * 0.88, 57);
          ctx.stroke();
        }
        ctx.fillStyle = design.calibrated ? iris : "#ecd2a7";
        ctx.beginPath();
        ctx.ellipse(-19, 15, 3, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = lid;
        ctx.lineWidth = 11;
        ctx.beginPath();
        ctx.moveTo(-47, 0);
        ctx.quadraticCurveTo(-4, -5, 45, 1);
        ctx.stroke();
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(side * 43, 0);
        ctx.lineTo(side * 52, -7);
        ctx.stroke();
      }
      ctx.strokeStyle = design.calibrated ? "#bd8b79" : "#91654d";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-26, -34);
      ctx.quadraticCurveTo(0, -30, 24, -34);
      ctx.stroke();
      ctx.restore();
    }
    for (const x of [95, 417]) {
      const blush = ctx.createRadialGradient(x, 359, 4, x, 359, design.calibrated ? 44 : 34);
      blush.addColorStop(0, "#e6a69790");
      blush.addColorStop(1, "#e6a69700");
      ctx.fillStyle = blush;
      ctx.beginPath();
      ctx.ellipse(x, 359, design.calibrated ? 43 : 38, design.calibrated ? 36 : 28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#cf93805c";
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * 10, 353);
        ctx.lineTo(x + i * 10 - 2, 364);
        ctx.stroke();
      }
    }
    if (design.calibrated) {
      const nose = ctx.createRadialGradient(256, 282, 2, 256, 282, 35);
      nose.addColorStop(0, "#e6a398b0");
      nose.addColorStop(1, "#e6a39800");
      ctx.fillStyle = nose;
      ctx.fillRect(220, 246, 72, 72);
    }
    ctx.strokeStyle = design.calibrated ? "#c1947255" : "#c19472";
    ctx.lineWidth = 3.8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(245, design.mouthY);
    ctx.quadraticCurveTo(251, design.mouthY + 8, 257, design.mouthY + 3);
    ctx.quadraticCurveTo(263, design.mouthY + 8, 269, design.mouthY - 1);
    ctx.stroke();
  }, 512);
}

export function bagTexture() {
  return canvasTexture((ctx, size) => {
    ctx.scale(size / 512, size / 512);
    ctx.fillStyle = "#c6a38a";
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = "#98745e";
    ctx.lineWidth = 27;
    ctx.strokeRect(22, 15, 468, 482);
    for (const [x, y] of [
      [155, 90],
      [322, 174],
      [160, 270],
      [322, 363],
      [150, 431],
    ]) {
      ctx.fillStyle = "#e6d3b5";
      for (let i = 0; i < 5; i++) {
        const angle = (i * Math.PI * 2) / 5;
        ctx.beginPath();
        ctx.ellipse(
          x + Math.cos(angle) * 20,
          y + Math.sin(angle) * 20,
          18,
          12,
          angle,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.fillStyle = "#ad9371";
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#96a18a";
      ctx.beginPath();
      ctx.ellipse(x + 25, y + 24, 15, 6, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 256);
}
