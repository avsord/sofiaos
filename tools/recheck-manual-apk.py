"""Recheck exact 102 APK with a supported graphics backend; do not rebuild or relax gates."""
from pathlib import Path
import hashlib, json, subprocess, zipfile
root=Path(__file__).resolve().parents[1]
source=root/'manual-check';dist=source/'SOFIA_APP/dist'
expected_source='e218a4846229518a7a2063bc2f458fca31cdd6a6'
expected_hash='113ccb4752d3c3a6802ca49c46f888d0134a4158890f2afd77ada7ab32661839'
assert (dist/'SOURCE_COMMIT.txt').read_text().strip()==expected_source
assert hashlib.sha256((dist/'Sofia-OS.apk').read_bytes()).hexdigest()==expected_hash
with zipfile.ZipFile(dist/'Sofia-OS-0.3.102-source.zip') as archive:
 for name in archive.namelist():assert (source/name).resolve().is_relative_to(source.resolve()),name
 archive.extractall(source)
# Exact original smoke and its four timing gates. The retained 065 baseline is
# measured under the SAME ANGLE GPU backend, API, device and synthetic data.
run=subprocess.run(['python3',str(source/'SOFIA_APP/tools/manual-apk-smoke.py')])
out=dist/'manual-evidence';out.mkdir(exist_ok=True)
result=json.loads((out/'manual-result.json').read_text())
report={'apk_source_sha':expected_source,'apk_sha256':expected_hash,
        'gpu_mode':'swangle','api_level':33,'physical_device':False,
        'original_failed_runs':[38008561596,38009257939],'original_gpu':'swiftshader_indirect',
        'unchanged_acceptance_exit_code':run.returncode,'passed':result['passed']}
for prop in ['ro.hardware.egl','debug.hwui.renderer','ro.build.version.sdk']:
 report[prop]=subprocess.check_output(['adb','shell','getprop',prop],timeout=30).decode().strip()
(out/'graphics-recheck.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
raise SystemExit(run.returncode)
