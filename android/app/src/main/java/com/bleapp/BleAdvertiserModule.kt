package com.bleapp

import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.os.ParcelUuid
import com.facebook.react.bridge.*
import java.util.*

class BleAdvertiserModule(
    reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    private val bluetoothAdapter: BluetoothAdapter? =
        (reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter

    private var advertiser: BluetoothLeAdvertiser? = null

    override fun getName(): String = "BleAdvertiser"

    @ReactMethod
    fun startAdvertising(promise: Promise) {

        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled) {
            promise.reject("BLE", "Bluetooth not enabled")
            return
        }

        advertiser = bluetoothAdapter.bluetoothLeAdvertiser

        if (advertiser == null) {
            promise.reject("BLE", "Advertising not supported")
            return
        }

        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .setConnectable(false)
            .build()

        val uuid = UUID.fromString("12345678-1234-1234-1234-123456789abc")

        val data = AdvertiseData.Builder()
            .addServiceUuid(ParcelUuid(uuid))
            .setIncludeDeviceName(false)
            .build()

        advertiser?.startAdvertising(settings, data, advertiseCallback)
        promise.resolve("Advertising started")
    }

    @ReactMethod
    fun stopAdvertising(promise: Promise) {
        advertiser?.stopAdvertising(advertiseCallback)
        promise.resolve("Advertising stopped")
    }

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartFailure(errorCode: Int) {
            println("BLE Advertise failed: $errorCode")
        }

        override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
            println("BLE Advertise success")
        }
    }
}
