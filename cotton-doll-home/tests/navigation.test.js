import { test } from "node:test";
import assert from "node:assert/strict";
import { Navigator } from "../src/navigation.js";
import { furnitureConfig as config } from "../src/config.js";

test("all activity pairs have collision-free routes", () => {
  const nav = new Navigator(config);
  for (const from of config)
    for (const to of config) {
      const route = nav.route(from.point, to.point);
      assert.ok(route.length, `${from.id} -> ${to.id} reachable`);
      let previous = from.point;
      for (const point of route) {
        assert.ok(
          nav.segmentClear(previous, point),
          `${from.id} -> ${to.id}: clear segment`,
        );
        previous = point;
      }
      assert.ok(
        Math.hypot(previous[0] - to.point[0], previous[1] - to.point[1]) <
          0.001,
      );
    }
});
test("furniture interiors cannot be walked through", () => {
  const nav = new Navigator(config);
  assert.equal(nav.isClear(3, 0), false);
  assert.equal(nav.isClear(-3.5, -1), false);
  assert.equal(nav.isClear(-0.25, -3.1), false);
  assert.equal(nav.isClear(0, 0), true);
  assert.equal(nav.segmentClear([1, 0], [4.4, 0]), false);
});
