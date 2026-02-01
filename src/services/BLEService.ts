// ============================================================================
// BLE SERVICE - FINAL COMPLETE VERSION
// Handles Bluetooth Low Energy scanning, advertising, and packet exchange
// ============================================================================

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import BleManager from 'react-native-ble-manager';
import { MeshPacket, BLEDevice } from '../types';
import MeshProtocolService from './MeshProtocolService';

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

// Get native advertiser module
const { BleAdvertiser } = NativeModules;
const bleAdvertiserEmitter = BleAdvertiser ? new NativeEventEmitter(BleAdvertiser) : null;

// Mesh UUIDs
const MESH_SERVICE_UUID = '0000FFF0-0000-1000-8000-00805F9B34FB';
const MESH_CHARACTERISTIC_UUID = '0000FFF1-0000-1000-8000-00805F9B34FB';

class BLEService {
  private isScanning = false;
  private discoveredDevices = new Map<string, BLEDevice>();
  private scanListeners: Array<(devices: BLEDevice[]) => void> = [];
  private deviceId: string = '';
  private deviceName: string = '';

  // =========================================================================
  // INITIALIZATION
  // =========================================================================
  async init(): Promise<void> {
    try {
      console.log('🚀 Initializing BLE Service...');

      // Start BLE Manager
      await BleManager.start({ showAlert: false });
      console.log('✅ BLE Manager started');

      // Enable Bluetooth (Android)
      if (Platform.OS === 'android') {
        try {
          await BleManager.enableBluetooth();
          console.log('✅ Bluetooth enabled');
        } catch (error) {
          console.log('⚠️ Bluetooth already enabled or user denied');
        }
      }

      // Setup BLE Manager event listeners
      this.setupBleManagerListeners();

      // Setup native advertiser event listeners
      this.setupAdvertiserListeners();

      console.log('✅ BLE Service initialized');
    } catch (error) {
      console.error('❌ BLE Service init failed:', error);
      throw error;
    }
  }

  // =========================================================================
  // ADVERTISING (PERIPHERAL MODE)
  // =========================================================================
  /**
   * Start advertising with device name and node ID
   */
  async startAdvertising(deviceId: string, deviceName?: string): Promise<void> {
    try {
      this.deviceId = deviceId;
      this.deviceName = deviceName || `Mesh-${deviceId}`;

      console.log('📡 Starting BLE advertising...');
      console.log('Device ID:', this.deviceId);
      console.log('Device Name:', this.deviceName);

      if (Platform.OS === 'android' && BleAdvertiser) {
        // Use native Android module
        await BleAdvertiser.startAdvertising(this.deviceName, this.deviceId);
        console.log('✅ Android advertising started');
      } else if (Platform.OS === 'ios') {
        // iOS peripheral mode
        await this.startAdvertisingIOS();
        console.log('✅ iOS advertising started');
      } else {
        console.warn('⚠️ Advertising not available on this platform');
      }
    } catch (error) {
      console.error('❌ Failed to start advertising:', error);
      throw error;
    }
  }

  /**
   * Stop advertising
   */
  async stopAdvertising(): Promise<void> {
    try {
      if (Platform.OS === 'android' && BleAdvertiser) {
        await BleAdvertiser.stopAdvertising();
        console.log('⏹️ Advertising stopped');
      }
    } catch (error) {
      console.error('❌ Failed to stop advertising:', error);
    }
  }

  /**
   * iOS advertising (placeholder)
   */
  private async startAdvertisingIOS(): Promise<void> {
    console.log('📡 [iOS] Peripheral mode not yet implemented');
    // TODO: Implement iOS CoreBluetooth peripheral mode
  }

  // =========================================================================
  // SCANNING (CENTRAL MODE)
  // =========================================================================
  /**
   * Start scanning for nearby devices
   */
  // =========================================================================
// SCANNING (CENTRAL MODE)
// =========================================================================
/**
 * Start scanning for nearby devices
 */

async startScan(): Promise<void> {
  try {
    if (this.isScanning) return;

    // STEP 1: Check Bluetooth State before doing anything
    const isEnabled = await this.isBluetoothEnabled();
    if (!isEnabled) {
      console.warn('📡 Bluetooth is not enabled. Aborting scan.');
    }

    // STEP 2: Stop Native Advertising and WAIT for it to actually release the radio
    if (Platform.OS === 'android' && BleAdvertiser) {
      await BleAdvertiser.stopAdvertising();
      // Added a small 200ms sleep to let the hardware stabilize
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
    }

    this.isScanning = true;
    this.discoveredDevices.clear();

    // STEP 3: Scan specifically for our Service UUID
    // Ensure MESH_SERVICE_UUID is exactly '0000FFF0-0000-1000-8000-00805F9B34FB'
    await BleManager.scan({serviceUUIDs:[MESH_SERVICE_UUID], seconds:5, allowDuplicates:true});

    // STEP 4: Automatically restart advertising after the 5s scan period
    setTimeout(async () => {
      await this.startAdvertising(this.deviceId, this.deviceName);
    }, 5100);

  } catch (error) {
    console.error('❌ Root Scan Error:', error);
    this.isScanning = false;
  }
}

