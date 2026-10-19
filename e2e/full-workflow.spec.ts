import { readFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { expect as baseExpect, test as baseTest, type Browser, type Locator, type Page } from '@playwright/test'

// Daily-workflow suite against the LOCAL stack (production build + local Supabase with supabase/seed.sql).
// Run: E2E_LOCAL=1 E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/full-workflow.spec.ts
// It relies on the seed users and businesses, so it is skipped everywhere else (e.g. the self-hosted stack test).
baseTest.skip(process.env.E2E_LOCAL !== '1', 'local seed data only')

const expect = baseExpect.configure({ timeout: 10_000 })

const EMAIL = 'dev@invoice.localhost'
const STRANGER = 'stranger@invoice.localhost'
const PASSWORD = 'lokales-dev-passwort-123'
const GASTHAUS = 'c0000000-0000-4000-8000-000000000001'
const METZGEREI = 'c0000000-0000-4000-8000-000000000002'
const BASE = `/b/${GASTHAUS}`
// Every record created here carries this prefix, so a sweep can find leftovers of earlier (failed) runs.
const PREFIX = 'WF'
const RUN = String(Date.now())

declare global {
  interface Window {
    __reportCsp: (violation: string) => void
    __saved?: { name: string; chunks: number[][]; closed: boolean }
  }
}

type Fixtures = { violations: string[] }

// Every test collects CSP violations of all documents and asserts that there were none at its end.
const test = baseTest.extend<Fixtures>({
  violations: [
    async ({ page }, use) => {
      const violations: string[] = []
      await prepare(page, violations)
      await use(violations)
      expect(violations, `CSP violations: ${violations.join('; ')}`).toEqual([])
    },
    { auto: true },
  ],
})

/**
 * Preview off (it fetches PDFs in the background), CSP violations reported to the test, dialogs accepted
 * (beforeunload of forms with unsaved changes), and the File System Access API removed so exports are plain
 * downloads. Chromium would otherwise open a native save dialog.
 */
async function prepare(page: Page, violations: string[]) {
  page.on('dialog', (dialog) => void dialog.accept().catch(() => undefined))
  await page.exposeFunction('__reportCsp', (violation: string) => violations.push(violation))
  await page.addInitScript(() => {
    try {
      localStorage.setItem('rechnung-vorschau', '0')
      localStorage.setItem('einstellungen-vorschau', '0')
    } catch {
      // storage blocked: the preview stays on, the test still works
    }
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true, writable: true })
    document.addEventListener('securitypolicyviolation', (e) =>
      window.__reportCsp(`${e.violatedDirective} ${e.blockedURI} on ${location.pathname} (${e.sourceFile}:${e.lineNumber}) ${e.sample}`),
    )
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------

const euroFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
/** "143,20 €" with a normal space (the formatter uses a no-break space). */
const eur = (cents: number) => euroFormat.format(cents / 100).replace(/[\s  ]/g, ' ')
const MINUS = '−'
const squash = (text: string) => text.replace(/[\s  ]+/g, ' ').trim()

async function expectText(locator: Locator, expected: string) {
  await expect.poll(async () => squash(await locator.innerText()), { message: `text of ${locator}` }).toBe(expected)
}

/** Fills the login form; retries because a rejected submit resets the form (values can be wiped just after the error shows). */
async function fillLogin(page: Page, email: string, password: string) {
  await expect(async () => {
    await page.getByLabel('E-Mail').fill(email)
    await page.getByLabel('Passwort', { exact: true }).fill(password)
    await expect(page.getByLabel('E-Mail')).toHaveValue(email, { timeout: 1000 })
    await expect(page.getByLabel('Passwort', { exact: true })).toHaveValue(password, { timeout: 1000 })
  }).toPass()
}

/**
 * React resets uncontrolled forms when a rejected server action settles; typing within a few milliseconds of the
 * error appearing can be overwritten by that reset (values come back from the server state). Humans never type
 * that fast, so tests wait a moment after a rejected submit.
 */
const settleAfterRejectedSubmit = (page: Page) => page.waitForTimeout(600)

async function signIn(page: Page, email = EMAIL, landing: RegExp = /\/b\/[0-9a-f-]{36}\//) {
  await page.goto('/login')
  await page.getByLabel('E-Mail').fill(email)
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
  await page.waitForURL(landing)
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Abmelden' }).first().click()
  await page.waitForURL(/\/login/)
}

async function createCustomer(page: Page, name: string, extra: { city?: string } = {}) {
  await page.goto(`${BASE}/kunden/neu`)
  await page.getByLabel(/^Name oder Firma/).fill(name)
  await page.getByLabel(/^Straße und Hausnummer/).fill('Testgasse 5')
  await page.getByLabel(/^PLZ/).fill('94032')
  await page.getByLabel(/^Ort/).fill(extra.city ?? 'Passau')
  await page.getByRole('button', { name: 'Kunde anlegen' }).click()
  await page.waitForURL(/kunden\?gespeichert=1/)
}

async function searchList(page: Page, section: 'kunden' | 'artikel' | 'rechnungen', term: string) {
  await page.goto(`${BASE}/${section}?q=${encodeURIComponent(term)}`)
}

async function archiveCustomer(page: Page, name: string) {
  await searchList(page, 'kunden', name)
  await page.getByRole('link', { name }).first().click()
  await page.getByRole('button', { name: 'Archivieren' }).click()
  await page.waitForURL(/kunden\?archiviert=/)
}

async function createArticle(page: Page, a: { name: string; price: string; vat?: string; unit?: string }) {
  await page.goto(`${BASE}/artikel/neu`)
  await page.getByLabel(/^Bezeichnung/).fill(a.name)
  await page.getByLabel(/^Einzelpreis brutto/).fill(a.price)
  if (a.unit) await page.getByLabel(/^Einheit/).fill(a.unit)
  if (a.vat) await page.getByLabel(/^MwSt\.-Satz/).selectOption(a.vat)
  await page.getByRole('button', { name: 'Artikel anlegen' }).click()
  await page.waitForURL(/artikel\?gespeichert=1/)
}

async function archiveArticle(page: Page, name: string) {
  await searchList(page, 'artikel', name)
  await page.getByRole('link', { name }).first().click()
  await page.getByRole('button', { name: 'Archivieren' }).click()
  await page.waitForURL(/artikel\?archiviert=/)
}

async function chooseCustomer(page: Page, name: string) {
  await page.getByRole('combobox', { name: 'Kunde aus dem Kundenstamm' }).click()
  await page.getByRole('option', { name }).click()
  await expect(page.getByLabel(/^Name oder Firma/)).toHaveValue(name)
}

/** Saves a one-position invoice for the customer and returns its id and number. */
async function createSimpleInvoice(page: Page, customer: string, price = '10,00') {
  await page.goto(`${BASE}/rechnungen/neu`)
  await chooseCustomer(page, customer)
  const number = await page.locator('#inv-number').inputValue()
  await page.getByLabel('Beschreibung Position 1').fill('Testleistung')
  await page.getByLabel('Einzelpreis brutto Position 1').fill(price)
  await page.getByRole('button', { name: 'Rechnung speichern' }).click()
  await page.waitForURL(/\/rechnungen\/[0-9a-f-]{36}\?gespeichert=1/)
  const id = new URL(page.url()).pathname.split('/').pop()!
  return { id, number }
}

/** Deletes the invoice that is open, through the confirmation dialog. */
async function deleteOpenInvoice(page: Page) {
  await page.getByRole('button', { name: 'Löschen', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Endgültig löschen' }).click()
  await page.waitForURL(/rechnungen\?geloescht=1/)
  await expect(page.getByText('Rechnung gelöscht.')).toBeVisible()
}

/** Removes everything this suite may have left behind (also from earlier failed runs). Best effort. */
async function sweep(browser: Browser) {
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL })
  const page = await context.newPage()
  try {
    await signIn(page)
    for (let i = 0; i < 30; i++) {
      await searchList(page, 'rechnungen', `${PREFIX} Kunde`)
      const link = page.getByRole('row').getByRole('link').first()
      if (!(await link.isVisible().catch(() => false))) break
      await link.click()
      await page.waitForURL(/\/rechnungen\/[0-9a-f-]{36}/)
      await deleteOpenInvoice(page)
    }
    for (const [section, label] of [['kunden', 'kunden'], ['artikel', 'artikel']] as const) {
      for (let i = 0; i < 30; i++) {
        await searchList(page, section, `${PREFIX} ${section === 'kunden' ? 'Kunde' : 'Artikel'}`)
        const link = page.getByRole('row').getByRole('link').first()
        if (!(await link.isVisible().catch(() => false))) break
        await link.click()
        await page.getByRole('button', { name: 'Archivieren' }).click()
        await page.waitForURL(new RegExp(`${label}\\?archiviert=`))
      }
    }
  } catch (error) {
    console.warn('sweep failed (leftovers possible):', error)
  } finally {
    await context.close()
  }
}

/** Valid 16x16 PNG built in memory. */
function tinyPng(): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const size = 16
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 2, 0, 0, 0], 8) // 8 bit, RGB, deflate, no filter, no interlace
  const rows = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y++) {
    const offset = y * (size * 3 + 1)
    rows[offset] = 0
    for (let x = 0; x < size; x++) rows.set([0x1f, 0x5f, 0x74], offset + 1 + x * 3)
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}

