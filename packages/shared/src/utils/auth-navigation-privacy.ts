interface AuthNavigationEvent {
  request?: { url?: string; query_string?: unknown; headers?: Record<string, string> }
  transaction?: string
  breadcrumbs?: { message?: string; data?: Record<string, unknown> }[]
}

function scrubAuthLink(value: string): string {
  return value
    .replace(/((?:https?:\/\/[^/?#\s]+\/|orbit(?:-staging)?:\/\/|\/)(?:login|auth-callback|api\/auth\/google\/code)\/?)[?#][^\s"'<>]*/gi, '$1')
    .replace(/(\/api\/events\?[^\s"'<>#]*?\bticket=)[^&#\s"'<>]*/gi, '$1[Filtered]')
}

function scrubLinkValues(values: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === 'string') values[name] = scrubAuthLink(value)
  }
}

export function scrubAuthNavigation<T extends AuthNavigationEvent>(event: T): T {
  if (event.transaction) event.transaction = scrubAuthLink(event.transaction)
  if (event.request) {
    if (event.request.url) event.request.url = scrubAuthLink(event.request.url)
    delete event.request.query_string
    const headers = event.request.headers
    if (headers) scrubLinkValues(headers)
  }
  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (breadcrumb.message) breadcrumb.message = scrubAuthLink(breadcrumb.message)
    if (!breadcrumb.data) continue
    scrubLinkValues(breadcrumb.data)
  }
  return event
}
