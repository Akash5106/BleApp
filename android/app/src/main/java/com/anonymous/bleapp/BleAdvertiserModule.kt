package com.anonymous.bleapp

import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.os.Handler
import android.os.Looper
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
    private val mainHandler = Handler(Looper.getMainLooper())

    // ✅ ADDITIVE: track connected central devices (does not affect receive path)
    private val connectedDevices = mutableSetOf<BluetoothDevice>()

    companion object {
        private const val TAG = "BleAdvertiser"
        private const val INIT_TIMEOUT_MS = 10000L // 10 second timeout
        val SERVICE_UUID: UUID = UUID.fromString("0000FFF0-0000-1000-8000-00805F9B34FB")
        val CHAR_UUID: UUID = UUID.fromString("0000FFF1-0000-1000-8000-00805F9B34FB")
    }

    override fun getName(): String = "BleAdvertiser"

    @ReactMethod
    fun startAdvertising(deviceName: String, deviceId: String, promise: Promise) {
        Log.d(TAG, "▶️ startAdvertising() called — name: $deviceName, id: $deviceId")
        try {
            localDeviceName = deviceName
            localDeviceId = deviceId

            if (bluetoothAdapter == null) {
                Log.e(TAG, "❌ BluetoothAdapter is null")
                promise.reject("BLE", "Bluetooth adapter not available")
                return
            }

            if (!bluetoothAdapter.isEnabled) {
                Log.e(TAG, "❌ Bluetooth is not enabled")
                promise.reject("BLE", "Bluetooth not enabled")
                return
            }

            Log.d(TAG, "✅ Bluetooth is enabled")

            if (deviceName.isNotEmpty()) {
                try {
                    bluetoothAdapter.name = deviceName
                    Log.d(TAG, "✅ Set adapter name to: $deviceName")
                } catch (e: SecurityException) {
                    Log.w(TAG, "⚠️ Could not set adapter name (permission issue)")
                }
            }

            advertiser = bluetoothAdapter.bluetoothLeAdvertiser
            if (advertiser == null) {
                Log.e(TAG, "❌ BLE Advertiser is null — device may not support peripheral mode")
                promise.reject("BLE", "Advertising not supported on this device")
                return
            }

            Log.d(TAG, "✅ Got BLE Advertiser")

            advertisingPromise = promise

            // Set a timeout in case callbacks never fire
            mainHandler.postDelayed({
                if (advertisingPromise != null) {
                    Log.e(TAG, "⏰ Timeout waiting for GATT/advertising setup")
                    advertisingPromise?.reject("BLE", "Timeout during advertising setup")
                    advertisingPromise = null
                }
            }, INIT_TIMEOUT_MS)

            setupGattServer()

        } catch (e: SecurityException) {
            Log.e(TAG, "❌ SecurityException: ${e.message}")
            promise.reject("PERMISSION_ERROR", "BLUETOOTH_CONNECT required: ${e.message}")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Exception: ${e.message}", e)
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

        // ✅ ADDITIVE: track connections (no impact on writes/reads)
        override fun onConnectionStateChange(
            device: BluetoothDevice,
            status: Int,
            newState: Int
        ) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                connectedDevices.add(device)
                Log.d(TAG, "🔗 Device connected: ${device.address}")
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                connectedDevices.remove(device)
                Log.d(TAG, "🔌 Device disconnected: ${device.address}")
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
        Log.d(TAG, "📡 startAdvertisingInternal() — beginning BLE advertisement")
        try {
            val settings = AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .setConnectable(true)
                .setTimeout(0)
                .build()

            Log.d(TAG, "✅ AdvertiseSettings built — mode: LOW_LATENCY, power: HIGH, connectable: true")

            val data = AdvertiseData.Builder()
                .addServiceUuid(ParcelUuid(SERVICE_UUID))
                .setIncludeDeviceName(false)
                .build()

            Log.d(TAG, "✅ AdvertiseData built — serviceUUID: $SERVICE_UUID")

            // Include SERVICE_UUID in scan response too for better discovery
            // Some scanners only receive scan response, not main advertisement
            val scanResponse = AdvertiseData.Builder()
                .addServiceUuid(ParcelUuid(SERVICE_UUID))
                .setIncludeDeviceName(true)
                .build()

            Log.d(TAG, "✅ ScanResponse built — serviceUUID + deviceName included")

            advertiser?.startAdvertising(
                settings,
                data,
                scanResponse,
                advertiseCallback
            )

            Log.d(TAG, "📡 startAdvertising() called on advertiser")

        } catch (e: Exception) {
            Log.e(TAG, "❌ startAdvertisingInternal failed: ${e.message}", e)
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
            .emit("onPacketReceived", params)
    }

    @ReactMethod
    fun stopAdvertising(promise: Promise) {
        advertiser?.stopAdvertising(advertiseCallback)
        gattServer?.close()
        gattServer = null
        connectedDevices.clear()
        promise.resolve("Advertising stopped")
    }

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartFailure(errorCode: Int) {
            val errorMsg = when (errorCode) {
                ADVERTISE_FAILED_ALREADY_STARTED -> "ALREADY_STARTED"
                ADVERTISE_FAILED_DATA_TOO_LARGE -> "DATA_TOO_LARGE"
                ADVERTISE_FAILED_FEATURE_UNSUPPORTED -> "FEATURE_UNSUPPORTED"
                ADVERTISE_FAILED_INTERNAL_ERROR -> "INTERNAL_ERROR"
                ADVERTISE_FAILED_TOO_MANY_ADVERTISERS -> "TOO_MANY_ADVERTISERS"
                else -> "UNKNOWN ($errorCode)"
            }
            Log.e(TAG, "❌ Advertising failed: $errorMsg (code: $errorCode)")
            cancelTimeoutAndReject("Advertising failed: $errorMsg")
        }

        override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
            Log.d(TAG, "✅ Advertising started successfully!")
            Log.d(TAG, "   Mode: ${settingsInEffect.mode}, TxPower: ${settingsInEffect.txPowerLevel}")
            // Cancel timeout and resolve
            mainHandler.removeCallbacksAndMessages(null)
            advertisingPromise?.resolve("Advertising started")
            advertisingPromise = null
        }
    }

    private fun cancelTimeoutAndReject(errorMsg: String) {
        mainHandler.removeCallbacksAndMessages(null)
        advertisingPromise?.reject("BLE", errorMsg)
        advertisingPromise = null
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}