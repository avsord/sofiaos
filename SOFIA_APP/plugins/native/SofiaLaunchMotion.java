package com.avsord.sofiaapp;

/** Same finite accelerate/decelerate curve as the system animated vector. */
public final class SofiaLaunchMotion {
  public static final long DURATION_MS = 650L;
  public static final long S_FADE_IN_MS = 140L;
  private SofiaLaunchMotion() {}
  /** 0.3.139: the orb turns from this angle to 0 on the same curve as the scale. */
  public static final float ROTATION_FROM_DEGREES = -30f;
  public static float rotationAt(long startedAt, long now) {
    if (startedAt <= 0L) return 0f;
    double progress = Math.max(0d, Math.min(1d, (now - startedAt) / (double) DURATION_MS));
    return (float) (ROTATION_FROM_DEGREES * (1d - (1d - Math.cos(Math.PI * progress)) / 2d));
  }
  public static float scaleAt(long startedAt, long now) {
    if (startedAt <= 0L) return 1f;
    double progress = Math.max(0d, Math.min(1d, (now - startedAt) / (double) DURATION_MS));
    return (float) (0.70d + 0.30d * (1d - Math.cos(Math.PI * progress)) / 2d);
  }
}
