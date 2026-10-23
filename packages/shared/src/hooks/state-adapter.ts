export type StateUpdate<State> = State | ((current: State) => State)
export type StateSetter<State> = (update: StateUpdate<State>) => void
export type StateHook = <State>(initial: State | (() => State)) => [State, StateSetter<State>]
