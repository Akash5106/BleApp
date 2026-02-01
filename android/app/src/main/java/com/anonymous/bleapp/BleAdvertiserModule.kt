package com.anonymous.bleapp

import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.os.ParcelUuid
import com.facebook.react.bridge.*
import java.util.*
import android.util.Log

class BleAdvertiserModule(
    reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    private val bluetoothAdapter: BluetoothAdapter? =
        (reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter

    private var advertiser: BluetoothLeAdvertiser? = null
    private var gattServer: BluetoothGattServer? = null
    private var localDeviceId: String? = null
    private var localDeviceName: String? = null

    private val bluetoothManager: BluetoothManager? =
        reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager

    private var advertisingPromise: Promise? = null

    companion object {
        private const val TAG = "BleAdvertiser"
        val SERVICE_UUID: UUID = UUID.fromString("0000FFF0-0000-1000-8000-00805F9B34FB")
        val CHAR_UUID: UUID = UUID.fromString("0000FFF1-0000-1000-8000-00805F9B34FB")
    }

    override fun getName(): String = "BleAdvertiser"

    @ReactMethod
    fun startAdvertising(deviceName: String, deviceId: String, promise: Promise) {
        try {
            localDeviceName = deviceName
            localDeviceId = deviceId

            if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled) {
                promise.reject("BLE", "Bluetooth not enabled")
                return
            }

            if (deviceName.isNotEmpty()) {
                bluetoothAdapter.name = deviceName
            }

            advertiser = bluetoothAdapter.bluetoothLeAdvertiser
            if (advertiser == null) {
                promise.reject("BLE", "Advertising not supported")
                return
            }

            advertisingPromise = promise
            setupGattServer()

        } catch (e: SecurityException) {
            promise.reject("PERMISSION_ERROR", "BLUETOOTH_CONNECT required")
        } catch (e: Exception) {
            promise.reject("BLE", e.message)
        }
    }

    private fun setupGattServer() {
        try {
            gattServer?.close()
            gattServer = null

            Log.d(TAG, "📡 Opening GATT server...")
            gattServer = bluetoothManager?.openGattServer(
                reactApplicationContext,
                gattServerCallback
            )

            if (gattServer == null) {
                Log.e(TAG, "❌ Failed to open GATT server")
                advertisingPromise?.reject("BLE", "Failed to open GATT server")
                advertisingPromise = null
                return
            }

            val characteristic = BluetoothGattCharacteristic(
                CHAR_UUID,
                BluetoothGattCharacteristic.PROPERTY_WRITE,
                BluetoothGattCharacteristic.PERMISSION_WRITE
            )

            val service = BluetoothGattService(
                SERVICE_UUID,
                BluetoothGattService.SERVICE_TYPE_PRIMARY
            )
            service.addCharacteristic(characteristic)

            Log.d(TAG, "➕ Adding GATT service...")
            gattServer?.addService(service)

        } catch (e: Exception) {
            Log.e(TAG, "❌ Error setting up GATT server", e)
            advertisingPromise?.reject("BLE", "GATT setup failed: ${e.message}")
            advertisingPromise = null
        }
    }

    private val gattServerCallback = object : BluetoothGattServerCallback() {

        override fun onServiceAdded(status: Int, service: BluetoothGattService?) {
            super.onServiceAdded(status, service)

            Log.d(TAG, "🔔 onServiceAdded - status: $status, UUID: ${service?.uuid}")

            if (status == BluetoothGatt.GATT_SUCCESS && service?.uuid == SERVICE_UUID) {
                startAdvertisingInternal()
            } else {
                advertisingPromise?.reject(
                    "BLE",
                    "Service add failed with status: $status"
                )
                advertisingPromise = null
            }
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
            if (characteristic?.uuid == CHAR_UUID) {

                val message = value?.let { String(it) } ?: ""
                val senderId = localDeviceId ?: device?.address ?: "unknown"
                val displayName = localDeviceName ?: "Unknown"

                Log.d(
                    TAG,
                    "📩 Received message: '$message' from $displayName (${device?.address})"
                )

                sendMessageToReactNative(message, displayName)

                if (responseNeeded) {
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
    }

    private fun startAdvertisingInternal() {
        try {
            val settings = AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .setConnectable(true)
                .setTimeout(0)
                .build()

            val data = AdvertiseData.Builder()
                .addServiceUuid(ParcelUuid(SERVICE_UUID))
                .setIncludeDeviceName(false)
                .build()

            val scanResponse = AdvertiseData.Builder()
                .setIncludeDeviceName(true)
                .build()

            advertiser?.startAdvertising(
                settings,
                data,
                scanResponse,
                advertiseCallback
            )

        } catch (e: Exception) {
            advertisingPromise?.reject(
                "BLE",
                "Advertising start failed: ${e.message}"
            )
            advertisingPromise = null
        }
    }

    private fun sendMessageToReactNative(message: String, deviceInfo: String) {
        val params = Arguments.createMap().apply {
            putString("message", message)
            putString("from", deviceInfo)
        }

        reactApplicationContext
            .getJSModule(
                com.facebook.react.modules.core.DeviceEventManagerModule
                    .RCTDeviceEventEmitter::class.java
            )
            .emit("onMessageReceived", params)
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
            advertisingPromise?.reject("BLE", "Advertising failed: $errorCode")
            advertisingPromise = null
        }

        override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
            advertisingPromise?.resolve("Advertising started")
            advertisingPromise = null
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}