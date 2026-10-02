"""Verify the update offer in an unmodified, already published Android 0.3.11 APK.
Android may apply all-caps to native dialog buttons. Match the caption without case,
but require an enabled visible button belonging to Sofia and the exact versions.
"""
import json, re, subprocess, time, xml.etree.ElementTree as ET
from pathlib import Path

def update_offered(root, version):
    nodes=list(root.iter('node'))
    text=[n.get('text','') for n in nodes if n.get('package')=='com.avsord.sofiaapp']
    def visible(n):
        b=list(map(int,re.findall(r'-?\d+',n.get('bounds',''))))
        return len(b)==4 and b[2]>b[0] and b[3]>b[1]
    button=any(n.get('package')=='com.avsord.sofiaapp' and
        n.get('class')=='android.widget.Button' and n.get('text','').strip().casefold()=='atualizar' and
        n.get('enabled')=='true' and n.get('clickable')=='true' and visible(n) for n in nodes)
    return button and 'Atualização disponível' in text and any(
        'Instalada: 0.3.11' in t and 'Disponível: '+version in t for t in text)

def main():
    app=Path(__file__).resolve().parents[1]
    version=json.loads((app/'package.json').read_text())['version']
    out=app/'dist';out.mkdir(exist_ok=True)
    raw=b''
    for attempt in range(20):
        time.sleep(1)
        subprocess.run(['adb','shell','uiautomator','dump','/sdcard/update-offer.xml'],check=True,timeout=25,capture_output=True)
        raw=subprocess.check_output(['adb','shell','cat','/sdcard/update-offer.xml'],timeout=15)
        root=ET.fromstring(raw)
        if update_offered(root,version):
            (out/'update-offered-from-0.3.11.xml').write_bytes(raw)
            (out/'update-offered-from-0.3.11.png').write_bytes(subprocess.check_output(['adb','exec-out','screencap','-p'],timeout=15))
            print('PASS: unmodified 0.3.11 offers '+version+' with Atualizar inside Android.')
            return
    (out/'update-offer-failure.xml').write_bytes(raw)
    (out/'update-offer-failure.png').write_bytes(subprocess.check_output(['adb','exec-out','screencap','-p'],timeout=15))
    raise AssertionError('The old Android app did not show the new update dialog')

if __name__=='__main__':main()
