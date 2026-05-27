import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text, View, ActivityIndicator } from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ShiftProvider, useShift } from './src/context/ShiftContext';
import LoginScreen from './src/screens/LoginScreen';
import ShiftStartScreen from './src/screens/ShiftStartScreen';
import POSScreen from './src/screens/POSScreen';
import WeighScreen from './src/screens/WeighScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ emoji, label, focused }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 20 }}>{emoji}</Text>
      <Text style={{ fontSize: 10, color: focused ? '#3b82f6' : '#94a3b8', marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { height: 56, paddingBottom: 4, backgroundColor: '#fff', borderTopColor: '#e2e8f0' },
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen name="POS" component={POSScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🛒" label="หน้าขาย" focused={focused} /> }}
      />
      <Tab.Screen name="Weigh" component={WeighScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="⚖️" label="ชั่งน้ำหนัก" focused={focused} /> }}
      />
    </Tab.Navigator>
  );
}

function RootNav() {
  const { user, loading } = useAuth();
  const { shift, loadingShift, checkOpenShift } = useShift();

  useEffect(() => {
    if (user) checkOpenShift(user.branch_id, user.id);
  }, [user]);

  if (loading || (user && loadingShift)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e3a5f' }}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={{ color: '#93c5fd', marginTop: 12, fontSize: 14 }}>
          {loadingShift ? 'กำลังตรวจสอบกะ...' : 'กำลังโหลด...'}
        </Text>
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : !shift ? (
        <Stack.Screen name="ShiftStart" component={ShiftStartScreen} />
      ) : (
        <Stack.Screen name="Main" component={MainTabs} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ShiftProvider>
          <NavigationContainer>
            <RootNav />
          </NavigationContainer>
        </ShiftProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
