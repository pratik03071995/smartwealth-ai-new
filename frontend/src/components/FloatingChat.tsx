import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Chat from './Chat'

const BUBBLE_SIZE = 64
const VIEWPORT_PADDING = 24

export default function FloatingChat() {
  const [isOpen, setIsOpen] = useState(false)
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  }))
  const [position, setPosition] = useState(() => ({
    x:
      typeof window !== 'undefined'
        ? Math.max(window.innerWidth - (BUBBLE_SIZE + VIEWPORT_PADDING), VIEWPORT_PADDING)
        : VIEWPORT_PADDING,
    y:
      typeof window !== 'undefined'
        ? Math.max(window.innerHeight * 0.65, VIEWPORT_PADDING * 5)
        : VIEWPORT_PADDING * 5,
  }))
  const dragOriginRef = useRef({ x: 0, y: 0 })
  const pointerOriginRef = useRef({ x: 0, y: 0 })
  const draggingRef = useRef(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [panelMetrics, setPanelMetrics] = useState({ width: 0, height: 0 })

  const clampPosition = useCallback((x: number, y: number) => {
    if (typeof window === 'undefined') return { x, y }
    const maxX = window.innerWidth - BUBBLE_SIZE - VIEWPORT_PADDING
    const maxY = window.innerHeight - BUBBLE_SIZE - VIEWPORT_PADDING
    return {
      x: Math.min(Math.max(VIEWPORT_PADDING, x), Math.max(VIEWPORT_PADDING, maxX)),
      y: Math.min(Math.max(VIEWPORT_PADDING, y), Math.max(VIEWPORT_PADDING, maxY)),
    }
  }, [])

  useEffect(() => {
    const handleResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
      setPosition((prev) => clampPosition(prev.x, prev.y))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [clampPosition])

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen])

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const dx = event.clientX - pointerOriginRef.current.x
    const dy = event.clientY - pointerOriginRef.current.y
    if (!draggingRef.current && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      draggingRef.current = true
    }
    if (!draggingRef.current) return
    const target = clampPosition(dragOriginRef.current.x + dx, dragOriginRef.current.y + dy)
    setPosition(target)
  }, [clampPosition])

  const handlePointerUp = useCallback(() => {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    if (!draggingRef.current) {
      setIsOpen((value) => !value)
    }
  }, [handlePointerMove])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      draggingRef.current = false
      dragOriginRef.current = position
      pointerOriginRef.current = { x: event.clientX, y: event.clientY }
      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
    },
    [position, handlePointerMove, handlePointerUp],
  )

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    },
    [handlePointerMove, handlePointerUp],
  )

  useEffect(() => {
    if (!isOpen || typeof ResizeObserver === 'undefined') return
    const updateMetrics = () => {
      if (!panelRef.current) return
      const { offsetWidth, offsetHeight } = panelRef.current
      setPanelMetrics((prev) =>
        prev.width === offsetWidth && prev.height === offsetHeight
          ? prev
          : { width: offsetWidth, height: offsetHeight },
      )
    }
    updateMetrics()
    const observer = new ResizeObserver(updateMetrics)
    if (panelRef.current) observer.observe(panelRef.current)
    return () => observer.disconnect()
  }, [isOpen])

  const bubbleStyle = useMemo(
    () => ({
      transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
    }),
    [position.x, position.y],
  )

  const panelSide = useMemo(() => {
    if (typeof window === 'undefined') return 'left'
    return position.x < window.innerWidth / 2 ? 'right' : 'left'
  }, [position.x])

  const panelMotionConfig = useMemo(() => {
    if (panelSide === 'left') {
      return {
        className: 'pointer-events-auto absolute right-full top-0 mr-4',
        initial: { opacity: 0, scale: 0.92, x: '-16px', y: '16px' },
        animate: { opacity: 1, scale: 1, x: '-16px', y: '16px' },
        exit: { opacity: 0, scale: 0.92, x: '-16px', y: '16px' },
        origin: 'top right',
      }
    }
    return {
      className: 'pointer-events-auto absolute left-full top-0 ml-4',
      initial: { opacity: 0, scale: 0.92, x: '16px', y: '16px' },
      animate: { opacity: 1, scale: 1, x: '16px', y: '16px' },
      exit: { opacity: 0, scale: 0.92, x: '16px', y: '16px' },
      origin: 'top left',
    }
  }, [panelSide])

  const panelTop = useMemo(() => {
    const viewportHeight = viewport.height || (typeof window !== 'undefined' ? window.innerHeight : 0)
    const panelHeight = panelMetrics.height || 360
    const bubbleTop = position.y
    const bubbleBottom = position.y + BUBBLE_SIZE
    const spaceBelow = viewportHeight - bubbleBottom - VIEWPORT_PADDING

    let top = bubbleTop
    if (spaceBelow < panelHeight * 0.6) {
      top = bubbleBottom - panelHeight
    }
    top = Math.max(VIEWPORT_PADDING, Math.min(top, viewportHeight - panelHeight - VIEWPORT_PADDING))
    return top
  }, [panelMetrics.height, position.y, viewport.height])

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      <div className="pointer-events-none absolute inset-0">
        <div ref={rootRef} className="pointer-events-auto absolute" style={bubbleStyle}>
          <button
            type="button"
            onPointerDown={handlePointerDown}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setIsOpen((value) => !value)
              }
            }}
            aria-label="Open SmartWealth chat assistant"
            aria-expanded={isOpen}
            aria-haspopup="dialog"
            className="group relative flex h-16 w-16 items-center justify-center rounded-full border border-transparent bg-transparent text-[var(--text)] outline-none transition-transform duration-300 hover:scale-110 focus-visible:ring-2 focus-visible:ring-[var(--brand2)]/50"
            style={{ filter: 'drop-shadow(0 24px 36px rgba(106,93,194,0.28))' }}
          >
            <span className="absolute inset-0 rounded-full bg-gradient-to-br from-white/92 via-[#f3f5ff]/88 to-white/70" />
            <span className="absolute inset-[4px] rounded-full bg-gradient-to-br from-[#ebeefe]/95 via-white to-[#f8f9ff]/92" />
            <span className="absolute inset-[6px] rounded-full bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.7),rgba(255,255,255,0))]" />
            <span className="absolute inset-[6px] rounded-full border border-white/60" />
            <span className="absolute inset-0 rounded-full opacity-0 transition-opacity duration-500 group-hover:opacity-100">
              <span className="absolute inset-0 animate-[pulseGlow_3s_ease-in-out_infinite] rounded-full bg-[conic-gradient(from_0deg,rgba(123,91,251,0.22),rgba(255,255,255,0),rgba(60,196,255,0.22),rgba(255,255,255,0))]" />
            </span>
            <span className="absolute -inset-[6px] rounded-full bg-[radial-gradient(circle,rgba(123,91,251,0.18),rgba(123,91,251,0))] opacity-70 blur-[28px]" />
            <span className="absolute inset-[10px] rounded-full bg-[radial-gradient(circle,rgba(123,91,251,0.18),rgba(123,91,251,0))] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <span className="relative flex h-14 w-14 flex-col items-center justify-center gap-[2px]">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[var(--brand2)] to-[var(--brand1)] text-white shadow-[0_8px_18px_rgba(123,91,251,0.32)] transition-transform duration-300 group-hover:scale-110">
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 3c-3.87 0-7 2.91-7 6.5C5 11.76 6.55 13.76 8.9 14.7L8 20l4-2 4 2-.9-5.3C17.45 13.76 19 11.76 19 9.5 19 5.91 15.87 3 12 3Z"
                    stroke="white"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M9.5 9.75h5" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M9.5 12.25h5" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
                  <circle cx="9" cy="8.5" r="0.75" fill="white" />
                  <circle cx="15" cy="8.5" r="0.75" fill="white" />
                </svg>
              </span>
              <span className="flex flex-col items-center text-[9px] font-semibold uppercase tracking-[0.26em] text-[var(--brand2)]">
                <span className="text-[var(--text)]">Ask</span>
                <span className="text-[var(--muted)]/80">AI Chat</span>
              </span>
            </span>
          </button>

          <AnimatePresence>
            {isOpen ? (
              <motion.div
                key="chat-panel"
                initial={panelMotionConfig.initial}
                animate={panelMotionConfig.animate}
                exit={panelMotionConfig.exit}
                transition={{ type: 'spring', damping: 22, stiffness: 220 }}
                className={panelMotionConfig.className}
                style={{ transformOrigin: panelMotionConfig.origin, top: panelTop }}
              >
                <div ref={panelRef} className="relative w-[min(380px,85vw)]">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    aria-label="Close chat"
                    className="absolute right-4 top-[-18px] z-40 flex h-7 w-7 items-center justify-center rounded-full border border-white/45 bg-white/70 text-[var(--muted)] shadow-[0_10px_26px_rgba(15,17,35,0.25)] backdrop-blur transition hover:scale-110"
                  >
                    <span aria-hidden className="text-[14px] leading-none">×</span>
                  </button>
                  <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)]/96 shadow-[0_30px_60px_rgba(17,21,41,0.28)]">
                    <Chat variant="embedded" className="max-w-none" />
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
