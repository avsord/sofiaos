import subprocess,time,re,json,xml.etree.ElementTree as ET
from pathlib import Path
out=Path('dist/performance-evidence');out.mkdir(parents=True,exist_ok=True)
def adb(*a):return subprocess.check_output(['adb',*a],timeout=30)
def tree():
 adb('shell','uiautomator','dump','/sdcard/performance.xml');return ET.fromstring(adb('shell','cat','/sdcard/performance.xml'))
def find(root,label):
 for n in reversed(list(root.iter('node'))):
  if n.get('bounds')!='[0,0][0,0]' and (n.get('text')==label or n.get('content-desc')==label or n.get('resource-id','').endswith(label)):return n
 return None
def wait(label):
 for _ in range(15):
  r=tree();n=find(r,label)
  if n is not None:return n
  time.sleep(.25)
 raise AssertionError('Missing '+label+ET.tostring(r,encoding='unicode'))
def tap(label):
 n=wait(label);a,b,c,d=map(int,re.findall(r'\d+',n.get('bounds')));adb('shell','input','tap',str((a+c)//2),str((b+d)//2))
def dismiss_keyboard():
 # BACK closes a sheet when the IME is already hidden. Never send it blindly.
 state=adb('shell','dumpsys','input_method').decode(errors='replace')
 if re.search(r'mInputShown=true|isInputViewShown=true',state):
  adb('shell','input','keyevent','BACK');time.sleep(.4)
def scroll_to(label):
 for _ in range(6):
  r=tree()
  if find(r,label) is not None:return
  assert find(r,'Descrição') is not None,'Task editor unexpectedly closed'
  adb('shell','input','swipe','360','1200','360','550','400');time.sleep(.3)
 raise AssertionError('Task editor cannot reveal '+label)
def screenshot(name):
 r=tree();(out/(name+'.xml')).write_text(ET.tostring(r,encoding='unicode'));(out/(name+'.png')).write_bytes(adb('exec-out','screencap','-p'));return r
wait('Olá, Teste.');r=screenshot('home-500');text=ET.tostring(r,encoding='unicode');assert 'PERF_PASS' in text and 'PERF_FAIL' not in text,text
wait('QA preload complete');print('PASS expired local session retained and Agenda/Apps requested before leaving Home',flush=True)
pid=adb('shell','pidof','com.avsord.sofiaapp').strip()
adb('shell','input','swipe','360','1200','360','450','400');time.sleep(.4)
tap('Filtrar níveis das tarefas do Início');wait('Nível das tarefas');screenshot('home-task-filter');tap('Todas');time.sleep(.3)
# Home row opens details; only the separate checkbox concludes.
tap('Abrir tarefa Projeto urgente');wait('Detalhes da tarefa');wait('Descricao da tarefa QA');screenshot('home-task-details')
tap('Editar tarefa');wait('Descrição');screenshot('home-task-edit');tap('Descrição');adb('shell','input','keyevent','123');tap('Negrito na descrição');assert wait('Negrito na descrição').get('selected')=='true','Bold toolbar tap was intercepted';tap('Descrição');adb('shell','input','keyevent','123');adb('shell','input','text','%satualizada');time.sleep(.3);screenshot('home-task-after-typing');dismiss_keyboard();screenshot('home-task-keyboard-dismissed')
scroll_to('Salvar tarefa');tap('Salvar tarefa');wait('Detalhes da tarefa');wait('Descricao da tarefa QA atualizada');screenshot('home-task-saved');tap('Fechar detalhes da tarefa');time.sleep(.4);qa_task=json.loads(next(n.get('content-desc')[9:] for n in tree().iter('node') if n.get('content-desc','').startswith('QA tasks ')));assert any(m.get('bold') for t in qa_task if t['id']=='filter0' for m in t['document']['marks']),'Bold description was not persisted';tap('Abrir tarefa Projeto urgente');wait('Detalhes da tarefa');tap('Levar para conversa');wait('Tarefa em contexto');wait('Projeto urgente');tap('Mensagem para a Sofia');adb('shell','input','text','ContextoQA');tap('Enviar mensagem');time.sleep(1);wait('QA task context filter0');tap('Remover tarefa da conversa');adb('shell','input','keyevent','BACK');tap('Início');assert wait('menu-home').get('selected')=='true','Context return did not reach Home';time.sleep(.4)
wait('Concluir Projeto urgente');tap('Concluir Projeto urgente');time.sleep(.6);assert find(tree(),'Abrir tarefa Projeto urgente') is None,'Row tap must not complete; checkbox must complete'
adb('shell','input','swipe','360','400','360','1200','400');time.sleep(.4)

for _ in range(2):adb('shell','input','swipe','705','400','705','1300','500');time.sleep(.4)
wait('Olá, Teste.');print('PASS rich task format persists and selected task reaches Sofia',flush=True)
def calendar_bounds(root):
 rows=[n.get('bounds') for n in root.iter('node') if n.get('resource-id','').endswith('agenda-split-row')]
 assert rows,'Calendar geometry absent'
 return rows[0]
baseline=calendar_bounds(r)
def refresh_count():return adb('logcat','-d','-s','ReactNativeJS:I').decode(errors='replace').count('SOFIA_HOME_PULL_REFRESH')
# Consume vertical drags only in the appointment list, even at both edges.
list_node=wait('agenda-day-items');lx,ly,lr,lb=map(int,re.findall(r'\d+',list_node.get('bounds')))
sx=(lx+lr)//2;sy=lb-20;ey=ly+20;before_refresh=refresh_count()
for direction in ('bottom','top'):
 for duration in (80,350,80,350):
  a,b=(sy,ey) if direction=='bottom' else (ey,sy)
  adb('shell','input','swipe',str(sx),str(a),str(sx),str(b),str(duration));time.sleep(.25)
  assert calendar_bounds(tree())==baseline,'Appointment list moved Home at '+direction
  assert refresh_count()==before_refresh,'Appointment scroll triggered Home refresh'
screenshot('appointment-edges-isolated');print('PASS appointment list edges stay inside calendar',flush=True)
# A moderate pull used to exceed Android's default. It must no longer refresh.
before_refresh=refresh_count();adb('shell','input','swipe','705','300','705','550','450');time.sleep(.8)
assert refresh_count()==before_refresh,'Moderate Home pull refreshed accidentally'
# A deliberate long pull still refreshes; regular outside scrolling remains usable.
adb('shell','input','swipe','705','300','705','850','650');time.sleep(1)
assert refresh_count()>before_refresh,'Deliberate Home pull failed to refresh'
wait('Olá, Teste.');screenshot('deliberate-home-refresh');print('PASS moderate pull ignored and deliberate pull refreshes',flush=True)
for i in range(6):
 tap('Próximo mês');time.sleep(.3);assert calendar_bounds(tree())==baseline,'Home calendar changed height'
tap('Voltar ao dia de hoje');tap('Próximo mês');wait('Compromisso proximo mes QA');screenshot('month-selection-updates-items');tap('Voltar ao dia de hoje')
# Short fast and short slow releases must pick exactly the adjacent menu.
for duration in (80,450):
 adb('shell','input','swipe','500','160','440','160',str(duration));time.sleep(.7)
 wait('Sofia');assert wait('menu-chat').get('selected')=='true','Short swipe failed to select Chat'
 adb('shell','input','swipe','400','160','460','160',str(duration));time.sleep(.7)
 wait('Olá, Teste.');assert wait('menu-home').get('selected')=='true','Short reverse swipe failed'
screenshot('short-fast-and-slow-menus');print('PASS short fast and slow menu swipes',flush=True)
# System back and edge gestures are inert at all six menu roots.
for label,menu in (('Conversa','chat'),('Páginas','pages'),('Agenda','agenda'),('Apps','apps'),('Perfil','profile'),('Início','home')):
 tap(label);time.sleep(.25)
 for start,end in ((3,180),(717,540)):
  adb('shell','input','swipe',str(start),'900',str(end),'900','250');time.sleep(.2)
 adb('shell','input','keyevent','BACK');time.sleep(.3)
 assert wait('menu-'+menu).get('selected')=='true','System back changed menu '+menu
 assert adb('shell','pidof','com.avsord.sofiaapp').strip()==pid,'System back exited app'
screenshot('menu-system-back-disabled');print('PASS system back and edge gestures are inert in six menus',flush=True)

def calendar_swipes(menu):
 n=wait('calendar-month-swipe');x,y,r,b=map(int,re.findall(r'\d+',n.get('bounds')))
 # Reserve both calendar halves, the header, and diagonal/fast drags.
 for fraction,duration,dy in ((.3,70,0),(.75,90,8),(.7,400,0)):
  sx=int(x+(r-x)*fraction);sy=y+min(125,(b-y)//2);ex=max(x+10,sx-100)
  adb('shell','input','swipe',str(sx),str(sy),str(ex),str(sy+dy),str(duration));time.sleep(.4)
  assert wait('menu-'+menu).get('selected')=='true','Calendar swipe changed menu'
 screenshot(menu+'-calendar-reserved')
calendar_swipes('home');tap('Voltar ao dia de hoje')
tap('Agenda');wait('Sua agenda');calendar_swipes('agenda');tap('Voltar para hoje');tap('Início');wait('Olá, Teste.')
adb('shell','input','swipe','500','160','440','160','450');time.sleep(1)
wait('Sofia');screenshot('short-menu-swipe');tap('Início');wait('Olá, Teste.')
tap('Conversa');tap('Mensagem para a Sofia');adb('shell','input','text','Teste%srolagem');tap('Enviar mensagem');time.sleep(1.5);wait('FIM DA RESPOSTA QA');time.sleep(3);wait('FIM DA RESPOSTA QA');screenshot('chat-growing-reply');adb('shell','input','keyevent','BACK');time.sleep(.4)
for _ in range(4):adb('shell','input','swipe','360','430','360','1120','300');time.sleep(.2)
wait('Descer para a última mensagem');screenshot('chat-jump-button');tap('Descer para a última mensagem');time.sleep(1);wait('FIM DA RESPOSTA QA');screenshot('chat-jump-bottom');tap('Início');wait('Olá, Teste.')
tap('Notificações: 2 não lidas');time.sleep(.35);screenshot('bell-origin');tap('Fechar notificações')

for i in range(3):
 tap('Agenda');wait('Sua agenda');tap('Próximo mês');tap('Mês anterior');screenshot('agenda-'+str(i));tap('Início');wait('Olá, Teste.')
 assert adb('shell','pidof','com.avsord.sofiaapp').strip()==pid,'App restarted'
# Actual production screens with synthetic transport: new layout/filter/note flows.
tap('Perfil');tap('Configurações do aplicativo');tap('Horário');wait('Claro a partir de');wait('Escuro a partir de');screenshot('schedule-settings')
tap('Início');tap('Apps');tap('Biblioteca');tap('Criar registro')
r=tree();new=find(r,'Nova área da Biblioteca');assert new is not None
# New area is last, after existing built-in types.
last_y=int(re.findall(r'\d+',new.get('bounds'))[1]);assert last_y>int(re.findall(r'\d+',find(r,'Criar Filme').get('bounds'))[1])
screenshot('library-plus');tap('Fechar tipos da Biblioteca');tap('Tipo de registro');tap('Filme');time.sleep(2)
tap('Filtros da Biblioteca');tap('Filtrar por estrelas');tap('★★★★★');tap('Ver registros');wait('Filme de Drama');r=screenshot('film-five-stars');assert find(r,'Filme de Acao') is None
# Persist a rich note and reopen the same entity through Apps/Notas.
tap('Voltar aos apps');tap('Notas');tap('Criar registro');tap('Criar Anotação');tap('Título da nota');adb('shell','input','text','NotaQA036')
tap('Conteúdo da nota');adb('shell','input','text','TextoQA036');tap('Negrito');adb('shell','input','text','Bold');tap('Fechar teclado');tap('Salvar');wait('NotaQA036');tap('NotaQA036');wait('Título da nota');wait('Conteúdo da nota');screenshot('rich-note-reopened');tap('Voltar das notas');tap('Início')
# Capsules uses the same production widget, editor and scheduled native notifications.
tap('Apps');tap('Cápsulas');wait('Tomei Capsula QA às 00:01');
qa_node=next(n for n in tree().iter('node') if n.get('content-desc','').startswith('QA notifications '))
qa=json.loads(qa_node.get('content-desc')[len('QA notifications '):]);assert isinstance(qa.get('exact'),bool),'Native alarm permission bridge absent'
alarms=[n for n in qa['alarms'] if n['identifier'].startswith('sofia-capsule:') and n['content']['data'].get('planId')=='capsuleqa' and n['content']['data'].get('time')=='23:59']
assert len(qa['alarms'])<=256,'Shared notification budget exceeded'
assert any('aviso 30 min antes' in n['content']['body'] for n in alarms) and any('Está no horário' in n['content']['body'] for n in alarms),'Capsule paired reminders not scheduled'
print('PASS native capsule alarm permission bridge and both scheduled reminders',flush=True)
screenshot('capsules-today')
tap('Tomei Capsula QA às 00:01');time.sleep(.4);assert find(tree(),'Tomei Capsula QA às 00:01') is None
wait('Tomei Capsula QA às 23:59');tap('Cápsulas · Histórico');wait('Capsula QA');screenshot('capsules-history-preserved')
tap('Cápsulas · Rotinas');tap('Editar cápsula Capsula QA');wait('Nome');wait('Dose conforme sua orientação');
for _ in range(5):
 if find(tree(),'Lembrar quantos minutos antes? (0 = só no horário)') is not None:break
 adb('shell','input','swipe','360','1150','360','450','400');time.sleep(.3)
wait('Lembrar quantos minutos antes? (0 = só no horário)');screenshot('capsules-two-reminders-editor');tap('Fechar cadastro de cápsula')
tap('Nova cápsula');tap('Nome');adb('shell','input','text','NovaCapsulaQA');tap('Dose conforme sua orientação');adb('shell','input','text','1');adb('shell','input','keyevent','BACK')
for _ in range(5):
 if find(tree(),'Horário da dose 1') is not None:break
 adb('shell','input','swipe','360','1150','360','450','400');time.sleep(.3)
tap('Horário da dose 1');wait('Hora · 24h');tap('Hora 10');tap('Minuto 1');tap('Confirmar horário')
for _ in range(5):
 if find(tree(),'Repetir') is not None:break
 adb('shell','input','swipe','360','1150','360','450','400');time.sleep(.3)
tap('Repetir');tap('Todo mês')
for _ in range(5):
 if find(tree(),'Salvar cápsula') is not None:break
 adb('shell','input','swipe','360','1150','360','450','400');time.sleep(.3)
tap('Salvar cápsula');time.sleep(.8)
wait('Editar cápsula NovaCapsulaQA');wait('1 · 10:01');wait('Todo mês no dia '+str(int(adb('shell','date','+%d').strip()))+' · Aviso no horário');screenshot('capsules-routine-created');tap('Voltar aos apps');tap('Início')
print('PASS capsule daily dose, preserved history, two-reminder editor and new routine',flush=True)
tap('Apps');tap('Listas');wait('Compra preservada');wait('Descrição de compra preservada');tap('Filtros das listas');wait('Filtrar área das listas');wait('Filtrar estado das listas');screenshot('shopping-library-style-filters');tap('Ver registros');tap('Criar registro');wait('Novo registro nas listas');wait('Criar Item de compra');screenshot('shopping-library-style-create');adb('shell','input','keyevent','BACK');tap('Voltar aos apps');tap('Início')
print('PASS shopping shared Library layout, Everything, filters and plus menu',flush=True)
# Direct entry from Pages tree returns to Pages menu; nested entry returns to the parent.
tap('Páginas');wait('Abrir página principal Teste principal');tap('Expandir subpáginas de Teste principal');tap('Expandir subpáginas de Teste filha');tap('Abrir subpágina Teste neta');wait('Título da página');adb('shell','input','keyevent','BACK');wait('Abrir página principal Teste principal');assert find(tree(),'Título da página') is None,'Direct subpage entry returned to a parent editor'
tap('Abrir página principal Teste principal');tap('Abrir subpágina Teste filha');wait('Título da página');adb('shell','input','keyevent','BACK');assert wait('Título da página').get('text')=='Teste principal','Nested entry did not return to its actual parent';adb('shell','input','keyevent','BACK');tap('Início');wait('Olá, Teste.')
# Long press today's date on the Home calendar creates an appointment on that date.
for _ in range(3):
 if find(tree(),'agenda-split-row') is not None:break
 adb('shell','input','swipe','360','400','360','1200','250');time.sleep(.4)
day=adb('shell','date','+%Y-%m-%d').decode().strip();node=wait('agenda-day-'+day);x,y,z,w=map(int,re.findall(r'\d+',node.get('bounds')));adb('shell','input','swipe',str((x+z)//2),str((y+w)//2),str((x+z)//2),str((y+w)//2),'800');wait('Criar · Compromisso');tap('Título');adb('shell','input','text','CompromissoInicioQA');dismiss_keyboard();wait('Prioridade');screenshot('home-date-hold-create');tap('Prioridade');tap('Importante');screenshot('agenda-priority-editor');
for _ in range(6):
 if find(tree(),'Salvar alterações') is not None:break
 adb('shell','input','swipe','360','1200','360','500','400');time.sleep(.3)
tap('Salvar alterações');assert wait('menu-home').get('selected')=='true','Saving Home commitment navigated away from Home';wait('Olá, Teste.')
created=json.loads(next(n.get('content-desc')[23:] for n in tree().iter('node') if n.get('content-desc','').startswith('QA created commitments ')));assert any(e['title']=='CompromissoInicioQA' and e['start_at'].startswith(day) and e['priority_level']=='important' for e in created),'Home commitment date or priority was not saved'
node=wait('agenda-day-'+day);x,y,z,w=map(int,re.findall(r'\d+',node.get('bounds')));adb('shell','input','swipe',str((x+z)//2),str((y+w)//2),str((x+z)//2),str((y+w)//2),'800');wait('Criar · Compromisso');tap('Fechar editor');assert wait('menu-home').get('selected')=='true','Closing Home commitment navigated away from Home';wait('Olá, Teste.')
print('PASS Home date hold saves correct date and priority in place; cancel stays on Home',flush=True)
print('PASS task rich description and selected context, chat jump, entry-path page back, Home date hold and Agenda priority',flush=True)
logs=adb('logcat','-d').decode(errors='replace');(out/'native-log.txt').write_text(logs);assert 'FATAL EXCEPTION' not in logs;assert 'CALENDAR_PERF' in logs
(out/'result.json').write_text(json.dumps({'passed':True,'events':500,'passes':10,'native_hermes_budget_ms':1000,'menu_roundtrips':3,'appointment_edges_isolated':True,'moderate_pull_ignored':True,'deliberate_pull_refreshes':True,'root_system_back_inert':True,'capsules_daily_widget_and_history':True}))
print('PASS native calendar performance, 500 events, existing update signature and navigation')
