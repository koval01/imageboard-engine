import { test as base, expect, type Page } from '@playwright/test'
import { ensureClientKey, loginAsStaff, openBoardForm, openThread, postGap, tinyPng } from './helpers'

export { expect, openThread }

export const test = base.extend<{ adminPage: Page }>({
  adminPage: async ({ browser, baseURL }, use) => {
    const context = await browser.newContext({
      baseURL,
      locale: 'uk-UA',
    })
    const page = await context.newPage()
    const key = process.env.E2E_ADMIN_KEY || 'E2e-Staff-Key#42!'
    await loginAsStaff(page, key)
    await use(page)
    await context.close()
  },
})

export async function createThread(page: Page, text: string, image: boolean | Buffer = false) {
  await postGap()
  await ensureClientKey(page)
  await page.goto('/m')
  await openBoardForm(page)
  await page.getByPlaceholder('Текст треду...').fill(text)
  if (image) {
    const buffer = image === true ? tinyPng() : image
    await page.locator('#file-upload-new').setInputFiles({
      name: 'test.png',
      mimeType: 'image/png',
      buffer,
    })
    await expect(page.getByText(/долучено/)).toBeVisible()
  }
  await page.getByRole('button', { name: 'Створити' }).click()
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 60_000 })
}
