export interface HabitViewSearchState {
  view: string
  open: boolean
  text: string
  query: string
}

export type HabitViewSearchAction = { type: 'close' | 'toggle' }
  | { type: 'text'; text: string }
  | { type: 'flush'; view: string }

export function createHabitViewSearchState(view: string): HabitViewSearchState {
  return { view, open: false, text: '', query: '' }
}

export function updateHabitViewSearch(state: HabitViewSearchState, action: HabitViewSearchAction): HabitViewSearchState {
  switch (action.type) {
    case 'close': return createHabitViewSearchState(state.view)
    case 'toggle': return state.open ? createHabitViewSearchState(state.view) : { ...state, open: true }
    case 'text': return { ...state, text: action.text }
    case 'flush': return state.view === action.view ? { ...state, query: state.text.trim() } : state
  }
}
