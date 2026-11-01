export enum ErrorCode {
  UserCancelled = 'user-cancelled',
  AlreadyOwned = 'already-owned',
  DeferredPayment = 'deferred-payment',
  Pending = 'pending',
  FeatureNotSupported = 'feature-not-supported',
  NetworkError = 'network-error',
  ServiceError = 'service-error',
  ServiceDisconnected = 'service-disconnected',
  NotPrepared = 'not-prepared',
}

export async function finishTransaction(): Promise<void> {}

export function getAvailablePurchases(): Promise<unknown[]> {
  return Promise.resolve([])
}

const reconnect = () => Promise.resolve(false)
const fetchProducts = () => Promise.resolve(undefined)

export function useIAP() {
  return {
    connected: false,
    subscriptions: [],
    fetchProducts,
    reconnect,
    requestPurchase: () => Promise.resolve(null),
  }
}
