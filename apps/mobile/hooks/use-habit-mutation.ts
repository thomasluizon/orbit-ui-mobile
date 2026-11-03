import { useMutation, type DefaultError, type MutationFunctionContext, type MutateOptions, type UseMutationOptions } from '@tanstack/react-query'
import { withAccountGuard, type HabitAccount } from './use-habit-mutation-shared'

type HabitMutationOptions<TResult, TError, TVariables, TSnapshot> = Omit<
  UseMutationOptions<TResult, TError, TVariables, TSnapshot>, 'onMutate' | 'mutationFn'
> & {
  mutationFn: NonNullable<UseMutationOptions<TResult, TError, TVariables, TSnapshot>['mutationFn']>
  onMutate?: (variables: TVariables, context: MutationFunctionContext, account: HabitAccount) => TSnapshot | Promise<TSnapshot>
}

const habitAccounts = new WeakMap<object, HabitAccount>()

function scopeCallbacks<TResult, TError, TVariables, TSnapshot>(
  options: MutateOptions<TResult, TError, TVariables, TSnapshot> | undefined,
  account: HabitAccount,
): MutateOptions<TResult, TError, TVariables, TSnapshot> | undefined {
  if (!options) return undefined
  return {
    ...options,
    onSuccess: (...arguments_) => { if (account.stillCurrent()) options.onSuccess?.(...arguments_) },
    onError: (...arguments_) => { if (account.stillCurrent()) options.onError?.(...arguments_) },
    onSettled: (...arguments_) => { if (account.stillCurrent()) options.onSettled?.(...arguments_) },
  }
}

export function useHabitMutation<TResult = unknown, TError = DefaultError, TVariables = void, TSnapshot = unknown>(
  options: HabitMutationOptions<TResult, TError, TVariables, TSnapshot>,
) {
  const execution = {}
  const executionKey = (context?: MutationFunctionContext) => context ?? execution
  const accountFor = (context: MutationFunctionContext) => habitAccounts.get(executionKey(context))
  const current = (context: MutationFunctionContext) => accountFor(context)?.stillCurrent() !== false
  const mutation = useMutation<TResult, TError, TVariables, TSnapshot>({
    ...options,
    onMutate: (variables, context) => withAccountGuard((account) => {
      habitAccounts.set(executionKey(context), account)
      return options.onMutate ? options.onMutate(variables, context, account) : undefined as TSnapshot
    }),
    mutationFn: (variables, context) => withAccountGuard(() => options.mutationFn(variables, context), accountFor(context)),
    onError: (error, variables, snapshot, context) => {
      if (current(context)) return options.onError?.(error, variables, snapshot, context)
    },
    onSuccess: (result, variables, snapshot, context) => {
      if (current(context)) return options.onSuccess?.(result, variables, snapshot, context)
    },
    onSettled: (result, error, variables, snapshot, context) => {
      if (current(context)) return options.onSettled?.(result, error, variables, snapshot, context)
    },
  })
  return {
    ...mutation,
    mutate: (variables: TVariables, callbacks?: MutateOptions<TResult, TError, TVariables, TSnapshot>) =>
      withAccountGuard(account => callbacks ? mutation.mutate(variables, scopeCallbacks(callbacks, account)) : mutation.mutate(variables)),
    mutateAsync: (variables: TVariables, callbacks?: MutateOptions<TResult, TError, TVariables, TSnapshot>) =>
      withAccountGuard(account => callbacks ? mutation.mutateAsync(variables, scopeCallbacks(callbacks, account)) : mutation.mutateAsync(variables)),
  }
}
