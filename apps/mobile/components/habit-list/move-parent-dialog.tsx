import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { createTokensV2, shadowsV2, tintFromPrimary } from '@/lib/theme'
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

/** Move-parent picker dialog (mobile). Presentational — the parent HabitList
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
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.dialogBackdrop}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        onPress={onClose}
      >
        <View
          style={styles.moveDialog}
          onStartShouldSetResponder={() => true}
        >
          <Text style={styles.moveDialogTitle}>
            {t('habits.moveParent.title')}
          </Text>
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
                  <TouchableOpacity
                    key={option.id ?? '__root__'}
                    style={[
                      styles.moveOption,
                      isSelectedOption && styles.moveOptionSelected,
                      option.disabled && styles.moveOptionDisabled,
                      option.id !== null
                        ? { paddingLeft: 14 + option.depth * 18 }
                        : null,
                    ]}
                    disabled={option.disabled}
                    onPress={() => onSelectOption(option.id)}
                    activeOpacity={0.75}
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
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          ) : (
            <Text style={styles.moveDialogEmpty}>
              {t('habits.moveParent.noOptions')}
            </Text>
          )}

          <View style={styles.moveDialogActions}>
            <TouchableOpacity
              style={styles.moveDialogCancel}
              disabled={isPending}
              onPress={onClose}
              activeOpacity={0.75}
              accessibilityRole="button"
            >
              <Text style={styles.moveDialogCancelText}>
                {t('common.cancel')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.moveDialogConfirm,
                !canSubmit && styles.moveDialogConfirmDisabled,
              ]}
              disabled={!canSubmit}
              onPress={onConfirm}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              {isPending ? (
                <ActivityIndicator size="small" color={tokens.fgOnPrimary} />
              ) : (
                <Text style={styles.moveDialogConfirmText}>
                  {t('habits.moveParent.confirm')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  )
}

type AppTokens = ReturnType<typeof createTokensV2>

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    dialogBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    moveDialog: {
      width: '100%',
      maxWidth: 380,
      maxHeight: '75%',
      backgroundColor: tokens.bgSheet,
      borderWidth: 1,
      borderColor: tokens.hairline,
      borderRadius: 24,
      paddingTop: 24,
      paddingHorizontal: 22,
      paddingBottom: 18,
      ...shadowsV2.shadow3,
    },
    moveDialogTitle: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 20,
      color: tokens.fg1,
    },
    moveDialogDescription: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      lineHeight: 22,
      color: tokens.fg2,
      marginTop: 8,
      marginBottom: 16,
    },
    moveOptionsList: {
      flexGrow: 0,
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
    moveDialogActions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 16,
    },
    moveDialogCancel: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: tokens.hairlineStrong,
      paddingVertical: 12,
      minHeight: 46,
    },
    moveDialogCancelText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 15,
      color: tokens.fg1,
    },
    moveDialogConfirm: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
      backgroundColor: tokens.primary,
      paddingVertical: 12,
      minHeight: 46,
    },
    moveDialogConfirmDisabled: {
      opacity: 0.5,
    },
    moveDialogConfirmText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 15,
      color: tokens.fgOnPrimary,
    },
  })
}
