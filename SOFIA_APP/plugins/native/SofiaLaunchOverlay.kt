package com.avsord.sofiaapp

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

/** Historical bridge name. Retain Android's original splash, never add a second
 * logo. Layout and JS work continue underneath it, so readiness cannot wait on
 * a frame which is itself blocked by the splash. */
object SofiaLaunchOverlay {
  private var host: WeakReference<Activity>? = null
  private var observer: ViewTreeObserver? = null
  private var drawing: ViewTreeObserver.OnPreDrawListener? = null
  private var activityStartedAt = 0L
  private var homeSeen = false
  private var dataSeen = false
  private var revealed = false
  private var failed = false
  private var removeSystemSplash: (() -> Unit)? = null
  private val waiting = mutableListOf<Promise>()
  private const val STORE = "sofia.launch.timings.v1"

  fun start(activity: Activity) {
    detach()
    removeSystemSplash?.invoke(); removeSystemSplash = null
    waiting.toList().forEach { it.resolve(false) }; waiting.clear()
    host = WeakReference(activity)
    activityStartedAt = SystemClock.uptimeMillis()
    homeSeen = false; dataSeen = false; revealed = false; failed = false
    if (Build.VERSION.SDK_INT >= 31) {
      activity.splashScreen.setOnExitAnimationListener { splash ->
        if (host?.get() !== activity || revealed) splash.remove()
        else removeSystemSplash = { splash.remove() }
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
    // On older Android the original starting-window drawable stays behind the
    // first content frame. It is not a new view or a second Activity.
    if (Build.VERSION.SDK_INT < 31) activity.window.setBackgroundDrawableResource(R.drawable.splashscreen_logo)
    activity.getSharedPreferences(STORE, Activity.MODE_PRIVATE).edit().clear()
      .putLong("process_started_uptime_ms", Process.getStartUptimeMillis())
      .putLong("activity_started_uptime_ms", activityStartedAt).apply()
    val listener = ViewTreeObserver.OnPreDrawListener {
      inspect(activity)
      // Android 12+ renders normally underneath the retained system splash.
      // Legacy Android can still lay out; layout-based network waiters below
      // resolve even when its initial empty frame is withheld.
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

  private fun reveal(activity: Activity, success: Boolean) {
    if (revealed || host?.get() !== activity) return
    revealed = true
    removeSystemSplash?.invoke(); removeSystemSplash = null
    // Record after the handoff, not when an invisible layout first appears.
    // These markers remain diagnostics; the acceptance test must tap the real UI.
    activity.window.decorView.postOnAnimation {
      if (host?.get() !== activity || activity.isFinishing) return@postOnAnimation
      record(activity, if (success) "DATA" else "ERROR")
      if (success) activity.window.decorView.post {
        if (host?.get() === activity && !activity.isFinishing) activity.reportFullyDrawn()
      }
      detach()
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
      // Legacy whenInteractive is a layout/network fence, not a TTFD claim.
      // This must not depend on removal of the splash: first-install data may
      // need network while the original splash is still covering the layout.
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
    // Explicit failure recovery, never a successful launch or a blank timeout.
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

  fun hide(activity: Activity?) {
    val current = activity ?: host?.get() ?: return
    // A JS hide call is only a request to inspect, not permission to reveal.
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
  @ReactMethod fun timings(promise: Promise) {
    try {
      val values = context.getSharedPreferences("sofia.launch.timings.v1", Activity.MODE_PRIVATE).all
      val result = Arguments.createMap()
      for ((key, value) in values) if (value is Long) result.putDouble(key, value.toDouble())
      promise.resolve(result)
    } catch (e: Exception) { promise.reject("LAUNCH_METRICS", e) }
  }
}
