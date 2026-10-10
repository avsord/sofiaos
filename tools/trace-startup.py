"""Diagnose an existing exact APK. Preserve acceptance failure; never rebuild or publish."""
from pathlib import Path
import hashlib, json, os, subprocess, time, zipfile

root = Path(__file__).resolve().parents[1]
source = root / 'trace-source'
dist = source / 'SOFIA_APP/dist'
out = dist / 'startup-trace'
out.mkdir(parents=True, exist_ok=True)
pkg = 'com.avsord.sofiaapp'
expected_source = '553b4594ea4a7a8e8c597d760f4d3826d2d1b739'
expected_hash = '51a1b303359f8cfeb657c8f383dbd0581888f074b7182dfec6310bdf405613c0'
assert (dist / 'SOURCE_COMMIT.txt').read_text().strip() == expected_source
assert hashlib.sha256((dist / 'Sofia-OS.apk').read_bytes()).hexdigest() == expected_hash
with zipfile.ZipFile(dist / 'Sofia-OS-0.3.101-source.zip') as archive:
    for name in archive.namelist():
        assert (source / name).resolve().is_relative_to(source.resolve()), name
    archive.extractall(source)

acceptance = subprocess.run(['python3', str(source / 'SOFIA_APP/tools/manual-apk-smoke.py')])
result = json.loads((dist / 'manual-evidence/manual-result.json').read_text())
report = {'diagnostic_only': True, 'apk_source_sha': expected_source,
          'apk_sha256': expected_hash, 'acceptance_exit_code': acceptance.returncode,
          'acceptance_passed': result['passed'], 'physical_device': False, 'traces': []}
(out / 'diagnostic-result.json').write_text(json.dumps(report, indent=2) + '\n')
assert result.get('authenticated_home_tested'), 'Acceptance did not reach the saved Home'
processor = os.environ['SOFIA_TRACE_PROCESSOR']

def adb(*args):
    return subprocess.check_output(['adb', *args], timeout=60)

for label, apk in [('candidate', dist / 'Sofia-OS.apk')]:
    adb('install', '-r', str(apk))
    adb('shell', 'am', 'force-stop', pkg)
    adb('logcat', '-c')
    remote = '/data/misc/perfetto-traces/sofia-' + label + '.pftrace'
    with (out / (label + '-recorder.txt')).open('wb') as log:
        tracing = subprocess.Popen(['adb', 'shell', 'perfetto', '-o', remote, '-t', '6s',
                                    '-b', '32mb', '-a', pkg, 'sched', 'freq', 'idle', 'am',
                                    'wm', 'gfx', 'view', 'binder_driver', 'dalvik', 'input'],
                                   stdout=log, stderr=subprocess.STDOUT)
        time.sleep(.4)
        manager = adb('shell', 'am', 'start', '-W', '-n', pkg + '/.MainActivity')
        tracing.wait(timeout=20)
    assert tracing.returncode == 0, 'Perfetto recording failed'
    trace = out / (label + '.pftrace')
    adb('pull', remote, str(trace))
    assert trace.stat().st_size > 1000, 'Empty trace'
    (out / (label + '-activity.txt')).write_bytes(manager)
    (out / (label + '-stages.txt')).write_bytes(adb('logcat', '-d', '-s', 'SofiaLaunch:I',
                                                 'Choreographer:I', 'OpenGLRenderer:I', 'AndroidRuntime:E'))
    (out / (label + '-frames.txt')).write_bytes(adb('shell', 'dumpsys', 'gfxinfo', pkg, 'framestats'))
    pid = int(adb('shell', 'pidof', pkg).strip().split()[0])
    queries = {
      'slices': f"""SELECT t.name AS thread, s.name, round(s.dur / 1e6, 3) AS duration_ms,
        round((s.ts - COALESCE(p.start_ts, (SELECT start_ts FROM trace_bounds))) / 1e6, 3) AS process_ms
        FROM slice s JOIN thread_track tt ON s.track_id = tt.id
        JOIN thread t ON tt.utid = t.utid JOIN process p ON t.upid = p.upid
        WHERE p.pid = {pid} AND s.dur > 1000000 ORDER BY s.dur DESC LIMIT 120;""",
      'cpu': f"""SELECT t.name AS thread, round(sum(s.dur) / 1e6, 3) AS cpu_ms
        FROM sched_slice s JOIN thread t ON s.utid = t.utid JOIN process p ON t.upid = p.upid
        WHERE p.pid = {pid} GROUP BY t.utid ORDER BY cpu_ms DESC;"""
    }
    for kind, sql in queries.items():
        query = out / (label + '-' + kind + '.sql'); query.write_text(sql)
        with (out / (label + '-' + kind + '.csv')).open('wb') as csv, (out / (label + '-' + kind + '-processor.txt')).open('wb') as log:
            analyzed = subprocess.run([processor, 'query', '-f', str(query), str(trace)], stdout=csv, stderr=log)
        report['traces'].append({'label': label, 'query': kind, 'exit_code': analyzed.returncode,
                                 'pid': pid, 'bytes': trace.stat().st_size})
    (out / 'diagnostic-result.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
