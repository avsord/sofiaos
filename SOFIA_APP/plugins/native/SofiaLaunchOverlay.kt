package com.avsord.sofiaapp

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.app.Activity
import android.os.Build
import android.os.Process
import android.os.SystemClock
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.view.animation.LinearInterpolator
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import java.lang.ref.WeakReference
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** Retain Android's original splash. Essential layout/network can progress under
 * it, but optional work waits until the real app is visible after the short fade. */
object SofiaLaunchOverlay {
  private var host: WeakReference<Activity>? = null
  private var observer: ViewTreeObserver? = null
  private var drawing: ViewTreeObserver.OnPreDrawListener? = null
  private var activityStartedAt = 0L
  private var homeSeen = false
  private var dataSeen = false
  private var revealed = false
  private var visible = false
  private var failed = false
  private var exitStarted = false
  private var removeSystemSplash: (() -> Unit)? = null
  private var exitSystemSplash: ((Boolean) -> Unit)? = null
  private val waiting = mutableListOf<Promise>()
  private val visibleWaiting = mutableListOf<Promise>()
  private const val STORE = "sofia.launch.timings.v1"
  private const val EXIT_FADE_MS = 120L

  fun start(activity: Activity) {
    detach()
    removeSystemSplash?.invoke(); removeSystemSplash = null; exitSystemSplash = null
    waiting.toList().forEach { it.resolve(false) }; waiting.clear()
    visibleWaiting.toList().forEach { it.resolve(false) }; visibleWaiting.clear()
    host = WeakReference(activity)
    activityStartedAt = SystemClock.uptimeMillis()
    homeSeen = false; dataSeen = false; revealed = false; visible = false; failed = false; exitStarted = false
    if (Build.VERSION.SDK_INT >= 31) {
      activity.splashScreen.setOnExitAnimationListener { splash ->
        if (host?.get() !== activity || visible) splash.remove()
        else {
          removeSystemSplash = { splash.animate().setListener(null).cancel(); splash.remove() }
          exitSystemSplash = { success ->
            if (!exitStarted && host?.get() === activity) {
              exitStarted = true
              fade(activity, splash, 0f, success) {
                splash.remove(); removeSystemSplash = null; exitSystemSplash = null
              }
            }
          }
          if (revealed) exitSystemSplash?.invoke(!failed)
        }
      }
    }
  }

  private fun has(view: View, name: String): Boolean {
    if (view.visibility != View.VISIBLE || view.alpha <= 0f) return false
    val tag = view.getTag(com.facebook.react.R.id.view_tag_native_id) as? String
    if (tag == name && view.width > 0 && view.height > 0) return true
    if (view is ViewGroup) for (i in 0 until view.childCount) {
      if (has(view.getChildAt(i), name)) return true
    }
    return false
  }

  fun install(activity: Activity) {
    if (host?.get() !== activity) start(activity)
    val root = activity.window.decorView
    if (Build.VERSION.SDK_INT < 31) activity.window.setBackgroundDrawableResource(R.drawable.splashscreen_logo)
    activity.getSharedPreferences(STORE, Activity.MODE_PRIVATE).edit().clear()
      .putLong("process_started_uptime_ms", Process.getStartUptimeMillis())
      .putLong("activity_started_uptime_ms", activityStartedAt).apply()
    val listener = ViewTreeObserver.OnPreDrawListener {
      inspect(activity)
      // Layout/network permission cannot wait for this draw or for the fade.
      Build.VERSION.SDK_INT >= 31 || revealed
    }
    observer = root.viewTreeObserver
    drawing = listener
    observer?.addOnPreDrawListener(listener)
    root.postDelayed({
      if (host?.get() === activity && !revealed && !activity.isFinishing) recover(activity)
    }, 15000)
  }

  private fun record(activity: Activity, stage: String) {
    val time = SystemClock.uptimeMillis()
    val processMs = time - Process.getStartUptimeMillis()
    val activityMs = time - activityStartedAt
    Log.i("SofiaLaunch", "SOFIA_LAUNCH_${stage}_PROCESS_MS=$processMs ACTIVITY_MS=$activityMs")
    activity.getSharedPreferences(STORE, Activity.MODE_PRIVATE).edit()
      .putLong(stage.lowercase() + "_process_ms", processMs)
      .putLong(stage.lowercase() + "_activity_ms", activityMs)
      .putLong("measured_at_ms", System.currentTimeMillis()).apply()
  }

  private fun fade(activity: Activity, view: View, alpha: Float, success: Boolean, cleanup: () -> Unit) {
    var ended = false
    val finish = {
      if (!ended) {
        ended = true
        view.animate().setListener(null)
        view.alpha = alpha
        cleanup()
        completeReveal(activity, success)
      }
    }
    val animations = Build.VERSION.SDK_INT < 26 || ValueAnimator.areAnimatorsEnabled()
    record(activity, "FADE_START")
    if (!success || !animations) { finish(); return }
    // No minimum splash time, icon-animation wait, translation, scale or JS fade.
    view.animate().alpha(alpha).setDuration(EXIT_FADE_MS).setStartDelay(0L)
      .setInterpolator(LinearInterpolator())
      .setListener(object : AnimatorListenerAdapter() {
        override fun onAnimationEnd(animation: Animator) { finish() }
        override fun onAnimationCancel(animation: Animator) { finish() }
      }).start()
  }

