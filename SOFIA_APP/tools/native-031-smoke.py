"""Real production shell with isolated transport: MD acceptance, no personal account."""
import subprocess,time,re,json,xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime,timedelta
out=Path('dist/release031-evidence');out.mkdir(parents=True,exist_ok=True)
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
record=subprocess.Popen(['adb','shell','screenrecord','--time-limit','180','/sdcard/release031.mp4'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
calendar_stress('home')
# A swipe that begins OUTSIDE the calendar still changes menus after all releases.
swipe(640,1150,70,1150,140);tab_is('chat');tap('Agenda');wait('Sua agenda');calendar_stress('agenda')
tap('Voltar para hoje')
# A long press on a date must still open the editor, with its description near the title.
root=tree();day=next(n for n in root.iter('node') if re.match(r'\d{2}/\d{2}/\d{4}$',n.get('content-desc','')))
x,y,r,b=box(day);swipe((x+r)//2,(y+b)//2,(x+r)//2,(y+b)//2,800)
wait('Criar · Compromisso');wait('Descrição');snapshot('event-description');back()
# Parent row position and pixels must match both while revealed and after back.
tap('Páginas');tap('Abrir página principal Teste principal');wait('Abrir subpágina Teste filha')
def return_check(child,title,stem):
 before_box=box(wait('Abrir subpágina '+child));before=Image.open(io.BytesIO(adb('exec-out','screencap','-p'))).convert('RGB')
 tap('Abrir subpágina '+child);wait('Título da página');time.sleep(.3)
 adb('shell','input','motionevent','DOWN','14','1200')
 for x in [70,160,270,390,510,640]:
  adb('shell','input','motionevent','MOVE',str(x),'1200');time.sleep(.08)
 time.sleep(.35)
 held_bytes=adb('exec-out','screencap','-p');(out/(stem+'-during-back.png')).write_bytes(held_bytes)
 held=Image.open(io.BytesIO(held_bytes)).convert('RGB')
 crop=(before_box[0],before_box[1],min(before_box[2],500),before_box[3])
 diff=ImageChops.difference(before.crop(crop),held.crop(crop))
 pixels=list(diff.getdata());changed=sum(max(p)>12 for p in pixels)/max(1,len(pixels))
 adb('shell','input','motionevent','UP','640','1200')
 wait('Abrir subpágina '+child);after_box=box(wait('Abrir subpágina '+child));root=snapshot(stem+'-after-back')
 assert find(root,'Título da página').get('text')==title
 assert max(abs(a-b) for a,b in zip(before_box,after_box))<=2,(before_box,after_box)
 assert changed<.015,(stem,'parent preview differs from actual row',changed)
 (out/(stem+'-geometry.json')).write_text(json.dumps({'before':before_box,'after':after_box,'preview_changed_fraction':changed,'passed':True}))
 # Hardware back also preserves row bounds.
 tap('Abrir subpágina '+child);wait('Título da página');back();wait('Abrir subpágina '+child)
 assert box(wait('Abrir subpágina '+child))==before_box
return_check('Teste filha','Teste principal','short-parent')
back();tap('Abrir página principal Pagina longa');scroll_to('Abrir subpágina Filha da pagina longa')
return_check('Filha da pagina longa','Pagina longa','scrolled-parent')
back()
# Description uses the existing persisted task field, including multiple lines.
tap('Apps');tap('Tarefas');tap('Nova tarefa');text('Título','Tarefa QA descricao')
tap('Descrição');adb('shell','input','text','Primeira%slinha');adb('shell','input','keyevent','66');adb('shell','input','text','Segunda%slinha');back()
snapshot('task-description-new');scroll_to('Salvar tarefa');tap('Salvar tarefa');wait('Tarefa QA descricao');tap('Tarefa QA descricao')
assert wait('Descrição').get('text')=='Primeira linha\nSegunda linha'
snapshot('task-description-reopened');back();back()
# Board card descriptions survive page autosave and reopening.
tap('Páginas');tap('Criar página');tap('Criar página em branco');text('Título da página','Quadro QA')
tap('Criar página ou usar template');tap('Usar template de conteúdo');tap('Aplicar template Quadro de tarefas')
tap('Nova tarefa em Não iniciada');text('Título do item','Cartao QA');text('Descrição de Cartao QA','Detalhe do cartao')
snapshot('board-description-written');back();wait('Abrir página principal Quadro QA');tap('Abrir página principal Quadro QA')
assert wait('Descrição de Cartao QA').get('text')=='Detalhe do cartao'
snapshot('board-description-reopened')
record.terminate();record.wait(timeout=10);adb('pull','/sdcard/release031.mp4',str(out/'release031.mp4'))
logs=adb('logcat','-d','-s','ReactNativeJS:E','AndroidRuntime:E').decode();(out/'native-errors.txt').write_text(logs)
assert 'FATAL EXCEPTION' not in logs and 'TypeError' not in logs,logs
(out/'result.json').write_text(json.dumps({'passed':True,'scenarios':checks,'synthetic_transport':True,'native_calendar_guard':True,'parent_preview_pixel_comparison':True},indent=2))
print('PASS 031: fast calendar swipes, vertical/date interactions, parent geometry and persisted descriptions')
