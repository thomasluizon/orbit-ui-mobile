export function scheduleOnRN<Args extends unknown[], Return>(
  callback: (...args: Args) => Return,
  ...args: Args
): void {
  callback(...args)
}
