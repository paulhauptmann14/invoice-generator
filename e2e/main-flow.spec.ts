import { expect, test, type Page } from '@playwright/test'

// Runs against the self-hosted stack (HTTPS through Caddy), see deploy/self-hosted/tests/stack-test.sh e2e.
const email = process.env.E2E_EMAIL ?? ''
const password = process.env.E2E_PASSWORD ?? ''
// The stack was installed with REGISTRATION=on: the flow starts with creating the account and the first business.
const registration = process.env.E2E_REGISTRATION === 'on'

declare global {
  interface Window {
    __reportCsp: (violation: string) => void
  }
}

// The live preview fetches PDFs in the background; switch it off to keep the run fast and deterministic.
// CSP violations of every document (also the one after the router refresh that follows an export) are reported to the test at once.
async function prepare(page: Page, violations: string[]) {
  await page.exposeFunction('__reportCsp', (violation: string) => violations.push(violation))
  await page.addInitScript(() => {
    try {
      localStorage.setItem('rechnung-vorschau', '0')
      localStorage.setItem('einstellungen-vorschau', '0')
    } catch {
      // storage blocked: the preview stays on, the test still works
    }
    // Chromium offers the File System Access API (native save dialog); remove it so the export falls back to a normal download.
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true, writable: true })
    document.addEventListener('securitypolicyviolation', (e) => window.__reportCsp(`${e.violatedDirective} ${e.blockedURI} on ${location.pathname} (${e.sourceFile}:${e.lineNumber}) ${e.sample}`))
  })
}

