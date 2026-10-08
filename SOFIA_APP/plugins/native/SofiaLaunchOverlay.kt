package com.avsord.sofiaapp

import android.app.Activity
import android.graphics.Color
import android.view.Gravity
import android.view.ViewGroup
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
  private var overlay = WeakReference<FrameLayout>(null)

  fun install(activity: Activity) {
    val root = activity.window.decorView as? ViewGroup ?: return
    overlay.get()?.let { old ->
      (old.parent as? ViewGroup)?.removeView(old)
    }
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
    // Never mask a real crash forever. React normally removes this in a fraction of a second.
    layer.postDelayed({ remove(layer) }, 5000)
  }

  private fun remove(view: FrameLayout?) {
    val current = view ?: overlay.get() ?: return
    (current.parent as? ViewGroup)?.removeView(current)
    if (overlay.get() === current) overlay.clear()
  }

  fun hide(activity: Activity?) {
    val current = overlay.get() ?: return
    (activity ?: current.context as? Activity)?.runOnUiThread { remove(current) } ?: remove(current)
  }
}

class SofiaLaunchModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "SofiaLaunch"

  @ReactMethod
  fun hide(promise: Promise) {
    try {
      SofiaLaunchOverlay.hide(currentActivity)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("LAUNCH_HANDOFF", e)
    }
  }
}
