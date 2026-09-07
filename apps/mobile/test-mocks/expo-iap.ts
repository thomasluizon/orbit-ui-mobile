export enum ErrorCode {
  UserCancelled = 'user-cancelled',
  AlreadyOwned = 'already-owned',
  DeferredPayment = 'deferred-payment',
  Pending = 'pending',
  FeatureNotSupported = 'feature-not-supported',
  NetworkError = 'network-error',
  ServiceError = 'service-error',
  ServiceDisconnected = 'service-disconnected',
}

export async function finishTransaction(): Promise<void> {}

export function getAvailablePurchases(): unknown[] {
  return []
}

export function useIAP() {
  return {
    connected: false,
    subscriptions: [],
    fetchProducts: () => undefined,
    requestPurchase: () => null,
  }
}
