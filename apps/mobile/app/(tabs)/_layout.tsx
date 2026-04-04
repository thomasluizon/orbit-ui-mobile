import { Tabs } from 'expo-router'
import { Platform, type ViewStyle } from 'react-native'
import { Sun, Calendar, MessageCircle, User } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const ACTIVE_COLOR = '#8b5cf6'
const INACTIVE_COLOR = '#7a7490'
const TAB_BAR_BG = '#0d0b16'
const TAB_BAR_BORDER = 'rgba(255, 255, 255, 0.07)'

export default function TabLayout() {
  const insets = useSafeAreaInsets()

  const tabBarStyle: ViewStyle = {
    backgroundColor: TAB_BAR_BG,
    borderTopColor: TAB_BAR_BORDER,
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
        tabBarActiveTintColor: ACTIVE_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarStyle,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }) => (
            <Sun color={color} size={size} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, size }) => (
            <Calendar color={color} size={size} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, size }) => (
            <MessageCircle color={color} size={size} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <User color={color} size={size} strokeWidth={2} />
          ),
        }}
      />
    </Tabs>
  )
}
