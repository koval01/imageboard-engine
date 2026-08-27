import { createHash, randomBytes } from 'node:crypto'
import { crc32, deflateSync } from 'node:zlib'
import type { APIRequestContext, Page } from '@playwright/test'
import { expect } from '@playwright/test'

export function tinyPng(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR42mP4z8BAEmIY1TCqYfhqAACQ+f8B8u7oVwAAAABJRU5ErkJggg==',
    'base64',
  )
}

/** 1×1 PNG with unique pixels so Silo hash-dedup does not share the object. */
export function uniquePng(seed = Date.now()): Buffer {
  const r = seed & 255
  const g = (seed >> 8) & 255
  const b = (seed >> 16) & 255
  const a = 255
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0)
  ihdr.writeUInt32BE(1, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const idat = deflateSync(Buffer.from([0, r, g, b, a]))
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.from(type)
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
    return Buffer.concat([len, t, data, crc])
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

export async function postGap() {
  const ms = Number(process.env.E2E_POST_GAP_MS || '0')
  if (ms > 0) {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }
}

export function solvePoW(sessionId: string): { nonce: string; salt: string } {
  const salt = randomBytes(16).toString('hex')
  let nonce = 0
  for (;;) {
    const digest = createHash('sha256').update(`${sessionId}${salt}${nonce}`).digest()
    if (digest[0] === 0 && digest[1] === 0) {
      return { nonce: String(nonce), salt }
    }
    nonce += 1
  }
}

export async function clientKey(request: APIRequestContext): Promise<string> {
  await request.get('/api/home')
  const state = await request.storageState()
  const key = state.cookies.find((c) => c.name === 'client_key')?.value
  if (!key) {
    throw new Error('client_key cookie missing')
  }
  return key
}

export function powHeaders(sessionId: string, extra: Record<string, string> = {}): Record<string, string> {
  const { nonce, salt } = solvePoW(sessionId)
  return {
    'X-PoW-Nonce': nonce,
    'X-PoW-Salt': salt,
    Cookie: `client_key=${sessionId}`,
    ...extra,
  }
}

export async function powPost(
  request: APIRequestContext,
  url: string,
  options: Parameters<APIRequestContext['post']>[1] = {},
) {
  const sessionId = await clientKey(request)
  const extra = (options.headers as Record<string, string> | undefined) || {}
  return request.post(url, {
    ...options,
    headers: powHeaders(sessionId, extra),
  })
}

export async function ensureClientKey(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => document.cookie.includes('client_key='), null, { timeout: 20_000 })
}

export async function loginAsStaff(page: Page, key: string, username = 'admin') {
  await ensureClientKey(page)
  await page.goto('/admin')
  await page.getByPlaceholder('Імʼя...').fill(username)
  await page.getByPlaceholder('Пароль...').fill(key)
  await page.getByRole('button', { name: 'Увійти' }).click()
  await expect(page.getByRole('heading', { name: 'Адмін-панель' })).toBeVisible({ timeout: 60_000 })
}

export async function openThread(page: Page, text: string) {
  await page.locator('[data-testid="thread-link"]').filter({ hasText: text }).first().click()
  await expect(page).toHaveURL(/\/m\/thread\/\d+/)
}

export async function openBoardForm(page: Page) {
  const create = page.getByRole('link', { name: 'Створити тред' }).first()
  if (await create.isVisible().catch(() => false)) {
    await create.click()
  }
  await expect(page.getByPlaceholder('Текст треду...')).toBeVisible()
}

export async function openThreadForm(page: Page) {
  const reply = page.getByRole('link', { name: 'Відповісти в тред' }).first()
  if (await reply.isVisible().catch(() => false)) {
    await reply.click()
  } else {
    await page.getByRole('button', { name: 'Відповісти' }).first().click()
  }
  await expect(page.getByPlaceholder(/Написати відповідь/)).toBeVisible()
}
