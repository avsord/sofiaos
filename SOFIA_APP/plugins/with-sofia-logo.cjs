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
 write('drawable/sofia_launch_mark.xml',`<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="96" android:viewportHeight="96"><path android:fillColor="#7258E8" android:pathData="M48,17 A31,31 0,1 1,47.99,17 Z"/><group android:name="sofiaLetterMotion" android:pivotX="48" android:pivotY="48"><group android:scaleX="0.0256689159" android:scaleY="-0.0256757730" android:translateX="29.02543638" android:translateY="64.14633546"><path android:fillColor="#FFFFFF" android:pathData="${d}"/></group></group></vector>`);
 write('values/sofia-launch-colors.xml','<resources><color name="sofiaLaunchBackground">#F7F6FA</color></resources>');
 write('values-night/sofia-launch-colors.xml','<resources><color name="sofiaLaunchBackground">#17151F</color></resources>');
 for(const folder of fs.readdirSync(res).filter(x=>x.startsWith('drawable-'))){const p=path.join(res,folder,'splashscreen_logo.png');if(fs.existsSync(p))fs.unlinkSync(p);}
 // The original S animates during native splash, without extending its lifetime.
 // A Telegram-like entrance: the actual S swings and scales into place while
 // the purple circle stays anchored. A missing animation still shows the
 // correctly centered, fully opaque, static S.
 write('animator/sofia_letter_motion.xml',`<set xmlns:android="http://schemas.android.com/apk/res/android" android:ordering="together"><objectAnimator android:propertyName="rotation" android:valueFrom="-18" android:valueTo="0" android:valueType="floatType" android:duration="180" android:interpolator="@android:interpolator/overshoot"/><objectAnimator android:propertyName="scaleX" android:valueFrom="0.78" android:valueTo="1" android:valueType="floatType" android:duration="180" android:interpolator="@android:interpolator/overshoot"/><objectAnimator android:propertyName="scaleY" android:valueFrom="0.78" android:valueTo="1" android:valueType="floatType" android:duration="180" android:interpolator="@android:interpolator/overshoot"/></set>`);
 write('drawable-v31/sofia_launch_mark_animated.xml',`<animated-vector xmlns:android="http://schemas.android.com/apk/res/android" android:drawable="@drawable/sofia_launch_mark"><target android:name="sofiaLetterMotion" android:animation="@animator/sofia_letter_motion"/></animated-vector>`);
 write('drawable/splashscreen_logo.xml','<layer-list xmlns:android="http://schemas.android.com/apk/res/android"><item android:drawable="@color/sofiaLaunchBackground"/><item android:width="192dp" android:height="192dp" android:gravity="center" android:drawable="@drawable/sofia_launch_mark"/></layer-list>');
 // On Android 12+, the Activity window MUST have a plain-color background.
 // A second S in android:windowBackground stays underneath the OS splash and
 // resurfaces independently when its background fades away.
 // On Android 11 and earlier the legacy layer-list remains available only
 // as the original starting surface and is cleared on reveal.
 // The launch icon is a vector at every scale; the OS keeps its standard animation.
 write('values-v31/sofia-splash.xml','<resources><style name="Theme.App.SplashScreen" parent="AppTheme"><item name="android:windowBackground">@color/sofiaLaunchBackground</item><item name="android:windowSplashScreenBackground">@color/sofiaLaunchBackground</item><item name="android:windowSplashScreenAnimatedIcon">@drawable/sofia_launch_mark_animated</item><item name="android:windowSplashScreenAnimationDuration">180</item></style></resources>');
 for(const name of ['ic_launcher.xml','ic_launcher_round.xml']){const p=path.join(res,'mipmap-anydpi-v26',name);if(fs.existsSync(p))fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('@mipmap/ic_launcher_foreground','@drawable/sofia_logo_foreground'));}
 // The generated legacy background must not treat the vector/layer-list as a bitmap.
 write('drawable/ic_launcher_background.xml','<layer-list xmlns:android="http://schemas.android.com/apk/res/android"><item android:drawable="@color/iconBackground"/></layer-list>');
 return c;
}]);
