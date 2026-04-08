export const TRIAL_EXPIRED_FEATURE_KEYS = [
  'trial.expired.unlimitedHabits',
  'trial.expired.aiChat',
  'trial.expired.allColors',
  'trial.expired.aiSummary',
  'trial.expired.subHabits',
  'trial.expired.retrospective',
] as const

export type UpgradeIconKey =
  | 'flame'
  | 'messageSquare'
  | 'palette'
  | 'shieldCheck'
  | 'barChart3'

export interface UpgradePlanFeature {
  key: string
  iconKey: UpgradeIconKey
}

export interface UpgradeFeatureMatrixRow {
  key: string
  iconKey: UpgradeIconKey
  type: 'boolean' | 'text'
  freeEnabled?: boolean
  proEnabled?: boolean
}

export interface UpgradeFeatureMatrixCategory {
  category: string
  features: UpgradeFeatureMatrixRow[]
}

export const UPGRADE_PRO_FEATURES: UpgradePlanFeature[] = [
  { key: 'unlimited', iconKey: 'flame' },
  { key: 'ai', iconKey: 'messageSquare' },
  { key: 'themes', iconKey: 'palette' },
  { key: 'adFree', iconKey: 'shieldCheck' },
]

export const UPGRADE_YEARLY_EXTRA_FEATURES: UpgradePlanFeature[] = [
  { key: 'retrospective', iconKey: 'barChart3' },
]

export const UPGRADE_FEATURE_CATEGORIES: UpgradeFeatureMatrixCategory[] = [
  {
    category: 'habits',
    features: [
      { key: 'habits', iconKey: 'flame', type: 'text' },
      {
        key: 'subHabits',
        iconKey: 'flame',
        type: 'boolean',
        freeEnabled: false,
        proEnabled: true,
      },
    ],
  },
  {
    category: 'ai',
    features: [
      { key: 'ai', iconKey: 'messageSquare', type: 'text' },
      {
        key: 'aiMemory',
        iconKey: 'messageSquare',
        type: 'boolean',
        freeEnabled: false,
        proEnabled: true,
      },
      {
        key: 'summary',
        iconKey: 'messageSquare',
        type: 'boolean',
        freeEnabled: false,
        proEnabled: true,
      },
      {
        key: 'slipAlerts',
        iconKey: 'shieldCheck',
        type: 'boolean',
        freeEnabled: false,
        proEnabled: true,
      },
    ],
  },
  {
    category: 'insights',
    features: [
      {
        key: 'retrospective',
        iconKey: 'barChart3',
        type: 'boolean',
        freeEnabled: false,
        proEnabled: true,
      },
      {
        key: 'achievements',
        iconKey: 'flame',
        type: 'boolean',
        freeEnabled: false,
        proEnabled: true,
      },
    ],
  },
  {
    category: 'personalization',
    features: [
      { key: 'colors', iconKey: 'palette', type: 'text' },
      {
        key: 'calendarImport',
        iconKey: 'flame',
        type: 'boolean',
        freeEnabled: false,
        proEnabled: true,
      },
      {
        key: 'adFree',
        iconKey: 'shieldCheck',
        type: 'boolean',
        freeEnabled: false,
        proEnabled: true,
      },
    ],
  },
]
