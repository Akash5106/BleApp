// ============================================================================
// BLE SERVICE - FIXED VERSION
// Handles Bluetooth Low Energy scanning, advertising, and packet exchange
// ============================================================================

import { Platform, NativeModules, NativeEventEmitter } from 'react-native';
import { BleManager, Device, State } from 'react-native-ble-plx';
import { MeshPacket, BLEDevice } from '../types';
import { MESH_CONFIG } from '../constants';
import { Buffer } from 'buffer';

// Lazy import to break circular dependency: BLEService <-> MeshProtocolService
// MeshProtocolService is loaded on first use, not at module initialization
const getMeshProtocolService = () => require('./MeshProtocolService').default;

// ---------------------------------------------------------------------------
// Single BleManager instance — exported so other modules (e.g.
// useBlePermissions) reuse the same instance instead of creating a new one.
// react-native-ble-plx requires exactly ONE BleManager per app.
// ---------------------------------------------------------------------------
export const bleManager = new BleManager();
console.log('[BLE] BleManager singleton created');

// ---------------------------------------------------------------------------
// Native BLE Advertiser module (Android only)
// This is the Kotlin BleAdvertiserModule that runs the GATT server and
// handles BLE advertising + receiving writes from central devices.
// ---------------------------------------------------------------------------
const BleAdvertiser = Platform.OS === 'android' ? NativeModules.BleAdvertiser : null;
const bleAdvertiserEmitter =
  BleAdvertiser ? new NativeEventEmitter(BleAdvertiser) : null;
console.log('[BLE] Native module available:', !!BleAdvertiser, '| Emitter available:', !!bleAdvertiserEmitter);

class BLEService {
  private isScanning = false;
  private discoveredDevices = new Map<string, BLEDevice>();
  private scanListeners: Array<(devices: BLEDevice[]) => void> = [];

  private deviceId: string = '';
  private deviceName: string = '';
  private isAdvertising = false;

  private bluetoothEnabled = false;

  // Track devices we've connected to as a GATT client (for writing packets)
  private connectedDevices = new Set<string>();

  // Listener subscriptions for cleanup
  private stateChangeSubscription: any = null;
  private nativeEventSubscription: any = null;

  // Track whether advertising credentials have been set
  private hasAdvertisingCredentials = false;

  // Periodic scanning for finding peers (to deliver queued messages)
  private scanInterval: ReturnType<typeof setInterval> | null = null;
  private readonly BACKGROUND_SCAN_INTERVAL = 45000; // Scan every 45 seconds

  // =========================================================================
  // INITIALIZATION
  // =========================================================================
  async init(): Promise<void> {
    try {
      console.log('[BLE] Initializing BLE Service...');

      // Remove any previously registered listeners before adding new ones
      this.removeAllListeners();

      this.setupBleListeners();
      this.setupNativeEventListeners();

      const initialState = await bleManager.state();
      this.bluetoothEnabled = initialState === State.PoweredOn;
      console.log('[BLE] Initial BT state:', initialState, '| enabled:', this.bluetoothEnabled);

      // Only try to enable if not already on - enable() can hang if already enabled
      if (Platform.OS === 'android' && !this.bluetoothEnabled) {
        try {
          console.log('[BLE] Bluetooth not enabled, requesting enable...');
          await bleManager.enable();
          this.bluetoothEnabled = true;
          console.log('[BLE] Bluetooth enabled by user');
        } catch {
          console.log('[BLE] Bluetooth enable denied or failed');
        }
      }

      console.log('[BLE] BLE Service initialized');
    } catch (error) {
      console.error('[BLE] BLE Service init failed:', error);
      throw error;
    }
  }

