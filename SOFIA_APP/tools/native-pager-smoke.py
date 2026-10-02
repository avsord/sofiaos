"""CI Android UI checks on the real pager/editor using a separate synthetic entry.
Never logs in, contacts production, or edits the user's data. All evidence is test data.
"""
import json, os, re, subprocess, time, xml.etree.ElementTree as ET
from pathlib import Path
OUT = Path(__file__).resolve().parents[1] / 'dist' / 'pager-evidence'
OUT.mkdir(parents=True, exist_ok=True)

def adb(*args):
    return subprocess.check_output(['adb', *args], timeout=30)

def tree():
    adb('shell', 'uiautomator', 'dump', '/sdcard/sofia-qa.xml')
    return ET.fromstring(adb('shell', 'cat', '/sdcard/sofia-qa.xml'))

def node(root, name, attr='content-desc'):
    return next((n for n in root.iter('node') if n.get(attr,'') == name or
                 (attr == 'resource-id' and n.get(attr,'').endswith('/'+name))), None)

def wait(name, attr='content-desc'):
    for _ in range(12):
        root=tree(); found=node(root,name,attr)
        if found is not None: return root,found
        time.sleep(.4)
    raise AssertionError('Missing visible UI: '+name)

def bounds(n):
    return list(map(int,re.findall(r'\d+',n.get('bounds',''))))

def tap(name, attr='content-desc'):
    _,n=wait(name,attr); x1,y1,x2,y2=bounds(n)
    adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))

def shot(name,root=None):
    (OUT/(name+'.png')).write_bytes(adb('exec-out','screencap','-p'))
    if root is not None: (OUT/(name+'.xml')).write_bytes(ET.tostring(root,encoding='utf-8'))

def page(id):
    root,n=wait('qa-surface-'+id,'resource-id'); box=bounds(n)
    assert len(box)==4 and box[2]>box[0] and box[3]>box[1],(id,box)
    selected=node(root,'menu-'+id,'resource-id')
    assert selected is not None and selected.get('selected')=='true', ('wrong menu',id,ET.tostring(root).decode())
    shot('page-'+id,root)
    return box

def swipe(direction):
    root=tree(); n=next(n for n in root.iter('node') if 'qa-surface-' in n.get('resource-id',''))
    x1,y1,x2,y2=bounds(n); left=x1+int((x2-x1)*.16); right=x1+int((x2-x1)*.84)
    y=y2+100
    start,end=(right,left) if direction=='left' else (left,right)
    adb('shell','input','swipe',str(start),str(y),str(end),str(y),'350')
    time.sleep(.8)

try:
    page('chat')  # Never "Conversa" selected while Home is on screen.
    time.sleep(1); page('chat')  # Includes delayed child content layout.
    swipe('left'); page('pages')
    swipe('right'); page('chat')
    swipe('right'); page('home')
    swipe('left'); page('chat')
    tap('menu-profile','resource-id'); page('profile')
    tap('qa-remount'); page('chat')
    tap('qa-resize'); page('chat')
    swipe('left'); page('pages')
    tap('qa-resize'); page('pages')
    tap('Nova página')
    root,title=wait('Título da página'); _,body=wait('Conteúdo do bloco 1')
    shot('new-empty-page',root)
    assert title.get('text') in ('','Título'),title.attrib
    assert body.get('text') in ('','Escreva algo…'),body.attrib
    undo=node(root,'Desfazer'); redo=node(root,'Refazer'); plus=node(root,'Criar subpágina'); trash=node(root,'Excluir página')
    assert all(n is not None for n in [undo,redo,plus,trash]),'Missing right-side tools'
    positions=[bounds(n)[0] for n in [undo,redo,plus,trash]]
    assert positions==sorted(positions) and positions[0]>bounds(title)[2]*.4,positions
    tap('Título da página'); adb('shell','input','text','Regression')
    tap('Conteúdo do bloco 1'); adb('shell','input','text','Draft')
    adb('shell','input','keyevent','4'); time.sleep(.8)
    root,title=wait('Título da página'); body=node(root,'Conteúdo do bloco 1')
    assert title.get('text')=='Regression' and body.get('text')=='Draft',(title.attrib,body.attrib)
    shot('written-clean-page',root)
    tap('Desfazer'); time.sleep(.3)
    _,body=wait('Conteúdo do bloco 1'); assert body.get('text') in ('','Escreva algo…','Digite / para opções'),body.attrib
    tap('Refazer'); time.sleep(.3)
    root,body=wait('Conteúdo do bloco 1'); assert body.get('text')=='Draft',body.attrib
    shot('redo-right-tools',root)
    print('PASS: cold start, delayed layout, first swipes, direct taps, remount, resize, page hints, right-side undo/redo.')
    (OUT/'result.json').write_text(json.dumps({'passed':True,'scope':'real components in separate CI fixture; synthetic data only'}))
except Exception:
    try: shot('failure',tree())
    except Exception: pass
    raise