  private fun completeReveal(activity: Activity, success: Boolean) {
    if (visible || host?.get() !== activity) return
    visible = true
    detach()
    // Include the native fade in DATA timing; it is not free startup time.
    activity.window.decorView.postOnAnimation {
      if (host?.get() !== activity || activity.isFinishing) return@postOnAnimation
      record(activity, if (success) "DATA" else "ERROR")
      val callbacks = visibleWaiting.toList(); visibleWaiting.clear()
      callbacks.forEach { it.resolve(success) }
      if (success) activity.reportFullyDrawn()
    }
  }

  private fun reveal(activity: Activity, success: Boolean) {
    if (revealed || host?.get() !== activity) return
    revealed = true; failed = !success
    record(activity, "LOCAL_READY")
    val content = activity.findViewById<View>(android.R.id.content)
    // Legacy Android fades the real content over its unchanged starting-window
    // drawable. It does not add an overlay, another logo or a second Activity.
    if (Build.VERSION.SDK_INT < 31 && success) content.alpha = 0f
    activity.window.decorView.postOnAnimation {
      if (host?.get() !== activity || activity.isFinishing) return@postOnAnimation
      val exit = exitSystemSplash
      if (exit != null) exit(success)
      else if (Build.VERSION.SDK_INT < 31 && success) fade(activity, content, 1f, true) {}
      else completeReveal(activity, success) // warm Activity with no system splash
    }
  }

  private fun inspect(activity: Activity) {
    if (host?.get() !== activity || activity.isFinishing || revealed) return
    val root = activity.window.decorView
    val login = has(root, "sofia-login-ready")
    val home = has(root, "sofia-home-scroll") && has(root, "sofia-menu-bar")
    if (!homeSeen && (home || login)) {
      homeSeen = true
      record(activity, "UI")
      // whenInteractive remains an essential-I/O/layout fence, NOT visibility.
      val callbacks = waiting.toList(); waiting.clear()
      root.post { callbacks.forEach { it.resolve(true) } }
    }
    if (login || (home && has(root, "sofia-home-data-ready"))) {
      dataSeen = true
      reveal(activity, true)
    } else if (has(root, "sofia-launch-error")) {
      failed = true
      reveal(activity, false)
    }
  }

  private fun recover(activity: Activity) {
    failed = true
    Log.w("SofiaLaunch", "SOFIA_LAUNCH_INCOMPLETE")
    val panel = LinearLayout(activity).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(48, 48, 48, 48)
      setBackgroundColor(android.graphics.Color.rgb(247, 246, 250))
      addView(TextView(activity).apply {
        text = "Não foi possível preparar a Sofia. Seus dados não foram apagados."
        textSize = 18f
        setTextColor(android.graphics.Color.rgb(39, 35, 52))
      })
      addView(Button(activity).apply {
        text = "Tentar novamente"
        setOnClickListener { activity.recreate() }
      })
    }
    activity.setContentView(panel)
    reveal(activity, false)
    waiting.toList().forEach { it.resolve(false) }; waiting.clear()
  }

  private fun detach() {
    drawing?.let { listener -> if (observer?.isAlive == true) observer?.removeOnPreDrawListener(listener) }
    drawing = null; observer = null
  }

  fun whenInteractive(promise: Promise) {
    val activity = host?.get()
    if (activity == null) { promise.resolve(false); return }
    activity.runOnUiThread {
      if (failed) promise.resolve(false)
      else if (homeSeen) promise.resolve(true)
      else if (waiting.size < 32) waiting.add(promise)
      else promise.reject("LAUNCH_WAITERS", "Too many startup subscribers")
    }
  }

  fun whenRevealed(promise: Promise) {
    val activity = host?.get()
    if (activity == null) { promise.resolve(false); return }
    activity.runOnUiThread {
      if (failed) promise.resolve(false)
      else if (visible) promise.resolve(true)
      else if (visibleWaiting.size < 32) visibleWaiting.add(promise)
      else promise.reject("LAUNCH_WAITERS", "Too many visibility subscribers")
    }
  }

  fun hide(activity: Activity?) {
    val current = activity ?: host?.get() ?: return
    current.runOnUiThread { inspect(current) }
  }
}

class SofiaLaunchModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "SofiaLaunch"
  @ReactMethod fun hide(promise: Promise) {
    try { SofiaLaunchOverlay.hide(null); promise.resolve(true) }
    catch (e: Exception) { promise.reject("LAUNCH_HANDOFF", e) }
  }
  @ReactMethod fun whenInteractive(promise: Promise) { SofiaLaunchOverlay.whenInteractive(promise) }
  @ReactMethod fun whenRevealed(promise: Promise) { SofiaLaunchOverlay.whenRevealed(promise) }
  @ReactMethod fun timings(promise: Promise) {
    try {
      val values = context.getSharedPreferences("sofia.launch.timings.v1", Activity.MODE_PRIVATE).all
      val result = Arguments.createMap()
      for ((key, value) in values) if (value is Long) result.putDouble(key, value.toDouble())
      promise.resolve(result)
    } catch (e: Exception) { promise.reject("LAUNCH_METRICS", e) }
  }
}