  // =========================================================================
  // ADVERTISING (PERIPHERAL MODE) — via native BleAdvertiserModule
  // =========================================================================
  async startAdvertising(deviceId: string, deviceName?: string): Promise<void> {
    try {
      this.deviceId = deviceId;
      this.deviceName = deviceName || `Mesh-${deviceId}`;
      this.hasAdvertisingCredentials = true;

      // Skip if already advertising
      if (this.isAdvertising) {
        console.log('[BLE] startAdvertising() skipped — already advertising');
        return;
      }

      console.log('[BLE] Starting advertising — deviceId:', this.deviceId, 'name:', this.deviceName);

      if (Platform.OS === 'android' && BleAdvertiser) {
        await BleAdvertiser.startAdvertising(this.deviceName, this.deviceId);
        this.isAdvertising = true;
        console.log('[BLE] Advertising started via native module');
      } else {
        // iOS would need CBPeripheralManager implementation
        console.warn('[BLE] Advertising not available on this platform');
        this.isAdvertising = true;
      }
    } catch (error: any) {
      // Handle "already started" gracefully - it's not really an error
      if (error?.message?.includes('ALREADY_STARTED')) {
        this.isAdvertising = true;
        console.log('[BLE] Advertising already running');
        return;
      }
      console.error('[BLE] Failed to start advertising:', error);
      throw error;
    }
  }

  async stopAdvertising(): Promise<void> {
    try {
      if (Platform.OS === 'android' && BleAdvertiser && this.isAdvertising) {
        await BleAdvertiser.stopAdvertising();
      }
      this.isAdvertising = false;
      console.log('[BLE] Advertising stopped');
    } catch (error) {
      console.error('[BLE] Failed to stop advertising:', error);
    }
  }

  // =========================================================================
  // SCANNING (CENTRAL MODE)
  // =========================================================================
  async startScan(): Promise<void> {
    try {
      if (this.isScanning) {
        console.log('[BLE] startScan() skipped — already scanning');
        return;
      }
      console.log('[BLE] startScan() called — connectedDevices:', this.connectedDevices.size);

      let isEnabled = await this.isBluetoothEnabled();
      if (!isEnabled) {
        console.warn('[BLE] Bluetooth not enabled, retrying...');
        const state = await bleManager.state();
        this.bluetoothEnabled = state === State.PoweredOn;
        isEnabled = this.bluetoothEnabled;
      }

      if (!isEnabled) {
        console.warn('[BLE] Bluetooth still not enabled, aborting scan');
        return;
      }

      // Stop advertising before scanning (some devices can't do both)
      if (this.isAdvertising) {
        console.log('[BLE] Stopping advertising before scan...');
        await this.stopAdvertising();
        await new Promise<void>(resolve => setTimeout(resolve, 300));
      }

      this.isScanning = true;
      // Don't clear discoveredDevices — keep pool of known peers across scans
      // Entries are updated each scan; stale ones fail gracefully on connect

      // Scan for ALL devices first, then filter in onDeviceDiscovered
      // This is more reliable than hardware-level UUID filtering which can miss devices
      console.log('[BLE] Starting scan (filtering in callback for reliability)...');
      bleManager.startDeviceScan(
        null, // Don't filter by UUID at hardware level
        {
          allowDuplicates: MESH_CONFIG.SCAN_ALLOW_DUPLICATES,
        },
        (error, device) => {
          try {
            if (error) {
              console.error('[BLE] Scan error:', error.message || error);
              this.isScanning = false;
              this.restartAdvertisingIfNeeded();
              return;
            }

            if (device) {
              this.onDeviceDiscovered(device);
            }
          } catch (callbackError) {
            console.error('[BLE] Scan callback crashed:', callbackError);
          }
        },
      );

      console.log('[BLE] Scan started — duration:', MESH_CONFIG.SCAN_DURATION, 'ms');

      // Auto-stop scan after duration and restart advertising
      setTimeout(async () => {
        await this.stopScan();
        await this.restartAdvertisingIfNeeded();
      }, MESH_CONFIG.SCAN_DURATION);

    } catch (error) {
      console.error('[BLE] startScan threw:', error);
      this.isScanning = false;
      this.restartAdvertisingIfNeeded();
    }
  }

  // Helper to reliably restart advertising after scan
  private async restartAdvertisingIfNeeded(): Promise<void> {
    if (this.isAdvertising) {
      console.log('[BLE] restartAdvertisingIfNeeded() — already advertising');
      return;
    }
    if (!this.hasAdvertisingCredentials) {
      console.log('[BLE] restartAdvertisingIfNeeded() — no credentials, skipping');
      return;
    }

    // Small delay to let BLE stack settle
    await new Promise<void>(resolve => setTimeout(resolve, 200));

    try {
      console.log('[BLE] Restarting advertising after scan...');
      await this.startAdvertising(this.deviceId, this.deviceName);
    } catch (e) {
      console.error('[BLE] Failed to restart advertising:', e);
    }
  }

