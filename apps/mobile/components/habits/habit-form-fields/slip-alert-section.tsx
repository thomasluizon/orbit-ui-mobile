import { ListRow } from '@/components/ui/list-row'
import { useMemo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Badge } from '@/components/ui/badge'
import { type AppTokens, createSectionStyles } from "./styles";

interface SlipAlertSectionProps {
  inline?: boolean
  tokens: AppTokens;
  hasProAccess: boolean;
  slipAlertEnabled: boolean;
  onToggle: () => void;
  onUpgrade: () => void;
}

export function SlipAlertSection({
  tokens,
  inline = false,
  hasProAccess,
  slipAlertEnabled,
  onToggle,
  onUpgrade,
}: Readonly<SlipAlertSectionProps>) {
  const { t } = useTranslation();
  const sectionStyles = useMemo(() => createSectionStyles(tokens), [tokens]);

  return (
    <View style={inline ? { gap: 12 } : sectionStyles.container}>
      {/* eslint-disable-next-line local/max-button-words -- Orbit Habit Create draws the slip-alert boundary label. */}
      <ListRow placement={inline ? "column" : undefined} icon="shield-alert" title={t('habits.form.slipAlert')} description={t('habits.form.slipAlertDescription')}
        toggle={hasProAccess ? { checked: slipAlertEnabled, onChange: onToggle } : undefined}
        trailing={!hasProAccess ? <Badge>{t('common.proBadge')}</Badge> : undefined} chevron={!hasProAccess}
        onClick={!hasProAccess ? onUpgrade : undefined} />
    </View>
  );
}
