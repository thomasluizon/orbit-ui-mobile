import { StyleSheet, View } from 'react-native'
import { ProgressContent } from '@/components/progress/progress-content'

export default function ProgressScreen() {
  return (
    <View style={styles.root}>
      <ProgressContent />
    </View>
  )
}

const styles = StyleSheet.create({ root: { flex: 1 } })
