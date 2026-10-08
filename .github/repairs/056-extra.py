from pathlib import Path
import subprocess
p=Path('SOFIA_APP/tests/navigation.test.cjs');s=p.read_text()
a='assert.ok(startup.includes("enabled?MENU_TABS"));'
b='assert.ok(startup.includes("enabled?warmed:[]"));assert.ok(startup.includes("requestIdleCallback(run)"));assert.ok(startup.includes("MENU_TABS.includes(active)?[active]:[]"));'
assert s.count(a)==1;s=s.replace(a,b).replace('pager keeps six fixed slots and mounts its screen trees behind data-ready launch handoff','pager keeps six fixed slots, prioritizes Home and warms hidden screens without blocking launch');p.write_text(s)
p=Path('SOFIA_APP/src/lib/startup-mounts.ts');s=p.read_text();a=' return new Set<Tab>([';b=" useEffect(()=>{if(enabled&&MENU_TABS.includes(active))setWarmed(prev=>prev.has(active)?prev:new Set([...prev,active]));},[enabled,active]);\n return new Set<Tab>([";assert s.count(a)==1;p.write_text(s.replace(a,b))
p=Path('SOFIA_APP/tests/voice-profile-notifications-051.test.cjs');s=p.read_text()
a="assert.ok(native.includes('postDelayed({ remove(layer) }, 5000)'));"
b="assert.ok(native.includes('OnPreDrawListener'));assert.ok(native.includes('if (ready(root, layer)) remove(layer)'));assert.ok(native.includes('SOFIA_LAUNCH_TIMEOUT'));assert.ok(native.includes('}, 5000)'));"
assert s.count(a)==1;p.write_text(s.replace(a,b))
subprocess.run(['git','add','--',str(p)],check=True)
print('Native handoff contract verifies first-frame readiness and retains emergency timeout protection')
