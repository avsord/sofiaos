"""Run the existing acceptance suite in isolated shards; never skip assertions.

The original sequential script remains the single source of acceptance checks.
Only execution boundaries and evidence aggregation live here.
"""
from __future__ import annotations
import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

SHARDS = ('navigation', 'workspace')
START = "adb('shell','input','swipe','360','1200','360','450','400');time.sleep(.4)"
SPLIT = '# Actual production screens with synthetic transport: new layout/filter/note flows.'
FINISH = "logs=adb('logcat','-d').decode(errors='replace');"
REPORT = "(out/'result.json').write_text("
APKS = ('Sofia-OS.apk', 'QA-ONLY-full-fixture.apk', 'baseline-Sofia-OS.apk')


def digest(file: Path) -> str:
    h = hashlib.sha256()
    with file.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def partition(source: str) -> dict[str, str]:
    """Require unique, ordered boundaries and syntactically complete sections."""
    markers = (START, SPLIT, FINISH, REPORT)
    for marker in markers:
        if source.count(marker) != 1:
            raise ValueError('Acceptance boundary changed: ' + marker)
    begin, split, finish, report = (source.index(m) for m in markers)
    if not begin < split < finish < report:
        raise ValueError('Acceptance boundaries are out of order')
    pieces = {'common': source[:begin], 'navigation': source[begin:split],
              'workspace': source[split:finish], 'finish': source[finish:report]}
    for name, code in pieces.items():
        ast.parse(code, filename=name)
    # Do not hide a newly appended check behind the former summary writer.
    for node in ast.parse(source[report:]).body:
        if not isinstance(node, ast.Expr) or not isinstance(node.value, ast.Call):
            raise ValueError('Acceptance checks were added after the summary')
        call = node.value
        is_result = isinstance(call.func, ast.Attribute) and call.func.attr == 'write_text'
        is_print = isinstance(call.func, ast.Name) and call.func.id == 'print'
        if not (is_result or is_print):
            raise ValueError('Unassigned acceptance statement after the summary')
    return pieces


def make_bundle(dist: Path) -> dict:
    source = (dist / 'SOURCE_COMMIT.txt').read_text().strip()
    if not re.fullmatch(r'[0-9a-f]{40}', source):
        raise ValueError('Invalid source commit')
    manifest = {'source_sha': source, 'apk_hashes': {n: digest(dist / n) for n in APKS}}
    (dist / 'delivery-bundle.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


def verify_bundle(dist: Path) -> dict:
    manifest = json.loads((dist / 'delivery-bundle.json').read_text())
    source = (dist / 'SOURCE_COMMIT.txt').read_text().strip()
    if not re.fullmatch(r'[0-9a-f]{40}', source):
        raise ValueError('Invalid source commit')
    expected = os.environ.get('SOFIA_SOURCE_SHA', '')
    if expected and expected != source:
        raise ValueError('Downloaded build is from another source commit')
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    if head != source or manifest.get('source_sha') != source:
        raise ValueError('Source checkout does not match the APK bundle')
    hashes = manifest.get('apk_hashes', {})
    if set(hashes) != set(APKS) or any(digest(dist / n) != hashes[n] for n in APKS):
        raise ValueError('APK bundle integrity verification failed')
    expected_hash = (dist / 'Sofia-OS.apk.sha256').read_text().split()[0]
    if hashes['Sofia-OS.apk'] != expected_hash:
        raise ValueError('Production APK differs from the checked release hash')
    return manifest


def run_shard(shard: str, dist: Path) -> None:
    manifest = verify_bundle(dist)
    source_file = Path('tools/native-performance-smoke.py')
    pieces = partition(source_file.read_text())
    started = time.monotonic()
    result = {**manifest, 'shard': shard, 'passed': False,
              'run_id': os.environ.get('GITHUB_RUN_ID', ''),
              'attempt': int(os.environ.get('GITHUB_RUN_ATTEMPT', '1')),
              'suite_sha256': digest(source_file)}
    namespace = {'__name__': '__main__', '__file__': str(source_file)}
    evidence = dist / 'performance-evidence'
    evidence.mkdir(parents=True, exist_ok=True)
    try:
        for name in ('common', shard, 'finish'):
            exec(compile(pieces[name], str(source_file) + ':' + name, 'exec'), namespace)
        result['passed'] = True
    finally:
        result['seconds'] = round(time.monotonic() - started, 3)
        (evidence / ('result-' + shard + '.json')).write_text(json.dumps(result, indent=2) + '\n')
        # Diagnostics must never turn a failed test into a successful shard.
        for filename, command in (
            ('final-qa.xml', ['adb', 'exec-out', 'cat', '/sdcard/performance.xml']),
            ('final-qa.png', ['adb', 'exec-out', 'screencap', '-p']),
            ('final-log.txt', ['adb', 'logcat', '-d'])):
            try:
                output = subprocess.run(command, capture_output=True, timeout=20)
                (evidence / filename).write_bytes(output.stdout)
            except (OSError, subprocess.TimeoutExpired):
                pass
    print('PASS isolated native shard:', shard, flush=True)


def verify_results(dist: Path, evidence: Path) -> dict:
    manifest = verify_bundle(dist)
    suite_hash = digest(Path('tools/native-performance-smoke.py'))
    latest: dict[str, dict] = {}
    for path in evidence.rglob('result-*.json'):
        result = json.loads(path.read_text())
        shard = result.get('shard')
        if shard not in SHARDS:
            raise ValueError('Unexpected native shard')
        if (result.get('source_sha') != manifest['source_sha'] or
            result.get('apk_hashes') != manifest['apk_hashes'] or
            result.get('suite_sha256') != suite_hash or
            result.get('run_id') != os.environ.get('GITHUB_RUN_ID', '')):
            raise ValueError('Native evidence belongs to a different build, suite or run')
        attempt = result.get('attempt')
        if type(attempt) is not int or attempt < 1:
            raise ValueError('Invalid native evidence attempt')
        if shard in latest and latest[shard]['attempt'] == attempt:
            raise ValueError('Duplicate native evidence for the same attempt')
        if shard not in latest or latest[shard]['attempt'] < attempt:
            latest[shard] = result
    if set(latest) != set(SHARDS) or any(r.get('passed') is not True for r in latest.values()):
        raise ValueError('Every native shard must pass before publication')
    result = {'passed': True, **manifest, 'shards': latest}
    destination = dist / 'performance-evidence'
    destination.mkdir(parents=True, exist_ok=True)
    (destination / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    print('VERIFIED all native shards on the same checked APK')
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=('bundle', 'verify-bundle', 'run', 'verify-results'))
    parser.add_argument('--shard', choices=SHARDS)
    parser.add_argument('--dist', type=Path, default=Path('dist'))
    parser.add_argument('--evidence', type=Path, default=Path('dist/native-evidence'))
    args = parser.parse_args()
    if args.command == 'bundle':
        make_bundle(args.dist)
    elif args.command == 'verify-bundle':
        verify_bundle(args.dist)
    elif args.command == 'verify-results':
        verify_results(args.dist, args.evidence)
    elif args.shard:
        run_shard(args.shard, args.dist)
    else:
        parser.error('run requires --shard')

if __name__ == '__main__':
    main()
