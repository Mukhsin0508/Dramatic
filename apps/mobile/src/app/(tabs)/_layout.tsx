import { Tabs } from 'expo-router';
import { SymbolView, SymbolViewProps } from 'expo-symbols';
import { ColorValue } from 'react-native';

import { colors } from '@/constants/tokens';

function TabIcon({ name, color }: { name: SymbolViewProps['name']; color: ColorValue }) {
  return <SymbolView name={name} size={23} tintColor={color} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.canvas },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600', marginTop: 1 },
        tabBarStyle: { backgroundColor: 'rgba(15,13,17,.98)', borderTopColor: colors.border, height: 80, paddingTop: 8, paddingBottom: 12 },
      }}>
      <Tabs.Screen name="watch" options={{ title: 'Watch', tabBarAccessibilityLabel: 'Watch', tabBarIcon: ({ color }) => <TabIcon name="play.rectangle.fill" color={color} /> }} />
      <Tabs.Screen name="library" options={{ title: 'Library', tabBarAccessibilityLabel: 'Library', tabBarIcon: ({ color }) => <TabIcon name="bookmark.fill" color={color} /> }} />
      <Tabs.Screen name="wallet" options={{ title: 'Wallet', tabBarAccessibilityLabel: 'Wallet', tabBarIcon: ({ color }) => <TabIcon name="creditcard.fill" color={color} /> }} />
      <Tabs.Screen name="you" options={{ title: 'You', tabBarAccessibilityLabel: 'You', tabBarIcon: ({ color }) => <TabIcon name="person.fill" color={color} /> }} />
    </Tabs>
  );
}
