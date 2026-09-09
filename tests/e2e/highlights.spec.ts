import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import { DELETED_PAGE_REDIRECTS } from './helpers/surfaces'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE HIGHLIGHTS BAND AND THE NAV — the 2026-09-08 cut, asserted on the page.
 *
 * The owner's whole ask was three records one scroll below the name: the PSB
 * paper (accepted, with an oral presentation — the slot he wants a recruiter
 * to SEE), the barn-owl database, the CAUSE win. Until this file nothing read
 * '/' for any of it: the corpus gate C10 only checks that a caveat's id
 * appears somewhere in the component's TEXT, so a docblock naming
 * clm:yang-psb-caveat would keep C10 green after the <Fine> line rendering it
 * was deleted. This reads the rendered band.
 *
 * The second half closes the gap the same cut opened: the R-4 redirect and
 * the nav hrefs are fragments, and tests compared them as strings. A fragment
 * is only a destination if an element carries that id.
 * ═══════════════════════════════════════════════════════════════════════════
 */

type Claim = { id: string; statement: string; short: string }
const CLAIMS: Claim[] = JSON.parse(readFileSync('data/corpus/claims.json', 'utf8'))
const statement = (id: string): string => {
  const claim = CLAIMS.find((c) => c.id === id)
  if (!claim) throw new Error(`corpus: no claim ${id}`)
  return claim.statement
}

test.describe('the highlights band', () => {
  test('renders the three records, in the owner’s order, with their caveats verbatim', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' })
    const band = page.locator('#highlights')
    await expect(band).toBeVisible()

    const records = band.locator('ol > li')
    await expect(records, 'three records — the owner ranked exactly three').toHaveCount(3)
    await expect(band.locator('ol')).toHaveAttribute('role', 'list')

    // The rail is each record's first child; textContent, because the rail is
    // set in uppercase by CSS and innerText would report the transform.
    const rails = await records
      .locator(':scope > div:first-child')
      .evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim()))
    expect(rails).toEqual(['PSB 2027', 'SU CNS', 'CAUSE 2026'])

    const text = (await band.innerText()).replace(/\s+/g, ' ')

    // The PSB record: accepted AND the oral slot, in the title a recruiter scans.
    const psbTitle = (await records.nth(0).locator('h3').innerText()).replace(/\s+/g, ' ')
    expect(psbTitle).toMatch(/accepted/i)
    expect(psbTitle).toMatch(/oral presentation/i)

    // Every mandatory caveat of the claims the band renders, as the record wrote it.
    for (const id of ['clm:yang-psb-caveat', 'clm:fischer-live-caveat']) {
      expect(text, `${id} must be rendered verbatim beside its claim`).toContain(
        statement(id).replace(/\s+/g, ' '),
      )
    }

    // The status words the house rules forbid on this surface.
    expect(text).not.toMatch(/under review/i)
    expect(text).not.toMatch(/\b(?:published|presented) (?:at|in) (?:PSB|the Pacific)/i)
    expect(text).not.toMatch(/\bPhD\b/i)
  })
})

test.describe('the nav and every in-page destination', () => {
  test('the bar carries the three sections, and every fragment resolves to an element', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' })

    const links = await page
      .locator('header nav a[href^="/#"]')
      .evaluateAll((as) =>
        as.map((a) => ({
          label: (a.textContent ?? '').trim(),
          id: (a.getAttribute('href') ?? '').slice(2),
        })),
      )
    expect(links.map((l) => l.label)).toEqual(['Highlights', 'For recruiters', 'Contact'])

    const fragments = [
      ...links.map((l) => l.id),
      ...DELETED_PAGE_REDIRECTS.map((r) => r.to)
        .filter((to) => to.includes('#'))
        .map((to) => to.split('#')[1] as string),
    ]
    for (const id of fragments) {
      const count = await page.locator(`#${id}`).count()
      expect(count, `"#${id}" is linked from the nav or a redirect but no element carries the id`).toBe(1)
    }
  })
})
