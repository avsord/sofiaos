# 0.3.263: divide uma tela grande em partes sem mudar o que ela faz. Uso: python3 tools/split-screen.py <arquivo> <pasta> <parte:funcao-inicial>...
# A 1a parte ("core") vai do fim dos imports ate a primeira funcao listada. Cada parte exporta tudo o que declara e importa
# das outras so o que usa. O arquivo original fica com a parte "MAIN" e reexporta o que era publico.
import re,os,sys
path,folder=sys.argv[1],sys.argv[2];spec=[a.split(':') for a in sys.argv[3:]]
src=open(path,encoding='utf-8').read();L=src.split('\n')
imp_end=max(i for i,l in enumerate(L[:120]) if l.startswith('import ') or (l.startswith('  ') and 'from ' in l and i<120 and any(L[k].startswith('import {') and not L[k].rstrip().endswith(';') for k in range(max(0,i-6),i))))+1
while imp_end<len(L) and (L[imp_end].startswith('import ') or L[imp_end].startswith('  ')): imp_end+=1
header=L[:imp_end]
def start_of(name):
    if name.startswith('@'):
        for i,l in enumerate(L):
            if i>=imp_end and l.startswith(name[1:]): return i
        raise SystemExit('nao achei '+name)
    for i,l in enumerate(L):
        if i>=imp_end and re.match(r'^(export\s+)?(async\s+)?function\s+'+re.escape(name)+r'\b',l):
            j=i
            while j-1>=imp_end and (L[j-1].lstrip().startswith(('//','/*','*')) or L[j-1].strip()=='*/'): j-=1
            return j
    raise SystemExit('nao achei '+name)
order=[('core',None)]+[(k,n) for k,n in spec]
starts=[imp_end]+[start_of(n) for _,n in order[1:]];ends=starts[1:]+[len(L)]
parts={k:L[a:b] for (k,_),a,b in zip(order,starts,ends)}
declre=re.compile(r'^(export\s+)?(async\s+)?(function|const|let|type|class|interface)\s+')
def names_of(lines):
    out=[]
    for l in lines:
        m=declre.match(l)
        if not m: continue
        rest=l[m.end():]
        if m.group(3) in ('const','let'):
            depth=0;i=0;expect=True
            while i<len(rest):
                ch=rest[i]
                if ch in "'\"`":
                    q=ch;i+=1
                    while i<len(rest) and rest[i]!=q:
                        if rest[i]=='\\': i+=1
                        i+=1
                    i+=1;continue
                if ch in '([{':depth+=1
                elif ch in ')]}':depth-=1
                elif depth==0 and ch==',':expect=True
                elif depth==0 and expect and not ch.isspace():
                    mm=re.match(r'([A-Za-z_$][\w$]*)\s*(:[^=]*)?=',rest[i:])
                    if mm: out.append(mm.group(1));i+=mm.end();expect=False;continue
                    expect=False
                i+=1
        else: out.append(re.match(r'([A-Za-z_$][\w$]*)',rest).group(1))
    return out
exports={k:names_of(v) for k,v in parts.items()}
def strip_code(t): return re.sub(r'//[^\n]*','',re.sub(r'/\*.*?\*/','',t,flags=re.S))
base=os.path.splitext(os.path.basename(path))[0];os.makedirs(os.path.join(os.path.dirname(path),folder),exist_ok=True)
public=[n for k,v in parts.items() for l in v for n in [None] if False]
orig_exported=set(re.findall(r'^export\s+(?:async\s+)?(?:function|const|let|type|class)\s+([A-Za-z_$][\w$]*)',src,re.M))
for key,lines in parts.items():
    body=[('export '+l if declre.match(l) and not declre.match(l).group(1) else l) for l in lines]
    code=strip_code('\n'.join(body));imps=[]
    for other,names in exports.items():
        if other in (key,'MAIN'): continue
        used=[n for n in names if re.search(r'(?<![\w$.])'+re.escape(n)+r'(?![\w$])',code)]
        if used: imps.append("import {"+', '.join(used)+"} from '"+(('./'+folder+'/') if key=='MAIN' else './')+other+"';")
    if key=='MAIN':
        reexp=[]
        for other,names in exports.items():
            if other=='MAIN': continue
            pub=[n for n in names if n in orig_exported]
            if pub: reexp.append("export {"+', '.join(pub)+"} from './"+folder+"/"+other+"';")
        out=header+['// 0.3.263: tela dividida em partes (src/screens/'+folder+'/*), sem mudar o que ela faz. Quem importava daqui continua importando daqui.']+imps+reexp+body
        open(path,'w',encoding='utf-8').write('\n'.join(out))
    else:
        h=[l.replace("from '../","from '../../").replace("from './","from '../") for l in header]
        open(os.path.join(os.path.dirname(path),folder,other_name if False else key)+'.tsx','w',encoding='utf-8').write('\n'.join(h+['// 0.3.263: parte de '+base+' (ver src/screens/'+base+'.tsx).']+imps+body))
print({k:len(v) for k,v in exports.items()})
