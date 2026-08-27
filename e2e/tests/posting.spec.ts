import { test, expect } from '@playwright/test'
import { createThread, openThread } from './fixtures'
import { postGap, tinyPng, openThreadForm, openBoardForm } from './helpers'

test('create a text thread', async ({ page }) => {
  const body = `e2e-тред-${Date.now()}`
  await createThread(page, body)
  await openThread(page, body)
  await expect(page.getByText(body).first()).toBeVisible()
})

test('create a thread with an image', async ({ page }) => {
  const body = `e2e-фото-${Date.now()}`
  await createThread(page, body, true)
  await expect(page.getByText(body).first()).toBeVisible()
  await openThread(page, body)
  await expect(page.locator('img').first()).toBeVisible()
})

test('reply to a thread', async ({ page }) => {
  const body = `e2e-відповідь-база-${Date.now()}`
  await createThread(page, body)
  await openThread(page, body)
  await openThreadForm(page)
  await expect(page.getByPlaceholder(/Написати відповідь/)).toBeVisible()
  const reply = `відповідь-${Date.now()}`
  await postGap()
  await page.getByPlaceholder(/Написати відповідь/).fill(reply)
  await page.locator('#file-upload').setInputFiles({
    name: 'r.png',
    mimeType: 'image/png',
    buffer: tinyPng(),
  }).catch(() => undefined)
  await page.getByRole('button', { name: 'Надіслати' }).click()
  await expect(page.getByText(reply)).toBeVisible({ timeout: 60_000 })
})

test('poll API returns new posts', async ({ page, request }) => {
  const body = `e2e-poll-${Date.now()}`
  await createThread(page, body)
  await openThread(page, body)
  const id = page.url().match(/thread\/(\d+)/)?.[1]
  expect(id).toBeTruthy()
  const res = await request.get(`/api/m/thread/${id}/poll?after=0`)
  expect(res.ok()).toBeTruthy()
  const json = await res.json()
  expect(Array.isArray(json.posts)).toBeTruthy()
})

test('report a post from the UI', async ({ page }) => {
  const body = `e2e-скарга-${Date.now()}`
  await createThread(page, body)
  await openThread(page, body)
  const reported = page.waitForResponse(
    (r) => r.url().includes('/api/report') && r.request().method() === 'POST',
  )
  await page.getByTestId('report-post').first().click()
  expect((await reported).ok()).toBeTruthy()
  await expect(page.getByText('Скаргу надіслано')).toBeVisible()
})

test('empty post is rejected', async ({ page }) => {
  await page.goto('/m')
  await openBoardForm(page)
  await page.getByRole('button', { name: 'Створити' }).click()
  await expect(page.getByText(/Введіть текст або прикріпіть/)).toBeVisible()
})
