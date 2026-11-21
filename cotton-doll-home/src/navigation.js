import PF from "pathfinding";

export class Navigator {
  constructor(config, { step = 0.14, padding = 0.48 } = {}) {
    this.step = step;
    this.padding = padding;
    this.minX = -4.48;
    this.minZ = -3.47;
    this.cols = 65;
    this.rows = 51;
    this.bounds = config.flatMap((f) =>
      [f.bounds, ...(f.obstacles || [])]
        .filter(Boolean)
        .map((rect) => ({ id: f.id, rect })),
    );
    this.grid = new PF.Grid(this.cols, this.rows);
    for (let z = 0; z < this.rows; z++)
      for (let x = 0; x < this.cols; x++) {
        const p = this.world(x, z);
        this.grid.setWalkableAt(x, z, this.isClear(p[0], p[1], padding));
      }
    this.finder = new PF.AStarFinder({
      diagonalMovement: PF.DiagonalMovement.OnlyWhenNoObstacles,
    });
  }
  isClear(x, z, padding = this.padding) {
    return (
      x >= -4.49 &&
      x <= 4.49 &&
      z >= -3.49 &&
      z <= 3.59 &&
      !this.bounds.some(
        ({ rect: [x1, x2, z1, z2] }) =>
          x > x1 - padding &&
          x < x2 + padding &&
          z > z1 - padding &&
          z < z2 + padding,
      )
    );
  }
  cell(x, z) {
    return [
      Math.max(
        0,
        Math.min(this.cols - 1, Math.round((x - this.minX) / this.step)),
      ),
      Math.max(
        0,
        Math.min(this.rows - 1, Math.round((z - this.minZ) / this.step)),
      ),
    ];
  }
  world(x, z) {
    return [this.minX + x * this.step, this.minZ + z * this.step];
  }
  closestCell(x, z) {
    const cell = this.cell(x, z);
    if (this.grid.isWalkableAt(...cell)) return cell;
    let best = null,
      distance = Infinity;
    for (let zz = 0; zz < this.rows; zz++)
      for (let xx = 0; xx < this.cols; xx++)
        if (this.grid.isWalkableAt(xx, zz)) {
          const p = this.world(xx, zz),
            d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
          if (d < distance) {
            distance = d;
            best = [xx, zz];
          }
        }
    return best;
  }
  segmentClear(a, b, padding = 0.4) {
    const steps = Math.ceil(Math.hypot(a[0] - b[0], a[1] - b[1]) / 0.035);
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0;
      if (
        !this.isClear(
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
          padding,
        )
      )
        return false;
    }
    return true;
  }
  route(start, end) {
    const a = this.closestCell(...start),
      b = this.closestCell(...end);
    if (!a || !b) return [];
    const cells = this.finder.findPath(...a, ...b, this.grid.clone());
    if (!cells.length) return [];
    const points = [
      start,
      ...PF.Util.compressPath(cells).map((p) => this.world(...p)),
      end,
    ];
    // Shorten only when the actual continuous segment clears the inflated furniture.
    const result = [points[0]];
    let i = 0;
    while (i < points.length - 1) {
      let next = i + 1;
      for (let j = i + 2; j < points.length; j++)
        if (this.segmentClear(points[i], points[j], 0.47)) next = j;
      if (!this.segmentClear(points[i], points[next])) return [];
      result.push(points[next]);
      i = next;
    }
    return result
      .slice(1)
      .filter(
        (p, i, a) =>
          i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 0.005,
      );
  }
}
