import { StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ProgressContent } from '@/components/progress/progress-content'

export default function ProgressScreen() {
  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <ProgressContent />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({ root: { flex: 1 } })
