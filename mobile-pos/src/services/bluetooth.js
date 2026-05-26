// Bluetooth service — manages printer and scale connections
// Uses react-native-bluetooth-classic (SPP / RFCOMM)
// This file is imported ONLY after native build (not Expo Go)

import RNBluetoothClassic, { BluetoothEventType } from 'react-native-bluetooth-classic';

let printerDevice = null;
let scaleDevice = null;
let scaleSubscription = null;

// ────────────────────────────────────────────
// Shared helpers
// ────────────────────────────────────────────

export async function requestBluetoothEnabled() {
  const enabled = await RNBluetoothClassic.isBluetoothEnabled();
  if (!enabled) await RNBluetoothClassic.requestBluetoothEnabled();
  return RNBluetoothClassic.isBluetoothEnabled();
}

export async function getPairedDevices() {
  return RNBluetoothClassic.getBondedDevices();
}

// ────────────────────────────────────────────
// Printer
// ────────────────────────────────────────────

export async function connectPrinter(device) {
  if (printerDevice) {
    try { await printerDevice.disconnect(); } catch {}
  }
  const connected = await device.connect({ CONNECTOR_TYPE: 'rfcomm', DELIMITER: '', DEVICE_CHARSET: 'latin-1' });
  printerDevice = connected;
  return printerDevice;
}

export async function disconnectPrinter() {
  if (printerDevice) {
    try { await printerDevice.disconnect(); } catch {}
    printerDevice = null;
  }
}

export function isPrinterConnected() {
  return printerDevice !== null;
}

export async function printBytes(escposString) {
  if (!printerDevice) throw new Error('ไม่ได้เชื่อมต่อเครื่องพิมพ์');
  // Convert to byte string (latin-1 for ESC/POS)
  await printerDevice.write(escposString);
}

// ────────────────────────────────────────────
// Scale (Bluetooth SPP)
// ────────────────────────────────────────────

// Weight string parser
function parseWeightFromString(str) {
  if (!str) return null;
  const clean = str.replace(/[\x00-\x08\x0b\x0e-\x1f\x7f]/g, '').trim();
  if (!clean) return null;

  const isUnstable = clean.toUpperCase().includes('US') || clean.toUpperCase().includes('UNSTABLE');
  const m = clean.match(/([+\-]?\s*\d[\d\s]*\.?\d*)/);
  if (!m) return null;

  let val = parseFloat(m[1].replace(/\s/g, ''));
  if (isNaN(val) || val < 0) return null;

  const lower = clean.toLowerCase();
  if ((lower.includes(' g') || lower.endsWith('g')) && !lower.includes('kg')) {
    val = val / 1000;
  }
  return { value: val, stable: !isUnstable };
}

let scaleBuffer = '';
let scaleCallback = null;

export async function connectScale(device, onWeight) {
  if (scaleDevice) {
    try { await disconnectScale(); } catch {}
  }
  const connected = await device.connect({ CONNECTOR_TYPE: 'rfcomm', DELIMITER: '\n', DEVICE_CHARSET: 'ascii' });
  scaleDevice = connected;
  scaleCallback = onWeight;
  scaleBuffer = '';

  scaleSubscription = scaleDevice.onDataReceived((data) => {
    scaleBuffer += data.data;
    const lines = scaleBuffer.split(/[\r\n]+/);
    scaleBuffer = lines.pop();
    for (const line of lines) {
      const parsed = parseWeightFromString(line);
      if (parsed && scaleCallback) scaleCallback(parsed);
    }
  });

  return scaleDevice;
}

export async function disconnectScale() {
  if (scaleSubscription) {
    scaleSubscription.remove();
    scaleSubscription = null;
  }
  if (scaleDevice) {
    try { await scaleDevice.disconnect(); } catch {}
    scaleDevice = null;
  }
  scaleCallback = null;
}

export function isScaleConnected() {
  return scaleDevice !== null;
}
