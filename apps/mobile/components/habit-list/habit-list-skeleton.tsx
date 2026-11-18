import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SPACING } from '@orbit/shared/theme'
import { Skeleton } from '@/components/ui/skeleton'

const SKELETON_KEYS = ['skeleton-1', 'skeleton-2', 'skeleton-3', 'skeleton-4', 'skeleton-5']

/** The habit list region while its data is pending. Today draws it before the profile arrives and again while the habits load. */
export function HabitListSkeleton() {
  const { t } = useTranslation()
  return <View style={styles.container}>
    {SKELETON_KEYS.map((key) => <Skeleton key={key} variant="habit-row" label={t('common.loading')} />)}
  </View>
}

const styles = StyleSheet.create({
  container: { paddingTop: SPACING.s12, gap: SPACING.s12 },
})
