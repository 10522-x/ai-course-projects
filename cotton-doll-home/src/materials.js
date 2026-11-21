import * as THREE from "three";

export function seeded(seed = 19) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function canvasTexture(draw, size = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  draw(canvas.getContext("2d"), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const random = seeded(18);
const weave = canvasTexture((ctx, s) => {
  ctx.fillStyle = "#d4d1c9";
  ctx.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 4) {
    for (let x = 0; x < s; x += 4) {
      const v = 178 + Math.floor(random() * 62);
      ctx.strokeStyle = `rgb(${v},${v},${v})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 2, y + 3);
      ctx.stroke();
    }
  }
  for (let i = 0; i < 7000; i++) {
    const x = random() * s,
      y = random() * s;
    ctx.strokeStyle = random() > 0.5 ? "#ffffee45" : "#78695925";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + random() * 5 - 2, y + random() * 4);
    ctx.stroke();
  }
}, 256);
weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
weave.repeat.set(3, 3);

const grain = canvasTexture((ctx, s) => {
  ctx.fillStyle = "#deb98c";
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 220; i++) {
    const y = random() * s;
    ctx.strokeStyle = `rgba(${random() > 0.5 ? "130,87,53" : "255,242,206"},${0.03 + random() * 0.15})`;
    ctx.lineWidth = 0.4 + random() * 1.3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= s; x += 8)
      ctx.lineTo(x, y + Math.sin(x * 0.013 + i) * (0.5 + Math.sin(i) * 3));
    ctx.stroke();
  }
});
grain.wrapS = grain.wrapT = THREE.RepeatWrapping;

export function cloth(color, scale = 0.024) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 1,
    bumpMap: weave,
    bumpScale: scale,
  });
}
export const mat = {
  cream: cloth("#f4ead5"),
  white: cloth("#fff6e3"),
  hair: cloth("#765044", 0.036),
  face: cloth("#f8e5ce", 0.008),
  paw: cloth("#edc6b4"),
  scarf: cloth("#b4a28b", 0.024),
  rose: cloth("#d69b9f"),
  blush: cloth("#e8c1c1"),
  sage: cloth("#9dad89"),
  green: cloth("#7e9b88"),
  blue: cloth("#adc6cf"),
  ink: cloth("#75483f", 0.007),
  yellow: cloth("#e9ce8d"),
  wood: new THREE.MeshStandardMaterial({
    map: grain,
    roughness: 0.84,
    bumpMap: grain,
    bumpScale: 0.025,
  }),
  darkwood: new THREE.MeshStandardMaterial({
    color: "#bb936a",
    map: grain,
    roughness: 0.85,
    bumpMap: grain,
    bumpScale: 0.022,
  }),
  wall: new THREE.MeshStandardMaterial({ color: "#eff0df", roughness: 1 }),
  wallGreen: new THREE.MeshStandardMaterial({ color: "#bdcbb3", roughness: 1 }),
  trim: new THREE.MeshStandardMaterial({ color: "#faf2df", roughness: 0.78 }),
  pinkPaint: new THREE.MeshStandardMaterial({
    color: "#dcb7b2",
    roughness: 0.83,
  }),
  greenPaint: new THREE.MeshStandardMaterial({
    color: "#8da38d",
    roughness: 0.83,
  }),
  bluePaint: new THREE.MeshStandardMaterial({
    color: "#9bbcc7",
    roughness: 0.82,
  }),
  ceramic: new THREE.MeshStandardMaterial({
    color: "#faf1da",
    roughness: 0.46,
  }),
  brass: new THREE.MeshStandardMaterial({
    color: "#ac8860",
    roughness: 0.5,
    metalness: 0.28,
  }),
};

export function artTexture(kind) {
  return canvasTexture((ctx, s) => {
    ctx.fillStyle = kind === "book" ? "#afc3a0" : "#f5ecd8";
    ctx.fillRect(0, 0, s, s);
    if (kind === "book" || kind === "picture") {
      ctx.fillStyle = "#e4c98b";
      ctx.beginPath();
      ctx.arc(365, 120, 45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#81996b";
      ctx.beginPath();
      ctx.ellipse(160, 420, 235, 200, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#d7dfbe";
      ctx.beginPath();
      ctx.ellipse(410, 440, 210, 190, 0.2, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 12; i++) {
        const x = 40 + random() * 420,
          y = 290 + random() * 200;
        ctx.strokeStyle = "#657f59";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y + 25);
        ctx.lineTo(x, y);
        ctx.stroke();
        flower(ctx, x, y, 9, "#fff0d3");
      }
      ctx.fillStyle = "#fffae9";
      ctx.font = "28px serif";
      ctx.textAlign = "center";
      ctx.fillText(
        kind === "book" ? "A LITTLE DAY" : "little things",
        s / 2,
        80,
      );
      ctx.fillStyle = "#f3e4cc";
      ctx.beginPath();
      ctx.ellipse(268, 303, 46, 51, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#976c51";
      ctx.beginPath();
      ctx.ellipse(266, 264, 56, 27, 0, Math.PI, Math.PI * 2);
      ctx.fill();
    } else if (kind === "rug") {
      ctx.fillStyle = "#e3bdb5";
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = "#f3dbc5";
      ctx.lineWidth = 6;
      ctx.strokeRect(25, 25, s - 50, s - 50);
      ctx.lineWidth = 2;
      ctx.strokeRect(37, 37, s - 74, s - 74);
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
          flower(ctx, 110 + i * 145, 110 + j * 145, 25, "#f6e7c9");
    } else if (kind === "quilt") {
      const colors = [
        "#9eae99",
        "#e5c2b3",
        "#eddfb8",
        "#b6c9cd",
        "#f3ebd7",
        "#b1bea0",
      ];
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          ctx.fillStyle = colors[(x + y * 3) % colors.length];
          ctx.fillRect(x * 128, y * 128, 128, 128);
          ctx.strokeStyle = "#fff5deaa";
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.strokeRect(x * 128 + 5, y * 128 + 5, 118, 118);
          ctx.setLineDash([]);
          if ((x + y) % 2 === 0)
            flower(ctx, x * 128 + 64, y * 128 + 64, 17, "#fff4dd");
          else {
            ctx.strokeStyle = "#ffffff35";
            ctx.lineWidth = 8;
            for (let i = 0; i < 4; i++) {
              ctx.beginPath();
              ctx.moveTo(x * 128, y * 128 + i * 32);
              ctx.lineTo(x * 128 + 128, y * 128 + i * 32);
              ctx.stroke();
            }
          }
        }
    } else if (kind === "drawing") {
      ctx.strokeStyle = "#8da47d";
      ctx.lineWidth = 12;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(60, 410);
      ctx.quadraticCurveTo(250, 365, 440, 425);
      ctx.stroke();
      ctx.fillStyle = "#d9ad98";
      ctx.fillRect(170, 210, 190, 180);
      ctx.fillStyle = "#b3c3a0";
      ctx.beginPath();
      ctx.moveTo(135, 225);
      ctx.lineTo(265, 115);
      ctx.lineTo(390, 225);
      ctx.fill();
      ctx.fillStyle = "#f5e9bb";
      ctx.fillRect(230, 280, 60, 110);
      ctx.fillStyle = "#b3cad2";
      ctx.fillRect(190, 250, 35, 35);
      ctx.fillRect(301, 250, 35, 35);
      flower(ctx, 80, 290, 26, "#d6a6ab");
      flower(ctx, 408, 330, 22, "#d6a6ab");
      ctx.fillStyle = "#e6c175";
      ctx.beginPath();
      ctx.arc(400, 90, 38, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 8000; i++) {
      ctx.fillStyle = random() > 0.5 ? "#ffffff09" : "#635b4d07";
      ctx.fillRect(random() * s, random() * s, 1, 2);
    }
  });
}

function flower(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  for (let a = 0; a < 6; a++) {
    const t = (a * Math.PI) / 3;
    ctx.beginPath();
    ctx.ellipse(
      x + Math.cos(t) * r * 0.7,
      y + Math.sin(t) * r * 0.7,
      r * 0.52,
      r * 0.35,
      t,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.fillStyle = "#d2b66e";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.27, 0, Math.PI * 2);
  ctx.fill();
}

export function faceTexture(closed = false) {
  return canvasTexture((ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const eye = (x, side) => {
      ctx.save();
      ctx.translate(x, 236);
      ctx.rotate(side * 0.035);
      ctx.fillStyle = "#98564b";
      ctx.strokeStyle = "#844b43";
      if (!closed) {
        ctx.beginPath();
        ctx.moveTo(-47, 0);
        ctx.lineTo(44, 0);
        ctx.lineTo(32, 50);
        ctx.quadraticCurveTo(-4, 69, -33, 43);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#bc8670";
        ctx.fillRect(-21, 11, 12, 21);
        ctx.fillStyle = "#eee0be";
        ctx.fillRect(15, 7, 7, 11);
        ctx.strokeStyle = "#7e483d";
        ctx.lineWidth = 9;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-49, -4);
        ctx.quadraticCurveTo(0, -8, 46, 0);
        ctx.stroke();
        ctx.lineWidth = 3;
        for (let k = 0; k < 10; k++) {
          ctx.strokeStyle = "#683b352e";
          ctx.beginPath();
          ctx.moveTo(-34 + k * 7, 3);
          ctx.lineTo(-29 + k * 6, 40);
          ctx.stroke();
        }
      } else {
        ctx.lineWidth = 7;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-42, 15);
        ctx.quadraticCurveTo(0, 33, 40, 14);
        ctx.stroke();
      }
      ctx.strokeStyle = "#a4705b";
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-30, -35);
      ctx.lineTo(27, -32);
      ctx.stroke();
      ctx.restore();
    };
    eye(153, -1);
    eye(359, 1);
    ctx.fillStyle = "#e4a5a070";
    for (const x of [102, 410]) {
      ctx.beginPath();
      ctx.ellipse(x, 321, 31, 19, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#c88d86";
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x - 12 + i * 10, 314);
        ctx.lineTo(x - 13 + i * 10, 326);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = "#9c6c58";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(241, 333);
    ctx.quadraticCurveTo(255, 344, 269, 332);
    ctx.stroke();
    ctx.fillStyle = "#d7b89b";
    ctx.beginPath();
    ctx.ellipse(256, 299, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function disposeMaterials() {
  const textures = new Set();
  for (const m of Object.values(mat)) {
    if (m.map) textures.add(m.map);
    if (m.bumpMap) textures.add(m.bumpMap);
    m.dispose();
  }
  textures.forEach((t) => t.dispose());
}
