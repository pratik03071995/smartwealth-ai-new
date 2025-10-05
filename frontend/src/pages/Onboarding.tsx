import React, { useState } from 'react'
import { savePortfolioAPI } from '../services/auth'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

export default function Onboarding() {
  const { profile, setProfile } = useAuth()
  const [risk, setRisk] = useState(profile?.risk || 'moderate')
  const [horizon, setHorizon] = useState(profile?.horizon || '3-5y')
  const [baseCurrency, setBaseCurrency] = useState(profile?.baseCurrency || 'USD')
  const [holdingsText, setHoldingsText] = useState('AAPL,100,185\nMSFT,50,315')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  function parseHoldings(): Array<{ symbol: string; shares: number; avgCost: number }> {
    return holdingsText
      .split(/\n|\r/)
      .map((r) => r.trim())
      .filter(Boolean)
      .map((row) => {
        const [symbol, shares, avgCost] = row.split(',').map((s) => s.trim())
        return { symbol, shares: Number(shares), avgCost: Number(avgCost) }
      })
      .filter((h) => h.symbol)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const next = { risk, horizon, baseCurrency, holdings: parseHoldings(), watchlist: [] as string[] }
    await savePortfolioAPI(next)
    setProfile(next)
    navigate('/dashboard')
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Tell us about your portfolio</h1>
      <form onSubmit={onSubmit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm">Risk</label>
            <select className="mt-1 w-full rounded-lg border border-[var(--divider)] bg-white px-3 py-2" value={risk} onChange={(e) => setRisk(e.target.value)}>
              <option value="conservative">Conservative</option>
              <option value="moderate">Moderate</option>
              <option value="aggressive">Aggressive</option>
            </select>
          </div>
          <div>
            <label className="block text-sm">Horizon</label>
            <select className="mt-1 w-full rounded-lg border border-[var(--divider)] bg-white px-3 py-2" value={horizon} onChange={(e) => setHorizon(e.target.value)}>
              <option value="<1y">Under 1 year</option>
              <option value="1-3y">1–3 years</option>
              <option value="3-5y">3–5 years</option>
              <option value=">5y">5+ years</option>
            </select>
          </div>
          <div>
            <label className="block text-sm">Base Currency</label>
            <select className="mt-1 w-full rounded-lg border border-[var(--divider)] bg-white px-3 py-2" value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)}>
              <option>USD</option>
              <option>EUR</option>
              <option>GBP</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm">Holdings (CSV lines: SYMBOL,SHARES,AVGCOST)</label>
          <textarea className="mt-1 h-32 w-full rounded-lg border border-[var(--divider)] bg-white p-3 font-mono text-sm" value={holdingsText} onChange={(e) => setHoldingsText(e.target.value)} />
        </div>

        <div className="flex gap-3">
          <button disabled={busy} className="rounded-lg bg-gradient-to-r from-[var(--brand2)] to-[var(--brand1)] px-4 py-2 font-semibold text-white">
            {busy ? 'Saving…' : 'Continue to Dashboard'}
          </button>
        </div>
      </form>
    </div>
  )
}

