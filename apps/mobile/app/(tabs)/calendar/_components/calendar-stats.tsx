import { StyleSheet, View } from "react-native";
import { StatTile } from "@/components/ui/stat-tile";

export interface CalendarStat {
  key: string;
  emoji: string;
  value: string | number;
  label: string;
}

interface CalendarStatsProps {
  stats: readonly CalendarStat[];
  state?: 'default' | 'loading' | 'empty';
  loadingLabel?: string;
  emptyLabel?: string;
}

/** At-a-glance, data-driven month stat section: each entry renders as a kit StatTile
 *  in a wrapping 3-up grid so new stats drop in as array entries without a layout rewrite. */
export function CalendarStats({
  stats,
  state = 'default',
  loadingLabel,
  emptyLabel,
}: Readonly<CalendarStatsProps>) {
  return (
    <View style={styles.row}>
      {stats.map((stat) => (
        <View key={stat.key} style={styles.cell}>
          {state === 'loading' ? (
            <StatTile state="loading" loadingLabel={loadingLabel ?? ''} label={stat.label} />
          ) : state === 'empty' ? (
            <StatTile state="empty" emptyLabel={emptyLabel ?? ''} label={stat.label} />
          ) : (
            <StatTile value={stat.value} label={stat.label} />
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 20,
  },
  cell: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 96,
  },
});
