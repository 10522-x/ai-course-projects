import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import fs from "node:fs/promises";
import assert from "node:assert/strict";

const url = process.env.TEST_URL || "http://localhost:5173";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const errors = [],
  results = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
await fs.mkdir("test-results/models", { recursive: true });
const state = () => page.evaluate(() => window.__modelStudio.snapshot());
function pixels(buffer) {
  const png = PNG.sync.read(buffer),
    colors = new Set();
  let count = 0;
  for (let y = 200; y < png.height - 120; y += 2)
    for (let x = 15; x < png.width - 15; x += 2) {
      const i = (y * png.width + x) * 4;
      colors.add(
        `${png.data[i] >> 3},${png.data[i + 1] >> 3},${png.data[i + 2] >> 3}`,
      );
      if (png.data[i] - png.data[i + 2] > 25) count++;
    }
  return { colors: colors.size, modelPixels: count };
}
try {
  await page.goto(`${url}/model-studio.html?qa=1`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => window.__modelStudio);
  await page.waitForTimeout(350);
  let snapshot = await state();
  assert.equal(snapshot.characters.filter((c) => c.visible).length, 3);
  assert.ok(snapshot.characters.every((c) => c.furMeshes === 0 && !c.outfit));
  assert.equal(
    new Set(snapshot.characters.map((c) => c.bounds.join(","))).size,
    3,
  );
  const bare = await page.screenshot({
    path: "test-results/models/three-bare.png",
  });
  const samples = pixels(bare);
  assert.ok(samples.modelPixels > 15000 && samples.colors > 120);
  results.push({
    test: "three distinct smooth model geometries render",
    ...samples,
  });
  await page.getByRole("button", { name: "穿衣", exact: true }).click();
  assert.ok((await state()).characters.every((c) => c.outfit));
  await page.mouse.move(0, 0);
  await page.screenshot({ path: "test-results/models/three-dressed.png" });
  await page.getByRole("button", { name: "侧面", exact: true }).click();
  await page.screenshot({ path: "test-results/models/three-side.png" });
  await page.getByRole("button", { name: "背面", exact: true }).click();
  await page.screenshot({ path: "test-results/models/three-back.png" });
  await page.getByRole("button", { name: "正面", exact: true }).click();
  const before = (await state()).camera;
  await page.mouse.move(680, 400);
  await page.mouse.down();
  await page.mouse.move(810, 445, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  assert.notDeepEqual((await state()).camera, before);
  await page.getByRole("button", { name: "正面", exact: true }).click();
  results.push({
    test: "outfit toggle, three view presets and orbit",
    pass: true,
  });
  for (const size of [
    { width: 390, height: 844 },
    { width: 360, height: 640 },
  ]) {
    await page.setViewportSize(size);
    for (const id of ["faithful", "round", "soft"]) {
      await page.locator(`[data-design="${id}"]`).click();
      snapshot = await state();
      assert.equal(snapshot.selected, id);
      assert.equal(snapshot.characters.filter((c) => c.visible).length, 1);
      await page.mouse.move(0, 0);
      await page.screenshot({
        path: `test-results/models/${id}-${size.width}.png`,
      });
    }
    const fit = await page.evaluate(() => {
      const elements = [
        ...document.querySelectorAll(
          ".studio-header,.studio-tools,.studio-footer",
        ),
      ].map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      });
      return {
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        elements,
      };
    });
    assert.ok(fit.scroll <= fit.width);
    assert.ok(
      fit.elements.every(
        (r) =>
          r.left >= 0 && r.right <= size.width + 1 && r.bottom <= size.height,
      ),
    );
    results.push({
      test: `mobile ${size.width} variants and layout`,
      pass: true,
    });
  }
  for (const { id, outfit } of [
    { id: "faithful", outfit: true },
    { id: "round", outfit: true },
    { id: "soft", outfit: true },
    { id: "faithful", outfit: false },
  ]) {
    await page.locator(`[data-design="${id}"]`).click();
    await page.locator(`[data-outfit="${outfit}"]`).click();
    await page.getByRole("button", { name: "带回小屋" }).click();
    await page.waitForURL(`${url}/`);
    await page.goto(`${url}/?qa=1`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(() => window.__littleLife);
    await page.evaluate(() => {
      window.__littleLife.setAutonomous(false);
      window.__littleLife.request("read");
    });
    let life;
    for (let i = 0; i < 90; i++) {
      life = await page.evaluate(() => window.__littleLife.advance(0.5));
      if (life.phase === "active" && life.current === "read") break;
    }
    assert.equal(life.current, "read");
    assert.equal(life.phase, "active");
    assert.equal(
      (await page.evaluate(() => window.__littleLife.snapshot())).variant,
      id,
    );
    assert.equal(
      (await page.evaluate(() => window.__littleLife.snapshot())).outfit,
      outfit,
    );
    assert.equal(life.prop, "book");
    await page.evaluate(() => window.__littleLife.advance(22));
    assert.ok(
      (await page.evaluate(() => window.__littleLife.snapshot())).props.every(
        (p) => p.atHome,
      ),
    );
    results.push({
      test: `${id}/${outfit ? "dressed" : "bare"} persists into room and completes reading with prop return`,
      pass: true,
    });
    await page.goto(`${url}/model-studio.html?qa=1`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(() => window.__modelStudio);
    await page.getByRole("button", { name: "穿衣", exact: true }).click();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    "test-results/models/report.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log(
    JSON.stringify({ passed: results.length, results, errors }, null, 2),
  );
} finally {
  await browser.close();
}
