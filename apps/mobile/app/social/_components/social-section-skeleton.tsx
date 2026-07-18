import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SkeletonLine } from '@/components/ui/skeleton'

function SocialRowSkeleton() {
  return (
    <View style={styles.row}>
      <SkeletonLine width={40} height={40} style={styles.avatar} />
      <View style={styles.lines}>
        <SkeletonLine width="35%" height={14} />
        <SkeletonLine width="65%" height={12} />
      </View>
    </View>
  )
}

/** Loading placeholder for a social list section: avatar-and-two-line rows shaped like the final
 *  feed, friends, or buddies rows so nothing shifts when data lands (DESIGN.md: skeleton, not spinner). */
export function SocialSectionSkeleton() {
  const { t } = useTranslation()
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={t('common.loading')}>
      {[0, 1, 2, 3].map((index) => (
        <SocialRowSkeleton key={index} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  avatar: { borderRadius: 20 },
  lines: { flex: 1, gap: 6 },
})
