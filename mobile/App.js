import React, { useState, useEffect } from 'react';
import { StatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('pos_token').then(token => {
      setIsLoggedIn(!!token);
      setLoading(false);
    });
  }, []);

  if (loading) return null;

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#1e3a8a" />
      <AppNavigator isLoggedIn={isLoggedIn} onLogout={() => setIsLoggedIn(false)} />
    </>
  );
}
