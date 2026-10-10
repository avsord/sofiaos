package com.avsord.sofiaapp

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.HardwareRenderer
import android.graphics.PixelFormat
import android.graphics.RenderNode
import android.hardware.HardwareBuffer
import android.media.ImageReader
import android.graphics.RectF
import android.graphics.Typeface
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

/** Prepare the original static splash pixels before Home is ready. Fade one
 * cached native surface; optional work waits for visual completion. */
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
    SofiaHomeDrawingWarmup.start(activity.resources.displayMetrics.scaledDensity)
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
          val icon = splash.iconView
          Log.i("SofiaLaunch", "SOFIA_LAUNCH_ICON_KIND=${icon?.javaClass?.simpleName}")
          // Copy the exact initial system pixels before its bitmap is recycled.
          // Prepare a visible single draw layer now, well before Home is ready.
          val decor = activity.window.decorView as ViewGroup
          val iconPosition = IntArray(2)
          val decorPosition = IntArray(2)
          decor.getLocationOnScreen(decorPosition)
          icon?.getLocationOnScreen(iconPosition)
          val pixels = if (icon != null && icon.width > 0 && icon.height > 0) {
            Bitmap.createBitmap(icon.width, icon.height, Bitmap.Config.ARGB_8888).also {
              icon.draw(Canvas(it))
            }
          } else null
          val surface = SofiaEarlySplashSurface(activity, pixels,
            (iconPosition[0] - decorPosition[0]).toFloat(),
            (iconPosition[1] - decorPosition[1]).toFloat())
          decor.overlay.add(surface)
          surface.measure(View.MeasureSpec.makeMeasureSpec(decor.width, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(decor.height, View.MeasureSpec.EXACTLY))
          surface.layout(0, 0, decor.width, decor.height)
          // Scale is painted from one finite UI clock. The native property
          // animator is reserved for alpha, avoiding a live scale animator
          // during the Home/fade handoff.
          var finished = false
          fun disposeSurface() {
            surface.alpha = 0f
            surface.animate().cancel()
            decor.overlay.remove(surface)
          }
          removeSystemSplash = { finished = true; disposeSurface(); splash.remove() }
          exitSystemSplash = { success ->
            if (!exitStarted && host?.get() === activity) {
              exitStarted = true
              // The same opaque layer has already painted over the static icon.
              // Remove Android's window before fading, without allocating a view.
              splash.remove()
              record(activity, "SPLASH_REMOVED")
              val complete = {
                if (!finished) {
                  finished = true
                  disposeSurface()
                  record(activity, "FADE_DONE")
                  exitSystemSplash = null
                  removeSystemSplash = null
                  completeReveal(activity, success)
                }
                Unit
              }
              record(activity, "FADE_START")
              surface.animate().alpha(0f).setDuration(140L)
                .setInterpolator(android.view.animation.AccelerateDecelerateInterpolator())
                .withEndAction { complete() }.start()
              surface.postDelayed({ complete() }, 210L)
            }
            Unit
          }
          when (transition.splashReady()) {
            SofiaLaunchTransition.Exit.SYSTEM_SPLASH -> exitSystemSplash?.invoke(!failed)
            SofiaLaunchTransition.Exit.REMOVE_STALE_SPLASH -> {
              removeSystemSplash?.invoke(); removeSystemSplash = null; exitSystemSplash = null
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
    // underlying prepared Home draws during the 140-ms fade.
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

/** Preserve the captured system pixels; one finite Canvas scale, alpha-only exit. */
private class SofiaEarlySplashSurface(
  activity: Activity,
  private val pixels: Bitmap?,
  private val markLeft: Float,
  private val markTop: Float
) : View(activity) {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
  private val startedAt = SystemClock.uptimeMillis()
  private val backgroundColor = android.graphics.Color.rgb(114, 88, 232)
  init {
    // Enter Android's composed-alpha path on the early visible frame,
    // not for the first time when Home is ready. Over the matching original
    // splash, 254/255 differs by at most one 8-bit channel step.
    alpha = 254f / 255f
  }
  val markCenterX = markLeft + (pixels?.width ?: 0) / 2f
  val markCenterY = markTop + (pixels?.height ?: 0) / 2f
  override fun onDraw(canvas: Canvas) {
    canvas.drawColor(backgroundColor)
    val now = SystemClock.uptimeMillis()
    val scale = SofiaLaunchMotion.scaleAt(startedAt, now) / 0.88f
    canvas.save()
    canvas.scale(scale, scale, markCenterX, markCenterY)
    pixels?.let { canvas.drawBitmap(it, markLeft, markTop, paint) }
    canvas.restore()
    if (now - startedAt < SofiaLaunchMotion.DURATION_MS && alpha > 0f)
      postInvalidateOnAnimation()
  }


}

/** Warm the shared Android render context without work in the S animation. */
private object SofiaHomeDrawingWarmup {
  private var scheduled = false
  @Synchronized fun start(scaledDensity: Float) {
    if (scheduled || Build.VERSION.SDK_INT < 31) return
    scheduled = true
    // Called before Activity.super.onCreate, so React and shader preparation
    // can proceed together. No UI readiness, I/O or animation waits on this.
    Thread({
      var reader: ImageReader? = null
      var renderer: HardwareRenderer? = null
      var scene: RenderNode? = null
      try {
        val target = ImageReader.newInstance(192, 192, PixelFormat.RGBA_8888, 2,
          HardwareBuffer.USAGE_GPU_SAMPLED_IMAGE or HardwareBuffer.USAGE_GPU_COLOR_OUTPUT)
        reader = target
        val content = RenderNode("SofiaHomeDrawingWarmup")
        scene = content
        content.setPosition(0, 0, 192, 192)
        val painter = HardwareRenderer()
        renderer = painter
        painter.setName("SofiaHomeDrawingWarmup")
        painter.setOpaque(true)
        painter.setSurface(target.surface)
        painter.setContentRoot(content)
        val canvas = content.beginRecording()
        recordPrograms(canvas, scaledDensity)
        content.endRecording()
        // One offscreen frame only. Wait on THIS worker, consume it promptly,
        // then release every resource. Never wait on the UI/React/data worker.
        val result = painter.createRenderRequest().setWaitForPresent(true).syncAndDraw()
        target.acquireNextImage()?.close()
        Log.i("SofiaLaunch", "SOFIA_DRAW_WARM_PROCESS_MS=${SystemClock.uptimeMillis() - Process.getStartUptimeMillis()} RESULT=$result")
      } catch (error: Throwable) {
        // Optional optimization: platform/driver failure retains normal launch.
        Log.w("SofiaLaunch", "Drawing preparation unavailable", error)
      } finally {
        renderer?.destroy()
        scene?.discardDisplayList()
        reader?.close()
      }
    }, "SofiaHomeDrawingWarmup").start()
  }

  private fun recordPrograms(canvas: Canvas, scaledDensity: Float) {
    canvas.drawColor(android.graphics.Color.rgb(24, 22, 30))
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG).apply {
      color = android.graphics.Color.rgb(181, 160, 255)
      textSize = 18f * scaledDensity
      typeface = Typeface.DEFAULT
    }
    canvas.drawCircle(24f, 24f, 14f, paint)
    paint.style = Paint.Style.STROKE
    paint.strokeWidth = 1f
    canvas.drawCircle(24f, 24f, 14f, paint)
    paint.style = Paint.Style.FILL
    val rounded = RectF(52f, 8f, 118f, 40f)
    canvas.drawRoundRect(rounded, 10f, 10f, paint)
    paint.style = Paint.Style.STROKE
    canvas.drawRoundRect(rounded, 10f, 10f, paint)
    paint.style = Paint.Style.FILL
    canvas.drawText("Olá, Sofia. Agenda", 4f, 74f, paint)
    paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    canvas.drawText("Conversa", 4f, 106f, paint)
    // Match both ordinary opaque/transparent fills and AA coverage variants.
    paint.isAntiAlias = false
    canvas.drawRect(4f, 112f, 20f, 128f, paint)
    paint.alpha = 128
    canvas.drawRect(28f, 112f, 44f, 128f, paint)
    paint.isAntiAlias = true
    paint.alpha = 255
    canvas.drawRect(52.25f, 112.25f, 68.75f, 128.75f, paint)
    paint.alpha = 128
    canvas.drawRect(76.25f, 112.25f, 92.75f, 128.75f, paint)
    // Prepare the bitmap/alpha composition used by the single S surface too.
    val sample = Bitmap.createBitmap(8, 8, Bitmap.Config.ARGB_8888)
    sample.setPixel(4, 4, android.graphics.Color.WHITE)
    val layer = canvas.saveLayerAlpha(4f, 136f, 28f, 160f, 254)
    canvas.drawBitmap(sample, 8.25f, 140.25f,
      Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
    canvas.restoreToCount(layer)
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
