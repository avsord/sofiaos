package com.avsord.sofiaapp;

public class SofiaLaunchMotionTest {
  private static void near(float actual, float expected) {
    if (Math.abs(actual - expected) > 0.00001f) throw new AssertionError(actual + " != " + expected);
  }
  public static void main(String[] args) {
    if (SofiaLaunchMotion.S_FADE_IN_MS != 140L) throw new AssertionError("Unexpected S alpha duration");
    near(SofiaLaunchMotion.scaleAt(1000, 900), .70f);
    near(SofiaLaunchMotion.scaleAt(1000, 1000), .70f);
    near(SofiaLaunchMotion.scaleAt(1000, 1325), .85f);
    near(SofiaLaunchMotion.scaleAt(1000, 1650), 1f);
    near(SofiaLaunchMotion.scaleAt(1000, 5000), 1f);
    near(SofiaLaunchMotion.scaleAt(0, 1400), 1f);
    float previous = .70f;
    for (long now = 1000; now <= 1650; now++) {
      float current = SofiaLaunchMotion.scaleAt(1000, now);
      if (current < previous || current > 1f) throw new AssertionError("Scale reversed");
      // The surface uses the original start time even when handoff is early.
      near(SofiaLaunchMotion.scaleAt(1000, now), current);
      previous = current;
    }
    if (SofiaLaunchMotion.scaleAt(1000, 1001) - .70f > .00001f) throw new AssertionError("Abrupt entry");
    // 0.3.139: the orb turns -30 -> 0 degrees on the same clock, never backwards.
    near(SofiaLaunchMotion.rotationAt(1000, 1000), -30f);
    near(SofiaLaunchMotion.rotationAt(1000, 1325), -15f);
    near(SofiaLaunchMotion.rotationAt(1000, 1650), 0f);
    near(SofiaLaunchMotion.rotationAt(1000, 9000), 0f);
    near(SofiaLaunchMotion.rotationAt(0, 1400), 0f);
    float angle = -30f;
    for (long now = 1000; now <= 1650; now++) {
      float current = SofiaLaunchMotion.rotationAt(1000, now);
      if (current < angle - .00001f || current > 0f) throw new AssertionError("Rotation reversed");
      angle = current;
    }
    System.out.println("native motion passed");
  }
}
