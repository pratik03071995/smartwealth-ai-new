import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { loginAPI, meAPI, logoutAPI, type User, type Profile } from '../services/auth'

type AuthState = {
  user: User | null
  profile: Profile
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setProfile: (p: Profile) => void
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    meAPI()
      .then((res) => {
        if (!mounted) return
        if (res) {
          setUser(res.user)
          setProfile(res.profile)
        }
      })
      .finally(() => mounted && setLoading(false))
    return () => {
      mounted = false
    }
  }, [])

  async function login(username: string, password: string) {
    const u = await loginAPI(username, password)
    setUser(u)
    const me = await meAPI()
    setProfile(me?.profile ?? null)
  }

  async function logout() {
    await logoutAPI()
    setUser(null)
    setProfile(null)
  }

  const value = useMemo<AuthState>(
    () => ({ user, profile, loading, login, logout, setProfile }),
    [user, profile, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
