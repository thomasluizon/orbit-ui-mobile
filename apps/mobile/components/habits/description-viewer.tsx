import { SPACING } from "@orbit/shared/theme";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { DescriptionCopyButton } from "./description-copy-button";
import { Sheet } from '@/components/ui/sheet';
import { Markdown } from "@/components/ui/markdown";
import { createTokensV2 } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";
import { insetHairlineRing } from "@/components/ui/inset-hairline-ring";

interface DescriptionViewerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
}

export function DescriptionViewer({
  open,
  onClose,
  title,
  description,
}: Readonly<DescriptionViewerProps>) {
  const { currentScheme, currentTheme } = useAppTheme();
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );
  return (
    open ? (<Sheet
      open
      onClose={onClose}
      title={title}
    >
      <View>
        <DescriptionCopyButton key={description} description={description} />
        <View
          testID="description-viewer-card"
          style={[
            styles.card,
            { backgroundColor: tokens.bgCard, outlineColor: tokens.hairline },
          ]}
        >
          <Markdown>{description}</Markdown>
        </View>
      </View>
    </Sheet>) : null
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: 0,
    borderRadius: 18,
    ...insetHairlineRing,
      paddingVertical: SPACING.s16,
      paddingHorizontal: SPACING.s16,
  },
});
