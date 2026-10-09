package com.avsord.sofiaapp

import android.app.Activity
import android.os.Build
import android.os.Process
import android.os.SystemClock
import android.util.Log
import android.graphics.Canvas
import android.graphics.Rect
import android.graphics.drawable.Drawable
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
 * through one animated native surface; optional work waits for visual completion. */
/** One atomic canvas surface: the background and mark are painted in the
 * SAME native View so neither can remain above Home after the other fades.
 * Unlike fading SplashScreenView/icon separately, this has one compositor
 * layer on Android 12-15 and can be disposed immediately. */
private class SofiaUnifiedSplashSurface(activity: Activity) : View(activity) {
  private val logo = activity.getDrawable(R.drawable.sofia_launch_mark)?.mutate()
  private val background = activity.getColor(R.color.sofiaLaunchBackground)
  private var markBounds: Rect? = null
  fun matchSystemIcon(icon: View?) {
    if (icon == null || icon.width <= 0 || icon.height <= 0) return
    val iconPosition = IntArray(2)
    val rootPosition = IntArray(2)
    icon.getLocationOnScreen(iconPosition)
    getLocationOnScreen(rootPosition)
    val x = iconPosition[0] - rootPosition[0]
    val y = iconPosition[1] - rootPosition[1]
    // AOSP's adaptive foreground expands the inner vector by 1.5.
    val padX = icon.width / 4
    val padY = icon.height / 4
    markBounds = Rect(x - padX, y - padY, x + icon.width + padX, y + icon.height + padY)
  }
  init {
    setWillNotDraw(false)
    logo?.callback = this
    isClickable = false; isFocusable = false
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
  }
  override fun verifyDrawable(who: Drawable): Boolean = who === logo || super.verifyDrawable(who)
  override fun onDraw(canvas: Canvas) {
    canvas.drawColor(background)
    val size = (288f * resources.displayMetrics.density + 0.5f).toInt()
    val left = (width - size) / 2
    val top = (height - size) / 2
    // OEM splash icon dimensions can be 288dp rather than our old 192dp.
    // Reuse its real bounds so transfer never shrinks or recenters the mark.
    val bounds = markBounds ?: Rect(left, top, left + size, top + size)
    // This is the same stable vector the OS drew: no animator or scale
    // reset at handoff. Background and mark leave as one alpha layer.
    logo?.setBounds(bounds)
    logo?.draw(canvas)
  }
}

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
          // Keep the original animated Android splash until Home is prepared.
          exitSystemSplash = { success ->
            if (!exitStarted && host?.get() === activity) {
              exitStarted = true
              val decor = activity.window.decorView as? ViewGroup
              val surface = if (decor != null && decor.width > 0 && decor.height > 0)
                SofiaUnifiedSplashSurface(activity).also { view ->
                  // A ViewOverlay invalidates pixels without requesting a new
                  // layout of the already prepared React Home tree.
                  decor.overlay.add(view)
                  view.measure(
                    View.MeasureSpec.makeMeasureSpec(decor.width, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(decor.height, View.MeasureSpec.EXACTLY))
                  view.layout(0, 0, decor.width, decor.height)
                  view.matchSystemIcon(splash.iconView)
                }
              else null
              // The OS icon cannot remain as a separately composited layer.
              splash.iconView?.animate()?.cancel()
              splash.animate().cancel()
              splash.remove()
              record(activity, "SPLASH_REMOVED")
              exitSystemSplash = null
              removeSystemSplash = null
              if (surface == null) {
                removeSystemSplash = null
                completeReveal(activity, success)
              } else {
                var finished = false
                val complete = {
                  if (!finished) {
                    finished = true
                    surface.animate().cancel()
                    surface.alpha = 0f
                    decor?.overlay?.remove(surface)
                    removeSystemSplash = null
                    record(activity, "FADE_DONE")
                    completeReveal(activity, success)
                  }
                  Unit
                }
                // Preserve the stable mark size while both S and background
                // fade as a single compositor layer over the prepared Home.
                record(activity, "FADE_START")
                surface.animate().alpha(0f).setDuration(95L)
                  .setInterpolator(android.view.animation.AccelerateDecelerateInterpolator())
                  .withEndAction { complete() }.start()
                // Independent cleanup remains as a bounded fallback.
                surface.postDelayed({ complete() }, 180L)
              }
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
    // The Android 12+ system starting window has already been removed and
    // the single composed fade has completed. Waiting for ANOTHER frame here
    // stalled 500+ ms on overloaded emulators, despite Home being usable.
    // Older platforms still need their original frame fence.
    fun notifyReady() {
      if (host?.get() !== activity || activity.isFinishing || visible) return
      visible = true
      record(activity, if (success) "DATA" else "ERROR")
      val callbacks = visibleWaiting.toList(); visibleWaiting.clear()
      callbacks.forEach { it.resolve(success) }
      if (success) activity.reportFullyDrawn()
    }
    if (Build.VERSION.SDK_INT >= 31 && exitStarted) notifyReady()
    else activity.window.decorView.postOnAnimation { notifyReady() }
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
