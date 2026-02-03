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
    private val bluetoothManager: BluetoothManager? =
        reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
   
    private var advertisingPromise: Promise? = null
    
    // Store incoming message fragments
    private val messageBuffer = mutableMapOf<String, StringBuilder>()

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
                BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
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
           
            Log.d(TAG, "🔔 onServiceAdded called - status: $status")
           
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
                    // Request larger MTU for bigger messages
                    gattServer?.connect(device, false)
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    Log.d(TAG, "📱 Device disconnected: ${device?.address}")
                    // Clear buffer for this device
                    device?.address?.let { messageBuffer.remove(it) }
                }
            }
        }
        
        override fun onMtuChanged(device: BluetoothDevice?, mtu: Int) {
            super.onMtuChanged(device, mtu)
            Log.d(TAG, "📏 MTU changed to $mtu for ${device?.address}")
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
           
            if (characteristic?.uuid == CHAR_UUID && value != null) {
                val deviceAddr = device?.address ?: "Unknown"
                val chunk = String(value, Charsets.UTF_8)
                
                Log.d(TAG, "📝 Write request - offset: $offset, prepared: $preparedWrite")
                Log.d(TAG, "📝 Chunk length: ${chunk.length}")
                Log.d(TAG, "📝 Chunk: $chunk")
                
                if (offset == 0) {
                    // Start of new message
                    messageBuffer[deviceAddr] = StringBuilder(chunk)
                    Log.d(TAG, "📦 New message started")
                } else {
                    // Continuation of message
                    messageBuffer[deviceAddr]?.append(chunk)
                    Log.d(TAG, "📦 Message chunk appended")
                }
                
                // Check if message is complete (contains closing brace)
                val currentMessage = messageBuffer[deviceAddr]?.toString() ?: ""
                
                if (!preparedWrite && currentMessage.isNotEmpty()) {
                    // Message complete
                    Log.d(TAG, "✅ Complete message received: $currentMessage")
                    
                    val deviceName = device?.name ?: deviceAddr
                    sendMessageToReactNative(currentMessage, deviceName)
                    
                    // Clear buffer
                    messageBuffer.remove(deviceAddr)
                }

                if (responseNeeded) {
                    gattServer?.sendResponse(
                        device,
                        requestId,
                        BluetoothGatt.GATT_SUCCESS,
                        offset,
                        value
                    )
                }
            }
        }
        
        override fun onExecuteWrite(device: BluetoothDevice?, requestId: Int, execute: Boolean) {
            super.onExecuteWrite(device, requestId, execute)
            
            val deviceAddr = device?.address ?: "Unknown"
            
            if (execute) {
                // Execute prepared writes - message is complete
                val completeMessage = messageBuffer[deviceAddr]?.toString() ?: ""
                
                if (completeMessage.isNotEmpty()) {
                    Log.d(TAG, "✅ Execute write - complete message: $completeMessage")
                    
                    val deviceName = device?.name ?: deviceAddr
                    sendMessageToReactNative(completeMessage, deviceName)
                }
            }
            
            // Clear buffer
            messageBuffer.remove(deviceAddr)
            
            gattServer?.sendResponse(
                device,
                requestId,
                BluetoothGatt.GATT_SUCCESS,
                0,
                null
            )
        }
    }

    private fun startAdvertisingInternal() {
        try {
            Log.d(TAG, "🚀 Starting advertising...")
           
            val settings = AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .setConnectable(true)
                .setTimeout(0)
                .build()

            val data = AdvertiseData.Builder()
                .addServiceUuid(ParcelUuid(SERVICE_UUID))
                .setIncludeDeviceName(false)
                .setIncludeTxPowerLevel(false)
                .build()

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

    private fun sendMessageToReactNative(message: String, deviceInfo: String) {
        try {
            Log.d(TAG, "🚀 Sending to React Native...")
            Log.d(TAG, "Message length: ${message.length}")
            Log.d(TAG, "Message: $message")
            
            val params = Arguments.createMap().apply {
                putString("message", message)
                putString("from", deviceInfo)
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
            messageBuffer.clear()
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
            Log.e(TAG, "❌ Advertise failed: $error")
            advertisingPromise?.reject("BLE", "Advertising failed: $error")
            advertisingPromise = null
        }

        override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
            Log.d(TAG, "✅ ADVERTISING STARTED!")
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