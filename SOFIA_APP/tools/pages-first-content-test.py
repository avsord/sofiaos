import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('page_probe',Path(__file__).with_name('pages-first-content.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class ProbeTests(unittest.TestCase):
 def simulate(self,appear=None,empty=None,probe_ms=0):
  t=[0.0];shots=[]
  def now():return t[0]
  def sleep(seconds):t[0]+=seconds
  def probe(remaining):
   if probe_ms/1000>remaining:
    t[0]+=remaining;raise TimeoutError('bounded probe')
   t[0]+=probe_ms/1000
   if empty is not None and t[0]>=empty:return 'Sua primeira página'
   if appear is not None and t[0]>=appear:return 'Página QA 0000'
   return '<hierarchy>menu-pages</hierarchy>'
  r=module.measure_pages(probe,mode='new',trial='03-new',now=now,sleep=sleep,on_snapshot=lambda *args:shots.append(args))
  return r,shots
 def test_content_after_half_second_is_measured_not_rejected(self):
  r,_=self.simulate(.6);self.assertTrue(r['correctness_passed']);self.assertGreaterEqual(r['pages_first_content_ms'],600);self.assertTrue(r['goal_met'])
 def test_slow_content_is_not_falsely_fast(self):
  r,_=self.simulate(1.6);self.assertTrue(r['correctness_passed']);self.assertFalse(r['goal_met']);self.assertGreaterEqual(r['pages_first_content_ms'],1600)
 def test_no_content_fails_after_eight_seconds(self):
  r,s=self.simulate();self.assertTrue(r['timed_out']);self.assertFalse(r['correctness_passed']);self.assertIsNone(r['pages_first_content_ms']);self.assertEqual(r['elapsed_ms'],8000)
  self.assertEqual([x['target_ms'] for x in r['snapshots']],[1500,3000]);self.assertEqual(s[-1][0],'timeout')
 def test_false_empty_fails_immediately(self):
  r,_=self.simulate(appear=3,empty=.2);self.assertTrue(r['false_empty']);self.assertFalse(r['correctness_passed']);self.assertLess(r['elapsed_ms'],300)
 def test_instrument_overhead_is_disclosed(self):
  r,_=self.simulate(appear=.6,probe_ms=1100);self.assertEqual(r['pages_first_content_ms'],1100);self.assertFalse(r['goal_met']);self.assertEqual(r['probes'][0]['probe_ms'],1100)
 def test_probe_cannot_claim_success_outside_timeout(self):
  r,_=self.simulate(appear=9,probe_ms=9000);self.assertTrue(r['timed_out']);self.assertFalse(r['correctness_passed']);self.assertTrue(r['probe_timeout'])
 def test_each_sample_keeps_mode_and_trial(self):
  r,_=self.simulate(.1);self.assertEqual((r['mode'],r['trial']),('new','03-new'))
if __name__=='__main__':unittest.main(verbosity=2)
