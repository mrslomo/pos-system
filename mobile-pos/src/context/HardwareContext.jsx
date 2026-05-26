import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';

const HardwareContext = createContext(null);

export function HardwareProvider({ children }) {
  const [printerDevice, setPrinterDevice] = useState(null);
  const [printerConnected, setPrinterConnected] = useState(false);
  const [scaleDevice, setScaleDevice] = useState(null);
  const [scaleConnected, setScaleConnected] = useState(false);
  const [weight, setWeight] = useState(0);
  const [weightStable, setWeightStable] = useState(false);
  const [storedPrinterAddress, setStoredPrinterAddress] = useState(null);
  const [storedScaleAddress, setStoredScaleAddress] = useState(null);

  const BT = useRef(null);

  const loadBT = async () => {
    if (BT.current) return BT.current;
    try {
      const mod = require('react-native-bluetooth-classic');
      BT.current = mod.default || mod;
      return BT.current;
    } catch {
      Alert.alert('ไม่พบ Bluetooth', 'ต้องใช้ EAS Build เพื่อใช้ Bluetooth');
      return null;
    }
  };

  const loadSavedAddresses = async () => {
    const pa = await AsyncStorage.getItem('printer_address');
    const sa = await AsyncStorage.getItem('scale_address');
    if (pa) setStoredPrinterAddress(pa);
    if (sa) setStoredScaleAddress(sa);
  };

  const getPairedDevices = async () => {
    const bt = await loadBT();
    if (!bt) return [];
    try {
      const enabled = await bt.isBluetoothEnabled();
      if (!enabled) await bt.requestBluetoothEnabled();
      return await bt.getBondedDevices();
    } catch (e) {
      Alert.alert('Bluetooth Error', e.message);
      return [];
    }
  };

  // ── Printer ──────────────────────────────────
  const connectPrinter = async (device) => {
    const bt = await loadBT();
    if (!bt) return false;
    try {
      if (printerDevice) {
        try { await printerDevice.disconnect(); } catch {}
      }
      const connected = await device.connect({
        CONNECTOR_TYPE: 'rfcomm',
        DELIMITER: '',
        DEVICE_CHARSET: 'latin-1',
      });
      setPrinterDevice(connected);
      setPrinterConnected(true);
      await AsyncStorage.setItem('printer_address', device.address);
      setStoredPrinterAddress(device.address);
      return true;
    } catch (e) {
      Alert.alert('เชื่อมต่อ Printer ล้มเหลว', e.message);
      return false;
    }
  };

  const disconnectPrinter = async () => {
    if (printerDevice) {
      try { await printerDevice.disconnect(); } catch {}
      setPrinterDevice(null);
      setPrinterConnected(false);
    }
  };

  const print = async (escposString) => {
    if (!printerDevice || !printerConnected) throw new Error('ไม่ได้เชื่อมต่อเครื่องพิมพ์');
    await printerDevice.write(escposString, 'latin-1');
  };

  const openCashDrawer = async () => {
    if (!printerDevice || !printerConnected) throw new Error('ไม่ได้เชื่อมต่อเครื่องพิมพ์');
    const drawerCmd = '\x1B\x70\x00\x19\xFA';
    await printerDevice.write(drawerCmd, 'latin-1');
  };

  // ── Scale ─────────────────────────────────────
  const scaleSubRef = useRef(null);
  const scaleBufferRef = useRef('');

  const parseWeightLine = (str) => {
    if (!str) return null;
    const clean = str.replace(/[\x00-\x08\x0b\x0e-\x1f\x7f]/g, '').trim();
    const isUnstable = clean.toUpperCase().includes('US') || clean.toUpperCase().includes('UNSTABLE');
    const m = clean.match(/([+\-]?\s*\d[\d\s]*\.?\d*)/);
    if (!m) return null;
    let val = parseFloat(m[1].replace(/\s/g, ''));
    if (isNaN(val) || val < 0) return null;
    const lower = clean.toLowerCase();
    if ((lower.includes(' g') || lower.endsWith('g')) && !lower.includes('kg')) val /= 1000;
    return { value: val, stable: !isUnstable };
  };

  const connectScale = async (device) => {
    const bt = await loadBT();
    if (!bt) return false;
    try {
      if (scaleDevice) {
        try { await disconnectScale(); } catch {}
      }
      const connected = await device.connect({
        CONNECTOR_TYPE: 'rfcomm',
        DELIMITER: '\n',
        DEVICE_CHARSET: 'ascii',
      });
      setScaleDevice(connected);
      setScaleConnected(true);
      scaleBufferRef.current = '';

      await AsyncStorage.setItem('scale_address', device.address);
      setStoredScaleAddress(device.address);

      scaleSubRef.current = connected.onDataReceived((data) => {
        scaleBufferRef.current += data.data;
        const lines = scaleBufferRef.current.split(/[\r\n]+/);
        scaleBufferRef.current = lines.pop();
        for (const line of lines) {
          const parsed = parseWeightLine(line);
          if (parsed) {
            setWeight(parsed.value);
            setWeightStable(parsed.stable);
          }
        }
      });
      return true;
    } catch (e) {
      Alert.alert('เชื่อมต่อตาชั่งล้มเหลว', e.message);
      return false;
    }
  };

  const disconnectScale = async () => {
    if (scaleSubRef.current) {
      scaleSubRef.current.remove();
      scaleSubRef.current = null;
    }
    if (scaleDevice) {
      try { await scaleDevice.disconnect(); } catch {}
      setScaleDevice(null);
      setScaleConnected(false);
    }
    setWeight(0);
    setWeightStable(false);
    scaleBufferRef.current = '';
  };

  return (
    <HardwareContext.Provider value={{
      printerConnected, scaleConnected,
      weight, weightStable,
      storedPrinterAddress, storedScaleAddress,
      getPairedDevices,
      connectPrinter, disconnectPrinter, print, openCashDrawer,
      connectScale, disconnectScale,
      loadSavedAddresses,
    }}>
      {children}
    </HardwareContext.Provider>
  );
}

export const useHardware = () => useContext(HardwareContext);
