import { useCallback, useMemo } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { radius } from "@/lib/theme";
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
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.descriptionText}>{description}</Text>
      </ScrollView>
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
      paddingBottom: 32,
    },
    descriptionText: {
      fontSize: 14,
      lineHeight: 22,
      color: colors.textSecondary,
    },
  });
}
