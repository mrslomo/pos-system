import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('pos_user').then(u => {
      if (u) setUser(JSON.parse(u));
    }).finally(() => setLoading(false));
  }, []);

  const login = async (username, password) => {
    const data = await authAPI.login({ username, password });
    await AsyncStorage.setItem('pos_token', data.token);
    await AsyncStorage.setItem('pos_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    await AsyncStorage.removeItem('pos_token');
    await AsyncStorage.removeItem('pos_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
