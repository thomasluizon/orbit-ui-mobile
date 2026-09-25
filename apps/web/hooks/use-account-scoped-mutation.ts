'use client'

import {
  useMutation,
  useQueryClient,
  type DefaultError,
  type MutateOptions,
  type UseMutationOptions,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { reportsAccountChanged } from '@/app/actions/action-result'
import { withAccountIntent } from '@/lib/client-action'
import { translateApiFetchMessage } from '@/lib/api-fetch'
import { getAccountGeneration, getHeldAccountId } from '@/stores/auth-store'

interface ScopedVariables<TVariables> {
  input: TVariables
  intendedAccountId: string | null
  generation: number
}

type AccountScopedOptions<TData, TError, TVariables, TOnMutateResult> = Omit<
  UseMutationOptions<TData, TError, TVariables, TOnMutateResult>,
  'mutationFn'
> & {
  mutationFn: (variables: TVariables, intendedAccountId: string | null) => Promise<TData>
}

function captureIntent<TVariables>(input: TVariables): ScopedVariables<TVariables> {
  return { input, intendedAccountId: getHeldAccountId(), generation: getAccountGeneration() }
}

function stillHeld<TVariables>(variables: ScopedVariables<TVariables>, error?: unknown): boolean {
  return !reportsAccountChanged(error)
    && sameGeneration(variables)
}

function sameGeneration<TVariables>(variables: ScopedVariables<TVariables>): boolean {
  return variables.intendedAccountId === getHeldAccountId()
    && variables.generation === getAccountGeneration()
}

function wrapMutateOptions<TData, TError, TVariables, TOnMutateResult>(
  options: MutateOptions<TData, TError, TVariables, TOnMutateResult> | undefined,
): MutateOptions<TData, TError, ScopedVariables<TVariables>, TOnMutateResult> | undefined {
  if (!options) return undefined
  const wrapped: MutateOptions<TData, TError, ScopedVariables<TVariables>, TOnMutateResult> = {}
  if (options.onSuccess) wrapped.onSuccess = (data, variables, result, context) =>
    stillHeld(variables) ? options.onSuccess?.(data, variables.input, result, context) : undefined
  if (options.onError) wrapped.onError = (error, variables, result, context) =>
    stillHeld(variables, error) ? options.onError?.(error, variables.input, result, context) : undefined
  if (options.onSettled) wrapped.onSettled = (data, error, variables, result, context) =>
    stillHeld(variables, error)
      ? options.onSettled?.(data, error, variables.input, result, context)
      : undefined
  return wrapped
}

export function useAccountScopedMutation<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TOnMutateResult = unknown,
>(options: AccountScopedOptions<TData, TError, TVariables, TOnMutateResult>) {
  const queryClient = useQueryClient()
  const { mutationFn, onMutate, onSuccess, onError, onSettled, ...rest } = options

  const scopedOptions: UseMutationOptions<
    TData,
    TError,
    ScopedVariables<TVariables>,
    TOnMutateResult
  > = {
    ...rest,
    mutationFn: ({ input, intendedAccountId }) =>
      withAccountIntent(intendedAccountId, () => mutationFn(input, intendedAccountId)),
  }

  if (onMutate) scopedOptions.onMutate = async (variables, context) => {
    try {
      return await onMutate(variables.input, context)
    } finally {
      if (variables.generation !== getAccountGeneration()
        || variables.intendedAccountId !== getHeldAccountId()) {
        void queryClient.resetQueries()
      }
    }
  }
  if (onSuccess) scopedOptions.onSuccess = (data, variables, result, context) =>
    stillHeld(variables) ? onSuccess(data, variables.input, result, context) : undefined
  scopedOptions.onError = (error, variables, result, context) => {
    if (reportsAccountChanged(error)) {
      if (sameGeneration(variables)) queryClient.clear()
      const message = translateApiFetchMessage('errors.api.accountChanged')
      if (message) toast.error(message)
      return
    }
    if (stillHeld(variables)) return onError?.(error, variables.input, result, context)
  }
  scopedOptions.onSettled = (data, error, variables, result, context) => {
    if (stillHeld(variables, error)) {
      return onSettled?.(data, error, variables.input, result, context)
    }
    if (variables.intendedAccountId === getHeldAccountId()) {
      return queryClient.invalidateQueries()
    }
  }

  const mutation = useMutation(scopedOptions)
  return {
    ...mutation,
    variables: mutation.variables?.input,
    mutate: (
      variables: TVariables,
      mutateOptions?: MutateOptions<TData, TError, TVariables, TOnMutateResult>,
    ) => mutation.mutate(captureIntent(variables), wrapMutateOptions(mutateOptions)),
    mutateAsync: (
      variables: TVariables,
      mutateOptions?: MutateOptions<TData, TError, TVariables, TOnMutateResult>,
    ) => mutation.mutateAsync(captureIntent(variables), wrapMutateOptions(mutateOptions)),
  }
}
