import React from 'react'

type IconProps = Readonly<Record<string, unknown>>

function createIcon(name: string) {
  return function Icon(props: IconProps) {
    return React.createElement(name, props)
  }
}

export const ArrowRight = createIcon('ArrowRight')
export const Bell = createIcon('Bell')
export const CalendarCheck = createIcon('CalendarCheck')
export const Check = createIcon('Check')
export const CheckCircle2 = createIcon('CheckCircle2')
export const CalendarDays = createIcon('CalendarDays')
export const ChevronDown = createIcon('ChevronDown')
export const ChevronLeft = createIcon('ChevronLeft')
export const ChevronRight = createIcon('ChevronRight')
export const ChevronsDownUp = createIcon('ChevronsDownUp')
export const ChevronsUpDown = createIcon('ChevronsUpDown')
export const ClipboardCheck = createIcon('ClipboardCheck')
export const ClipboardList = createIcon('ClipboardList')
export const Copy = createIcon('Copy')
export const Eye = createIcon('Eye')
export const FastForward = createIcon('FastForward')
export const Flame = createIcon('Flame')
export const Home = createIcon('Home')
export const Infinity = createIcon('Infinity')
export const MessageCircle = createIcon('MessageCircle')
export const MinusCircle = createIcon('MinusCircle')
export const MoreVertical = createIcon('MoreVertical')
export const PenSquare = createIcon('PenSquare')
export const Plus = createIcon('Plus')
export const PlusCircle = createIcon('PlusCircle')
export const RefreshCw = createIcon('RefreshCw')
export const Repeat = createIcon('Repeat')
export const Search = createIcon('Search')
export const ShieldAlert = createIcon('ShieldAlert')
export const Shuffle = createIcon('Shuffle')
export const Trash2 = createIcon('Trash2')
export const User = createIcon('User')
export const X = createIcon('X')
