"""Isolated diagnostic: alternate two signed production APKs on ONE emulator.

The script only touches a synthetic QA account in a disposable GitHub runner.
It must never be run against the owner's device or production server credentials.
No app packages are uninstalled, and no data storage is cleared between variants.
"""
from pathlib import Path
import hashlib
import json
import re
import statistics
import subprocess
import time

ROOT = Path('/tmp/sofia-icon-ab')
OUTPUT = Path('/tmp/sofia-icon-ab-evidence')
OUTPUT.mkdir(parents=True, exist_ok=True)
PACKAGE = 'com.avsord.sofiaapp'
APKS = {
    'animated': ROOT / 'animated/Sofia-OS.apk',
    'static': ROOT / 'static/Sofia-OS.apk',
}

def adb(*args):
    return subprocess.check_output(['adb', *args], stderr=subprocess.STDOUT, timeout=90).decode('utf8', errors='replace')

def sha256(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()

def cold(label, variant):
    adb('shell', 'am', 'force-stop', PACKAGE)
    adb('logcat', '-c')
    am = adb('shell', 'am', 'start', '-W', '-n', PACKAGE+'/.MainActivity')
    lines = ''
    for _ in range(80):
        lines = adb('logcat','-d','-s','SofiaLaunch:I','AndroidRuntime:E')
        if 'SOFIA_LAUNCH_DATA_PROCESS_MS=' in lines:
            break
        time.sleep(.2)
    (OUTPUT / f'{label}.txt').write_text(lines, encoding='utf8')
    assert 'FATAL EXCEPTION' not in lines, f'{label}: Android crash'
    stages = {n:int(v) for n,v in re.findall(r'SOFIA_LAUNCH_(SYSTEM_CALLBACK|UI|LOCAL_READY|FADE_START|FADE_DONE|SPLASH_REMOVED|DATA)_PROCESS_MS=(\d+)', lines)}
    match = re.search(r'SOFIA_LAUNCH_ICON_KIND=([A-Za-z0-9_$]+)', lines)
    assert match, f'{label}: no icon kind in log'
    assert all(k in stages for k in ('SYSTEM_CALLBACK', 'UI', 'LOCAL_READY', 'FADE_START', 'FADE_DONE', 'DATA')), (label,stages)
    assert stages['UI'] <= stages['LOCAL_READY'] <= stages['FADE_START'] <= stages['FADE_DONE'] <= stages['DATA'], (label,stages)
    expected = 'SurfaceView' if variant == 'animated' else 'AppCompatImageView'
    assert match.group(1)==expected, f'{label}: expected {expected}, got {match.group(1)}'
    return {'variant':variant,'label':label,'stages_ms':stages,'icon_kind':match.group(1),'activity_manager':am}

def screen_check(label):
    adb('shell','uiautomator','dump','/sdcard/icon-ab.xml')
    tree = adb('shell','cat','/sdcard/icon-ab.xml')
    (OUTPUT/f'{label}.xml').write_text(tree,encoding='utf8')
    assert 'Olá, Teste.' in tree, 'Synthetic Home missing after '+label
    assert 'com compromissos' in tree, 'Retained synthetic agenda missing after '+label

def prepare_synthetic_state():
    seed=ROOT/'seed'
    assert (seed/'baseline-Sofia-OS.apk').exists() and (seed/'QA-ONLY-full-fixture.apk').exists()
    adb('install', str(seed/'baseline-Sofia-OS.apk'))
    adb('install','-r',str(seed/'QA-ONLY-full-fixture.apk'))
    try:adb('shell','pm','grant',PACKAGE,'android.permission.POST_NOTIFICATIONS')
    except subprocess.CalledProcessError:pass
    adb('shell','am','start','-W','-n',PACKAGE+'/.MainActivity')
    time.sleep(3)
    screen_check('seed')
    adb('shell','am','force-stop',PACKAGE)
    adb('shell','svc','wifi','disable')
    adb('shell','svc','data','disable')
    adb('shell','cmd','connectivity','airplane-mode','enable')

results = {'passed': False, 'same_emulator': True, 'different_apks_same_signing': True,
           'offline': True, 'sample_count_each': 5, 'schedule':'ABBAABBAAB',
           'separate_public_release':False, 'physical_device':False,
           'apks_sha256': {k:sha256(p) for k,p in APKS.items()},
           'samples': [], 'device_time':None}
try:
    for p in APKS.values():assert p.stat().st_size > 40_000_000,p
    for name in ['window_animation_scale','transition_animation_scale','animator_duration_scale']:
        adb('shell','settings','put','global',name,'1')
    prepare_synthetic_state()
    results['device_time']=adb('shell','date').strip()
    for variant in ('animated','static'):
        adb('install','-r',str(APKS[variant]))
        cold('warmup-'+variant,variant)
        screen_check('warmup-'+variant)
    for index,variant in enumerate(('animated','static','static','animated','animated','static','static','animated','animated','static')):
        adb('install','-r',str(APKS[variant]))
        data=cold(f'{index+1:02d}-{variant}',variant)
        results['samples'].append(data)
        if index in (0,1,8,9):screen_check(f'{index+1:02d}-{variant}')
    summary={}
    for variant in APKS:
        rows=[s for s in results['samples'] if s['variant']==variant]
        assert len(rows)==5
        fields=['SYSTEM_CALLBACK','UI','LOCAL_READY','FADE_START','FADE_DONE','DATA']
        summary[variant]={field:statistics.median(row['stages_ms'][field] for row in rows) for field in fields}
        summary[variant]['callback_to_ui']=statistics.median(row['stages_ms']['UI']-row['stages_ms']['SYSTEM_CALLBACK'] for row in rows)
    results['medians_ms']=summary
    results['data_difference_ms']=summary['static']['DATA']-summary['animated']['DATA']
    results['callback_difference_ms']=summary['static']['SYSTEM_CALLBACK']-summary['animated']['SYSTEM_CALLBACK']
    results['passed']=True
finally:
    (OUTPUT/'result.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(results,ensure_ascii=False))
