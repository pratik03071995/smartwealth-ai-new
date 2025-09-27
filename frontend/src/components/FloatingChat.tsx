import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Chat from './Chat'

const BUBBLE_SIZE = 64
export default function FloatingChat() {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState(() => ({
    x:
      typeof window !== 'undefined'
        ? Math.max(window.innerWidth - (BUBBLE_SIZE + 24), 24)
        : 24,
    y: typeof window !== 'undefined' ? Math.max(window.innerHeight * 0.65, 120) : 240,
  }))
  const dragOriginRef = useRef({ x: 0, y: 0 })
  const pointerOriginRef = useRef({ x: 0, y: 0 })
  const draggingRef = useRef(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const clampPosition = useCallback((x: number, y: number) => {
    if (typeof window === 'undefined') return { x, y }
    const maxX = window.innerWidth - BUBBLE_SIZE - 24
    const maxY = window.innerHeight - BUBBLE_SIZE - 24
    return {
      x: Math.min(Math.max(24, x), Math.max(24, maxX)),
      y: Math.min(Math.max(24, y), Math.max(24, maxY)),
    }
  }, [])

  useEffect(() => {
    const handleResize = () => {
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
    if (!isOpen) return
    const handleClick = (event: MouseEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
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
            className="relative flex h-16 w-16 items-center justify-center rounded-full border border-[var(--border)]/60 bg-[var(--panel)] text-[var(--text)] shadow-[0_18px_42px_rgba(25,32,61,0.28)] backdrop-blur transition hover:scale-105"
          >
            <span className="absolute inset-0 rounded-full bg-gradient-to-br from-[var(--brand2)]/20 via-[var(--panel)] to-[var(--brand1)]/20" />
            <span className="relative flex flex-col items-center text-[10px] font-semibold uppercase tracking-[0.3em]">
              <span className="text-[var(--brand2)]">AI</span>
              <span className="text-[var(--muted)]">Chat</span>
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
                style={{ transformOrigin: panelMotionConfig.origin }}
              >
                <div className="relative w-[min(380px,85vw)]">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    aria-label="Close chat"
                    className="absolute right-3 top-3 z-10 rounded-full border border-[var(--border)]/70 bg-[var(--panel)]/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)] transition hover:text-[var(--text)]"
                  >
                    Close
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
