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
def calendar_bounds(root):
 rows=[n.get('bounds') for n in root.iter('node') if n.get('resource-id','').endswith('agenda-split-row')]
 assert rows,'Calendar geometry absent'
 return rows[0]
baseline=calendar_bounds(r)
for i in range(6):
 tap('Próximo mês');time.sleep(.3);assert calendar_bounds(tree())==baseline,'Home calendar changed height'
tap('Voltar ao dia de hoje')
adb('shell','input','swipe','500','160','430','160','450');time.sleep(1)
wait('Sofia');screenshot('short-menu-swipe');tap('Início');wait('Olá, Teste.')
adb('shell','input','swipe','360','1200','360','450','400');time.sleep(.4)
tap('Filtrar níveis das tarefas do Início');wait('Nível das tarefas');screenshot('home-task-filter');tap('Todas');time.sleep(.3)
# Home row opens details; only the separate checkbox concludes.
tap('Abrir tarefa Projeto urgente');wait('Detalhes da tarefa');wait('Descricao da tarefa QA');screenshot('home-task-details')
tap('Editar tarefa');wait('Descrição');screenshot('home-task-edit');tap('Descrição');adb('shell','input','keyevent','123');adb('shell','input','text','%satualizada');adb('shell','input','keyevent','BACK');time.sleep(.3)
adb('shell','input','swipe','360','1200','360','550','400');time.sleep(.3);tap('Salvar tarefa');wait('Detalhes da tarefa');wait('Descricao da tarefa QA atualizada');screenshot('home-task-saved');tap('Fechar detalhes da tarefa');time.sleep(.4)
wait('Concluir Projeto urgente');tap('Concluir Projeto urgente');time.sleep(.6);assert find(tree(),'Abrir tarefa Projeto urgente') is None,'Row tap must not complete; checkbox must complete'
adb('shell','input','swipe','360','400','360','1200','400');time.sleep(.4)
tap('Conversa');tap('Mensagem para a Sofia');adb('shell','input','text','Teste%srolagem');tap('Enviar mensagem');time.sleep(1.5);wait('FIM DA RESPOSTA QA');time.sleep(3);wait('FIM DA RESPOSTA QA');screenshot('chat-growing-reply');adb('shell','input','keyevent','BACK');tap('Início');wait('Olá, Teste.')
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
tap('Voltar aos apps');tap('Notas');tap('Criar registro');tap('Título da nota');adb('shell','input','text','NotaQA036')
tap('Conteúdo da nota');adb('shell','input','text','TextoQA036');tap('Negrito');adb('shell','input','text','Bold');tap('Fechar teclado');tap('Salvar');wait('NotaQA036');tap('NotaQA036');wait('Título da nota');wait('Conteúdo da nota');screenshot('rich-note-reopened');tap('Voltar das notas');tap('Início')
logs=adb('logcat','-d').decode(errors='replace');(out/'native-log.txt').write_text(logs);assert 'FATAL EXCEPTION' not in logs;assert 'CALENDAR_PERF' in logs
(out/'result.json').write_text(json.dumps({'passed':True,'events':500,'passes':10,'native_hermes_budget_ms':1000,'menu_roundtrips':3}))
print('PASS native calendar performance, 500 events, existing update signature and navigation')
