import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Home, Search } from '@/components/ui/icons'
import { filterMoveTargetsBySearch } from '@orbit/shared/utils'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { PillButton } from '@/components/ui/pill-button'
import { RadioRow } from '@/components/ui/radio-row'
import { createTokensV2, tintFromPrimary, type AppTokensV2 } from '@/lib/theme'
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
        ? <Home size={18} strokeWidth={1.8} color={tokens.fg2} />
        : <Text style={styles.wellEmoji}>{option.emoji ?? '·'}</Text>}
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
              trailing={<Search size={18} strokeWidth={1.8} color={tokens.fg3} />}
            />
          </View>
        ) : null}

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

        {treeRows.length > 0 ? (
          <Text style={styles.eyebrow}>{t('habits.moveParent.destinations')}</Text>
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
          {isSearchEmpty ? (
            <Text style={styles.moveDialogEmpty}>
              {t('habits.moveParent.noSearchResults')}
            </Text>
          ) : null}
        </View>

        <View style={styles.footer}>
          <PillButton
            variant="ghost"
            disabled={isPending}
            onClick={() => closeSheet()}

          >
            {t('common.cancel')}
          </PillButton>
          <PillButton
            disabled={!canSubmit}
            loading={isPending}
            onClick={onConfirm}

          >
            {isPending ? t('habits.moveParent.moving') : t('habits.moveParent.confirm')}
          </PillButton>
        </View>
      </View>
    </Sheet>) : null
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    sheetBody: {
      flex: 1,
      paddingHorizontal: 22,
      paddingTop: 4,
      paddingBottom: 24,
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
    searchIcon: {
      position: 'absolute',
      right: 16,
    },
    eyebrow: {
      fontFamily: 'GeistMono_500Medium',
      fontSize: 12,
      letterSpacing: 0.96,
      textTransform: 'uppercase',
      color: tokens.fg3,
      marginTop: 4,
      marginBottom: 2,
    },
    moveOptionsList: {
      flex: 1,
    },
    moveOptionsContent: {
      gap: 6,
      paddingTop: 6,
      paddingBottom: 8,
    },
    moveOption: {
      borderRadius: 14,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    moveOptionDefault: {
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgField,
    },
    moveOptionRoot: {
      borderStyle: 'dashed',
      borderColor: tokens.hairlineStrong,
      backgroundColor: 'transparent',
    },
    moveOptionSelected: {
      borderWidth: 1.5,
      borderColor: tokens.primary,
      backgroundColor: tintFromPrimary(tokens, 0.1),
    },
    moveOptionDisabled: {
      opacity: 0.5,
    },
    moveOptionPressed: {
      backgroundColor: tokens.bgHover,
    },
    moveOptionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    rail: {
      width: 20,
      alignSelf: 'stretch',
    },
    well: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    wellFilled: {
      backgroundColor: tokens.bgWell,
    },
    wellRoot: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    wellEmoji: {
      fontSize: 16,
      lineHeight: 20,
    },
    moveOptionLabel: {
      flex: 1,
      fontFamily: 'Geist_500Medium',
      fontSize: 14,
      color: tokens.fg1,
    },
    moveOptionCount: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 12,
      fontVariant: ['tabular-nums'],
      color: tokens.fg3,
    },
    moveOptionCurrent: {
      fontFamily: 'GeistMono_500Medium',
      fontSize: 10.5,
      textTransform: 'uppercase',
      letterSpacing: 0.63,
      color: tokens.fg3,
    },
    moveOptionReason: {
      fontFamily: 'Geist_400Regular',
      fontSize: 11,
      lineHeight: 15,
      color: tokens.fg3,
      marginTop: 4,
    },
    moveDialogEmpty: {
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      color: tokens.fg3,
      textAlign: 'center',
      paddingVertical: 16,
    },
    footer: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 16,
    },
    footerPill: {
      flex: 1,
    },
  })
}
