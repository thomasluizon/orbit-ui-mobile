import { usePrefersReducedMotion } from '@/lib/motion'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { captureBuildEnabled } from '@/lib/capture-mode'
import { Tabs, usePathname } from 'expo-router'
import { useAppTheme } from '@/lib/use-app-theme'
import { useTabSceneMotion } from '@/lib/tab-scene-motion'
import { orbitScreenLayout } from '@/components/navigation/orbit-screen-layout'

export default function TabLayout() {
  const { surfaces } = useAppTheme()
  const reducedMotion = usePrefersReducedMotion()
  const instant = captureBuildEnabled || reducedMotion
  const preset = resolveMotionPreset('tab-switch', reducedMotion)
  const sceneMotionFor = useTabSceneMotion(usePathname(), instant)

  return (
    <Tabs
      backBehavior="history"
      screenLayout={orbitScreenLayout}
      screenOptions={({ route }) => ({
        headerShown: false,
        ...(instant
          ? { animation: 'none' }
          : {
            transitionSpec: { animation: 'timing', config: { duration: Math.max(preset.enterDuration, preset.exitDuration) } },
            sceneStyleInterpolator: () => ({ sceneStyle: sceneMotionFor(route.name) }),
          }),
        sceneStyle: { backgroundColor: surfaces.screen.backgroundColor },
        tabBarStyle: {
          backgroundColor: surfaces.screen.backgroundColor,
          display: 'none',
        },
      })}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="progress" />
      <Tabs.Screen name="profile" />
    </Tabs>
  )
}
