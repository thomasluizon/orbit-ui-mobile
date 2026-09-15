'use client'

import { CheckCircle, Clock, List, RotateCcw } from '@/components/ui/icons'
import { WIDGET_FEATURES, WIDGET_STEP_KEYS } from '@orbit/shared/utils/advanced-settings'
import { Sheet } from '@/components/ui/sheet'

type TranslationFn = (key: string, params?: Record<string, string | number | Date>) => string

export function WidgetInfoOverlay({
  open,
  onOpenChange,
  t,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; t: TranslationFn }>) {
  if (!open) return null

  return (
    <Sheet open onClose={() => onOpenChange(false)} title={t('profile.widgetTitle')}>
      <div className="flex flex-col gap-4" style={{ paddingBottom: 8 }}>
        <div>
          <h3 className="mb-2 font-sans text-[15px] font-medium text-[var(--fg-1)]">
            {t('profile.widgetHow.title')}
          </h3>
          <ol className="flex flex-col gap-2 font-sans text-sm leading-[1.55] text-[var(--fg-2)]">
            {WIDGET_STEP_KEYS.map((stepKey, index) => (
              <li key={stepKey} className="flex gap-2">
                <span className="shrink-0 font-mono font-medium tabular-nums text-[var(--fg-2)]">{index + 1}.</span>
                <span>{t(stepKey)}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h3 className="mb-2 font-sans text-[15px] font-medium text-[var(--fg-1)]">
            {t('profile.widgetHow.featuresTitle')}
          </h3>
          <ul className="flex flex-col gap-2 font-sans text-sm leading-[1.55] text-[var(--fg-2)]">
            {WIDGET_FEATURES.map((feature) => {
              const iconProps = { size: 16, strokeWidth: 1.8, className: 'mt-0.5 shrink-0 text-[var(--primary)]' }
              const icons = {
                checkCircle: <CheckCircle {...iconProps} />,
                clock: <Clock {...iconProps} />,
                list: <List {...iconProps} />,
                rotateCcw: <RotateCcw {...iconProps} />,
              }
              return (
                <li key={feature.textKey} className="flex items-start gap-2">
                  {icons[feature.iconKey]}
                  <span>{t(feature.textKey)}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </Sheet>
  )
}
