import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { PillButton } from '@/components/ui/pill-button'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export interface MoveParentOption {
  id: string | null
  label: string
  depth: number
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
}: MoveParentDialogProps) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)

  return (
    <BottomSheetModal
      open={visible}
      onClose={onClose}
      title={t('habits.moveParent.title')}
      canDismiss={!isPending}
    >
      <View style={styles.sheetBody}>
        {movingHabitTitle ? (
          <Text style={styles.moveDialogDescription}>
            {t('habits.moveParent.description', {
              name: movingHabitTitle,
            })}
          </Text>
        ) : null}

        {options.length > 0 ? (
          <ScrollView
            style={styles.moveOptionsList}
            contentContainerStyle={styles.moveOptionsContent}
            showsVerticalScrollIndicator={false}
          >
            {options.map((option) => {
              const isSelectedOption = option.id === selectedMoveParentId
              return (
                <Pressable
                  key={option.id ?? '__root__'}
                  style={({ pressed }) => [
                    styles.moveOption,
                    isSelectedOption && styles.moveOptionSelected,
                    option.disabled && styles.moveOptionDisabled,
                    pressed && !option.disabled
                      ? styles.moveOptionPressed
                      : null,
                    option.id !== null
                      ? { paddingLeft: 14 + option.depth * 18 }
                      : null,
                  ]}
                  disabled={option.disabled}
                  onPress={() => onSelectOption(option.id)}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: isSelectedOption,
                    disabled: option.disabled,
                  }}
                >
                  <View style={styles.moveOptionHeader}>
                    <Text
                      style={styles.moveOptionLabel}
                      numberOfLines={1}
                    >
                      {option.label}
                    </Text>
                    {option.id === movingHabitParentId ? (
                      <Text style={styles.moveOptionCurrent}>
                        {t('habits.moveParent.currentParent')}
                      </Text>
                    ) : null}
                  </View>
                  {option.reason ? (
                    <Text style={styles.moveOptionReason}>
                      {option.reason}
                    </Text>
                  ) : null}
                </Pressable>
              )
            })}
          </ScrollView>
        ) : (
          <Text style={styles.moveDialogEmpty}>
            {t('habits.moveParent.noOptions')}
          </Text>
        )}

        <View style={styles.footer}>
          <PillButton
            variant="ghost"
            disabled={isPending}
            onPress={onClose}
            style={styles.footerPill}
          >
            {t('common.cancel')}
          </PillButton>
          <PillButton
            disabled={!canSubmit}
            busy={isPending}
            onPress={onConfirm}
            style={styles.footerPill}
          >
            {isPending
              ? t('habits.moveParent.moving')
              : t('habits.moveParent.confirm')}
          </PillButton>
        </View>
      </View>
    </BottomSheetModal>
  )
}

type AppTokens = ReturnType<typeof createTokensV2>

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    sheetBody: {
      flex: 1,
      paddingHorizontal: 22,
      paddingTop: 4,
      paddingBottom: 24,
    },
    moveDialogDescription: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      lineHeight: 22,
      color: tokens.fg2,
      marginBottom: 16,
    },
    moveOptionsList: {
      flex: 1,
    },
    moveOptionsContent: {
      gap: 10,
      paddingBottom: 8,
    },
    moveOption: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgField,
      paddingHorizontal: 14,
      paddingVertical: 12,
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
      backgroundColor: tokens.bgElevPressed,
    },
    moveOptionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    moveOptionLabel: {
      flex: 1,
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
      color: tokens.fg1,
    },
    moveOptionCurrent: {
      fontFamily: 'Rubik_600SemiBold',
      fontSize: 10.5,
      textTransform: 'uppercase',
      letterSpacing: 0.63,
      color: tokens.fg3,
    },
    moveOptionReason: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 11,
      lineHeight: 15,
      color: tokens.fg3,
      marginTop: 5,
    },
    moveDialogEmpty: {
      fontFamily: 'Rubik_400Regular',
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
