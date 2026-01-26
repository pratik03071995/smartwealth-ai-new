import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { apiBase } from '../../services/api'
import { useAuth } from '../../auth/AuthProvider'

const API_BASE = apiBase

export type TableColumn = { key: string; label: string }
export type TablePayload = { columns: TableColumn[]; rows: Record<string, unknown>[] }
export type ChartFormat = 'currency' | 'number' | 'percent'
export type ChartDatum = { label: string; value: number; key?: string }
export type ScatterDatum = { label: string; x: number; y: number; size?: number }
export type ChartPayload =
  | { type: 'bar'; title: string; metric?: string; format?: ChartFormat; data: ChartDatum[] }
  | {
      type: 'scatter'
      title: string
      xKey: string
      yKey: string
      format?: { x?: ChartFormat; y?: ChartFormat; size?: ChartFormat }
      data: ScatterDatum[]
      sizeKey?: string
    }
  | {
      type: 'line'
      title: string
      xKey: 't'
      yKey: 'close'
      format?: { y?: ChartFormat }
      series: { name: string; points: { t: string; close: number }[] }[]
      window?: string
      availableWindows?: string[]
      symbol?: string
      comparison?: {
        baseInvestment?: number
        symbols?: string[]
        window?: string
        summary?: { symbol: string; finalInvestment?: number; returnPct?: number; absoluteReturn?: number }[]
      }
    }

export type SystemStatus = 'checking' | 'ready' | 'degraded' | 'unavailable'

export type HealthCheckEntry = {
  status?: string
  summary?: string
  detail?: string
  checkedAt?: string
  latencyMs?: number
}

export type HealthSnapshot = {
  status?: string
  updatedAt?: string
  expiresAt?: string
  cacheTtlSeconds?: number
  suggestedRefreshSeconds?: number
  checks?: Record<string, HealthCheckEntry>
}

export type AssistantMsg = {
  role: 'assistant'
  id?: string
  text: string
  table?: TablePayload
  chart?: ChartPayload | null
  sql?: string | null
  latencyMs?: number
  prompt?: string
  feedback?: 'up' | 'down' | null
  plan?: Record<string, unknown> | null
  followups?: string[] | null
  tablePreview?: Record<string, unknown>[] | null
  sourceLabel?: string | null
  dataSource?: string | null
  llmSource?: string | null
  llmSourceRaw?: string | null
  searchProvider?: string | null
  comparison?: Record<string, unknown> | null
}

export type UserMsg = { role: 'user'; text: string }
export type Msg = AssistantMsg | UserMsg

export const isAssistant = (msg: Msg): msg is AssistantMsg => msg.role === 'assistant'

export type ChatSessionSummary = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  lastUsedAt: string
  firstPrompt?: string | null
  lastPrompt?: string | null
}

const INITIAL_ASSISTANT: AssistantMsg = {
  role: 'assistant',
  text: 'Hi! Ask me about company fundamentals, earnings, scores, or vendor relationships. Try “Where is Meta headquartered?” or “Who are Nvidia’s customers?”.',
  id: 'welcome',
  feedback: null,
  plan: null,
  followups: null,
}

