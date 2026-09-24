'use client'

import {
  useMutation,
  useQueryClient,
  type DefaultError,
  type MutateOptions,
  type UseMutationOptions,
} from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { getHeldAccountId } from '@/stores/auth-store'
import { reportsAccountChanged } from '@/app/actions/action-result'
import { useAppToast } from '@/hooks/use-app-toast'
import { getAccountGeneration } from '@/lib/session-epoch'

/**
 * The variables the underlying mutation carries: what the caller passed, plus who was signed in
 * when they passed it. Nothing outside this module sees the wrapper.
 */
interface AccountScopedVariables<TVariables> {
  input: TVariables
  intendedAccountId: string | null
  accountGeneration: number
}

type AccountScopedOptions<TData, TError, TVariables, TOnMutateResult> = Omit<
  UseMutationOptions<TData, TError, TVariables, TOnMutateResult>,
  'mutationFn'
> & {
  mutationFn: (variables: TVariables, intendedAccountId: string | null) => Promise<TData>
}

function scopeToHeldAccount<TVariables>(input: TVariables): AccountScopedVariables<TVariables> {
  return { input, intendedAccountId: getHeldAccountId(), accountGeneration: getAccountGeneration() }
}

function stillHeld<TVariables>(variables: AccountScopedVariables<TVariables>, error?: unknown): boolean {
  return !reportsAccountChanged(error)
    && getHeldAccountId() === variables.intendedAccountId
    && getAccountGeneration() === variables.accountGeneration
}

function unwrapMutateOptions<TData, TError, TVariables, TOnMutateResult>(
  mutateOptions: MutateOptions<TData, TError, TVariables, TOnMutateResult> | undefined,
): MutateOptions<TData, TError, AccountScopedVariables<TVariables>, TOnMutateResult> | undefined {
  if (!mutateOptions) return undefined

  const { onSuccess, onError, onSettled } = mutateOptions
  const unwrapped: MutateOptions<
    TData,
    TError,
    AccountScopedVariables<TVariables>,
    TOnMutateResult
  > = {}

  if (onSuccess) {
    unwrapped.onSuccess = (data, variables, onMutateResult, context) =>
      stillHeld(variables) ? onSuccess(data, variables.input, onMutateResult, context) : undefined
  }
  if (onError) {
    unwrapped.onError = (error, variables, onMutateResult, context) =>
      stillHeld(variables, error) ? onError(error, variables.input, onMutateResult, context) : undefined
  }
  if (onSettled) {
    unwrapped.onSettled = (data, error, variables, onMutateResult, context) =>
      stillHeld(variables, error) ? onSettled(data, error, variables.input, onMutateResult, context) : undefined
  }

  return unwrapped
}

/**
 * A `useMutation` whose write carries the account the person held when they started it.
 *
 * The account is read inside `mutate`, synchronously, rather than inside `mutationFn`. Those are
 * not the same instant: `onMutate` runs in between and awaits `cancelQueries`, so a read in the
 * mutation function samples the cookie after the gap the guard exists to distrust, and would agree
 * with whichever account signed in during it.
 *
 * Every mutating call goes through one helper rather than through the same eight lines repeated at
 * each hook, because a rule written out forty times is a rule thirty-nine of them can keep and the
 * fortieth can quietly drop. `mutationFn` takes the account as its second argument; every other
 * callback sees the caller's own variables untouched.
 */
export function useAccountScopedMutation<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TOnMutateResult = unknown,
>(options: AccountScopedOptions<TData, TError, TVariables, TOnMutateResult>) {
  const t = useTranslations()
  const { showPersistentError } = useAppToast()
  const queryClient = useQueryClient()
  const { mutationFn, onMutate, onSuccess, onError, onSettled, ...rest } = options

  const scopedOptions: UseMutationOptions<
    TData,
    TError,
    AccountScopedVariables<TVariables>,
    TOnMutateResult
  > = {
    ...rest,
    mutationFn: ({ input, intendedAccountId }) => mutationFn(input, intendedAccountId),
  }

  if (onMutate) {
    scopedOptions.onMutate = (variables, context) => onMutate(variables.input, context)
  }
  if (onSuccess) {
    scopedOptions.onSuccess = (data, variables, onMutateResult, context) =>
      stillHeld(variables) ? onSuccess(data, variables.input, onMutateResult, context) : undefined
  }
  scopedOptions.onError = (error, variables, onMutateResult, context) => {
    if (reportsAccountChanged(error)) {
      if (getHeldAccountId() === variables.intendedAccountId && getAccountGeneration() === variables.accountGeneration) queryClient.clear()
      showPersistentError(t('errors.api.accountChanged'), t('common.dismiss'))
      return
    }
    if (stillHeld(variables)) onError?.(error, variables.input, onMutateResult, context)
  }
  if (onSettled) {
    scopedOptions.onSettled = (data, error, variables, onMutateResult, context) =>
      stillHeld(variables, error) ? onSettled(data, error, variables.input, onMutateResult, context) : undefined
  }

  const mutation = useMutation(scopedOptions)

  return {
    ...mutation,
    variables: mutation.variables?.input,
    mutate: (
      variables: TVariables,
      mutateOptions?: MutateOptions<TData, TError, TVariables, TOnMutateResult>,
    ) => mutation.mutate(scopeToHeldAccount(variables), unwrapMutateOptions(mutateOptions)),
    mutateAsync: (
      variables: TVariables,
      mutateOptions?: MutateOptions<TData, TError, TVariables, TOnMutateResult>,
    ) => mutation.mutateAsync(scopeToHeldAccount(variables), unwrapMutateOptions(mutateOptions)),
  }
}
