import { ScrollView, StyleSheet, View } from 'react-native'
import { Chip } from './chip'

export interface SectionHeadTab<T extends string = string> {
  id: T
  label: string
  /** When true the tab is rendered but routes to upgrade on press. */
  locked?: boolean
}

interface SectionHeadTabsProps<T extends string = string> {
  tabs: readonly SectionHeadTab<T>[]
  active: T
  onChange: (id: T) => void
}

/**
 * v8 horizontal chip strip used as a section sub-tab bar (e.g. Today / All
 * / General / Goals on the Today screen). Hugs the AppBar from below with
 * 20px gutters and gentle 12px top padding.
 */
export function SectionHeadTabs<T extends string = string>({
  tabs,
  active,
  onChange,
}: Readonly<SectionHeadTabsProps<T>>) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {tabs.map((tab) => (
          <Chip
            key={tab.id}
            active={tab.id === active}
            onPress={() => onChange(tab.id)}
            accessibilityLabel={tab.label}
          >
            {tab.label}
          </Chip>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 12,
    paddingBottom: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
})
