export function accountEventApiBase(): string {
  return process.env.API_BASE ?? 'http://localhost:5000'
}
