import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import api from '../services/api'
import CompanyLogo from '../utils/logos'

interface Profile {
  symbol: string
  price?: number
  marketCap?: number
  beta?: number
  lastDividend?: number
  range?: string
  change?: number
  changePercentage?: number
  volume?: number
  averageVolume?: number
  companyName?: string
  currency?: string
  cik?: string
  isin?: string
  cusip?: string
  exchangeFullName?: string
  exchange?: string
  industry?: string
  website?: string
  description?: string
  ceo?: string
  sector?: string
  country?: string
  fullTimeEmployees?: number
  phone?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  image?: string
  ipoDate?: string
  defaultImage?: boolean | string
  isEtf?: boolean | string
  isActivelyTrading?: boolean | string
  isAdr?: boolean | string
  isFund?: boolean | string
}

const formatCurrency = (value?: number, currency = 'USD') => {
  if (value == null || Number.isNaN(value)) return '—'
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
  } catch {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
  }
}

const formatLargeNumber = (value?: number, currency?: string) => {
  if (value == null || Number.isNaN(value)) return '—'
  const abs = Math.abs(value)
  let suffix = ''
  let scaled = value
  if (abs >= 1e12) {
    scaled = value / 1e12
    suffix = 'T'
  } else if (abs >= 1e9) {
    scaled = value / 1e9
    suffix = 'B'
  } else if (abs >= 1e6) {
    scaled = value / 1e6
    suffix = 'M'
  } else if (abs >= 1e3) {
    scaled = value / 1e3
    suffix = 'K'
  }
  const base = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(scaled)
  return currency ? `${base}${suffix} ${currency}` : `${base}${suffix}`
}

const formatPercent = (value?: number) => {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value.toFixed(2)}%`
}

const formatNumber = (value?: number) => {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}

const formatBoolean = (value?: boolean | string) => {
  if (value === undefined || value === null) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  const normalized = value.toString().trim().toLowerCase()
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return 'Yes'
  if (['0', 'false', 'no', 'n'].includes(normalized)) return 'No'
  return value.toString()
}

const SectionIcon = ({ type }: { type: 'market' | 'company' | 'id' | 'description' }) => {
  const color = 'var(--brand2)'
  switch (type) {
    case 'market':
      return (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6">
          <path d="M4 19V5l6 5 5-7 5 6v10H4Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'company':
      return (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6">
          <path d="M4 20V6l6-3 6 3v14" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 13h12" strokeLinecap="round" />
        </svg>
      )
    case 'id':
      return (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 8h10M7 12h5M7 16h7" strokeLinecap="round" />
        </svg>
      )
    case 'description':
    default:
      return (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6">
          <path d="M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
          <path d="M14 4v4h4" />
        </svg>
      )
  }
}

export default function CompanyInfo() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Profile | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (opts?: { refresh?: boolean }) => {
    const refresh = opts?.refresh ?? false
    if (refresh) setRefreshing(true)
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('companies/profiles', {
        params: refresh ? { refresh: 1 } : undefined,
      })
      setProfiles(Array.isArray(data?.items) ? data.items : [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load companies')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = profiles.slice().sort((a, b) => (a.companyName || '').localeCompare(b.companyName || ''))
    if (!q) return list
    return list.filter((p) => {
      return (
        (p.companyName || '').toLowerCase().includes(q) ||
        (p.symbol || '').toLowerCase().includes(q) ||
        (p.sector || '').toLowerCase().includes(q)
      )
    })
  }, [profiles, search])

  return (
    <section className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Company Profiles</h1>
          <p className="text-sm text-[var(--muted)]">Live fundamentals from the NYSE profiles table. Tap a card to see full details.</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbol, name, sector…"
            className="w-64 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-sm outline-none focus:border-[var(--brand2)]/70 focus:ring-2 focus:ring-[var(--brand2)]/30"
          />
          <button
            onClick={() => load({ refresh: true })}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] transition hover:text-[var(--text)]"
            title="Refresh data from Databricks"
            disabled={refreshing}
          >
            <svg
              className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <path d="M4 4v4h4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M16 16v-4h-4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5.5 14.5a6 6 0 0 1 0-8.5L8 8" />
              <path d="M14.5 5.5a6 6 0 0 1 0 8.5L12 12" />
            </svg>
          </button>
        </div>
      </header>

      {loading && (
        <div className="rounded-3xl border border-[var(--border)]/50 bg-[var(--panel)]/70 p-8 text-center text-sm text-[var(--muted)]">
          Loading company profiles…
        </div>
      )}

      {error && (
        <div className="rounded-3xl border border-red-500/40 bg-red-500/10 p-5 text-sm text-red-200">{error}</div>
      )}

      {!loading && !error && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((profile) => {
            const isActive = selected?.symbol === profile.symbol
            return (
              <button
                key={profile.symbol}
                onClick={() => setSelected(profile)}
              className={`group flex flex-col gap-3 rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-[var(--brand2)]/60 hover:-translate-y-1 hover:shadow-[0_24px_50px_rgba(10,16,48,0.25)] ${
                isActive
                  ? 'border-[var(--brand2)]/70 bg-gradient-to-br from-[var(--brand2)]/18 via-[var(--panel)]/90 to-[var(--panel)]'
                  : 'border-[var(--border)]/60 bg-[var(--panel)]/70 hover:border-[var(--brand2)]/50'
              }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)]/60 bg-[var(--panel)]/80">
                    <CompanyLogo symbol={profile.symbol} name={profile.companyName} className="h-full w-full" fallback={profile.companyName} />
                  </div>
                <div>
                  <div className="text-sm font-semibold text-[var(--text)]">{profile.companyName}</div>
                  <div className="text-xs text-[var(--muted)]">{profile.symbol} • {profile.sector || '—'}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs text-[var(--muted)]">
                <InfoRow label="Price" value={formatCurrency(profile.price, profile.currency || 'USD')} />
                <InfoRow label="Market Cap" value={formatLargeNumber(profile.marketCap, profile.currency)} />
            <InfoRow
              label="Change"
              value={`${formatCurrency(profile.change, profile.currency)} (${formatPercent(profile.changePercentage)})`}
              trend={profile.changePercentage}
            />
              </div>
            </button>
            )
          })}
        </div>
      )}

      {selected && (
        <CompanyDrawer profile={selected} onClose={() => setSelected(null)} />
      )}
    </section>
  )
}

