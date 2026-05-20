export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = { method, headers: {} }
  if (body) {
    (opts.headers as Record<string, string>)['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(path, opts)
  const json = await res.json().catch(() => ({})) as Record<string, string>
  if (!res.ok) throw new Error(json['error'] ?? res.statusText)
  return json as T
}
