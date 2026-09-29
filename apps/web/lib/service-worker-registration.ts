/**
 * Registers the Web Push worker at `/sw.js` for the whole origin. A repeat call with the same script,
 * scope and cache mode resolves the existing registration without fetching the script again
 * (https://w3c.github.io/ServiceWorker/#register-algorithm), so every push path calls this first and a
 * failed attempt is retried on the next call.
 */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
}

/**
 * Resolves once the worker is active, so `pushManager.subscribe` can use it. Registering first means a
 * failure rejects here, where `navigator.serviceWorker.ready` alone would stay pending forever.
 */
export async function getActiveServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  await registerServiceWorker()
  return navigator.serviceWorker.ready
}
