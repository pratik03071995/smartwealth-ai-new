export type User = {
  id: string
  name: string
  username: string
  initials?: string
}

export type Profile = {
  risk?: string
  horizon?: string
  baseCurrency?: string
  holdings?: Array<{ symbol: string; shares: number; avgCost: number }>
  watchlist?: string[]
} | null

const API = '/api'

export async function loginAPI(username: string, password: string): Promise<User> {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password }),
  })
  if (!r.ok) throw new Error('Invalid credentials')
  const data = await r.json()
  return data.user as User
}

export async function meAPI(): Promise<{ user: User; profile: Profile } | null> {
  const r = await fetch(`${API}/auth/me`, { credentials: 'include' })
  if (!r.ok) return null
  const data = await r.json()
  return { user: data.user as User, profile: (data.profile ?? null) as Profile }
}

export async function logoutAPI(): Promise<void> {
  await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' })
}

export async function savePortfolioAPI(profile: NonNullable<Profile>): Promise<void> {
  await fetch(`${API}/portfolio`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  })
}

export async function getPortfolioAPI(): Promise<Profile> {
  const r = await fetch(`${API}/portfolio`, { credentials: 'include' })
  if (!r.ok) return null
  const data = await r.json()
  return (data.profile ?? null) as Profile
}
