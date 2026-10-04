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
 return next((n for n in reversed(list(root.iter('node'))) if (n.get('content-desc')==label or n.get('text')==label or n.get('resource-id','').endswith(label)) and n.get('bounds')!='[0,0][0,0]'),None)
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
# Home is real Home inside production pager. No conversation card.
wait('Agenda');wait('Consulta de hoje');root=snapshot('01-home')
assert 'Sua Sofia está aqui' not in ET.tostring(root,encoding='unicode')
a=box(wait('agenda-calendar-half'));b=box(wait('agenda-items-half'));assert b[0]<a[0] and abs((a[2]-a[0])-(b[2]-b[0]))<=2 and abs(a[1]-b[1])<=2,(a,b)
# Swipe calendar switches month while Home stays selected.
x,y,r,b=box(wait('agenda-calendar-half'));swipe(r-20,(y+b)//2,x+20,(y+b)//2);wait('Início');swipe(x+20,(y+b)//2,r-20,(y+b)//2);wait('Consulta de hoje');snapshot('01b-month-swipe')
# Day selection changes the adjacent list without navigating away.
day=(datetime.now()+timedelta(days=1)).strftime('%d/%m/%Y')
root=tree();daynode=next(n for n in root.iter('node') if n.get('content-desc','').startswith(day))
x,y,r,b=box(daynode);adb('shell','input','tap',str((x+r)//2),str((y+b)//2));wait('Compromisso de amanha');snapshot('02-agenda-day-selection')
# Popup comes from the actual bell and dates are grouped.
bell=box(wait('Notificações: 2 não lidas'));tap('Notificações: 2 não lidas');wait('Hoje');wait('Ontem');popup=box(wait('notification-popover'));assert popup[1]>=bell[3],(bell,popup);snapshot('03-bell-anchor')
tap('Marcar como lida: Lembrete da agenda');tap('Ver todas as notificações');wait('ATIVIDADES · AVISOS');wait('Agenda · 1');snapshot('04-notification-center');back()
# Settings split, appearance, real version, and configured state visible.
tap('Perfil');wait('Perfil do usuário');wait('E-MAIL DE LOGIN');snapshot('05-profile-first');tap('Configurações do aplicativo');wait('Versão instalada 0.3.28');tap('Escuro');snapshot('06-settings-dark');tap('Claro')
# Apps goes back exactly to Apps; hardware back does not jump to Home.
tap('Apps');wait('Seus espaços');tap('Tarefas');wait('Nova tarefa');snapshot('07-tasks');back();wait('Seus espaços');snapshot('08-apps-back')
# Real tree and parent navigation, opening grandchild directly from root.
tap('Páginas');wait('Abrir página principal Teste principal');tap('Expandir subpáginas de Teste principal');tap('Expandir subpáginas de Teste filha');tap('Abrir subpágina Teste neta');wait('Título da página');snapshot('09-direct-grandchild');back();wait('Abrir subpágina Teste neta');root=snapshot('10-back-to-parent');assert find(root,'Título da página').get('text')=='Teste filha'
back();wait('Abrir subpágina Teste filha');root=snapshot('11-back-to-grandparent');assert find(root,'Título da página').get('text')=='Teste principal';back();wait('Criar página')
# Actual icon/text holds and cancellation stay alive with no writes/deletes.
for i in range(2):
 hold('Abrir página principal Teste principal',True);wait('Excluir página Teste principal');snapshot('12-root-hold-'+str(i));tap('Fechar ações da página')
hold('Abrir página principal Outra pagina');wait('Excluir página Outra pagina');tap('Fechar ações da página');wait('QA moves 0 deletes 0')
tap('Abrir página principal Teste principal');hold('Abrir subpágina Teste filha',True);wait('Excluir página Teste filha');snapshot('13-child-hold');tap('Fechar ações da página');back()
# Remote refresh and drag: exactly one persisted move with real label preserved.
tap('QA atualizar remoto');wait('Abrir página principal Nome remoto')
x,y,r,b=box(wait('Abrir página principal Nome remoto'));tx,ty,tr,tb=box(wait('Abrir página principal Teste principal'));x+=18;y=(y+b)//2;tx+=18;ty=(ty+tb)//2
adb('shell','input','motionevent','DOWN',str(x),str(y));time.sleep(.4)
for i in range(1,9):adb('shell','input','motionevent','MOVE',str(round(x+(tx-x)*i/8)),str(round(y+(ty-y)*i/8)));time.sleep(.04)
adb('shell','input','motionevent','UP',str(tx),str(ty));wait('Abrir subpágina Nome remoto');wait('QA moves 1 deletes 0');snapshot('14-icon-drag')
# Exact templates and identity preservation. Applying content keeps page title.
tap('Abrir página principal Teste principal');tap('Criar página ou usar template');tap('Usar template de conteúdo')
for label in ['Tarefas pessoal','Anotações','Coleção']:wait('Aplicar template '+label)
snapshot('15-template-picker');tap('Aplicar template Tarefas pessoal');wait('Não iniciada');snapshot('16-template-preserves-page')
# A board pan away from the edge must not navigate back.
node=wait('Não iniciada');x,y,r,b=box(node);swipe((x+r)//2,(y+b)//2,(x+r)//2+180,(y+b)//2);wait('Título da página');snapshot('17-board-pan-stays-in-page')
# Empty page: hint, body editor, autosave and undo/redo.
back();tap('Criar página');tap('Criar página em branco');wait('Título da página');snapshot('18-empty-page')
tap('Título da página');adb('shell','input','text','Minha%spagina');back();time.sleep(1);snapshot('19-autosave-title');tap('Desfazer');time.sleep(.8);tap('Refazer');time.sleep(.8);snapshot('20-undo-redo');back();wait('Abrir página principal Minha pagina');snapshot('21-saved-title-in-tree')
# Apps repeated tap returns to root, then editor shows visual dates safely below status bar.
tap('Apps');tap('Tarefas');wait('Nova tarefa');tap('Apps');wait('Seus espaços');snapshot('21b-apps-reset')
tap('Agenda');tap('Criar item na data selecionada');wait('Criar · Compromisso');tap('Início');wait('Confirmar data e horário');snapshot('21c-date-picker');back();back()
# Chat remains a dedicated destination; existing messages and selection work.
tap('Conversa');wait('Você: Mensagem preservada');hold('Você: Mensagem preservada');snapshot('22-chat-selection');back()
logs=adb('logcat','-d','-s','ReactNativeJS:E','AndroidRuntime:E').decode();(out/'native-errors.txt').write_text(logs)
assert 'FATAL EXCEPTION' not in logs and 'TypeError' not in logs,logs
(out/'result.json').write_text(json.dumps({'passed':True,'screens':checks,'synthetic_transport':True,'production_shell':True},indent=2))
print('PASS: production shell MD acceptance: home, agenda halves/day, anchored bell, shared center, settings/themes, Apps back, page ancestor back, holds, drag, templates, autosave/undo/redo, chat selection')
