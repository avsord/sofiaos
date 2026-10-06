"""Exercise the real Pages screen and RefreshControl with synthetic in-memory data."""
import subprocess,time,re,xml.etree.ElementTree as ET
from pathlib import Path
out=Path('dist/page-touch-evidence');out.mkdir(parents=True,exist_ok=True)
pkg='com.avsord.sofiaapp'
def adb(*a):return subprocess.check_output(['adb',*a],timeout=30)
def tree():
 adb('shell','uiautomator','dump','/sdcard/page-touch.xml')
 return ET.fromstring(adb('shell','cat','/sdcard/page-touch.xml'))
def wait(label):
 for _ in range(15):
  root=tree()
  n=next((n for n in root.iter('node') if n.get('content-desc')==label and n.get('bounds')!='[0,0][0,0]'),None)
  if n is not None:return n
  time.sleep(.3)
 raise AssertionError('Missing UI: '+label+' '+ET.tostring(root,encoding='unicode'))
def pos(label,icon=False):
 n=wait(label);x,y,r,b=map(int,re.findall(r'\d+',n.get('bounds')));return (x+15 if icon else (x+r)//2),(y+b)//2
pid=adb('shell','pidof',pkg).strip();assert pid

def stable(name,moves=0,check_counters=True):
 assert adb('shell','pidof',pkg).strip()==pid,'App restarted/crashed'
 root=tree();(out/(name+'.xml')).write_text(ET.tostring(root,encoding='unicode'))
 (out/(name+'.png')).write_bytes(adb('exec-out','screencap','-p'))
 if check_counters:wait('QA moves '+str(moves)+' deletes 0')
def tap(label):
 x,y=pos(label);adb('shell','input','tap',str(x),str(y));time.sleep(.3)
def hold(label,icon=False):
 x,y=pos(label,icon);adb('shell','input','swipe',str(x),str(y),str(x),str(y),'800');time.sleep(.4)
wait('Abrir página principal Teste principal')
for i in range(3):
 hold('Abrir página principal Teste principal',True)
 wait('Excluir página Teste principal');stable('root-icon-hold-'+str(i));tap('Fechar ações da página')
hold('Abrir página principal Outra pagina');wait('Excluir página Outra pagina');stable('root-text-hold');tap('Fechar ações da página')
tap('Abrir página principal Teste principal')
hold('Abrir subpágina Teste filha',True);wait('Excluir página Teste filha');stable('child-icon-hold');tap('Fechar ações da página')
# Cancel an active hold by backgrounding: must not open/delete/move or kill process.
x,y=pos('Abrir subpágina Teste filha',True)
adb('shell','input','motionevent','DOWN',str(x),str(y));time.sleep(.4)
adb('shell','input','keyevent','3');adb('shell','input','motionevent','UP',str(x),str(y))
adb('shell','am','start','-W','-n',pkg+'/.MainActivity');time.sleep(.5);stable('cancel-background')
# Return to root, apply a server-side revision, and wait for the actual Pages poll.
tap('Voltar')
tap('QA atualizar remoto')
wait('Abrir página principal Nome remoto');stable('remote-page-refresh')
# Drag the icon onto another page: a single hierarchy write, preserving title.
x,y=pos('Abrir página principal Nome remoto',True)
tx,ty=pos('Abrir página principal Teste principal',True)
adb('shell','input','motionevent','DOWN',str(x),str(y));time.sleep(.4)
for i in range(1,9):
 adb('shell','input','motionevent','MOVE',str(round(x+(tx-x)*i/8)),str(round(y+(ty-y)*i/8)));time.sleep(.06)
adb('shell','input','motionevent','UP',str(tx),str(ty));time.sleep(.5)
wait('Abrir subpágina Nome remoto');stable('icon-drag-one-write',1)
# Exact MD template names are visible in the real picker.
tap('Abrir página principal Teste principal');tap('Criar página ou usar template');tap('Usar template de conteúdo')
for name in ['Tarefas pessoal','Bloco de nota','Lista de reprodução']:wait('Aplicar template '+name)
stable('three-official-templates',1,False);tap('Fechar');stable('templates-dismissed',1)
logs=adb('logcat','-d','-s','ReactNativeJS:E','AndroidRuntime:E').decode();(out/'native-errors.txt').write_text(logs)
assert 'FATAL EXCEPTION' not in logs and 'TypeError' not in logs,logs
print('PASS: holds root/child, cancel, remote refresh, icon drag exactly once, exact templates, stable process')
