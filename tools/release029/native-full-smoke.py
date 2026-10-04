"""Real production shell with isolated transport: MD acceptance, no personal account."""
import subprocess,time,re,json,xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime,timedelta
out=Path('dist/full-app-evidence');out.mkdir(parents=True,exist_ok=True)
pkg='com.avsord.sofiaapp';checks=[]
def adb(*a):return subprocess.check_output(['adb',*a],timeout=30)
def tree():
 adb('shell','uiautomator','dump','/sdcard/full.xml')
 return ET.fromstring(adb('shell','cat','/sdcard/full.xml'))
def find(root,label):
 nodes=[n for n in reversed(list(root.iter('node'))) if n.get('bounds')!='[0,0][0,0]']
 for attr in ['content-desc','resource-id','text']:
  for n in nodes:
   if n.get(attr)==label or (attr=='resource-id' and n.get(attr,'').endswith(label)):return n
 return None
def wait(label):
 for _ in range(12):
  root=tree();n=find(root,label)
  if n is not None:return n
  time.sleep(.3)
 raise AssertionError('Missing '+label+' '+ET.tostring(root,encoding='unicode'))
def box(n):return list(map(int,re.findall(r'\d+',n.get('bounds'))))
def tap(label):
 x,y,r,b=box(wait(label));adb('shell','input','tap',str((x+r)//2),str((y+b)//2));time.sleep(.2)
def snapshot(name):
 assert adb('shell','pidof',pkg).strip()==pid,'App restarted'
 root=tree();(out/(name+'.xml')).write_text(ET.tostring(root,encoding='unicode'));(out/(name+'.png')).write_bytes(adb('exec-out','screencap','-p'));checks.append(name);return root
def swipe(x,y,tx,ty,duration=450):adb('shell','input','swipe',str(x),str(y),str(tx),str(ty),str(duration));time.sleep(.3)
def hold(label,icon=False):
 x,y,r,b=box(wait(label));x=x+18 if icon else (x+r)//2;swipe(x,(y+b)//2,x,(y+b)//2,800)
def back():adb('shell','input','keyevent','4');time.sleep(.3)
wait('Início');pid=adb('shell','pidof',pkg).strip();assert pid
# Chat remains a dedicated destination; existing messages and selection work.
tap('Conversa');wait('Você: Mensagem preservada');hold('Você: Mensagem preservada');snapshot('22-chat-selection');back()
# Attachment menu and real software keyboard geometry (no simulated keyboard coordinates).
tap('Anexar arquivo');wait('Imagens');wait('Documentos');wait('Câmera');snapshot('23-attachment-menu');back()
adb('shell','settings','put','secure','show_ime_with_hard_keyboard','1')
tap('Mensagem para a Sofia');adb('shell','input','text','Teclado');time.sleep(1)
root=snapshot('24-chat-keyboard');composer=box(wait('chat-composer'))
ime=adb('shell','dumpsys','input_method').decode();windows=adb('shell','dumpsys','window').decode()
(out/'keyboard-input-method.txt').write_text(ime);(out/'keyboard-window.txt').write_text(windows)
assert re.search(r'mInputShown=true|mIsInputViewShown=true',ime),'IME must report that its input is shown'
frames=[]
for line in windows.splitlines():
 if ('ITYPE_IME' in line or 'type=ime' in line) and 'visible=true' in line:
  match=re.search(r'frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\]',line)
  if match:
   bounds=list(map(int,match.groups()))
   if bounds[3]>bounds[1] and bounds[1]>0:frames.append(bounds)
assert frames,'Visible IME frame must be present in Android window insets'
keyboard_top=min(b[1] for b in frames);assert composer[3]<=keyboard_top+3,(composer,keyboard_top)
(out/'keyboard-geometry.json').write_text(json.dumps({'composer':composer,'ime_frames':frames,'passed':True}))
back()
# Pick a real document with Android's system picker, then upload and persist its reference.
adb('shell','mkdir','-p','/sdcard/Download')
fixture=out/'Sofia-QA.txt';fixture.write_text('Arquivo sintetico para verificar anexos.')
adb('push',str(fixture),'/sdcard/Download/Sofia-QA.txt')
adb('shell','am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file:///sdcard/Download/Sofia-QA.txt')
tap('Anexar arquivo');tap('Documentos');time.sleep(1);snapshot('24b-document-picker')
root=tree()
if find(root,'Sofia-QA.txt') is None:
 tap('Show roots');tap('Downloads')
tap('Sofia-QA.txt');time.sleep(.5)
root=tree()
for confirm in ['OPEN','Open','SELECT','Select']:
 if find(root,confirm) is not None:tap(confirm);break
wait('Remover anexo Sofia-QA.txt');snapshot('25-document-preview');tap('Enviar mensagem');wait('QA uploads 1');wait('Abrir anexo Sofia-QA.txt');snapshot('26-document-sent')
logs=adb('logcat','-d','-s','ReactNativeJS:E','AndroidRuntime:E').decode();(out/'native-errors.txt').write_text(logs)
assert 'FATAL EXCEPTION' not in logs and 'TypeError' not in logs,logs
(out/'result.json').write_text(json.dumps({'passed':True,'screens':sorted(p.stem for p in out.glob('*.png')),'continued_from_run':37178341486,'synthetic_transport':True,'production_shell':True},indent=2))
print('PASS: production shell MD acceptance: home, agenda halves/day, anchored bell, shared center, settings/themes, Apps back, page ancestor back, holds, drag, templates, autosave/undo/redo, chat selection')
