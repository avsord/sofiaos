"""Verify the update offer in an unmodified, already published Android 0.3.11 APK."""
import json, subprocess, time, xml.etree.ElementTree as ET
from pathlib import Path
app=Path(__file__).resolve().parents[1]
version=json.loads((app/'package.json').read_text())['version']
out=app/'dist';out.mkdir(exist_ok=True)
for attempt in range(20):
    time.sleep(1)
    subprocess.run(['adb','shell','uiautomator','dump','/sdcard/update-offer.xml'],check=True,timeout=25,capture_output=True)
    raw=subprocess.check_output(['adb','shell','cat','/sdcard/update-offer.xml'],timeout=15)
    root=ET.fromstring(raw)
    texts=[n.get('text','') for n in root.iter('node')]
    if 'Atualizar' in texts and any('Disponível: '+version in text for text in texts):
        (out/'update-offered-from-0.3.11.xml').write_bytes(raw)
        (out/'update-offered-from-0.3.11.png').write_bytes(subprocess.check_output(['adb','exec-out','screencap','-p'],timeout=15))
        print('PASS: unmodified 0.3.11 offers '+version+' with Atualizar inside Android.')
        break
else:
    (out/'update-offer-failure.xml').write_bytes(raw)
    raise AssertionError('The old Android app did not show the new update dialog')
