import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from './src/contexts/AuthContext';
import { ThemeProvider } from './src/contexts/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';

import InstallGate from './src/components/InstallGate';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <InstallGate>
        <AuthProvider>
          <ThemeProvider>
            <AppNavigator />
          </ThemeProvider>
        </AuthProvider>
      </InstallGate>
    </GestureHandlerRootView>
  );
}
