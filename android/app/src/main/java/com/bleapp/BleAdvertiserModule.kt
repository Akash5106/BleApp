package com.bleapp

import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.os.ParcelUuid
import android.util.Log
import com.facebook.react.bridge.*
import java.util.*

class BleAdvertiserModule(
    reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "BLE"
        private val SERVICE_UUID =
            UUID.fromString("12345678-1234-1234-1234-123456789abc")
        private val CHAR_UUID =
            UUID.fromString("87654321-4321-4321-4321-cba987654321")
    }

    private val bluetoothManager =
        reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager

    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager.adapter

    private var advertiser: BluetoothLeAdvertiser? = null
    private var gattServer: BluetoothGattServer? = null

    override fun getName(): String = "BleAdvertiser"

    // ================= GATT SERVER =================

    private val gattCallback = object : BluetoothGattServerCallback() {

        override fun onConnectionStateChange(device: BluetoothDevice?, status: Int, newState: Int) {
            super.onConnectionStateChange(device, status, newState)
            Log.d(TAG, "Connection state change: $newState from ${device?.address}")
        }

        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice?,
            requestId: Int,
            characteristic: BluetoothGattCharacteristic?,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray?
        ) {
            val msg = value?.toString(Charsets.UTF_8)
            Log.d(TAG, "🔥 RECEIVED: $msg")

            if (responseNeeded && device != null) {
                gattServer?.sendResponse(
                    device,
                    requestId,
                    BluetoothGatt.GATT_SUCCESS,
                    0,
                    null
                )
            }
        }
    }

    private fun startGattServer() {
        gattServer = bluetoothManager.openGattServer(reactApplicationContext, gattCallback)

        val service = BluetoothGattService(
            SERVICE_UUID,
            BluetoothGattService.SERVICE_TYPE_PRIMARY
        )

        val characteristic = BluetoothGattCharacteristic(
            CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE or
                    BluetoothGattCharacteristic.PROPERTY_NOTIFY,
            BluetoothGattCharacteristic.PERMISSION_WRITE
        )

        service.addCharacteristic(characteristic)
        gattServer?.addService(service)

        Log.d(TAG, "✅ GATT Server started")
    }

    // ================= ADVERTISING =================

    @ReactMethod
    fun startAdvertising(promise: Promise) {

        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled) {
            promise.reject("BLE", "Bluetooth not enabled")
            return
        }

        if (!bluetoothAdapter.isMultipleAdvertisementSupported) {
            promise.reject("BLE", "Advertising not supported")
            return
        }

        // 🔥 START GATT SERVER FIRST
        startGattServer()

        advertiser = bluetoothAdapter.bluetoothLeAdvertiser

        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .setConnectable(true)   // 🔥 MUST BE TRUE
            .build()

        val data = AdvertiseData.Builder()
            .addServiceUuid(ParcelUuid(SERVICE_UUID)) // 🔥 for scan filter
            .setIncludeDeviceName(false)              // keep packet small
            .build()

        advertiser?.startAdvertising(settings, data, advertiseCallback)

        Log.d(TAG, "✅ Advertising started")
        promise.resolve("Advertising started")
    }

    @ReactMethod
    fun stopAdvertising(promise: Promise) {
        advertiser?.stopAdvertising(advertiseCallback)
        gattServer?.close()
        gattServer = null
        promise.resolve("Advertising stopped")
    }

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartFailure(errorCode: Int) {
            Log.e(TAG, "❌ Advertise failed: $errorCode")
        }

        override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
            Log.d(TAG, "✅ Advertise success")
        }
    }
}
