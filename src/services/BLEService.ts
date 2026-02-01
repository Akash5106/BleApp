// ============================================================================
// BLE SERVICE - FINAL COMPLETE VERSION
// Handles Bluetooth Low Energy scanning, advertising, and packet exchange
// ============================================================================

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import BleManager from 'react-native-ble-manager';
import { MeshPacket, BLEDevice } from '../types';
import MeshProtocolService from './MeshProtocolService';
import { MESH_CONFIG } from '../constants';

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

// Native advertiser (Android)
const { BleAdvertiser } = NativeModules;
const bleAdvertiserEmitter = BleAdvertiser
  ? new NativeEventEmitter(BleAdvertiser)
  : null;

class BLEService {
  private isScanning = false;
  private discoveredDevices = new Map<string, BLEDevice>();
  private scanListeners: Array<(devices: BLEDevice[]) => void> = [];

  private deviceId: string = '';
  private deviceName: string = '';
  private isAdvertising = false;

  // 🔵 Cached Bluetooth state (from events)
  private bluetoothEnabled = false;

  // =========================================================================
  // INITIALIZATION
  // =========================================================================
  async init(): Promise<void> {
    try {
      console.log('🚀 Initializing BLE Service...');

      await BleManager.start({ showAlert: false });
      await BleManager.checkState();
      console.log('✅ BLE Manager started');

      if (Platform.OS === 'android') {
        try {
          await BleManager.enableBluetooth();
          console.log('✅ Bluetooth enabled');
        } catch {
          console.log('⚠️ Bluetooth already enabled or user denied');
        }
      }

      this.setupBleManagerListeners();
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
  async startAdvertising(deviceId: string, deviceName?: string): Promise<void> {
    try {
      this.deviceId = deviceId;
      this.deviceName = deviceName || `Mesh-${deviceId}`;

      console.log('📡 Starting BLE advertising...');
      console.log('Device ID:', this.deviceId);
      console.log('Device Name:', this.deviceName);

      if (Platform.OS === 'android' && BleAdvertiser) {
        await BleAdvertiser.startAdvertising(this.deviceName, this.deviceId);
        this.isAdvertising = true;
        console.log('✅ Android advertising started');
      } else if (Platform.OS === 'ios') {
        await this.startAdvertisingIOS();
      } else {
        console.warn('⚠️ Advertising not supported on this platform');
      }
    } catch (error) {
      console.error('❌ Failed to start advertising:', error);
      throw error;
    }
  }

  async stopAdvertising(): Promise<void> {
    try {
      if (Platform.OS === 'android' && BleAdvertiser) {
        await BleAdvertiser.stopAdvertising();
        this.isAdvertising = false;
        console.log('⏹️ Advertising stopped');
      }
    } catch (error) {
      console.error('❌ Failed to stop advertising:', error);
    }
  }

  private async startAdvertisingIOS(): Promise<void> {
    console.log('📡 [iOS] Peripheral mode not yet implemented');
  }

  // =========================================================================
  // SCANNING (CENTRAL MODE)
  // =========================================================================
  async startScan(): Promise<void> {
    try {
      if (this.isScanning) return;

      const isEnabled = await this.isBluetoothEnabled();
      if (!isEnabled) {
        console.warn('Bluetooth not enabled, retrying...');
        await BleManager.checkState();
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
      }

      if (!this.bluetoothEnabled) return;

      if (Platform.OS === 'android' && BleAdvertiser) {
        await BleAdvertiser.stopAdvertising();
        await new Promise<void>(resolve => setTimeout(resolve, 200));
      }

      this.isScanning = true;
      this.discoveredDevices.clear();

      await BleManager.scan({
        serviceUUIDs: [MESH_CONFIG.SERVICE_UUID],
        seconds: MESH_CONFIG.SCAN_DURATION / 1000,
        allowDuplicates: MESH_CONFIG.SCAN_ALLOW_DUPLICATES,
      });

      setTimeout(async () => {
        if (!this.isScanning&&!this.isAdvertising){
          await this.startAdvertising(this.deviceId, this.deviceName);
        }
      }, MESH_CONFIG.SCAN_DURATION + 100);

    } catch (error) {
      console.error('❌ Root Scan Error:', error);
      this.isScanning = false;
    }
  }

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
  // BLE MANAGER LISTENERS
  // =========================================================================
  private setupBleManagerListeners(): void {
    // 🔵 Bluetooth state updates
    bleManagerEmitter.addListener(
      'BleManagerDidUpdateState',
      ({ state }) => {
        this.bluetoothEnabled = state === 'on';
        console.log('🔵 Bluetooth state:', state);
      }
    );

    // 📩 Characteristic updates (mesh packets)
    bleManagerEmitter.addListener(
      'BleManagerDidUpdateValueForCharacteristic',
      ({ value, characteristic, peripheral }) => {
        const incoming = characteristic?.toLowerCase();
        const expected = MESH_CONFIG.CHARACTERISTIC_UUID.toLowerCase();

        if (incoming === expected || incoming?.endsWith('fff1')) {
          console.log('📩 Mesh packet received from', peripheral);
          this.onPacketReceived(value);
        }
      }
    );

    // 🔍 Device discovery
    bleManagerEmitter.addListener(
      'BleManagerDiscoverPeripheral',
      this.onDeviceDiscovered.bind(this)
    );

    // 🛑 Scan stopped
    bleManagerEmitter.addListener('BleManagerStopScan', () => {
      this.isScanning = false;
      this.isAdvertising=false;
      console.log('🔍 Scan completed');
    });

    console.log('✅ BLE Manager listeners registered');
  }

  // =========================================================================
  // NATIVE ADVERTISER LISTENERS
  // =========================================================================
  private setupAdvertiserListeners(): void {
    if (!bleAdvertiserEmitter) {
      console.log('⚠️ Native advertiser module not available');
      return;
    }

    bleAdvertiserEmitter.addListener('onPacketReceived', (event) => {
      try {
        const packet: MeshPacket = JSON.parse(event.packet);
        console.log('📦 Packet received from native:', packet.msg_id);
        MeshProtocolService.onPacketReceived(packet);
      } catch (error) {
        console.error('❌ Error parsing packet:', error);
      }
    });

    bleAdvertiserEmitter.addListener('onConnectionChange', (event) => {
      console.log(
        '🔄 Connection:',
        event.device,
        event.connected ? 'connected' : 'disconnected'
      );
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

    const normalizedUUIDs = advertisedUUIDs.map((u: string) => u.toLowerCase());
    const meshUUID = MESH_CONFIG.SERVICE_UUID.toLowerCase();

    const isMeshDevice =
      normalizedUUIDs.includes(meshUUID) ||
      normalizedUUIDs.some(u => u.endsWith('fff0'));

    if (!isMeshDevice) return;

    const bleDevice: BLEDevice = {
      id: device.id,
      name: device.name || device.advertising?.localName || 'Unknown',
      rssi: device.rssi,
    };

    this.discoveredDevices.set(device.id, bleDevice);
    this.notifyScanListeners();
  }

  // =========================================================================
  // PACKET HANDLING
  // =========================================================================
  async advertisePacket(packet: MeshPacket): Promise<void> {
    try {
      const payload = JSON.stringify(packet);
      const bytes = this.stringToBytes(payload);

      if (Platform.OS === 'android') {
        await this.advertiseAndroid(bytes);
      } else {
        await this.advertiseIOS(bytes);
      }
    } catch (error) {
      console.error('❌ Failed to advertise packet:', error);
    }
  }

  private async advertiseAndroid(bytes: number[]): Promise<void> {
    if (!BleAdvertiser) {
      console.warn('⚠️ BleAdvertiser native module not available');
      return;
    }

    try {
      await BleAdvertiser.advertisePacket(bytes);
      console.log('📡 [Android] Packet forwarded to native advertiser');
    } catch (error) {
      console.error('❌ Native advertisePacket failed:', error);
    }
  }

  private async advertiseIOS(_bytes: number[]): Promise<void> {
    console.log('📡 [iOS] Packet advertising not implemented');
  }

  private onPacketReceived(data: number[]): void {
    try {
      const packetString = this.bytesToString(data);
      const packet: MeshPacket = JSON.parse(packetString);

      console.log('📥 Packet received:', packet.msg_id);
      MeshProtocolService.onPacketReceived(packet);
    } catch (error) {
      console.error('❌ Invalid mesh packet:', error);
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

  async isBluetoothEnabled(): Promise<boolean> {
  if (this.bluetoothEnabled) return true;

  try {
      await BleManager.checkState();
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      return this.bluetoothEnabled;
  } catch {
    return false;
  }
}


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
  onScanUpdate(callback: (devices: BLEDevice[]) => void): () => void {
    this.scanListeners.push(callback);
    return () => {
      this.scanListeners = this.scanListeners.filter(cb => cb !== callback);
    };
  }

  private notifyScanListeners(): void {
    const devices = Array.from(this.discoveredDevices.values());
    this.scanListeners.forEach(cb => cb(devices));
  }

  getDiscoveredDevices(): BLEDevice[] {
    return Array.from(this.discoveredDevices.values());
  }
}

export default new BLEService();