import React from 'react'

export interface MockDateTimePickerOpenParams {
  value: Date
  mode?: 'time' | 'date' | 'datetime' | 'countdown'
  display?: string
  is24Hour?: boolean
  onChange?: (event: { type: 'set' | 'dismissed' }, selectedDate?: Date) => void
}

export const dateTimePickerOpenCalls: MockDateTimePickerOpenParams[] = []

export function resetDateTimePickerMock() {
  dateTimePickerOpenCalls.length = 0
}

export const DateTimePickerAndroid = {
  open: (params: MockDateTimePickerOpenParams) => {
    dateTimePickerOpenCalls.push(params)
  },
}

export type DateTimePickerEvent = {
  type: 'set' | 'dismissed'
}

export default function DateTimePicker(props: Record<string, unknown>) {
  return React.createElement('DateTimePicker', props)
}
