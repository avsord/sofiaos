package com.avsord.sofiaapp

import android.app.Activity
import android.graphics.Color
import android.view.Gravity
import android.view.ViewGroup
import android.view.View
import android.view.ViewTreeObserver
import android.os.SystemClock
import android.util.Log
import android.widget.FrameLayout
import android.widget.ImageView
import java.lang.ref.WeakReference
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** Cold-start handoff owned by Android.
 * It covers the gap between the OS splash and the first fully-themed React frame,
 * so the user never sees an intermediate light/dark shell or an empty window.
 */
object SofiaLaunchOverlay {
  private var overlay: WeakReference<FrameLayout>? = null
  private var observer: ViewTreeObserver? = null
  private var drawing: ViewTreeObserver.OnPreDrawListener? = null
  private var installedAt = 0L

  private fun ready(view: View, cover: View): Boolean {
    if (view === cover || view.visibility != View.VISIBLE || view.alpha <= 0f) return false
    val tag = view.getTag(com.facebook.react.R.id.view_tag_native_id) as? String
    if ((tag == "sofia-home-scroll" || tag == "sofia-login-ready" || tag == "sofia-launch-error") && view.width > 0 && view.height > 0) return true
    if (view is ViewGroup) for (i in 0 until view.childCount) if (ready(view.getChildAt(i), cover)) return true
    return false
  }

  fun install(activity: Activity) {
    val root = activity.window.decorView as? ViewGroup ?: return
    remove(overlay?.get())
    installedAt = SystemClock.elapsedRealtime()
    val layer = FrameLayout(activity).apply {
      setBackgroundColor(Color.parseColor("#7258E8"))
      isClickable = true
      isFocusable = true
    }
    val icon = ImageView(activity).apply {
      setImageResource(R.drawable.sofia_logo_foreground)
      scaleType = ImageView.ScaleType.CENTER_INSIDE
      contentDescription = null
    }
    val size = (104 * activity.resources.displayMetrics.density).toInt()
    layer.addView(icon, FrameLayout.LayoutParams(size, size, Gravity.CENTER))
    root.addView(layer, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    root.bringChildToFront(layer)
    overlay = WeakReference(layer)
    // Native layout is authoritative, including Activity recreation with an existing JS runtime.
    // No bridge callback, offscreen tab mount or network response is required to reveal Home.
    val listener = ViewTreeObserver.OnPreDrawListener {
      if (ready(root, layer)) remove(layer)
      true
    }
    observer = root.viewTreeObserver
    drawing = listener
    observer?.addOnPreDrawListener(listener)
    // Emergency escape only. A normal launch must be recorded as native-ready, never timeout.
    layer.postDelayed({
      if (overlay?.get() === layer) {
        Log.w("SofiaLaunch", "SOFIA_LAUNCH_TIMEOUT")
        remove(layer)
      }
    }, 5000)
  }

  private fun remove(view: FrameLayout?) {
    val current = view ?: overlay?.get() ?: return
    if (overlay?.get() !== current) return
    drawing?.let { listener -> if (observer?.isAlive == true) observer?.removeOnPreDrawListener(listener) }
    drawing = null
    observer = null
    (current.parent as? ViewGroup)?.removeView(current)
    overlay?.clear()
    Log.i("SofiaLaunch", "SOFIA_LAUNCH_REVEALED_MS=" + (SystemClock.elapsedRealtime() - installedAt))
  }

  fun hide(activity: Activity?) {
    val current = overlay?.get() ?: return
    val host = activity ?: (current.context as? Activity)
    if (host != null) host.runOnUiThread {
      val root = host.window.decorView
      if (ready(root, current)) remove(current)
    }
  }
}

class SofiaLaunchModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "SofiaLaunch"

  @ReactMethod
  fun hide(promise: Promise) {
    try {
      SofiaLaunchOverlay.hide(null)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("LAUNCH_HANDOFF", e)
    }
  }
}
