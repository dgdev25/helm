import { useState, useRef, useEffect, useCallback } from 'react'
import { useStore } from '../store.js'

export default function ChatPanel() {
  const chatProject = useStore(s => s.chatProject)
  const closeChat = useStore(s => s.closeChat)
  const projects = useStore(s => s.projects)

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const abortRef = useRef(null)

  // Reset messages when project changes
  useEffect(() => {
    setMessages([])
    setInput('')
    if (chatProject) setTimeout(() => inputRef.current?.focus(), 100)
  }, [chatProject?.slug])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Escape to close
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') closeChat() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeChat])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')

    const next = [...messages, { role: 'user', content: text, id: `u-${Date.now()}` }]
    setMessages([...next, { role: 'assistant', content: '', streaming: true, id: `a-${Date.now()}` }])
    setStreaming(true)

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const res = await fetch(`/api/projects/${chatProject.slug}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
        signal: ctrl.signal,
      })

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() // incomplete chunk stays in buffer
        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data: ')) continue
            const payload = line.slice(6)
            if (payload === '[DONE]') break
            try {
              const { text, error } = JSON.parse(payload)
              if (error) { accumulated += `\n\n_Error: ${error}_`; break }
              if (text) accumulated += text
            } catch {}
          }
          setMessages(m => {
            const copy = [...m]
            copy[copy.length - 1] = { role: 'assistant', content: accumulated, streaming: true }
            return copy
          })
        }
      }

      setMessages(m => {
        const copy = [...m]
        copy[copy.length - 1] = { role: 'assistant', content: accumulated || '_(no response)_', streaming: false }
        return copy
      })
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages(m => {
          const copy = [...m]
          copy[copy.length - 1] = { role: 'assistant', content: `_Error: ${err.message}_`, streaming: false }
          return copy
        })
      }
    } finally {
      setStreaming(false)
    }
  }, [input, messages, streaming, chatProject?.slug])

  const stop = () => {
    abortRef.current?.abort()
    setStreaming(false)
    setMessages(m => {
      const copy = [...m]
      if (copy[copy.length - 1]?.streaming) copy[copy.length - 1] = { ...copy[copy.length - 1], streaming: false }
      return copy
    })
  }

  if (!chatProject) return null

  const project = projects.find(p => p.slug === chatProject.slug)

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={closeChat}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
          zIndex: 49, backdropFilter: 'blur(2px)',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 480,
        background: 'var(--bg)', borderLeft: '1px solid var(--surface-border)',
        zIndex: 50, display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.4)',
      }}>

        {/* Header */}
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid var(--surface-border)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600 }}>✦</span>
              <span style={{ fontSize: '0.88rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {chatProject.name}
              </span>
            </div>
            {project?.description && (
              <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {project.description}
              </p>
            )}
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              title="Clear conversation"
              style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.72rem', padding: '3px 8px', borderRadius: 6, flexShrink: 0 }}
              onMouseEnter={e => e.target.style.color = 'var(--text-muted)'}
              onMouseLeave={e => e.target.style.color = 'var(--text-dim)'}
            >
              clear
            </button>
          )}
          <button
            onClick={closeChat}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, padding: '2px 4px', flexShrink: 0 }}
          >
            ×
          </button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', marginTop: 40 }}>
              <div style={{ fontSize: '1.6rem', marginBottom: 12 }}>✦</div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Ask anything about <strong style={{ color: 'var(--text)' }}>{chatProject.name}</strong>
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 20 }}>
                {[
                  'What does this project do?',
                  'What\'s currently in progress?',
                  'What should I work on next?',
                  'Explain the architecture',
                ].map(q => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); inputRef.current?.focus() }}
                    style={{
                      background: 'var(--surface)', border: '1px solid var(--surface-border)',
                      borderRadius: 8, padding: '6px 12px', fontSize: '0.72rem',
                      color: 'var(--text-muted)', cursor: 'pointer', textAlign: 'left',
                      transition: 'var(--fast)',
                    }}
                    onMouseEnter={e => { e.target.style.borderColor = 'rgba(34,153,113,0.3)'; e.target.style.color = 'var(--text)' }}
                    onMouseLeave={e => { e.target.style.borderColor = 'var(--surface-border)'; e.target.style.color = 'var(--text-muted)' }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={msg.id || i} style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '88%',
                background: msg.role === 'user' ? 'var(--primary-glow)' : 'var(--surface)',
                border: `1px solid ${msg.role === 'user' ? 'rgba(34,153,113,0.3)' : 'var(--surface-border)'}`,
                borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                padding: '8px 12px',
                fontSize: '0.78rem',
                lineHeight: 1.65,
                color: msg.role === 'user' ? 'var(--primary)' : 'var(--text)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {msg.content}
                {msg.streaming && <span style={{ opacity: 0.5, animation: 'pulse 1s infinite' }}>▋</span>}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--surface-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
              }}
              placeholder="Ask about this project… (Enter to send, Shift+Enter for newline)"
              rows={1}
              style={{
                flex: 1, background: 'var(--surface)', border: '1px solid var(--surface-border)',
                borderRadius: 10, padding: '9px 12px', fontSize: '0.78rem',
                color: 'var(--text)', outline: 'none', resize: 'none',
                fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1.5,
                maxHeight: 120, overflowY: 'auto',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(34,153,113,0.4)'}
              onBlur={e => e.target.style.borderColor = 'var(--surface-border)'}
              onInput={e => {
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
              disabled={streaming}
            />
            {streaming ? (
              <button
                onClick={stop}
                style={{
                  flexShrink: 0, background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251,146,60,0.3)',
                  borderRadius: 10, padding: '9px 14px', fontSize: '0.78rem',
                  color: '#fb923c', cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                ■ Stop
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!input.trim()}
                style={{
                  flexShrink: 0, background: input.trim() ? 'var(--gradient-btn)' : 'var(--surface)',
                  border: `1px solid ${input.trim() ? 'rgba(34,153,113,0.3)' : 'var(--surface-border)'}`,
                  borderRadius: 10, padding: '9px 14px', fontSize: '0.78rem',
                  color: input.trim() ? '#fff' : 'var(--text-dim)', cursor: input.trim() ? 'pointer' : 'default',
                  fontFamily: "'Space Grotesk', sans-serif", transition: 'var(--fast)',
                }}
              >
                Send
              </button>
            )}
          </div>
          <p style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginTop: 6 }}>
            Context: primer state + README · Esc to close
          </p>
        </div>
      </div>
    </>
  )
}
