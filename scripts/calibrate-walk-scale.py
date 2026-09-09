"""Calibrate the walk camera from the user-supplied 1.8 m lower-yard door.

python3 scripts/calibrate-walk-scale.py /path/to/source.glb
The six original door boards are in baked glTF world coordinates.
"""
import json
import hashlib
import struct
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
with Path(sys.argv[1]).open('rb') as f:
    magic, version, length = struct.unpack('<III', f.read(12))
    assert magic == 0x46546C67 and version == 2
    chunk_length, chunk_kind = struct.unpack('<II', f.read(8))
    assert chunk_kind == 0x4E4F534A
    document = json.loads(f.read(chunk_length))
names = [f'v13_旧蓝门板_{i:02d}' for i in range(1, 7)]
nodes = [n for n in document['nodes'] if n.get('name') in names]
assert len(nodes) == 6
bounds = []
for node in nodes:
    assert not any(k in node for k in ('translation', 'rotation', 'scale', 'matrix')), 'Reference door must use baked coordinates'
    for primitive in document['meshes'][node['mesh']]['primitives']:
        accessor = document['accessors'][primitive['attributes']['POSITION']]
        bounds.append((accessor['min'][1], accessor['max'][1]))
door_height_units = max(b[1] for b in bounds) - min(b[0] for b in bounds)
door_height_meters = 1.8  # User's reference dimension, not inferred from Blender units.
units_per_meter = door_height_units / door_height_meters
info = json.loads((root / 'model-info.json').read_text())
digest = hashlib.sha256()
with Path(sys.argv[1]).open('rb') as f:
    for chunk in iter(lambda: f.read(1024 * 1024), b''):
        digest.update(chunk)
assert digest.hexdigest() == info['source']['sha256'], 'Calibration source must match model-info.json'
data = {
    'reference': '下院瓦房的蓝色双扇门，六块门板的整体高度',
    'referenceObjects': names,
    'sourceModelSha256': info['source']['sha256'],
    'modelSha256': info['web']['sha256'],
    'referenceHeightMeters': door_height_meters,
    'referenceHeightUnits': door_height_units,
    'unitsPerMeter': units_per_meter,
    'eyeHeightMeters': 1.62,
    'eyeHeightUnits': 1.62 * units_per_meter,
    'minEyeHeightMeters': 1.35,
    'headMarginMeters': 0.08,
}
(root / 'src/walk-scale.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(data, ensure_ascii=False, indent=2))
