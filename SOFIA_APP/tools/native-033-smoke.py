"""Real production shell with isolated transport: MD acceptance, no personal account."""
import subprocess,time,re,json,xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime,timedelta
out=Path('dist/release033-evidence');out.mkdir(parents=True,exist_ok=True)
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
# Genuine Android notification from production scheduling, delivered while backgrounded.
adb('shell','input','keyevent','3');adb('shell','cmd','statusbar','expand-notifications')
wait('Notificacao nativa Sofia');snapshot('notification-while-backgrounded');tap('Notificacao nativa Sofia');wait('Fechar editor');snapshot('notification-opened-agenda');tap('Fechar editor');tap('Início')
# New requirement: selecting another month/day resets on leaving either calendar.
home_today=days(tree());tap('Próximo mês');assert days(tree())!=home_today
for label in ['Conversa','Páginas','Apps','Início']:tap(label)
assert days(tree())==home_today;snapshot('home-resets-today')
tap('Agenda');agenda_today=days(tree());tap('Próximo mês');tap('Próximo mês');assert days(tree())!=agenda_today
for label in ['Apps','Perfil','Páginas','Agenda']:tap(label)
assert days(tree())==agenda_today;snapshot('agenda-resets-today');calendar_stress('agenda');tap('Voltar para hoje')
# Compact priority widget defaults to all four items and filters one level at a time.
tap('Início');scroll_to('Filtrar níveis das tarefas do Início');tap('Filtrar níveis das tarefas do Início');tap('Importante');root=tree();assert find(root,'Projeto urgente') is not None and find(root,'Organizar casa') is None;snapshot('home-priority-important')
tap('Filtrar níveis das tarefas do Início');tap('Sem prioridade');assert find(tree(),'Ler livro') is not None;snapshot('home-priority-none');tap('Filtrar níveis das tarefas do Início');tap('Todas');snapshot('home-priority-all')
# Create a recurring event, visit next month, edit the same series and reopen its saved rule.
tap('Agenda');tap('Criar item na data selecionada');text('Título','Serie semanal QA');scroll_to('Repetir compromisso');tap('Repetir compromisso');tap('Toda semana');scroll_to('Salvar alterações');tap('Salvar alterações');wait('Serie semanal QA');snapshot('weekly-series-created')
tap('Próximo mês');root=tree();future_days=sorted(days(root));first=future_days[0];x,y,r,b=box(wait(first));adb('shell','input','tap',str((x+r)//2),str((y+b)//2))
# Inspect all dates until an occurrence is selected, without creating extra records.
found=False
for day in future_days:
 tap(day)
 if find(tree(),'Serie semanal QA') is not None:found=True;break
assert found,'Weekly occurrence missing in next month';snapshot('weekly-next-month');tap('Serie semanal QA');scroll_to('Repetir compromisso');tap('Repetir compromisso');tap('Todo mês');scroll_to('Salvar alterações');tap('Salvar alterações')
tap('Apps');tap('Agenda');wait('Serie semanal QA');tap('Serie semanal QA');scroll_to('Repetir compromisso');assert find(tree(),'Todo mês') is not None;snapshot('monthly-series-reopened');tap('Repetir compromisso');tap('Todo ano');scroll_to('Salvar alterações');tap('Salvar alterações');tap('Serie semanal QA');scroll_to('Repetir compromisso');assert find(tree(),'Todo ano') is not None;snapshot('yearly-series-reopened');tap('Fechar editor')
# Stable page reentry: compare first post-navigation frame against old/new full surfaces.
tap('Páginas');wait('Teste principal');snapshot('pages-reference');page=Image.open(io.BytesIO(adb('exec-out','screencap','-p'))).convert('RGB');crop=(0,100,720,1400);comparisons=[]
for attempt in range(3):
 tap('Conversa');old=Image.open(io.BytesIO(adb('exec-out','screencap','-p'))).convert('RGB');n=box(wait('menu-pages'));adb('shell','input','tap',str((n[0]+n[2])//2),str((n[1]+n[3])//2))
 for sample in range(3):
  raw=adb('exec-out','screencap','-p');frame=Image.open(io.BytesIO(raw)).convert('RGB');fractions=[]
  for reference in [old,page]:
   diff=ImageChops.difference(reference.crop(crop),frame.crop(crop));fractions.append(sum(max(p)>12 for p in diff.getdata())/(720*1300))
  comparisons.append(fractions);assert min(fractions)<.015,('partial page frame',attempt,sample,fractions);(out/f'page-switch-{attempt}-{sample}.png').write_bytes(raw);time.sleep(.3)
 wait('Teste principal')
(out/'page-switch-pixels.json').write_text(json.dumps(comparisons))
tap('Teste principal');snapshot('page-open');tap('Voltar');wait('Teste principal');snapshot('page-return')
# Full-page editor has an opaque, immediate surface; task editing remains usable.
tap('Apps');tap('Tarefas');wait('Editar tarefa Projeto urgente');tap('Editar tarefa Projeto urgente');wait('Título');snapshot('task-editor-opaque');back()
tap('Perfil');tap('Configurações do aplicativo');scroll_to('Notificações da agenda');snapshot('notification-settings')
logs=adb('logcat','-d','-s','ReactNativeJS:E','AndroidRuntime:E').decode();(out/'native-errors.txt').write_text(logs);assert 'FATAL EXCEPTION' not in logs and 'TypeError' not in logs,logs
(out/'result.json').write_text(json.dumps({'passed':True,'scenarios':checks,'synthetic_transport':True,'native_notification_delivered_in_background':True,'page_pixel_comparison':True},indent=2))
print('PASS 033: current calendar on reentry, home priority filter, recurring events, native notifications and page transitions')
