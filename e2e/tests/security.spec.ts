import { test, expect } from '@playwright/test'
import { clientKey, powHeaders, powPost } from './helpers'

test.describe('unauthorized admin APIs', () => {
  const paths = [
    '/api/admin/stats',
    '/api/admin/logs',
    '/api/admin/reports',
    '/api/admin/investigate?target=1.1.1.1',
    '/api/admin/search?query=test',
  ]
  for (const path of paths) {
    test(`GET ${path} is forbidden without auth`, async ({ request }) => {
      const res = await request.get(path)
      expect(res.status()).toBe(403)
    })
  }

  test('POST /api/admin/delete without auth is forbidden', async ({ request }) => {
    const res = await request.post('/api/admin/delete', { data: { id: 1, type_: 'post' } })
    expect([403, 401]).toContain(res.status())
  })

  test('POST /api/admin/ban without auth is forbidden', async ({ request }) => {
    const res = await request.post('/api/admin/ban', {
      data: { ip: '1.2.3.4', reason: 'x', duration: 1, delete_content: false },
    })
    expect([403, 401]).toContain(res.status())
  })
})

test('POST without PoW is forbidden', async ({ request }) => {
  const res = await request.post('/api/report', { data: { post_id: 1, reason: 'x' } })
  expect(res.status()).toBe(403)
})

test('PoW replay is forbidden', async ({ request }) => {
  const sessionId = await clientKey(request)
  const headers = powHeaders(sessionId)
  const payload = { post_id: 1, reason: 'replay' }
  const first = await request.post('/api/report', { data: payload, headers })
  expect([200, 404, 409]).toContain(first.status())
  const replay = await request.post('/api/report', { data: payload, headers })
  expect(replay.status()).toBe(403)
})

test('SQL injection in search does not 500', async ({ request }) => {
  const res = await request.get("/api/admin/search?query=' OR 1=1; --")
  expect(res.status()).not.toBe(500)
  expect([403, 400, 200]).toContain(res.status())
})

test('path-like payload on home is fine', async ({ request }) => {
  const res = await request.get('/api/home', { headers: { 'user-agent': "Mozilla' OR 1=1; --" } })
  expect(res.status()).toBe(200)
})

test('oversized JSON is rejected or ignored', async ({ request }) => {
  const sessionId = await clientKey(request)
  const res = await request.post('/api/m/submit', {
    headers: powHeaders(sessionId),
    data: { content: 'a'.repeat(100_000) },
    failOnStatusCode: false,
  })
  expect(res.status()).not.toBe(500)
})

test('non-image upload is rejected', async ({ request }) => {
  const sessionId = await clientKey(request)
  const res = await request.post('/api/m/submit', {
    headers: powHeaders(sessionId),
    multipart: {
      content: 'текст',
      file: {
        name: 'payload.exe',
        mimeType: 'application/octet-stream',
        buffer: Buffer.from('MZ not an image'),
      },
    },
  })
  expect(res.status()).toBe(400)
})

test('SVG upload is rejected', async ({ request }) => {
  const sessionId = await clientKey(request)
  const res = await request.post('/api/m/submit', {
    headers: powHeaders(sessionId),
    multipart: {
      content: 'svg',
      file: {
        name: 'x.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'),
      },
    },
  })
  expect(res.status()).toBe(400)
})

test('HTML tags are stripped from post text', async ({ request }) => {
  const ip = `198.51.102.${Math.floor(Math.random() * 200) + 1}`
  const marker = `xss-${Date.now()}`
  const first = await powPost(request, '/api/m/submit', {
    headers: { 'CF-Connecting-IP': ip },
    multipart: { content: `<script>alert(1)</script>[b]${marker}[/b]` },
  })
  expect(first.ok()).toBeTruthy()
  const { thread_id } = await first.json()
  const view = await request.get(`/api/m/thread/${thread_id}`)
  expect(view.ok()).toBeTruthy()
  const json = await view.json()
  expect(json.thread.content).toContain(`[b]${marker}[/b]`)
  expect(String(json.thread.content).toLowerCase()).not.toContain('<script')
})

