package com.avsord.sofiaapp;

/** Same finite accelerate/decelerate curve as the system animated vector. */
public final class SofiaLaunchMotion {
  public static final long DURATION_MS = 800L;
  private SofiaLaunchMotion() {}
  public static float scaleAt(long startedAt, long now) {
    if (startedAt <= 0L) return 1f;
    double progress = Math.max(0d, Math.min(1d, (now - startedAt) / (double) DURATION_MS));
    return (float) (0.88d + 0.12d * (1d - Math.cos(Math.PI * progress)) / 2d);
  }
}
