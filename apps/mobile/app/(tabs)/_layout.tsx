import { Tabs } from 'expo-router'
import { SceneStyleInterpolators, TransitionSpecs } from '@react-navigation/bottom-tabs'

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: 'shift',
        sceneStyleInterpolator: SceneStyleInterpolators.forShift,
        transitionSpec: TransitionSpecs.ShiftSpec,
        sceneStyle: { backgroundColor: 'transparent' },
        tabBarStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="profile" />
    </Tabs>
  )
}
