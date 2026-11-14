import { StyleSheet, View } from 'react-native'
import type { ProgressSubmenuId } from '@orbit/shared/utils/progress-navigation'
import { Skeleton } from '@/components/ui/skeleton'

export function ProgressLoading({ label, screen }: Readonly<{ label: string; screen: ProgressSubmenuId }>) {
  return <View style={styles.loading} accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }}>
    {screen !== 'goals' ? <Skeleton variant="settings" grouped /> : null}
    {screen === 'streak' ? <>
      <View style={{ height: 20 }}><Skeleton variant="fill" grouped /></View>
      <View style={styles.loadingTileRow}><View style={styles.loadingTile}><Skeleton variant="stat-tile" grouped /></View><View style={styles.loadingTile}><Skeleton variant="stat-tile" grouped /></View></View>
      <Skeleton variant="settings" rows={3} grouped />
    </> : <View style={styles.loadingRows}>
      {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} variant="habit-row" grouped />)}
    </View>}
  </View>
}

const styles = StyleSheet.create({
  loading: { gap: 32 }, loadingRows: { gap: 12 },
  loadingTileRow: { flexDirection: 'row', gap: 16 }, loadingTile: { flex: 1, minWidth: 0 },
})
