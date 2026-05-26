import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator } from 'react-native';

import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import POSScreen from '../screens/POSScreen';
import PaymentScreen from '../screens/PaymentScreen';
import WeighScreen from '../screens/WeighScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function POSStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#fff' }, headerTitleStyle: { fontWeight: '700' } }}>
      <Stack.Screen name="POSMain" component={POSScreen} options={{ title: 'หน้าขาย POS' }} />
      <Stack.Screen name="Payment" component={PaymentScreen} options={{ title: 'ชำระเงิน', headerBackTitle: 'กลับ' }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const icons = {
            POS: focused ? 'cart' : 'cart-outline',
            Weigh: focused ? 'scale' : 'scale-outline',
            Settings: focused ? 'settings' : 'settings-outline',
          };
          return <Ionicons name={icons[route.name] || 'help'} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#1d4ed8',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { borderTopColor: '#e5e7eb', height: 60, paddingBottom: 8 },
        headerShown: false,
      })}>
      <Tab.Screen name="POS" component={POSStack} options={{ title: 'หน้าขาย' }} />
      <Tab.Screen name="Weigh" component={WeighScreen} options={{ title: 'ชั่งน้ำหนัก', headerShown: true, headerTitle: 'ชั่งน้ำหนัก', headerStyle: { backgroundColor: '#fff' }, headerTitleStyle: { fontWeight: '700' } }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'ตั้งค่า', headerShown: true, headerTitle: 'ตั้งค่า', headerStyle: { backgroundColor: '#1d4ed8' }, headerTitleStyle: { fontWeight: '700', color: '#fff' } }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1d4ed8' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="Main" component={MainTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
