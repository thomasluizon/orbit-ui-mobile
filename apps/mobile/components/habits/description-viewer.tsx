import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { DescriptionCopyButton } from "./description-copy-button";
import { Sheet } from '@/components/ui/sheet';
import { Markdown } from "@/components/ui/markdown";
import { createTokensV2 } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";

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
          style={[
            styles.card,
            { backgroundColor: tokens.bgCard, borderColor: tokens.hairline },
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
    borderWidth: 1,
      paddingVertical: 16,
      paddingHorizontal: 16,
  },
});