test('untrusted and disguised links are filtered', async ({ request }) => {
  const ip = `198.51.103.${Math.floor(Math.random() * 200) + 1}`
  const first = await powPost(request, '/api/m/submit', {
    headers: { 'CF-Connecting-IP': ip },
    multipart: {
      content: 'go google.com then evil.xyz and mail a@b.xyz plus +380671234567',
    },
  })
  expect(first.ok()).toBeTruthy()
  const { thread_id } = await first.json()
  const view = await request.get(`/api/m/thread/${thread_id}`)
  const json = await view.json()
  const content = String(json.thread.content)
  expect(content).toContain('[url]https://google.com[/url]')
  expect(content).toContain('[посилання видалено]')
  expect(content).not.toContain('evil.xyz')
  expect(content).toContain('[пошта видалено]')
  expect(content).toContain('[телефон видалено]')
})

test('rate limit rejects a second post from the same IP', async ({ request }) => {
  const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`
  const first = await powPost(request, '/api/m/submit', {
    headers: { 'CF-Connecting-IP': ip },
    multipart: { content: `rate-a-${Date.now()}` },
  })
  expect(first.ok()).toBeTruthy()
  const second = await powPost(request, '/api/m/submit', {
    headers: { 'CF-Connecting-IP': ip },
    multipart: { content: `rate-b-${Date.now()}` },
  })
  expect(second.status()).toBe(429)
})

test('login lockout after repeated failures', async ({ request }) => {
  const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`
  const payload = { username: 'admin', password_enc: 'not-a-sealed-password' }
  for (let i = 0; i < 5; i++) {
    const res = await powPost(request, '/api/admin/login', {
      headers: { 'CF-Connecting-IP': ip },
      data: payload,
    })
    expect(res.status()).toBe(401)
  }
  const locked = await powPost(request, '/api/admin/login', {
    headers: { 'CF-Connecting-IP': ip },
    data: payload,
  })
  expect(locked.status()).toBe(429)
})

test('setup-status is not a public API', async ({ request }) => {
  const res = await request.get('/api/admin/setup-status')
  expect(res.status()).toBe(404)
})

test('admin panel assets require a staff session', async ({ request }) => {
  const res = await request.get('/admin/assets/index.js')
  expect(res.status()).toBe(401)
})

test('responses do not advertise a server version', async ({ request }) => {
  const res = await request.get('/')
  const server = res.headers()['server']
  if (server) {
    expect(server.toLowerCase()).not.toMatch(/nginx\/\d/)
    expect(server.toLowerCase()).not.toContain('nginx')
  }
  expect(res.headers()['x-powered-by']).toBeUndefined()
})

test('API processing time is a coarse bucket', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.ok()).toBeTruthy()
  expect(res.headers()['x-processing-time']).toMatch(/^(<\d+ms|>\d+ms)$/)
})

test('tampered JWT is not accepted as admin', async ({ request }) => {
  const res = await request.get('/api/admin/stats', {
    headers: { cookie: 'session_id=not-a-jwt; client_key=abc' },
  })
  expect(res.status()).toBe(403)
})

test('guest thread payload has no ip or session', async ({ request }) => {
  const home = await request.get('/api/m')
  expect(home.ok()).toBeTruthy()
  const board = await home.json()
  for (const t of board.threads || []) {
    expect(t.model?.ip_address == null).toBeTruthy()
    expect(t.model?.session_id == null).toBeTruthy()
  }
  const id = board.threads?.[0]?.model?.id
  if (!id) return
  const res = await request.get(`/api/m/thread/${id}`)
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.thread?.ip_address == null).toBeTruthy()
  expect(body.thread?.session_id == null).toBeTruthy()
  for (const p of body.replies || []) {
    expect(p.model?.ip_address == null).toBeTruthy()
    expect(p.model?.session_id == null).toBeTruthy()
  }
})
