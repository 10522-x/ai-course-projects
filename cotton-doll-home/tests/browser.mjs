import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PNG } from "pngjs";

const url = process.env.TEST_URL || "http://localhost:5173";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
await fs.mkdir("test-results", { recursive: true });
const errors = [],
  results = [];
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const snapshot = () => page.evaluate(() => window.__littleLife.snapshot());
const canvasFrame = async () =>
  Buffer.from(
    await page
      .locator("#world")
      .evaluate((c) => c.toDataURL("image/png").split(",")[1]),
    "base64",
  );
const advance = (seconds) =>
  page.evaluate((s) => window.__littleLife.advance(s), seconds);
async function untilPhase(phase, activity, max = 90) {
  for (let i = 0; i < max; i++) {
    const s = await snapshot();
    assert.equal(s.error, null);
    if (s.phase === phase && (!activity || s.current === activity)) return s;
    await advance(0.5);
  }
  throw new Error(
    `Timed out reaching ${phase}/${activity}: ${JSON.stringify(await snapshot())}`,
  );
}
function pixelStats(buffer) {
  const png = PNG.sync.read(buffer),
    colors = new Set();
  let changed = 0;
  const base = [png.data[0], png.data[1], png.data[2]];
  for (let y = 180; y < png.height - 100; y += 3)
    for (let x = 10; x < png.width - 10; x += 3) {
      const i = (y * png.width + x) * 4,
        r = png.data[i],
        g = png.data[i + 1],
        b = png.data[i + 2];
      colors.add(`${r >> 3},${g >> 3},${b >> 3}`);
      if (
        Math.abs(r - base[0]) + Math.abs(g - base[1]) + Math.abs(b - base[2]) >
        25
      )
        changed++;
    }
  return { colors: colors.size, nonBackgroundSamples: changed };
}
function difference(a, b) {
  const p = PNG.sync.read(a),
    q = PNG.sync.read(b);
  let count = 0;
  for (let i = 0; i < p.data.length; i += 4)
    if (
      Math.abs(p.data[i] - q.data[i]) +
        Math.abs(p.data[i + 1] - q.data[i + 1]) +
        Math.abs(p.data[i + 2] - q.data[i + 2]) >
      20
    )
      count++;
  return count;
}
try {
  await page.goto(`${url}/?qa=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__littleLife);
  await page.waitForTimeout(700);
  await page.screenshot({ path: "test-results/little-life.png" });
  await page.evaluate(() => {
    window.__littleLife.setAutonomous(false);
    window.__littleLife.paused(true);
  });
  await page.waitForTimeout(700);
  const desktop = await page.screenshot({ path: "test-results/desktop.png" });
  const desktopPixels = pixelStats(desktop);
  assert.ok(desktopPixels.colors > 120);
  assert.ok(desktopPixels.nonBackgroundSamples > 18000);
  results.push({ test: "desktop canvas", ...desktopPixels });
  assert.equal(await page.locator("#error").isVisible(), false);
  await page.evaluate(() => window.__littleLife.portrait());
  await page.screenshot({ path: "test-results/character.png" });
  await page.getByRole("button", { name: "重置视角", exact: true }).click();

  const wallHeights = (await snapshot()).environment.wallHeights;
  assert.equal(wallHeights[0], wallHeights[1]);
  await page.locator("#pause").hover();
  assert.equal(await page.locator("#tool-label").textContent(), "继续");
  assert.ok(await page.locator("#tool-label").isVisible());
  await page.locator(".activity-button[data-id='read']").hover();
  assert.equal(await page.locator("#tool-label").textContent(), "读一会儿");
  await page.locator(".activity-button[data-id='read']").click();
  assert.equal((await snapshot()).pending, "read");
  assert.equal(await page.locator("#selection").count(), 0);
  // Furniture hover is read-only; one click immediately replaces the pending activity.
  const p = await page.evaluate(() => window.__littleLife.project("eat"));
  await page.mouse.move(p.x, p.y);
  assert.ok(await page.locator("#furniture-label").isVisible());
  assert.equal((await snapshot()).pending, "read");
  await page.mouse.click(p.x, p.y);
  assert.equal((await snapshot()).selected, "eat");
  assert.equal((await snapshot()).pending, "eat");
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await untilPhase("active", "eat");
  results.push({
    test: "equal walls, icon and furniture tooltips, direct single-click activities",
    pass: true,
  });

  const ids = [
    "eat",
    "read",
    "cook",
    "sleep",
    "sweep",
    "draw",
    "blocks",
    "idle",
  ];
  for (const id of ids) {
    await page.evaluate((id) => window.__littleLife.request(id), id);
    await untilPhase("active", id);
    await advance(1.2);
    const a = await snapshot();
    await page.screenshot({ path: `test-results/activity-${id}.png` });
    const before = await canvasFrame();
    await advance(0.7);
    const b = await snapshot();
    const after = await canvasFrame();
    if (id === "sleep")
      assert.notDeepEqual(a.body, b.body, "sleep: breathing animation");
    else assert.notDeepEqual(a.head, b.head, `${id}: head animation`);
    const changedPixels = difference(before, after);
    assert.ok(
      changedPixels > 8,
      `${id}: rendered animation (${changedPixels})`,
    );
    if (id !== "sleep") assert.ok(b.prop, `${id}: held prop`);
    if (id === "sleep") assert.ok(b.position[1] > 0.7, "lying on bed");
    results.push({
      test: `activity ${id}`,
      phase: b.phase,
      prop: b.prop,
      changedPixels,
    });
    if (id !== "idle") {
      await untilPhase("idle");
      assert.ok(
        (await snapshot()).props.every((p) => p.atHome),
        `${id}: natural exit restores all props`,
      );
    }
  }

  // Pausing freezes all simulated transforms and clocks, but camera controls keep working.
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  const paused = await snapshot();
  const pausedFrame = await canvasFrame();
  await page.waitForTimeout(900);
  const frozen = await snapshot();
  assert.equal(frozen.time, paused.time);
  assert.equal(frozen.timer, paused.timer);
  assert.deepEqual(frozen.position, paused.position);
  assert.deepEqual(frozen.arms, paused.arms);
  assert.equal(difference(pausedFrame, await canvasFrame()), 0);
  await page.mouse.move(800, 400);
  await page.mouse.down();
  await page.mouse.move(960, 475, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const rotated = await snapshot();
  assert.notDeepEqual(rotated.camera, paused.camera);
  assert.equal(rotated.selected, paused.selected);
  await page.mouse.wheel(0, -340);
  await page.waitForTimeout(350);
  assert.ok((await snapshot()).zoom > paused.zoom);
  await page.getByRole("button", { name: "重置视角", exact: true }).click();
  const reset = await snapshot();
  assert.ok(Math.abs(reset.camera[0] - 10.8) < 0.001);
  assert.equal(reset.zoom, 1);
  results.push({
    test: "pause, orbit, drag versus click, zoom and reset",
    pass: true,
  });
  const dayFrame = await canvasFrame();
  await page.locator("#time-of-day").focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(150);
  assert.equal((await snapshot()).environment.hour, 24);
  assert.equal(await page.locator("#time-display").textContent(), "00:00");
  assert.equal((await snapshot()).time, paused.time);
  const nightFrame = await canvasFrame();
  assert.ok(difference(dayFrame, nightFrame) > 10000);
  await page.screenshot({ path: "test-results/night.png" });
  await page.locator("#background-color").fill("#d9eafa");
  await page.waitForTimeout(100);
  assert.equal((await snapshot()).environment.background, "#d9eafa");
  const tinted = PNG.sync.read(await canvasFrame());
  assert.ok(Math.abs(tinted.data[0] - 217) < 3 && Math.abs(tinted.data[2] - 250) < 3);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("suoer.environment.v1"))),
    { hour: 24, background: "#d9eafa" });
  await page.locator("#time-of-day").evaluate((input) => {
    input.value = "10";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator("#background-color").fill("#e5ece5");
  results.push({ test: "day/night pixels, custom background and saved settings while paused", pass: true });

  // Latest instruction wins, current prop is restored before another activity starts.
  await page.evaluate(() => {
    window.__littleLife.request("cook");
    window.__littleLife.request("read");
  });
  assert.equal((await snapshot()).pending, "read");
  await page.getByRole("button", { name: "继续", exact: true }).click();
  const exiting = await advance(0.2);
  assert.equal(exiting.phase, "exit");
  await untilPhase("walk", "read");
  const restored = await snapshot();
  assert.ok(
    restored.props.every((p) => p.atHome),
    "all props returned before walking",
  );
  results.push({
    test: "priority switch and complete prop restoration",
    pass: true,
  });
  await untilPhase("active", "read");
  await untilPhase("idle");
  const idle = await snapshot();
  assert.ok(idle.props.every((p) => p.atHome));
  await advance(10);
  assert.equal((await snapshot()).phase, "idle");
  await page.getByRole("switch", { name: "自主生活" }).check();
  await advance(2);
  assert.notEqual((await snapshot()).phase, "idle");
  results.push({
    test: "autonomy off waits, autonomy on schedules",
    pass: true,
  });
  const moving = await snapshot();
  await page.waitForTimeout(1200);
  const moved = await snapshot();
  assert.ok(moved.time > moving.time);
  assert.notDeepEqual(moving.position, moved.position);
  results.push({
    test: "real-time frame driven movement",
    distance: Math.hypot(
      moved.position[0] - moving.position[0],
      moved.position[2] - moving.position[2],
    ),
  });

  for (const size of [
    { width: 390, height: 844 },
    { width: 360, height: 640 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    await page.getByRole("button", { name: "重置视角", exact: true }).click();
    await page.evaluate(() => window.__littleLife.paused(true));
    await page.waitForTimeout(200);
    const bounds = await page.evaluate(() => window.__littleLife.roomBounds());
    assert.ok(
      bounds.minX > -0.98 &&
        bounds.maxX < 0.98 &&
        bounds.minY > -0.98 &&
        bounds.maxY < 0.98,
      `room fits ${size.width}x${size.height}: ${JSON.stringify(bounds)}`,
    );
    const name = `mobile-${size.width}x${size.height}`;
    const image = await page.screenshot({ path: `test-results/${name}.png` });
    const pixels = pixelStats(image);
    assert.ok(pixels.colors > 50);
    assert.ok(pixels.nonBackgroundSamples > 800);
    const layout = await page.evaluate(() => {
      const controls = [
        ...document.querySelectorAll(".toolbar,.heading,.status,.activities,.environment-controls"),
      ].map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.className, x: r.x, y: r.y, w: r.width, h: r.height };
      });
      return {
        scroll: document.documentElement.scrollWidth,
        viewport: innerWidth,
        controls,
      };
    });
    assert.ok(layout.scroll <= layout.viewport);
    for (const c of layout.controls) {
      assert.ok(
        c.x >= 0 && c.x + c.w <= size.width + 1,
        `${name}: ${c.id} horizontal fit`,
      );
    }
    for (let i = 0; i < layout.controls.length; i++)
      for (let j = i + 1; j < layout.controls.length; j++) {
        const a = layout.controls[i],
          b = layout.controls[j];
        assert.ok(
          !(
            a.x < b.x + b.w &&
            a.x + a.w > b.x &&
            a.y < b.y + b.h &&
            a.y + a.h > b.y
          ),
          `${name}: ${a.id}/${b.id} do not overlap`,
        );
      }
    results.push({ test: name, ...pixels, layout });
  }
  const touch = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const touchPage = await touch.newPage();
  await touchPage.goto(`${url}/?qa=1`, { waitUntil: "domcontentloaded" });
  await touchPage.waitForFunction(() => window.__littleLife);
  await touchPage.evaluate(() => window.__littleLife.paused(true));
  const client = await touch.newCDPSession(touchPage);
  const firstCamera = await touchPage.evaluate(
    () => window.__littleLife.snapshot().camera,
  );
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 190, y: 400 }],
  });
  for (let i = 1; i <= 8; i++)
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 190 + i * 10, y: 400 + i * 3 }],
    });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await touchPage.waitForTimeout(250);
  assert.notDeepEqual(
    await touchPage.evaluate(() => window.__littleLife.snapshot().camera),
    firstCamera,
  );
  const firstZoom = await touchPage.evaluate(
    () => window.__littleLife.snapshot().zoom,
  );
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: 160, y: 420 },
      { x: 230, y: 420 },
    ],
  });
  for (let i = 1; i <= 6; i++)
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: 160 - i * 7, y: 420 },
        { x: 230 + i * 7, y: 420 },
      ],
    });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await touchPage.waitForTimeout(250);
  assert.ok(
    (await touchPage.evaluate(() => window.__littleLife.snapshot().zoom)) >
      firstZoom,
  );
  assert.equal(
    await touchPage.evaluate(() => window.__littleLife.snapshot().selected),
    null,
  );
  results.push({
    test: "mobile single-finger orbit and two-finger pinch without false clicks",
    pass: true,
  });
  await touch.close();
  assert.deepEqual(errors, []);
  await fs.writeFile(
    "test-results/report.json",
    JSON.stringify(
      { date: new Date().toISOString(), results, consoleErrors: errors },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      { passed: results.length, results, consoleErrors: errors },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
