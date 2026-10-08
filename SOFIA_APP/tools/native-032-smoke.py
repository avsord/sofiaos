"""Real production shell with isolated transport: MD acceptance, no personal account."""
import subprocess,time,re,json,xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime,timedelta
out=Path('dist/release032-evidence');out.mkdir(parents=True,exist_ok=True)
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

from PIL import Image,ImageChops
import io,sys

def fail_hook(kind,value,tb):
 try:
  (out/'failure.png').write_bytes(adb('exec-out','screencap','-p'))
  (out/'failure.xml').write_bytes(adb('shell','cat','/sdcard/full.xml'))
  (out/'native-errors.txt').write_bytes(adb('logcat','-d','-s','ReactNativeJS:E','AndroidRuntime:E'))
 except Exception:pass
 sys.__excepthook__(kind,value,tb)
sys.excepthook=fail_hook

def tab_is(name):
 root=tree();node=find(root,'menu-'+name)
 assert node is not None and node.get('selected')=='true',(name,ET.tostring(root,encoding='unicode'))
 return root

def days(root):
 return {n.get('content-desc')[:10] for n in root.iter('node') if re.match(r'\d{2}/\d{2}/\d{4}',n.get('content-desc',''))}

def text(label,value):
 tap(label);adb('shell','input','text',value.replace(' ','%s'));back()

def scroll_to(label):
 for _ in range(7):
  node=find(tree(),label)
  if node is not None:return node
  swipe(640,1240,640,550,250)
 return wait(label)

