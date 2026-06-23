// src/store.js
import { create } from 'zustand'

const api = async (path, opts = {}) => {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Request failed')
  return json.data
}

export const useStore = create((set, get) => ({
  projects: [],
  loading: false,
  error: null,
  filters: { search: '', status: '', language: '' },

  setFilter: (key, value) => {
    const updated = { ...get().filters, [key]: value }
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

  triggerSync: async () => {
    set({ loading: true, error: null })
    try {
      await api('/api/sync', { method: 'POST' })
      await useStore.getState().fetchProjects()
    } catch (err) {
      set({ loading: false, error: err.message })
    }
  }
}))
