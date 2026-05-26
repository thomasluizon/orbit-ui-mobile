import { useCallback, useMemo } from "react";
import { Text, StyleSheet } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { withDrawerContentInset } from "@/components/ui/drawer-content-inset";
import { createTokensV2 } from "@/lib/theme";
import { useAppTheme } from "@/lib/use-app-theme";

type AppTokens = ReturnType<typeof createTokensV2>;

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
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <BottomSheetModal
      open={open}
      onClose={handleClose}
      title={title}
      snapPoints={["70%", "90%"]}
    >
      <BottomSheetScrollView
        style={styles.scrollContainer}
        contentContainerStyle={withDrawerContentInset(styles.scrollContent)}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.descriptionText}>{description}</Text>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    scrollContainer: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 32,
    },
    descriptionText: {
      fontSize: 14,
      lineHeight: 22,
      color: tokens.fg2,
    },
  });
}
