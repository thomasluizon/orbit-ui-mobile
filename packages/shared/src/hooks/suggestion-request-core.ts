export interface SuggestionRequestSnapshot {
  revision: number
}

export interface SuggestionRequestCoordinator {
  updateContext: (sessionKey: string | null, title: string) => void
  begin: () => SuggestionRequestSnapshot | null
  isCurrent: (request: SuggestionRequestSnapshot, currentTitle: string) => boolean
  finish: () => void
}

export function createSuggestionRequestCoordinator(): SuggestionRequestCoordinator {
  let sessionKey: string | null = null
  let title = ''
  let revision = 0
  let requestPending = false

  return {
    updateContext(nextSessionKey, nextTitle) {
      if (nextSessionKey === sessionKey && nextTitle === title) return
      sessionKey = nextSessionKey
      title = nextTitle
      revision += 1
    },
    begin() {
      if (requestPending || sessionKey === null) return null
      requestPending = true
      return { revision }
    },
    isCurrent(request, currentTitle) {
      return request.revision === revision && currentTitle === title
    },
    finish() {
      requestPending = false
    },
  }
}
