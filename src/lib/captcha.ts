// Cloudflare Turnstile token provider for Supabase auth (captcha protection).
// Loads the script once, renders a single (managed) widget, and hands out a fresh
// token per call. Site key is public by design.
const SITE_KEY = '0x4AAAAAADkCrVenhG8541Sk'

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string
      callback: (token: string) => void
      'error-callback'?: () => void
      'expired-callback'?: () => void
    },
  ) => string
  reset: (id: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<void> | null = null
function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Turnstile: échec du chargement du script'))
    document.head.appendChild(s)
  })
  return scriptPromise
}

let widgetId: string | null = null
let pending: ((token: string) => void) | null = null

// Returns a fresh Turnstile token (single-use). Managed mode is usually transparent.
export async function getCaptchaToken(): Promise<string> {
  await loadTurnstile()
  return new Promise<string>((resolve, reject) => {
    pending = resolve
    const onToken = (token: string) => {
      const r = pending
      pending = null
      r?.(token)
    }
    if (widgetId == null) {
      const host = document.createElement('div')
      host.className = 'turnstile-host'
      document.body.appendChild(host)
      widgetId = window.turnstile!.render(host, {
        sitekey: SITE_KEY,
        callback: onToken,
        'error-callback': () => {
          pending = null
          reject(new Error('Échec du captcha'))
        },
      })
    } else {
      window.turnstile!.reset(widgetId)
    }
  })
}
