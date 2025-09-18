import axios from 'axios'

const rawBase = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')
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
