import { useCallback, useMemo } from "react";
import { Text, StyleSheet } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { withDrawerContentInset } from "@/components/ui/drawer-content-inset";
import { useAppTheme } from "@/lib/use-app-theme";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DescriptionViewerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DescriptionViewer({
  open,
  onClose,
  title,
  description,
}: Readonly<DescriptionViewerProps>) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

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

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ReturnType<typeof useAppTheme>["colors"]) {
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
      color: colors.textSecondary,
    },
  });
}
