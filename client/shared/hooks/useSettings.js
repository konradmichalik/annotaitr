import { useState, useCallback, useEffect, useRef } from 'react'
import { getItem, setItem, removeItem } from '../utils/storage.js'
import { mergeSettings, sharedPart } from '../utils/settings.js'

// Cookies, not localStorage: each invocation binds to a random port unless
// ANNOTAITR_PORT is set, and localStorage is scoped per-origin (host+port),
// so settings saved under one run's port would be invisible to the next.
// Cookies are scoped by domain only, so they survive the port changing.
const SHARED_KEY = 'annotaitr-settings'
const LEGACY_AUTO_CLOSE_KEY = 'md-annotator-auto-close'

function persist(modeKey, settings) {
  setItem(modeKey, JSON.stringify(settings))
  setItem(SHARED_KEY, JSON.stringify(sharedPart(settings)))
}

/** Loads, persists and applies the settings of one mode; `defaults` must include SHARED_DEFAULTS. */
export function useSettings(modeKey, defaults) {
  const [settings, setSettings] = useState(() => mergeSettings(
    defaults, getItem(modeKey), getItem(SHARED_KEY), getItem(LEGACY_AUTO_CLOSE_KEY)
  ))

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

  // Writes the migrated settings back once, so renamed keys and the shared
  // cookie (which the pre-paint theme script in index.html reads) are current.
  const migrated = useRef(false)
  useEffect(() => {
    if (migrated.current) { return }
    migrated.current = true
    persist(modeKey, settings)
    removeItem(LEGACY_AUTO_CLOSE_KEY)
  }, [modeKey, settings])

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
