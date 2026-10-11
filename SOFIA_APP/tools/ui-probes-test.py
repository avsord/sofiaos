import importlib.util
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("geometry",Path(__file__).with_name("ui-probes.py"))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Geometry(unittest.TestCase):
 def fixture(self,header="[22,76][190,115]",calendar="[22,284][298,571]"):
  return '<hierarchy><node resource-id="sofia-pager-ready:100000" bounds="[0,24][320,571]"><node text="Olá, Teste." bounds="'+header+'"/><node resource-id="calendar-month-swipe" bounds="'+calendar+'"/></node></hierarchy>'
 def test_title_target_outside_calendar(self):
  x,y,xx,yy=m.home_pager_swipe(self.fixture());self.assertEqual(y,yy);self.assertLess(y,284);self.assertGreater(x-xx,160)
 def test_rejects_header_over_calendar(self):
  with self.assertRaises(AssertionError):m.home_pager_swipe(self.fixture(header="[22,300][190,340]"))
 def test_missing_title_fails_not_guesses(self):
  with self.assertRaises(AssertionError):m.home_pager_swipe("<hierarchy/>")
 def test_translated_month_and_banners_do_not_change_target(self):
  self.assertEqual(m.home_pager_swipe(self.fixture()),m.home_pager_swipe(self.fixture().replace("</hierarchy>","<node text=\"Sem conexão\"/></hierarchy>")))
if __name__=="__main__":unittest.main(verbosity=2)
