import React from 'react'
import type { TrueSheetProps, DidDismissEvent, DismissAttemptEvent } from '@lodev09/react-native-true-sheet'

export class TrueSheet extends React.Component<TrueSheetProps> {
  present = () => Promise.resolve()
  dismiss = () => {
    this.props.onDidDismiss?.({ nativeEvent: null } as DidDismissEvent)
    return Promise.resolve()
  }

  attempt(path: 'hardware back' | 'back gesture' | 'swipe down' | 'backdrop') {
    if (this.props.dismissible !== false) {
      void this.dismiss()
      return
    }
    if (path === 'backdrop') return
    this.props.onDismissAttempt?.({ nativeEvent: null } as DismissAttemptEvent)
    if (path === 'hardware back' || path === 'back gesture') this.props.onBackPress?.()
  }

  render() {
    return <>{this.props.header}{this.props.children}{this.props.footer}</>
  }
}
