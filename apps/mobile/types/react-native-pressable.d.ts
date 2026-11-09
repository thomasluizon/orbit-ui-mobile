import 'react-native/Libraries/Components/Pressable/Pressable'

declare module 'react-native/Libraries/Components/Pressable/Pressable' {
  /** The installed Pressable reads this prop and `types_generated` declares it; only the legacy deep-import declarations omit it. */
  interface PressableProps {
    blockNativeResponder?: boolean | undefined
  }
}
