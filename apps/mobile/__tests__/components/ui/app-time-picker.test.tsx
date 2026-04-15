import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatLocaleTime } from '@orbit/shared/utils'
import {
  dateTimePickerOpenCalls,
  resetDateTimePickerMock,
} from '@/test-mocks/react-native-datetimepicker'

const TestRenderer = require('react-test-renderer')

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
    i18n: { language: 'pt-BR' },
  }),
}))

vi.mock('@/hooks/use-device-locale', () => ({
  useDeviceLocale: () => 'pt-BR',
}))

import { AppTimePicker } from '@/components/ui/app-time-picker'

describe('AppTimePicker', () => {
  beforeEach(() => {
    resetDateTimePickerMock()
  })

  it('uses the active locale for display text and Android 24-hour picker mode', async () => {
    const onChange = vi.fn()
    let tree: any

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <AppTimePicker value="14:30" onChange={onChange} placeholder="HH:MM" />,
      )
    })

    const trigger = tree.root.findByType('TouchableOpacity')
    const label = tree.root.findByType('Text')

    expect(label.props.children).toBe(formatLocaleTime('14:30', 'pt-BR'))

    await TestRenderer.act(async () => {
      trigger.props.onPress()
    })

    expect(dateTimePickerOpenCalls).toHaveLength(1)
    expect(dateTimePickerOpenCalls[0]?.is24Hour).toBe(true)
  })
})
