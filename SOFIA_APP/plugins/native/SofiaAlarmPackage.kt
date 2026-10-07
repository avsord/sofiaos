package com.avsord.sofiaapp

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
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
/** Disposable cache only: never stores passwords/tokens and never edits server data. */
class SofiaSnapshotModule(private val app: ReactApplicationContext) : ReactContextBaseJavaModule(app) {
  private val io = Executors.newSingleThreadExecutor()
  private val alias = "sofia.cache.aes.v1"
  override fun getName() = "SofiaSnapshot"
  private fun file(scope: String): AtomicFile {
    require(scope.isNotEmpty() && scope.length <= 1024)
    val hash = MessageDigest.getInstance("SHA-256").digest(scope.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    return AtomicFile(File(app.noBackupFilesDir, "snapshot-" + hash))
  }
  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(alias, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }
  @ReactMethod fun read(scope: String, promise: Promise) { io.execute {
    try {
      val f = file(scope)
      if (!f.baseFile.exists()) { promise.resolve(null); return@execute }
      require(f.baseFile.length() <= 8 * 1024 * 1024)
      val bytes = f.readFully(); require(bytes.size > 28)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
      cipher.updateAAD(scope.toByteArray(Charsets.UTF_8))
      promise.resolve(String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8))
    } catch (_: Exception) { promise.resolve(null) } // Corrupt cache is a miss, not a logout.
  } }
  @ReactMethod fun write(scope: String, value: String, promise: Promise) { io.execute {
    try {
      val bytes = value.toByteArray(Charsets.UTF_8); require(bytes.size <= 6 * 1024 * 1024)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key())
      cipher.updateAAD(scope.toByteArray(Charsets.UTF_8))
      val encrypted = cipher.iv + cipher.doFinal(bytes)
      val f = file(scope); val stream = f.startWrite()
      try { stream.write(encrypted); f.finishWrite(stream) } catch (e: Exception) { f.failWrite(stream); throw e }
      promise.resolve(true)
    } catch (e: Exception) { promise.reject("SNAPSHOT_WRITE", e) }
  } }
  @ReactMethod fun remove(scope: String, promise: Promise) { io.execute {
    try { file(scope).delete(); promise.resolve(true) } catch (e: Exception) { promise.reject("SNAPSHOT_REMOVE", e) }
  } }
}
class SofiaAlarmPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(SofiaAlarmModule(context), SofiaSnapshotModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
