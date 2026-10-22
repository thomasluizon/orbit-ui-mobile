interface AuthNavigationEvent {
  request?: { url?: string; query_string?: unknown; headers?: Record<string, string> }
  breadcrumbs?: { data?: Record<string, unknown> }[]
}

function scrubAuthLink(value: string): string {
  return value.replace(/((?:https?:\/\/[^/?#\s]+\/|orbit(?:-staging)?:\/\/|\/)(?:login|auth-callback)\/?)[?#][^\s"'<>]*/gi, '$1')
}

function scrubLinkValues(values: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === 'string') values[name] = scrubAuthLink(value)
  }
}

export function scrubAuthNavigation<T extends AuthNavigationEvent>(event: T): T {
  if (event.request) {
    if (event.request.url) event.request.url = scrubAuthLink(event.request.url)
    delete event.request.query_string
    const headers = event.request.headers
    if (headers) scrubLinkValues(headers)
  }
  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (!breadcrumb.data) continue
    scrubLinkValues(breadcrumb.data)
  }
  return event
}
