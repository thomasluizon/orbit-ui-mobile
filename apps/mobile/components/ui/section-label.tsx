import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { TypeRoleName } from '@orbit/shared/theme'
import { createTokensV2 } from '@/lib/theme'
import { typeRoleStyle } from '@/lib/type-roles'
import { useAppTheme } from '@/lib/use-app-theme'

const levelRole = {
  page: 'h1',
  section: 'h2',
  sub: 'eyebrow',
} as const satisfies Record<string, TypeRoleName>

/** Visual weight of a section head on the DESIGN.md type-role scale. */
export type SectionLabelLevel = keyof typeof levelRole

interface SectionLabelProps {
  children: ReactNode
  /** Visual type role: `page` (h1), `section` (h2, default), `sub` (eyebrow). */
  level?: SectionLabelLevel
  /** Supporting line that recedes to fg-2 instead of being boxed off in its own panel. */
  description?: ReactNode
  /** Top padding in px (default 24). */
  top?: number
  /** Bottom padding in px (default 12). */
  bottom?: number
  /** Optional trailing slot rendered on the right side of the row. */
  trailing?: ReactNode
  /** Set false to drop the horizontal gutter inside an already-padded container. */
  inset?: boolean
}

/** Kit section head: the single hierarchy contract for "this is a section" across every
 *  surface. `level` picks the type role and `description` carries supporting copy on the
 *  fg recession scale, so no screen hand-rolls a heading style. */
export function SectionLabel({
  children,
  level = 'section',
  description,
  top = 24,
  bottom = 12,
  trailing,
  inset = true,
}: Readonly<SectionLabelProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View
      style={[
        styles.row,
        !inset && styles.flush,
        description ? styles.rowTop : null,
        { paddingTop: top, paddingBottom: bottom },
      ]}
    >
      <View style={styles.body}>
        <Text accessibilityRole="header" style={typeRoleStyle(levelRole[level], tokens)}>
          {children}
        </Text>
        {description ? (
          <Text style={[typeRoleStyle('secondary', tokens), styles.description]}>
            {description}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowTop: {
    alignItems: 'flex-start',
  },
  flush: {
    paddingHorizontal: 0,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  description: {
    marginTop: 4,
  },
  trailing: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
})
