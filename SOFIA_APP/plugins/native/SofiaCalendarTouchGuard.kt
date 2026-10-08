package com.avsord.sofiaapp

import android.graphics.Rect
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import kotlin.math.abs
import kotlin.math.roundToInt
import com.facebook.react.views.scroll.ReactHorizontalScrollView
import com.facebook.react.views.scroll.ReactScrollView
import com.facebook.react.views.swiperefresh.ReactSwipeRefreshLayout

/** Reserve the calendar and its appointment list before native gesture dispatch.
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
  private var appointmentList: ReactScrollView? = null
  private var homeRefresh: ReactSwipeRefreshLayout? = null
  private val verticalParents = mutableListOf<Pair<ReactScrollView, Boolean>>()
  private val refreshParents = mutableListOf<Pair<ReactSwipeRefreshLayout, Boolean>>()

  fun beforeDispatch(root: View, event: MotionEvent) {
    if (event.actionMasked == MotionEvent.ACTION_DOWN) {
      release()
      // Menu touches are outside the pager. Native navigation is dispatched
      // before React event delivery, even when JS is processing refreshed data.
      immediateMenu(root, event)
      downX = event.rawX; downY = event.rawY
      // Native wrappers can change after a keyboard/modal transition. Match the
      // visible Home independently of the pointer's edge and include the tagged
      // view itself when looking for its refresh control.
      val home = visibleHome(root)
      var refreshAncestor: View? = home
      while (refreshAncestor != null) {
        if (refreshAncestor is ReactSwipeRefreshLayout) {
          homeRefresh = refreshAncestor
          break
        }
        refreshAncestor = refreshAncestor.parent as? View
      }
      appointmentList = taggedAt(root, event.rawX.toInt(), event.rawY.toInt(), "sofia-agenda-items") as? ReactScrollView
      var listAncestor = appointmentList?.parent
      while (listAncestor != null) {
        if (listAncestor is ReactScrollView) verticalParents.add(listAncestor to listAncestor.scrollEnabled)
        if (listAncestor is ReactSwipeRefreshLayout && !listAncestor.isRefreshing) refreshParents.add(listAncestor to listAncestor.isEnabled)
        listAncestor = listAncestor.parent
      }
      val candidate = pagerAt(root, event.rawX.toInt(), event.rawY.toInt())
      menu = candidate?.takeIf { it.scrollEnabled }
      originX = menu?.scrollX ?: 0
      // Reserve the system-back edge. It must not become a menu swipe when
      // Android delivers/cancels the pointer stream during a back attempt.
      val location = IntArray(2); root.getLocationOnScreen(location)
      val xInWindow = event.rawX - location[0]
      val fallback = 24f * root.resources.displayMetrics.density
      val insets = if (android.os.Build.VERSION.SDK_INT >= 29) root.rootWindowInsets?.systemGestureInsets else null
      val leftEdge = maxOf(fallback, (insets?.left ?: 0).toFloat())
      val rightEdge = maxOf(fallback, (insets?.right ?: 0).toFloat())
      if (candidate != null && (xInWindow <= leftEdge || xInWindow >= root.width - rightEdge)) {
        pager = candidate
        wasEnabled = candidate.scrollEnabled
        menu = null
      }
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
    if (event.actionMasked == MotionEvent.ACTION_MOVE) {
      val view = menu
      val dx = abs(event.rawX - downX); val dy = abs(event.rawY - downY)
      if (view != null && view.scrollEnabled &&
          dx >= 12f * view.resources.displayMetrics.density && dx > dy * 1.5f) {
        // A vertical child may reserve the pointer before the horizontal pager
        // reaches its touch slop. Release that reservation only after direction
        // is clear; normal native interception emits the complete drag lifecycle.
        // Calendar, appointment-list and system-edge streams have no menu owner.
        view.requestDisallowInterceptTouchEvent(false)
      }
    }
    // RN can lay out its refresh wrapper during the stream. Reapply the
    // deliberate-pull distance before MOVE and UP as well as DOWN.
    homeRefresh?.let { view ->
      view.setDistanceToTriggerSync((112f * view.resources.displayMetrics.density).roundToInt())
    }
    pager?.setScrollEnabled(false)
    if (appointmentList != null) {
      // Do not donate unconsumed scroll/fling to Home at either list edge.
      appointmentList?.isNestedScrollingEnabled = false
      verticalParents.forEach { (view, _) -> view.setScrollEnabled(false) }
      refreshParents.forEach { (view, _) -> view.isEnabled = false }
      appointmentList?.parent?.requestDisallowInterceptTouchEvent(true)
    }
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
    verticalParents.forEach { (view, enabled) -> view.setScrollEnabled(enabled) }
    refreshParents.forEach { (view, enabled) -> view.isEnabled = enabled }
    appointmentList?.parent?.requestDisallowInterceptTouchEvent(false)
    appointmentList = null
    homeRefresh = null
    verticalParents.clear()
    refreshParents.clear()
  }


  private fun immediateMenu(root: View, event: MotionEvent) {
    val tab = menuAt(root, event.rawX.toInt(), event.rawY.toInt()) ?: return
    val index = (tab.getTag(com.facebook.react.R.id.view_tag_native_id) as? String)
      ?.removePrefix("sofia-menu-")?.toIntOrNull() ?: return
    if (index !in 0..5) return
    val view = taggedVisible(root, "sofia-tab-pager") as? ReactHorizontalScrollView ?: return
    if (view.width <= 0 || view.childCount == 0 || view.getChildAt(0).width < view.width * 6 - 2) return
    val started = android.os.SystemClock.uptimeMillis()
    // The inverted conversation is already at its newest message when revealed.
    if (index == 1) (taggedVisible(root, "sofia-chat-list", false) as? ReactScrollView)?.scrollTo(0, 0)
    view.scrollTo(index * view.width, 0)
    val bar = taggedVisible(root, "sofia-menu-bar") ?: root
    val names = arrayOf("home", "chat", "pages", "agenda", "apps", "profile")
    for (i in names.indices) {
      val value = if (i == index) 1f else 0f
      testView(bar, "menu-pill-" + names[i])?.let { it.alpha = value; it.scaleX = 1f; it.scaleY = 1f }
      testView(bar, "menu-symbol-" + names[i])?.alpha = value
      testView(bar, "menu-active-caption-" + names[i])?.alpha = value
      testView(bar, "menu-inactive-symbol-" + names[i])?.alpha = 1f - value
      testView(bar, "menu-inactive-caption-" + names[i])?.alpha = 1f - value
    }
    android.util.Log.i("SofiaMenu", "TOUCH_DOWN index=$index dispatchMs=" + (android.os.SystemClock.uptimeMillis() - started))
  }

  private fun menuAt(view: View, x: Int, y: Int): View? {
    if (view.visibility != View.VISIBLE || view.alpha <= 0f || !view.getGlobalVisibleRect(bounds) || !bounds.contains(x,y)) return null
    val tag = view.getTag(com.facebook.react.R.id.view_tag_native_id) as? String
    if (tag == "sofia-menu-blocked" || (tag != null && tag.matches(Regex("sofia-menu-[0-5]")))) return view
    if (view is ViewGroup) for (i in view.childCount-1 downTo 0) { val found = menuAt(view.getChildAt(i), x, y); if (found != null) return found }
    return null
  }
  private fun taggedVisible(view: View, id: String, visible: Boolean = true): View? {
    if (view.visibility != View.VISIBLE || (visible && (view.alpha <= 0f || !view.getGlobalVisibleRect(bounds)))) return null
    if (view.getTag(com.facebook.react.R.id.view_tag_native_id) == id) return view
    if (view is ViewGroup) for (i in view.childCount-1 downTo 0) { val found = taggedVisible(view.getChildAt(i), id, visible); if (found != null) return found }
    return null
  }
  private fun testView(view: View, id: String): View? {
    if (view.getTag(com.facebook.react.R.id.react_test_id) == id) return view
    if (view is ViewGroup) for (i in view.childCount-1 downTo 0) { val found = testView(view.getChildAt(i), id); if (found != null) return found }
    return null
  }

  private fun visibleHome(view: View): View? {
    if (view.visibility != View.VISIBLE || view.alpha <= 0f || !view.getGlobalVisibleRect(bounds)) return null
    if (view.getTag(com.facebook.react.R.id.view_tag_native_id) == "sofia-home-scroll" ||
        view.getTag(com.facebook.react.R.id.react_test_id) == "home-scroll") return view
    if (view is ViewGroup) for (index in view.childCount-1 downTo 0) {
      val found = visibleHome(view.getChildAt(index))
      if (found != null) return found
    }
    return null
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

  private fun taggedAt(view: View, x: Int, y: Int, tag: String): View? {
    if (view.visibility != View.VISIBLE || view.alpha <= 0f || !view.getGlobalVisibleRect(bounds) || !bounds.contains(x,y)) return null
    if (view.getTag(com.facebook.react.R.id.view_tag_native_id) == tag) return view
    if (view is ViewGroup) for (index in view.childCount-1 downTo 0) {
      val found = taggedAt(view.getChildAt(index),x,y,tag)
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
