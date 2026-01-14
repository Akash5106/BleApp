package com.bleapp

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
    private val bluetoothManager: BluetoothManager? =
        reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
   
    private var advertisingPromise: Promise? = null

    companion object {
        private const val TAG = "BleAdvertiser"
        val SERVICE_UUID: UUID = UUID.fromString("12345678-1234-1234-1234-123456789abc")
        val CHAR_UUID: UUID = UUID.fromString("87654321-4321-4321-4321-cba987654321")
    }

    override fun getName(): String = "BleAdvertiser"

    @ReactMethod
    fun startAdvertising(promise: Promise) {
        try {
            if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled) {
                promise.reject("BLE", "Bluetooth not enabled")
                return
            }

            Log.d(TAG, "✅ Starting BLE advertising setup...")
            Log.d(TAG, "Bluetooth enabled: ${bluetoothAdapter.isEnabled}")
            Log.d(TAG, "Supports advertising: ${bluetoothAdapter.isMultipleAdvertisementSupported}")

            bluetoothAdapter.name = "BleChat"
            Log.d(TAG, "Device name: BleChat")

            advertiser = bluetoothAdapter.bluetoothLeAdvertiser

            if (advertiser == null) {
                promise.reject("BLE", "Advertising not supported on this device")
                return
            }

            advertisingPromise = promise
            setupGattServer()

        } catch (e: Exception) {
            Log.e(TAG, "❌ Error in startAdvertising", e)
            promise.reject("BLE", "Failed to start: ${e.message}")
        }
    }

    private fun setupGattServer() {
        try {
            gattServer?.close()
            gattServer = null

            Log.d(TAG, "📡 Opening GATT server...")
            gattServer = bluetoothManager?.openGattServer(reactApplicationContext, gattServerCallback)

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
            val result = gattServer?.addService(service)
            Log.d(TAG, "Add service result: $result")

        } catch (e: Exception) {
            Log.e(TAG, "❌ Error setting up GATT server", e)
            advertisingPromise?.reject("BLE", "GATT setup failed: ${e.message}")
            advertisingPromise = null
        }
    }

    private val gattServerCallback = object : BluetoothGattServerCallback() {
       
        override fun onServiceAdded(status: Int, service: BluetoothGattService?) {
            super.onServiceAdded(status, service)
           
            Log.d(TAG, "🔔 onServiceAdded called - status: $status, service UUID: ${service?.uuid}")
           
            if (status == BluetoothGatt.GATT_SUCCESS && service?.uuid == SERVICE_UUID) {
                Log.d(TAG, "✅ GATT service added successfully!")
                startAdvertisingInternal()
            } else {
                Log.e(TAG, "❌ Service add failed - status: $status")
                advertisingPromise?.reject("BLE", "Service add failed with status: $status")
                advertisingPromise = null
            }
        }
       
        override fun onConnectionStateChange(device: BluetoothDevice?, status: Int, newState: Int) {
            super.onConnectionStateChange(device, status, newState)
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    Log.d(TAG, "📱 Device connected: ${device?.address}")
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    Log.d(TAG, "📱 Device disconnected: ${device?.address}")
                }
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
            super.onCharacteristicWriteRequest(device, requestId, characteristic, preparedWrite, responseNeeded, offset, value)
           
            Log.d(TAG, "📝 Write request - char UUID: ${characteristic?.uuid}")
           
            if (characteristic?.uuid == CHAR_UUID) {
                val message = value?.let { String(it) } ?: ""
                Log.d(TAG, "📩 Received message: '$message' from ${device?.address}")
               
                sendMessageToReactNative(message, device?.address ?: "Unknown")

                if (responseNeeded) {
                    gattServer?.sendResponse(
                        device,
                        requestId,
                        BluetoothGatt.GATT_SUCCESS,
                        0,
                        null
                    )
                    Log.d(TAG, "✅ Response sent")
                }
            }
        }
    }

    private fun startAdvertisingInternal() {
        try {
            Log.d(TAG, "🚀 Starting advertising (internal)...")
           
            val settings = AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .setConnectable(true)
                .setTimeout(0)
                .build()

            // Minimal data - just service UUID
            val data = AdvertiseData.Builder()
                .addServiceUuid(ParcelUuid(SERVICE_UUID))
                .setIncludeDeviceName(false)
                .setIncludeTxPowerLevel(false)
                .build()

            // Device name in scan response
            val scanResponse = AdvertiseData.Builder()
                .setIncludeDeviceName(true)
                .build()

            advertiser?.startAdvertising(settings, data, scanResponse, advertiseCallback)

        } catch (e: Exception) {
            Log.e(TAG, "❌ Error starting advertising", e)
            advertisingPromise?.reject("BLE", "Advertising start failed: ${e.message}")
            advertisingPromise = null
        }
    }

    private fun sendMessageToReactNative(message: String, deviceAddress: String) {
        try {
            val params = Arguments.createMap().apply {
                putString("message", message)
                putString("from", deviceAddress)
            }
           
            reactApplicationContext
                .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit("onMessageReceived", params)
           
            Log.d(TAG, "✅ Event sent to React Native")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to send event to RN", e)
        }
    }

    @ReactMethod
    fun stopAdvertising(promise: Promise) {
        try {
            advertiser?.stopAdvertising(advertiseCallback)
            gattServer?.close()
            gattServer = null
            Log.d(TAG, "⏹️ Advertising stopped")
            promise.resolve("Advertising stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping", e)
            promise.reject("BLE", "Stop failed: ${e.message}")
        }
    }

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartFailure(errorCode: Int) {
            val error = when (errorCode) {
                ADVERTISE_FAILED_DATA_TOO_LARGE -> "Data too large"
                ADVERTISE_FAILED_TOO_MANY_ADVERTISERS -> "Too many advertisers"
                ADVERTISE_FAILED_ALREADY_STARTED -> "Already started"
                ADVERTISE_FAILED_INTERNAL_ERROR -> "Internal error"
                ADVERTISE_FAILED_FEATURE_UNSUPPORTED -> "Feature unsupported"
                else -> "Unknown error: $errorCode"
            }
            Log.e(TAG, "❌ Advertise failed: $error (code: $errorCode)")
            advertisingPromise?.reject("BLE", "Advertising failed: $error")
            advertisingPromise = null
        }

        override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
            Log.d(TAG, "✅✅✅ ADVERTISING STARTED SUCCESSFULLY! ✅✅✅")
            Log.d(TAG, "Connectable: ${settingsInEffect.isConnectable}")
            Log.d(TAG, "Mode: ${settingsInEffect.mode}")
            advertisingPromise?.resolve("Advertising started successfully")
            advertisingPromise = null
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        Log.d(TAG, "Listener added: $eventName")
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        Log.d(TAG, "Removed $count listeners")
    }
}
