"""Offline contracts for parallel delivery and strict release gates."""
import ast
import collections
import importlib.util
import json
import os
import re
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('native_shards', ROOT/'tools/native-shards.py')
shards = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shards)

class DeliveryTests(unittest.TestCase):
    def test_every_existing_assertion_is_preserved(self):
        source = (ROOT/'tools/native-performance-smoke.py').read_text()
        pieces = shards.partition(source)
        checks = lambda s: collections.Counter(ast.dump(n) for n in ast.walk(ast.parse(s)) if isinstance(n, ast.Assert))
        self.assertEqual(checks(source), sum((checks(p) for p in pieces.values()), collections.Counter()))
        self.assertGreater(sum(checks(source).values()), 20)

    def test_every_existing_wait_and_input_is_preserved(self):
        source = (ROOT/'tools/native-performance-smoke.py').read_text()
        calls = lambda s: collections.Counter(ast.dump(n) for n in ast.walk(ast.parse(s))
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
            and n.func.id in ('wait','tap','adb','screenshot','dismiss_keyboard','scroll_to'))
        self.assertEqual(calls(source), sum((calls(p) for p in shards.partition(source).values()), collections.Counter()))

    def test_changed_or_duplicate_boundaries_fail_closed(self):
        source = (ROOT/'tools/native-performance-smoke.py').read_text()
        with self.assertRaises(ValueError): shards.partition(source.replace(shards.SPLIT, '# changed'))
        with self.assertRaises(ValueError): shards.partition(source+'\n'+shards.SPLIT)
        with self.assertRaises(ValueError): shards.partition(source+'\nassert False\n')

    def test_independent_workspace_needs_no_navigation_local(self):
        parts = shards.partition((ROOT/'tools/native-performance-smoke.py').read_text())
        used = {n.id for n in ast.walk(ast.parse(parts['workspace'])) if isinstance(n,ast.Name) and isinstance(n.ctx,ast.Load)}
        for navigation_only in ('qa_task','baseline','list_node','refresh_count','calendar_bounds','calendar_swipes'):
            self.assertNotIn(navigation_only, used)

    def fixture(self, root):
        dist = root/'dist';dist.mkdir()
        sha = 'a'*40
        (dist/'SOURCE_COMMIT.txt').write_text(sha)
        for name in shards.APKS: (dist/name).write_bytes(name.encode())
        (dist/'Sofia-OS.apk.sha256').write_text(shards.digest(dist/'Sofia-OS.apk')+'  dist/Sofia-OS.apk')
        return dist, shards.make_bundle(dist)

    def test_048_chat_and_warm_start_stay_out_of_workspace_shard(self):
        parts = shards.partition((ROOT/'tools/native-performance-smoke.py').read_text())
        self.assertIn("chat-tail-on-entry", parts['navigation'])
        self.assertIn("SOFIA_STARTUP_CACHE_READY", parts['navigation'])
        self.assertNotIn("chat-tail-on-entry", parts['workspace'])
        self.assertNotIn("SOFIA_STARTUP_CACHE_READY", parts['workspace'])
        self.assertIn("CartaoQA048", parts['workspace'])

    def test_bundle_tampering_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(shards.subprocess,'check_output',return_value='a'*40):
            dist, manifest = self.fixture(Path(tmp))
            with patch.dict(os.environ,{'SOFIA_SOURCE_SHA':'a'*40}):
                self.assertEqual(shards.verify_bundle(dist),manifest)
                (dist/'QA-ONLY-full-fixture.apk').write_bytes(b'wrong fixture')
                with self.assertRaisesRegex(ValueError,'integrity'): shards.verify_bundle(dist)

    def test_source_mismatch_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(shards.subprocess,'check_output',return_value='b'*40):
            dist, _ = self.fixture(Path(tmp))
            with self.assertRaises(ValueError): shards.verify_bundle(dist)

    def evidence_fixture(self, root):
        dist, manifest = self.fixture(root)
        evidence = root/'evidence';evidence.mkdir()
        (root/'tools').mkdir();(root/'tools/native-performance-smoke.py').write_text('assert True')
        source_hash = shards.digest(root/'tools/native-performance-smoke.py')
        for name in shards.SHARDS:
            (evidence/f'result-{name}.json').write_text(json.dumps({**manifest,'passed':True,'shard':name,'run_id':'123','attempt':1,'suite_sha256':source_hash}))
        return dist,evidence

    def test_all_shards_required_and_same_build(self):
        cwd = Path.cwd()
        try:
            with tempfile.TemporaryDirectory() as tmp, patch.object(shards.subprocess,'check_output',return_value='a'*40), patch.dict(os.environ,{'GITHUB_RUN_ID':'123','SOFIA_SOURCE_SHA':'a'*40}):
                root=Path(tmp);dist,evidence=self.evidence_fixture(root);os.chdir(root)
                self.assertTrue(shards.verify_results(dist,evidence)['passed'])
                f=evidence/'result-workspace.json';record=json.loads(f.read_text());record['passed']=False;f.write_text(json.dumps(record))
                with self.assertRaises(ValueError): shards.verify_results(dist,evidence)
                f.unlink()
                with self.assertRaises(ValueError): shards.verify_results(dist,evidence)
        finally: os.chdir(cwd)

    def test_stale_success_cannot_override_failed_retry(self):
        cwd=Path.cwd()
        try:
            with tempfile.TemporaryDirectory() as tmp, patch.object(shards.subprocess,'check_output',return_value='a'*40), patch.dict(os.environ,{'GITHUB_RUN_ID':'123','SOFIA_SOURCE_SHA':'a'*40}):
                root=Path(tmp);dist,evidence=self.evidence_fixture(root);os.chdir(root)
                result=json.loads((evidence/'result-workspace.json').read_text());result.update(attempt=2,passed=False)
                (evidence/'retry').mkdir();(evidence/'retry/result-workspace.json').write_text(json.dumps(result))
                with self.assertRaises(ValueError): shards.verify_results(dist,evidence)
                result['passed']=True;(evidence/'retry/result-workspace.json').write_text(json.dumps(result))
                self.assertTrue(shards.verify_results(dist,evidence)['passed'])
                result['run_id']='other';(evidence/'retry/result-workspace.json').write_text(json.dumps(result))
                with self.assertRaises(ValueError): shards.verify_results(dist,evidence)
        finally: os.chdir(cwd)

    def test_workflow_keeps_parallel_and_publication_gates(self):
        text=(ROOT.parent/'.github/workflows/sofia-native-047-update.yml').read_text()
        for token in ('max-parallel: 2','fail-fast: false','native-shards.py verify-results',"needs: [build, native_tests]"):
            self.assertIn(token,text)
        self.assertNotIn('continue-on-error: true\n      id: native_tests',text)
        self.assertIn('native-delivery-test.py',text)

    def workflow_job(self, name):
        text = (ROOT.parent/'.github/workflows/sofia-native-047-update.yml').read_text()
        jobs = text.split('\njobs:\n', 1)[1]
        match = re.search(r'^  '+re.escape(name)+r':\n(.*?)(?=^  [\w-]+:\n|\Z)',
                          jobs, re.MULTILINE | re.DOTALL)
        self.assertIsNotNone(match, 'Missing workflow job: '+name)
        return match.group(1)

    def test_round3_production_r8_and_abi_boundaries_are_explicit(self):
        """Only the user APK drops x86. A separate, disclosed QA twin feeds x86 smoke."""
        workflow=(ROOT.parent/'.github/workflows/sofia-native-047-update.yml').read_text()
        release_build=workflow.split('    - name: Build standalone production APK\n',1)[1].split('    - name: Verify package, increasing version code',1)[0]
        fixture=workflow.split('    - name: Build full production shell with isolated transport for acceptance\n',1)[1].split('    - name: Seal exact production',1)[0]
        qa=workflow.split('    - name: Build signed emulator-only QA twin without altering ARM64 owner APK\n',1)[1].split('    - name: Build full production shell',1)[0]
        manual=self.workflow_job('manual_apk')
        self.assertIn('-PreactNativeArchitectures=arm64-v8a\n',release_build)
        self.assertNotIn('-PreactNativeArchitectures=arm64-v8a,x86_64',release_build)
        self.assertIn('-PreactNativeArchitectures=arm64-v8a,x86_64',fixture)
        self.assertIn('-PreactNativeArchitectures=arm64-v8a,x86_64',qa)
        self.assertIn('test -s app/build/outputs/mapping/release/mapping.txt',release_build)
        for setting in ('android.enableMinifyInReleaseBuilds=true','android.enableShrinkResourcesInReleaseBuilds=true'):
            self.assertIn(setting,release_build)
        self.assertIn('tools/verify-abi-equivalence.py',qa)
        self.assertIn('QA-ONLY-manual-universal.apk',manual)
        self.assertIn('tools/verify-abi-equivalence.py',manual)
        self.assertNotIn('[approved-apk]',qa)
        config=json.loads((ROOT/'app.json').read_text())['expo']
        plugin=[x for x in config['plugins'] if isinstance(x,list) and x[0]=='expo-build-properties']
        self.assertEqual(len(plugin),1)
        self.assertTrue(plugin[0][1]['android']['enableMinifyInReleaseBuilds'])
        self.assertTrue(plugin[0][1]['android']['enableShrinkResourcesInReleaseBuilds'])
        package=json.loads((ROOT/'package.json').read_text())
        lock=json.loads((ROOT/'package-lock.json').read_text())
        self.assertEqual(package['dependencies']['expo-build-properties'],'~57.0.22')
        self.assertEqual(lock['packages']['node_modules/expo-build-properties']['version'],'57.0.22')

    def test_obsolete_builds_are_cancellable_without_a_global_workflow_lock(self):
        text = (ROOT.parent/'.github/workflows/sofia-native-047-update.yml').read_text()
        # A workflow-wide lock would keep the next build waiting on old tests;
        # workflow-wide cancellation could instead interrupt a release upload.
        self.assertNotRegex(text, r'(?m)^concurrency:')
        self.assertIn(
            '    concurrency:\n'
            '      group: sofia-android-build-${{ github.ref }}\n'
            '      cancel-in-progress: true\n', self.workflow_job('build'))

    def test_publication_has_a_separate_non_cancellable_lock_and_approval_gate(self):
        release = self.workflow_job('release')
        self.assertIn(
            '    concurrency:\n'
            '      group: sofia-android-release\n'
            '      cancel-in-progress: false\n', release)
        self.assertIn('needs: [build, native_tests]', release)
        self.assertIn("contains(github.event.head_commit.message, '[approved-apk]')", release)
        self.assertIn("!contains(github.event.head_commit.message, '[manual-apk]')", release)
        self.assertNotIn('sofia-android-build-', release)
        self.assertNotIn('continue-on-error: true\n      id: publish', release)

    def test_native_jobs_cannot_block_or_cancel_the_build_and_publication_locks(self):
        for name in ('native_tests', 'manual_apk'):
            with self.subTest(job=name):
                job = self.workflow_job(name)
                self.assertNotRegex(job, r'(?m)^    concurrency:')
                self.assertNotIn('sofia-android-build-', job)
                self.assertNotIn('group: sofia-android-release', job)

if __name__ == '__main__': unittest.main()
