package com.avsord.sofiaapp

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.NativeModule
import com.facebook.react.uimanager.ViewManager

class SofiaAlarmModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "SofiaAlarms"
  @ReactMethod fun canScheduleExact(promise: Promise) {
    try { val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      promise.resolve(Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager.canScheduleExactAlarms())
    } catch (e: Exception) { promise.reject("ALARM_PERMISSION", e) }
  }
  @ReactMethod fun openExactSettings(promise: Promise) {
    try { val action = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM else Settings.ACTION_APPLICATION_DETAILS_SETTINGS
      context.startActivity(Intent(action, Uri.parse("package:" + context.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      promise.resolve(true)
    } catch (e: Exception) { promise.reject("ALARM_SETTINGS", e) }
  }
}
class SofiaAlarmPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(SofiaAlarmModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
