import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Pencil } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useProfile } from '@/hooks/use-profile'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { EditHandleSheet } from './edit-handle-sheet'

/** Persistent "@handle" row on the Social screen with an edit affordance — the only post-opt-in surface for the handle. */
export function SocialIdentityBar() {
  const { t } = useTranslation()
  const { profile } = useProfile()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
  const [showEdit, setShowEdit] = useState(false)
  const handle = profile?.handle

  if (!handle) return null

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.textCol}>
          <Text style={styles.handle} numberOfLines={1}>
            @{handle}
          </Text>
          <Text style={styles.caption}>{t('social.identity.caption')}</Text>
        </View>
        <Pressable
          onPress={() => setShowEdit(true)}
          accessibilityRole="button"
          accessibilityLabel={t('social.identity.editAria')}
          style={({ pressed }) => [styles.editButton, pressed ? styles.editButtonPressed : null]}
        >
          <Pencil size={14} strokeWidth={1.8} color={tokens.fg1} />
          <Text style={styles.editText}>{t('social.identity.edit')}</Text>
        </Pressable>
      </View>

      <EditHandleSheet open={showEdit} onClose={() => setShowEdit(false)} />
    </View>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    wrap: { paddingHorizontal: 20, paddingBottom: 8 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingLeft: 16,
      paddingRight: 14,
      borderRadius: 16,
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    textCol: { flex: 1, minWidth: 0, gap: 2 },
    handle: { fontFamily: 'Rubik_600SemiBold', fontSize: 17, color: tokens.fg1 },
    caption: { fontFamily: 'Rubik_400Regular', fontSize: 13, color: tokens.fg3 },
    editButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgElev2,
    },
    editButtonPressed: { transform: [{ scale: 0.96 }] },
    editText: { fontFamily: 'Rubik_500Medium', fontSize: 13, color: tokens.fg1 },
  })
}
