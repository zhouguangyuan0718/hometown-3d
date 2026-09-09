"""Run in background Blender against the original v41 scene; never save it.

blender -b /path/to/v41.blend --python scripts/build-walk-map.py
The navigation grid uses glTF coordinates (x, Blender z, -Blender y).
"""
import bpy
import json
import math
import time
from collections import deque
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent.parent
(ROOT / 'artifacts').mkdir(exist_ok=True)
START = time.monotonic()
scene = bpy.context.scene
bpy.context.view_layer.update()
depsgraph = bpy.context.evaluated_depsgraph_get()
vertices, triangles = [], []
objects = 0
for obj in scene.objects:
    if obj.type != 'MESH' or obj.hide_render:
        continue
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    mesh.calc_loop_triangles()
    offset = len(vertices)
    for vertex in mesh.vertices:
        p = obj.matrix_world @ vertex.co
        vertices.append(Vector((p.x, p.z, -p.y)))
    triangles.extend(tuple(offset + i for i in face.vertices) for face in mesh.loop_triangles)
    evaluated.to_mesh_clear()
    objects += 1
print('NAV geometry', objects, len(vertices), len(triangles), flush=True)
tree = BVHTree.FromPolygons(vertices, triangles, all_triangles=True)
print('NAV BVH ready', round(time.monotonic()-START, 1), flush=True)

CELL = 0.12
X0, Z0 = -12.6, -19.2
WIDTH, DEPTH = 236, 330
RADIUS = 0.19
EYE_HEIGHT = 1.62
MAX_STEP = 0.42
DOWN, UP = Vector((0, -1, 0)), Vector((0, 1, 0))
EMPTY = 32767
heights = [EMPTY] * (WIDTH * DEPTH)

def floor_at(x, z):
    # Courtyard / doorway / stair surfaces are below +0.15. This excludes roofs.
    origin = Vector((x, 0.15, z))
    for _ in range(14):
        hit, normal, _, distance = tree.ray_cast(origin, DOWN, 3.8)
        if hit is None or hit.y < -3.3:
            return None
        if normal.y > 0.55:
            return hit.y
        origin.y = hit.y - 0.003
    return None

for row in range(DEPTH):
    z = Z0 + row * CELL
    for col in range(WIDTH):
        x = X0 + col * CELL
        floor = floor_at(x, z)
        if floor is None:
            continue
        # Check the body's vertical clearance and width against real surfaces.
        hit = tree.ray_cast(Vector((x, floor + 0.25, z)), UP, EYE_HEIGHT)
        if hit[0] is not None:
            continue
        obstructed = False
        # Start above a climbable riser plus body radius: testing a sphere at
        # knee height would wrongly block the front edge of every stair tread.
        for dy in (MAX_STEP + RADIUS + 0.05, 1.05, 1.48):
            nearest = tree.find_nearest(Vector((x, floor + dy, z)), RADIUS)
            if nearest[0] is not None:
                obstructed = True
                break
        if obstructed:
            continue
        # Keep the player's footprint on supported ground (no walking off edges).
        for dx, dz in ((RADIUS, 0), (-RADIUS, 0), (0, RADIUS), (0, -RADIUS)):
            edge = floor_at(x + dx, z + dz)
            if edge is None or abs(edge - floor) > MAX_STEP:
                obstructed = True
                break
        if not obstructed:
            heights[row * WIDTH + col] = round(floor * 1000)
    if row % 60 == 0:
        print('NAV row', row, 'time', round(time.monotonic()-START, 1), flush=True)

(ROOT / 'artifacts/walk-candidates.json').write_text(json.dumps({'cell': CELL, 'origin': [X0,Z0], 'width':WIDTH, 'depth':DEPTH, 'heights':heights}))
# Connect only surfaces reachable on foot from immediately outside the open gate.
desired = (0.98, 12.7)
candidates = [(math.hypot(X0 + i % WIDTH * CELL - desired[0], Z0 + i // WIDTH * CELL - desired[1]), i) for i, h in enumerate(heights) if h != EMPTY]
distance, seed = min(candidates)
assert distance < 0.6, ('No safe point outside the gate', distance)
reachable, pending = {seed}, deque([seed])
while pending:
    i = pending.popleft()
    x, z = i % WIDTH, i // WIDTH
    for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, nz = x + dx, z + dz
        if not (0 <= nx < WIDTH and 0 <= nz < DEPTH):
            continue
        j = nz * WIDTH + nx
        if j in reachable or heights[j] == EMPTY or abs(heights[j] - heights[i]) > MAX_STEP * 1000:
            continue
        reachable.add(j)
        pending.append(j)
heights = [h if i in reachable else EMPTY for i, h in enumerate(heights)]
spawn = [round(X0 + seed % WIDTH * CELL, 3), heights[seed] / 1000, round(Z0 + seed // WIDTH * CELL, 3)]
rows = []
for row in range(DEPTH):
    # Sparse row format [firstColumn, [heightInMillimetres...]], one run per island.
    runs, run, first = [], [], None
    for col in range(WIDTH + 1):
        value = heights[row * WIDTH + col] if col < WIDTH else EMPTY
        if value != EMPTY:
            if first is None:
                first = col
            run.append(value)
        elif first is not None:
            runs.append([first, run]); run, first = [], None
    rows.append(runs)
info = json.loads((ROOT / 'model-info.json').read_text())
data = {'version': 1, 'modelSha256': info['web']['sha256'], 'cell': CELL, 'origin': [X0, Z0], 'width': WIDTH, 'depth': DEPTH, 'eyeHeight': EYE_HEIGHT, 'maxStep': MAX_STEP, 'radius': RADIUS, 'spawn': spawn, 'spawnYaw': 0, 'rows': rows}
(ROOT / 'src/walk-data.json').write_text(json.dumps(data, separators=(',', ':')) + '\n')
report = {'source': bpy.data.filepath, 'objects': objects, 'triangles': len(triangles), 'gridSize': [WIDTH, DEPTH], 'reachableCells': len(reachable), 'spawn': spawn, 'heightRange': [min(heights[i] for i in reachable)/1000, max(heights[i] for i in reachable)/1000], 'timeSeconds': round(time.monotonic()-START, 2)}
(ROOT / 'artifacts/walk-map-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print('NAV COMPLETE', json.dumps(report, ensure_ascii=False), flush=True)
