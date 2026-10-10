"""Fail closed if the x86_64 CI-only smoke APK differs in executable app code.

The owner's APK is ARM64-only. The emulator cannot run that exact artifact;
therefore an independently signed (same cert), x86-inclusive binary is tested
and this verifier compares its app bytecode, JS bundle and all ARM64 libraries.
The smoke is explicitly QA-equivalent, NOT a physical/exact-APK acceptance.
"""
import hashlib,json,re,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
dist=root/'dist'
production=dist/'Sofia-OS.apk'
qa=dist/'QA-ONLY-manual-universal.apk'
report=dist/'rodada3-abi-report.json'

def sha(blob):return hashlib.sha256(blob).hexdigest()

with zipfile.ZipFile(production) as a,zipfile.ZipFile(qa) as b:
    names_a=set(a.namelist());names_b=set(b.namelist())
    arm_a=sorted(n for n in names_a if n.startswith('lib/arm64-v8a/') and n.endswith('.so'))
    arm_b=sorted(n for n in names_b if n.startswith('lib/arm64-v8a/') and n.endswith('.so'))
    x86_b=sorted(n for n in names_b if n.startswith('lib/x86_64/') and n.endswith('.so'))
    assert arm_a and arm_a==arm_b,'ARM64 native libraries differ between owner and QA builds'
    assert x86_b,'CI QA twin needs x86_64 to run in the existing Android emulator'
    assert not any(n.startswith('lib/x86_64/') for n in names_a),'Owner APK contains forbidden x86_64 libraries'
    assert not any(n.startswith('lib/armeabi-v7a/') or n.startswith('lib/x86/') for n in names_a),'Owner APK is not ARM64-only'
    code_a=sorted(n for n in names_a if re.fullmatch(r'classes\d*\.dex',n))
    code_b=sorted(n for n in names_b if re.fullmatch(r'classes\d*\.dex',n))
    assert code_a and code_a==code_b,'R8 DEX member names differ across ARM64 and QA variants'
    js='assets/index.android.bundle'
    assert js in names_a and js in names_b,'Missing production Hermes bundle'
    compared=code_a+[js]+arm_a
    mismatches=[n for n in compared if sha(a.read(n)) != sha(b.read(n))]
    assert not mismatches,'QA twin has different executable code or ARM64 libs: '+', '.join(mismatches[:12])
    data={
      'production_apk':production.name,
      'production_bytes':production.stat().st_size,
      'production_sha256':sha(production.read_bytes()),
      'production_arm64_only':True,
      'production_dex_bytes':sum(a.getinfo(n).file_size for n in code_a),
      'production_dex_compressed_bytes':sum(a.getinfo(n).compress_size for n in code_a),
      'production_dex_files':code_a,
      'qa_emulator_apk':qa.name,
      'qa_emulator_bytes':qa.stat().st_size,
      'qa_emulator_sha256':sha(qa.read_bytes()),
      'qa_contains_x86_64':True,
      'shared_executable_entries_matched':len(compared),
      'shared_executable_sha256_equal':True,
      'direct_physical_arm64_runtime_tested':False,
      'emulator_installed_exact_owner_apk':False,
    }
    report.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps(data,ensure_ascii=False))
