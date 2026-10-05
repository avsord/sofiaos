package com.avsord.sofiaapp

import android.graphics.Rect
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import kotlin.math.abs
import kotlin.math.roundToInt
import com.facebook.react.views.scroll.ReactHorizontalScrollView

/** Reserve only the outer horizontal pager for a touch that starts in a calendar.
 * Runs on the UI thread before dispatch, so a fast MOVE cannot beat a JS state update.
 * Vertical scrolling, day presses, long presses, and accessibility remain untouched.
 */
internal class SofiaCalendarTouchGuard {
  private var pager: ReactHorizontalScrollView? = null
  private var wasEnabled = false
  private var menu: ReactHorizontalScrollView? = null
  private var downX = 0f
  private var downY = 0f
  private var originX = 0
  private val bounds = Rect()

  fun beforeDispatch(root: View, event: MotionEvent) {
    if (event.actionMasked == MotionEvent.ACTION_DOWN) {
      release()
      downX = event.rawX; downY = event.rawY
      val candidate = pagerAt(root, event.rawX.toInt(), event.rawY.toInt())
      menu = candidate?.takeIf { it.scrollEnabled }
      originX = menu?.scrollX ?: 0
      val calendar = calendarAt(root, event.rawX.toInt(), event.rawY.toInt())
      if (calendar != null) menu = null
      var ancestor = calendar?.parent
      while (ancestor != null) {
        if (ancestor is ReactHorizontalScrollView) {
          pager = ancestor
          wasEnabled = ancestor.scrollEnabled
          break
        }
        ancestor = ancestor.parent
      }
    }
    pager?.setScrollEnabled(false)
  }

  fun afterDispatch(event: MotionEvent) {
    if (event.actionMasked == MotionEvent.ACTION_UP) {
      val view = menu
      val dx = downX - event.rawX; val dy = event.rawY - downY
      if (view != null && view.scrollEnabled && view.width > 0 &&
          abs(dx) >= 18f * view.resources.displayMetrics.density && abs(dx) > abs(dy) * 1.5f &&
          abs(view.scrollX - originX) > 1) {
        // Finish a short, deliberate drag on the UI thread, even if Android's
        // minimum fling velocity was not reached. The RN pager owns animation
        // and momentum events; no JS timer or competing scrollTo is started.
        val direction = if (dx > 0) 1 else -1
        val originPage = (originX.toFloat() / view.width).roundToInt()
        val currentPage = view.scrollX.toFloat() / view.width
        if (abs(currentPage - originPage) < 0.95f) view.fling(direction * maxOf(1000, view.width * 3))
      }
    }
    if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) release()
  }

  fun release() {
    pager?.setScrollEnabled(wasEnabled)
    pager = null
    menu = null
  }

  private fun pagerAt(view: View, x: Int, y: Int): ReactHorizontalScrollView? {
    if (view.visibility != View.VISIBLE || view.alpha <= 0f || !view.getGlobalVisibleRect(bounds) || !bounds.contains(x,y)) return null
    if (view is ReactHorizontalScrollView && view.getTag(com.facebook.react.R.id.view_tag_native_id) == "sofia-tab-pager") return view
    if (view is ViewGroup) for (index in view.childCount-1 downTo 0) {
      val found = pagerAt(view.getChildAt(index),x,y)
      if (found != null) return found
    }
    return null
  }

  private fun calendarAt(view: View, x: Int, y: Int): View? {
    if (view.visibility != View.VISIBLE || view.alpha <= 0f || !view.getGlobalVisibleRect(bounds) || !bounds.contains(x,y)) return null
    if (view.getTag(com.facebook.react.R.id.view_tag_native_id) == "sofia-calendar-gesture") return view
    if (view is ViewGroup) {
      for (index in view.childCount-1 downTo 0) {
        val found = calendarAt(view.getChildAt(index),x,y)
        if (found != null) return found
      }
    }
    return null
  }
}
