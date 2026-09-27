export function accountEventApiBase(): string {
  return process.env.NEXT_PUBLIC_EVENT_API_BASE ?? process.env.API_BASE ?? 'http://localhost:5000'
}
