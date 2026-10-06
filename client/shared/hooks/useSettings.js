import { useState, useCallback, useEffect, useRef } from 'react'
import { getItem, setItem } from '../utils/storage.js'

// Cookies, not localStorage: each invocation binds to a random port unless
// ANNOTAITR_PORT is set, and localStorage is scoped per-origin (host+port),
// so settings saved under one run's port would be invisible to the next.
// Cookies are scoped by domain only, so they survive the port changing.
const SHARED_KEY = 'annotaitr-settings'

/** Settings both modes offer, stored once so a change in one mode carries over to the other. */
export const SHARED_DEFAULTS = {
  theme: 'auto',
  autoCloseDelay: 'off'
}

function parse(raw) {
  if (!raw) { return {} }
  try {
    const value = JSON.parse(raw)
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

export function sharedPart(settings) {
  return Object.fromEntries(Object.keys(SHARED_DEFAULTS).map((key) => [key, settings[key]]))
}

export function mergeSettings(defaults, modeRaw, sharedRaw) {
  const mode = { ...defaults, ...parse(modeRaw) }
  return { ...mode, ...sharedPart({ ...mode, ...parse(sharedRaw) }) }
}

function persist(modeKey, settings) {
  setItem(modeKey, JSON.stringify(settings))
  setItem(SHARED_KEY, JSON.stringify(sharedPart(settings)))
}

/** Loads, persists and applies the settings of one mode; `defaults` must include SHARED_DEFAULTS. */
export function useSettings(modeKey, defaults) {
  const [settings, setSettings] = useState(() => mergeSettings(defaults, getItem(modeKey), getItem(SHARED_KEY)))

  const updateSetting = useCallback((key, value) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value }
      persist(modeKey, next)
      return next
    })
  }, [modeKey])

  const resetSettings = useCallback(() => {
    setSettings({ ...defaults })
    persist(modeKey, defaults)
  }, [modeKey, defaults])

  // A theme saved before the shared cookie existed lives only in the mode
  // cookie; copying it over lets the pre-paint script in index.html see it.
  const migrated = useRef(false)
  useEffect(() => {
    if (migrated.current) { return }
    migrated.current = true
    if (!getItem(SHARED_KEY)) { setItem(SHARED_KEY, JSON.stringify(sharedPart(settings))) }
  }, [settings])

  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'dark' || settings.theme === 'light') {
      root.setAttribute('data-theme', settings.theme)
      return
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => root.setAttribute('data-theme', mq.matches ? 'dark' : 'light')
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [settings.theme])

  return { settings, updateSetting, resetSettings }
}
