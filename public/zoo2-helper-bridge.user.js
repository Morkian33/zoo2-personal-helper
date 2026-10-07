// ==UserScript==
// @name         Zoo 2 → zoo2-personal-helper
// @namespace    https://morkian33.github.io/zoo2-personal-helper/
// @version      1.0.3
// @description  Capte au chargement du jeu la réponse getAllParksOfUser (tes parcs, animaux, niveaux, pelages) et l'envoie au helper en un clic. Lecture seule : ne modifie rien et n'envoie rien au jeu.
// @match        https://zoo2app.upjers.com/*
// @run-at       document-start
// @grant        none
// @inject-into  page
// @updateURL    https://morkian33.github.io/zoo2-personal-helper/zoo2-helper-bridge.user.js
// @downloadURL  https://morkian33.github.io/zoo2-personal-helper/zoo2-helper-bridge.user.js
// ==/UserScript==

;(function () {
  'use strict'

  const HELPER_URL = 'https://morkian33.github.io/zoo2-personal-helper/'
  const HELPER_ORIGIN = new URL(HELPER_URL).origin

  let payload = null // raw JSON text of the last getAllParksOfUser response
  let summary = 'en attente des données du jeu…'
  let rpcSeen = 0 // jsonrpc.php calls observed (diagnostic: 0 means the hooks see nothing)
  const rpcLog = [] // every jsonrpc call of the session (request + response text), for the debug export

  const log = (...a) => console.log('[zoo2-helper]', ...a)
  log('script actif sur', location.href, window === window.top ? '(page principale)' : '(iframe)')

  // ---------- Capture (passive: wraps XHR / fetch, reads the response, changes nothing) ----------

  function asText(data) {
    if (data == null) return ''
    if (typeof data === 'string') return data
    try {
      if (data instanceof ArrayBuffer) return new TextDecoder().decode(data)
      if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data)
    } catch (_) {}
    return ''
  }

  // Every jsonrpc.php call is inspected on its *response* (whatever the request body
  // format): the one carrying result.parks is getAllParksOfUser.
  function isRpc(url, via, bodyType, responseType) {
    if (!String(url).includes('jsonrpc.php')) return false
    rpcSeen++
    log('jsonrpc #' + rpcSeen, 'via', via, '| corps', bodyType, '| réponse', responseType || 'text')
    if (!payload) {
      summary = 'en attente… (' + rpcSeen + ' requête(s) jeu vue(s))'
      renderPanel()
    }
    return true
  }

  function bodyText(body) {
    if (body == null) return Promise.resolve('')
    if (typeof body === 'string') return Promise.resolve(body)
    if (typeof Blob !== 'undefined' && body instanceof Blob) return body.text()
    return Promise.resolve(asText(body))
  }

  function record(reqPromise, resText) {
    reqPromise
      .catch(() => '')
      .then((req) => {
        let method = null
        try {
          method = JSON.parse(req).method || null
        } catch (_) {}
        rpcLog.push({ at: new Date().toISOString(), method, request: req, response: resText })
      })
  }

  const typeOf = (v) => (v == null ? 'vide' : typeof v === 'string' ? 'texte' : Object.prototype.toString.call(v).slice(8, -1))

  // Response of an XHR as text, for every responseType ('' / text / arraybuffer / blob / json).
  function xhrText(xhr) {
    const rt = xhr.responseType
    if (rt === '' || rt === 'text') return Promise.resolve(xhr.responseText)
    if (rt === 'json') return Promise.resolve(xhr.response == null ? '' : JSON.stringify(xhr.response))
    if (rt === 'blob' && xhr.response && typeof xhr.response.text === 'function') return xhr.response.text()
    return Promise.resolve(asText(xhr.response))
  }

  function capture(text) {
    if (!text || !text.includes('"parks"')) return
    let parks
    try {
      const data = JSON.parse(text)
      parks = data && data.result && data.result.parks
    } catch (e) {
      log('réponse getAllParksOfUser illisible (' + text.length + ' caractères)', e)
      return
    }
    if (!Array.isArray(parks)) return log('réponse sans result.parks')
    const animals = parks.reduce((n, p) => n + ((p && p.animals && p.animals.length) || 0), 0)
    log('getAllParksOfUser capté :', parks.length, 'parcs,', animals, 'animaux')
    payload = text
    summary = parks.length + ' parcs · ' + animals + ' animaux'
    renderPanel()
  }

  const xhrOpen = XMLHttpRequest.prototype.open
  const xhrSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__zoo2HelperUrl = url
    return xhrOpen.apply(this, arguments)
  }
  XMLHttpRequest.prototype.send = function (body) {
    const url = this.__zoo2HelperUrl
    if (String(url).includes('jsonrpc.php')) {
      const bodyType = typeOf(body)
      const req = bodyText(body)
      this.addEventListener('load', () => {
        isRpc(url, 'XHR', bodyType, this.responseType)
        xhrText(this)
          .then((t) => {
            record(req, t)
            capture(t)
          })
          .catch((e) => log('lecture réponse échouée', e))
      })
    }
    return xhrSend.apply(this, arguments)
  }

  const origFetch = window.fetch
  if (origFetch) {
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input && input.url
      const p = origFetch.apply(this, arguments)
      if (String(url).includes('jsonrpc.php')) {
        p.then((res) => {
          isRpc(url, 'fetch', typeOf(init && init.body), 'fetch')
          return res
            .clone()
            .text()
            .then((t) => {
              record(bodyText(init && init.body), t)
              capture(t)
            })
        }).catch((e) => log('lecture réponse échouée', e))
      }
      return p
    }
  }

  // ---------- Hand-over to the helper (window.open + postMessage handshake) ----------

  let helperWin = null
  window.addEventListener('message', (e) => {
    if (e.origin !== HELPER_ORIGIN || !e.data || e.data.type !== 'zoo2-helper-ready') return
    if (!payload || e.source !== helperWin) return
    helperWin.postMessage({ type: 'zoo2-game-import', payload }, HELPER_ORIGIN)
    setStatus('Envoyé au helper ✔')
  })

  function sendToHelper() {
    if (!payload) return
    helperWin = window.open(HELPER_URL + '?from=game&t=' + Date.now(), 'zoo2-helper')
    setStatus(helperWin ? 'Ouverture du helper…' : 'Pop-up bloquée : autorise-la pour ce site')
  }

  async function copyPayload() {
    if (!payload) return
    try {
      await navigator.clipboard.writeText(payload)
      setStatus('JSON copié')
    } catch (_) {
      setStatus('Copie refusée par le navigateur')
    }
  }

  // Debug: downloads every jsonrpc call seen so far (too big for the DevTools console).
  // The file holds your game data (no password): keep it local, do not publish it.
  function exportLog() {
    if (!rpcLog.length) return setStatus('Aucune requête captée pour l\'instant')
    const blob = new Blob([JSON.stringify(rpcLog)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'zoo2-jsonrpc-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.json'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 10000)
    setStatus('Exporté : ' + rpcLog.length + ' requête(s) — ' + rpcLog.map((e) => e.method || '?').join(', '))
  }

  // ---------- Small floating panel ----------

  let panel = null
  let statusEl = null

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg
  }

  function renderPanel() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', renderPanel, { once: true })
      return
    }
    if (!panel) {
      panel = document.createElement('div')
      panel.style.cssText =
        'position:fixed;left:12px;bottom:12px;z-index:2147483647;background:#161a22;color:#e6e9ef;' +
        'border:1px solid #2c3340;border-radius:10px;padding:8px 10px;font:13px system-ui,sans-serif;' +
        'box-shadow:0 6px 24px rgba(0,0,0,.5);display:flex;gap:8px;align-items:center;flex-wrap:wrap;max-width:420px'
      const title = document.createElement('strong')
      title.textContent = 'Helper'
      const info = document.createElement('span')
      info.dataset.role = 'info'
      const send = button('Envoyer au helper', sendToHelper, true)
      const copy = button('Copier', copyPayload, false)
      const dump = button('Exporter tout (debug)', exportLog, false)
      const close = button('×', () => panel.remove(), false)
      statusEl = document.createElement('span')
      statusEl.style.cssText = 'opacity:.75;width:100%'
      panel.append(title, info, send, copy, dump, close, statusEl)
      document.body.appendChild(panel)
    }
    panel.querySelector('[data-role="info"]').textContent = summary
  }

  function button(label, onClick, primary) {
    const b = document.createElement('button')
    b.textContent = label
    b.style.cssText =
      'border:0;border-radius:7px;padding:4px 9px;cursor:pointer;font:600 12px system-ui,sans-serif;' +
      (primary ? 'background:#7aa2ff;color:#0b1020' : 'background:#2c3340;color:#e6e9ef')
    b.addEventListener('click', onClick)
    return b
  }

  // Show the panel right away in the main page, so it is visible that the script runs.
  if (window === window.top) renderPanel()
})()
