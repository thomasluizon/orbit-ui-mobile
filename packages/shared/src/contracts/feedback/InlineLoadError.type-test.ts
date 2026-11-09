import type { InlineLoadErrorProps } from './InlineLoadError'

type IsExact<T, U> = T extends U ? Exclude<keyof T, keyof U> extends never ? true : false : false
type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T

declare const _retry: () => void

export type InlineLoadErrorTypeContract = [
  Assert<IsExactWidth<InlineLoadErrorProps['message'], string>>,
  Assert<IsExactWidth<InlineLoadErrorProps['onRetry'], () => void>>,
  Assert<IsExact<{ message: 'Try again'; onRetry: typeof _retry }, InlineLoadErrorProps>>,
  // @ts-expect-error the message is required
  Assert<IsExact<{ onRetry: typeof _retry }, InlineLoadErrorProps>>,
  // @ts-expect-error the retry is required
  Assert<IsExact<{ message: 'Try again' }, InlineLoadErrorProps>>,
  // @ts-expect-error callers cannot replace the retry label
  Assert<IsExact<{ message: 'Try again'; onRetry: typeof _retry; retryLabel: 'Again' }, InlineLoadErrorProps>>,
  // @ts-expect-error callers cannot disable the retry
  Assert<IsExact<{ message: 'Try again'; onRetry: typeof _retry; disabled: true }, InlineLoadErrorProps>>,
]
