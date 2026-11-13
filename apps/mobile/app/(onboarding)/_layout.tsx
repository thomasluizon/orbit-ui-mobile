import { Stack } from 'expo-router'
import { orbitScreenLayout } from '@/components/navigation/orbit-screen-layout'

export default function OnboardingLayout() {
  return <Stack screenLayout={orbitScreenLayout} screenOptions={{ headerShown: false }} />
}
