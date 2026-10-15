package com.avsord.sofiaapp;

/** Same finite accelerate/decelerate curve as the system animated vector. */
public final class SofiaLaunchMotion {
  /** 0.3.140: scale 0.86 -> 1 over 1100 ms (smoothstep-in, slow organic out). Never delays Home. */
  public static final long DURATION_MS = 1100L;
  public static final long S_FADE_IN_MS = 140L;
  private SofiaLaunchMotion() {}
  /** 0.3.139: the orb turns from this angle to 0 on the same curve as the scale. */
  public static final float ROTATION_FROM_DEGREES = 0f;
  public static float rotationAt(long startedAt, long now) {
    if (startedAt <= 0L) return 0f;
    double progress = Math.max(0d, Math.min(1d, (now - startedAt) / (double) DURATION_MS));
    return (float) (ROTATION_FROM_DEGREES * (1d - (1d - Math.cos(Math.PI * progress)) / 2d));
  }
  public static float scaleAt(long startedAt, long now) {
    if (startedAt <= 0L) return 1f;
    double progress = Math.max(0d, Math.min(1d, (now - startedAt) / (double) DURATION_MS));
    // metade curva organica (suave nas duas pontas) + metade saida lenta: comeca a crescer
    // no primeiro quadro sem salto e assenta devagar no fim
    double organic = progress * progress * progress * (progress * (progress * 6d - 15d) + 10d);
    double settle = 1d - Math.pow(1d - progress, 3d);
    return (float) (0.86d + 0.14d * (0.5d * organic + 0.5d * settle));
  }
}
