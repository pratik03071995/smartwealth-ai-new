import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'smartwealth-ai-chat-sound'

type ChatChimeOptions = {
  frequency?: number
  duration?: number
  volume?: number
}

const DEFAULT_OPTS: Required<ChatChimeOptions> = {
  frequency: 760,
  duration: 0.25,
  volume: 0.12,
}

export function useChatChime(opts: ChatChimeOptions = {}) {
  const { frequency, duration, volume } = { ...DEFAULT_OPTS, ...opts }
  const [muted, setMuted] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      return stored === 'muted'
    } catch (error) {
      return false
    }
  })
  const audioCtxRef = useRef<AudioContext | null>(null)
  const readyRef = useRef(false)

  const ensureContext = useCallback(() => {
    if (audioCtxRef.current) return audioCtxRef.current
    if (typeof window === 'undefined') return null
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    audioCtxRef.current = ctx
    return ctx
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = () => {
      const ctx = ensureContext()
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => undefined)
      }
      readyRef.current = true
    }
    window.addEventListener('pointerdown', handler, { once: true })
    window.addEventListener('keydown', handler, { once: true })
    return () => {
      window.removeEventListener('pointerdown', handler)
      window.removeEventListener('keydown', handler)
    }
  }, [ensureContext])

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev
      try {
        if (next) {
          window.localStorage.setItem(STORAGE_KEY, 'muted')
        } else {
          window.localStorage.removeItem(STORAGE_KEY)
        }
      } catch (error) {
        // ignore storage errors
      }
      return next
    })
  }, [])

  const play = useCallback(() => {
    if (muted) return
    const ctx = ensureContext()
    if (!ctx) return

    const start = () => {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => undefined)
      }
      const oscillator = ctx.createOscillator()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency

      const gain = ctx.createGain()
      gain.gain.value = 0
      gain.gain.setValueAtTime(0, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration)

      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.start()
      oscillator.stop(ctx.currentTime + duration + 0.04)
    }

    if (ctx.state === 'running' || readyRef.current) {
      start()
    }
  }, [ensureContext, frequency, duration, volume, muted])

  return { play, muted, toggleMute }
}
