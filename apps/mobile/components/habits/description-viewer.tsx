import { useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native'
import { ArrowLeft } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { colors, radius } from '@/lib/theme'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DescriptionViewerProps {
  open: boolean
  onClose: () => void
  title: string
  description: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DescriptionViewer({
  open,
  onClose,
  title,
  description,
}: Readonly<DescriptionViewerProps>) {
  const { t } = useTranslation()

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  return (
    <BottomSheetModal
      open={open}
      onClose={handleClose}
      title={title}
      snapPoints={['70%', '90%']}
    >
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.descriptionText}>{description}</Text>
      </ScrollView>
    </BottomSheetModal>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textSecondary,
  },
})
