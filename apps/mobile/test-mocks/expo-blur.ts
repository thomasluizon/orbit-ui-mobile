import React from 'react'

export function BlurView({
  children,
  ...props
}: Readonly<{
  children?: React.ReactNode
  [key: string]: unknown
}>) {
  return React.createElement('BlurView', props, children)
}

export default BlurView
