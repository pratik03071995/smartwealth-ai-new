import axios from 'axios'

const devFallback = import.meta.env.DEV ? 'http://localhost:5000/api' : ''
const rawBaseInput = import.meta.env.VITE_API_BASE_URL || devFallback || ''
const rawBase = rawBaseInput.trim().replace(/\/+$/, '')
const apiBase = !rawBase
  ? '/api'
  : rawBase.endsWith('/api')
    ? rawBase
    : `${rawBase}/api`

export const buildApiUrl = (path: string): string => {
  const clean = path.replace(/^\/+/, '')
  return clean ? `${apiBase}/${clean}` : apiBase
}

const api = axios.create({ baseURL: apiBase })

export default api
export { apiBase }
