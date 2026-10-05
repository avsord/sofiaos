package com.avsord.sofiaapp

import android.graphics.Rect
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import com.facebook.react.views.scroll.ReactHorizontalScrollView

/** Reserve only the outer horizontal pager for a touch that starts in a calendar.
 * Runs on the UI thread before dispatch, so a fast MOVE cannot beat a JS state update.
 * Vertical scrolling, day presses, long presses, and accessibility remain untouched.
 */
internal class SofiaCalendarTouchGuard {
  private var pager: ReactHorizontalScrollView? = null
  private var wasEnabled = false
  private val bounds = Rect()

  fun beforeDispatch(root: View, event: MotionEvent) {
    if (event.actionMasked == MotionEvent.ACTION_DOWN) {
      release()
      val calendar = calendarAt(root, event.rawX.toInt(), event.rawY.toInt())
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
    if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) release()
  }

  fun release() {
    pager?.setScrollEnabled(wasEnabled)
    pager = null
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
