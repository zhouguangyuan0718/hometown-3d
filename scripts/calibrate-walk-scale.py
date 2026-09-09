"""Bind the current model to the frozen historical blue-door calibration.

python3 scripts/calibrate-walk-scale.py /path/to/source.glb
v43 changes those boards. Never derive a new scale from their edited height.
walk-scale-reference.json records the measurement from the original v42 GLB.
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
reference = json.loads((root / 'scripts/walk-scale-reference.json').read_text())
door_height_units = reference['referenceHeightUnits']
door_height_meters = reference['referenceHeightMeters']
units_per_meter = door_height_units / door_height_meters
info = json.loads((root / 'model-info.json').read_text())
digest = hashlib.sha256()
with Path(sys.argv[1]).open('rb') as f:
    for chunk in iter(lambda: f.read(1024 * 1024), b''):
        digest.update(chunk)
assert digest.hexdigest() == info['source']['sha256'], 'Current model must match model-info.json'
data = {
    'reference': reference['reference'],
    'referenceObjects': reference['referenceObjects'],
    'calibrationSourceModelName': reference['referenceModelName'],
    'calibrationSourceModelSha256': reference['referenceModelSha256'],
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
