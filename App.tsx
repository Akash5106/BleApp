import { Buffer } from "buffer";
import React, { useState, useEffect } from "react";
import {
  Alert,
  FlatList,
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
} from "react-native";
import { BleManager, Device } from "react-native-ble-plx";

const { BleAdvertiser } = NativeModules;
const manager = new BleManager();
const SERVICE_UUID = "12345678-1234-1234-1234-123456789abc";
const CHAR_UUID = "87654321-4321-4321-4321-cba987654321";

export default function BleScreen() {
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [isAdvertising, setIsAdvertising] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);

  useEffect(() => {
    const eventEmitter = new NativeEventEmitter(BleAdvertiser);
    const subscription = eventEmitter.addListener(
      "onMessageReceived",
      (event) => {
        const msg = `📩 Received: "${event.message}" from ${event.from}`;
        console.log(msg);
        setMessages((prev) => [...prev, msg]);
        Alert.alert("Message Received", event.message);
      }
    );

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    return () => {
      manager.stopDeviceScan();
      if (connectedDevice) {
        connectedDevice.cancelConnection().catch(() => {});
      }
    };
  }, [connectedDevice]);

  const requestPermissions = async () => {
    if (Platform.OS !== "android") return true;

    const apiLevel = parseInt(Platform.Version.toString(), 10);

    if (apiLevel < 31) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      if (granted === PermissionsAndroid.RESULTS.GRANTED) return true;

      Alert.alert(
        "Permission Denied",
        "Location permission is required for BLE scanning."
      );
      return false;
    }

    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);

    const allGranted = [
      "android.permission.BLUETOOTH_ADVERTISE",
      "android.permission.BLUETOOTH_SCAN",
      "android.permission.BLUETOOTH_CONNECT",
      "android.permission.ACCESS_FINE_LOCATION",
    ].every(
      (perm) =>
        results[perm as keyof typeof results] ===
        PermissionsAndroid.RESULTS.GRANTED
    );

    if (!allGranted) {
      Alert.alert(
        "Permission Denied",
        "All Bluetooth permissions are required for scanning and advertising."
      );
    }

    return allGranted;
  };

  const startAdvertising = async () => {
    try {
      const res = await BleAdvertiser.startAdvertising();
      setIsAdvertising(true);
      Alert.alert("BLE Advertising", res);
      console.log("✅ Advertising started");
    } catch (e: any) {
      console.error("❌ Advertising error:", e);
      Alert.alert("BLE Error", e?.message ?? "Unknown error");
    }
  };

  const stopAdvertising = async () => {
    try {
      const res = await BleAdvertiser.stopAdvertising();
      setIsAdvertising(false);
      Alert.alert("BLE Advertising", res);
      console.log("⏹️ Advertising stopped");
    } catch (e: any) {
      console.error("❌ Stop advertising error:", e);
      Alert.alert("BLE Error", e?.message ?? "Unknown error");
    }
  };

  const scanFunction = () => {
    if (isScanning) {
      Alert.alert("Already scanning");
      return;
    }

    setDevices([]);
    setIsScanning(true);
    console.log("🔍 Starting scan...");

    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.error("❌ Scan error:", error);
        Alert.alert("Scan Error", error.message);
        setIsScanning(false);
        manager.stopDeviceScan();
        return;
      }

      if (device && (device.name || device.localName)) {
        setDevices((prev) => {
          const exists = prev.some((d) => d.id === device.id);
          if (exists) return prev;
          console.log("📱 Found device:", device.name || device.localName, device.id);
          return [
            ...prev,
            { id: device.id, name: device.name || device.localName || "Unknown" },
          ];
        });
      }
    });

    setTimeout(() => {
      manager.stopDeviceScan();
      setIsScanning(false);
      console.log("⏹️ Scan stopped after 10s");
    }, 10000);
  };

  const connectAndSendMessage = async (device: Device) => {
    try {
      manager.stopDeviceScan();
      setIsScanning(false);

      console.log("👉 Connecting to", device.id);

      if (connectedDevice) {
        await connectedDevice.cancelConnection();
        setConnectedDevice(null);
      }

      const newConnectedDevice = await manager.connectToDevice(device.id, {
        timeout: 15000,
      });
      console.log("✅ Connected to", newConnectedDevice.id);
      setConnectedDevice(newConnectedDevice);

      console.log("🔍 Discovering services...");
      await newConnectedDevice.discoverAllServicesAndCharacteristics();
      console.log("✅ Services discovered");

      const services = await newConnectedDevice.services();
      const targetService = services.find((s) => s.uuid.toLowerCase() === SERVICE_UUID.toLowerCase());

      if (!targetService) {
        console.error("❌ Service not found");
        console.log("Available services:", services.map(s => s.uuid));
        Alert.alert("Error", `Service ${SERVICE_UUID} not found on device`);
        await newConnectedDevice.cancelConnection();
        setConnectedDevice(null);
        return;
      }

      console.log("✅ Target service found");

      const characteristics = await newConnectedDevice.characteristicsForService(SERVICE_UUID);
      const targetChar = characteristics.find((c) => c.uuid.toLowerCase() === CHAR_UUID.toLowerCase());

      if (!targetChar) {
        console.error("❌ Characteristic not found");
        console.log("Available characteristics:", characteristics.map(c => c.uuid));
        Alert.alert("Error", `Characteristic ${CHAR_UUID} not found`);
        await newConnectedDevice.cancelConnection();
        setConnectedDevice(null);
        return;
      }

      console.log("✅ Target characteristic found");

      const message = "Hello";
      const base64Msg = Buffer.from(message).toString("base64");

      console.log(`📤 Sending message: "${message}"`);
      await newConnectedDevice.writeCharacteristicWithResponseForService(
        SERVICE_UUID,
        CHAR_UUID,
        base64Msg
      );

      console.log("✅ Message sent successfully");
      setMessages((prev) => [...prev, `📤 Sent: "${message}" to ${device.name}`]);
      Alert.alert("Success", `Sent "${message}" to ${device.name || device.id}`);

      setTimeout(async () => {
        await newConnectedDevice.cancelConnection();
        setConnectedDevice(null);
        console.log("🔌 Disconnected");
      }, 1000);

    } catch (e: any) {
      console.error("❌ Connection/Write Error:", e);
      Alert.alert("Error", e.message || "Failed to connect/send message");
      if (connectedDevice) {
        await connectedDevice.cancelConnection().catch(() => {});
        setConnectedDevice(null);
      }
    }
  };

  const onScanPress = async () => {
    const allowed = await requestPermissions();
    if (allowed) scanFunction();
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>BLE Messenger</Text>

      {/* Permissions */}
      <View style={styles.buttonRow}>
        <Button title="Request Permissions" onPress={requestPermissions} />
      </View>

      {/* Advertising */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Advertising (Receiver Mode)</Text>
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
        {isAdvertising && (
          <Text style={styles.statusText}>🟢 Advertising as "BleChat"</Text>
        )}
      </View>

      {/* Scanning */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Scanning (Sender Mode)</Text>
        <TouchableOpacity
          disabled={isScanning}
          onPress={onScanPress}
          style={[
            styles.scanButton,
            { backgroundColor: isScanning ? "gray" : "#3B82F6" },
          ]}
        >
          <Text style={styles.scanButtonText}>
            {isScanning ? "Scanning..." : "Scan for Devices"}
          </Text>
        </TouchableOpacity>

        <View style={styles.resultsBox}>
          {devices.length === 0 ? (
            <Text style={styles.placeholder}>
              {isScanning ? "Searching..." : "No devices found"}
            </Text>
          ) : (
            <ScrollView style={{ flex: 1 }} nestedScrollEnabled>
              {devices.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => connectAndSendMessage(item)}
                  style={styles.deviceItem}
                >
                  <Text style={styles.deviceName}>{item.name}</Text>
                  <Text style={styles.sendText}>Tap to send "Hello"</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>

      {/* Messages */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Messages</Text>
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
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 20,
    textAlign: "center",
    color: "#333",
  },
  section: {
    marginBottom: 20,
    width: "100%",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 10,
    color: "#555",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 10,
  },
  statusText: {
    textAlign: "center",
    marginTop: 5,
    fontSize: 14,
    color: "#4CAF50",
  },
  scanButton: {
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 15,
  },
  scanButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  resultsBox: {
    width: "100%",
    height: 200,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 10,
  },
  placeholder: {
    color: "#999",
    fontSize: 16,
    textAlign: "center",
    marginTop: 80,
  },
  deviceItem: {
    padding: 15,
    backgroundColor: "#f2f2f2",
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#3B82F6",
  },
  deviceName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  sendText: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  messagesBox: {
    width: "100%",
    height: 150,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#f9f9f9",
  },
  messageText: {
    fontSize: 14,
    color: "#333",
    marginBottom: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: "#fff",
    borderRadius: 5,
  },
});