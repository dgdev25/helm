// src/store.js
import { create } from 'zustand'

let descriptionsPollInterval = null

const api = async (path, opts = {}) => {
  const headers = opts.body ? { 'Content-Type': 'application/json' } : {}
  const res = await fetch(path, { headers, ...opts })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Request failed')
  return json.data
}

export const useStore = create((set, get) => ({
  projects: [],
  loading: false,
  error: null,
  filters: { search: '', status: '', language: '', topic: '' },
  appName: localStorage.getItem('ds-app-name') || 'Helm',
  setAppName: (name) => {
    localStorage.setItem('ds-app-name', name)
    document.title = `${name} — Project Dashboard`
    set({ appName: name })
  },

  // bulkPrimer: null | { done, total, current, items: [{name,slug,status}] }
  bulkPrimer: null,

  // chat panel
  chatProject: null, // { slug, name }
  openChat: (project) => set({ chatProject: { slug: project.slug, name: project.name } }),
  closeChat: () => set({ chatProject: null }),

  setFilter: (key, value) => {
    const updated = { ...get().filters, [key]: value }
    set({ filters: updated })
    get().fetchProjects(updated)
  },

  setFilters: (partial) => {
    const updated = { ...get().filters, ...partial }
    set({ filters: updated })
    get().fetchProjects(updated)
  },

  fetchProjects: async (params = {}) => {
    set({ loading: true, error: null })
    try {
      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v))
      ).toString()
      const projects = await api(`/api/projects${qs ? '?' + qs : ''}`)
      set({ projects, loading: false })
    } catch (err) {
      set({ error: err.message, loading: false })
    }
  },

  patchProject: async (slug, updates) => {
    const updated = await api(`/api/projects/${slug}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    })
    set(s => ({ projects: s.projects.map(p => p.slug === slug ? updated : p) }))
  },

  fillMissingDescriptions: async () => {
    const missing = get().projects.filter(p => !p.description)
    if (!missing.length) return
    // Fire-and-forget on the server — browser doesn't need to stay open
    await fetch('/api/fill-descriptions', { method: 'POST' }).catch(() => {})
    clearInterval(descriptionsPollInterval)
    let attempts = 0
    descriptionsPollInterval = setInterval(async () => {
      await useStore.getState().fetchProjects(useStore.getState().filters)
      const stillMissing = useStore.getState().projects.filter(p => !p.description).length
      if (stillMissing === 0 || ++attempts >= 50) { clearInterval(descriptionsPollInterval); descriptionsPollInterval = null }
    }, 12000)
  },

  runBulkPrimers: async () => {
    const locals = get().projects.filter(p => p.local_path)
    if (!locals.length) return
    const items = locals.map(p => ({ name: p.name, slug: p.slug, status: 'pending' }))
    set({ bulkPrimer: { done: 0, total: locals.length, current: null, items: [...items] } })
    for (let i = 0; i < items.length; i++) {
      set(s => {
        const next = [...s.bulkPrimer.items]
        next[i] = { ...next[i], status: 'running' }
        return { bulkPrimer: { ...s.bulkPrimer, current: items[i].name, items: next } }
      })
      const ok = await fetch(`/api/projects/${items[i].slug}/primer`, { method: 'POST' })
        .then(r => r.ok).catch(() => false)
      set(s => {
        const next = [...s.bulkPrimer.items]
        next[i] = { ...next[i], status: ok ? 'done' : 'error' }
        return { bulkPrimer: { ...s.bulkPrimer, done: s.bulkPrimer.done + 1, items: next } }
      })
    }
    await get().fetchProjects(get().filters)
    set({ bulkPrimer: null })
  },

  triggerSync: async () => {
    set({ loading: true, error: null })
    try {
      await api('/api/sync', { method: 'POST' })
      await useStore.getState().fetchProjects()
    } catch (err) {
      set({ loading: false, error: err.message })
    }
    // Fill missing descriptions, then run primers
    await useStore.getState().fillMissingDescriptions()
    await useStore.getState().runBulkPrimers()
  },
}))
