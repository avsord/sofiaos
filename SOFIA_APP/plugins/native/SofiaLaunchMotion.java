package com.avsord.sofiaapp;

/** Same finite accelerate/decelerate curve as the system animated vector. */
public final class SofiaLaunchMotion {
  public static final long DURATION_MS = 650L;
  private SofiaLaunchMotion() {}
  public static float scaleAt(long startedAt, long now) {
    if (startedAt <= 0L) return 1f;
    double progress = Math.max(0d, Math.min(1d, (now - startedAt) / (double) DURATION_MS));
    return (float) (0.70d + 0.30d * (1d - Math.cos(Math.PI * progress)) / 2d);
  }
}
