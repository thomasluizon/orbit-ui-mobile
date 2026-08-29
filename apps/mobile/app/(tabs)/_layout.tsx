import { Tabs } from 'expo-router'
import { useAppTheme } from '@/lib/use-app-theme'

export default function TabLayout() {
  const { surfaces } = useAppTheme()

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        animation: 'none',
        sceneStyle: { backgroundColor: surfaces.screen.backgroundColor },
        tabBarStyle: {
          backgroundColor: surfaces.screen.backgroundColor,
          display: 'none',
        },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="progress" />
      <Tabs.Screen name="profile" />
    </Tabs>
  )
}
