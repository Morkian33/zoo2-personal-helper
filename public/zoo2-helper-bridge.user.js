// ==UserScript==
// @name         Zoo 2 → zoo2-personal-helper
// @namespace    https://morkian33.github.io/zoo2-personal-helper/
// @version      1.2.0
// @description  Capte au chargement du jeu tes parcs (getAllParksOfUser) et ton inventaire d'animaux (getUser → warehouse) et les envoie au helper en un clic. Lecture seule : ne modifie rien et n'envoie rien au jeu.
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

  let payload = null // JSON text sent to the helper: {"result":{"parks":[...],"warehouse":[...]}}
  let parks = null // result.parks of getAllParksOfUser
  let warehouse = null // result.warehouse of getUser (inventory); only this field is kept from getUser
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
        // loginAction carries the session token: never keep it in the export.
        const secret = method === 'loginAction' || /"auth"\s*:/.test(resText || '')
        rpcLog.push({ at: new Date().toISOString(), method, request: req, response: secret ? '[masqué]' : resText })
        if (!secret && method && !LOAD_METHODS.has(method)) recordEvent(method, req, resText)
      })
  }

  // ---------- Money study: snapshots of tills and shops, kept in this browser ----------
  // At every game load: per park, the till, every shop (money / cap / upgrade) and the
  // park's shared purchase pool. Between loads: the game's own actions (collecting,
  // feeding...), method + request/response trimmed, to date the collections.
  const SNAP_KEY = 'zoo2-helper-money-snapshots'
  const EVENT_KEY = 'zoo2-helper-money-events'
  const LOAD_METHODS = new Set([
    'getResourceConfig', 'validateVersionLocalized', 'getSupportedLanguages', 'sendStatus', 'getUser',
    'getRankingStatistics', 'getProductCollectionProgress', 'getFriends', 'getGuild', 'throwException',
    'getAllParksOfUser', 'getFirstPaymentItems',
  ])

  function readList(key) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || '[]')
      return Array.isArray(v) ? v : []
    } catch (_) {
      return []
    }
  }

  function appendList(key, item, max) {
    let list = readList(key)
    list.push(item)
    if (list.length > max) list = list.slice(list.length - max)
    for (;;) {
      try {
        localStorage.setItem(key, JSON.stringify(list))
        return list.length
      } catch (_) {
        if (list.length < 2) return 0 // storage unavailable
        list = list.slice(Math.floor(list.length / 2)) // quota: drop the oldest half
      }
    }
  }

  const trim = (t) => String(t || '').replace(/"hash":"[^"]*"/g, '"hash":"-"').slice(0, 800)

  function recordEvent(method, req, res) {
    appendList(EVENT_KEY, { at: new Date().toISOString(), method, request: trim(req), response: trim(res) }, 1500)
  }

  function recordSnapshot(parkList) {
    const num = (v) => (v == null || v === '' ? null : Number(v))
    const snap = {
      at: new Date().toISOString(),
      parks: parkList.map((p) => {
        const tills = []
        const shops = []
        for (const b of (p && p.buildings) || []) {
          if (b.ticket_office_info) {
            tills.push({ id: b.building_id, stage: b.upgrade_stage ?? null, money: num(b.ticket_office_info.money), cap: num(b.ticket_office_info.max_money) })
          }
          if (b.store_info) {
            shops.push({
              id: b.building_id,
              oid: b._id && b._id.$oid,
              stage: b.upgrade_stage ?? null,
              entrance: b.connected_to_entrance ?? null,
              money: num(b.store_info.money),
              cap: num(b.store_info.money_cap),
            })
          }
        }
        const pool = {}
        for (const t of (p && p.purchase_info && p.purchase_info.purchase_types) || []) pool[t.type] = num(t.value)
        return {
          template: p && p.template_id,
          last_sim_update: p && p.last_sim_update,
          pending_waste: num(p && p.pending_waste),
          animals: ((p && p.animals) || []).length,
          pool,
          tills,
          shops,
        }
      }),
    }
    const n = appendList(SNAP_KEY, snap, 400)
    log('relevé argent enregistré (' + n + ' au total)')
  }

  function exportMoney() {
    const data = { exported: new Date().toISOString(), snapshots: readList(SNAP_KEY), events: readList(EVENT_KEY) }
    if (!data.snapshots.length) return setStatus("Aucun relevé pour l'instant")
    download('zoo2-releves-argent', data)
    setStatus('Exporté : ' + data.snapshots.length + ' relevé(s), ' + data.events.length + ' action(s)')
  }

  function download(name, data) {
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name + '-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.json'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 10000)
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
    if (!text || !(text.includes('"parks"') || text.includes('"warehouse"'))) return
    let result
    try {
      const data = JSON.parse(text)
      result = data && data.result
    } catch (e) {
      log('réponse illisible (' + text.length + ' caractères)', e)
      return
    }
    if (!result) return
    if (Array.isArray(result.parks)) {
      parks = result.parks
      log('getAllParksOfUser capté :', parks.length, 'parcs')
      try {
        recordSnapshot(parks)
      } catch (e) {
        log('relevé argent impossible', e)
      }
    }
    if (Array.isArray(result.warehouse)) {
      warehouse = result.warehouse
      log('inventaire capté :', warehouse.length, 'lignes')
    }
    if (!parks) return
    const placed = parks.reduce((n, p) => n + ((p && p.animals && p.animals.length) || 0), 0)
    const stored = (warehouse || []).reduce((n, r) => {
      const id = (r && r.product_id) || ''
      return id.startsWith('product_animal_') && !id.endsWith('_part') ? n + (r.count || 0) : n
    }, 0)
    payload = JSON.stringify({ result: warehouse ? { parks, warehouse } : { parks } })
    summary =
      parks.length + ' parcs · ' + placed + ' animaux' + (warehouse ? ' + ' + stored + ' en inventaire' : ' (inventaire pas encore vu)')
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
    if (!rpcLog.length) return setStatus("Aucune requête captée pour l'instant")
    download('zoo2-jsonrpc', rpcLog)
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
      const money = button('Exporter relevés', exportMoney, false)
      const dump = button('Exporter tout (debug)', exportLog, false)
      const close = button('×', () => panel.remove(), false)
      statusEl = document.createElement('span')
      statusEl.style.cssText = 'opacity:.75;width:100%'
      panel.append(title, info, send, copy, money, dump, close, statusEl)
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
