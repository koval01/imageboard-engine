import { test, expect, createThread, openThread } from './fixtures'
import { loginAsStaff, postGap, powHeaders, powPost, uniquePng, openThreadForm } from './helpers'

test('admin login with test account', async ({ adminPage }) => {
  await expect(adminPage.getByRole('heading', { name: 'Адмін-панель' })).toBeVisible()
  await expect(adminPage.getByRole('button', { name: 'Огляд' })).toBeVisible()
  await expect(adminPage.getByRole('button', { name: 'Скарги' })).toBeVisible()
  await expect(adminPage.getByText('Всього постів')).toBeVisible()
})

test('wrong admin password is rejected', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => document.cookie.includes('client_key='))
  await page.goto('/admin')
  await page.getByPlaceholder('Імʼя...').fill('admin')
  await page.getByPlaceholder('Пароль...').fill('definitely-wrong')
  await page.getByRole('button', { name: 'Увійти' }).click()
  await expect(page.getByText('Невірний пароль')).toBeVisible({ timeout: 60_000 })
})

test('admin can delete a thread and media is gone', async ({ page, adminPage, request }) => {
  const body = `e2e-видалити-${Date.now()}`
  await createThread(page, body, uniquePng())
  await openThread(page, body)
  const mediaSrc = await page.locator('img').first().getAttribute('src')

  await adminPage.goto('/m')
  await openThread(adminPage, body)
  adminPage.once('dialog', (d) => d.accept())
  await adminPage.getByTestId('delete-content').first().click()

  await expect(adminPage.getByRole('heading', { name: 'Активні треди' })).toBeVisible({ timeout: 30_000 })
  await page.goto('/m')
  await expect(page.getByText(body)).toHaveCount(0, { timeout: 30_000 })

  if (mediaSrc) {
    const media = await request.get(mediaSrc)
    expect([404, 403]).toContain(media.status())
    const head = await request.head(mediaSrc)
    expect([404, 403, 405]).toContain(head.status())
  }
})

test('admin can delete a reply', async ({ page, adminPage }) => {
  const body = `e2e-пост-база-${Date.now()}`
  await createThread(page, body)
  await openThread(page, body)
  const reply = `e2e-пост-відповідь-${Date.now()}`
  await postGap()
  await openThreadForm(page)
  await page.getByPlaceholder(/Написати відповідь/).fill(reply)
  await page.getByRole('button', { name: 'Надіслати' }).click()
  await expect(page.getByText(reply)).toBeVisible({ timeout: 60_000 })

  await adminPage.goto('/m')
  await openThread(adminPage, body)
  adminPage.once('dialog', (d) => d.accept())
  await adminPage.getByTestId('delete-content').nth(1).click()
  await expect(adminPage.getByText(reply)).toHaveCount(0, { timeout: 30_000 })
})

test('admin can ban and wipe content', async ({ page, adminPage, request }) => {
  const body = `e2e-бан-${Date.now()}`
  const ip = `198.51.100.${1 + Math.floor(Math.random() * 250)}`
  const created = await powPost(request, '/api/m/submit', {
    headers: { 'CF-Connecting-IP': ip },
    multipart: {
      content: body,
      file: { name: 'wipe.png', mimeType: 'image/png', buffer: uniquePng() },
    },
  })
  expect(created.ok()).toBeTruthy()

  await adminPage.goto('/m')
  await expect(adminPage.getByText(body).first()).toBeVisible({ timeout: 30_000 })
  await openThread(adminPage, body)
  const mediaSrc = await adminPage.locator('img').first().getAttribute('src')
  adminPage.once('dialog', (d) => d.accept())
  await adminPage.getByTestId('ban-user').first().click()

  await page.goto('/m')
  await expect(page.getByText(body)).toHaveCount(0, { timeout: 30_000 })
  if (mediaSrc) {
    const media = await request.get(mediaSrc)
    expect([404, 403]).toContain(media.status())
    const head = await request.head(mediaSrc)
    expect([404, 403, 405]).toContain(head.status())
  }
})

test('admin reports tab lists a user report', async ({ page, adminPage }) => {
  const body = `e2e-репорт-адмін-${Date.now()}`
  await createThread(page, body)
  await openThread(page, body)
  const reported = page.waitForResponse(
    (r) => r.url().includes('/api/report') && r.request().method() === 'POST',
  )
  await page.getByTestId('report-post').first().click()
  expect((await reported).ok()).toBeTruthy()

  await adminPage.goto('/admin')
  await adminPage.getByRole('button', { name: 'Скарги' }).click()
  await expect(adminPage.getByText(body).first()).toBeVisible({ timeout: 30_000 })
})

test('admin investigate tab is Ukrainian', async ({ adminPage }) => {
  await adminPage.getByRole('button', { name: 'Розслідування' }).click()
  await expect(adminPage.getByPlaceholder(/IP, ID сесії/)).toBeVisible()
  await expect(adminPage.getByRole('button', { name: 'Шукати' })).toBeVisible()
})

test('guest cannot open admin stats', async ({ request }) => {
  const res = await request.get('/api/admin/stats')
  expect(res.status()).toBe(403)
})

test('janitor cannot ban or delete', async ({ page }) => {
  const key = process.env.E2E_JANITOR_KEY || 'E2e-Mod-Key#42x!'
  await loginAsStaff(page, key, 'janitor')
  await expect(page.getByRole('button', { name: 'Огляд' })).toBeVisible()

  const stats = await page.request.get('/api/admin/stats')
  expect(stats.status()).toBe(200)

  const cookies = await page.context().cookies()
  const sessionId = cookies.find((c) => c.name === 'client_key')?.value
  expect(sessionId).toBeTruthy()
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

  const ban = await page.request.post('/api/admin/ban', {
    headers: powHeaders(sessionId!, { Cookie: cookieHeader }),
    data: { ip: '203.0.113.9', reason: 'x', duration: 1, delete_content: false },
  })
  expect(ban.status()).toBe(403)

  const del = await page.request.post('/api/admin/delete', {
    headers: powHeaders(sessionId!, { Cookie: cookieHeader }),
    data: { id: 1, type_: 'thread' },
  })
  expect(del.status()).toBe(403)
})
