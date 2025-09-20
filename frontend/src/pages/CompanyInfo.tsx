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
  const location = [profile.address, profile.city, profile.state, profile.zip].filter(Boolean).join(', ')
  const infoChips = [profile.sector, profile.industry, profile.country].filter(Boolean)

  const marketStats = [
    { label: 'Spot price', value: formatCurrency(profile.price, profile.currency || 'USD') },
    { label: 'Market cap', value: formatLargeNumber(profile.marketCap, profile.currency) },
    { label: 'Beta', value: profile.beta != null ? profile.beta.toFixed(2) : '—' },
    { label: 'Dividend', value: formatCurrency(profile.lastDividend, profile.currency || 'USD') },
    { label: '52w range', value: profile.range || '—' },
    {
      label: 'Change',
      value:
        profile.changePercentage != null
          ? `${formatCurrency(profile.change, profile.currency)} (${formatPercent(profile.changePercentage)})`
          : '—',
    },
    { label: 'Volume', value: formatNumber(profile.volume) },
    { label: 'Avg volume', value: formatNumber(profile.averageVolume) },
  ]

  const companyStats = [
    { label: 'CEO', value: profile.ceo || '—' },
    { label: 'Employees', value: formatNumber(profile.fullTimeEmployees) },
    { label: 'Phone', value: profile.phone || '—' },
    { label: 'Website', value: profile.website ? (
      <a className="text-[var(--brand2)] hover:text-[var(--brand1)]" href={profile.website} target="_blank" rel="noreferrer">
        {profile.website}
      </a>
    ) : '—' },
    { label: 'IPO date', value: profile.ipoDate || '—' },
    { label: 'Headquarters', value: location || '—' },
  ]

  const identifierStats = [
    { label: 'Exchange', value: profile.exchangeFullName || profile.exchange || '—' },
    { label: 'Currency', value: profile.currency || '—' },
    { label: 'CIK', value: profile.cik || '—' },
    { label: 'ISIN', value: profile.isin || '—' },
    { label: 'CUSIP', value: profile.cusip || '—' },
    { label: 'ETF', value: formatBoolean(profile.isEtf) },
    { label: 'ADR', value: formatBoolean(profile.isAdr) },
    { label: 'Fund', value: formatBoolean(profile.isFund) },
    { label: 'Actively trading', value: formatBoolean(profile.isActivelyTrading) },
  ]

  return (
    <motion.div
      className="fixed inset-0 z-[360] flex items-center justify-center bg-black/45 px-4 py-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        layout
        initial={{ y: 36, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ duration: 0.32, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-3xl border border-[var(--border)]/45 bg-white text-[var(--text)] shadow-[0_48px_140px_rgba(15,23,42,0.32)]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(177,140,255,0.18),transparent_60%),radial-gradient(circle_at_bottom_right,rgba(124,240,255,0.16),transparent_60%)]" />
        <div className="relative z-10 flex max-h-[90vh] flex-col overflow-hidden">
          <header className="flex items-center justify-between gap-6 border-b border-[var(--border)]/35 px-8 py-6">
            <div className="flex items-start gap-5">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border)]/50 bg-white/95 shadow-[0_12px_32px_rgba(15,23,42,0.16)]">
                <CompanyLogo symbol={profile.symbol} name={profile.companyName} className="h-full w-full" fallback={profile.companyName} />
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-baseline gap-3">
                  <h2 className="text-3xl font-black tracking-tight">{profile.companyName}</h2>
                  {profile.symbol && (
                    <span className="rounded-full border border-[var(--border)]/40 bg-white/95 px-3 py-1 text-xs text-[var(--muted)]">{profile.symbol}</span>
                  )}
                </div>
                <p className="max-w-xl text-sm text-[var(--muted)]">
                  {profile.exchangeFullName || profile.exchange || '—'} • {profile.country || 'Global company'}
                </p>
                <div className="flex flex-wrap gap-2 text-[11px] text-[var(--muted)]">
                  {infoChips.map((chip, idx) => (
                    <span key={`${chip}-${idx}`} className="rounded-full border border-[var(--border)]/40 bg-white/95 px-3 py-1">
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)]/45 bg-white/95 text-sm font-semibold text-[var(--muted)] shadow-sm transition hover:bg-[var(--brand2)]/20 hover:text-[var(--brand1)]"
            >
              ✕
            </button>
          </header>

          <div className="grid flex-1 gap-6 overflow-y-auto px-8 py-8 lg:grid-cols-[1.35fr_1fr]">
            <section className="space-y-5">
              <InfoSection title="Market pulse" icon={IconChart}>
                <div className="grid gap-3 md:grid-cols-2">
                  {marketStats.map((stat) => (
                    <InfoRowCompact key={stat.label} label={stat.label} value={stat.value} />
                  ))}
                </div>
              </InfoSection>

              <InfoSection title="Company profile" icon={IconBuilding}>
                <div className="grid gap-3 md:grid-cols-2">
                  {companyStats.map((stat) => (
                    <InfoRowCompact key={stat.label} label={stat.label} value={stat.value} />
                  ))}
                </div>
              </InfoSection>

              <InfoSection title="Business narrative" icon={IconDocument}>
                <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--muted)]">
                  {profile.description || 'No description available.'}
                </p>
              </InfoSection>
            </section>

            <aside className="space-y-5">
              <InfoSection title="Identifiers" icon={IconId}>
                <div className="space-y-3">
                  {identifierStats.map((stat) => (
                    <InfoRowCompact key={stat.label} label={stat.label} value={stat.value} />
                  ))}
                </div>
              </InfoSection>

              <InfoSection title="Contact" icon={IconLocator}>
                <div className="space-y-3 text-sm text-[var(--muted)]">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Headquarters</div>
                    <div className="text-[var(--text)]">{location || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Phone</div>
                    <div className="text-[var(--text)]">{profile.phone || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Website</div>
                    <div className="text-[var(--text)]">
                      {profile.website ? (
                        <a className="text-[var(--brand2)] hover:text-[var(--brand1)]" href={profile.website} target="_blank" rel="noreferrer">
                          {profile.website}
                        </a>
                      ) : (
                        '—'
                      )}
                    </div>
                  </div>
                </div>
              </InfoSection>
            </aside>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function InfoSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--border)]/40 bg-white/96 p-5 shadow-[0_16px_52px_rgba(15,23,42,0.1)]">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)]/35 bg-white/95 text-[var(--brand1)]">
          {icon}
        </span>
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function InfoRowCompact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)]/35 bg-white/98 px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.08)]">
      <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-sm font-semibold text-[var(--text)]">{value}</div>
    </div>
  )
}

const IconChart = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M4 19V5l6 6 5-7 5 6v9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const IconBuilding = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M4 21V7l8-4 8 4v14" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 12h16" strokeLinecap="round" />
  </svg>
)

const IconDocument = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
    <path d="M14 4v4h4" />
  </svg>
)

const IconId = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 9h6M7 12h4M7 15h7" strokeLinecap="round" />
  </svg>
)

const IconLocator = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
)
