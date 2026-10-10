"""QA-equivalent universal APK; synthetic local-start smoke on an x86_64 emulator.
The installed ARM64-only owner APK cannot execute on this x86_64 emulator.
A QA twin is built from the same commit, with identical DEX, JS and ARM64 libs.
Retained QA seed first populates synthetic records; no real owner data is used.
The test never authenticates against the owner's server account or edits its data.
"""
import hashlib,io,json,re,statistics,subprocess,time,zipfile,xml.etree.ElementTree as ET
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
 stages={name:int(value) for name,value in re.findall(r'SOFIA_LAUNCH_(UI|LOCAL_READY|FADE_START|FADE_DONE|SPLASH_REMOVED|DATA)_PROCESS_MS=(\d+)',logs)}
 assert 'DATA' in stages,logs
 assert stages['UI']<=stages['LOCAL_READY']<=stages['DATA'],stages
 icon=re.search(r'SOFIA_LAUNCH_ICON_KIND=([A-Za-z0-9_$]+)',logs)
 return {'stages_ms':stages,'activity_manager':manager,'icon_kind':icon.group(1) if icon else None}
def capture(label):
 tree=xml();(out/(label+'.xml')).write_text(tree);(out/(label+'.png')).write_bytes(adb('exec-out','screencap','-p'));return tree
