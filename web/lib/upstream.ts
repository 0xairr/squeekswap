/**
 * fetch() for third-party APIs that records why a call failed (HTTP status and a short body excerpt, or the
 * network error and its cause) in the server logs. Routes still answer with a generic 502; the log says why.
 */
export async function fetchUpstream(url: string, init: RequestInit = {}): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? ` (cause: ${error.cause.message})` : ''
    console.warn(`[upstream] ${url} failed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}${cause}`)
    throw error
  }
  if (!response.ok) {
    const excerpt = await response.clone().text().then((text) => text.slice(0, 200).replace(/\s+/g, ' ')).catch(() => '')
    console.warn(`[upstream] ${url} -> HTTP ${response.status} ${response.headers.get('server') ?? ''} ${excerpt}`)
  }
  return response
}
