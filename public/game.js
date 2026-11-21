import { emotions } from './emotions.js'

const el = id => document.getElementById(id)
const storageKey = 'des-cat-duck-v1'
const fresh = (enabled = false) => ({ history: [], memory: '', score: { cat: 0, duck: 0 }, enabled, pending: 'opening' })
let state = fresh()
let busy = false
let onlineMode
let storageFailed = false
let error = ''

try {
  const saved = JSON.parse(localStorage.getItem(storageKey))
  if (saved && Array.isArray(saved.history)) state = saved
} catch {
  storageFailed = true
}

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state))
  } catch {
    storageFailed = true
  }
}

const sprite = new Image()
sprite.src = '/characters.png'
const canvas = el('duck-art')
const brush = canvas.getContext('2d')
const ink = '#201a14'
const feather = '#dbe9cd'
const eye = '#ffedc9'
const bill = '#ff9c21'

// These paths use coordinates relative to the duck's fixed sprite cell.
function paint(path, color, thickness = 5) {
  const shape = new Path2D(path)
  brush.lineWidth = thickness
  brush.lineCap = 'round'
  brush.lineJoin = 'round'
  if (color) {
    brush.fillStyle = color
    brush.fill(shape)
  }
  if (thickness) {
    brush.strokeStyle = ink
    brush.stroke(shape)
  }
}

const faces = {
  neutral: ['M515 169 Q569 120 586 164 M366 160 Q404 115 431 144', 'M257 244 Q304 341 430 357 Q492 364 528 329', 0, 0],
  anger: ['M516 181 Q558 138 588 165 M364 145 L433 207', 'M257 246 Q305 355 415 363 Q480 353 520 347', -12, 5],
  hurt: ['M517 166 Q542 119 580 151 M362 159 Q399 157 434 132', 'M258 248 Q305 357 401 368 Q468 347 517 355', 10, 22],
  joy: ['M519 156 Q558 115 585 154 M365 154 Q411 117 433 142', null, -4, -6],
  smug: ['M513 180 Q560 134 586 164 M365 170 Q402 147 429 151', 'M257 240 Q317 358 447 357 Q499 352 525 329', -9, 9],
  surprise: ['M512 146 Q562 99 587 142 M364 145 Q402 93 432 127', 'M270 264 Q324 354 425 353 Q484 350 525 338 Q487 405 406 424 Q358 426 342 380 Q313 340 270 264 Z', 13, -2],
  embarrassed: ['M520 171 Q553 143 582 166 M372 154 Q403 137 432 146', 'M258 246 Q307 355 408 367 Q464 365 517 345', 39, 11],
  annoyance: ['M524 162 Q564 146 584 165 M371 163 Q406 155 430 157', 'M258 245 Q303 354 411 366 Q479 368 514 351', 18, -42],
  triumph: ['M522 154 Q564 111 588 149 M367 153 Q404 124 432 144', null, -10, 1],
  defeat: ['M517 162 Q550 126 583 166 M368 160 Q403 158 432 143', 'M258 249 Q306 359 403 368 Q460 335 512 353', 12, 27],
}

function drawFace(mood) {
  if (!sprite.complete || !sprite.naturalWidth) return
  const half = sprite.naturalWidth / 2
  brush.clearRect(0, 0, 887, 887)
  brush.drawImage(sprite, half, 0, half, sprite.naturalHeight, 0, 0, 887, 887)
  const [brows, mouth, dx, dy] = faces[mood]
  paint('M359 151 Q404 96 439 110 L455 154 Q491 157 514 141 Q564 106 593 132 L612 171 Q621 218 576 278 L450 325 L411 269 L364 260 L346 232 Z', feather, 0)
  paint('M342 239 C353 191 397 127 423 139 C448 144 429 208 391 267 L354 270 Z', eye)
  paint('M420 307 C429 268 500 173 544 185 C598 192 541 289 505 314 C462 346 430 325 420 307 Z', eye)
  if (mood === 'joy') {
    paint('M352 232 Q372 191 409 202 M436 292 Q473 236 525 246', null, 8)
  } else {
    paint(`M${363 + dx * .55} ${212 + dy * .6} a13 22 24 1 0 1 -1 Z M${451 + dx} ${261 + dy} a19 28 30 1 0 1 -1 Z`, ink, 0)
  }
  paint(brows, null, mood === 'anger' ? 10 : 7)
  if (['anger', 'smug', 'annoyance', 'defeat'].includes(mood)) {
    paint('M342 232 Q381 213 415 212 M421 301 Q494 263 554 251', null, 5)
  }
  if (mouth) {
    paint('M248 213 Q273 178 316 232 Q343 263 369 271 Q393 253 417 277 Q435 321 472 325 Q494 327 517 309 Q552 302 552 332 Q548 365 505 378 Q461 391 423 430 Q386 450 357 429 Q335 404 351 363 Q346 336 318 326 Q268 307 248 278 Q225 239 248 213 Z', bill, 7)
    paint(mouth, mood === 'surprise' ? ink : null, 7)
  }
  if (mood === 'embarrassed') paint('M539 308 a22 10 -24 1 0 1 0 Z', '#ef8d77', 0)
}

