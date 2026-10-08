"""Exact production APK; authenticated local-start comparison on an isolated emulator.
Retained QA APK seeds synthetic records only, then is replaced by production.
The test never authenticates against the owner's server account or edits its data.
"""
import hashlib,json,re,statistics,subprocess,time,xml.etree.ElementTree as ET
from pathlib import Path
root=Path(__file__).resolve().parents[1];dist=root/'dist';out=dist/'manual-evidence';out.mkdir(parents=True,exist_ok=True)
pkg='com.avsord.sofiaapp'
def adb(*args):return subprocess.check_output(['adb',*args],timeout=60)
def xml():
 adb('shell','uiautomator','dump','/sdcard/manual-startup.xml')
 return adb('shell','cat','/sdcard/manual-startup.xml').decode(errors='replace')
def cold(label):
 adb('shell','am','force-stop',pkg);adb('logcat','-c')
 manager=adb('shell','am','start','-W','-n',pkg+'/.MainActivity').decode(errors='replace')
 logs=''
 for _ in range(75):
  logs=adb('logcat','-d','-s','SofiaLaunch:I','AndroidRuntime:E').decode(errors='replace')
  if 'SOFIA_LAUNCH_DATA_PROCESS_MS=' in logs:break
  time.sleep(.2)
 (out/(label+'.txt')).write_text(logs)
 assert 'FATAL EXCEPTION' not in logs,logs
 stages={name:int(value) for name,value in re.findall(r'SOFIA_LAUNCH_(UI|LOCAL_READY|FADE_START|SPLASH_REMOVED|DATA)_PROCESS_MS=(\d+)',logs)}
 assert 'DATA' in stages,logs
 assert stages['UI']<=stages['LOCAL_READY']<=stages['DATA'],stages
 return {'stages_ms':stages,'activity_manager':manager}
def capture(label):
 tree=xml();(out/(label+'.xml')).write_text(tree);(out/(label+'.png')).write_bytes(adb('exec-out','screencap','-p'));return tree
def tap_label(tree,label):
 for n in ET.fromstring(tree).iter('node'):
  if n.attrib.get('text')==label or n.attrib.get('content-desc')==label:
   bounds=list(map(int,re.findall(r'\d+',n.attrib['bounds'])));adb('shell','input','tap',str((bounds[0]+bounds[2])//2),str((bounds[1]+bounds[3])//2));return
 raise AssertionError('Missing control '+label)
result={'passed':False,'production_apk':True,'synthetic_seed_records':True,'synthetic_transport_in_tested_apk':False,'physical_device':False,'real_user_data_preservation_tested':False,'published':False,'source_sha':(dist/'SOURCE_COMMIT.txt').read_text().strip(),'apk_sha256':hashlib.sha256((dist/'Sofia-OS.apk').read_bytes()).hexdigest(),'baseline_runs':[],'candidate_runs':[]}
try:
 for name in ['window_animation_scale','transition_animation_scale','animator_duration_scale']:adb('shell','settings','put','global',name,'1')
 adb('install',str(dist/'baseline-Sofia-OS.apk'))
 adb('install','-r',str(dist/'seed-060/QA-ONLY-full-fixture.apk'))
 adb('shell','pm','grant',pkg,'android.permission.POST_NOTIFICATIONS')
 cold('seed-060');time.sleep(3)
 seed=capture('seed-060');assert 'Olá, Teste.' in seed,'Synthetic account did not reach Home'
 adb('shell','am','force-stop',pkg)
 adb('shell','svc','wifi','disable');adb('shell','svc','data','disable')
 adb('shell','cmd','connectivity','airplane-mode','enable')
 result['offline']=True
 previous=dist/'previous-062/Sofia-OS.apk'
 result['baseline_apk_sha256']=hashlib.sha256(previous.read_bytes()).hexdigest()
 assert result['baseline_apk_sha256']=='d8033b9566fdd9b0af74380d1a55e9856851f0285b3ca208a203597e86642013'
 adb('install','-r',str(previous))
 for i in range(5):result['baseline_runs'].append(cold('baseline-'+str(i)))
 before=capture('baseline');assert 'Olá, Teste.' in before,'Previous production APK did not restore the saved account'
 adb('install','-r',str(dist/'Sofia-OS.apk'));result['in_place_install']=True
 result['migration_run']=cold('candidate-migration')
 for i in range(5):result['candidate_runs'].append(cold('candidate-'+str(i)))
 after=capture('candidate');assert 'Olá, Teste.' in after,'Production authenticated Home is not visible';assert 'com compromissos' in after,'Saved agenda records are not available at startup'
 result['authenticated_home_tested']=True
 # Verify that an actual menu touch works and retained conversation survives.
 tap_label(after,'Conversa');time.sleep(1)
 conversation=capture('conversation')
 assert 'Mensagem preservada' in conversation or 'Resposta preservada' in conversation,'Retained conversation was lost after fast startup'
 result['saved_conversation_preserved']=True
 result['first_menu_touch_works']=True
 result['baseline_median_ms']=statistics.median(x['stages_ms']['DATA'] for x in result['baseline_runs'])
 result['candidate_median_ms']=statistics.median(x['stages_ms']['DATA'] for x in result['candidate_runs'])
 result['passed']=True
finally:
 (out/'manual-result.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
print(json.dumps(result))