async function noHorizontalScroll(page: Page, label: string) {
  const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, body: document.body.scrollWidth }))
  expect(m.scroll, `${label}: documentElement scrollWidth ${m.scroll} > clientWidth ${m.client}`).toBeLessThanOrEqual(m.client)
  expect(m.body, `${label}: body scrollWidth ${m.body} > clientWidth ${m.client}`).toBeLessThanOrEqual(m.client)
}

// ---------------------------------------------------------------------------------------------------------------
// a. Sign-in
// ---------------------------------------------------------------------------------------------------------------

test.describe('sign-in', () => {
  test('wrong password, sign-in, sign-out, protected pages', async ({ page }) => {
    // Anonymous visitors are sent to the login page.
    await page.goto(`${BASE}/rechnungen`)
    await page.waitForURL(/\/login/)

    // Empty submit: field errors, no generic error.
    await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
    await expect(page.getByText('Bitte eine gültige E-Mail-Adresse eingeben.')).toBeVisible()
    await expect(page.getByText('Bitte das Passwort eingeben.')).toBeVisible()

    // Wrong password: generic message, stays on the login page, email kept, password cleared.
    await fillLogin(page, EMAIL, 'das-ist-falsch')
    await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
    await expect(page.getByText('E-Mail oder Passwort ist falsch.')).toBeVisible()
    expect(new URL(page.url()).pathname).toBe('/login')
    await expect(page.getByLabel('E-Mail')).toHaveValue(EMAIL)

    // Unknown account gets the very same message (no account enumeration).
    await settleAfterRejectedSubmit(page)
    await fillLogin(page, 'niemand@invoice.localhost', 'das-ist-falsch')
    await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
    // The message is still visible from the first attempt: wait until this submit has settled (email echoed back).
    await expect(page.getByLabel('E-Mail')).toHaveValue('niemand@invoice.localhost')
    await expect(page.getByRole('button', { name: 'Anmelden', exact: true })).toBeEnabled()
    await expect(page.getByText('E-Mail oder Passwort ist falsch.')).toBeVisible()
    await settleAfterRejectedSubmit(page)

    // Correct credentials: lands in a business.
    await fillLogin(page, EMAIL, PASSWORD)
    await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
    await page.waitForURL(/\/b\/[0-9a-f-]{36}\//)
    await expect(page.getByRole('heading', { name: 'Rechnungen', level: 1 })).toBeVisible()

    // Sign out ends the session: protected pages redirect to /login again.
    await signOut(page)
    await page.goto(`${BASE}/kunden`)
    await page.waitForURL(/\/login/)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// b. Tenant isolation
// ---------------------------------------------------------------------------------------------------------------

test.describe('tenant isolation', () => {
  const customer = `${PREFIX} Kunde Iso ${RUN}`

  test.afterAll(async ({ browser }) => {
    await sweep(browser)
  })

  test('an invoice of one business is invisible in the other', async ({ page }) => {
    await signIn(page)
    await createCustomer(page, customer)
    const { id, number } = await createSimpleInvoice(page, customer)

    // Visible in Gasthaus ...
    await searchList(page, 'rechnungen', customer)
    await expect(page.getByRole('row').filter({ hasText: customer })).toBeVisible()

    // ... switch to Metzgerei through the switcher (same section is kept).
    await page.getByRole('button', { name: /^Betrieb:/ }).click()
    await expect(page.getByRole('menuitem', { name: 'Gasthaus Beispiel' })).toHaveAttribute('aria-current', 'true')
    await page.getByRole('menuitem', { name: 'Metzgerei Beispiel' }).click()
    await page.waitForURL(`**/b/${METZGEREI}/rechnungen`)
    await expect(page.getByRole('button', { name: /^Betrieb:/ })).toContainText('Metzgerei Beispiel')

    // The Gasthaus invoice is not listed there (neither by search nor by number in the unfiltered list).
    await searchList(page, 'rechnungen', customer)
    await page.goto(`/b/${METZGEREI}/rechnungen?q=${encodeURIComponent(customer)}`)
    await expect(page.getByText('Keine Treffer')).toBeVisible()
    await page.goto(`/b/${METZGEREI}/rechnungen`)
    await expect(page.getByRole('link', { name: `Rechnung ${number} öffnen` })).toHaveCount(0)
    await expect(page.getByText(customer)).toHaveCount(0)
    // The customer is not in the other business's customer list either.
    await page.goto(`/b/${METZGEREI}/kunden?q=${encodeURIComponent(customer)}`)
    await expect(page.getByText('Keine Treffer')).toBeVisible()

    // The Gasthaus invoice URL under the Metzgerei prefix is a 404 page, and so are its API routes.
    const response = await page.goto(`/b/${METZGEREI}/rechnungen/${id}`)
    expect(response?.status()).toBe(404)
    await expect(page.getByText('Diesen Eintrag gibt es nicht (mehr).')).toBeVisible()
    expect((await page.request.get(`/api/b/${METZGEREI}/invoices/${id}/pdf`)).status()).toBe(404)
    // Exports are POST routes: a foreign business must not archive or render anything either.
    for (const format of ['pdf', 'docx']) {
      const foreign = await page.request.post(`/api/b/${METZGEREI}/invoices/${id}/${format}`, { data: { filename: 'x' } })
      expect(foreign.status(), format).toBe(404)
    }
    // Same invoice under its own business is fine.
    const own = await page.request.get(`/api/b/${GASTHAUS}/invoices/${id}/pdf`)
    expect(own.status()).toBe(200)

    // Cleanup through the UI.
    await page.goto(`${BASE}/rechnungen/${id}`)
    await deleteOpenInvoice(page)
    await archiveCustomer(page, customer)
  })

  test('a user without a business cannot open a business', async ({ page }) => {
    await signIn(page, STRANGER, /\/willkommen/)
    await expect(page.getByRole('heading', { name: 'Willkommen!' })).toBeVisible()

    // Pages: redirected to the welcome page (no business yet) or a not-found page; never the invoice list.
    await page.goto(`${BASE}/rechnungen`)
    const onWelcome = /\/willkommen$/.test(new URL(page.url()).pathname)
    if (!onWelcome) await expect(page.getByRole('heading', { name: 'Nicht gefunden' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Rechnungen', level: 1 })).toHaveCount(0)
    await expect(page.getByText('Gasthaus Beispiel')).toHaveCount(0)

    // API routes answer 401/403/404, never data.
    for (const path of ['invoices/preview', `invoices/${METZGEREI}/pdf`]) {
      const response = await page.request.get(`/api/b/${GASTHAUS}/${path}`)
      expect([403, 404, 405], path).toContain(response.status())
    }
    const logo = await page.request.get(`/api/b/${GASTHAUS}/settings/logo`)
    expect([403, 404]).toContain(logo.status())

    // Do not create a business here: just leave.
    await page.goto('/willkommen')
    await signOut(page)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// c. Customers
// ---------------------------------------------------------------------------------------------------------------

test.describe('customers', () => {
  test('create, find, edit, archive with undo, archived view', async ({ page }) => {
    const name = `${PREFIX} Kunde ${RUN}`
    await signIn(page)

    // Required-field errors first (name empty, email invalid).
    await page.goto(`${BASE}/kunden/neu`)
    await page.getByLabel('E-Mail').fill('kein-email')
    await page.getByRole('button', { name: 'Kunde anlegen' }).click()
    await expect(page.getByText('Bitte die markierten Felder prüfen.')).toBeVisible()
    await expect(page.getByText('Bitte einen Namen eingeben.')).toBeVisible()
    await expect(page.getByText('Bitte eine gültige E-Mail-Adresse eingeben.')).toBeVisible()
    expect(page.url()).toMatch(/kunden\/neu$/)
    await settleAfterRejectedSubmit(page)

    // Now valid.
    await page.getByLabel(/^Name oder Firma/).fill(name)
    await page.getByLabel('E-Mail').fill('kunde@example.com')
    await page.getByLabel(/^Straße und Hausnummer/).fill('Kundenstraße 2')
    await page.getByLabel(/^PLZ/).fill('80331')
    await page.getByLabel(/^Ort/).fill('München')
    await page.getByRole('button', { name: 'Kunde anlegen' }).click()
    await page.waitForURL(/kunden\?gespeichert=1/)
    await expect(page.getByText('Kunde gespeichert.')).toBeVisible()

    // Find through the search field (Enter submits the GET form).
    await page.goto(`${BASE}/kunden`)
    await page.getByRole('searchbox', { name: 'Kunden durchsuchen' }).fill(name.toLowerCase())
    await page.getByRole('searchbox', { name: 'Kunden durchsuchen' }).press('Enter')
    await page.waitForURL(/kunden\?q=/)
    await expect(page.getByRole('link', { name })).toBeVisible()
    await page.getByRole('searchbox', { name: 'Kunden durchsuchen' }).fill(`${name} gibt es nicht`)
    await page.getByRole('searchbox', { name: 'Kunden durchsuchen' }).press('Enter')
    await expect(page.getByText('Keine Treffer')).toBeVisible()

    // Edit.
    await searchList(page, 'kunden', name)
    await page.getByRole('link', { name }).click()
    await page.waitForURL(/kunden\/[0-9a-f-]{36}$/)
    await expect(page.getByLabel(/^Name oder Firma/)).toHaveValue(name)
    await page.getByLabel('Ansprechpartner').fill('Erika Muster')
    await page.getByLabel(/^Ort/).fill('Passau')
    await page.getByRole('button', { name: 'Änderungen speichern' }).click()
    await page.waitForURL(/kunden\?gespeichert=1/)
    await searchList(page, 'kunden', name)
    const row = page.getByRole('row').filter({ hasText: name })
    await expect(row).toContainText('Erika Muster')
    await expect(row).toContainText('Passau')

    // Archive, undo through the banner, then archive again.
    await page.getByRole('link', { name }).click()
    await page.getByRole('button', { name: 'Archivieren' }).click()
    await page.waitForURL(/kunden\?archiviert=/)
    const banner = page.getByRole('status').filter({ hasText: 'Kunde archiviert.' })
    await expect(banner).toBeVisible()
    await expect(page.getByRole('link', { name })).toHaveCount(0)
    await banner.getByRole('button', { name: 'Rückgängig' }).click()
    await page.waitForURL(/kunden\?wiederhergestellt=1/)
    await expect(page.getByText('Kunde wiederhergestellt.')).toBeVisible()
    await searchList(page, 'kunden', name)
    await expect(page.getByRole('link', { name })).toBeVisible()
    await archiveCustomer(page, name)

    // Archived view lists it; the active view does not.
    await page.goto(`${BASE}/kunden?ansicht=archiv&q=${encodeURIComponent(name)}`)
    await expect(page.getByRole('link', { name })).toBeVisible()
    await page.goto(`${BASE}/kunden`)
    await page.getByRole('link', { name: 'Archiviert', exact: true }).click()
    await page.waitForURL(/ansicht=archiv/)
    await expect(page.getByRole('link', { name: 'Archiviert', exact: true })).toHaveAttribute('aria-current', 'page')
    await searchList(page, 'kunden', name)
    await expect(page.getByText('Keine Treffer')).toBeVisible()

    // Archived customers are not offered in the invoice form.
    await page.goto(`${BASE}/rechnungen/neu`)
    await page.getByRole('combobox', { name: 'Kunde aus dem Kundenstamm' }).click()
    await page.getByPlaceholder('Name oder Ort eingeben').fill(name)
    await expect(page.getByText('Kein Kunde gefunden.')).toBeVisible()
    await page.keyboard.press('Escape')
  })
})

// ---------------------------------------------------------------------------------------------------------------
// d. Articles
// ---------------------------------------------------------------------------------------------------------------

test.describe('articles', () => {
  test('create, edit, archive; picker offers active articles only', async ({ page }) => {
    const name = `${PREFIX} Artikel ${RUN}`
    await signIn(page)

    await page.goto(`${BASE}/artikel/neu`)
    await page.getByRole('button', { name: 'Artikel anlegen' }).click()
    await expect(page.getByText('Bitte die markierten Felder prüfen.')).toBeVisible()
    await expect(page.getByText('Bitte eine Bezeichnung eingeben.')).toBeVisible()
    await settleAfterRejectedSubmit(page)
    await page.getByLabel(/^Bezeichnung/).fill(name)
    await page.getByLabel(/^Einzelpreis brutto/).fill('abc')
    await page.getByRole('button', { name: 'Artikel anlegen' }).click()
    await expect(page.getByText('Bitte einen Preis wie 24,90 eingeben.')).toBeVisible()
    await settleAfterRejectedSubmit(page)

    await page.getByLabel(/^Einzelpreis brutto/).fill('24,00')
    await page.getByLabel(/^Einheit/).fill('Portion')
    await page.getByRole('button', { name: 'Artikel anlegen' }).click()
    await page.waitForURL(/artikel\?gespeichert=1/)
    await expect(page.getByText('Artikel gespeichert.')).toBeVisible()

    await page.getByRole('searchbox', { name: 'Artikel durchsuchen' }).fill(name)
    await page.getByRole('searchbox', { name: 'Artikel durchsuchen' }).press('Enter')
    await page.waitForURL(/artikel\?q=/)
    const row = page.getByRole('row').filter({ hasText: name })
    await expect(row).toContainText(eur(2400))
    await expect(row).toContainText('Portion')

    // Edit the price.
    await page.getByRole('link', { name }).click()
    await page.waitForURL(/artikel\/[0-9a-f-]{36}$/)
    await expect(page.getByLabel(/^Einzelpreis brutto/)).toHaveValue('24,00')
    await page.getByLabel(/^Einzelpreis brutto/).fill('25,50')
    await page.getByRole('button', { name: 'Änderungen speichern' }).click()
    await page.waitForURL(/artikel\?gespeichert=1/)
    await searchList(page, 'artikel', name)
    await expect(page.getByRole('row').filter({ hasText: name })).toContainText(eur(2550))

    // Active: offered in the invoice article picker with its price.
    await page.goto(`${BASE}/rechnungen/neu`)
    await page.getByRole('combobox').filter({ hasText: 'Artikel hinzufügen' }).click()
    await page.getByPlaceholder('Artikel suchen').fill(name)
    const option = page.getByRole('option', { name })
    await expect(option).toBeVisible()
    await expect(option).toContainText(eur(2550))
    await page.keyboard.press('Escape')

    // Archive with undo, then archive for good: the picker no longer offers it.
    await archiveArticle(page, name)
    const banner = page.getByRole('status').filter({ hasText: 'Artikel archiviert.' })
    await banner.getByRole('button', { name: 'Rückgängig' }).click()
    await page.waitForURL(/artikel\?wiederhergestellt=1/)
    await expect(page.getByText('Artikel wiederhergestellt.')).toBeVisible()
    await archiveArticle(page, name)

    await page.goto(`${BASE}/rechnungen/neu`)
    await page.getByRole('combobox').filter({ hasText: 'Artikel hinzufügen' }).click()
    await page.getByPlaceholder('Artikel suchen').fill(name)
    await expect(page.getByText('Kein Artikel gefunden.')).toBeVisible()
    await page.keyboard.press('Escape')

    await page.goto(`${BASE}/artikel?ansicht=archiv&q=${encodeURIComponent(name)}`)
    await expect(page.getByRole('link', { name })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------------------------------------------
// e. Invoice full flow
// ---------------------------------------------------------------------------------------------------------------

test.describe('invoice', () => {
  test.afterAll(async ({ browser }) => {
    await sweep(browser)
  })

  test('write, discount, totals, save, edit, export, copy, delete', async ({ page }) => {
    test.setTimeout(180_000)
    const customer = `${PREFIX} Kunde Rechnung ${RUN}`
    const article = `${PREFIX} Artikel Rechnung ${RUN}`
    await signIn(page)
    await createCustomer(page, customer)
    await createArticle(page, { name: article, price: '24,00', vat: '7', unit: 'Portion' })

    await page.goto(`${BASE}/rechnungen/neu`)
    await chooseCustomer(page, customer)
    const number = await page.locator('#inv-number').inputValue()
    expect(number).not.toBe('')

    // Position 1: the article (replaces the empty starter line), quantity 2 -> 48,00 EUR at 7 %.
    await page.getByRole('combobox').filter({ hasText: 'Artikel hinzufügen' }).click()
    await page.getByRole('option', { name: article }).click()
    await expect(page.getByLabel('Beschreibung Position 1')).toHaveValue(article)
    await expect(page.getByLabel('Einzelpreis brutto Position 1')).toHaveValue('24,00')
    await page.getByLabel('Menge Position 1').fill('2')
    // Position 2: free position, 1 x 100,00 EUR at 19 %.
    await page.getByRole('button', { name: 'Freie Position' }).click()
    await page.getByLabel('Beschreibung Position 2').fill('Beratung')
    await page.getByLabel('Menge Position 2').fill('1')
    await page.getByLabel('Einzelpreis brutto Position 2').fill('100,00')
    await page.getByLabel('MwSt.-Satz Position 2').selectOption('19')

    const totals = page.locator('dl').filter({ hasText: 'Gesamtbetrag brutto' })
    const dd = (label: string) => totals.locator('dt', { hasText: label }).locator('xpath=following-sibling::dd[1]')

    // Expected values computed from the inputs (cents).
    const line1 = 2 * 2400 // 48,00
    const line2 = 10000
    await expectText(dd('Gesamtbetrag brutto'), eur(line1 + line2))

    // Item discount 10 % on position 1.
    const itemDiscount = page.getByRole('group', { name: 'Rabatt Position 1' })
    await itemDiscount.getByRole('button', { name: 'Rabatt' }).click()
    await itemDiscount.getByLabel('Rabatt', { exact: true }).fill('10')
    const line1Discount = Math.round(line1 * 0.1) // 480
    await expect(itemDiscount).toContainText(`${MINUS}${eur(line1Discount)}`)
    const line1Net = line1 - line1Discount // 4320
    await expectText(dd('Gesamtbetrag brutto'), eur(line1Net + line2))

    // Switch to euros: an amount above the position total is rejected live.
    await itemDiscount.getByRole('button', { name: /Euro/ }).click()
    await expect(itemDiscount.getByRole('button', { name: /Euro/ })).toHaveAttribute('aria-pressed', 'true')
    await itemDiscount.getByLabel('Rabatt', { exact: true }).fill('999')
    await expect(page.getByText('Der Rabatt ist höher als der Betrag der Position.')).toBeVisible()
    // A valid amount works as well.
    await itemDiscount.getByLabel('Rabatt', { exact: true }).fill('4,80')
    await expect(page.getByText('Der Rabatt ist höher als der Betrag der Position.')).toHaveCount(0)
    await expectText(dd('Gesamtbetrag brutto'), eur(line1Net + line2))
    // Back to percent, 10 %.
    await itemDiscount.getByRole('button', { name: /Prozent/ }).click()
    await expect(itemDiscount.getByRole('button', { name: /Prozent/ })).toHaveAttribute('aria-pressed', 'true')
    await itemDiscount.getByLabel('Rabatt', { exact: true }).fill('10')
    await expect(page.getByText('Der Rabatt ist höher als der Betrag der Position.')).toHaveCount(0)
    await expectText(dd('Gesamtbetrag brutto'), eur(line1Net + line2))

    // Invoice discount 5 %.
    await page.getByRole('button', { name: 'Rabatt auf die Rechnung' }).click()
    await page.locator('#inv-discount').fill('5')
    const subtotal = line1Net + line2 // 14320
    const invoiceDiscount = Math.round(subtotal * 0.05) // 716
    const gross = subtotal - invoiceDiscount // 13604
    await expectText(dd('Zwischensumme'), eur(subtotal))
    await expectText(dd('abzüglich 5 % Rabatt'), `${MINUS}${eur(invoiceDiscount)}`)
    await expectText(dd('Gesamtbetrag brutto'), eur(gross))
    // VAT groups: discount split proportionally (exact here: 216 + 500 cents), VAT extracted per group.
    const share7 = Math.round((invoiceDiscount * line1Net) / subtotal)
    const share19 = invoiceDiscount - share7
    const g7 = line1Net - share7
    const g19 = line2 - share19
    const net = (g: number, rate: number) => Math.round((g * 100) / (100 + rate))
    await expectText(dd('Nettobetrag 7 %'), eur(net(g7, 7)))
    await expectText(dd('enthaltene MwSt. 7 %'), eur(g7 - net(g7, 7)))
    await expectText(dd('Nettobetrag 19 %'), eur(net(g19, 19)))
    await expectText(dd('enthaltene MwSt. 19 %'), eur(g19 - net(g19, 19)))

    // Remove position 2 and restore it with "Rückgängig".
    await page.getByRole('button', { name: 'Position 2 entfernen' }).click()
    await expect(page.getByLabel('Beschreibung Position 2')).toHaveCount(0)
    await expect(page.getByText('„Beratung“ entfernt.')).toBeVisible()
    const withoutLine2 = line1Net - Math.round(line1Net * 0.05)
    await expectText(dd('Gesamtbetrag brutto'), eur(withoutLine2))
    await page.getByRole('button', { name: 'Rückgängig' }).click()
    await expect(page.getByLabel('Beschreibung Position 2')).toHaveValue('Beratung')
    await expect(page.getByLabel('Einzelpreis brutto Position 2')).toHaveValue('100,00')
    await expect(page.getByLabel('MwSt.-Satz Position 2')).toHaveValue('19')
    await expectText(dd('Gesamtbetrag brutto'), eur(gross))

    // Save.
    await page.getByRole('button', { name: 'Rechnung speichern' }).click()
    await page.waitForURL(/\/rechnungen\/[0-9a-f-]{36}\?gespeichert=1/)
    await expect(page.getByText('Rechnung gespeichert.')).toBeVisible()
    const invoiceId = new URL(page.url()).pathname.split('/').pop()!
    await expect(page.locator('#inv-number')).toHaveValue(number)
    await expectText(dd('Gesamtbetrag brutto'), eur(gross))
    await expect(page.getByLabel('Menge Position 1')).toHaveValue('2')
    await expect(page.getByRole('group', { name: 'Rabatt Position 1' }).getByLabel('Rabatt', { exact: true })).toHaveValue('10')
    await expect(page.locator('#inv-discount')).toHaveValue('5')

    // The list shows the same gross.
    await searchList(page, 'rechnungen', customer)
    const row = page.getByRole('row').filter({ hasText: customer })
    await expect(row).toHaveCount(1)
    expect(squash(await row.innerText())).toContain(eur(gross))
    expect(squash(await row.innerText())).toContain(number)

    // Edit: quantity of position 2 -> 2. Unsaved changes lock the exports and say why.
    await page.goto(`${BASE}/rechnungen/${invoiceId}`)
    await expect(page.getByRole('button', { name: 'PDF exportieren' })).toBeEnabled()
    await page.getByLabel('Menge Position 2').fill('2')
    await expect(page.getByRole('button', { name: 'PDF exportieren' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Word-Datei exportieren' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'PDF ansehen' })).toBeDisabled()
    await expect(page.getByText('Ungespeicherte Änderungen – bitte zuerst speichern.')).toBeVisible()
    const subtotal2 = line1Net + 2 * line2
    const gross2 = subtotal2 - Math.round(subtotal2 * 0.05) // 24320 - 1216
    await expectText(dd('Gesamtbetrag brutto'), eur(gross2))
    await page.getByRole('button', { name: 'Änderungen speichern' }).click()
    await page.waitForURL(/\?gespeichert=1/)
    await expect(page.getByText('Rechnung gespeichert.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'PDF exportieren' })).toBeEnabled()
    await expect(page.getByText('Ungespeicherte Änderungen – bitte zuerst speichern.')).toHaveCount(0)
    await expectText(dd('Gesamtbetrag brutto'), eur(gross2))
    await searchList(page, 'rechnungen', customer)
    expect(squash(await page.getByRole('row').filter({ hasText: customer }).innerText())).toContain(eur(gross2))
    await page.goto(`${BASE}/rechnungen/${invoiceId}`)

    // "PDF ansehen": link to the PDF route, which returns a PDF.
    const viewHref = await page.getByRole('link', { name: 'PDF ansehen' }).getAttribute('href')
    expect(viewHref).toBe(`/api/b/${GASTHAUS}/invoices/${invoiceId}/pdf`)
    const view = await page.request.get(viewHref!)
    expect(view.status()).toBe(200)
    expect(view.headers()['content-type']).toContain('application/pdf')
    expect((await view.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-')

    // PDF export through the dialog (download + archive).
    await expect(page.getByText('Noch nicht exportiert.')).toBeVisible()
    await page.getByRole('button', { name: 'PDF exportieren' }).click()
    const pdfDialog = page.getByRole('dialog')
    await expect(pdfDialog.getByRole('button', { name: 'Exportieren', exact: true })).toBeVisible()
    const pdfPromise = page.waitForEvent('download')
    await pdfDialog.getByRole('button', { name: 'Exportieren', exact: true }).click()
    const pdfDownload = await pdfPromise
    expect(pdfDownload.suggestedFilename()).toMatch(/\.pdf$/i)
    expect(readFileSync((await pdfDownload.path())!).subarray(0, 5).toString('latin1')).toBe('%PDF-')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByText('exportiert und archiviert.')).toBeVisible()
    const archive = page.getByRole('region', { name: 'Archivierte PDFs' })
    const entry = archive.getByRole('link').first()
    await expect(entry).toBeVisible()
    await expect(entry).toContainText(pdfDownload.suggestedFilename())
    const archivedHref = await entry.getAttribute('href')
    expect(archivedHref).toMatch(/\/exports\/[0-9a-f-]{36}$/)
    const archived = await page.request.get(archivedHref!)
    expect(archived.status()).toBe(200)
    expect((await archived.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-')

    // Word export (download only, not archived).
    await page.getByRole('button', { name: 'Word-Datei exportieren' }).click()
    const docxDialog = page.getByRole('dialog')
    const docxPromise = page.waitForEvent('download')
    await docxDialog.getByRole('button', { name: 'Exportieren', exact: true }).click()
    const docxDownload = await docxPromise
    expect(docxDownload.suggestedFilename()).toMatch(/\.docx$/i)
    expect(readFileSync((await docxDownload.path())!).subarray(0, 2).toString('latin1')).toBe('PK')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(archive.getByRole('link')).toHaveCount(1)

    // Copy: new number, discounts kept.
    await page.getByRole('button', { name: 'Kopieren' }).click()
    await page.waitForURL(/\/rechnungen\/[0-9a-f-]{36}\?kopiert=1/)
    const copyId = new URL(page.url()).pathname.split('/').pop()!
    expect(copyId).not.toBe(invoiceId)
    await expect(page.getByText(/^Kopie angelegt/)).toBeVisible()
    const copyNumber = await page.locator('#inv-number').inputValue()
    expect(copyNumber).not.toBe(number)
    await expect(page.getByRole('group', { name: 'Rabatt Position 1' }).getByLabel('Rabatt', { exact: true })).toHaveValue('10')
    await expect(page.locator('#inv-discount')).toHaveValue('5')
    await expectText(dd('Gesamtbetrag brutto'), eur(gross2))
    await expect(page.getByText('Noch nicht exportiert.')).toBeVisible()

    // Delete the copy (the confirmation dialog can be cancelled first), then the original.
    await page.getByRole('button', { name: 'Löschen', exact: true }).click()
    await expect(page.getByRole('alertdialog')).toContainText(`Rechnung ${copyNumber} löschen?`)
    await page.getByRole('alertdialog').getByRole('button', { name: 'Abbrechen' }).click()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await deleteOpenInvoice(page)
    await page.goto(`${BASE}/rechnungen/${invoiceId}`)
    await deleteOpenInvoice(page)

    // Gone from the list and from the routes.
    await searchList(page, 'rechnungen', customer)
    await expect(page.getByText('Keine Treffer')).toBeVisible()
    expect((await page.request.get(`/api/b/${GASTHAUS}/invoices/${invoiceId}/pdf`)).status()).toBe(404)
    const deletedPage = await page.goto(`${BASE}/rechnungen/${copyId}`)
    expect(deletedPage?.status()).toBe(404)

    // Archive what the test created.
    await archiveCustomer(page, customer)
    await archiveArticle(page, article)
  })

  test('PDF export asks where to save when the browser supports it', async ({ page }) => {
    const customer = `${PREFIX} Kunde Picker ${RUN}`
    // Stub registered after the default init script (which removes the picker): fake handle collecting the bytes.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        writable: true,
        value: async (options: { suggestedName: string }) => {
          const saved = { name: options.suggestedName, chunks: [] as number[][], closed: false }
          window.__saved = saved
          return {
            name: options.suggestedName,
            createWritable: async () => ({
              write: async (data: Blob) => {
                saved.chunks.push(Array.from(new Uint8Array(await data.arrayBuffer())))
              },
              close: async () => {
                saved.closed = true
              },
              abort: async () => undefined,
            }),
          }
        },
      })
    })
    await signIn(page)
    await createCustomer(page, customer)
    const { id } = await createSimpleInvoice(page, customer)

    await page.getByRole('button', { name: 'PDF exportieren' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Vorschlag im Speichern-Dialog:')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Exportieren', exact: true })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Speichern unter …' }).click()
    await expect(page.getByText('exportiert und archiviert.')).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    const saved = await page.evaluate(() => window.__saved && { name: window.__saved.name, closed: window.__saved.closed, bytes: window.__saved.chunks.flat() })
    expect(saved, 'the stubbed picker was called').toBeTruthy()
    expect(saved!.name).toMatch(/\.pdf$/i)
    expect(saved!.closed).toBe(true)
    expect(Buffer.from(saved!.bytes.slice(0, 5)).toString('latin1')).toBe('%PDF-')
    // Archived as well.
    await expect(page.getByRole('region', { name: 'Archivierte PDFs' }).getByRole('link')).toHaveCount(1)

    await page.goto(`${BASE}/rechnungen/${id}`)
    await deleteOpenInvoice(page)
    await archiveCustomer(page, customer)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// f. Settings (every changed value is restored)
// ---------------------------------------------------------------------------------------------------------------

test.describe('settings', () => {
  test('Firma: save and reload', async ({ page }) => {
    await signIn(page)
    await page.goto(`${BASE}/einstellungen/firma`)
    const owner = page.getByLabel(/^Inhaber/)
    const original = await owner.inputValue()
    const changed = `${PREFIX} Inhaber ${RUN}`
    try {
      // Validation: a required field cleared is rejected and nothing is saved.
      const street = page.getByLabel(/^Straße und Hausnummer/)
      const originalStreet = await street.inputValue()
      await street.fill('')
      await page.getByRole('button', { name: 'Speichern', exact: true }).click()
      await expect(page.getByText(/Bitte .*prüfen|Bitte/).first()).toBeVisible()
      expect(page.url()).not.toContain('gespeichert=1')
      await street.fill(originalStreet)

      await owner.fill(changed)
      await expect(page.getByText('Ungespeicherte Änderungen')).toBeVisible()
      await page.getByRole('button', { name: 'Speichern', exact: true }).click()
      await page.waitForURL(/firma\?gespeichert=1/)
      await expect(page.getByText('Firmendaten gespeichert.')).toBeVisible()
      await page.reload()
      await expect(page.getByLabel(/^Inhaber/)).toHaveValue(changed)
    } finally {
      await page.goto(`${BASE}/einstellungen/firma`)
      await page.getByLabel(/^Inhaber/).fill(original)
      await page.getByRole('button', { name: 'Speichern', exact: true }).click()
      await page.waitForURL(/firma\?gespeichert=1/)
      await expect(page.getByLabel(/^Inhaber/)).toHaveValue(original)
    }
  })

  test('Zahlung: add a bank account and remove it again', async ({ page }) => {
    await signIn(page)
    await page.goto(`${BASE}/einstellungen/zahlung`)
    // The fieldsets have no accessible name (see the accessible-name test below), so they are found by structure.
    const accounts = page.locator('section[aria-labelledby="bank-heading"] fieldset')
    const ibansOf = async () => {
      const values: string[] = []
      for (const input of await page.getByLabel(/^IBAN/).all()) values.push(await input.inputValue())
      return values
    }
    const before = await ibansOf()
    const count = await accounts.count()
    test.skip(count >= 3, 'already three bank accounts: the add button is gone')
    try {
      await page.getByRole('button', { name: 'Bankverbindung hinzufügen' }).click()
      const added = accounts.nth(count)
      await added.getByLabel('Bank', { exact: true }).fill(`${PREFIX} Bank`)
      await added.getByLabel(/^IBAN/).fill('DE89370400440532013000')
      await page.getByRole('button', { name: 'Speichern', exact: true }).click()
      await page.waitForURL(/zahlung\?gespeichert=1/)
      await expect(page.getByText('Zahlungsangaben gespeichert.')).toBeVisible()
      await page.reload()
      await expect(accounts).toHaveCount(count + 1)
      const after = await ibansOf()
      expect(after.map((v) => v.replace(/\s/g, ''))).toContain('DE89370400440532013000')
    } finally {
      await page.goto(`${BASE}/einstellungen/zahlung`)
      for (let i = (await accounts.count()) - 1; i >= count; i--) {
        await page.getByRole('button', { name: `Bankverbindung ${i + 1} entfernen` }).click()
      }
      await page.getByRole('button', { name: 'Speichern', exact: true }).click()
      await page.waitForURL(/zahlung\?gespeichert=1/)
    }
    await expect(accounts).toHaveCount(count)
    expect(await ibansOf()).toEqual(before)
  })

  // The <legend> must be the first child of the fieldset, otherwise the group has no accessible name for screen readers.
  test('Zahlung: bank account groups have an accessible name', async ({ page }) => {
    await signIn(page)
    await page.goto(`${BASE}/einstellungen/zahlung`)
    await expect(page.getByRole('group', { name: 'Bankverbindung 1' })).toBeVisible({ timeout: 3000 })
  })

  test('Nummern & Dateien: create a number range and archive it', async ({ page }) => {
    const name = `${PREFIX} Kreis ${RUN}`
    await signIn(page)
    await page.goto(`${BASE}/einstellungen/nummern`)
    await page.getByRole('button', { name: 'Neuer Nummernkreis' }).click()
    // Invalid format first.
    await page.getByLabel(/^Name/).fill(name)
    await page.getByLabel(/^Format/).fill('ohne Zähler')
    await page.getByRole('button', { name: 'Nummernkreis anlegen' }).click()
    await expect(page.getByText(/Der Nummernkreis|Bitte|Platzhalter/).first()).toBeVisible()
    expect(page.url()).not.toContain('gespeichert=1')
    await page.getByLabel(/^Format/).fill('WF{N}/{JJ}')
    await expect(page.getByText(/Erste Nummer \d{4}: WF1\/\d{2}/)).toBeVisible()
    await page.getByRole('button', { name: 'Nummernkreis anlegen' }).click()
    await page.waitForURL(/nummern\?gespeichert=1/)
    await expect(page.getByText('Gespeichert.')).toBeVisible()
    const rangeRow = page.getByRole('listitem').filter({ hasText: name })
    await expect(rangeRow).toContainText('WF{N}/{JJ}')

    // While active it is selectable in the invoice form.
    await page.goto(`${BASE}/rechnungen/neu`)
    await expect(page.getByLabel('Nummernkreis').locator('option', { hasText: name })).toHaveCount(1)

    // Archive it again: it moves to the archived list and leaves the invoice form.
    await page.goto(`${BASE}/einstellungen/nummern`)
    await page.getByRole('listitem').filter({ hasText: name }).getByRole('button', { name: 'Archivieren' }).click()
    await page.waitForURL(/nummern\?gespeichert=1/)
    const archivedRow = page.getByRole('heading', { name: 'Archiviert' }).locator('xpath=following-sibling::ul[1]').getByRole('listitem').filter({ hasText: name })
    await expect(archivedRow).toBeVisible()
    await expect(archivedRow.getByRole('button', { name: 'Wiederherstellen' })).toBeVisible()
    await page.goto(`${BASE}/rechnungen/neu`)
    await expect(page.getByLabel('Nummernkreis').locator('option', { hasText: name })).toHaveCount(0)
  })

  test('Erscheinungsbild: layout switch and logo upload', async ({ page }) => {
    test.setTimeout(150_000)
    await signIn(page)
    const url = `${BASE}/einstellungen/erscheinungsbild`
    await page.goto(url)
    const radios = page.getByRole('radio')
    const labels = ['Briefpapier', 'Klassisch', 'Kompakt', 'Modern']
    let original = ''
    for (const label of labels) {
      if (await page.getByRole('radio', { name: new RegExp(`^${label}`) }).isChecked()) original = label
    }
    expect(original, 'one layout is selected').not.toBe('')
    await expect(radios).toHaveCount(4)
    const target = original === 'Modern' ? 'Klassisch' : 'Modern'

    // Logo state before: remember the original file to restore it.
    const logoApi = `/api/b/${GASTHAUS}/settings/logo`
    const hadLogo = await page.getByRole('img', { name: 'Aktuelles Logo' }).isVisible()
    let originalLogo: { body: Buffer; type: string } | null = null
    if (hadLogo) {
      const response = await page.request.get(logoApi)
      originalLogo = { body: await response.body(), type: response.headers()['content-type'] ?? 'image/png' }
    }
    const switcherLogo = page.getByRole('button', { name: /^Betrieb:/ }).locator('img')

    try {
      // Layout.
      await page.getByRole('radio', { name: new RegExp(`^${target}`) }).check()
      await page.getByRole('button', { name: 'Speichern', exact: true }).click()
      await page.waitForURL(/erscheinungsbild\?gespeichert=1/)
      await expect(page.getByText('Erscheinungsbild gespeichert.')).toBeVisible()
      await page.reload()
      await expect(page.getByRole('radio', { name: new RegExp(`^${target}`) })).toBeChecked()

      // Logo upload: visible in the settings and in the business switcher.
      await page.locator('#logo-file').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: tinyPng() })
      await expect(page.getByRole('img', { name: 'Aktuelles Logo' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Logo entfernen' })).toBeVisible()
      await expect(switcherLogo).toBeVisible()
      await expect.poll(() => switcherLogo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(16)
      const served = await page.request.get(logoApi)
      expect(served.status()).toBe(200)
      expect((await served.body()).subarray(1, 4).toString('latin1')).toBe('PNG')
    } finally {
      // Restore the logo.
      await page.goto(url)
      if (originalLogo) {
        await page.locator('#logo-file').setInputFiles({ name: 'original-logo', mimeType: originalLogo.type, buffer: originalLogo.body })
        await expect(page.getByRole('img', { name: 'Aktuelles Logo' })).toBeVisible()
        await expect.poll(async () => (await (await page.request.get(logoApi)).body()).equals(originalLogo!.body)).toBe(true)
      } else if (await page.getByRole('button', { name: 'Logo entfernen' }).isVisible()) {
        await page.getByRole('button', { name: 'Logo entfernen' }).click()
        await expect(page.getByRole('button', { name: 'Logo entfernen' })).toHaveCount(0)
        await expect(page.getByText('Noch kein Logo.')).toBeVisible()
        await expect(switcherLogo).toHaveCount(0)
        expect((await page.request.get(logoApi)).status()).toBe(404)
      }
      // Restore the layout.
      await page.getByRole('radio', { name: new RegExp(`^${original}`) }).check()
      await page.getByRole('button', { name: 'Speichern', exact: true }).click()
      await page.waitForURL(/erscheinungsbild\?gespeichert=1/)
      await expect(page.getByRole('radio', { name: new RegExp(`^${original}`) })).toBeChecked()
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------
// g. Mobile
// ---------------------------------------------------------------------------------------------------------------

test.describe('mobile 375x812', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('tab bar, no horizontal scroll, preview dialog', async ({ page }) => {
    await signIn(page)
    const tabs = page.getByRole('navigation', { name: 'Hauptnavigation' })
    await expect(tabs.getByRole('link', { name: 'Rechnungen' })).toBeVisible()

    for (const [label, section] of [
      ['Kunden', 'kunden'],
      ['Artikel', 'artikel'],
      ['Einstellungen', 'einstellungen'],
      ['Rechnungen', 'rechnungen'],
    ] as const) {
      await tabs.getByRole('link', { name: label }).click()
      await page.waitForURL(new RegExp(`/b/[0-9a-f-]{36}/${section}`))
      await expect(page.getByRole('heading', { name: label, level: 1 })).toBeVisible()
      await expect(tabs.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
      await noHorizontalScroll(page, label)
      // Touch targets of the tab bar are at least 44 px tall.
      const box = await tabs.getByRole('link', { name: label }).boundingBox()
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }

    for (const tab of ['firma', 'zahlung', 'nummern', 'erscheinungsbild']) {
      await page.goto(`${BASE}/einstellungen/${tab}`)
      await expect(page.getByRole('heading', { name: 'Einstellungen', level: 1 })).toBeVisible()
      await noHorizontalScroll(page, `einstellungen/${tab}`)
    }

    // New invoice page: empty, then with customer, article-like positions and discounts (widest content).
    await page.goto(`${BASE}/rechnungen/neu`)
    await expect(page.getByRole('heading', { name: 'Neue Rechnung', level: 1 })).toBeVisible()
    await noHorizontalScroll(page, 'rechnungen/neu')
    await page.getByLabel(/^Name oder Firma/).fill(`${PREFIX} Mobil ${RUN}`)
    await page.getByLabel('Beschreibung Position 1').fill('Eine ziemlich lange Beschreibung der Leistung, die auf dem Telefon umbrechen muss')
    await page.getByLabel('Einzelpreis brutto Position 1').fill('1234,56')
    await page.getByRole('button', { name: 'Rabatt auf die Rechnung' }).click()
    await page.locator('#inv-discount').fill('5')
    await noHorizontalScroll(page, 'rechnungen/neu (filled)')

    // Full-screen preview dialog.
    await page.getByRole('button', { name: 'Vorschau', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Vorschau' })).toBeVisible()
    const box = await dialog.boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(370)
    expect(box!.height).toBeGreaterThanOrEqual(800)
    await expect(dialog.getByText(/Aktuell|Wird aktualisiert/).first()).toBeVisible()
    await noHorizontalScroll(page, 'preview dialog')
    await dialog.getByRole('button', { name: 'Schließen' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await signOut(page)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// h. Keyboard
// ---------------------------------------------------------------------------------------------------------------

test.describe('keyboard', () => {
  const customer = `${PREFIX} Kunde Tastatur ${RUN}`

  test.afterAll(async ({ browser }) => {
    await sweep(browser)
  })

  test('customer combobox: Enter opens, option chosen with the keyboard, Escape closes', async ({ page }) => {
    await signIn(page)
    await createCustomer(page, customer)
    await page.goto(`${BASE}/rechnungen/neu`)
    const combobox = page.getByRole('combobox', { name: 'Kunde aus dem Kundenstamm' })

    // Enter opens, Escape closes and returns focus to the trigger.
    await combobox.focus()
    await page.keyboard.press('Enter')
    await expect(combobox).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByPlaceholder('Name oder Ort eingeben')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(combobox).toHaveAttribute('aria-expanded', 'false')
    await expect(combobox).toBeFocused()

    // Open again, filter, move to the option with the arrow keys and choose it with Enter.
    await page.keyboard.press('Enter')
    await expect(combobox).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByPlaceholder('Name oder Ort eingeben')).toBeFocused()
    await page.keyboard.type(customer)
    // The list is fuzzy-filtered and sorted by relevance: the exact match comes first and is the active option.
    await expect(page.getByRole('listbox', { name: 'Vorschläge' }).getByRole('option').first()).toContainText(customer)
    await expect(page.getByRole('listbox', { name: 'Vorschläge' }).getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowUp')
    await expect(page.getByRole('listbox', { name: 'Vorschläge' }).getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Enter')
    await expect(combobox).toHaveAttribute('aria-expanded', 'false')
    await expect(combobox).toContainText(customer)
    await expect(page.getByLabel(/^Name oder Firma/)).toHaveValue(customer)
    await expect(combobox).toBeFocused()
    await archiveCustomer(page, customer)
  })

  // WAI-ARIA combobox pattern: Down Arrow opens the list (Enter/Space work as well).
  test('customer combobox opens with ArrowDown', async ({ page }) => {
    await signIn(page)
    await page.goto(`${BASE}/rechnungen/neu`)
    const combobox = page.getByRole('combobox', { name: 'Kunde aus dem Kundenstamm' })
    await combobox.focus()
    await page.keyboard.press('ArrowDown')
    await expect(combobox).toHaveAttribute('aria-expanded', 'true', { timeout: 3000 })
  })

  // The export dialog has no DialogTrigger (opened from onClick); the panel returns focus to the opening button itself.
  test('focus returns to the export button after Escape', async ({ page }) => {
    await signIn(page)
    await createCustomer(page, `${customer} C`)
    await createSimpleInvoice(page, `${customer} C`)
    try {
      const button = page.getByRole('button', { name: 'PDF exportieren' })
      await button.focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(button).toBeFocused({ timeout: 3000 })
    } finally {
      await deleteOpenInvoice(page)
      await archiveCustomer(page, `${customer} C`)
    }
  })

  test('Escape closes menu and dialogs', async ({ page }) => {
    await signIn(page)
    await createCustomer(page, `${customer} B`)
    const { id } = await createSimpleInvoice(page, `${customer} B`)

    // Business switcher menu and the "new business" dialog.
    const trigger = page.getByRole('button', { name: /^Betrieb:/ })
    await trigger.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menu')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
    await trigger.click()
    await page.getByRole('menuitem', { name: 'Neuer Betrieb …' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Export dialogs.
    for (const name of ['PDF exportieren', 'Word-Datei exportieren']) {
      await page.getByRole('button', { name }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }

    // Delete confirmation closes without deleting.
    await page.getByRole('button', { name: 'Löschen', exact: true }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await page.goto(`${BASE}/rechnungen/${id}`)
    await expect(page.locator('#inv-number')).toBeVisible()

    // Article combobox closes with Escape too.
    await page.getByRole('combobox').filter({ hasText: 'Artikel hinzufügen' }).click()
    await expect(page.getByPlaceholder('Artikel suchen')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByPlaceholder('Artikel suchen')).toHaveCount(0)

    await deleteOpenInvoice(page)
    await archiveCustomer(page, `${customer} B`)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Unsaved changes: in-app navigation
// ---------------------------------------------------------------------------------------------------------------

test.describe('unsaved changes', () => {
  test('invoice form: navigation asks first, "Weiter bearbeiten" keeps the text, "Verwerfen" leaves', async ({ page }) => {
    await signIn(page)
    await page.goto(`${BASE}/rechnungen/neu`)
    const intro = page.locator('#inv-introText')
    await intro.fill(`${PREFIX} ungespeicherter Text`)

    const nav = page.getByRole('link', { name: 'Kunden', exact: true })
    await nav.click()
    const dialog = page.getByRole('alertdialog', { name: 'Ungespeicherte Änderungen verwerfen?' })
    await expect(dialog).toBeVisible()
    // The safe choice has the initial focus; Escape and "Weiter bearbeiten" both stay on the page.
    await expect(dialog.getByRole('button', { name: 'Weiter bearbeiten' })).toBeFocused()
    await dialog.getByRole('button', { name: 'Weiter bearbeiten' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page).toHaveURL(/rechnungen\/neu$/)
    await expect(intro).toHaveValue(`${PREFIX} ungespeicherter Text`)
    await expect(nav).toBeFocused()

    // Keyboard: Enter on the link opens the dialog again, Escape keeps editing.
    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(intro).toHaveValue(`${PREFIX} ungespeicherter Text`)

    await nav.click()
    await dialog.getByRole('button', { name: 'Verwerfen' }).click()
    await page.waitForURL(/\/kunden$/)
  })

  test('customer form: dirty only while a field differs, "Abbrechen" is guarded too', async ({ page }) => {
    await signIn(page)
    await page.goto(`${BASE}/kunden/neu`)
    const dialog = page.getByRole('alertdialog', { name: 'Ungespeicherte Änderungen verwerfen?' })
    const name = page.getByLabel(/^Name oder Firma/)

    // Typed and reverted again: nothing to lose, navigation goes straight through.
    await name.fill(`${PREFIX} X`)
    await name.fill('')
    await page.getByRole('link', { name: 'Artikel', exact: true }).click()
    await page.waitForURL(/\/artikel$/)

    await page.goto(`${BASE}/kunden/neu`)
    await page.getByLabel(/^Name oder Firma/).fill(`${PREFIX} Y`)
    await page.getByRole('link', { name: 'Abbrechen' }).click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Verwerfen' }).click()
    await page.waitForURL(/\/kunden$/)
  })
})