function render() {
  const list = el('history')
  const rows = document.createDocumentFragment()
  for (const turn of state.history) {
    const row = document.createElement('li')
    row.className = `${turn.role}-line`
    const name = document.createElement('strong')
    name.textContent = turn.role === 'cat' ? 'Кот' : 'Утка'
    row.append(name, turn.text)
    rows.append(row)
  }
  list.replaceChildren(rows)
  list.scrollTop = list.scrollHeight
  const lastMood = state.history.findLast(turn => turn.role === 'duck')?.emotion
  const mood = Object.hasOwn(emotions, lastMood) ? lastMood : 'neutral'
  el('emotion').textContent = emotions[mood]
  canvas.setAttribute('aria-label', `Утка — ${emotions[mood].toLowerCase()}`)
  drawFace(mood)
  el('score-toggle').checked = state.enabled
  el('score').hidden = !state.enabled
  el('score').textContent = `Кот — ${state.score.cat} : ${state.score.duck} — Утка`
  el('mode').textContent = onlineMode === false ? 'Демо · заготовленные реплики' : onlineMode ? 'ИИ-дуэль' : ''
  el('status').textContent = [
    busy ? 'Утка готовит выпад…' : error,
    storageFailed ? 'Браузер не смог сохранить поединок.' : '',
  ].filter(Boolean).join(' ')
  el('message').disabled = busy || Boolean(state.pending)
  document.querySelector('.send').disabled = el('message').disabled
  el('initiative').disabled = busy || Boolean(state.pending)
  el('retry').hidden = busy || !state.pending
  el('edit').hidden = busy || state.pending !== 'reply'
  el('new-duel').disabled = busy
  el('score-toggle').disabled = busy
}

sprite.addEventListener('load', render)

async function takeTurn(kind) {
  if (busy) return
  state.pending = kind
  busy = true
  error = ''
  save()
  render()
  try {
    const response = await fetch('/api/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind,
        history: state.history.slice(-12).map(({ role, text }) => ({ role, text })),
        memory: state.memory,
        score: state.enabled ? state.score : null,
      }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error)
    state.history.push({ role: 'duck', text: result.reply, emotion: result.emotion, intensity: result.intensity })
    if (result.winner) state.score[result.winner] += 1
    state.memory = result.memory
    state.pending = null
    save()
  } catch (failure) {
    error = failure instanceof TypeError || failure instanceof SyntaxError ?
      'Связь с игрой прервалась. Можно повторить ход.' : failure.message
  } finally {
    busy = false
    render()
  }
}

el('composer').addEventListener('submit', event => {
  event.preventDefault()
  const text = el('message').value.trim()
  if (!text || busy || state.pending) return
  state.history.push({ role: 'cat', text })
  el('message').value = ''
  takeTurn('reply')
})
el('score-toggle').addEventListener('change', event => {
  state.enabled = event.target.checked
  save()
  render()
})
el('retry').addEventListener('click', () => takeTurn(state.pending))
el('initiative').addEventListener('click', () => takeTurn('initiative'))
el('edit').addEventListener('click', () => {
  el('message').value = state.history.pop().text
  state.pending = null
  error = ''
  save()
  render()
  el('message').focus()
})
el('new-duel').addEventListener('click', () => {
  if (state.history.length && !confirm('Начать заново? Реплики текущего поединка будут удалены.')) return
  state = fresh(state.enabled)
  el('message').value = ''
  takeTurn('opening')
})

const started = state.history.length > 0 || localStorageAvailable()
function localStorageAvailable() {
  try {
    return localStorage.getItem(storageKey) !== null
  } catch {
    return false
  }
}

busy = true
render()
try {
  const config = await fetch('/api/config')
  if (config.ok) onlineMode = (await config.json()).live
} catch {
  error = 'Сервер игры недоступен.'
}
busy = false
if (!started && onlineMode !== undefined) {
  takeTurn('opening')
} else {
  if (state.pending && !error) error = 'Утка ещё не ответила на этот ход.'
  render()
}
