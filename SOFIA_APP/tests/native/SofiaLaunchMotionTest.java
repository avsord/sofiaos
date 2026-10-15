package com.avsord.sofiaapp;

public class SofiaLaunchMotionTest {
  private static void near(float actual, float expected) {
    if (Math.abs(actual - expected) > 0.00001f) throw new AssertionError(actual + " != " + expected);
  }
  public static void main(String[] args) {
    if (SofiaLaunchMotion.S_FADE_IN_MS != 140L) throw new AssertionError("Unexpected S alpha duration");
    if (SofiaLaunchMotion.DURATION_MS != 1100L) throw new AssertionError("Unexpected scale duration");
    // 0.3.140: logo parado, escala lenta e organica 0.86 -> 1 em 1100 ms, sem fase parada e sem giro.
    near(SofiaLaunchMotion.scaleAt(1000, 900), .86f);
    near(SofiaLaunchMotion.scaleAt(1000, 1000), .86f);
    near(SofiaLaunchMotion.scaleAt(1000, 2100), 1f);
    near(SofiaLaunchMotion.scaleAt(1000, 9000), 1f);
    near(SofiaLaunchMotion.scaleAt(0, 1400), 1f);
    float previous = .86f;
    for (long now = 1000; now <= 2100; now++) {
      float current = SofiaLaunchMotion.scaleAt(1000, now);
      if (current < previous || current > 1f) throw new AssertionError("Scale reversed");
      near(SofiaLaunchMotion.scaleAt(1000, now), current);
      previous = current;
    }
    if (SofiaLaunchMotion.scaleAt(1000, 1001) - .86f > .0003f) throw new AssertionError("Abrupt entry");
    if (SofiaLaunchMotion.scaleAt(1000, 1100) - .86f < .01f) throw new AssertionError("Static start phase");
    float half = SofiaLaunchMotion.scaleAt(1000, 1550);
    if (half < .95f) throw new AssertionError("Too slow at midpoint: " + half);
    if (SofiaLaunchMotion.rotationAt(1000, 1000) != 0f || SofiaLaunchMotion.rotationAt(1000, 1500) != 0f) throw new AssertionError("Logo must not turn");
    System.out.println("native motion passed");
  }
}