  /**
   * Stop scanning
   */
  async stopScan(): Promise<void> {
    try {
      await BleManager.stopScan();
      this.isScanning = false;
      console.log('⏹️ Scan stopped');
    } catch (error) {
      console.error('❌ Failed to stop scan:', error);
    }
  }

  // =========================================================================
  // EVENT LISTENERS - BLE MANAGER
  // =========================================================================
  private setupBleManagerListeners(): void {
    // Device discovered during scan
    bleManagerEmitter.addListener(
      'BleManagerDiscoverPeripheral',
      this.onDeviceDiscovered.bind(this)
    );

    // Scan stopped
    bleManagerEmitter.addListener('BleManagerStopScan', () => {
      this.isScanning = false;
      console.log('🔍 Scan completed');
    });

    // Characteristic value updated
    bleManagerEmitter.addListener(
      'BleManagerDidUpdateValueForCharacteristic',
      ({ value, characteristic, peripheral }) => {
        console.log('📩 Characteristic updated:', characteristic, 'from', peripheral);
        if (characteristic === MESH_CHARACTERISTIC_UUID) {
          this.onPacketReceived(value);
        }
      }
    );

    // Device connected
    bleManagerEmitter.addListener('BleManagerConnectPeripheral', (args) => {
      console.log('🔗 Connected to:', args.peripheral);
    });

    // Device disconnected
    bleManagerEmitter.addListener('BleManagerDisconnectPeripheral', (args) => {
      console.log('🔌 Disconnected from:', args.peripheral);
    });

    console.log('✅ BLE Manager listeners registered');
  }

  // =========================================================================
  // EVENT LISTENERS - NATIVE ADVERTISER
  // =========================================================================
  private setupAdvertiserListeners(): void {
    if (!bleAdvertiserEmitter) {
      console.log('⚠️ Native advertiser module not available');
      return;
    }

    // Packet received from native module
    bleAdvertiserEmitter.addListener('onPacketReceived', (event) => {
      console.log('📦 Packet received from native:', event.deviceName);
      try {
        const packet: MeshPacket = JSON.parse(event.packet);
        console.log('📥 Packet parsed:', packet.msg_id);
        MeshProtocolService.onPacketReceived(packet);
      } catch (error) {
        console.error('❌ Error parsing packet:', error);
      }
    });

    // Connection state changed
    bleAdvertiserEmitter.addListener('onConnectionChange', (event) => {
      console.log('🔄 Connection:', event.device, event.connected ? 'connected' : 'disconnected');
    });

    console.log('✅ Advertiser listeners registered');
  }

  // =========================================================================
  // DEVICE DISCOVERY
  // =========================================================================
  private onDeviceDiscovered(device: any): void {
  const advertisedUUIDs: string[] =
    device.advertising?.serviceUUIDs ??
    device.advertising?.serviceUuids ??
    [];

  const normalizedUUIDs = advertisedUUIDs.map(uuid =>
    uuid.toLowerCase()
  );

  const meshUUID = MESH_SERVICE_UUID.toLowerCase();

  const isMeshDevice =
    normalizedUUIDs.includes(meshUUID) ||
    normalizedUUIDs.some(uuid => uuid.endsWith('fff0'));

  if (!isMeshDevice) {
    return; // ignore non-mesh devices
  }

  const bleDevice: BLEDevice = {
    id: device.id,
    name:
      device.name ||
      device.advertising?.localName ||
      'Unknown',
    rssi: device.rssi,
  };

  this.discoveredDevices.set(device.id, bleDevice);
  this.notifyScanListeners();
}

  /**
   * Read packet from connected device
   */
  private async readPacketFromDevice(deviceId: string): Promise<void> {
    try {
      // Connect to device
      await BleManager.connect(deviceId);
      console.log('🔗 Connected to', deviceId);

      // Retrieve services
      await BleManager.retrieveServices(deviceId);
      console.log('📋 Services retrieved');

      // Read characteristic
      const data = await BleManager.read(
        deviceId,
        MESH_SERVICE_UUID,
        MESH_CHARACTERISTIC_UUID
      );
      console.log('📖 Data read from device');

      // Process received data
      this.onPacketReceived(data);

      // Disconnect
      await BleManager.disconnect(deviceId);
      console.log('🔌 Disconnected from', deviceId);
    } catch (error) {
      console.warn('⚠️ Read from device failed:', error);
      // Try to disconnect anyway
      try {
        await BleManager.disconnect(deviceId);
      } catch (e) {
        // Ignore disconnect errors
      }
    }
  }

