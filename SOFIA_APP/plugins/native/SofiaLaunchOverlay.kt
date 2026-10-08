package com.avsord.sofiaapp

import android.app.Activity
import android.os.Process
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import java.lang.ref.WeakReference
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** Historical name retained for binary compatibility. This is now an observer,
 * NOT an overlay. Android owns the only splash; no second logo, timer or touch
 * blocker is ever installed on top of the usable application. */
object SofiaLaunchOverlay {
  private var host: WeakReference<Activity>? = null
  private var observer: ViewTreeObserver? = null
  private var drawing: ViewTreeObserver.OnPreDrawListener? = null
  private var activityStartedAt = 0L
  private var homeSeen = false
  private var dataSeen = false
  private val waiting = mutableListOf<Promise>()
  private const val STORE = "sofia.launch.timings.v1"

  fun start(activity: Activity) {
    detach()
    waiting.toList().forEach { it.resolve(false) }; waiting.clear()
    host = WeakReference(activity)
    activityStartedAt = SystemClock.uptimeMillis()
    homeSeen = false
    dataSeen = false
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
    // Clear previous attempt's measurements; no personal information is stored.
    activity.getSharedPreferences(STORE, Activity.MODE_PRIVATE).edit().clear()
      .putLong("process_started_uptime_ms", Process.getStartUptimeMillis())
      .putLong("activity_started_uptime_ms", activityStartedAt).apply()
    val listener = ViewTreeObserver.OnPreDrawListener {
      inspect(activity)
      true
    }
    observer = root.viewTreeObserver
    drawing = listener
    observer?.addOnPreDrawListener(listener)
    // Stop diagnostics if no usable frame arrived. This never hides/reveals UI
    // or reports a successful launch: error and incomplete startup stay visible.
    root.postDelayed({
      if (host?.get() === activity && !dataSeen) {
        Log.w("SofiaLaunch", "SOFIA_LAUNCH_INCOMPLETE")
        detach()
      }
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

  private fun inspect(activity: Activity) {
    if (host?.get() !== activity || activity.isFinishing) return
    val root = activity.window.decorView
    val login = has(root, "sofia-login-ready")
    val home = has(root, "sofia-home-scroll") && has(root, "sofia-menu-bar")
    if (!homeSeen && (home || login)) {
      homeSeen = true
      record(activity, "UI")
      val callbacks = waiting.toList(); waiting.clear()
      root.post { callbacks.forEach { it.resolve(true) } }
    }
    if (!dataSeen && (login || (home && has(root, "sofia-home-data-ready")))) {
      dataSeen = true
      record(activity, "DATA")
      root.post { if (host?.get() === activity && !activity.isFinishing) activity.reportFullyDrawn() }
      detach()
    }
  }

  private fun detach() {
    drawing?.let { listener -> if (observer?.isAlive == true) observer?.removeOnPreDrawListener(listener) }
    drawing = null
    observer = null
  }

  fun whenInteractive(promise: Promise) {
    val activity = host?.get()
    if (activity == null) { promise.resolve(false); return }
    activity.runOnUiThread {
      if (homeSeen) promise.resolve(true)
      else if (waiting.size < 32) waiting.add(promise)
      else promise.reject("LAUNCH_WAITERS", "Too many startup subscribers")
    }
  }

  fun hide(activity: Activity?) {
    // Compatibility with prior JS callers: no overlay exists to hide.
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
  @ReactMethod fun timings(promise: Promise) {
    try {
      val values = context.getSharedPreferences("sofia.launch.timings.v1", Activity.MODE_PRIVATE).all
      val result = Arguments.createMap()
      for ((key, value) in values) if (value is Long) result.putDouble(key, value.toDouble())
      promise.resolve(result)
    } catch (e: Exception) { promise.reject("LAUNCH_METRICS", e) }
  }
}
