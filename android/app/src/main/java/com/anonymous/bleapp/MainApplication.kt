package com.anonymous.bleapp

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.anonymous.bleapp.BleAdvertiserPackage

class MainApplication : Application(), ReactApplication {

override val reactHost: ReactHost by lazy {
    // 1. Get the autolinked packages
    val packages = PackageList(this).packages.toMutableList()
    
    // 2. Manually add your new Bluetooth package
    packages.add(BleAdvertiserPackage()) 
    
    getDefaultReactHost(
      context = applicationContext,
      packageList = packages
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}