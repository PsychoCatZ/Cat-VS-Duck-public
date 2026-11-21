import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { emotions } from './public/emotions.js'
import { demo, duckPrompt, normalize } from './duck.mjs'

const key = process.env.CAT_DUCK_API_KEY || process.env.OPENAI_API_KEY
const model = process.env.CAT_DUCK_MODEL
const live = Boolean(key && model)
const apiBase = (process.env.CAT_DUCK_API_BASE || 'https://api.openai.com/v1').replace(/\/$/, '')
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/game.js', ['game.js', 'text/javascript; charset=utf-8']],
  ['/emotions.js', ['emotions.js', 'text/javascript; charset=utf-8']],
  ['/characters.png', ['characters.png', 'image/png']],
])

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(data))
}

async function readTurn(req) {
  let body = ''
  req.setEncoding('utf8')
  for await (const chunk of req) {
    body += chunk
    if (body.length > 80000) {
      throw new Error('Размер запроса превышен.')
    }
  }
  const { kind, history, memory, score } = JSON.parse(body)
  if (!['opening', 'reply', 'initiative'].includes(kind) || !Array.isArray(history) ||
      history.length > 12 || !history.every(turn => turn && ['cat', 'duck'].includes(turn.role) &&
        typeof turn.text === 'string' && turn.text.length <= 1000) ||
      (kind === 'reply' && history.at(-1)?.role !== 'cat') ||
      typeof memory !== 'string' || memory.length > 900 ||
      (score !== null && (!score || !['cat', 'duck'].every(side => Number.isSafeInteger(score[side]) && score[side] >= 0)))) {
    throw new Error('Некорректный ход.')
  }
  return { kind, history, memory, score }
}

let active = false
createServer(async (req, res) => {
  const path = req.url.split('?')[0]
  if (req.method === 'GET' && path === '/api/config') return json(res, 200, { live })
  if (req.method === 'POST' && path === '/api/turn') {
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` &&
        req.headers.origin !== `https://${req.headers.host}`) {
      return json(res, 403, { error: 'Запрос отклонён.' })
    }
    let turn
    try {
      turn = await readTurn(req)
    } catch {
      return json(res, 400, { error: 'Проверь данные хода и попробуй снова.' })
    }
    if (!live) return json(res, 200, demo(turn))
    if (active) return json(res, 429, { error: 'Утка ещё отвечает. Попробуй через несколько секунд.' })
    active = true
    try {
      const upstream = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(25000),
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: duckPrompt(Object.keys(emotions)) },
            { role: 'user', content: JSON.stringify(turn) },
          ],
          response_format: { type: 'json_object' },
        }),
      })
      if (!upstream.ok) {
        console.warn(`Duck API: HTTP ${upstream.status}`)
        throw new Error('Provider error')
      }
      const data = await upstream.json()
      return json(res, 200, normalize(JSON.parse(data.choices[0].message.content), turn))
    } catch {
      return json(res, 502, { error: 'Утка пока не ответила. Можно повторить ход.' })
    } finally {
      active = false
    }
  }
  const entry = files.get(path)
  if (req.method !== 'GET' || !entry) return json(res, 404, { error: 'Страница не найдена.' })
  try {
    const file = await readFile(new URL(`./public/${entry[0]}`, import.meta.url))
    res.writeHead(200, { 'Content-Type': entry[1], 'X-Content-Type-Options': 'nosniff' })
    res.end(file)
  } catch {
    json(res, 404, { error: 'Файл не найден.' })
  }
}).listen(Number(process.env.PORT || 4173), '127.0.0.1', function () {
  console.log(`Кот против Утки · http://127.0.0.1:${this.address().port} · ${live ? 'API' : 'демо'}`)
})
