import { Buffer } from "buffer";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Alert,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Button,
  NativeModules,
  NativeEventEmitter,
  ScrollView,
  TextInput,
} from "react-native";
import { BleManager, Device } from "react-native-ble-plx";

const { BleAdvertiser } = NativeModules;
const manager = new BleManager();
const SERVICE_UUID = "12345678-1234-1234-1234-123456789abc";
const CHAR_UUID = "87654321-4321-4321-4321-cba987654321";

const MESSAGE_TYPE = { CHAT: "CHAT", FLOOD: "FLOOD" };

interface Message {
  id: string;
  type: string;
  content: string;
  sender: string;
  timestamp: number;
  ttl: number;
  hops: number;
}

interface QueuedMessage {
  message: Message;
  attempts: number;
}

export default function BleScreen() {
  // UI state
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<{ id: string; name: string }[]>([]);
  const [isAdvertising, setIsAdvertising] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [seenCount, setSeenCount] = useState(0);
  const [isAutoScanEnabled, setIsAutoScanEnabled] = useState(false);
  const [queueLength, setQueueLength] = useState(0);

  // Refs — always current in async/callbacks
  const deviceIdRef = useRef("");
  const seenMessages = useRef<Set<string>>(new Set());
  const messageQueueRef = useRef<QueuedMessage[]>([]);
  const isScanningRef = useRef(false);
  const isConnectingRef = useRef(false);
  const autoScanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discoveredDevicesRef = useRef<Map<string, Device>>(new Map());

  // Init device ID
  useEffect(() => {
    const id = `Device_${Math.random().toString(36).substr(2, 9)}`;
    setDeviceId(id);
    deviceIdRef.current = id;
  }, []);

  // Event listener
  useEffect(() => {
    const emitter = new NativeEventEmitter(BleAdvertiser);
    const sub = emitter.addListener("onMessageReceived", (event) => {
      handleReceivedMessage(event.message, event.from);
    });
    return () => sub.remove();
  }, []);

  // Auto-scan
  useEffect(() => {
    if (isAutoScanEnabled) {
      triggerScan();
      autoScanIntervalRef.current = setInterval(() => {
        triggerScan();
      }, 6000);
    }
    return () => {
      if (autoScanIntervalRef.current) {
        clearInterval(autoScanIntervalRef.current);
        autoScanIntervalRef.current = null;
      }
    };
  }, [isAutoScanEnabled]);

  // Cleanup
  useEffect(() => {
    return () => {
      manager.stopDeviceScan();
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
      if (autoScanIntervalRef.current) clearInterval(autoScanIntervalRef.current);
    };
  }, []);

  // Queue helpers
  const syncQueue = (newQueue: QueuedMessage[]) => {
    messageQueueRef.current = newQueue;
    setQueueLength(newQueue.length);
  };

  const enqueue = (msg: Message) => {
    const q = messageQueueRef.current;
    if (q.some((item) => item.message.id === msg.id)) return;
    syncQueue([...q, { message: msg, attempts: 0 }]);
  };

  const dequeue = (id: string) => {
    syncQueue(messageQueueRef.current.filter((item) => item.message.id !== id));
  };

  // Handle received message
  const handleReceivedMessage = (rawMessage: string, from: string) => {
    try {
      const message: Message = JSON.parse(rawMessage);

      // Drop own messages
      if (message.sender === deviceIdRef.current) {
        console.log("🚫 Own message, ignoring");
        return;
      }

      // Drop duplicates
      if (seenMessages.current.has(message.id)) {
        console.log("🔁 Duplicate ignored:", message.id);
        return;
      }

      seenMessages.current.add(message.id);
      setSeenCount(seenMessages.current.size);

      setMessages((prev) => [
        ...prev,
        `📩 ${message.type} from ${message.sender}: "${message.content}" [Hops: ${message.hops}]`,
      ]);

      // Re-broadcast flood
      if (message.type === MESSAGE_TYPE.FLOOD && message.ttl > 0) {
        enqueue({
          ...message,
          ttl: message.ttl - 1,
          hops: message.hops + 1,
        });
        console.log("🔄 Re-queued, TTL now", message.ttl - 1);
      }
    } catch (e: any) {
      console.error("❌ Parse error:", e.message);
      setMessages((prev) => [...prev, `📩 Raw: "${rawMessage}" from ${from}`]);
    }
  };

  // Permissions
  const requestPermissions = async (): Promise<boolean> => {
    if (Platform.OS !== "android") return true;
    const apiLevel = parseInt(Platform.Version.toString(), 10);

    if (apiLevel < 31) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }

    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);

    return [
      "android.permission.BLUETOOTH_ADVERTISE",
      "android.permission.BLUETOOTH_SCAN",
      "android.permission.BLUETOOTH_CONNECT",
      "android.permission.ACCESS_FINE_LOCATION",
    ].every(
      (p) => results[p as keyof typeof results] === PermissionsAndroid.RESULTS.GRANTED
    );
  };

  // Advertising
  const startAdvertising = async () => {
    try {
      await BleAdvertiser.startAdvertising();
      setIsAdvertising(true);
    } catch (e: any) {
      Alert.alert("BLE Error", e?.message ?? "Unknown error");
    }
  };

  const stopAdvertising = async () => {
    try {
      await BleAdvertiser.stopAdvertising();
      setIsAdvertising(false);
    } catch (e: any) {
      Alert.alert("BLE Error", e?.message ?? "Unknown error");
    }
  };

  // Scan
  const triggerScan = useCallback(async () => {
    if (isScanningRef.current || isConnectingRef.current) {
      console.log("⏭️ Scan skipped (busy)");
      return;
    }
    if (messageQueueRef.current.length === 0) {
      console.log("⏭️ Scan skipped (empty queue)");
      return;
    }

    const allowed = await requestPermissions();
    if (!allowed) return;

    isScanningRef.current = true;
    setIsScanning(true);
    discoveredDevicesRef.current.clear();

    console.log("🔍 Scan started");

    manager.startDeviceScan([SERVICE_UUID], null, (error, device) => {
      if (error) {
        console.error("❌ Scan error:", error);
        stopScan();
        return;
      }
      if (!device) return;

      const name = device.name || device.localName || "Unknown";
      
      // Store ALL discovered devices by ID
      if (!discoveredDevicesRef.current.has(device.id)) {
        discoveredDevicesRef.current.set(device.id, device);
        console.log("📱 Found:", name, device.id);
        
        // Update UI
        setDevices((prev) => {
          const exists = prev.some(d => d.id === device.id);
          if (exists) return prev;
          return [...prev, { id: device.id, name }];
        });
      }
    });

    // Stop after 5s, then try sending to all discovered devices
    scanTimeoutRef.current = setTimeout(() => {
      stopScan();
      
      const foundDevices = Array.from(discoveredDevicesRef.current.values());
      if (foundDevices.length > 0 && messageQueueRef.current.length > 0) {
        console.log(`📤 Attempting to send to ${foundDevices.length} device(s)`);
        sendToMultipleDevices(foundDevices);
      }
    }, 5000);
  }, []);

  const stopScan = () => {
    manager.stopDeviceScan();
    isScanningRef.current = false;
    setIsScanning(false);
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
  };

  // Send to multiple devices sequentially
  const sendToMultipleDevices = async (deviceList: Device[]) => {
    for (const device of deviceList) {
      if (messageQueueRef.current.length === 0) {
        console.log("✅ Queue empty, stopping sends");
        break;
      }
      
      await sendQueuedMessagesToDevice(device);
      
      // Small delay between device connections
      await new Promise<void>(r => setTimeout(() => r(), 500));
    }
  };

  // Send to one device
  const sendQueuedMessagesToDevice = async (device: Device) => {
    if (isConnectingRef.current) return;
    if (messageQueueRef.current.length === 0) return;

    isConnectingRef.current = true;
    let connected: Device | null = null;

    try {
      console.log("👉 Connecting to", device.name || device.id);
      connected = await manager.connectToDevice(device.id, { timeout: 10000 });
      console.log("✅ Connected");

      try {
        await connected.requestMTU(512);
      } catch {
        console.log("⚠️ MTU request failed");
      }

      await connected.discoverAllServicesAndCharacteristics();

      const snapshot = [...messageQueueRef.current];
      let sent = 0;

      for (const item of snapshot) {
        try {
          const payload = JSON.stringify(item.message);
          const b64 = Buffer.from(payload).toString("base64");

          await connected.writeCharacteristicWithResponseForService(
            SERVICE_UUID,
            CHAR_UUID,
            b64
          );

          dequeue(item.message.id);
          sent++;
          console.log("✅ Sent:", item.message.id);

          await new Promise<void>((r) => setTimeout(() => r(), 150));
        } catch (e: any) {
          console.error("❌ Write failed:", e.message);
          break;
        }
      }

      if (sent > 0) {
        setMessages((prev) => [...prev, `📤 Sent ${sent} message(s) to ${device.name || device.id}`]);
      }
    } catch (e: any) {
      console.error("❌ Connection error:", e.message);
    } finally {
      if (connected) {
        try {
          await connected.cancelConnection();
        } catch {}
      }
      isConnectingRef.current = false;
    }
  };

  // Create messages
  const createMessage = (content: string, type: string, ttl: number): Message => ({
    id: `${deviceIdRef.current}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    type,
    content,
    sender: deviceIdRef.current,
    timestamp: Date.now(),
    ttl,
    hops: 0,
  });

  const sendChatMessage = () => {
    if (!messageInput.trim()) return;
    const msg = createMessage(messageInput.trim(), MESSAGE_TYPE.CHAT, 1);
    enqueue(msg);
    setMessages((prev) => [...prev, `📤 You (CHAT): "${msg.content}"`]);
    setMessageInput("");
  };

  const sendFloodMessage = () => {
    if (!messageInput.trim()) return;
    const msg = createMessage(messageInput.trim(), MESSAGE_TYPE.FLOOD, 5);
    enqueue(msg);
    setMessages((prev) => [...prev, `📤 You (FLOOD): "${msg.content}"`]);
    setMessageInput("");
  };

  // UI actions
  const toggleAutoScan = () => setIsAutoScanEnabled((prev) => !prev);

  const clearQueue = () => syncQueue([]);

  const clearSeenMessages = () => {
    seenMessages.current.clear();
    setSeenCount(0);
  };

  const clearDevices = () => {
    setDevices([]);
    discoveredDevicesRef.current.clear();
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>BLE Mesh Chat</Text>
        <Text style={styles.deviceIdText}>ID: {deviceId}</Text>

        <View style={styles.buttonRow}>
          <Button title="Request Permissions" onPress={requestPermissions} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Receiver Mode</Text>
          <View style={styles.buttonRow}>
            <Button
              title="Start Advertising"
              onPress={startAdvertising}
              disabled={isAdvertising}
              color={isAdvertising ? "gray" : "#4CAF50"}
            />
            <View style={{ width: 10 }} />
            <Button
              title="Stop Advertising"
              onPress={stopAdvertising}
              disabled={!isAdvertising}
              color={!isAdvertising ? "gray" : "#F44336"}
            />
          </View>
          {isAdvertising && <Text style={styles.statusText}>🟢 Advertising</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Send Message</Text>
          <TextInput
            style={styles.input}
            placeholder="Type your message..."
            value={messageInput}
            onChangeText={setMessageInput}
            multiline
          />
          <View style={styles.buttonRow}>
            <TouchableOpacity
              onPress={sendChatMessage}
              style={[styles.sendButton, { backgroundColor: "#3B82F6" }]}
            >
              <Text style={styles.buttonText}>Send Chat</Text>
            </TouchableOpacity>
            <View style={{ width: 10 }} />
            <TouchableOpacity
              onPress={sendFloodMessage}
              style={[styles.sendButton, { backgroundColor: "#8B5CF6" }]}
            >
              <Text style={styles.buttonText}>Flood Network</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Network Control</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              onPress={toggleAutoScan}
              style={[
                styles.controlButton,
                { backgroundColor: isAutoScanEnabled ? "#10B981" : "#6B7280" },
              ]}
            >
              <Text style={styles.buttonText}>
                Auto-Scan: {isAutoScanEnabled ? "ON" : "OFF"}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.infoText}>
            Queue: {queueLength} | Seen: {seenCount} | {isScanning ? "Scanning..." : "Idle"}
          </Text>
          <View style={styles.buttonRow}>
            <Button title="Clear Queue" onPress={clearQueue} color="#EF4444" />
            <View style={{ width: 10 }} />
            <Button title="Clear Cache" onPress={clearSeenMessages} color="#F59E0B" />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Discovered Devices ({devices.length})</Text>
          <Button title="Clear Device List" onPress={clearDevices} color="#6B7280" />
          <View style={styles.resultsBox}>
            {devices.length === 0 ? (
              <Text style={styles.placeholder}>
                {isScanning ? "Scanning..." : "No devices found"}
              </Text>
            ) : (
              <ScrollView style={{ flex: 1 }} nestedScrollEnabled>
                {devices.map((item) => (
                  <View key={item.id} style={styles.deviceItem}>
                    <Text style={styles.deviceName}>{item.name}</Text>
                    <Text style={styles.deviceAddr}>{item.id.substring(0, 20)}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Message Log</Text>
          <View style={styles.messagesBox}>
            {messages.length === 0 ? (
              <Text style={styles.placeholder}>No messages yet</Text>
            ) : (
              <ScrollView style={{ flex: 1 }} nestedScrollEnabled>
                {messages.map((msg, idx) => (
                  <Text key={idx} style={styles.messageText}>
                    {msg}
                  </Text>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 40 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 4, textAlign: "center", color: "#333" },
  deviceIdText: { fontSize: 12, color: "#999", textAlign: "center", marginBottom: 20 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: "600", marginBottom: 10, color: "#555" },
  buttonRow: { flexDirection: "row", justifyContent: "center", marginBottom: 10 },
  statusText: { textAlign: "center", marginTop: 4, fontSize: 14, color: "#4CAF50" },
  infoText: { textAlign: "center", marginVertical: 8, fontSize: 14, color: "#666" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    minHeight: 50,
    marginBottom: 10,
  },
  sendButton: { flex: 1, padding: 14, borderRadius: 10, alignItems: "center" },
  controlButton: { flex: 1, padding: 14, borderRadius: 10, alignItems: "center" },
  buttonText: { color: "white", fontSize: 16, fontWeight: "600" },
  resultsBox: {
    height: 180,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  placeholder: { color: "#999", fontSize: 16, textAlign: "center", marginTop: 60 },
  deviceItem: {
    padding: 12,
    backgroundColor: "#f2f2f2",
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#3B82F6",
  },
  deviceName: { fontSize: 14, fontWeight: "600", color: "#333" },
  deviceAddr: { fontSize: 11, color: "#999", marginTop: 2 },
  messagesBox: {
    height: 200,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#f9f9f9",
  },
  messageText: {
    fontSize: 12,
    color: "#333",
    marginBottom: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: "#fff",
    borderRadius: 5,
  },
});