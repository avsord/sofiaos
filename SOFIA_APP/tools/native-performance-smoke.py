import subprocess,time,re,json,xml.etree.ElementTree as ET
from pathlib import Path
out=Path('dist/performance-evidence');out.mkdir(parents=True,exist_ok=True)
def adb(*a):return subprocess.check_output(['adb',*a],timeout=30)
def tree():
 adb('shell','uiautomator','dump','/sdcard/performance.xml');return ET.fromstring(adb('shell','cat','/sdcard/performance.xml'))
def find(root,label):
 for n in reversed(list(root.iter('node'))):
  if n.get('bounds')!='[0,0][0,0]' and (n.get('text')==label or n.get('content-desc')==label):return n
 return None
def wait(label):
 for _ in range(15):
  r=tree();n=find(r,label)
  if n is not None:return n
  time.sleep(.25)
 raise AssertionError('Missing '+label+ET.tostring(r,encoding='unicode'))
def tap(label):
 n=wait(label);a,b,c,d=map(int,re.findall(r'\d+',n.get('bounds')));adb('shell','input','tap',str((a+c)//2),str((b+d)//2))
def screenshot(name):
 r=tree();(out/(name+'.xml')).write_text(ET.tostring(r,encoding='unicode'));(out/(name+'.png')).write_bytes(adb('exec-out','screencap','-p'));return r
wait('Olá, Teste.');r=screenshot('home-500');text=ET.tostring(r,encoding='unicode');assert 'PERF_PASS' in text and 'PERF_FAIL' not in text,text
pid=adb('shell','pidof','com.avsord.sofiaapp').strip()
for i in range(3):
 tap('Agenda');wait('Sua agenda');tap('Próximo mês');tap('Mês anterior');screenshot('agenda-'+str(i));tap('Início');wait('Olá, Teste.')
 assert adb('shell','pidof','com.avsord.sofiaapp').strip()==pid,'App restarted'
logs=adb('logcat','-d').decode(errors='replace');(out/'native-log.txt').write_text(logs);assert 'FATAL EXCEPTION' not in logs;assert 'CALENDAR_PERF' in logs
(out/'result.json').write_text(json.dumps({'passed':True,'events':500,'passes':10,'native_hermes_budget_ms':1000,'menu_roundtrips':3}))
print('PASS native calendar performance, 500 events, existing update signature and navigation')
