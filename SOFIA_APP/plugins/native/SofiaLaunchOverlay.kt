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
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import java.lang.ref.WeakReference
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** Retain Android's original splash until the saved Home is ready. Remove it
 * directly; optional work still waits for the following usable display frame. */
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
  private var recreating = false
  private var transition = SofiaLaunchTransition(false)
  private var removeSystemSplash: (() -> Unit)? = null
  private var exitSystemSplash: ((Boolean) -> Unit)? = null
  private val waiting = mutableListOf<Promise>()
  private val visibleWaiting = mutableListOf<Promise>()
  private const val STORE = "sofia.launch.timings.v1"

  fun start(activity: Activity) {
    // A hot start reuses this Activity and does not call start. Configuration
    // recreation has no new starting window; cold/warm launches do.
    val expectsSplash = Build.VERSION.SDK_INT >= 31 &&
      host?.get()?.isChangingConfigurations != true && !recreating
    transition = SofiaLaunchTransition(expectsSplash)
    recreating = false
    detach()
    removeSystemSplash?.invoke(); removeSystemSplash = null; exitSystemSplash = null
    waiting.toList().forEach { it.resolve(false) }; waiting.clear()
    visibleWaiting.toList().forEach { it.resolve(false) }; visibleWaiting.clear()
    host = WeakReference(activity)
    activityStartedAt = SystemClock.uptimeMillis()
    homeSeen = false; dataSeen = false; revealed = false; visible = false; failed = false; exitStarted = false
    if (Build.VERSION.SDK_INT >= 31) {
      activity.splashScreen.setOnExitAnimationListener { splash ->
        if (host?.get() !== activity) splash.remove()
        else {
          Log.i("SofiaLaunch", "SOFIA_LAUNCH_SYSTEM_CALLBACK_PROCESS_MS=${SystemClock.uptimeMillis() - Process.getStartUptimeMillis()}")
          removeSystemSplash = { splash.remove() }
          // The splash is ONE visual surface: background, purple mark and S
          // all fade together. Do not animate the icon separately, and never
          // wait 240 ms before starting the fade as 0.3.73 did.
          exitSystemSplash = { success ->
            if (!exitStarted && host?.get() === activity) {
              exitStarted = true
              var finalized = false
              val icon = splash.iconView
              val finalizeSplash = {
                if (!finalized) {
                  finalized = true
                  // OEM icon surfaces are sometimes composed independently of
                  // the splash background. Force both to transparent BEFORE
                  // removing the single system SplashScreenView.
                  icon?.alpha = 0f
                  splash.alpha = 0f
                  splash.remove()
                  if (host?.get() === activity) {
                    removeSystemSplash = null; exitSystemSplash = null
                    record(activity, "SPLASH_REMOVED")
                    completeReveal(activity, success)
                  }
                }
                Unit
              }
              // RenderThread-backed property animators continue to move when
              // React's UI thread is busy. ValueAnimator was driven by main
              // thread frames, causing 600-770ms stalls for a 95ms fade.
              // Both independent system layers start together on one frame.
              val fadeDuration = 95L
              val curve = android.view.animation.LinearInterpolator()
              record(activity, "FADE_START")
              splash.animate().alpha(0f).setDuration(fadeDuration)
                .setInterpolator(curve)
                .withEndAction { finalizeSplash() }.start()
              icon?.animate()?.alpha(0f)?.setDuration(fadeDuration)
                ?.setInterpolator(curve)?.start()
              // A responsive main thread removes the original splash as soon
              // as the animation ends. The watchdog is only for OEM issues.
              splash.postDelayed({ finalizeSplash() }, 140L)
            }
            Unit
          }
          when (transition.splashReady()) {
            SofiaLaunchTransition.Exit.SYSTEM_SPLASH -> exitSystemSplash?.invoke(!failed)
            SofiaLaunchTransition.Exit.REMOVE_STALE_SPLASH -> {
              splash.remove(); removeSystemSplash = null; exitSystemSplash = null
            }
            else -> Unit
          }
        }
      }
    }
  }

  private fun readySignals(root: View): Int {
    var signals = 0
    fun visit(view: View) {
      if ((signals and 1) != 0 || (signals and 14) == 14) return
      if (view.visibility != View.VISIBLE || view.alpha <= 0f) return
      if (view.width > 0 && view.height > 0) {
        signals = signals or when (view.getTag(com.facebook.react.R.id.view_tag_native_id) as? String) {
          "sofia-login-ready" -> 1
          "sofia-home-scroll" -> 2
          "sofia-menu-bar" -> 4
          "sofia-home-data-ready" -> 8
          "sofia-launch-error" -> 16
          else -> 0
        }
      }
      if (view is ViewGroup) for (i in 0 until view.childCount) visit(view.getChildAt(i))
    }
    // One walk per frame, rather than a full traversal for each ready marker.
    visit(root)
    return signals
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
      // Layout/network permission cannot wait for the visibility fence.
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

  private fun completeReveal(activity: Activity, success: Boolean) {
    if (visible || host?.get() !== activity) return
    if (!transition.finish()) return
    detach()
    // Keep the same next-frame DATA boundary used by the comparison APK.
    // Layout readiness alone must never be reported as usable presentation.
    activity.window.decorView.postOnAnimation {
      if (host?.get() !== activity || activity.isFinishing) return@postOnAnimation
      visible = true
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
    // The old legacy windowBackground is a second S underneath the system
    // splash. Clear it as soon as Home is ready, before beginning native fade.
    if (Build.VERSION.SDK_INT < 31) {
      activity.window.setBackgroundDrawableResource(R.color.sofiaLaunchBackground)
    }
    // inspect() is called by the actual Home pre-draw observer. The previous
    // extra postOnAnimation fence added 400–650 ms on loaded Android emulators:
    // Home was ready, but Android did not start the fade until another frame.
    // Begin the synchronized splash exit in this SAME ready callback. The
    // underlying prepared Home draws during the 95-ms fade.
    when (transition.contentReady()) {
      SofiaLaunchTransition.Exit.SYSTEM_SPLASH -> exitSystemSplash?.invoke(success)
      SofiaLaunchTransition.Exit.CONTENT -> {
        completeReveal(activity, success) // legacy/recreation without a starting window
      }
      else -> Unit // Android owns a splash: await its exit callback.
    }
  }

  private fun inspect(activity: Activity) {
    if (host?.get() !== activity || activity.isFinishing || revealed) return
    val root = activity.window.decorView
    val signals = readySignals(root)
    val login = (signals and 1) != 0
    val home = (signals and 6) == 6
    if (!homeSeen && (home || login)) {
      homeSeen = true
      record(activity, "UI")
      // whenInteractive remains an essential-I/O/layout fence, NOT visibility.
      val callbacks = waiting.toList(); waiting.clear()
      root.post { callbacks.forEach { it.resolve(true) } }
    }
    if (login || home) {
      dataSeen = true
      reveal(activity, true)
    } else if ((signals and 16) != 0) {
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
        setOnClickListener { recreating = true; activity.recreate() }
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
