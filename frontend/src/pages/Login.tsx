import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('pratik')
  const [password, setPassword] = useState('demo123')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(username, password)
      navigate('/onboarding')
    } catch (err) {
      setError('Invalid credentials')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid h-full place-items-center bg-[var(--app-bg)] p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-2xl border border-[var(--divider)] bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="text-sm text-[var(--text-tertiary)]">Use demo credentials to continue</p>
        </div>
        <div className="space-y-2">
          <label className="block text-sm">Username</label>
          <input className="w-full rounded-lg border border-[var(--divider)] bg-white px-3 py-2 outline-none" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="pratik | saurav | shubham" />
        </div>
        <div className="space-y-2">
          <label className="block text-sm">Password</label>
          <input type="password" className="w-full rounded-lg border border-[var(--divider)] bg-white px-3 py-2 outline-none" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        <button disabled={busy} className="w-full rounded-lg bg-gradient-to-r from-[var(--brand2)] to-[var(--brand1)] px-4 py-2 font-semibold text-white shadow">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