  async stopScan(): Promise<void> {
    try {
      bleManager.stopDeviceScan();
      this.isScanning = false;
      this.cleanupRecentlyProcessed();
      console.log('[BLE] Scan stopped');
    } catch (error) {
      console.error('[BLE] Failed to stop scan:', error);
    }
  }

  // =========================================================================
  // PERIODIC BACKGROUND SCANNING
  // Automatically scans at intervals to find peers for queued message delivery
  // =========================================================================
  startPeriodicScanning(): void {
    if (this.scanInterval) {
      console.log('[BLE] Periodic scanning already running');
      return;
    }

    console.log('[BLE] Starting periodic scanning — interval:', this.BACKGROUND_SCAN_INTERVAL, 'ms');

    // Do an initial scan immediately
    this.startScan();

    this.scanInterval = setInterval(() => {
      console.log('[BLE] Periodic scan triggered');
      this.startScan();
    }, this.BACKGROUND_SCAN_INTERVAL);
  }

  stopPeriodicScanning(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
      console.log('[BLE] Periodic scanning stopped');
    }
  }

  // =========================================================================
  // BLE STATE LISTENERS
  // =========================================================================
  private setupBleListeners(): void {
    this.stateChangeSubscription = bleManager.onStateChange((state: State) => {
      this.bluetoothEnabled = state === State.PoweredOn;
      console.log('[BLE] Bluetooth state:', state);
    }, true);

    console.log('[BLE] State listeners registered');
  }

  // =========================================================================
  // NATIVE EVENT LISTENERS (receive packets via GATT server writes)
  // =========================================================================
  private setupNativeEventListeners(): void {
    if (this.nativeEventSubscription) {
      this.nativeEventSubscription.remove();
      this.nativeEventSubscription = null;
    }

    if (bleAdvertiserEmitter) {
      this.nativeEventSubscription = bleAdvertiserEmitter.addListener(
        'onPacketReceived',
        (event: { message: string; from: string }) => {
          try {
            console.log('[BLE] Packet received via GATT server');
            const packet: MeshPacket = JSON.parse(event.message);
            getMeshProtocolService().onPacketReceived(packet);
          } catch (error) {
            console.error('[BLE] Failed to parse native packet:', error);
          }
        },
      );
      console.log('[BLE] Native event listeners registered');
    }
  }

  // =========================================================================
  // LISTENER CLEANUP
  // =========================================================================
  private removeAllListeners(): void {
    if (this.stateChangeSubscription) {
      this.stateChangeSubscription.remove();
      this.stateChangeSubscription = null;
    }
    if (this.nativeEventSubscription) {
      this.nativeEventSubscription.remove();
      this.nativeEventSubscription = null;
    }
  }

  // Track recently processed devices to prevent duplicate processing
  // Use device NAME as key (not MAC) because BLE addresses rotate
  private recentlyProcessedByName = new Map<string, { mac: string; time: number }>();
  private readonly DUPLICATE_THRESHOLD = 15000; // 15 seconds between processing same device name
  private readonly MAX_RECENT_ENTRIES = 50; // Limit map size to prevent memory growth

  // Global rate limiting for scan callback
  private lastScanCallbackTime = 0;
  private readonly MIN_CALLBACK_INTERVAL = 100; // Max 10 callbacks per second

  // Connection queue to prevent overwhelming BLE stack
  // CRITICAL: Store only device IDs (strings), NOT native Device objects
  // Native Device objects become invalid after the scan callback returns
  private connectionQueue: string[] = [];
  private isProcessingConnectionQueue = false;

  // Auto-connect disabled - causes BLE stack conflicts
  // Connections are made on-demand when sending packets
  private readonly AUTO_CONNECT_ENABLED = false;

  // Cleanup stale entries from recentlyProcessedByName
  private cleanupRecentlyProcessed(): void {
    const now = Date.now();
    for (const [name, entry] of this.recentlyProcessedByName) {
      if (now - entry.time > this.DUPLICATE_THRESHOLD * 2) {
        this.recentlyProcessedByName.delete(name);
      }
    }
    // Also enforce max size
    if (this.recentlyProcessedByName.size > this.MAX_RECENT_ENTRIES) {
      const entries = Array.from(this.recentlyProcessedByName.entries());
      entries.sort((a, b) => a[1].time - b[1].time);
      const toRemove = entries.slice(0, entries.length - this.MAX_RECENT_ENTRIES);
      for (const [name] of toRemove) {
        this.recentlyProcessedByName.delete(name);
      }
    }
  }

  // =========================================================================
  // DEVICE DISCOVERY - Ultra defensive, all heavy work deferred
  // =========================================================================
  private onDeviceDiscovered(device: Device): void {
    try {
      const deviceName = device.name || device.localName || '';

      // CRITICAL: Skip if no name (can't identify device reliably)
      if (!deviceName) {
        return;
      }

      // CRITICAL: Self-detection MUST happen BEFORE rate limiting
      // Otherwise we might process our own device during the first callback
      if (this.deviceName && deviceName === this.deviceName) {
        // console.log('[BLE] Skipping SELF (exact match):', deviceName);
        return;
      }
      if (this.deviceId && deviceName.includes(this.deviceId)) {
        // console.log('[BLE] Skipping SELF (contains deviceId):', deviceName);
        return;
      }

      // Check for mesh device by name pattern only
      const isMeshDevice =
        deviceName.startsWith('Mesh-') ||
        deviceName.startsWith('User-');

      if (!isMeshDevice) {
        return;
      }

      // RATE LIMIT: Skip if called too frequently (after self-check)
      const now = Date.now();
      if (now - this.lastScanCallbackTime < this.MIN_CALLBACK_INTERVAL) {
        return;
      }
      this.lastScanCallbackTime = now;

      // CRITICAL: Aggressive deduplication - 15 seconds per device name
      const existing = this.recentlyProcessedByName.get(deviceName);
      if (existing && (now - existing.time) < this.DUPLICATE_THRESHOLD) {
        return;
      }

      // Store this device (sync - fast)
      this.recentlyProcessedByName.set(deviceName, { mac: device.id, time: now });

      console.log('[BLE] Mesh device found:', deviceName, '| rssi:', device.rssi);

      // Store device info (sync - fast)
      const bleDevice: BLEDevice = {
        id: device.id,
        name: deviceName,
        rssi: device.rssi ?? 0,
      };
      this.discoveredDevices.set(device.id, bleDevice);

      // DEFER ALL HEAVY OPERATIONS - don't block scan callback
      const deviceId = device.id;
      const rssi = device.rssi ?? undefined;

      // DEFER ALL HEAVY OPERATIONS - use only primitive data, NOT native Device object
      setTimeout(() => {
        try {
          // Notify scan listeners
          this.notifyScanListeners();

          // Register as physical neighbor
          try {
            getMeshProtocolService().updatePhysicalNeighbor(deviceName, rssi);
          } catch (e) {
            // Service not ready
          }

          // Queue connection if needed (pass deviceId STRING, not native Device)
          if (this.AUTO_CONNECT_ENABLED) {
            const alreadyConnected = Array.from(this.connectedDevices).some(mac => {
              const dev = this.discoveredDevices.get(mac);
              return dev && dev.name === deviceName;
            });

            if (!alreadyConnected && !this.connectedDevices.has(deviceId)) {
              this.queueConnectionById(deviceId);
            }
          }
        } catch (deferredError) {
          console.error('[BLE] Deferred processing error:', deferredError);
        }
      }, 50); // 50ms delay to let scan callback return

    } catch (error) {
      console.error('[BLE] onDeviceDiscovered crashed:', error);
    }
  }

  // Queue connections to process one at a time
  // CRITICAL: Only store device IDs (strings), fetch fresh Device when connecting
  private queueConnectionById(deviceId: string): void {
    // Don't queue if already in queue
    if (this.connectionQueue.includes(deviceId)) {
      return;
    }

    this.connectionQueue.push(deviceId);
    console.log('[BLE] Queued connection for:', deviceId, '| queue size:', this.connectionQueue.length);

    if (!this.isProcessingConnectionQueue) {
      this.processConnectionQueue();
    }
  }

  private async processConnectionQueue(): Promise<void> {
    if (this.isProcessingConnectionQueue) return;
    this.isProcessingConnectionQueue = true;

    while (this.connectionQueue.length > 0) {
      const deviceId = this.connectionQueue.shift();
      if (deviceId && !this.connectedDevices.has(deviceId)) {
        try {
          // Fetch FRESH Device object from BleManager - don't use stale references
          const devices = await bleManager.devices([deviceId]);
          if (devices && devices.length > 0) {
            await this.connectForWriting(devices[0]);
          } else {
            console.log('[BLE] Device no longer available:', deviceId);
          }
        } catch (err) {
          console.warn('[BLE] Connection failed for', deviceId, ':', err);
        }
        // Wait between connections to not overwhelm BLE stack
        await new Promise<void>(resolve => setTimeout(resolve, 1500));
      }
    }

    this.isProcessingConnectionQueue = false;
  }

  // =========================================================================
  // CONNECT TO PEER FOR WRITING
  // Connects as a GATT client so we can write packets to the peer's
  // GATT server characteristic.
  // =========================================================================
  private async connectForWriting(device: Device): Promise<void> {
    if (this.connectedDevices.has(device.id)) {
      console.log('[BLE] Already connected/connecting to:', device.id);
      return;
    }

    // Mark as "connecting" early to prevent duplicate attempts
    this.connectedDevices.add(device.id);
    console.log('[BLE] Connecting to peer:', device.id);

    try {
      // Check if device is still valid
      if (!device || !device.id) {
        throw new Error('Invalid device object');
      }

      const connected = await device.connect({ timeout: 10000 });
      console.log('[BLE] Connected to peer:', device.id);

      // Negotiate higher MTU for larger packets (Android only)
      if (Platform.OS === 'android') {
        try {
          await connected.requestMTU(512);
          console.log('[BLE] MTU negotiated for:', device.id);
        } catch (mtuError) {
          console.warn('[BLE] MTU negotiation failed, using default:', mtuError);
        }
      }

      // Discover services with timeout protection
      try {
        await connected.discoverAllServicesAndCharacteristics();
        console.log('[BLE] Services discovered for:', device.id);
      } catch (discoverError) {
        console.warn('[BLE] Service discovery failed:', discoverError);
        // Still keep connection, might work anyway
      }

      // Handle disconnection safely
      connected.onDisconnected((error, disconnectedDevice) => {
        try {
          const id = disconnectedDevice?.id || device.id;
          this.connectedDevices.delete(id);
          console.log('[BLE] Peer disconnected:', id);
          if (error) {
            console.warn('[BLE] Disconnection reason:', error.message || error);
          }
        } catch (e) {
          console.warn('[BLE] Error in disconnect handler:', e);
        }
      });

    } catch (error: any) {
      this.connectedDevices.delete(device.id);

      // Don't spam logs for common connection failures
      const errorMsg = error?.message || String(error);
      if (errorMsg.includes('cancelled') || errorMsg.includes('timeout')) {
        console.log('[BLE] Connection cancelled/timeout:', device.id);
      } else {
        console.warn('[BLE] Failed to connect:', device.id, errorMsg);
      }
    }
  }

  // =========================================================================
  // PUBLIC: Connect to a specific device by ID
  // =========================================================================
  async connectToDevice(deviceId: string): Promise<void> {
    if (this.connectedDevices.has(deviceId)) {
      console.log('[BLE] Already connected to:', deviceId);
      return;
    }

    try {
      const devices = await bleManager.devices([deviceId]);
      if (!devices || devices.length === 0) {
        console.error('[BLE] Device not found:', deviceId);
        return;
      }

      await this.connectForWriting(devices[0]);
    } catch (error) {
      console.error('[BLE] Failed to connect to device:', error);
    }
  }

  // =========================================================================
  // PACKET SENDING — connect on-demand and write to peers
  // =========================================================================
  async advertisePacket(packet: MeshPacket): Promise<void> {
    try {
      const payload = JSON.stringify(packet);
      const base64Value = Buffer.from(payload).toString('base64');

      // If no connections, try to connect to discovered devices first
      if (this.connectedDevices.size === 0 && this.discoveredDevices.size > 0) {
        console.log('[BLE] No connections, attempting on-demand connect to', this.discoveredDevices.size, 'discovered devices');
        await this.connectToDiscoveredDevices();
      }

      const deviceIds = Array.from(this.connectedDevices);
      console.log('[BLE] advertisePacket() — msg_id:', packet.msg_id, '| connectedPeers:', deviceIds.length, '| payloadLen:', payload.length);

      if (deviceIds.length === 0) {
        console.log('[BLE] No connected peers to send packet to');
        return;
      }

      for (const deviceId of deviceIds) {
        try {
          const devices = await bleManager.devices([deviceId]);
          if (devices.length > 0) {
            const isConnected = await devices[0].isConnected();
            if (isConnected) {
              await devices[0].writeCharacteristicWithResponseForService(
                MESH_CONFIG.SERVICE_UUID,
                MESH_CONFIG.CHARACTERISTIC_UUID,
                base64Value,
              );
              console.log('[BLE] Packet written to:', deviceId);
            } else {
              this.connectedDevices.delete(deviceId);
            }
          } else {
            this.connectedDevices.delete(deviceId);
          }
        } catch (error) {
          console.error(`[BLE] Failed to write to ${deviceId}:`, error);
          this.connectedDevices.delete(deviceId);
        }
      }
    } catch (error) {
      console.error('[BLE] Failed to send packet:', error);
    }
  }

  // Connect to discovered mesh devices (on-demand, not during scan)
  private async connectToDiscoveredDevices(): Promise<void> {
    // Don't connect while scanning - causes BLE conflicts
    if (this.isScanning) {
      console.log('[BLE] Skipping connect - scan in progress');
      return;
    }

    const discovered = Array.from(this.discoveredDevices.values());
    console.log('[BLE] connectToDiscoveredDevices() — pool size:', discovered.length);

    for (const device of discovered.slice(0, 3)) { // Limit to 3 connections
      if (this.connectedDevices.has(device.id)) continue;

      try {
        // Mark as connecting early to prevent duplicate attempts
        this.connectedDevices.add(device.id);

        // Use connectToDevice() directly — bleManager.devices() only returns
        // cached objects which expire after scan ends, causing silent failures
        const connected = await bleManager.connectToDevice(device.id, { timeout: 10000 });
        console.log('[BLE] On-demand connected to:', device.id);

        // Negotiate higher MTU for larger packets (Android only)
        if (Platform.OS === 'android') {
          try {
            await connected.requestMTU(512);
          } catch (mtuError) {
            console.warn('[BLE] MTU negotiation failed:', mtuError);
          }
        }

        try {
          await connected.discoverAllServicesAndCharacteristics();
        } catch (discoverError) {
          console.warn('[BLE] Service discovery failed:', discoverError);
        }

        connected.onDisconnected(() => {
          this.connectedDevices.delete(device.id);
          console.log('[BLE] On-demand peer disconnected:', device.id);
        });
      } catch (err) {
        this.connectedDevices.delete(device.id);
        console.warn('[BLE] On-demand connect failed:', device.id, err);
      }
    }
  }

  // =========================================================================
  // HELPERS
  // =========================================================================
  async isBluetoothEnabled(): Promise<boolean> {
    if (this.bluetoothEnabled) {
      console.log('[BLE] isBluetoothEnabled() -> true (cached)');
      return true;
    }

    try {
      const state = await bleManager.state();
      this.bluetoothEnabled = state === State.PoweredOn;
      return this.bluetoothEnabled;
    } catch {
      return false;
    }
  }

  async getConnectedDevices(): Promise<Device[]> {
    try {
      return await bleManager.connectedDevices([MESH_CONFIG.SERVICE_UUID]);
    } catch (error) {
      console.error('[BLE] Failed to get connected devices:', error);
      return [];
    }
  }

  async disconnectDevice(deviceId: string): Promise<void> {
    try {
      await bleManager.cancelDeviceConnection(deviceId);
      this.connectedDevices.delete(deviceId);
      console.log('[BLE] Disconnected from device:', deviceId);
    } catch (error) {
      console.error('[BLE] Failed to disconnect device:', error);
    }
  }

  async disconnectAllDevices(): Promise<void> {
    const deviceIds = Array.from(this.connectedDevices);
    for (const deviceId of deviceIds) {
      await this.disconnectDevice(deviceId);
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
    try {
      const devices = Array.from(this.discoveredDevices.values());
      this.scanListeners.forEach(cb => {
        try {
          cb(devices);
        } catch (e) {
          console.error('[BLE] Scan listener callback error:', e);
        }
      });
    } catch (e) {
      console.error('[BLE] notifyScanListeners error:', e);
    }
  }

  getDiscoveredDevices(): BLEDevice[] {
    return Array.from(this.discoveredDevices.values());
  }
}

export default new BLEService();
