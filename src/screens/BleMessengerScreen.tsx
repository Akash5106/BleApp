import React, { useState, useEffect, useRef } from "react";
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, 
  Alert, NativeModules, NativeEventEmitter, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform 
} from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BleManager, Device } from "react-native-ble-plx";
import { SERVICE_UUID, CHAR_UUID } from "../constants/bleConfig";
import { requestBlePermissions } from '../utils/permissions';
import { Buffer } from "buffer";

const { BleAdvertiser } = NativeModules;
const manager = new BleManager();

export const BleMessengerScreen = () => {
  // --- NAVIGATION & IDENTITY ---
  const [step, setStep] = useState<'loading' | 'name_entry' | 'scanner' | 'chat'>('loading');
  const [myId] = useState(`ID-${Math.random().toString(36).substring(2, 7)}`);
  const [myName, setMyName] = useState("");
  const [typedName, setTypedName] = useState("");

  // --- BLE STATE ---
  const [devices, setDevices] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isAdvertising, setIsAdvertising] = useState(false);
  const [messages, setMessages] = useState<{sender: 'me' | 'peer', text: string}[]>([]);
  const [inputText, setInputText] = useState("");
  const [peer, setPeer] = useState<{id: string, name: string} | null>(null);
  const [activeConnection, setActiveConnection] = useState<Device | null>(null);
  
  const scrollViewRef = useRef<ScrollView>(null);

  // 1. Initial Load: Check for saved name
  useEffect(() => {
    const init = async () => {
      const saved = await AsyncStorage.getItem('user_name');
      if (saved) { setMyName(saved); setStep('scanner'); }
      else { setStep('name_entry'); }
    };
    init();

    const stateSub = manager.onStateChange((state) => {
      if (state === 'PoweredOff') Alert.alert("Bluetooth Off", "Please turn on Bluetooth.");
    }, true);

    return () => stateSub.remove();
  }, []);

  // 2. RECEIVER LOGIC: Handles the Handshake Protection
  useEffect(() => {
    if (!BleAdvertiser) return;
    const eventEmitter = new NativeEventEmitter(BleAdvertiser);

    const sub = eventEmitter.addListener("onMessageReceived", async (event) => {
      const data = event.message;

      if (data.startsWith("AUTH|")) {
        // PROTECTION: If already in chat, ignore duplicate AUTH packets to prevent crashing loops
        if (step === 'chat') return;

        const [_, id, name] = data.split("|");
        setPeer({ id, name });
        
        // Respond to the handshake automatically if we have a connection
        if (activeConnection) {
          const myAuth = `AUTH|${myId}|${myName}`;
          try {
            await activeConnection.writeCharacteristicWithResponseForService(
              SERVICE_UUID, CHAR_UUID, Buffer.from(myAuth).toString("base64")
            );
          } catch (e) {
            console.log("Handshake response failed:", e);
          }
        }
        setStep('chat');
      } else {
        setMessages(prev => [...prev, { sender: 'peer', text: data }]);
      }
    });

    return () => sub.remove();
  }, [step, activeConnection, myId, myName]);

  // 3. SCANNING: Filtered to only show your app
  const startScan = async () => {
    const hasPermission = await requestBlePermissions();
    if (!hasPermission) return;

    setDevices([]);
    setIsScanning(true);
    
    // FILTER: Passing [SERVICE_UUID] ensures headphones and TVs are hidden
    manager.startDeviceScan([SERVICE_UUID], null, (error, device) => {
      if (error) {
        setIsScanning(false);
        return;
      }

      if (device) {
        setDevices(prev => {
          if (prev.some(d => d.id === device.id)) return prev;
          return [...prev, { id: device.id, name: device.name || device.localName || "BleChat User" }];
        });
      }
    });

    setTimeout(() => {
      manager.stopDeviceScan();
      setIsScanning(false);
    }, 10000);
  };

  // 4. SENDER: Initial Verification
  const connectAndVerify = async (device: any) => {
    try {
      setIsScanning(false);
      manager.stopDeviceScan();
      
      const conn = await manager.connectToDevice(device.id);
      await conn.discoverAllServicesAndCharacteristics();
      setActiveConnection(conn);
      
      const auth = `AUTH|${myId}|${myName}`;
      await conn.writeCharacteristicWithResponseForService(
        SERVICE_UUID, CHAR_UUID, Buffer.from(auth).toString("base64")
      );
      
      // Temporary name until they reply with their AUTH
      setPeer({ id: "pending", name: device.name });
    } catch (e) {
      Alert.alert("Error", "Peer not reachable. Ensure they clicked 'Go Visible'.");
    }
  };

  const handleStartAdvertising = async () => {
    const hasPermission = await requestBlePermissions();
    if (!hasPermission) return;

    try {
      // Passes the dynamic name to the Kotlin module
      await BleAdvertiser.startAdvertising(myName);
      setIsAdvertising(true);
      Alert.alert("Success", `Now visible as ${myName}`);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !activeConnection) return;
    try {
      await activeConnection.writeCharacteristicWithResponseForService(
        SERVICE_UUID, CHAR_UUID, Buffer.from(inputText).toString("base64")
      );
      setMessages(prev => [...prev, { sender: 'me', text: inputText }]);
      setInputText("");
    } catch (e) {
      Alert.alert("Send Error", "Connection lost.");
    }
  };

  // --- UI SCREENS ---

  if (step === 'loading') return <View style={styles.center}><ActivityIndicator size="large" color="#007AFF" /></View>;

  if (step === 'name_entry') return (
    <View style={styles.center}>
      <Text style={styles.heroTitle}>BLE Chat</Text>
      <TextInput 
        style={styles.modernInput} 
        placeholder="Enter name (max 15 chars)" 
        maxLength={15} 
        onChangeText={setTypedName}
        value={typedName}
        autoCorrect={false}
      />
      <TouchableOpacity style={styles.primaryBtn} onPress={async () => { 
        if(typedName.trim()){ 
          await AsyncStorage.setItem('user_name', typedName); 
          setMyName(typedName); 
          setStep('scanner'); 
        }
      }}>
        <Text style={styles.btnText}>Start Chatting</Text>
      </TouchableOpacity>
    </View>
  );

  if (step === 'scanner') return (
    <View style={styles.mainContainer}>
      <View style={styles.topBar}><Text style={styles.barTitle}>Hello, {myName}</Text></View>
      <ScrollView contentContainerStyle={styles.scrollPad}>
        <TouchableOpacity style={[styles.card, {backgroundColor: isAdvertising ? '#C8E6C9' : '#E3F2FD'}]} onPress={handleStartAdvertising}>
          <Text style={styles.cardTitle}>{isAdvertising ? "✅ You are Visible" : "Go Visible"}</Text>
          <Text style={styles.cardSub}>Others can find you to start a chat</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.scanActionBtn} onPress={startScan} disabled={isScanning}>
          {isScanning ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Find Nearby People</Text>}
        </TouchableOpacity>

        <Text style={styles.listLabel}>Peers in Range</Text>
        {devices.map(d => (
          <TouchableOpacity key={d.id} style={styles.peerItem} onPress={() => connectAndVerify(d)}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{d.name ? d.name[0] : '?'}</Text></View>
            <View>
              <Text style={styles.peerName}>{d.name || "Unknown"}</Text>
              <Text style={styles.peerStatus}>Ready to connect</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.mainContainer}>
      <View style={styles.chatHeader}>
        <View>
            <Text style={styles.chatHeaderTitle}>{peer?.name}</Text>
            <Text style={styles.statusOnline}>● Connected</Text>
        </View>
        <TouchableOpacity onPress={() => {
            activeConnection?.cancelConnection();
            setStep('scanner');
        }}><Text style={styles.exitText}>Leave</Text></TouchableOpacity>
      </View>
      
      <ScrollView 
        ref={scrollViewRef} 
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({animated:true})} 
        style={styles.chatArea}
      >
        {messages.map((m, i) => (
          <View key={i} style={[styles.bubble, m.sender === 'me' ? styles.myBubble : styles.peerBubble]}>
            <Text style={[styles.msgText, m.sender === 'me' && {color: '#fff'}]}>{m.text}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <TextInput 
            style={styles.footerInput} 
            value={inputText} 
            onChangeText={setInputText} 
            placeholder="Type a message..." 
            multiline 
        />
        <TouchableOpacity style={styles.sendCircle} onPress={sendMessage}>
            <Text style={{color:'#fff', fontWeight:'bold', fontSize: 20}}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', padding: 40, backgroundColor: '#fff' },
  mainContainer: { flex: 1, backgroundColor: '#F8F9FA' },
  heroTitle: { fontSize: 32, fontWeight: '800', color: '#007AFF', marginBottom: 40, textAlign: 'center' },
  modernInput: { backgroundColor: '#F1F3F5', padding: 18, borderRadius: 15, fontSize: 18, marginBottom: 20 },
  primaryBtn: { backgroundColor: '#007AFF', padding: 18, borderRadius: 15, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  topBar: { padding: 25, paddingTop: 60, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  barTitle: { fontSize: 20, fontWeight: 'bold' },
  scrollPad: { padding: 20 },
  card: { padding: 20, borderRadius: 20, marginBottom: 20 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#1976D2' },
  cardSub: { fontSize: 13, color: '#1976D2', marginTop: 4 },
  scanActionBtn: { backgroundColor: '#007AFF', padding: 15, borderRadius: 15, alignItems: 'center', marginBottom: 30 },
  listLabel: { fontSize: 14, fontWeight: 'bold', color: '#999', marginBottom: 15, textTransform: 'uppercase' },
  peerItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 15, marginBottom: 10, elevation: 1 },
  avatar: { width: 45, height: 45, borderRadius: 22.5, backgroundColor: '#E9ECEF', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  avatarText: { fontWeight: 'bold', color: '#495057' },
  peerName: { fontSize: 16, fontWeight: 'bold' },
  peerStatus: { fontSize: 12, color: '#4CAF50' },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, paddingTop: 60, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee', alignItems: 'center' },
  chatHeaderTitle: { fontSize: 18, fontWeight: 'bold' },
  statusOnline: { fontSize: 12, color: '#4CAF50', fontWeight: 'bold' },
  exitText: { color: '#FF3B30', fontWeight: 'bold' },
  chatArea: { flex: 1, padding: 15 },
  bubble: { padding: 12, borderRadius: 20, marginBottom: 8, maxWidth: '80%' },
  myBubble: { alignSelf: 'flex-end', backgroundColor: '#007AFF', borderBottomRightRadius: 4 },
  peerBubble: { alignSelf: 'flex-start', backgroundColor: '#E9ECEF', borderBottomLeftRadius: 4 },
  msgText: { fontSize: 15 },
  footer: { flexDirection: 'row', padding: 15, paddingBottom: 35, backgroundColor: '#fff', alignItems: 'flex-end' },
  footerInput: { flex: 1, backgroundColor: '#F1F3F5', borderRadius: 25, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, fontSize: 16, maxHeight: 100 },
  sendCircle: { width: 45, height: 45, borderRadius: 22.5, backgroundColor: '#007AFF', marginLeft: 10, justifyContent: 'center', alignItems: 'center' }
});