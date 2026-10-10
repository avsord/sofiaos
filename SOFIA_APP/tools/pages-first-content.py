"""Bounded UI-content probe. UIAutomator completion is an upper-bound timestamp.

The 100 ms interval is a requested gap BETWEEN probes, not an invented guarantee
that adb/UIAutomator itself completes in 100 ms. Probe duration is recorded.
No actual user data is read; the predicate checks the synthetic QA page label.
"""
import time


def measure_pages(probe, *, mode, trial, on_snapshot=lambda *_: None,
                  now=time.monotonic, sleep=time.sleep, timeout_s=8.0,
                  interval_s=0.1, started_at=None):
    started=now() if started_at is None else started_at
    deadline=started+timeout_s
    result={'mode':mode,'trial':trial,'pages_first_content_ms':None,
            'content_visible':False,'false_empty':False,'timed_out':False,
            'goal_ms':1000,'goal_met':False,'timeout_ms':round(timeout_s*1000),
            'requested_probe_interval_ms':round(interval_s*1000),
            'measurement_kind':'tap to completed UIAutomator snapshot; upper bound, not GPU time',
            'probes':[],'snapshots':[]}
    pending=[1500,3000]
    tree=''
    while now()<deadline:
        before=now()
        try:
            tree=probe(max(0.001,deadline-before))
        except TimeoutError:
            result['probe_timeout']=True
            break
        elapsed=round((now()-started)*1000,1)
        present='Página QA' in tree
        false_empty='Sua primeira página' in tree
        result['probes'].append({'at_ms':elapsed,'probe_ms':round((now()-before)*1000,1),
                                 'content_visible':present,'false_empty':false_empty})
        if false_empty:
            result['false_empty']=True
            on_snapshot('false-empty',tree,elapsed)
            break
        if present and now()<=deadline:
            result['content_visible']=True
            result['pages_first_content_ms']=elapsed
            result['goal_met']=elapsed<=result['goal_ms']
            on_snapshot('content',tree,elapsed)
            break
        for target in pending[:]:
            if elapsed>=target:
                on_snapshot(str(target)+'ms',tree,elapsed)
                result['snapshots'].append({'target_ms':target,'observed_ms':elapsed})
                pending.remove(target)
        sleep(max(0,min(interval_s,deadline-now())))
    result['elapsed_ms']=round((now()-started)*1000,1)
    result['timed_out']=not result['content_visible'] and not result['false_empty']
    result['correctness_passed']=result['content_visible'] and not result['false_empty']
    if result['timed_out']:
        on_snapshot('timeout',tree,result['elapsed_ms'])
    return result
