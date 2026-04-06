import React from 'react'

export function useSafeAreaInsets() {
  return {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  }
}

export function SafeAreaProvider({ children }: Readonly<{ children?: React.ReactNode }>) {
  return React.createElement(React.Fragment, null, children)
}

export function SafeAreaView({ children }: Readonly<{ children?: React.ReactNode }>) {
  return React.createElement(React.Fragment, null, children)
}
