package com.avsord.sofiaapp

import android.app.Activity
import android.os.SystemClock
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** Android already owns the system splash. Do not add a second logo overlay or
 * intercept touches while cached Home and other screens are being restored. */
object SofiaLaunchOverlay {
  private var startedAt = 0L
  private var reported = false

  fun install(activity: Activity) {
    startedAt = SystemClock.elapsedRealtime()
    reported = false
    Log.i("SofiaLaunch", "activity-created")
  }

  fun hide(activity: Activity?) {
    if (reported) return
    reported = true
    // This is the first committed app surface, NOT proof of remote data readiness.
    Log.i("SofiaLaunch", "first-ui-commit-ms=" + (SystemClock.elapsedRealtime() - startedAt))
  }
}

class SofiaLaunchModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "SofiaLaunch"
  @ReactMethod fun hide(promise: Promise) {
    try {
      SofiaLaunchOverlay.hide(null)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("LAUNCH_HANDOFF", e)
    }
  }
}
