# 0.3.259 (rodada premium, fase 1): escala de letras e pesos da Sofia, aplicada no codigo e nos testes do mesmo jeito.
# Tamanhos: 10 11 12 13 14 16 18 20 24 28 32 40 56 (antes 29 tamanhos, inclusive 9.5 e 15.5).
# Pesos: um degrau abaixo (800->700, 700->600, 600->500): antes quase tudo era negrito e nada se destacava.
import re,glob,sys
SIZE={'9':'10','9.5':'10','15':'16','15.5':'16','17':'18','19':'20','21':'20','22':'24','23':'24','25':'24','26':'28','27':'28','29':'28','30':'32','36':'32','38':'40','42':'40','58':'56'}
WEIGHT={'800':'700','700':'600','600':'500','bold':'600'}
def fix(t):
    t=re.sub(r"(fontSize:\s*)(\d+(?:\.\d+)?)(?![\d.])",lambda m:m.group(1)+SIZE.get(m.group(2),m.group(2)),t)
    t=re.sub(r"(fontWeight:\s*)(['\"])(800|700|600|bold)\2",lambda m:m.group(1)+m.group(2)+WEIGHT[m.group(3)]+m.group(2),t)
    return t
files=glob.glob('src/**/*.ts',recursive=True)+glob.glob('src/**/*.tsx',recursive=True)+['App.tsx']+glob.glob('tests/*.cjs')
n=0
for f in files:
    s=open(f,encoding='utf-8').read();t=fix(s)
    if t!=s:open(f,'w',encoding='utf-8').write(t);n+=1
print('arquivos:',n)
