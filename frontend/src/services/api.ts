import axios from 'axios'

const devFallback = import.meta.env.DEV ? '' : ''
const rawBaseInput = (import.meta.env.VITE_API_BASE_URL || devFallback || '').trim()

const ensureApiSuffix = (value: string): string => {
  const trimmed = value.replace(/\/+$/, '')
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
}

const computeApiBase = (): string => {
  const fallback = '/api'
  if (typeof window === 'undefined') {
    return rawBaseInput ? ensureApiSuffix(rawBaseInput) : fallback
  }

  if (!rawBaseInput) {
    return fallback
  }

  try {
    const resolved = new URL(rawBaseInput, window.location.origin)
    const currentHost = window.location.hostname
    const isLoopback = (host: string) => host === 'localhost' || host === '127.0.0.1'

    if (isLoopback(resolved.hostname) && currentHost && !isLoopback(currentHost)) {
      const normalized = `${window.location.origin}${resolved.pathname}`.replace(/\/+$/, '')
      return ensureApiSuffix(normalized)
    }

    if (currentHost && isLoopback(resolved.hostname) && isLoopback(currentHost) && resolved.hostname !== currentHost) {
      resolved.hostname = currentHost
    }

    if (!resolved.port && window.location.port) {
      resolved.port = window.location.port
    }

    const normalized = `${resolved.origin}${resolved.pathname}`.replace(/\/+$/, '')
    return ensureApiSuffix(normalized)
  } catch (error) {
    if (rawBaseInput.startsWith('/')) {
      return ensureApiSuffix(rawBaseInput)
    }
    console.warn('Failed to parse VITE_API_BASE_URL, falling back to /api', error)
    return fallback
  }
}

const apiBase = computeApiBase()

export const buildApiUrl = (path: string): string => {
  const clean = path.replace(/^\/+/, '')
  return clean ? `${apiBase}/${clean}` : apiBase
}

const api = axios.create({ baseURL: apiBase, withCredentials: true })

export default api
export { apiBase }
