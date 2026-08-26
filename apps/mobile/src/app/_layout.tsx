import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { colors } from '@/constants/tokens';
import { ExperienceProvider } from '@/context/experience';
import { PreferencesProvider } from '@/context/preferences';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

const dramaticTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.canvas, card: colors.canvas, text: colors.text, border: colors.border, primary: colors.brand },
};

export default function RootLayout() {
  const reducedMotion = useReducedMotion();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <PreferencesProvider>
        <ExperienceProvider>
          <ThemeProvider value={dramaticTheme}>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas }, animation: reducedMotion ? 'none' : 'fade' }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="story/[id]" options={{ presentation: 'card' }} />
              <Stack.Screen name="settings" options={{ presentation: 'card' }} />
            </Stack>
          </ThemeProvider>
        </ExperienceProvider>
      </PreferencesProvider>
    </GestureHandlerRootView>
  );
}
