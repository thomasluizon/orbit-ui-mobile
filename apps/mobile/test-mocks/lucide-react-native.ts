import React from 'react'

type IconProps = Readonly<Record<string, unknown>>

function createIcon(name: string) {
  return function Icon(props: IconProps) {
    return React.createElement(name, props)
  }
}

export const CalendarDays = createIcon('CalendarDays')
export const Home = createIcon('Home')
export const MessageCircle = createIcon('MessageCircle')
export const Plus = createIcon('Plus')
export const User = createIcon('User')
