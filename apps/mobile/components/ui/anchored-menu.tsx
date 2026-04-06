import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Dimensions,
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import {
  getAnchoredMenuPosition,
  type MenuAnchorRect,
} from '@/lib/anchored-menu'
import { radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface AnchoredMenuProps {
  visible: boolean
  anchorRect: MenuAnchorRect | null
  onClose: () => void
  children: ReactNode
  width?: number
  estimatedHeight?: number
  panelStyle?: StyleProp<ViewStyle>
}

export function AnchoredMenu({
  visible,
  anchorRect,
  onClose,
  children,
  width = 200,
  estimatedHeight = 220,
  panelStyle,
}: Readonly<AnchoredMenuProps>) {
  const { colors, shadows } = useAppTheme()
  const styles = useMemo(() => createStyles(colors, shadows), [colors, shadows])
  const [menuHeight, setMenuHeight] = useState(estimatedHeight)

  useEffect(() => {
    if (visible) {
      setMenuHeight(estimatedHeight)
    }
  }, [estimatedHeight, visible])

  useEffect(() => {
    if (!visible) return

    const subscription = Dimensions.addEventListener('change', onClose)
    return () => {
      subscription.remove()
    }
  }, [onClose, visible])

  const position = useMemo(() => {
    if (!anchorRect) return null

    const window = Dimensions.get('window')
    return getAnchoredMenuPosition({
      anchorRect,
      viewportWidth: window.width,
      viewportHeight: window.height,
      menuWidth: width,
      menuHeight,
    })
  }, [anchorRect, menuHeight, width])

  if (!visible || !anchorRect || !position) {
    return null
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[
            styles.panel,
            panelStyle,
            {
              width,
              left: position.left,
              top: position.top,
            },
          ]}
          onLayout={(event) => {
            const nextHeight = event.nativeEvent.layout.height
            if (Math.abs(nextHeight - menuHeight) > 1) {
              setMenuHeight(nextHeight)
            }
          }}
        >
          {children}
        </View>
      </View>
    </Modal>
  )
}

function createStyles(
  colors: ReturnType<typeof useAppTheme>['colors'],
  shadows: ReturnType<typeof useAppTheme>['shadows'],
) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.01)',
    },
    panel: {
      position: 'absolute',
      minWidth: 176,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      backgroundColor: colors.surfaceOverlay,
      padding: 6,
      ...shadows.lg,
      elevation: 16,
    },
  })
}
