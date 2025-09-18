import React, { useCallback, useEffect, useMemo, useState } from 'react'

const CUSTOM_LOGO_URLS: Record<string, string[]> = {
  META: ['https://logo.clearbit.com/meta.com', 'https://logo.clearbit.com/facebook.com'],
  GOOGL: ['https://logo.clearbit.com/google.com', 'https://logo.clearbit.com/alphabet.com'],
  GOOG: ['https://logo.clearbit.com/google.com', 'https://logo.clearbit.com/alphabet.com'],
  AAPL: ['https://logo.clearbit.com/apple.com'],
  MSFT: ['https://logo.clearbit.com/microsoft.com'],
  AMZN: ['https://logo.clearbit.com/amazon.com'],
  NVDA: ['https://logo.clearbit.com/nvidia.com'],
  TSLA: ['https://logo.clearbit.com/tesla.com'],
  NFLX: ['https://logo.clearbit.com/netflix.com'],
  GO: ['https://logo.clearbit.com/google.com'],
  MS: ['https://logo.clearbit.com/morganstanley.com'],
}

const CUSTOM_CATEGORY_LOGOS: Record<string, string[]> = {
  'HEALTHCARE PROVIDERS': ['https://logo.clearbit.com/healthcare.com', 'https://img.logo.dev/ticker/HCA?size=220&format=png'],
  'FINANCIAL SERVICES (US)': ['https://logo.clearbit.com/visa.com', 'https://logo.clearbit.com/mastercard.com'],
  'MEDIA/ENTERTAINMENT': ['https://logo.clearbit.com/netflix.com', 'https://logo.clearbit.com/disney.com'],
  'AUTOMOTIVE OEMS': ['https://logo.clearbit.com/tesla.com', 'https://logo.clearbit.com/ford.com'],
  'ENTERPRISE (US)': ['https://logo.clearbit.com/salesforce.com', 'https://logo.clearbit.com/oracle.com'],
  'SMB CUSTOMERS': ['https://logo.clearbit.com/shopify.com'],
}

const dedupe = (arr: (string | null | undefined)[]) => {
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of arr) {
    if (!item) continue
    if (seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out
}

const cleanCompanyName = (name?: string | null) => {
  if (!name) return ''
  const lower = name.toLowerCase().replace(/&/g, 'and')
  const stripped = lower.replace(/\b(incorporated|inc|corporation|corp|ltd|plc|sa|ag|co)\b\.?/g, '')
  return stripped.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/--+/g, '-')
}

export const buildLogoSources = (symbol?: string, name?: string) => {
  const sym = symbol?.toUpperCase().trim() ?? ''
  const symLower = sym.toLowerCase()
  const nameSlug = cleanCompanyName(name)
  const upperName = (name || '').trim().toUpperCase()

  const possibleDomains = dedupe([
    symLower ? `${symLower}.com` : null,
    nameSlug ? `${nameSlug}.com` : null,
    nameSlug ? `${nameSlug}.io` : null,
  ])

  const defaults = [
    sym ? `https://img.logo.dev/ticker/${encodeURIComponent(sym)}?size=220&format=png` : null,
    ...possibleDomains.map((domain) => `https://logo.clearbit.com/${domain}`),
    sym ? `https://logo.clearbit.com/${encodeURIComponent(symLower)}.com` : null,
    sym ? `https://storage.googleapis.com/iex/api/logos/${encodeURIComponent(sym)}.png` : null,
    sym ? `https://financialmodelingprep.com/image-stock/${encodeURIComponent(sym)}.png` : null,
  ]

  return dedupe([
    ...(sym && CUSTOM_LOGO_URLS[sym] ? CUSTOM_LOGO_URLS[sym] : []),
    ...(upperName && CUSTOM_CATEGORY_LOGOS[upperName] ? CUSTOM_CATEGORY_LOGOS[upperName] : []),
    ...defaults,
  ])
}

export function CompanyLogo({
  symbol,
  name,
  className = '',
  rounded = 'rounded-2xl',
  fallback,
}: {
  symbol?: string | null
  name?: string | null
  className?: string
  rounded?: string
  fallback?: string
}) {
  const sources = useMemo(() => buildLogoSources(symbol ?? undefined, name ?? undefined), [symbol, name])
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setIndex(0)
    setFailed(false)
  }, [sources])

  const handleError = useCallback(() => {
    setIndex((prev) => {
      if (prev < sources.length - 1) return prev + 1
      setFailed(true)
      return prev
    })
  }, [sources.length])

  const text = (fallback || symbol || name || '—').slice(0, 2).toUpperCase()
  const current = failed ? undefined : sources[index]

  return (
    <div
      className={`flex h-full w-full items-center justify-center bg-[var(--panel)]/30 ${rounded} ${className}`.trim()}
    >
      {current ? (
        <img
          key={`${symbol || name || 'logo'}-${index}`}
          src={current}
          alt={symbol || name || 'logo'}
          className="max-h-full max-w-full object-contain p-1"
          onError={handleError}
          loading="lazy"
        />
      ) : (
        <span className="text-sm font-semibold text-[var(--brand2)]">{text}</span>
      )}
    </div>
  )
}

export default CompanyLogo