def calendar_stress(tab):
 node=wait('calendar-month-swipe');x,y,r,b=box(node)
 # Both short fast swipes and longer diagonals must stay in the same tab.
 for index,(duration,dy) in enumerate([(80,0),(100,8),(200,0),(90,-10),(400,12),(100,0)]):
  previous=days(tree());sy=y+min(150,(b-y)//2);left=x+28;right=r-28
  sx,ex=(right,left) if index%2==0 else (left,right)
  swipe(sx,sy,ex,sy+dy,duration);time.sleep(.25)
  root=tab_is(tab);assert days(root) and days(root)!=previous,(tab,index,'month did not change')
 snapshot(tab+'-calendar-fast-diagonal')
 # Vertical scrolling beginning on a date is still allowed, with no tab change.
 swipe((x+r)//2,min(b-30,900),(x+r)//2,max(y+30,250),350);tab_is(tab)
 swipe(620,500,620,1300,300)
 snapshot(tab+'-calendar-vertical')

adb('shell','settings','put','secure','show_ime_with_hard_keyboard','1')
wait('Início');pid=adb('shell','pidof',pkg).strip();assert pid
# Both calendars retain their selected month through tab changes and explicit navigation.
tap('Próximo mês');home_days=days(tree());assert home_days
for label in ['Conversa','Páginas','Apps','Início']:tap(label)
assert days(tree())==home_days
snapshot('home-month-retained');tap('Voltar ao dia de hoje');tap('Abrir agenda completa');tap('Próximo mês');tap('Próximo mês');agenda_days=days(tree())
for label in ['Apps','Perfil','Páginas','Agenda']:tap(label)
assert days(tree())==agenda_days
snapshot('agenda-month-retained');calendar_stress('agenda');tap('Voltar para hoje');assert days(tree())!=agenda_days
# Isolated slow transport ensures navigation does not blank the task list while fetching.
tap('QA preparar tarefas');tap('Apps');assert find(tree(),'Conexões') is None;tap('Tarefas');wait('Editar tarefa Projeto urgente');wait('Editar tarefa Ler livro')
snapshot('tasks-priority-symbols')
record=subprocess.Popen(['adb','shell','screenrecord','--time-limit','180','/sdcard/tasks032.mp4'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
row=box(wait('task-row-filter0'));reference=Image.open(io.BytesIO(adb('exec-out','screencap','-p'))).convert('RGB');metrics=[]
for attempt in range(3):
 tap('Voltar aos apps');button=box(wait('Tarefas'));adb('shell','input','tap',str((button[0]+button[2])//2),str((button[1]+button[3])//2))
 # No UI dump/wait before this first frame: test the cached list immediately after navigation.
 for sample in range(3):
  raw=adb('exec-out','screencap','-p');(out/f'task-return-{attempt}-{sample}.png').write_bytes(raw);frame=Image.open(io.BytesIO(raw)).convert('RGB')
  diff=ImageChops.difference(reference.crop(tuple(row)),frame.crop(tuple(row)));fraction=sum(max(p)>12 for p in diff.getdata())/((row[2]-row[0])*(row[3]-row[1]));metrics.append(fraction)
  assert fraction<.015,('task row flicker',attempt,sample,fraction)
  time.sleep(.8)
 assert box(wait('task-row-filter0'))==row
(out/'task-return-geometry.json').write_text(json.dumps({'passed':True,'changed_fractions':metrics,'slow_transport_ms':1600}))
# Combine category and priority; clearing filters restores all four records.
tap('Filtrar por área');tap('Trabalho');root=tree();assert find(root,'Editar tarefa Projeto urgente') is not None and find(root,'Editar tarefa Organizar casa') is None
snapshot('tasks-area-filter');tap('Filtrar por prioridade');tap('Importante');root=tree();assert find(root,'Editar tarefa Projeto urgente') is not None and find(root,'Editar tarefa Estudar curso') is None
snapshot('tasks-combined-filter');tap('Filtrar por área');tap('Todas as áreas')
for priority,title in [('Média','Estudar curso'),('Leve','Organizar casa'),('Sem prioridade','Ler livro')]:
 tap('Filtrar por prioridade');tap(priority);root=tree();assert find(root,'Editar tarefa '+title) is not None
 assert sum(n.get('content-desc','').startswith('Editar tarefa ') for n in root.iter('node'))==1
 snapshot('priority-'+priority)
tap('Filtrar por prioridade');tap('Todas as prioridades')
# Clear Area completely, wait, type replacement, save and reopen without restoring the default.
tap('Editar tarefa Projeto urgente');tap('Área');adb('shell','input','keyevent','123')
for _ in range(14):adb('shell','input','keyevent','67')
time.sleep(.8);assert wait('Área').get('text','') in ['', 'Ex.: Trabalho']
snapshot('area-stays-empty');adb('shell','input','text','Estudos');back();assert wait('Área').get('text')=='Estudos'
scroll_to('Salvar tarefa');tap('Salvar tarefa');tap('Editar tarefa Projeto urgente');assert wait('Área').get('text')=='Estudos';snapshot('area-reopened');back()
# New tasks inherit active filters and remain visible immediately after save.
tap('Filtrar por área');tap('Estudos');tap('Filtrar por prioridade');tap('Importante');tap('Nova tarefa');text('Título','Nova tarefa filtrada');text('Descrição','Descricao preservada');assert wait('Área').get('text')=='Estudos';scroll_to('Salvar tarefa');tap('Salvar tarefa');wait('Editar tarefa Nova tarefa filtrada');snapshot('new-task-in-filter');tap('Editar tarefa Nova tarefa filtrada');assert wait('Área').get('text')=='Estudos';assert wait('Descrição').get('text')=='Descricao preservada';snapshot('new-task-reopened');back();back()
# Connections moved out of Apps and into application settings, preserving official action.
assert find(tree(),'Conexões') is None;tap('Perfil');tap('Configurações do aplicativo');scroll_to('Conexões');tap('Conexões');scroll_to('WhatsApp Business');wait('WhatsApp Business');scroll_to('Abrir conexão oficial');snapshot('connections-in-settings')
record.terminate();record.wait(timeout=10);adb('pull','/sdcard/tasks032.mp4',str(out/'tasks032.mp4'))
logs=adb('logcat','-d','-s','ReactNativeJS:E','AndroidRuntime:E').decode();(out/'native-errors.txt').write_text(logs);assert 'FATAL EXCEPTION' not in logs and 'TypeError' not in logs,logs
(out/'result.json').write_text(json.dumps({'passed':True,'scenarios':checks,'synthetic_transport':True,'task_return_pixel_comparison':True},indent=2))
print('PASS 032: retained calendar, stable task list, editable area, combined filters and settings connections')
