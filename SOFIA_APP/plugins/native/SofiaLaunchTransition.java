package com.avsord.sofiaapp;

/** Coordinates the two independent events: usable content and Android's splash.
 * No Android dependency, so both callback orders run in the JVM regression test. */
public final class SofiaLaunchTransition {
  public enum Exit { WAIT, SYSTEM_SPLASH, CONTENT, REMOVE_STALE_SPLASH }
  private final boolean expectsSystemSplash;
  private boolean ready, splash, started, finished;
  public SofiaLaunchTransition(boolean expectsSystemSplash) {
    this.expectsSystemSplash = expectsSystemSplash;
  }
  public Exit contentReady() { ready = true; return next(); }
  public Exit splashReady() {
    if (finished) return Exit.REMOVE_STALE_SPLASH;
    splash = true;
    return next();
  }
  private Exit next() {
    if (!ready || started) return Exit.WAIT;
    if (splash) { started = true; return Exit.SYSTEM_SPLASH; }
    if (!expectsSystemSplash) { started = true; return Exit.CONTENT; }
    return Exit.WAIT;
  }
  public boolean finish() {
    if (!started || finished) return false;
    finished = true;
    return true;
  }
}
