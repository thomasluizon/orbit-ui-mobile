import type { PurchaseAndroid, PurchaseIOS } from 'expo-iap'

export function createPlayPurchase(overrides: Partial<PurchaseAndroid> = {}): PurchaseAndroid {
  return {
    id: 'play-transaction',
    productId: 'orbit_pro',
    purchaseToken: 'play-token',
    store: 'google',
    storeId: 'play',
    purchaseState: 'purchased',
    quantity: 1,
    transactionDate: 1,
    isAutoRenewing: true,
    ...overrides,
  }
}

export function createApplePurchase(overrides: Partial<PurchaseIOS> = {}): PurchaseIOS {
  return {
    id: 'apple-transaction',
    transactionId: 'apple-transaction',
    productId: 'orbit.monthly',
    purchaseToken: 'signed-transaction',
    store: 'apple',
    storeId: 'apple',
    purchaseState: 'purchased',
    quantity: 1,
    transactionDate: 1,
    isAutoRenewing: true,
    ...overrides,
  }
}
