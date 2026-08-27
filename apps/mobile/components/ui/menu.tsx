import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { MenuItem, MenuProps } from '@orbit/shared/contracts/overlay'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type View as NativeView,
} from 'react-native'
import { Icon } from '@/components/ui/icon'
import { Sheet } from '@/components/ui/sheet'
import { getAnchoredMenuPosition, getFallbackAnchorRect, type MenuAnchorRect } from '@/lib/anchored-menu'
import { createTokensV2, shadowsV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const DEFAULT_WIDE_FROM = 900
const PANEL_WIDTH = 280

export interface AnchoredMenuController {
  anchorRef: RefObject<NativeView | null>
  visible: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

export function useAnchoredMenu(): AnchoredMenuController {
  const anchorRef = useRef<NativeView>(null)
  const [visible, setVisible] = useState(false)
  const open = useCallback(() => setVisible(true), [])
  const close = useCallback(() => setVisible(false), [])
  const toggle = useCallback(() => {
    if (visible) close()
    else open()
  }, [close, open, visible])
  return { anchorRef, visible, open, close, toggle }
}

export function MenuAnchorHost({
  anchorRef,
  children,
}: Readonly<{ anchorRef: RefObject<NativeView | null>; children: ReactNode }>) {
  return <View ref={anchorRef} collapsable={false}>{children}</View>
}

type MeasurableAnchor = NativeView & {
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void
}

export function Menu({
  open = false,
  items = [],
  onSelect,
  onClose,
  title,
  presentation = 'auto',
  anchorRef,
  wideFrom,
}: Readonly<MenuProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const { width, height } = useWindowDimensions()
  const [anchorRect, setAnchorRect] = useState<MenuAnchorRect | null>(null)
  const sheetPresentation =
    presentation === 'sheet' || (presentation === 'auto' && width < (wideFrom ?? DEFAULT_WIDE_FROM))
  const orderedItems = useMemo(() => orderMenuItems(items), [items])

  useEffect(() => {
    if (!open || sheetPresentation) return
    const anchor = anchorRef?.current as MeasurableAnchor | null | undefined
    anchor?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
      setAnchorRect({ x, y, width: measuredWidth, height: measuredHeight })
    })
  }, [anchorRef, height, open, sheetPresentation, width])

  if (!open) return null

  if (sheetPresentation) {
    return (
      <Sheet open title={title} onClose={onClose}>
        <MenuItems items={orderedItems} onClose={onClose} onSelect={onSelect} />
      </Sheet>
    )
  }

  const estimatedHeight = Math.min(orderedItems.length * 48 + 16, height - 16)
  const position = getAnchoredMenuPosition({
    anchorRect: anchorRect ?? getFallbackAnchorRect(width),
    viewportWidth: width,
    viewportHeight: height,
    menuWidth: PANEL_WIDTH,
    menuHeight: estimatedHeight,
  })

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityLabel={title}
          accessibilityRole="menu"
          style={[
            styles.panel,
            { backgroundColor: tokens.bgSheet, left: position.left, top: position.top },
          ]}
        >
          <MenuItems items={orderedItems} onClose={onClose} onSelect={onSelect} />
        </View>
      </View>
    </Modal>
  )
}

function MenuItems({
  items,
  onSelect,
  onClose,
}: Readonly<Pick<MenuProps, 'items' | 'onSelect' | 'onClose'>>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return items?.map((item) => {
    const disabled = item.disabled === true && !item.badge
    return (
      <Pressable
        key={item.id}
        accessibilityRole="menuitem"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => {
          onSelect?.(item.id)
          onClose?.()
        }}
        style={({ pressed }) => [
          styles.item,
          item.destructive ? { borderTopColor: tokens.hairline, borderTopWidth: 1 } : null,
          pressed ? { backgroundColor: tokens.bgElevPressed } : null,
          disabled ? styles.disabled : null,
        ]}
      >
        {item.icon ? <Icon color={tokens.fg2} name={item.icon} size={20} /> : null}
        <Text
          numberOfLines={1}
          style={[styles.label, { color: item.destructive ? tokens.statusBadText : tokens.fg1 }]}
        >
          {item.label}
        </Text>
        {item.badge ? (
          <View style={[styles.badge, { backgroundColor: tokens.bgElev }]}>
            <Text style={[styles.badgeText, { color: tokens.fg2 }]}>{item.badge}</Text>
          </View>
        ) : null}
      </Pressable>
    )
  })
}

function orderMenuItems(items: readonly MenuItem[]) {
  return [...items.filter((item) => !item.destructive), ...items.filter((item) => item.destructive)]
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  panel: {
    ...shadowsV2.shadow2,
    borderRadius: 20,
    padding: 8,
    position: 'absolute',
    width: PANEL_WIDTH,
  },
  item: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  label: {
    flex: 1,
    fontFamily: 'Geist_500Medium',
    fontSize: 15,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontFamily: 'Geist_500Medium',
    fontSize: 12,
  },
  disabled: {
    opacity: 0.4,
  },
})
