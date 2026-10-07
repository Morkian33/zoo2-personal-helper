// Receiving end of the userscript public/zoo2-helper-bridge.user.js: the game tab opens
// the helper with ?from=game, the helper announces it is ready, the game tab replies
// with the getAllParksOfUser JSON. Only messages from the game's origin are accepted,
// and the data still goes through the import preview before anything is written.

const GAME_ORIGIN = 'https://zoo2app.upjers.com'

// True when this page was opened by the userscript to receive an import.
export function openedForGameImport(): boolean {
  return new URLSearchParams(window.location.search).get('from') === 'game' && window.opener != null
}

// Waits for the game data; calls onPayload once. Returns a cleanup function.
export function listenForGameImport(onPayload: (json: string) => void): () => void {
  const opener = window.opener as Window | null
  let done = false

  function onMessage(e: MessageEvent) {
    if (done || e.origin !== GAME_ORIGIN || e.source !== opener) return
    const data = e.data as { type?: unknown; payload?: unknown } | null
    if (!data || data.type !== 'zoo2-game-import' || typeof data.payload !== 'string') return
    done = true
    cleanup()
    // Drop ?from=game so a reload does not wait for the game again.
    const url = new URL(window.location.href)
    url.searchParams.delete('from')
    url.searchParams.delete('t')
    window.history.replaceState(null, '', url)
    onPayload(data.payload)
  }

  // Announce readiness a few times (the game tab may still be attaching its listener).
  const ping = () => opener?.postMessage({ type: 'zoo2-helper-ready' }, GAME_ORIGIN)
  window.addEventListener('message', onMessage)
  ping()
  let tries = 0
  const timer = window.setInterval(() => {
    if (++tries >= 10) window.clearInterval(timer)
    else ping()
  }, 1000)

  function cleanup() {
    window.clearInterval(timer)
    window.removeEventListener('message', onMessage)
  }
  return cleanup
}