function InfoRow({ label, value, trend }: { label: string; value: React.ReactNode; trend?: number }) {
  const trendColor = trend == null ? undefined : trend >= 0 ? 'text-emerald-400' : 'text-rose-400'
  return (
    <div className="rounded-xl border border-[var(--border)]/50 bg-[var(--panel)]/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className={`text-sm font-semibold ${trendColor || 'text-[var(--text)]'}`}>{value}</div>
    </div>
  )
}

function CompanyDrawer({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[rgba(6,10,32,0.78)] p-4 backdrop-blur" onClick={onClose}>
      <div
        className="relative w-full max-w-4xl max-h-[90vh] overflow-auto rounded-3xl border border-[var(--border)]/70 bg-[var(--panel)] shadow-[0_40px_120px_rgba(10,16,48,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--border)]/60 bg-gradient-to-r from-[var(--brand2)]/15 via-transparent to-transparent px-6 py-5 backdrop-blur">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)]/80">
              <CompanyLogo symbol={profile.symbol} name={profile.companyName} className="h-full w-full" fallback={profile.companyName} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-[var(--text)]">{profile.companyName}</h2>
              <div className="text-sm text-[var(--muted)]">{profile.symbol} • {profile.exchangeFullName || profile.exchange}</div>
              <div className="text-sm text-[var(--muted)]">{profile.sector} • {profile.industry}</div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)] hover:bg-white/5">
          Close
          </button>
        </div>

        <div className="px-6 pb-6 pt-4 grid gap-4 md:grid-cols-2">
          <DetailCard title="Market Data">
            <DetailRow label="Price" value={formatCurrency(profile.price, profile.currency || 'USD')} />
            <DetailRow label="Market Cap" value={formatLargeNumber(profile.marketCap, profile.currency)} />
            <DetailRow label="Beta" value={profile.beta?.toFixed(2) ?? '—'} />
            <DetailRow label="Dividend" value={formatCurrency(profile.lastDividend, profile.currency || 'USD')} />
            <DetailRow label="52w Range" value={profile.range || '—'} />
            <DetailRow label="Change" value={`${formatCurrency(profile.change, profile.currency)} (${formatPercent(profile.changePercentage)})`} />
            <DetailRow label="Volume" value={formatNumber(profile.volume)} />
            <DetailRow label="Avg Volume" value={formatNumber(profile.averageVolume)} />
          </DetailCard>

          <DetailCard title="Company">
            <DetailRow label="CEO" value={profile.ceo || '—'} />
            <DetailRow label="Employees" value={formatNumber(profile.fullTimeEmployees)} />
            <DetailRow label="Country" value={profile.country || '—'} />
            <DetailRow label="Address" value={[profile.address, profile.city, profile.state, profile.zip].filter(Boolean).join(', ') || '—'} />
            <DetailRow label="Phone" value={profile.phone || '—'} />
            <DetailRow label="Website" value={profile.website ? <a className="text-[var(--brand2)]" href={profile.website} target="_blank" rel="noreferrer">{profile.website}</a> : '—'} />
            <DetailRow label="IPO Date" value={profile.ipoDate || '—'} />
          </DetailCard>

          <DetailCard title="Identifiers">
            <DetailRow label="Currency" value={profile.currency || '—'} />
            <DetailRow label="CIK" value={profile.cik || '—'} />
            <DetailRow label="ISIN" value={profile.isin || '—'} />
            <DetailRow label="CUSIP" value={profile.cusip || '—'} />
          <DetailRow label="Exchange" value={profile.exchangeFullName || profile.exchange || '—'} />
          <DetailRow label="Is ETF" value={formatBoolean(profile.isEtf)} />
          <DetailRow label="ADR" value={formatBoolean(profile.isAdr)} />
          <DetailRow label="Fund" value={formatBoolean(profile.isFund)} />
          <DetailRow label="Actively Trading" value={formatBoolean(profile.isActivelyTrading)} />
          </DetailCard>

          <DetailCard title="Description" className="md:col-span-2">
            <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--muted)]">
              {profile.description || 'No description available.'}
            </p>
          </DetailCard>
        </div>
      </div>
    </div>
  )
}

function DetailCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-[var(--border)]/45 bg-[var(--panel)]/70 p-4 space-y-2 ${className || ''}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{title}</div>
      <div className="space-y-1.5 text-sm">{children}</div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[var(--muted)]">
      <span className="text-xs uppercase tracking-wide">{label}</span>
      <span className="text-right text-[var(--text)]">{value}</span>
    </div>
  )
}
