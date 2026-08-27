import { test, expect } from '@playwright/test'

const tunnelUrl = process.env.TUNNEL_SMOKE_URL

test.describe('cloudflare tunnel smoke', () => {
  test.skip(!tunnelUrl, 'TUNNEL_SMOKE_URL is not set')

  test('public home and health via tunnel', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: tunnelUrl,
      ignoreHTTPSErrors: true,
      locale: 'uk-UA',
    })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Kryivka' })).toBeVisible()
    const res = await page.request.get('/api/home')
    expect(res.ok()).toBeTruthy()
    const health = await page.request.get('/api/health')
    expect(health.ok()).toBeTruthy()
    await context.close()
  })
})
