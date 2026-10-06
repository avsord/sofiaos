import hashlib,json,os,pathlib,shutil,subprocess,tempfile,zipfile

BASE='32815e5fad1648a792d8c66d38ff9812ef95027f'
app=pathlib.Path('SOFIA_APP').resolve();dist=app/'dist'
def run(args,cwd=app):
 return subprocess.check_output([str(x) for x in args],cwd=cwd,text=True).strip()
def ignored(name):
 upper=name.upper()
 return upper.startswith('META-INF/') and (upper.endswith(('.SF','.RSA','.DSA','.EC')) or upper=='META-INF/MANIFEST.MF')
def native_entries(path):
 with zipfile.ZipFile(path) as z:
  return {i.filename:hashlib.sha256(z.read(i.filename)).hexdigest() for i in z.infolist() if not ignored(i.filename) and i.filename!='assets/index.android.bundle'}
assert (dist/'SOURCE_COMMIT.txt').read_text().strip()==BASE,'Wrong native shell source'
changed=run(['git','diff','--name-only',BASE,'HEAD','--','SOFIA_APP'],app.parent).splitlines()
assert changed==['SOFIA_APP/src/screens/Home.tsx'],f'Native reuse disallowed for changed files: {changed}'
assert 'nestedScrollEnabled={false}' in (app/'src/screens/Home.tsx').read_text()
run(['sha256sum','-c','dist/Sofia-OS.apk.sha256'])
sdk=pathlib.Path(os.environ['ANDROID_HOME'])/'build-tools'
sdk=max((p for p in sdk.iterdir() if p.is_dir()),key=lambda p:tuple(int(n) for n in p.name.split('.') if n.isdigit()))
cli=run(['node','-p','require.resolve("@expo/cli",{paths:[require.resolve("expo/package.json")]})'])
compiler=pathlib.Path(run(['node','-p','require.resolve("hermes-compiler/package.json",{paths:[require.resolve("react-native/package.json")]})'])).parent/'hermesc/linux64-bin/hermesc'
work=pathlib.Path(tempfile.mkdtemp(prefix='sofia-native-reuse-'))
original_app=(app/'App.tsx').read_bytes()
evidence=[]
try:
 for qa,name in [(False,'Sofia-OS.apk'),(True,'QA-ONLY-full-fixture.apk')]:
  old=work/('original-'+name);shutil.copyfile(dist/name,old)
  before=native_entries(old)
  if qa:
   (app/'ProductionApp.tsx').write_bytes(original_app)
   (app/'App.tsx').write_bytes((app/'tests/fixtures/calendar-performance.tsx.fixture').read_bytes())
  js=work/('qa.js' if qa else 'production.js');hbc=js.with_suffix('.hbc')
  run(['node',cli,'export:embed','--platform','android','--entry-file','index.ts','--dev','false','--minify','false','--max-workers','2','--reset-cache','--bundle-output',js,'--assets-dest',work/('qa-assets' if qa else 'production-assets')])
  run([compiler,'-O','-emit-binary','-out',hbc,js])
  assert hbc.stat().st_size>1000000,'Empty Hermes bundle'
  unsigned=work/('unsigned-'+name);aligned=work/('aligned-'+name)
  with zipfile.ZipFile(old) as source,zipfile.ZipFile(unsigned,'w') as target:
   for info in source.infolist():
    if ignored(info.filename):continue
    target.writestr(info,hbc.read_bytes() if info.filename=='assets/index.android.bundle' else source.read(info.filename))
  run([sdk/'zipalign','-P','16','-f','4',unsigned,aligned])
  run([sdk/'apksigner','sign','--ks',app/'android/app/debug.keystore','--ks-pass','pass:android','--key-pass','pass:android','--ks-key-alias','androiddebugkey','--out',dist/name,aligned])
  run([sdk/'apksigner','verify','--verbose','--print-certs',dist/name])
  def cert(path):
   lines=run([sdk/'apksigner','verify','--print-certs',path]).splitlines()
   return next(line.split(': ',1)[1] for line in lines if 'certificate SHA-256 digest:' in line)
  assert cert(old)==cert(dist/name),'Signature changed'
  assert before==native_entries(dist/name),'Native code or resources changed'
  evidence.append({'apk':name,'unchanged_native_and_resource_entries':len(before),'bundle_sha256':hashlib.sha256(hbc.read_bytes()).hexdigest(),'certificate_sha256':cert(dist/name)})
finally:
 (app/'App.tsx').write_bytes(original_app)
 (app/'ProductionApp.tsx').unlink(missing_ok=True)
source=run(['git','rev-parse','HEAD'],app.parent)
(dist/'SOURCE_COMMIT.txt').write_text(source+'\n')
run(['git','archive','--format=zip','--output='+str(dist/'Sofia-OS-source.zip'),'HEAD','SOFIA_APP'],app.parent)
apk=dist/'Sofia-OS.apk'
(dist/'Sofia-OS.apk.sha256').write_text(hashlib.sha256(apk.read_bytes()).hexdigest()+'  dist/Sofia-OS.apk\n')
(dist/'native-reuse.json').write_text(json.dumps({'base_source':BASE,'new_source':source,'allowed_source_change':changed,'verified':evidence},indent=2))
manifest=run([sdk/'aapt','dump','badging',apk])
assert "package: name='com.avsord.sofiaapp' versionCode='48' versionName='0.3.43'" in manifest,'Identity changed'
(dist/'manifest.txt').write_text(manifest)
assert not run(['git','status','--porcelain','--','SOFIA_APP'],app.parent),'App source changed while bundling'
print('VERIFIED: new Hermes code, identical native code/resources and original signature',json.dumps(evidence))
