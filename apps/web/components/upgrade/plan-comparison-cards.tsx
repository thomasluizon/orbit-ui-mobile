import type { CSSProperties } from 'react'
import { Fragment } from 'react'
import { BarChart3, Check, Flame, MessageSquare, Palette, ShieldCheck } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { UPGRADE_FEATURE_CATEGORIES } from '@orbit/shared/utils/upgrade'
import type {
  UpgradeFeatureMatrixRow,
  UpgradeIconKey,
} from '@orbit/shared/utils/upgrade'
import { Badge } from '@/components/ui/badge'

type Translate = ReturnType<typeof useTranslations>

const iconByKey: Record<UpgradeIconKey, typeof Flame> = {
  flame: Flame,
  messageSquare: MessageSquare,
  palette: Palette,
  shieldCheck: ShieldCheck,
  barChart3: BarChart3,
}

const srOnly: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

const headCell: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 2,
  background: 'var(--bg)',
  padding: '12px 8px',
  borderBottom: '1px solid var(--hairline)',
  fontFamily: 'var(--font-sans)',
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}

const bodyCell: CSSProperties = {
  padding: '12px 8px',
  borderBottom: '1px solid var(--hairline)',
  verticalAlign: 'middle',
}

function IncludedCheck({ label }: Readonly<{ label: string }>) {
  return (
    <span className="inline-flex items-center justify-center">
      <Check size={15} strokeWidth={2.4} style={{ color: 'var(--primary)' }} aria-hidden="true" />
      <span style={srOnly}>{label}</span>
    </span>
  )
}

function NotIncluded({ t }: Readonly<{ t: Translate }>) {
  return (
    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.3, color: 'var(--fg-4)' }}>
      {t('upgrade.matrix.notIncluded')}
    </span>
  )
}

function ValueText({ text, emphasize }: Readonly<{ text: string; emphasize?: boolean }>) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
        fontWeight: emphasize ? 500 : 400,
        color: emphasize ? 'var(--fg-1)' : 'var(--fg-2)',
      }}
    >
      {text}
    </span>
  )
}

function FreeCell({ row, t }: Readonly<{ row: UpgradeFeatureMatrixRow; t: Translate }>) {
  if (row.type === 'text') return <ValueText text={t(`upgrade.features.${row.key}.free`)} />
  return row.free ? <IncludedCheck label={t('upgrade.matrix.included')} /> : <NotIncluded t={t} />
}

function ProCell({ row, t }: Readonly<{ row: UpgradeFeatureMatrixRow; t: Translate }>) {
  if (row.type === 'text') return <ValueText text={t(`upgrade.features.${row.key}.pro`)} emphasize />
  if (row.pro === 'yearly') {
    return (
      <span className="inline-flex items-center justify-center gap-1">
        <Check size={15} strokeWidth={2.4} style={{ color: 'var(--primary)' }} aria-hidden="true" />
        <Badge tone="soft">{t('upgrade.matrix.yearlyTag')}</Badge>
      </span>
    )
  }
  return row.pro ? <IncludedCheck label={t('upgrade.matrix.included')} /> : <NotIncluded t={t} />
}

export function PlanComparisonCards({ t }: Readonly<{ t: Translate }>) {
  return (
    <section style={{ marginTop: 28 }}>
      <h2 className="t-h2" style={{ marginBottom: 8 }}>
        {t('upgrade.matrix.title')}
      </h2>
      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead>
          <tr>
            <th style={{ ...headCell, textAlign: 'left', color: 'var(--fg-4)' }} />
            <th style={{ ...headCell, width: 92, textAlign: 'center', color: 'var(--fg-2)' }} scope="col">
              {t('upgrade.free')}
            </th>
            <th style={{ ...headCell, width: 104, textAlign: 'center', color: 'var(--primary-soft)' }} scope="col">
              {t('common.proBadge')}
            </th>
          </tr>
        </thead>
        <tbody>
          {UPGRADE_FEATURE_CATEGORIES.map((category) => {
            const Icon = iconByKey[category.iconKey]
            return (
              <Fragment key={category.category}>
                <tr>
                  <th
                    colSpan={3}
                    scope="colgroup"
                    style={{ padding: '20px 8px 8px', textAlign: 'left' }}
                  >
                    <span className="flex items-center" style={{ gap: 8 }}>
                      <Icon size={14} strokeWidth={1.8} style={{ color: 'var(--fg-3)' }} aria-hidden="true" />
                      <span
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: 12,
                          fontWeight: 500,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          color: 'var(--fg-3)',
                        }}
                      >
                        {t(`upgrade.categories.${category.category}`)}
                      </span>
                    </span>
                  </th>
                </tr>
                {category.features.map((row) => (
                  <tr key={row.key}>
                    <th
                      scope="row"
                      style={{
                        ...bodyCell,
                        textAlign: 'left',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 14,
                        fontWeight: 400,
                        color: 'var(--fg-1)',
                      }}
                    >
                      {t(`upgrade.features.${row.key}.label`)}
                    </th>
                    <td style={{ ...bodyCell, textAlign: 'center' }}>
                      <FreeCell row={row} t={t} />
                    </td>
                    <td style={{ ...bodyCell, textAlign: 'center' }}>
                      <ProCell row={row} t={t} />
                    </td>
                  </tr>
                ))}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
