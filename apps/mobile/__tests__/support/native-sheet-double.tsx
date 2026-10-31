import React from 'react'
import type { TrueSheetProps, DidDismissEvent, DismissAttemptEvent } from '@lodev09/react-native-true-sheet'

export const nativeSheetTestControls = { deferMount: false }

export class TrueSheet extends React.Component<TrueSheetProps> {
  private pendingPresent: (() => void) | null = null

  get isMountPending() { return this.pendingPresent !== null }

  present = () => nativeSheetTestControls.deferMount
    ? new Promise<void>(resolve => { this.pendingPresent = resolve })
    : Promise.resolve()

  completeMount() {
    this.pendingPresent?.()
    this.pendingPresent = null
  }

  dismiss = () => {
    // WHY: Cancelling a lazy mount resolves both promises without a dismissal event. https://github.com/lodev09/react-native-true-sheet/blob/v4.0.1/src/TrueSheet.tsx#L524-L558
    if (this.pendingPresent) {
      this.completeMount()
      return Promise.resolve()
    }
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
