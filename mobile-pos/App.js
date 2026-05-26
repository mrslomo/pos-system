import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import { CartProvider } from './src/context/CartContext';
import { HardwareProvider } from './src/context/HardwareContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <HardwareProvider>
          <StatusBar style="auto" />
          <AppNavigator />
        </HardwareProvider>
      </CartProvider>
    </AuthProvider>
  );
}
