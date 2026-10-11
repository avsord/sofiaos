'use strict';
const {withMainActivity,withDangerousMod}=require('expo/config-plugins');
const fs=require('fs'),path=require('path');
module.exports=config=>{
 config=withMainActivity(config,c=>{
  if(c.modResults.language!=='kt')throw Error('Calendar gesture requires the Kotlin activity');
  const marker='class MainActivity : ReactActivity() {';
  if(!c.modResults.contents.includes('private val calendarTouchGuard')){
   if(!c.modResults.contents.includes(marker))throw Error('MainActivity insertion point changed');
   c.modResults.contents=c.modResults.contents.replace(marker,marker+`
  private val calendarTouchGuard = SofiaCalendarTouchGuard()

  override fun dispatchTouchEvent(event: android.view.MotionEvent): Boolean {
    calendarTouchGuard.beforeDispatch(window.decorView, event)
    return try { super.dispatchTouchEvent(event) }
    finally { calendarTouchGuard.afterDispatch(event) }
  }

  override fun onPause() {
    calendarTouchGuard.release()
    super.onPause()
  }
`);
  }
  return c;
 });
 return withDangerousMod(config,['android',async c=>{
  const target=path.join(c.modRequest.platformProjectRoot,'app/src/main/java/com/avsord/sofiaapp/SofiaCalendarTouchGuard.kt');
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(path.join(__dirname,'native/SofiaCalendarTouchGuard.kt'),target);
  return c;
 }]);
};