test('main flow', async ({ page }) => {
  // A unique name keeps the test repeatable on a stack that already holds earlier runs.
  const customerName = `E2E Kunde ${Date.now()}`
  expect(email, 'E2E_EMAIL must be set').not.toBe('')
  expect(password, 'E2E_PASSWORD must be set').not.toBe('')
  const violations: string[] = []
  await prepare(page, violations)

  let tenantBase: string
  if (registration) {
    // Sign-up (Server Action behind the HTTPS proxy), welcome page, first business, then its company settings.
    await page.goto('/login')
    await page.getByRole('link', { name: 'Neu hier? Konto anlegen' }).click()
    await page.waitForURL(/\/registrieren$/)
    await page.getByLabel('E-Mail').fill(email)
    await page.getByLabel('Passwort', { exact: true }).fill(password)
    await page.getByLabel('Passwort wiederholen').fill(`${password}-anders`)
    await page.getByRole('button', { name: 'Konto anlegen', exact: true }).click()
    await expect(page.getByText('Die Passwörter stimmen nicht überein.')).toBeVisible()
    // A rejected submit clears the password fields (form reset): type both again.
    await page.getByLabel('Passwort', { exact: true }).fill(password)
    await page.getByLabel('Passwort wiederholen').fill(password)
    await page.getByRole('button', { name: 'Konto anlegen', exact: true }).click()
    await page.waitForURL(/\/willkommen$/)
    await expect(page.getByRole('heading', { name: 'Willkommen!' })).toBeVisible()
    await page.getByLabel('Name des Betriebs').fill('E2E Betrieb')
    await page.getByRole('button', { name: 'Betrieb anlegen' }).click()
    await page.waitForURL(/\/b\/[0-9a-f-]{36}\/einstellungen\/firma\?angelegt=1/)
    await expect(page.getByText('Betrieb angelegt. Ergänze jetzt die Firmendaten.')).toBeVisible()
    tenantBase = new URL(page.url()).pathname.match(/^\/b\/[0-9a-f-]{36}/)![0]
  } else {
    // Login (Server Action behind the HTTPS proxy, session cookie set)
    await page.goto('/login')
    await expect(page.getByRole('link', { name: 'Neu hier? Konto anlegen' })).toHaveCount(0)
    await page.getByLabel('E-Mail').fill(email)
    await page.getByLabel('Passwort', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
    await page.waitForURL(/\/b\/[0-9a-f-]{36}\//)
    tenantBase = new URL(page.url()).pathname.match(/^\/b\/[0-9a-f-]{36}/)![0]
  }

  // Company data (export stays locked until street, postal code, city and tax number are set)
  await page.goto(`${tenantBase}/einstellungen/firma`)
  await page.getByLabel(/^Straße und Hausnummer/).fill('Testweg 1')
  await page.getByLabel(/^PLZ/).fill('94032')
  await page.getByLabel(/^Ort/).fill('Passau')
  await page.getByLabel(/^Steuernummer/).fill('123/456/78901')
  await page.getByRole('button', { name: 'Speichern', exact: true }).click()
  await page.waitForURL(/einstellungen\/firma\?gespeichert=1/)
  await expect(page.getByLabel(/^Ort/)).toHaveValue('Passau')

  // Customer
  await page.goto(`${tenantBase}/kunden/neu`)
  await page.getByLabel(/^Name oder Firma/).fill(customerName)
  await page.getByLabel(/^Straße und Hausnummer/).fill('Kundenstraße 2')
  await page.getByLabel(/^PLZ/).fill('80331')
  await page.getByLabel(/^Ort/).fill('München')
  await page.getByRole('button', { name: 'Kunde anlegen' }).click()
  await page.waitForURL(/kunden\?gespeichert=1/)
  await expect(page.getByText(customerName).first()).toBeVisible()

  // Invoice with two positions
  await page.goto(`${tenantBase}/rechnungen/neu`)
  await page.getByRole('combobox', { name: 'Kunde aus dem Kundenstamm' }).click()
  await page.getByRole('option', { name: customerName }).click()
  await expect(page.getByLabel(/^Name oder Firma/)).toHaveValue(customerName)
  await page.getByLabel('Beschreibung Position 1').fill('Beratung')
  await page.getByLabel('Menge Position 1').fill('2')
  await page.getByLabel('Einzelpreis brutto Position 1').fill('119,00')
  await page.getByRole('button', { name: 'Leere Position' }).click()
  await page.getByLabel('Beschreibung Position 2').fill('Material')
  await page.getByLabel('Menge Position 2').fill('1')
  await page.getByLabel('Einzelpreis brutto Position 2').fill('50,00')
  await page.getByRole('button', { name: 'Rechnung speichern' }).click()
  await page.waitForURL(/\/rechnungen\/[0-9a-f-]{36}\?gespeichert=1/)
  await expect(page.getByText('Rechnung gespeichert.')).toBeVisible()

  // PDF export: runs a Route Handler, stores the PDF in Storage and refreshes the page (the CSP nonce changes)
  await page.getByRole('button', { name: 'PDF exportieren' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: 'Exportieren' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.pdf$/i)

  const archive = page.getByRole('region', { name: 'Archivierte PDFs' })
  const entry = archive.getByRole('link').first()
  await expect(entry).toBeVisible()
  // Downloading the archived PDF goes through Storage behind the internal gateway.
  const href = await entry.getAttribute('href')
  expect(href).toMatch(/\/exports\/[0-9a-f-]{36}$/)
  const archived = await page.request.get(href!)
  expect(archived.status()).toBe(200)
  expect((await archived.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-')


  // Sign out
  await page.getByRole('button', { name: 'Abmelden' }).first().click()
  await page.waitForURL(/\/login/)

  expect(violations, `CSP violations: ${violations.join('; ')}`).toEqual([])
})

test('password reset disabled', async ({ page }) => {
  await prepare(page, [])
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Passwort vergessen?' })).toHaveCount(0)
  const response = await page.goto('/passwort-vergessen')
  expect(response?.status()).toBe(404)
})

test('registration page follows the switch', async ({ page }) => {
  await prepare(page, [])
  await page.goto('/login')
  await expect(page.getByRole('link', { name: 'Neu hier? Konto anlegen' })).toHaveCount(registration ? 1 : 0)
  const response = await page.goto('/registrieren')
  expect(response?.status()).toBe(registration ? 200 : 404)
})
