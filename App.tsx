import React from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { BleMessengerScreen } from './src/screens/BleMessengerScreen';

export default function App() {
  return (
    <SafeAreaView style={styles.root}>
      {/* This is the best place for it. It keeps the entry point clean. */}
      <BleMessengerScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 }
});