function createMessageId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try {
      return crypto.randomUUID()
    } catch (error) {
      console.warn('Failed to generate random UUID, falling back to timestamp id.', error)
    }
  }
  return `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

type RefreshOptions = { force?: boolean; silent?: boolean }

type ChatSessionValue = {
  messages: Msg[]
  isLoading: boolean
  isStreaming: boolean
  pendingLatencyMs: number
  statusLines: string[]
  systemStatus: SystemStatus
  healthSnapshot: HealthSnapshot | null
  isHealthRefreshing: boolean
  refreshHealth: (options?: RefreshOptions) => Promise<SystemStatus>
  sendMessage: (text: string) => Promise<void>
  clearConversation: () => void
  updateMessages: React.Dispatch<React.SetStateAction<Msg[]>>
  lastChart: ChartPayload | null
  sessions: ChatSessionSummary[]
  activeSessionId: string | null
  startNewSession: () => Promise<string | null>
  openSession: (id: string) => Promise<void>
  refreshSessions: () => Promise<number>
  deleteSession: (id: string) => Promise<boolean>
}

const ChatSessionContext = createContext<ChatSessionValue | undefined>(undefined)

export function useChatSession() {
  const value = useContext(ChatSessionContext)
  if (!value) {
    throw new Error('useChatSession must be used within ChatSessionProvider')
  }
  return value
}

export function ChatSessionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<Msg[]>([INITIAL_ASSISTANT])
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [pendingLatencyMs, setPendingLatencyMs] = useState(0)
  const [statusLines, setStatusLines] = useState<string[]>([])
  const [lastChart, setLastChart] = useState<ChartPayload | null>(null)
  const [systemStatus, setSystemStatus] = useState<SystemStatus>('checking')
  const [healthSnapshot, setHealthSnapshot] = useState<HealthSnapshot | null>(null)
  const [isHealthRefreshing, setIsHealthRefreshing] = useState(false)
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sessionMessages, setSessionMessages] = useState<Record<string, Msg[]>>({})

  const pendingTimerRef = useRef<number | null>(null)
  const pendingStartRef = useRef<number | null>(null)
  const sendGuardRef = useRef(false)
  const sessionMessagesRef = useRef<Record<string, Msg[]>>({})
  const sessionsRef = useRef<ChatSessionSummary[]>([])

  const orderSessions = useCallback((entries: ChatSessionSummary[]) => {
    return [...entries].sort((a, b) => {
      const tsA = Date.parse(a.lastUsedAt || a.updatedAt || a.createdAt || '') || 0
      const tsB = Date.parse(b.lastUsedAt || b.updatedAt || b.createdAt || '') || 0
      return tsB - tsA
    })
  }, [])

  const clearPendingTimer = useCallback(() => {
    if (pendingTimerRef.current) {
      window.clearInterval(pendingTimerRef.current)
      pendingTimerRef.current = null
    }
    pendingStartRef.current = null
    setPendingLatencyMs(0)
  }, [])

  useEffect(() => {
    sessionMessagesRef.current = sessionMessages
  }, [sessionMessages])

  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  useEffect(() => {
    if (user) return
    setSessions([])
    setActiveSessionId(null)
    setSessionMessages({})
    sessionMessagesRef.current = {}
    sessionsRef.current = []
    setMessages([INITIAL_ASSISTANT])
    setLastChart(null)
    setStatusLines([])
    sendGuardRef.current = false
  }, [user])

  useEffect(() => {
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
    if (isLoading) {
      pendingStartRef.current = now()
      if (pendingTimerRef.current) window.clearInterval(pendingTimerRef.current)
      pendingTimerRef.current = window.setInterval(() => {
        if (pendingStartRef.current) {
          setPendingLatencyMs(now() - pendingStartRef.current)
        }
      }, 120)
      return () => clearPendingTimer()
    }

    clearPendingTimer()
    return () => clearPendingTimer()
  }, [isLoading, clearPendingTimer])

  useEffect(() => {
    if (!activeSessionId) return
    setSessionMessages((prev) => {
      const current = prev[activeSessionId]
      if (current === messages) return prev
      return { ...prev, [activeSessionId]: messages }
    })
  }, [messages, activeSessionId])

  const refreshHealth = useCallback(
    async (options: RefreshOptions = {}): Promise<SystemStatus> => {
      const { force = false, silent = false } = options
      if (!silent) {
        setIsHealthRefreshing(true)
        setSystemStatus('checking')
      }

      try {
        const query = force ? '?refresh=1' : ''
        const response = await fetch(`${API_BASE}/health${query}`, {
          headers: { Accept: 'application/json' },
          credentials: 'include',
        })
        if (!response.ok) {
          throw new Error(`Health check failed (${response.status})`)
        }

        const data: HealthSnapshot = await response.json()
        setHealthSnapshot(data)

        const normalized = String(data.status || '').toLowerCase()
        const nextStatus: SystemStatus =
          normalized === 'ready' || normalized === 'ok'
            ? 'ready'
            : normalized === 'degraded'
              ? 'degraded'
              : 'unavailable'

        setSystemStatus(nextStatus)
        if (nextStatus === 'ready') {
          setMessages((prev) => prev.filter((entry) => !(isAssistant(entry) && entry.id === 'setup_pending')))
        }
        return nextStatus
      } catch (err) {
        console.error('Health check failed', err)
        setHealthSnapshot(null)
        setSystemStatus('unavailable')
        return 'unavailable'
      } finally {
        if (!options.silent) {
          setIsHealthRefreshing(false)
        }
      }
    },
    [],
  )

  const ensurePreparationNotice = useCallback(() => {
    setMessages((prev) => {
      const hasNotice = prev.some((entry) => isAssistant(entry) && entry.id === 'setup_pending')
      if (hasNotice) return prev
      const notice: AssistantMsg = {
        role: 'assistant',
        id: 'setup_pending',
        text: 'System setup is still running. Please try again once the status badge shows Ready.',
        feedback: null,
        plan: null,
        followups: null,
        chart: null,
        table: undefined,
        tablePreview: null,
        sql: null,
        latencyMs: undefined,
        sourceLabel: null,
        dataSource: null,
        llmSource: null,
        llmSourceRaw: null,
        searchProvider: null,
      }
      return [...prev, notice]
    })
  }, [])

  const startNewSession = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch(`${API_BASE}/chat/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      if (!response.ok) {
        throw new Error(`Failed to create chat session (${response.status})`)
      }
      const data = await response.json()
      const record = (data?.session || null) as ChatSessionSummary | null
      if (!record) {
        throw new Error('Invalid session payload')
      }
      setSessions((prev) => orderSessions([record, ...prev.filter((item) => item.id !== record.id)]))
      setActiveSessionId(record.id)
      setSessionMessages((prev) => ({ ...prev, [record.id]: [INITIAL_ASSISTANT] }))
      setMessages([INITIAL_ASSISTANT])
      setLastChart(null)
      setStatusLines([])
      return record.id
    } catch (error) {
      console.error('Failed to start new session', error)
      setMessages([INITIAL_ASSISTANT])
      setLastChart(null)
      setStatusLines([])
      return null
    }
  }, [orderSessions])

  const refreshSessions = useCallback(async (): Promise<number> => {
    try {
      const response = await fetch(`${API_BASE}/chat/sessions`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      })
      if (!response.ok) {
        throw new Error(`Failed to load sessions (${response.status})`)
      }
      const payload = await response.json()
      if (!payload?.ok || !Array.isArray(payload.sessions)) {
        setSessions([])
        setActiveSessionId(null)
        return 0
      }
      const list = orderSessions(payload.sessions as ChatSessionSummary[])
      setSessions(list)
      if (!list.length) {
        setActiveSessionId(null)
        return 0
      }
      const preferred = activeSessionId && list.some((entry) => entry.id === activeSessionId) ? activeSessionId : list[0].id
      setActiveSessionId(preferred)
      if (preferred && !sessionMessagesRef.current[preferred]) {
        setSessionMessages((prev) => ({ ...prev, [preferred]: prev[preferred] ?? [INITIAL_ASSISTANT] }))
      }
      return list.length
    } catch (error) {
      console.error('Failed to refresh sessions', error)
      return sessionsRef.current.length
    }
  }, [activeSessionId, orderSessions])

  const deleteSession = useCallback(
    async (sessionId: string): Promise<boolean> => {
      if (!sessionId) return false

      setSessions((prev) => prev.filter((entry) => entry.id !== sessionId))
      setSessionMessages((prev) => {
        const next = { ...prev }
        delete next[sessionId]
        return next
      })
      delete sessionMessagesRef.current[sessionId]

      if (activeSessionId === sessionId) {
        setActiveSessionId(null)
        setMessages([INITIAL_ASSISTANT])
        setLastChart(null)
        setStatusLines([])
      }

      try {
        const response = await fetch(`${API_BASE}/chat/sessions/${sessionId}`, {
          method: 'DELETE',
          credentials: 'include',
        })
        if (!response.ok) {
          throw new Error(`Failed to delete chat session (${response.status})`)
        }
        return true
      } catch (error) {
        console.error('Failed to delete session', error)
        await refreshSessions()
        return false
      }
    },
    [activeSessionId, refreshSessions],
  )

  const fetchSessionMessages = useCallback(async (sessionId: string): Promise<Msg[]> => {
    try {
      const response = await fetch(`${API_BASE}/chat/sessions/${sessionId}/messages`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      })
      if (!response.ok) {
        throw new Error(`Failed to load session messages (${response.status})`)
      }
      const payload = await response.json()
      if (!payload?.ok || !Array.isArray(payload.messages)) {
        return [INITIAL_ASSISTANT]
      }
      const converted: Msg[] = []
      for (const raw of payload.messages as any[]) {
        const text = typeof raw?.text === 'string' ? raw.text : ''
        if (!text) continue
        const role = typeof raw?.role === 'string' ? raw.role.toLowerCase() : 'user'
        if (role === 'assistant') {
          converted.push({
            role: 'assistant',
            id: createMessageId(),
            text,
            table: undefined,
            chart: null,
            sql: null,
            latencyMs: undefined,
            feedback: null,
            plan: null,
            followups: null,
            tablePreview: null,
            prompt: undefined,
            sourceLabel: null,
            dataSource: null,
            llmSource: null,
            llmSourceRaw: null,
            searchProvider: null,
          })
        } else {
          converted.push({ role: 'user', text })
        }
      }
      return [INITIAL_ASSISTANT, ...converted]
    } catch (error) {
      console.error('Failed to load session messages', error)
      return [INITIAL_ASSISTANT]
    }
  }, [])

  useEffect(() => {
    if (!activeSessionId) return
    let cancelled = false
    const loadHistory = async () => {
      const existing = sessionMessagesRef.current[activeSessionId]
      if (existing) {
        setMessages(existing)
        setLastChart(null)
        setStatusLines([])
        return
      }
      const history = await fetchSessionMessages(activeSessionId)
      if (cancelled) return
      setSessionMessages((prev) => ({ ...prev, [activeSessionId]: history }))
      setMessages(history)
      setLastChart(null)
      setStatusLines([])
    }
    loadHistory()
    return () => {
      cancelled = true
    }
  }, [activeSessionId, fetchSessionMessages])

  const openSession = useCallback(
    async (sessionId: string) => {
      if (!sessionId) return
      setActiveSessionId(sessionId)
      setSessions((prev) => {
        const match = prev.find((entry) => entry.id === sessionId)
        if (!match) return prev
        const nowIso = new Date().toISOString()
        const updated: ChatSessionSummary = { ...match, lastUsedAt: nowIso, updatedAt: nowIso }
        return orderSessions([updated, ...prev.filter((entry) => entry.id !== sessionId)])
      })
      let history = sessionMessagesRef.current[sessionId]
      if (!history) {
        history = await fetchSessionMessages(sessionId)
        setSessionMessages((prev) => ({ ...prev, [sessionId]: history }))
      }
      setMessages(history)
      setLastChart(null)
      setStatusLines([])
      try {
        await fetch(`${API_BASE}/chat/sessions/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lastUsedAt: new Date().toISOString() }),
          credentials: 'include',
        })
      } catch (error) {
        console.debug('Failed to touch session timestamp', error)
      }
    },
    [orderSessions, fetchSessionMessages],
  )

  const sendMessage = useCallback(
    async (rawText: string) => {
      const text = rawText.trim()
      if (!text || sendGuardRef.current) return

      sendGuardRef.current = true
      let assistantId: string | null = null
      try {
        const status = await refreshHealth({ force: true })
        if (status === 'unavailable') {
          ensurePreparationNotice()
          return
        }

        let sessionId = activeSessionId
        if (!sessionId) {
          sessionId = await startNewSession()
          if (!sessionId) {
            return
          }
        }

        setIsLoading(true)
        setIsStreaming(true)
        assistantId = createMessageId()
        const placeholder: AssistantMsg = {
          role: 'assistant',
          text: '',
          id: assistantId,
          feedback: null,
          plan: null,
          followups: null,
          table: undefined,
          chart: null,
          tablePreview: null,
          sql: null,
          latencyMs: undefined,
          prompt: text,
          sourceLabel: null,
          dataSource: null,
          llmSource: null,
          llmSourceRaw: null,
          searchProvider: null,
        }

        setMessages((prev) => [...prev, { role: 'user', text }, placeholder])
        setSessions((prev) => {
          const existing = prev.find((entry) => entry.id === sessionId)
          if (!existing) return prev
          const nowIso = new Date().toISOString()
          const updated: ChatSessionSummary = { ...existing, lastUsedAt: nowIso, updatedAt: nowIso }
          return orderSessions([updated, ...prev.filter((entry) => entry.id !== sessionId)])
        })

        const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()

        const response = await fetch(`${API_BASE}/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({ message: text, sessionId }),
          credentials: 'include',
        })

        if (!response.ok || !response.body) {
          throw new Error(`Streaming request failed (${response.status})`)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let streamingText = ''
        let finished = false
        let currentAssistantId = assistantId
        const appendDelta = (delta: string) => {
          streamingText += delta
          setMessages((prev) =>
            prev.map((entry) =>
              isAssistant(entry) && entry.id === currentAssistantId
                ? { ...entry, text: streamingText }
                : entry,
            ),
          )
        }

        while (!finished) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          let boundary = buffer.indexOf('\n\n')
          while (boundary !== -1) {
            const rawEvent = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)
            boundary = buffer.indexOf('\n\n')

            const lines = rawEvent.split('\n')
            const dataLine = lines.find((line) => line.startsWith('data:'))
            if (!dataLine) continue
            const jsonPayload = dataLine.slice(5).trim()
            if (!jsonPayload) continue

            let payload: any
            try {
              payload = JSON.parse(jsonPayload)
            } catch (parseErr) {
              console.warn('Failed to parse SSE payload', parseErr)
              continue
            }

            if (payload.type === 'delta' && typeof payload.delta === 'string') {
              appendDelta(payload.delta)
            } else if (payload.type === 'status' && typeof payload.message === 'string') {
              // Append a compact status line (keep last 5)
              setStatusLines((prev) => {
                const next = [...prev, payload.message]
                return next.slice(-5)
              })
            } else if (payload.type === 'result') {
              const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
              const latencyMs = Math.max(0, endedAt - startedAt)
              const data = payload.data ?? {}
              try {
                if (data && data.chart) {
                  ;(window as any).__SW_LAST_CHART__ = data.chart
                }
              } catch {}
              currentAssistantId = (data.messageId as string) || currentAssistantId
              const sourceLabel = (data.sourceLabel as string | undefined) ?? null
              const dataSource = (data.data_source as string | undefined) ?? null
              const llmSource = (data.llmSource as string | undefined) ?? null
              const llmSourceRaw = (data.llmSourceRaw as string | undefined) ?? null
              const searchProvider = (data.search_provider as string | undefined) ?? null
              const finalText =
                typeof data.reply === 'string' && data.reply.length
                  ? data.reply
                  : streamingText || 'I could not craft a response for that.'

              const sessionTitle = typeof data.sessionTitle === 'string' ? data.sessionTitle.trim() : null
              const sessionPayloadId = (data.sessionId as string | undefined) || sessionId
              const sessionLastUsedAt = typeof data.sessionLastUsedAt === 'string' ? data.sessionLastUsedAt : new Date().toISOString()
              if (sessionPayloadId) {
                setSessions((prev) => {
                  const others = prev.filter((entry) => entry.id !== sessionPayloadId)
                  const existing = prev.find((entry) => entry.id === sessionPayloadId)
                  const base: ChatSessionSummary = existing ?? {
                    id: sessionPayloadId,
                    title: sessionTitle || 'New chat',
                    createdAt: sessionLastUsedAt,
                    updatedAt: sessionLastUsedAt,
                    lastUsedAt: sessionLastUsedAt,
                    firstPrompt: text,
                    lastPrompt: text,
                  }
                  const merged: ChatSessionSummary = {
                    ...base,
                    title: sessionTitle && sessionTitle.length ? sessionTitle : base.title,
                    lastPrompt: text,
                    lastUsedAt: sessionLastUsedAt,
                    updatedAt: sessionLastUsedAt,
                  }
                  return orderSessions([merged, ...others])
                })
                setActiveSessionId(sessionPayloadId)
              }

              setMessages((prev) =>
                prev.map((entry) =>
                  isAssistant(entry) && entry.id === assistantId
                    ? {
                        ...entry,
                        id: currentAssistantId,
                        text: finalText,
                        table: data.table,
                        chart: data.chart,
                        sql: data.sql,
                        latencyMs,
                        plan: data.plan ?? null,
                        followups: (data.followups as string[] | undefined) ?? null,
                        tablePreview: (data.tablePreview as Record<string, unknown>[] | undefined) ?? null,
                        sourceLabel,
                        dataSource,
                        llmSource,
                        llmSourceRaw,
                        searchProvider,
                      }
                    : entry,
                ),
              )
              setLastChart((data.chart as ChartPayload | undefined) ?? null)
              // Clear transient status lines after result
              setStatusLines([])
            } else if (payload.type === 'error') {
              setMessages((prev) =>
                prev.map((entry) =>
                  isAssistant(entry) && entry.id === assistantId
                    ? {
                        ...entry,
                        text: payload.error || 'Error reaching API.',
                      }
                    : entry,
                ),
              )
              setStatusLines([])
            } else if (payload.type === 'end') {
              finished = true
              setStatusLines([])
              break
            }
          }
        }
      } catch (err) {
        console.error('Streaming chat failed', err)
        setMessages((prev) =>
          prev.map((entry) =>
            isAssistant(entry) && entry.id && entry.id === assistantId
              ? { ...entry, text: 'Error reaching API.' }
              : entry,
          ),
        )
      } finally {
        setIsLoading(false)
        setIsStreaming(false)
      sendGuardRef.current = false
      }
    },
    [
      activeSessionId,
      ensurePreparationNotice,
      refreshHealth,
      orderSessions,
      startNewSession,
    ],
  )

  const clearConversation = useCallback(() => {
    if (activeSessionId) {
      const initial = [INITIAL_ASSISTANT]
      setMessages(initial)
      setSessionMessages((prev) => ({ ...prev, [activeSessionId]: initial }))
    } else {
      setMessages([INITIAL_ASSISTANT])
    }
    setLastChart(null)
    setStatusLines([])
  }, [activeSessionId])

  useEffect(() => {
    let mounted = true
    const init = async () => {
      const count = await refreshSessions()
      if (!mounted) return
      if (count === 0) {
        await startNewSession()
      }
    }
    init()
    return () => {
      mounted = false
    }
  }, [refreshSessions, startNewSession])

  useEffect(() => {
    refreshHealth({ force: true })
  }, [refreshHealth])

  useEffect(() => {
    const handleFocus = () => refreshHealth({ force: true, silent: true })
    const handleVisibility = () => {
      if (!document.hidden) {
        refreshHealth({ force: true, silent: true })
      }
    }
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [refreshHealth])

  useEffect(() => {
    const seconds = healthSnapshot?.suggestedRefreshSeconds
    if (!seconds) return
    const interval = window.setInterval(() => {
      if (!isHealthRefreshing) {
        refreshHealth({ force: true, silent: true })
      }
    }, Math.max(seconds, 15) * 1000)
    return () => window.clearInterval(interval)
  }, [healthSnapshot?.suggestedRefreshSeconds, isHealthRefreshing, refreshHealth])

  const value = useMemo<ChatSessionValue>(
    () => ({
      messages,
      isLoading,
      isStreaming,
      pendingLatencyMs,
      statusLines,
      systemStatus,
      healthSnapshot,
      isHealthRefreshing,
      refreshHealth,
      sendMessage,
      clearConversation,
      updateMessages: setMessages,
      lastChart,
      sessions,
      activeSessionId,
      startNewSession,
      openSession,
      refreshSessions,
      deleteSession,
    }),
    [
      messages,
      isLoading,
      isStreaming,
      pendingLatencyMs,
      statusLines,
      systemStatus,
      healthSnapshot,
      isHealthRefreshing,
      refreshHealth,
      sendMessage,
      clearConversation,
      lastChart,
      sessions,
      activeSessionId,
      startNewSession,
      openSession,
      refreshSessions,
      deleteSession,
    ],
  )

  return <ChatSessionContext.Provider value={value}>{children}</ChatSessionContext.Provider>
}

export async function submitFeedbackAPI(payload: Record<string, unknown>) {
  await axios.post(`${API_BASE}/chat/feedback`, payload)
}

export { INITIAL_ASSISTANT }
