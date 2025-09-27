import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { apiBase } from '../../services/api'

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
}

export type UserMsg = { role: 'user'; text: string }
export type Msg = AssistantMsg | UserMsg

export const isAssistant = (msg: Msg): msg is AssistantMsg => msg.role === 'assistant'

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
  pendingLatencyMs: number
  systemStatus: SystemStatus
  healthSnapshot: HealthSnapshot | null
  isHealthRefreshing: boolean
  refreshHealth: (options?: RefreshOptions) => Promise<SystemStatus>
  sendMessage: (text: string) => Promise<void>
  clearConversation: () => void
  updateMessages: React.Dispatch<React.SetStateAction<Msg[]>>
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
  const [messages, setMessages] = useState<Msg[]>([INITIAL_ASSISTANT])
  const [isLoading, setIsLoading] = useState(false)
  const [pendingLatencyMs, setPendingLatencyMs] = useState(0)
  const [systemStatus, setSystemStatus] = useState<SystemStatus>('checking')
  const [healthSnapshot, setHealthSnapshot] = useState<HealthSnapshot | null>(null)
  const [isHealthRefreshing, setIsHealthRefreshing] = useState(false)

  const pendingTimerRef = useRef<number | null>(null)
  const pendingStartRef = useRef<number | null>(null)
  const sendGuardRef = useRef(false)

  const clearPendingTimer = useCallback(() => {
    if (pendingTimerRef.current) {
      window.clearInterval(pendingTimerRef.current)
      pendingTimerRef.current = null
    }
    pendingStartRef.current = null
    setPendingLatencyMs(0)
  }, [])

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

        setIsLoading(true)
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

        const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()

        const response = await fetch(`${API_BASE}/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({ message: text }),
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
            } else if (payload.type === 'result') {
              const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
              const latencyMs = Math.max(0, endedAt - startedAt)
              const data = payload.data ?? {}
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
            } else if (payload.type === 'end') {
              finished = true
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
        sendGuardRef.current = false
      }
    },
    [ensurePreparationNotice, refreshHealth],
  )

  const clearConversation = useCallback(() => {
    setMessages([INITIAL_ASSISTANT])
  }, [])

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
      pendingLatencyMs,
      systemStatus,
      healthSnapshot,
      isHealthRefreshing,
      refreshHealth,
      sendMessage,
      clearConversation,
      updateMessages: setMessages,
    }),
    [
      messages,
      isLoading,
      pendingLatencyMs,
      systemStatus,
      healthSnapshot,
      isHealthRefreshing,
      refreshHealth,
      sendMessage,
      clearConversation,
    ],
  )

  return <ChatSessionContext.Provider value={value}>{children}</ChatSessionContext.Provider>
}

export async function submitFeedbackAPI(payload: Record<string, unknown>) {
  await axios.post(`${API_BASE}/chat/feedback`, payload)
}

export { INITIAL_ASSISTANT }
