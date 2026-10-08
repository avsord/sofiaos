"""Manual candidate only: production APK, in-place identity, real native launch.
No fake transport, fabricated phone report or automatic release publication.
"""
import hashlib,json,re,subprocess,time
from pathlib import Path
root=Path(__file__).resolve().parents[1]
dist=root/'dist';out=dist/'manual-evidence';out.mkdir(parents=True,exist_ok=True)
def adb(*args):return subprocess.check_output(['adb',*args],timeout=45)
result={'passed':False,'production_apk':True,'synthetic_transport':False,'physical_device':False,
        'authenticated_home_tested':False,'real_user_data_preservation_tested':False,
        'published':False,'source_sha':(dist/'SOURCE_COMMIT.txt').read_text().strip(),
        'apk_sha256':hashlib.sha256((dist/'Sofia-OS.apk').read_bytes()).hexdigest(),'runs':[]}
try:
 adb('install',str(dist/'baseline-Sofia-OS.apk'))
 adb('install','-r',str(dist/'Sofia-OS.apk'))
 result['in_place_install']=True
 adb('shell','pm','grant','com.avsord.sofiaapp','android.permission.POST_NOTIFICATIONS')
 for name in ['window_animation_scale','transition_animation_scale','animator_duration_scale']:
  adb('shell','settings','put','global',name,'1')
 for index in range(2):
  adb('shell','am','force-stop','com.avsord.sofiaapp');adb('logcat','-c')
  manager=adb('shell','am','start','-W','-n','com.avsord.sofiaapp/.MainActivity').decode(errors='replace')
  logs=''
  for _ in range(30):
   logs=adb('logcat','-d','-s','SofiaLaunch:I','AndroidRuntime:E').decode(errors='replace')
   if 'SOFIA_LAUNCH_DATA_PROCESS_MS=' in logs:break
   time.sleep(.2)
  (out/f'launch-{index}.txt').write_text(logs)
  assert 'FATAL EXCEPTION' not in logs,logs
  stages={name:int(value) for name,value in re.findall(r'SOFIA_LAUNCH_(LOCAL_READY|FADE_START|DATA)_PROCESS_MS=(\d+)',logs)}
  assert set(stages)=={'LOCAL_READY','FADE_START','DATA'},'Missing actual native transition stages: '+logs
  assert stages['LOCAL_READY']<=stages['FADE_START']<stages['DATA'],stages
  assert stages['DATA']-stages['FADE_START']>=100,'Fade completed before the 120 ms native animation'
  adb('shell','uiautomator','dump','/sdcard/manual-startup.xml')
  xml=adb('shell','cat','/sdcard/manual-startup.xml').decode(errors='replace')
  assert 'Entrar' in xml,'Production login is not usable'
  (out/f'launch-{index}.xml').write_text(xml)
  (out/f'launch-{index}.png').write_bytes(adb('exec-out','screencap','-p'))
  result['runs'].append({'stages_ms':stages,'activity_manager':manager,'login_visible':True})
 result['passed']=True
finally:
 (out/'manual-result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
