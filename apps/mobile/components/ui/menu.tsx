import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
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
import { Check } from '@/components/ui/icons'
import { Icon } from '@/components/ui/icon'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import {
  getFallbackPopoverAnchorRect,
  getPopoverPosition,
  type PopoverAnchorRect,
} from '@/lib/popover-positioner'
import { createTokensV2, shadowsV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useUIStore } from '@/stores/ui-store'

const DEFAULT_WIDE_FROM = 900
const PANEL_WIDTH = 320
const EMPTY_MENU_ITEMS: readonly MenuItem[] = []
let activeMenuClose: (() => void) | null = null

export interface AnchoredMenuController {
  anchorRef: RefObject<NativeView | null>
  visible: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

export function useAnchoredMenu(): AnchoredMenuController {
  const anchorRef = useRef<NativeView>(null)
  const ownsActiveMenu = useRef(false)
  const currentOpenRevision = useRef(0)
  const [openRevision, setOpenRevision] = useState(0)
  const [visible, setVisible] = useState(false)
  const dismissImmediately = useCallback(() => {
    if (ownsActiveMenu.current) {
      ownsActiveMenu.current = false
      activeMenuClose = null
    }
    setVisible(false)
  }, [])
  const close = useCallback(() => {
    if (currentOpenRevision.current !== openRevision) return
    dismissImmediately()
  }, [dismissImmediately, openRevision])
  const open = useCallback(() => {
    if (!ownsActiveMenu.current) activeMenuClose?.()
    ownsActiveMenu.current = true
    activeMenuClose = dismissImmediately
    currentOpenRevision.current += 1
    setOpenRevision(currentOpenRevision.current)
    setVisible(true)
  }, [dismissImmediately])
  const toggle = useCallback(() => {
    if (visible) close()
    else open()
  }, [close, open, visible])
  useEffect(() => () => {
    if (ownsActiveMenu.current) activeMenuClose = null
    ownsActiveMenu.current = false
  }, [])
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
  items = EMPTY_MENU_ITEMS,
  onSelect,
  onClose,
  title,
  shortTitle,
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
  const [anchorRect, setAnchorRect] = useState<PopoverAnchorRect | null>(null)
  const overlayId = useId()
  const registerOpenOverlay = useUIStore((state) => state.registerOpenOverlay)
  const unregisterOpenOverlay = useUIStore((state) => state.unregisterOpenOverlay)
  const sheetPresentation =
    presentation === 'sheet' || (presentation === 'auto' && width < (wideFrom ?? DEFAULT_WIDE_FROM))
  useEffect(() => {
    if (!open || sheetPresentation) return
    registerOpenOverlay(overlayId)
    return () => unregisterOpenOverlay(overlayId)
  }, [open, overlayId, registerOpenOverlay, sheetPresentation, unregisterOpenOverlay])
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
      <MenuSheet items={orderedItems} onClose={onClose} onSelect={onSelect} title={title} shortTitle={shortTitle} />
    )
  }

  const panelWidth = Math.min(PANEL_WIDTH, width - 16)
  const estimatedHeight = Math.min(orderedItems.length * TOUCH_TARGET_MIN + 16, height - 16)
  const position = getPopoverPosition({
    anchorRect: anchorRect ?? getFallbackPopoverAnchorRect(width),
    viewportWidth: width,
    viewportHeight: height,
    popoverWidth: panelWidth,
    popoverHeight: estimatedHeight,
  })

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, styles.catcher]}
        />
        <View
          accessibilityLabel={title}
          accessibilityRole="menu"
          style={[
            styles.panel,
            { width: panelWidth, backgroundColor: tokens.bgSheet, left: position.left, top: position.top },
          ]}
        >
          <MenuItems
            items={orderedItems}
            sheetPresentation={false}
            onActivate={(id) => {
              onClose?.()
              onSelect?.(id)
            }}
          />
        </View>
      </View>
    </Modal>
  )
}

/** The sheet presentation closes through the native dismissal before it reports the choice. */
function MenuSheet({
  items,
  onSelect,
  onClose,
  title,
  shortTitle,
}: Readonly<Pick<MenuProps, 'items' | 'onSelect' | 'onClose' | 'title' | 'shortTitle'>>) {
  const { sheetRef, closeSheet } = useSheetHost()

  return (
    <Sheet ref={sheetRef} open title={shortTitle ?? title} accessibleTitle={title} onClose={onClose}>
      <MenuItems
        items={items}
        sheetPresentation
        onActivate={(id) =>
          closeSheet(() => {
            onClose?.()
            onSelect?.(id)
          })
        }
      />
    </Sheet>
  )
}

interface MenuItemsProps {
  items: MenuProps['items']
  sheetPresentation: boolean
  onActivate: (id: string) => void
}

function MenuItems({ items, sheetPresentation, onActivate }: Readonly<MenuItemsProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { fontScale } = useWindowDimensions()

  return items?.map((item) => {
    const disabled = item.disabled === true && !item.badge
    return (
      <Pressable
        key={item.id}
        accessibilityRole={item.checked === undefined ? "menuitem" : "checkbox"}
        accessibilityState={{ disabled, checked: item.checked }}
        disabled={disabled}
        onPress={() => onActivate(item.id)}
        style={({ pressed }) => [
          styles.item,
          fontScale > 1.3 ? { alignItems: 'flex-start' } : null,
          sheetPresentation ? styles.sheetItem : null,
          item.destructive ? { borderTopColor: tokens.hairline, borderTopWidth: 1 } : null,
          pressed ? { backgroundColor: tokens.bgHover } : null,
          disabled ? styles.disabled : null,
        ]}
      >
        {item.icon ? <Icon color={item.destructive ? tokens.statusBad : tokens.fg2} name={item.icon} size={20} strokeWidth={2} /> : null}
        <Text
          numberOfLines={fontScale > 1.3 ? undefined : 1}
          style={[styles.label, { color: item.destructive ? tokens.statusBadText : tokens.fg1 }]}
        >
          {item.label}
        </Text>
        {item.checked ? <View style={{ height: 20 * fontScale, justifyContent: 'center' }}><Check size={20} color={tokens.fg1} strokeWidth={2} /></View> : null}
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
  catcher: {
    backgroundColor: 'transparent',
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
    overflow: 'hidden',
    flexDirection: 'row',
    gap: 12,
    minHeight: TOUCH_TARGET_MIN,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sheetItem: {
    minHeight: 56,
  },
  label: {
    flex: 1,
    fontFamily: 'Geist_500Medium',
    fontSize: 14,
    lineHeight: 20,
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
