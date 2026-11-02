export * from 'react-native'

// WHY: the list still imports a removed core scheduler; scope its replacement to the Android adapter https://github.com/computerjazz/react-native-draggable-flatlist/issues/627
export const InteractionManager = {
  runAfterInteractions(callback: () => void) {
    return requestIdleCallback(() => callback())
  },
}
