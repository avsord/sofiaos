package com.avsord.sofiaapp;
import static com.avsord.sofiaapp.SofiaLaunchTransition.Exit.*;
public class SofiaLaunchTransitionTest {
  static void check(boolean ok,String message) { if(!ok) throw new AssertionError(message); }
  public static void main(String[] args) {
    // This was the failing order: content arrives before Android's exit listener.
    SofiaLaunchTransition late=new SofiaLaunchTransition(true);
    check(late.contentReady()==WAIT,"Ready content must not bypass a pending splash");
    check(!late.finish(),"DATA/optional work cannot be released before the fade");
    check(late.splashReady()==SYSTEM_SPLASH,"Late splash must animate");
    check(late.contentReady()==WAIT,"Repeated ready must not start another fade");
    check(late.finish(),"Fade completion must release visibility exactly once");
    check(!late.finish(),"Duplicate animation end/cancel cannot complete twice");
    SofiaLaunchTransition early=new SofiaLaunchTransition(true);
    check(early.splashReady()==WAIT,"Splash waits for actual data");
    check(!early.finish(),"A splash alone is not a usable Home");
    check(early.contentReady()==SYSTEM_SPLASH,"Early splash starts once data is ready");
    check(early.splashReady()==WAIT,"Repeated callback cannot start another fade");
    check(early.finish(),"Early order completes");
    for(int i=0;i<2;i++) {
      SofiaLaunchTransition noSplash=new SofiaLaunchTransition(false);
      check(noSplash.contentReady()==CONTENT,"Legacy/recreated Activity cannot wait for absent splash");
      check(noSplash.finish(),"No-splash completion");
      check(noSplash.splashReady()==REMOVE_STALE_SPLASH,"Unexpected stale splash cannot cover visible UI");
    }
    check(early.splashReady()==REMOVE_STALE_SPLASH,"Completed callback is harmless");
    System.out.println("PASS: actual production transition; both event orders, duplicate/cancel, legacy/recreation");
  }
}
