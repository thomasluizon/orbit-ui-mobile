import { createContext, useContext } from 'react'

type TrackCardOperation = <Result>(operation: () => Promise<Result>) => Promise<Result>

const runOperation: TrackCardOperation = (operation) => operation()

export const ChatCardOperationContext = createContext<TrackCardOperation | undefined>(undefined)

export function useChatCardOperation() {
  return useContext(ChatCardOperationContext) ?? runOperation
}
