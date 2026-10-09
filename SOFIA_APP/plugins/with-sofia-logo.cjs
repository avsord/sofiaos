'use strict';
const {withDangerousMod}=require('expo/config-plugins');
const fs=require('fs'),path=require('path');
module.exports=config=>withDangerousMod(config,['android',async c=>{
 const res=path.join(c.modRequest.platformProjectRoot,'app/src/main/res');
 const svg=fs.readFileSync(path.join(c.modRequest.projectRoot,'assets/adaptive-foreground.svg'),'utf8');
 const d=svg.match(/<path d="([^"]+)"/)[1];
 const vector=background=>`<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="96" android:viewportHeight="96">${background?'<path android:fillColor="#7258E8" android:pathData="M0,0h96v96h-96z"/>':''}<path android:fillColor="#00000000" android:strokeColor="#24FFFFFF" android:strokeWidth="0.65" android:pathData="M48,6.5 A41.5,41.5 0,1 1,47.99,6.5 Z"/><group android:scaleX="0.0256689159" android:scaleY="-0.0256757730" android:translateX="29.02543638" android:translateY="64.14633546"><path android:fillColor="#FFFFFF" android:pathData="${d}"/></group></vector>`;
 const write=(rel,data)=>{const p=path.join(res,rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,data);};
 write('drawable/sofia_logo.xml',vector(true));write('drawable/sofia_logo_foreground.xml',vector(false));
 // Restore the circular Brand mark only on launch; retain the launcher icon.
 // Android's splash wrapper expands the foreground by 1.5. Author the mark
 // for that viewport so the visible circle is 67dp and the white S is 32dp.
 write('drawable/sofia_launch_mark.xml',`<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="192dp" android:height="192dp" android:viewportWidth="192" android:viewportHeight="192"><path android:fillColor="#00000000" android:strokeColor="#12FFFFFF" android:strokeWidth="0.5" android:pathData="M96,73.6 A22.4,22.4 0,1 1,95.99,73.6 Z"/><group android:name="sofiaLetterMotion" android:pivotX="96" android:pivotY="96"><group android:scaleX="0.013772326" android:scaleY="-0.013772326" android:translateX="85.86357" android:translateY="106.26727"><path android:fillColor="#FFFFFF" android:pathData="${d}"/></group></group></vector>`);
 write('values/sofia-launch-colors.xml','<resources><color name="sofiaLaunchBackground">#7258E8</color></resources>');
 write('values-night/sofia-launch-colors.xml','<resources><color name="sofiaLaunchBackground">#7258E8</color></resources>');
 for(const folder of fs.readdirSync(res).filter(x=>x.startsWith('drawable-'))){const p=path.join(res,folder,'splashscreen_logo.png');if(fs.existsSync(p))fs.unlinkSync(p);}
 // Hold the system S at the same scale during transfer. Breathing starts on
 // the retained native surface; there is no entrance rotation or scale reset.
 write('animator/sofia_letter_motion.xml',`<set xmlns:android="http://schemas.android.com/apk/res/android" android:ordering="together"><objectAnimator android:propertyName="scaleX" android:valueFrom="1" android:valueTo="1.025" android:valueType="floatType" android:duration="800" android:repeatCount="-1" android:repeatMode="reverse" android:interpolator="@android:interpolator/accelerate_decelerate"/><objectAnimator android:propertyName="scaleY" android:valueFrom="1" android:valueTo="1.025" android:valueType="floatType" android:duration="800" android:repeatCount="-1" android:repeatMode="reverse" android:interpolator="@android:interpolator/accelerate_decelerate"/></set>`);
 write('drawable-v31/sofia_launch_mark_animated.xml',`<animated-vector xmlns:android="http://schemas.android.com/apk/res/android" android:drawable="@drawable/sofia_launch_mark"><target android:name="sofiaLetterMotion" android:animation="@animator/sofia_letter_motion"/></animated-vector>`);
 // A small repeating S scale stays on RenderThread during Home loading.
 write('animator/sofia_letter_breath.xml',`<set xmlns:android="http://schemas.android.com/apk/res/android" android:ordering="together"><objectAnimator android:propertyName="scaleX" android:valueFrom="1" android:valueTo="1.025" android:valueType="floatType" android:duration="800" android:repeatCount="-1" android:repeatMode="reverse" android:interpolator="@android:interpolator/accelerate_decelerate"/><objectAnimator android:propertyName="scaleY" android:valueFrom="1" android:valueTo="1.025" android:valueType="floatType" android:duration="800" android:repeatCount="-1" android:repeatMode="reverse" android:interpolator="@android:interpolator/accelerate_decelerate"/></set>`);
 write('drawable/sofia_launch_mark_breathing.xml',`<animated-vector xmlns:android="http://schemas.android.com/apk/res/android" android:drawable="@drawable/sofia_launch_mark"><target android:name="sofiaLetterMotion" android:animation="@animator/sofia_letter_breath"/></animated-vector>`);
 write('drawable/splashscreen_logo.xml','<layer-list xmlns:android="http://schemas.android.com/apk/res/android"><item android:drawable="@color/sofiaLaunchBackground"/><item android:width="288dp" android:height="288dp" android:gravity="center" android:drawable="@drawable/sofia_launch_mark"/></layer-list>');
 // On Android 12+, the Activity window MUST have a plain-color background.
 // A second S in android:windowBackground stays underneath the OS splash and
 // resurfaces independently when its background fades away.
 // On Android 11 and earlier the legacy layer-list remains available only
 // as the original starting surface and is cleared on reveal.
 // The launch icon is a vector at every scale; the OS keeps its standard animation.
 write('values-v31/sofia-splash.xml','<resources><style name="Theme.App.SplashScreen" parent="AppTheme"><item name="android:windowBackground">@color/sofiaLaunchBackground</item><item name="android:windowSplashScreenBackground">@color/sofiaLaunchBackground</item><item name="android:windowSplashScreenAnimatedIcon">@drawable/sofia_launch_mark_animated</item><item name="android:windowSplashScreenAnimationDuration">800</item><item name="android:statusBarColor">@color/sofiaLaunchBackground</item><item name="android:navigationBarColor">@color/sofiaLaunchBackground</item></style></resources>');
 for(const name of ['ic_launcher.xml','ic_launcher_round.xml']){const p=path.join(res,'mipmap-anydpi-v26',name);if(fs.existsSync(p))fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('@mipmap/ic_launcher_foreground','@drawable/sofia_logo_foreground'));}
 // The generated legacy background must not treat the vector/layer-list as a bitmap.
 write('drawable/ic_launcher_background.xml','<layer-list xmlns:android="http://schemas.android.com/apk/res/android"><item android:drawable="@color/iconBackground"/></layer-list>');
 return c;
}]);
