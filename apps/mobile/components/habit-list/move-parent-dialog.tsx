import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Home, Search } from '@/components/ui/icons'
import { filterMoveTargetsBySearch } from '@orbit/shared/utils'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { PillButton } from '@/components/ui/pill-button'
import { RadioGroup } from '@/components/ui/radio-row'
import { RadioRow } from '@/components/ui/select-check'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export interface MoveParentOption {
  id: string | null
  label: string
  emoji: string | null
  depth: number
  childCount: number
  disabled: boolean
  reason: string | null
}

interface MoveParentDialogProps {
  t: (key: string, params?: Record<string, unknown>) => string
  visible: boolean
  isPending: boolean
  movingHabitTitle: string | null
  movingHabitParentId: string | null
  options: MoveParentOption[]
  selectedMoveParentId: string | null
  canSubmit: boolean
  onClose: () => void
  onConfirm: () => void
  onSelectOption: (optionId: string | null) => void
}

const SEARCH_THRESHOLD = 8

type Styles = ReturnType<typeof createStyles>

function MoveDialogDescription({
  title,
  text,
  styles,
}: Readonly<{ title: string | null; text: string; styles: Styles }>) {
  if (!title) return null
  return <Text style={styles.moveDialogDescription}>{text}</Text>
}

function MoveTargetRow({
  option,
  selected,
  isCurrentParent,
  currentLabel,
  tokens,
  styles,
  onSelect,
}: Readonly<{
  option: MoveParentOption
  selected: boolean
  isCurrentParent: boolean
  currentLabel: string
  tokens: AppTokensV2
  styles: Styles
  onSelect: (optionId: string | null) => void
}>) {
  const availability = option.disabled
    ? { disabled: true as const, reason: option.reason ?? currentLabel }
    : { disabled: false as const }

  return (
    <RadioRow
      label={option.label}
      selected={selected}
      {...availability}
      depth={option.depth}
      meta={option.childCount > 0 ? String(option.childCount) : undefined}
      tag={isCurrentParent ? currentLabel : undefined}
      leading={option.id === null
        ? <Home size={20} strokeWidth={1.8} color={tokens.fg2} />
        : <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.wellEmoji}>{option.emoji ?? '·'}</Text>}
      onSelect={() => onSelect(option.id)}
    />
  )
}

/** Move-parent picker sheet (mobile). Presentational: the parent HabitList
 *  owns the move state and supplies the validated option list plus handlers. */
export function MoveParentDialog({
  t,
  visible,
  isPending,
  movingHabitTitle,
  movingHabitParentId,
  options,
  selectedMoveParentId,
  canSubmit,
  onClose,
  onConfirm,
  onSelectOption,
}: Readonly<MoveParentDialogProps>) {
  const { sheetRef, closeSheet } = useSheetHost()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)

  const [searchQuery, setSearchQuery] = useState('')

  const rootOption = useMemo(
    () => options.find((option) => option.id === null) ?? null,
    [options],
  )
  const destinationCount = useMemo(
    () => options.reduce((total, option) => (option.id === null ? total : total + 1), 0),
    [options],
  )
  const showSearch = destinationCount > SEARCH_THRESHOLD

  const treeRows = useMemo(() => {
    const rows = showSearch ? filterMoveTargetsBySearch(options, searchQuery) : options
    return rows.filter((option) => option.id !== null)
  }, [options, showSearch, searchQuery])

  const isSearchEmpty = showSearch && searchQuery.trim().length > 0 && treeRows.length === 0

  const hideDialog = () => {
    setSearchQuery('')
    onClose()
  }

  return (
    visible ? (<Sheet
      ref={sheetRef}
      open
      onClose={isPending ? undefined : hideDialog}
      title={t('habits.moveParent.title')}
      actions={
        <View style={styles.actions}>
          <PillButton variant="ghost" disabled={isPending} onClick={() => closeSheet()}>
            {t('common.cancel')}
          </PillButton>
          <PillButton disabled={!canSubmit} loading={isPending} onClick={onConfirm}>
            {t('habits.moveParent.confirm')}
          </PillButton>
        </View>
      }
    >
      <View style={styles.sheetBody}>
        <MoveDialogDescription
          title={movingHabitTitle}
          text={t('habits.moveParent.description', { name: movingHabitTitle })}
          styles={styles}
        />

        {showSearch ? (
          <View style={styles.searchWrap}>
            <Input
              label={t('habits.moveParent.searchPlaceholder')}
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={t('habits.moveParent.searchPlaceholder')}
              trailing={<Search size={20} strokeWidth={1.8} color={tokens.fg3} />}
            />
          </View>
        ) : null}

        {treeRows.length > 0 ? (
          <Text style={styles.eyebrow}>{t('habits.moveParent.destinations')}</Text>
        ) : null}

        <RadioGroup accessibilityLabel={t('habits.moveParent.destinations')}>
          {rootOption ? (
            <MoveTargetRow
              option={rootOption}
              selected={rootOption.id === selectedMoveParentId}
              isCurrentParent={rootOption.id === movingHabitParentId}
              currentLabel={t('habits.moveParent.currentParent')}
              tokens={tokens}
              styles={styles}
              onSelect={onSelectOption}
            />
          ) : null}

          <View style={styles.moveOptionsContent}>
            {treeRows.map((option) => (
              <MoveTargetRow
                key={option.id}
                option={option}
                selected={option.id === selectedMoveParentId}
                isCurrentParent={option.id === movingHabitParentId}
                currentLabel={t('habits.moveParent.currentParent')}
                tokens={tokens}
                styles={styles}
                onSelect={onSelectOption}
              />
            ))}
          </View>
        </RadioGroup>

        {isSearchEmpty ? (
          <Text style={styles.moveDialogEmpty}>
            {t('habits.moveParent.noSearchResults')}
          </Text>
        ) : null}
      </View>
    </Sheet>) : null
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    sheetBody: {
      paddingTop: 4,
    },
    moveDialogDescription: {
      fontFamily: 'Geist_400Regular',
      fontSize: 15,
      lineHeight: 22,
      color: tokens.fg2,
      marginBottom: 16,
    },
    searchWrap: {
      position: 'relative',
      justifyContent: 'center',
      marginBottom: 12,
    },
    eyebrow: {
      fontFamily: 'GeistMono_500Medium',
      fontSize: 12,
      letterSpacing: 0.96,
      textTransform: 'uppercase',
      color: tokens.fg3,
      marginTop: 4,
      marginBottom: 8,
    },
    moveOptionsContent: {
      gap: 4,
      paddingTop: 4,
      paddingBottom: 8,
    },
    wellEmoji: {
      fontSize: 16,
      lineHeight: 20,
    },
    moveDialogEmpty: {
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      color: tokens.fg3,
      textAlign: 'center',
      paddingVertical: 16,
    },
    actions: {
      flexDirection: 'row',
      gap: 12,
    },
  })
}
