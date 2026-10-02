import { useState } from 'react'
import { Pressable, View, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MoreVertical } from '@/components/ui/icons'
import { Menu, MenuAnchorHost, useAnchoredMenu } from '@/components/ui/menu'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { useUIStore } from '@/stores/ui-store'
import type { AppTokensV2 } from '@/lib/theme'
import { CalendarLegend } from './calendar-shell'

export function CalendarOptions({ tokens, onGoogleCalendar }: Readonly<{ tokens: AppTokensV2; onGoogleCalendar?: () => void }>) {
  const { t } = useTranslation()
  const styles = StyleSheet.create({
    shellHeader: { minHeight: 48, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
    iconButton: { minWidth: 48, minHeight: 48, borderRadius: 999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.bgField },
    pressed: { backgroundColor: tokens.bgHover },
  })
  const menu = useAnchoredMenu()
  const [legendOpen, setLegendOpen] = useState(false)
  const { sheetRef } = useSheetHost()
  const checked = useUIStore((state) => state.calendarShowRecurring)
  const setChecked = useUIStore((state) => state.setCalendarShowRecurring)
  return <>
    <View testID="calendar-shell-header" style={styles.shellHeader}>
      <MenuAnchorHost anchorRef={menu.anchorRef}><Pressable accessibilityRole="button" accessibilityLabel={t('calendar.options')} accessibilityState={{ expanded: menu.visible }} onPress={menu.open} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><MoreVertical size={24} color={tokens.fg2} strokeWidth={2} /></Pressable></MenuAnchorHost>
      <NotificationBell />
    </View>
    <Menu open={menu.visible} anchorRef={menu.anchorRef} title={t('calendar.options')} onClose={menu.close}
      items={[{ id: 'recurring', label: t('calendar.showRecurring'), checked }, { id: 'google', label: t('calendar.googleCalendar'), disabled: !onGoogleCalendar }, { id: 'legend', label: t('calendar.legendTitle') }]}
      onSelect={(id) => { if (id === 'recurring') setChecked(!checked); else if (id === 'google') onGoogleCalendar?.(); else setLegendOpen(true) }} />
    {legendOpen ? <Sheet ref={sheetRef} open title={t('calendar.legendTitle')} onClose={() => setLegendOpen(false)}>
      <CalendarLegend loggableLabel={t('calendar.legend.loggable')} fullLabel={t('calendar.legend.full')} partialLabel={t('calendar.legend.partial')} noneLabel={t('calendar.legend.none')} tokens={tokens} />
    </Sheet> : null}
  </>
}