def tap_label(tree,label):
 for n in ET.fromstring(tree).iter('node'):
  if n.attrib.get('text')==label or n.attrib.get('content-desc')==label:
   bounds=list(map(int,re.findall(r'\d+',n.attrib['bounds'])));adb('shell','input','tap',str((bounds[0]+bounds[2])//2),str((bounds[1]+bounds[3])//2));return
 raise AssertionError('Missing control '+label)
result={'passed':False,'production_apk':False,'qa_emulator_twin':True,'exact_owner_apk_executed':False,'synthetic_seed_records':True,'synthetic_transport_in_tested_apk':False,'physical_device':False,'real_user_data_preservation_tested':False,'published':False,'source_sha':(dist/'SOURCE_COMMIT.txt').read_text().strip(),'apk_sha256':hashlib.sha256((dist/'Sofia-OS.apk').read_bytes()).hexdigest(),'qa_apk_sha256':hashlib.sha256((dist/'QA-ONLY-manual-universal.apk').read_bytes()).hexdigest(),'baseline_runs':[],'candidate_runs':[]}
try:
 for name in ['window_animation_scale','transition_animation_scale','animator_duration_scale']:adb('shell','settings','put','global',name,'1')
 adb('install',str(dist/'baseline-Sofia-OS.apk'))
 adb('install','-r',str(dist/'seed-060/QA-ONLY-full-fixture.apk'))
 adb('shell','pm','grant',pkg,'android.permission.POST_NOTIFICATIONS')
 cold('seed-060');time.sleep(3)
 seed=capture('seed-060');assert 'Olá, Teste.' in seed,'Synthetic account did not reach Home'
 tap_label(seed,'Conversa');time.sleep(1)
 tap_label(xml(),'Mensagem para a Sofia');adb('shell','input','text','Teste%srolagem')
 tap_label(xml(),'Enviar mensagem');time.sleep(4)
 adb('shell','input','keyevent','BACK');time.sleep(.4)
 seeded_chat=capture('seeded-history');assert 'FIM DA RESPOSTA QA' in seeded_chat,'Long synthetic conversation was not seeded'
 tap_label(seeded_chat,'Início');time.sleep(2)
 adb('shell','am','force-stop',pkg)
 adb('shell','svc','wifi','disable');adb('shell','svc','data','disable')
 adb('shell','cmd','connectivity','airplane-mode','enable')
 result['offline']=True
 # Compare the exact last delivered 0.3.65, not the older retained seed.
 previous=dist/'previous-065.apk'
 baseline_zip=subprocess.check_output(['gh','api','repos/avsord/sofiaos/actions/artifacts/11578764274/zip'],timeout=120)
 with zipfile.ZipFile(io.BytesIO(baseline_zip)) as archive:
  previous.write_bytes(archive.read('Sofia-OS.apk'))
 result['baseline_version']='0.3.65'
 result['baseline_apk_sha256']=hashlib.sha256(previous.read_bytes()).hexdigest()
 assert result['baseline_apk_sha256']=='6b5a5732edf762cab14092ccb2e4da1577f0a87e94c0af8dcbe4de42205d3bc5'
 adb('install','-r',str(previous))
 for i in range(5):result['baseline_runs'].append(cold('baseline-'+str(i)))
 before=capture('baseline');assert 'Olá, Teste.' in before,'Previous production APK did not restore the saved account'
 owner_baseline=dist/'previous-094/Sofia-OS.apk'
 assert hashlib.sha256(owner_baseline.read_bytes()).hexdigest()=='b783cd88c499cace1b29e4e564f23d26b45674d82dfe2d87537c3acd1cbea223'
 adb('install','-r',str(owner_baseline))
 result['owner_baseline_runs']=[cold('owner-baseline-'+str(i)) for i in range(5)]
 result['owner_baseline_median_ms']=statistics.median(x['stages_ms']['DATA'] for x in result['owner_baseline_runs'])
 adb('install','-r',str(dist/'QA-ONLY-manual-universal.apk'));result['in_place_install']=True
 # Retain the actual production transition for visual inspection.
 recording=subprocess.Popen(['adb','shell','screenrecord','--time-limit','8','/sdcard/sofia-launch-079.mp4'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 time.sleep(.5)
 result['migration_run']=cold('candidate-migration')
 recording.wait(timeout=15)
 adb('pull','/sdcard/sofia-launch-079.mp4',str(out/'candidate-launch.mp4'))
 for i in range(5):result['candidate_runs'].append(cold('candidate-'+str(i)))
 result['candidate_icon_kinds']=[run['icon_kind'] for run in result['candidate_runs']]
 assert all(kind=='AppCompatImageView' for kind in result['candidate_icon_kinds']), 'The Android 12+ static system splash drawable was not active'
 after=capture('candidate');assert 'Olá, Teste.' in after,'Production authenticated Home is not visible';assert 'com compromissos' in after,'Saved agenda records are not available at startup'
 result['authenticated_home_tested']=True
 result['baseline_median_ms']=statistics.median(x['stages_ms']['DATA'] for x in result['baseline_runs'])
 result['candidate_median_ms']=statistics.median(x['stages_ms']['DATA'] for x in result['candidate_runs'])
 # A working APK is NOT an acceptable startup if the system keeps the S over
 # usable content for another half-second. Measure actual native timestamps,
 # not synthetic UI assertions, and compare against the retained 0.3.65 APK.
 spans=[]
 for run in result['candidate_runs']:
  events=run['stages_ms']
  assert 'FADE_START' in events, 'Native fade never started: '+str(events)
  assert events['SPLASH_REMOVED']<=events['FADE_START'] and events['LOCAL_READY']<=events['FADE_START']<=events['FADE_DONE']<=events['DATA'],events
  spans.append({'ready_to_fade_ms':events['FADE_START']-events['LOCAL_READY'],
                'ready_to_splash_remove_ms':events['SPLASH_REMOVED']-events['LOCAL_READY'],
                'fade_to_done_ms':events['FADE_DONE']-events['FADE_START']})
 result['exit_spans']=spans
 result['ready_to_fade_median_ms']=statistics.median(row['ready_to_fade_ms'] for row in spans)
 result['ready_to_splash_remove_median_ms']=statistics.median(row['ready_to_splash_remove_ms'] for row in spans)
 result['fade_to_done_median_ms']=statistics.median(row['fade_to_done_ms'] for row in spans)
 assert result['ready_to_fade_median_ms']<=150,'Home ready but fade starts too late: '+str(spans)
 assert result['ready_to_splash_remove_median_ms']<=150,'OS S still exists after Home ready: '+str(spans)
 assert result['fade_to_done_median_ms']<=250,'Full-screen S is still visible too long: '+str(spans)
 assert result['candidate_median_ms']<=result['baseline_median_ms']+200, 'Startup slower than baseline by over 200 ms: '+str(result['candidate_median_ms']-result['baseline_median_ms'])
 assert result['candidate_median_ms']<=result['owner_baseline_median_ms']+100, 'Startup regression compared with installed 0.3.94'
 result['owner_startup_regression_checked']=True
 result['splash_performance_verified']=True
 # Verify that an actual menu touch works and retained conversation survives.
 tap_label(after,'Conversa');time.sleep(1)
 conversation=capture('conversation')
 assert 'FIM DA RESPOSTA QA' in conversation,'Recent saved messages were lost after fast startup'
 # Target the actual chat viewport. Offline banners can place it below 30%
 # of the display, where the previous test incorrectly began every swipe.
 scrolls=[n for n in ET.fromstring(conversation).iter('node') if n.get('scrollable')=='true' and n.get('class')=='android.widget.ScrollView']
 assert scrolls,'Missing conversation viewport'
 viewport=min(scrolls,key=lambda n:(lambda b:(b[2]-b[0])*(b[3]-b[1]))(list(map(int,re.findall(r'\d+',n.attrib['bounds'])))))
 x1,y1,x2,y2=map(int,re.findall(r'\d+',viewport.attrib['bounds']));x=(x1+x2)//2;top=y1+max(12,(y2-y1)//8);bottom=y2-max(12,(y2-y1)//8)
 result['pagination_swipe_bounds']=[x,top,x,bottom]
 older_visible=False
 for group in range(10):
  for _ in range(4):
   adb('shell','input','swipe',str(x),str(top),str(x),str(bottom),'350');time.sleep(.3)
  older_tree=xml();(out/('older-page-'+str(group)+'.xml')).write_text(older_tree)
  if 'Mensagem preservada' in older_tree or 'Resposta preservada' in older_tree:older_visible=True;break
 capture('older-page-final');assert older_visible,'Scrolling did not automatically restore the previous local page'
 capture('older-page-by-scroll');result['automatic_local_pagination_tested']=True
 result['saved_conversation_preserved']=True
 result['first_menu_touch_works']=True
 # Real fast menu taps in the QA-equivalent x86 emulator APK. Record every transition
 # for frame inspection, then verify Home and retained chat after the sequence.
 menu_tree=xml();menu_points=[]
 for label in ['Início','Conversa','Páginas','Agenda','Apps','Perfil']:
  nodes=[n for n in ET.fromstring(menu_tree).iter('node') if n.attrib.get('text')==label or n.attrib.get('content-desc')==label]
  assert nodes,'Missing menu '+label
  b=list(map(int,re.findall(r'\d+',nodes[-1].attrib['bounds'])));menu_points.append(((b[0]+b[2])//2,(b[1]+b[3])//2))
 adb('logcat','-c')
 menu_record=subprocess.Popen(['adb','shell','screenrecord','--time-limit','10','/sdcard/sofia-menus.mp4'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 time.sleep(.4)
 for _ in range(4):
  for x,y in menu_points:adb('shell','input','tap',str(x),str(y))
 menu_record.wait(timeout=15)
 adb('pull','/sdcard/sofia-menus.mp4',str(out/'candidate-menus.mp4'))
 menu_logs=adb('logcat','-d','-s','SofiaMenu:I').decode(errors='replace')
 (out/'candidate-menu-native.txt').write_text(menu_logs)
 result['native_first_taps']=menu_logs.count('nativeFirst=true')
 result['react_guarded_taps']=menu_logs.count('nativeFirst=false')
 assert result['native_first_taps']>=12, 'Warmed tabs did not preserve native touch-down responsiveness'
 tap_label(xml(),'Início');time.sleep(.3)
 assert 'Olá, Teste.' in capture('after-menu-home')
 tap_label(xml(),'Conversa');time.sleep(.3)
 assert 'FIM DA RESPOSTA QA' in capture('after-menu-chat')
 result['rapid_menu_sequence_tested']=True
 result['rapid_menu_taps']=24

 result['baseline_median_ms']=statistics.median(x['stages_ms']['DATA'] for x in result['baseline_runs'])
 result['candidate_median_ms']=statistics.median(x['stages_ms']['DATA'] for x in result['candidate_runs'])
 result['passed']=True
finally:
 (out/'manual-result.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
print(json.dumps(result))
