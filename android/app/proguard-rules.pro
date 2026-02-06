# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:

# react-native-ble-manager
-keep class it.innove.** { *; }

# react-native-ble-plx
-keep class com.bleplx.** { *; }
-keep class com.polidea.rxandroidble2.** { *; }

# react-native-sqlite-storage
-keep class org.pgsqlite.** { *; }

# Custom native BLE advertiser module
-keep class com.anonymous.bleapp.BleAdvertiserModule { *; }
-keep class com.anonymous.bleapp.BleAdvertiserPackage { *; }

# Hermes
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }
