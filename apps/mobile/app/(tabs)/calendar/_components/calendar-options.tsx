import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MoreVertical } from '@/components/ui/icons'
import { CheckRow } from '@/components/ui/check-row'
import { ListRow } from '@/components/ui/list-row'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { DestinationHeaderRow } from '@/components/navigation/root-notification-header'
import { useUIStore } from '@/stores/ui-store'
import type { AppTokensV2 } from '@/lib/theme'
import { CalendarLegend } from './calendar-shell'

export function CalendarOptions({ tokens, onGoogleCalendar }: Readonly<{ tokens: AppTokensV2; onGoogleCalendar?: () => void }>) {
  const { t } = useTranslation()
  const styles = StyleSheet.create({
    iconButton: { minWidth: 48, minHeight: 48, borderRadius: 999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
    pressed: { backgroundColor: tokens.bgHover },
  })
  const [menuOpen, setMenuOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const { sheetRef } = useSheetHost()
  const { sheetRef: optionsSheetRef, closeSheet: closeOptionsSheet } = useSheetHost()
  const checked = useUIStore((state) => state.calendarShowRecurring)
  const setChecked = useUIStore((state) => state.setCalendarShowRecurring)
  function closeOptions(action: () => void) {
    closeOptionsSheet(() => { setMenuOpen(false); action() })
  }
  return <>
    <DestinationHeaderRow testID="calendar-shell-header">
      <Pressable accessibilityRole="button" accessibilityLabel={t('calendar.options')} accessibilityState={{ expanded: menuOpen }} onPress={() => setMenuOpen(true)} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><MoreVertical size={24} color={tokens.fg2} strokeWidth={2} /></Pressable>
      <NotificationBell />
    </DestinationHeaderRow>
    {menuOpen ? <Sheet ref={optionsSheetRef} open title={t('calendar.options')} onClose={() => setMenuOpen(false)}>
      <View style={{ gap: 8 }}>
        <CheckRow placement="column" label={t('calendar.showRecurring')} checked={checked} onChange={(next) => closeOptions(() => setChecked(next))} />
        <ListRow placement="column" textMode="label" title={t('calendar.googleCalendar')} accessibilityLabel={t('calendar.googleCalendar')} disabled={!onGoogleCalendar} onClick={() => closeOptions(() => onGoogleCalendar?.())} />
        <ListRow placement="column" textMode="label" title={t('calendar.legendTitle')} accessibilityLabel={t('calendar.legendTitle')} onClick={() => closeOptions(() => setLegendOpen(true))} />
      </View>
    </Sheet> : null}
    {legendOpen ? <Sheet ref={sheetRef} open title={t('calendar.legendTitle')} onClose={() => setLegendOpen(false)}>
      <CalendarLegend loggableLabel={t('calendar.legend.loggable')} fullLabel={t('calendar.legend.full')} partialLabel={t('calendar.legend.partial')} noneLabel={t('calendar.legend.none')} tokens={tokens} />
    </Sheet> : null}
  </>
}
