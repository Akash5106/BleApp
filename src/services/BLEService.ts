// ============================================================================
// BLE SERVICE
// Handles Bluetooth Low Energy scanning and packet exchange
// ============================================================================

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import BleManager from 'react-native-ble-manager';
import { MeshPacket, BLEDevice } from '../types';
import MeshProtocolService from './MeshProtocolService';

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

// Mesh UUIDs
const MESH_SERVICE_UUID = '0000FFF0-0000-1000-8000-00805F9B34FB';
const MESH_CHARACTERISTIC_UUID = '0000FFF1-0000-1000-8000-00805F9B34FB';

class BLEService {
  private isScanning = false;
  private discoveredDevices = new Map<string, BLEDevice>();
  private scanListeners: Array<(devices: BLEDevice[]) => void> = [];

  // =========================================================================
  // INIT
  // =========================================================================
  async init(): Promise<void> {
    await BleManager.start({ showAlert: false });

    if (Platform.OS === 'android') {
      await BleManager.enableBluetooth();
    }

    this.setupEventListeners();
    console.log('✅ BLE Service initialized');
  }

  // =========================================================================
  // EVENT LISTENERS
  // =========================================================================
  private setupEventListeners(): void {
    bleManagerEmitter.addListener(
      'BleManagerDiscoverPeripheral',
      this.onDeviceDiscovered.bind(this)
    );

    bleManagerEmitter.addListener('BleManagerStopScan', () => {
      this.isScanning = false;
      console.log('🔍 Scan stopped');
    });

    bleManagerEmitter.addListener(
      'BleManagerDidUpdateValueForCharacteristic',
      ({ value, characteristic }) => {
        if (characteristic === MESH_CHARACTERISTIC_UUID) {
          this.onPacketReceived(value);
        }
      }
    );
  }

  // =========================================================================
  // SCANNING
  // =========================================================================
async startScan(): Promise<void> {
  if (this.isScanning) return;
  this.discoveredDevices.clear();
  await BleManager.scan({serviceUUIDs: [],seconds: 5,allowDuplicates: true,});
  this.isScanning = true;
  console.log('🔍 Started scanning');
}

  // =========================================================================
  // DEVICE DISCOVERY
  // =========================================================================
  private onDeviceDiscovered(device: any): void {
    const bleDevice: BLEDevice = {
      id: device.id,
      name: device.name ?? 'Unknown',
      rssi: device.rssi,
    };

    this.discoveredDevices.set(device.id, bleDevice);
    this.notifyScanListeners();

    // Prototype-only: read packet via GATT
    this.readPacketFromDevice(device.id);
  }

  private async readPacketFromDevice(deviceId: string): Promise<void> {
    try {
      await BleManager.connect(deviceId);
      await BleManager.retrieveServices(deviceId);

      const data = await BleManager.read(
        deviceId,
        MESH_SERVICE_UUID,
        MESH_CHARACTERISTIC_UUID
      );

      await BleManager.disconnect(deviceId);
      this.onPacketReceived(data);
    } catch (err) {
      console.warn('⚠️ Read failed:', err);
    }
  }

  // =========================================================================
  // PACKETS
  // =========================================================================
  async advertisePacket(packet: MeshPacket): Promise<void> {
    const payload = JSON.stringify(packet);
    const bytes = this.stringToBytes(payload);

    if (Platform.OS === 'android') {
      await this.advertiseAndroid(bytes);
    } else {
      await this.advertiseIOS(bytes);
    }

    console.log('📡 Advertised:', packet.msg_id);
  }

  private async advertiseAndroid(_: number[]): Promise<void> {
    // Requires react-native-ble-advertiser
    console.log('📡 [Android] Advertising (placeholder)');
  }

  private async advertiseIOS(_: number[]): Promise<void> {
    console.log('📡 [iOS] Advertising (placeholder)');
  }

  private onPacketReceived(data: number[]): void {
    try {
      const packet = JSON.parse(this.bytesToString(data)) as MeshPacket;
      MeshProtocolService.onPacketReceived(packet);
    } catch {
      console.error('❌ Invalid mesh packet');
    }
  }

  // =========================================================================
  // HELPERS
  // =========================================================================
  private stringToBytes(str: string): number[] {
    return Array.from(str).map(c => c.charCodeAt(0));
  }

  private bytesToString(bytes: number[]): string {
    return String.fromCharCode(...bytes);
  }

  // =========================================================================
  // SUBSCRIPTIONS
  // =========================================================================
  onScanUpdate(cb: (devices: BLEDevice[]) => void): () => void {
    this.scanListeners.push(cb);
    return () => {
      this.scanListeners = this.scanListeners.filter(x => x !== cb);
    };
  }

  private notifyScanListeners(): void {
    const devices = Array.from(this.discoveredDevices.values());
    this.scanListeners.forEach(cb => cb(devices));
  }
}

export default new BLEService();