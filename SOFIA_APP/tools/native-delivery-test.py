"""Offline contracts for parallel delivery and strict release gates."""
import ast
import collections
import importlib.util
import json
import os
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
        for token in ('max-parallel: 2','fail-fast: false','native-shards.py verify-results',"needs: [build, native_tests]",'cancel-in-progress: false'):
            self.assertIn(token,text)
        self.assertNotIn('continue-on-error: true\n      id: native_tests',text)
        self.assertIn('native-delivery-test.py',text)

if __name__ == '__main__': unittest.main()
