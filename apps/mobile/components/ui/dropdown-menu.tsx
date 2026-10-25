import { SPACING, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { useMenuState } from '@/hooks/use-menu-state'
import { createContext, useContext, useEffect, useId, useMemo, useRef, type ReactNode, type ComponentProps } from 'react'
import type { MenuItem, MenuProps } from '@orbit/shared/contracts/overlay'
import * as Primitive from '@rn-primitives/dropdown-menu'
import { useComposedRefs } from '@rn-primitives/hooks'
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { Check } from '@/components/ui/icons'
import { Icon } from '@/components/ui/icon'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { createTokensV2, shadowsV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { createAnimatedTimingConfig, useResolvedMotionPreset } from '@/lib/motion'
import { useUIStore } from '@/stores/ui-store'

const PANEL_WIDTH = 320
const MenuContext = createContext<ReturnType<typeof useMenuState> & { triggerRef: React.RefObject<Primitive.TriggerRef | null> } | null>(null)

function useMenu() {
  const context = useContext(MenuContext)
  if (!context) throw new Error('Menu parts require a Root')
  return context
}

export function Root({ open, onOpenChange, children }: Readonly<{ open?: boolean; onOpenChange?: (open: boolean) => void; children: ReactNode }>) {
  const state = useMenuState(open, onOpenChange)
  const triggerRef = useRef<Primitive.TriggerRef>(null)
  const context = useMemo(() => ({ ...state, triggerRef }), [state])
  return <MenuContext.Provider value={context}>
    <Primitive.Root onOpenChange={state.changeOpen} style={styles.root}>
      <ControlledRoot />{children}
    </Primitive.Root>
  </MenuContext.Provider>
}

function ControlledRoot() {
  const { open, triggerRef } = useMenu()
  const primitive = Primitive.useRootContext()
  useEffect(() => {
    if (primitive.open === open) return
    if (open) triggerRef.current?.open()
    else primitive.onOpenChange(false)
  }, [open, primitive, triggerRef])
  return null
}

export function Trigger({ ref, ...props }: ComponentProps<typeof Primitive.Trigger>) {
  const { triggerRef } = useMenu()
  const composedRef = useComposedRefs(triggerRef, ref)
  return <Primitive.Trigger ref={composedRef} {...props} />
}

export const Portal = Primitive.Portal

type ContentProps = Omit<MenuProps, 'open' | 'onClose' | 'anchorRef'>

export function Content({ items = [], onSelect, title, shortTitle, titleMode, presentation = 'auto', wideFrom = 900, align = 'end' }: Readonly<ContentProps>) {
  const { open, close } = useMenu()
  const { width } = useWindowDimensions()
  const onClose = close
  const orderedItems = [...items.filter((item) => !item.destructive), ...items.filter((item) => item.destructive)]
  const sheet = presentation === 'sheet' || (presentation === 'auto' && width < wideFrom)
  if (!open || items.length === 0) return null
  if (sheet) return <MenuSheet items={orderedItems} onClose={onClose} onSelect={onSelect} title={title} shortTitle={shortTitle} titleMode={titleMode} />
  return <AnchoredContent items={orderedItems} title={title} align={align} onSelect={(id) => { onClose(); onSelect?.(id) }} />
}

function AnchoredContent({ items, title, align, onSelect }: Readonly<{ items: readonly MenuItem[]; title?: string; align: 'start' | 'end'; onSelect: (id: string) => void }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { width } = useWindowDimensions()
  const opacity = useMemo(() => new Animated.Value(0), [])
  const motion = useResolvedMotionPreset('menu')
  useEffect(() => {
    const animation = Animated.timing(opacity, createAnimatedTimingConfig(motion.enterDuration, motion.enterEasing))
    animation.start()
    return () => animation.stop()
  }, [motion.enterDuration, motion.enterEasing, opacity])
  const overlayId = `menu:${useId()}`
  const register = useUIStore((state) => state.registerOpenOverlay)
  const unregister = useUIStore((state) => state.unregisterOpenOverlay)
  useEffect(() => { register(overlayId); return () => unregister(overlayId) }, [overlayId, register, unregister])
  return <Portal><View key={overlayId} style={StyleSheet.absoluteFill} pointerEvents="box-none" accessibilityViewIsModal>
    <Primitive.Overlay accessibilityElementsHidden importantForAccessibility="no" style={[StyleSheet.absoluteFill, styles.catcher]} />
    <Primitive.Content asChild accessibilityLabel={title} accessibilityRole="menu" align={align} sideOffset={8} insets={{ top: 8, bottom: 8, left: 8, right: 8 }} style={StyleSheet.flatten([styles.panel, { width: Math.min(PANEL_WIDTH, width - 16), backgroundColor: tokens.bgSheet }])}>
      <Animated.View style={{ opacity }}><MenuItems items={items} sheetPresentation={false} onActivate={onSelect} /></Animated.View>
    </Primitive.Content>
  </View></Portal>
}

function MenuSheet({ items, onSelect, onClose, title, shortTitle, titleMode }: Readonly<ContentProps & { onClose: () => void }>) {
  const { sheetRef, closeSheet } = useSheetHost()
  return <Sheet ref={sheetRef} open title={titleMode === 'typed' ? title : shortTitle ?? title} titleMode={titleMode} accessibleTitle={title} onClose={onClose}>
    <View accessibilityRole="menu" accessibilityLabel={title}>
      <MenuItems items={items ?? []} sheetPresentation onActivate={(id) => closeSheet(() => { onClose(); onSelect?.(id) })} />
    </View>
  </Sheet>
}

interface MenuItemsProps { items: readonly MenuItem[]; sheetPresentation: boolean; onActivate: (id: string) => void }

function MenuItems({ items, sheetPresentation, onActivate }: Readonly<MenuItemsProps>) {
  return items.map((item) => <Item key={item.id} item={item} sheetPresentation={sheetPresentation} onActivate={onActivate} />)
}

export function Item({ item, sheetPresentation, onActivate }: Readonly<{ item: MenuItem; sheetPresentation: boolean; onActivate: (id: string) => void }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { fontScale } = useWindowDimensions()
    const disabled = item.disabled === true && !item.badge
    const content = (
      <Pressable
        accessibilityRole={item.checked === undefined ? "menuitem" : "checkbox"}
        accessibilityState={{ disabled, checked: item.checked }}
        disabled={disabled}
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

    return item.checked === undefined
      ? <Primitive.Item asChild disabled={disabled} textValue={item.label} closeOnPress={false} onPress={() => onActivate(item.id)}>{content}</Primitive.Item>
      : <Primitive.CheckboxItem asChild disabled={disabled} textValue={item.label} closeOnPress={false} checked={item.checked} onCheckedChange={() => onActivate(item.id)}>{content}</Primitive.CheckboxItem>
}

const styles = StyleSheet.create({
  root: { display: 'contents' },
  overlay: {
    flex: 1,
  },
  catcher: {
    backgroundColor: 'transparent',
  },
  panel: {
    ...shadowsV2.shadow2,
    borderRadius: 20,
    padding: SPACING.s8,
    width: PANEL_WIDTH,
  },
  item: {
    alignItems: 'center',
    borderRadius: 12,
    overflow: 'hidden',
    flexDirection: 'row',
    gap: 12,
    minHeight: TOUCH_TARGET_MIN,
    paddingHorizontal: SPACING.s12,
    paddingVertical: SPACING.s8,
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
    paddingHorizontal: SPACING.s8,
    paddingVertical: SPACING.s4,
  },
  badgeText: {
    fontFamily: 'Geist_500Medium',
    fontSize: 12,
  },
  disabled: {
    opacity: 0.4,
  },
})
