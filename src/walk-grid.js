// Precomputed from the source scene. All movement stays on the gate-connected
// component and checks intermediate cells to prevent tunnelling through walls.
export class WalkGrid {
  constructor(data) {
    this.data = data;
    this.heights = new Int16Array(data.width * data.depth).fill(32767);
    data.rows.forEach((runs, row) => runs.forEach(([start, values]) => this.heights.set(values, row * data.width + start)));
  }

  cell(x, z) {
    const { origin, cell } = this.data;
    return [Math.round((x - origin[0]) / cell), Math.round((z - origin[1]) / cell)];
  }

  height(col, row) {
    const { width, depth } = this.data;
    if (col < 0 || row < 0 || col >= width || row >= depth) return null;
    const height = this.heights[row * width + col];
    return height === 32767 ? null : height / 1000;
  }

  sample(x, z, previousHeight) {
    const height = this.height(...this.cell(x, z));
    return height !== null && Math.abs(height - previousHeight) <= this.data.maxStep + 0.001 ? height : null;
  }

  step(position, dx, dz) {
    const oldCell = this.cell(position.x, position.z);
    const targetCell = this.cell(position.x + dx, position.z + dz);
    const y = this.sample(position.x + dx, position.z + dz, position.y);
    if (y === null) return false;
    // Diagonal movement cannot squeeze between the corners of two blocked cells.
    if (oldCell[0] !== targetCell[0] && oldCell[1] !== targetCell[1]) {
      if (this.sample(position.x + dx, position.z, position.y) === null || this.sample(position.x, position.z + dz, position.y) === null) return false;
    }
    position.x += dx; position.y = y; position.z += dz;
    return true;
  }

  move(position, dx, dz) {
    const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (this.data.cell * 0.3)));
    let moved = false;
    for (let step = 0; step < count; step++) {
      const sx = dx / count, sz = dz / count;
      if (this.step(position, sx, sz)) moved = true;
      else {
        if (sx && this.step(position, sx, 0)) moved = true;
        if (sz && this.step(position, 0, sz)) moved = true;
      }
    }
    return moved;
  }
}
