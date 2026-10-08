from pathlib import Path
p=Path('SOFIA_APP/tests/navigation.test.cjs');s=p.read_text()
a='assert.ok(startup.includes("enabled?MENU_TABS"));'
b='assert.ok(startup.includes("enabled?warmed:[]"));assert.ok(startup.includes("requestIdleCallback(run)"));assert.ok(startup.includes("MENU_TABS.includes(active)?[active]:[]"));'
assert s.count(a)==1;s=s.replace(a,b).replace('pager keeps six fixed slots and mounts its screen trees behind data-ready launch handoff','pager keeps six fixed slots, prioritizes Home and warms hidden screens without blocking launch');p.write_text(s)
p=Path('SOFIA_APP/src/lib/startup-mounts.ts');s=p.read_text();a=' return new Set<Tab>([';b=" useEffect(()=>{if(enabled&&MENU_TABS.includes(active))setWarmed(prev=>prev.has(active)?prev:new Set([...prev,active]));},[enabled,active]);\n return new Set<Tab>([";assert s.count(a)==1;p.write_text(s.replace(a,b))
