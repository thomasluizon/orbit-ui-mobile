import { usePrefersReducedMotion, toAnimatedEasing } from '@/lib/motion'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { captureBuildEnabled } from '@/lib/capture-mode'
import { Tabs } from 'expo-router'
import { useAppTheme } from '@/lib/use-app-theme'

export default function TabLayout() {
  const { surfaces } = useAppTheme()
  const reducedMotion = usePrefersReducedMotion()
  const preset = resolveMotionPreset('tab-switch', reducedMotion)

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        animation: captureBuildEnabled || reducedMotion ? 'none' : 'shift',
        transitionSpec: { animation: 'timing', config: { duration: captureBuildEnabled ? 0 : preset.enterDuration, easing: toAnimatedEasing(preset.enterEasing) } },
        sceneStyleInterpolator: ({ current }) => ({ sceneStyle: {
          opacity: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
          transform: [{ translateX: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [-preset.shift, 0, preset.shift] }) }],
        } }),
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
