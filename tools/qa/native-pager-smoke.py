"""Real Android component checks with synthetic data; never touch a user's account.
Native startup can briefly expose only the splash/root. Wait for the real viewport,
then require the selected menu and visible page to match without issuing navigation.
Zero-width/offscreen siblings never count as visible or interactive.
"""
import json, os, re, subprocess, time, xml.etree.ElementTree as ET
from pathlib import Path
APP=Path(os.environ['SOFIA_QA_APP_ROOT']).resolve()
OUT=APP/'dist'/'pager-evidence';OUT.mkdir(parents=True,exist_ok=True)
step=0

def adb(*args):
    return subprocess.check_output(['adb',*args],timeout=30)

def tree():
    adb('shell','uiautomator','dump','/sdcard/sofia-qa.xml')
    return ET.fromstring(adb('shell','cat','/sdcard/sofia-qa.xml'))

def bounds(n):
    return list(map(int,re.findall(r'-?\d+',n.get('bounds','')))) if n is not None else []

def positive(n):
    b=bounds(n)
    return len(b)==4 and b[2]>b[0] and b[3]>b[1]

def node(root,name,attr='content-desc'):
    return next((n for n in root.iter('node') if positive(n) and
        (n.get(attr,'')==name or (attr=='resource-id' and n.get(attr,'').endswith('/'+name)))),None)

def viewport(root):
    n=next((n for n in root.iter('node') if n.get('class')=='android.widget.HorizontalScrollView' and positive(n)),None)
    return bounds(n)

def wait(name,attr='content-desc'):
    for _ in range(12):
        root=tree();found=node(root,name,attr)
        if found is not None:return root,found
        time.sleep(.3)
    raise AssertionError('Missing visible UI: '+name)

def tap(name,attr='content-desc'):
    _,n=wait(name,attr);x1,y1,x2,y2=bounds(n)
    adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))

def shot(name,root=None):
    (OUT/(name+'.png')).write_bytes(adb('exec-out','screencap','-p'))
    if root is not None:(OUT/(name+'.xml')).write_bytes(ET.tostring(root,encoding='utf-8'))

def page(id):
    global step
    for _ in range(12):
        root=tree();surface=node(root,'qa-surface-'+id,'resource-id');selected=node(root,'menu-'+id,'resource-id')
        box=bounds(surface);vp=viewport(root)
        if vp and surface is not None and selected is not None and selected.get('selected')=='true' and abs(box[0]-vp[0])<=1 and abs(box[2]-vp[2])<=1:
            step+=1;shot(f'{step:02d}-page-{id}',root);print('PAGE',id,box,'MENU',selected.get('selected'),flush=True);return vp
        time.sleep(.3)
    shot('alignment-failure',root)
    raise AssertionError(('Page and menu not aligned',id,box,vp,None if selected is None else selected.get('selected')))

def swipe(direction):
    vp=viewport(tree())
    if not vp:raise AssertionError('No visible native pager viewport for gesture')
    x1,y1,x2,y2=vp;left=x1+int((x2-x1)*.16);right=x1+int((x2-x1)*.84);y=y1+int((y2-y1)*.33)
    start,end=(right,left) if direction=='left' else (left,right)
    # Duration of injected finger movement only; production motion stays unchanged.
    adb('shell','input','swipe',str(start),str(y),str(end),str(y),'900')
    time.sleep(.8)

def dismiss_keyboard():
    state=adb('shell','dumpsys','input_method').decode('utf-8',errors='replace')
    if re.search(r'(?:mInputShown|isInputViewShown|mIsInputViewShown)=true',state):
        adb('shell','input','keyevent','4')
    time.sleep(.5)

def main():
    try:
        page('chat');time.sleep(1);page('chat')
        swipe('left');page('pages')
        swipe('right');page('chat')
        swipe('right');page('home')
        swipe('left');page('chat')
        tap('menu-profile','resource-id');page('profile')
        tap('qa-remount');page('chat')
        tap('qa-resize');page('chat')
        swipe('left');page('pages')
        tap('qa-resize');page('pages')
        tap('Nova página')
        root,title=wait('Título da página');_,body=wait('Conteúdo do bloco 1');shot('new-empty-page',root)
        assert title.get('text') in ('','Título'),title.attrib
        assert body.get('text') in ('','Escreva algo…'),body.attrib
        tools=[node(root,name) for name in ['Desfazer','Refazer','Criar subpágina','Excluir página']]
        assert all(n is not None for n in tools),'Missing right-side tools'
        positions=[bounds(n)[0] for n in tools];vp=viewport(root)
        assert vp and positions==sorted(positions) and positions[0]>vp[0]+(vp[2]-vp[0])*.4,positions
        tap('Título da página');adb('shell','input','text','Regression');dismiss_keyboard()
        tap('Conteúdo do bloco 1');adb('shell','input','text','Draft');dismiss_keyboard()
        root,title=wait('Título da página');body=node(root,'Conteúdo do bloco 1')
        assert body is not None and title.get('text')=='Regression' and body.get('text')=='Draft',(title.attrib,None if body is None else body.attrib)
        shot('written-clean-page',root)
        tap('Desfazer');time.sleep(.3)
        _,body=wait('Conteúdo do bloco 1');assert body.get('text') in ('','Escreva algo…','Digite / para opções'),body.attrib
        tap('Refazer');time.sleep(.3)
        root,body=wait('Conteúdo do bloco 1');assert body.get('text')=='Draft',body.attrib
        shot('redo-right-tools',root)
        print('PASS: startup, first gestures, full-width alignment, direct taps, remount, resize, faint placeholders and working right-side undo/redo.')
        (OUT/'result.json').write_text(json.dumps({'passed':True,'native_pages_checked':step,'scope':'real components, disposable fixture, synthetic data; production APK not modified'}))
    except Exception:
        try:shot('failure',tree())
        except Exception:pass
        raise

if __name__=='__main__':main()
