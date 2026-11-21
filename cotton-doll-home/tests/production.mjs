import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const port = Number(process.env.PREVIEW_PORT || 4173);
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
);
let browser;
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Preview startup timeout")),
      10000,
    );
    server.stdout.on("data", (data) => {
      if (data.toString().includes("Local:")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    server.stderr.on("data", (data) => {
      clearTimeout(timeout);
      reject(new Error(data.toString()));
    });
    server.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1366, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`http://127.0.0.1:${port}/?qa=1`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => !document.getElementById("loading"));
  assert.equal(
    await page.evaluate(() => typeof window.__littleLife),
    "undefined",
  );
  assert.equal(await page.locator("#error").isVisible(), false);
  await page.getByRole("button", { name: "读一会儿", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.getElementById("status-text").textContent === "瑣儿正在翻绘本",
    {},
    { timeout: 22000 },
  );
  await fs.mkdir("test-results/models", { recursive: true });
  await page.mouse.move(0, 0);
  await page.screenshot({ path: "test-results/production.png" });
  await page.locator("#background-color").fill("#172332");
  await page.locator("#time-of-day").focus();
  await page.keyboard.press("End");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !document.getElementById("loading"));
  assert.equal(await page.locator("#background-color").inputValue(), "#172332");
  assert.equal(await page.locator("#time-display").textContent(), "00:00");
  assert.equal(await page.locator("#selection").count(), 0);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: "test-results/production-night.png" });
  await page.goto(`http://127.0.0.1:${port}/model-studio.html?qa=1`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    () => document.querySelectorAll("[data-design]").length === 3,
  );
  assert.equal(await page.locator("#studio-error").isVisible(), false);
  assert.equal(await page.evaluate(() => typeof window.__modelStudio), "undefined");
  await page.getByRole("button", { name: "穿衣", exact: true }).click();
  assert.equal(await page.locator('[data-outfit="true"]').getAttribute("aria-pressed"), "true");
  await page.screenshot({ path: "test-results/models/production-studio.png" });
  assert.deepEqual(errors, []);
  const report = {
    production: true,
    qaInterfaceAbsent: true,
    readActivityReached: true,
    studioEntryVerified: true,
    environmentRestoredOnReload: true,
    consoleErrors: errors,
  };
  await fs.writeFile(
    "test-results/production-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