  // =========================================================================
  // PACKET HANDLING
  // =========================================================================
  /**
   * Advertise packet to nearby devices
   */
  async advertisePacket(packet: MeshPacket): Promise<void> {
    try {
      const payload = JSON.stringify(packet);
      const bytes = this.stringToBytes(payload);

      console.log('📡 Advertising packet:', packet.msg_id);

      if (Platform.OS === 'android') {
        await this.advertiseAndroid(bytes);
      } else {
        await this.advertiseIOS(bytes);
      }
    } catch (error) {
      console.error('❌ Failed to advertise packet:', error);
    }
  }

  /**
   * Android packet advertising (placeholder)
   */
  private async advertiseAndroid(_bytes: number[]): Promise<void> {
    console.log('📡 [Android] Packet advertising (requires connected clients)');
    // In Android, packets are sent via GATT writes when clients connect
    // This is handled by the native module
  }

  /**
   * iOS packet advertising (placeholder)
   */
  private async advertiseIOS(_bytes: number[]): Promise<void> {
    console.log('📡 [iOS] Packet advertising (not yet implemented)');
    // TODO: Implement iOS packet broadcasting
  }

  /**
   * Handle received packet
   */
  private onPacketReceived(data: number[]): void {
    try {
      const packetString = this.bytesToString(data);
      const packet: MeshPacket = JSON.parse(packetString);
      
      console.log('📥 Packet received:', packet.msg_id);
      console.log('From:', packet.src_id, 'To:', packet.dest_id);

      // Pass to mesh protocol for routing
      MeshProtocolService.onPacketReceived(packet);
    } catch (error) {
      console.error('❌ Invalid mesh packet:', error);
    }
  }

  // =========================================================================
  // CONNECTION MANAGEMENT
  // =========================================================================
  /**
   * Connect to a device
   */
  async connectToDevice(deviceId: string): Promise<void> {
    try {
      console.log('🔗 Connecting to:', deviceId);
      await BleManager.connect(deviceId);
      console.log('✅ Connected');

      // Retrieve services
      await BleManager.retrieveServices(deviceId);
      console.log('✅ Services retrieved');
    } catch (error) {
      console.error('❌ Connection failed:', error);
      throw error;
    }
  }

  /**
   * Disconnect from a device
   */
  async disconnectFromDevice(deviceId: string): Promise<void> {
    try {
      await BleManager.disconnect(deviceId);
      console.log('🔌 Disconnected from:', deviceId);
    } catch (error) {
      console.error('❌ Disconnect failed:', error);
    }
  }

  /**
   * Write packet to connected device
   */
  async writePacketToDevice(deviceId: string, packet: MeshPacket): Promise<void> {
    try {
      const packetJson = JSON.stringify(packet);
      const bytes = this.stringToBytes(packetJson);

      console.log('✍️ Writing packet to:', deviceId);

      await BleManager.write(
        deviceId,
        MESH_SERVICE_UUID,
        MESH_CHARACTERISTIC_UUID,
        bytes
      );

      console.log('✅ Packet written successfully');
    } catch (error) {
      console.error('❌ Write failed:', error);
      throw error;
    }
  }

  // =========================================================================
  // HELPERS
  // =========================================================================
  /**
   * Convert string to byte array
   */
  private stringToBytes(str: string): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < str.length; i++) {
      bytes.push(str.charCodeAt(i));
    }
    return bytes;
  }

  /**
   * Convert byte array to string
   */
  private bytesToString(bytes: number[]): string {
    return String.fromCharCode(...bytes);
  }

  /**
   * Check if Bluetooth is enabled
   */
  async isBluetoothEnabled(): Promise<boolean> {
    try {
      const state = await BleManager.checkState();
      return state === 'on';
    } catch (error) {
      console.error('❌ Failed to check Bluetooth state:', error);
      return false;
    }
  }

  /**
   * Get connected devices
   */
  async getConnectedDevices(): Promise<any[]> {
    try {
      return await BleManager.getConnectedPeripherals([]);
    } catch (error) {
      console.error('❌ Failed to get connected devices:', error);
      return [];
    }
  }

  // =========================================================================
  // SUBSCRIPTIONS
  // =========================================================================
  /**
   * Subscribe to scan updates
   */
  onScanUpdate(callback: (devices: BLEDevice[]) => void): () => void {
    this.scanListeners.push(callback);
    return () => {
      this.scanListeners = this.scanListeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Notify all scan listeners
   */
  private notifyScanListeners(): void {
    const devices = Array.from(this.discoveredDevices.values());
    this.scanListeners.forEach(callback => callback(devices));
  }

  /**
   * Get discovered devices
   */
  getDiscoveredDevices(): BLEDevice[] {
    return Array.from(this.discoveredDevices.values());
  }
}

export default new BLEService();