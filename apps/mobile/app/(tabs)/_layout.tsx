import { Tabs } from 'expo-router'
import { Platform, type ViewStyle } from 'react-native'
import { Sun, Calendar, MessageCircle, User } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { colors, nav } from '@/lib/theme'

export default function TabLayout() {
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()

  const tabBarStyle: ViewStyle = {
    backgroundColor: nav.tabBarBg,
    borderTopColor: nav.tabBarBorder,
    borderTopWidth: 1,
    height: 60 + insets.bottom,
    paddingBottom: insets.bottom,
    paddingTop: 8,
    ...Platform.select({
      ios: {
        position: 'absolute' as const,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: nav.activeColor,
        tabBarInactiveTintColor: nav.inactiveColor,
        tabBarStyle,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('nav.habits'),
          tabBarIcon: ({ color, size }) => (
            <Sun color={color} size={size} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: t('nav.calendar'),
          tabBarIcon: ({ color, size }) => (
            <Calendar color={color} size={size} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: t('nav.chat'),
          tabBarIcon: ({ color, size }) => (
            <MessageCircle color={color} size={size} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('nav.profile'),
          tabBarIcon: ({ color, size }) => (
            <User color={color} size={size} strokeWidth={2} />
          ),
        }}
      />
    </Tabs>
  )
}
