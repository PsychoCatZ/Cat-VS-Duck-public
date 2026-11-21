import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { demo } from '../duck.mjs'
import { emotions } from '../public/emotions.js'

const turn = {
  kind: 'reply',
  history: [{ role: 'cat', text: 'С твоим клювом хорошо открывать консервы.' }],
  memory: 'Утка назвала Кота графом Диванским.',
  score: { cat: 0, duck: 0 },
}

test('demo reaches every expression and only scores player turns', () => {
  const moods = new Set()
  let memory = ''
  for (let index = 0; index < 10; index += 1) {
    const response = demo({ ...turn, memory, score: null })
    assert.equal(response.winner, null)
    moods.add(response.emotion)
    memory = response.memory
  }
  assert.deepEqual(moods, new Set(Object.keys(emotions)))
  assert.equal(demo({ ...turn, kind: 'initiative' }).winner, null)
  assert.ok(demo(turn).winner)
})

test('server forwards memory, handles upstream failure, and permits retry', { timeout: 10000 }, async t => {
  const sent = []
  const provider = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    sent.push(JSON.parse(body))
    if (sent.length === 1) {
      res.writeHead(503).end()
      return
    }
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      reply: 'Граф Диванский, консервы хотя бы содержательнее твоих выпадов.',
      emotion: 'invalid-mood',
      intensity: 2,
      winner: 'duck',
      memory: 'Шутка про консервы и графа Диванского.',
    }) } }] }))
  }).listen(0, '127.0.0.1')
  t.after(() => provider.close())
  await once(provider, 'listening')
  const app = spawn(process.execPath, ['server.mjs'], {
    env: {
      ...process.env,
      PORT: '0',
      CAT_DUCK_API_KEY: 'test-fixture',
      CAT_DUCK_MODEL: 'test-model',
      CAT_DUCK_API_BASE: `http://127.0.0.1:${provider.address().port}`,
    },
  })
  t.after(() => app.kill())
  const [startup] = await once(app.stdout, 'data')
  const base = startup.toString().match(/http:\/\/127\.0\.0\.1:\d+/)[0]
  const post = body => fetch(`${base}/api/turn`, { method: 'POST', body: JSON.stringify(body) })
  assert.deepEqual(await (await fetch(`${base}/api/config`)).json(), { live: true })
  assert.equal((await post({ ...turn, history: [] })).status, 400)
  assert.equal((await post(turn)).status, 502)
  const response = await post(turn)
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.match(result.reply, /граф диванский/i)
  assert.equal(result.emotion, 'neutral')
  assert.equal(result.intensity, 1)
  assert.equal(result.winner, 'duck')
  assert.match(result.memory, /консервы/)
  assert.deepEqual(sent.map(request => JSON.parse(request.messages[1].content)), [turn, turn])
})
