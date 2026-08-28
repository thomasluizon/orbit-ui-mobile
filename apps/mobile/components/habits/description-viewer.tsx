import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import { Check, Copy } from "@/components/ui/icons";
import { useTranslation } from "react-i18next";
import { Sheet } from '@/components/ui/sheet';
import { withDrawerContentInset } from "@/components/ui/drawer-content-inset";
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
  const { t } = useTranslation();
  const { currentScheme, currentTheme } = useAppTheme();
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  );
  const [copied, setCopied] = useState(false);
  const handleClose = useCallback(() => {
    setCopied(false);
    onClose();
  }, [onClose]);

  const copyDescription = useCallback(() => {
    Clipboard.setString(description);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [description]);

  return (
    open ? (<Sheet
      open
      onClose={handleClose}
      title={title}
    >
      <View style={withDrawerContentInset(styles.scrollContent)}>
        <View style={styles.copyRow}>
          <Pressable
            onPress={copyDescription}
            accessibilityRole="button"
            accessibilityLabel={t("habits.detail.copyDescription")}
            hitSlop={6}
            style={({ pressed }) => [
              styles.copyButton,
              {
                backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev,
                borderColor: tokens.hairline,
              },
              pressed ? styles.copyButtonPressed : null,
            ]}
          >
            {copied ? (
              <Check size={18} color={tokens.statusDone} strokeWidth={1.8} />
            ) : (
              <Copy size={18} color={tokens.fg2} strokeWidth={1.8} />
            )}
          </Pressable>
        </View>
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
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  copyRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingBottom: 10,
  },
  copyButton: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  copyButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  card: {
    minWidth: 0,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
});
