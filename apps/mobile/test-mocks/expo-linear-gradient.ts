import React from 'react'

export function LinearGradient({
  children,
  ...props
}: Readonly<{
  children?: React.ReactNode
  [key: string]: unknown
}>) {
  return React.createElement('LinearGradient', props, children)
}

export default LinearGradient
