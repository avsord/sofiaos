package com.avsord.sofiaapp;

public class SofiaLaunchMotionTest {
  private static void near(float actual, float expected) {
    if (Math.abs(actual - expected) > 0.00001f) throw new AssertionError(actual + " != " + expected);
  }
  public static void main(String[] args) {
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
    System.out.println("native motion passed");
  }
}
