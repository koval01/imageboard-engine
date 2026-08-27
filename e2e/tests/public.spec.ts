import { test, expect } from '@playwright/test'

test('home page is Ukrainian and lists boards', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Kryivka' })).toBeVisible()
  await expect(page.getByText('Анонімний український іміджборд.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Дошки' })).toBeVisible()
  await expect(page.getByRole('link', { name: /\/m\// }).first()).toBeVisible()
})

test('board page loads', async ({ page }) => {
  await page.goto('/m')
  await page.getByRole('link', { name: 'Створити тред' }).first().click()
  await expect(page.getByPlaceholder('Текст треду...')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Активні треди' })).toBeVisible()
})

test('unknown route shows Ukrainian 404', async ({ page }) => {
  await page.goto('/this-page-does-not-exist-xyz')
  await expect(page.getByText(/не знайдено|Не вдалося/i)).toBeVisible()
})

test('health endpoint is ok', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.ok()).toBeTruthy()
  expect(await res.json()).toMatchObject({ status: 'ok' })
})

test('home API does not leak ip or session to guests', async ({ request }) => {
  const res = await request.get('/api/home')
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  for (const t of body.recent_threads || []) {
    expect(t.ip_address == null).toBeTruthy()
    expect(t.session_id == null).toBeTruthy()
  }
})
