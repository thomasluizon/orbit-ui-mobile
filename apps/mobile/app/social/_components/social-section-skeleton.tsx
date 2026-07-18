import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SkeletonRow } from '@/components/ui/skeleton'

/** Loading placeholder for a social list section: avatar-and-two-line rows shaped like the final
 *  feed, friends, or buddies rows so nothing shifts when data lands (DESIGN.md: skeleton, not spinner). */
export function SocialSectionSkeleton() {
  const { t } = useTranslation()
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={t('common.loading')}>
      {[0, 1, 2, 3].map((index) => (
        <SkeletonRow key={index} />
      ))}
    </View>
  )
}
