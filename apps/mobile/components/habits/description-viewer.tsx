import { useCallback } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { withDrawerContentInset } from "@/components/ui/drawer-content-inset";
import { Markdown } from "@/components/ui/markdown";

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
        contentContainerStyle={withDrawerContentInset(styles.scrollContent)}
        showsVerticalScrollIndicator={false}
      >
        <Markdown tone="muted">{description}</Markdown>
      </ScrollView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
});
