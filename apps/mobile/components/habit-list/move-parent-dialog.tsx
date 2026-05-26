import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { createTokensV2 } from '@/lib/theme'
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
                        ? { paddingLeft: 12 + option.depth * 18 }
                        : null,
                    ]}
                    disabled={option.disabled}
                    onPress={() => onSelectOption(option.id)}
                    activeOpacity={0.75}
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
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    moveDialog: {
      width: '100%',
      maxWidth: 380,
      maxHeight: '75%',
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
      borderRadius: 20,
      padding: 20,
    },
    moveDialogTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: tokens.fg1,
    },
    moveDialogDescription: {
      fontSize: 14,
      lineHeight: 20,
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
      backgroundColor: tokens.bgElev,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    moveOptionSelected: {
      borderColor: tokens.primary,
      backgroundColor: tokens.bgSunk,
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
      fontSize: 14,
      fontWeight: '600',
      color: tokens.fg1,
    },
    moveOptionCurrent: {
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      color: tokens.fg3,
    },
    moveOptionReason: {
      fontSize: 11,
      color: tokens.fg3,
      marginTop: 6,
    },
    moveDialogEmpty: {
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
      borderRadius: 14,
      borderWidth: 1,
      borderColor: tokens.hairline,
      paddingVertical: 12,
    },
    moveDialogCancelText: {
      fontSize: 14,
      fontWeight: '600',
      color: tokens.fg2,
    },
    moveDialogConfirm: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      backgroundColor: tokens.primary,
      paddingVertical: 12,
      minHeight: 46,
    },
    moveDialogConfirmDisabled: {
      opacity: 0.5,
    },
    moveDialogConfirmText: {
      fontSize: 14,
      fontWeight: '700',
      color: tokens.fgOnPrimary,
    },
  })
}
