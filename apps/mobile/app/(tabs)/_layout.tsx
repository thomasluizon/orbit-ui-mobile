import { Tabs } from 'expo-router'
import { SceneStyleInterpolators, TransitionSpecs } from 'expo-router/js-tabs'
import { useAppTheme } from '@/lib/use-app-theme'
import { captureBuildEnabled } from '@/lib/capture-mode'

export default function TabLayout() {
  const { surfaces } = useAppTheme()

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        animation: captureBuildEnabled ? 'none' : 'shift',
        sceneStyleInterpolator: SceneStyleInterpolators.forShift,
        transitionSpec: TransitionSpecs.ShiftSpec,
        sceneStyle: { backgroundColor: surfaces.screen.backgroundColor },
        tabBarStyle: {
          backgroundColor: surfaces.screen.backgroundColor,
          display: 'none',
        },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="profile" />
    </Tabs>
  )
}
