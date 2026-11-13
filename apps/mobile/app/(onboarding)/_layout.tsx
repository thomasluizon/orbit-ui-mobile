import { Stack } from 'expo-router'
import { orbitScreenLayout } from '@/components/ui/orbit-screen-focus'

export default function OnboardingLayout() {
  return <Stack screenLayout={orbitScreenLayout} screenOptions={{ headerShown: false }} />
}
