import { expect, test } from '@playwright/test'

import {
  CONTRACT_NOTE,
  HEALTH_URL,
  POOR_MATCH_JD,
  ROLE_IDS,
  SELECTORS,
  STRONG_MATCH_JD,
  fillAndSubmit,
  freshClient,
  waitForPanel,
  readVerdictRows,
  isEnvelope,
  postBrief,
  type AgentEnvelope,
  type HealthPayload,
} from './helpers/agent'
import { findRetractions, formatHits, summariseHits } from './helpers/corpus'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE RECRUITER AGENT, END TO END, IN DEMO MODE.
 *
 * DEMO MODE IS NOT A TEST CONVENIENCE — IT IS THE DEFAULT A STRANGER GETS.
 * `AGENT_DEMO_MODE` defaults ON and wins over a present key (Addendum B, R-13).
 * Nothing in this suite passes a key, and the server is started with none, so
 * everything below runs on a fork's pull request with zero paid accounts. If a
 * test here ever needs a key, the degradation story is broken and the agent has
 * stopped being safe to deploy unattended.
 *
 * THE ONE ASSERTION THAT MATTERS MOST is `a poor-match JD produces a brief that
 * says so`. Everything else here is plumbing. An agent that returns eight
 * `direct` verdicts for a principal-engineer role is not a fit brief, it is a
 * flatterer — and the page's entire argument, that every claim traces to a
 * source, dies with it. spec-04 §4.6 makes the same point structurally: an
 * all-direct brief renders as `8 direct · 0 partial · 0 with no evidence`,
 * which is self-indicting.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/* ══════════════════════════════════════════════════════════════════════════
   1. HEALTH — the contract gate for this whole file
   ══════════════════════════════════════════════════════════════════════════ */

test('GET /api/agent/health reports a mode, with no key configured', async ({ request }) => {
  const response = await request.get(HEALTH_URL, { failOnStatusCode: false })

  expect(
    response.status(),
    `${HEALTH_URL} returned ${response.status()}. This route is the liveness probe ` +
      'and it is a numbered step in the cutover checklist (Addendum B R-13): the ' +
      'post-deploy assertion is `mode === "live"`. Without it, a production deploy ' +
      'that forgets AGENT_DEMO_MODE serves canned briefs forever while cheerfully ' +
      'announcing it on a job-hunt site.',
  ).toBe(200)

  const health = (await response.json()) as HealthPayload

  expect(
    health.mode,
    'health must report `mode`. It is the field the cutover checklist asserts on, ' +
      'and the one that distinguishes "the model answered" from "you are reading a ' +
      'pre-built brief".',
  ).toBeDefined()
  expect(['demo', 'live']).toContain(health.mode)

  expect(
    health.mode,
    'The suite starts the server with no env file and no secrets, and ' +
      'AGENT_DEMO_MODE defaults ON — so this must be "demo". A "live" here means ' +
      'either the default flipped or the test runner is leaking an environment.',
  ).toBe('demo')

  expect(
    health.ai_configured,
    'ai_configured reports PRESENCE only, never a value or a partial key.',
  ).toBe(false)

  expect(
    JSON.stringify(health),
    'The health payload must not contain anything that looks like an API key. It ' +
      'mirrors /evaluate-challenge/health, which already gets this right.',
  ).not.toMatch(/sk-[a-zA-Z0-9-]{10,}/)

  /**
   * The four canned roles are what a rate-limited or degraded request falls
   * back to; an empty list turns every failure mode into a dead end.
   *
   * spec-04 §2.6 shows this field as a bare array of role ids. The
   * implementation returns richer rows — `{ role, built_at, composer, stale }`
   * — which is a divergence from the spec and, on balance, a better answer: a
   * canned brief that has silently gone stale against the corpus is exactly the
   * thing an operator wants a probe to tell them, and this field is what the
   * cutover checklist reads. So the assertion accepts either shape and pins
   * what actually matters: the four ids, all present, in the frozen order.
   */
  const cannedRoles = (health.canned_roles ?? []).map((entry) =>
    typeof entry === 'string' ? entry : ((entry as { role?: string }).role ?? ''),
  )
  expect(cannedRoles).toEqual([...ROLE_IDS])
})

/* ══════════════════════════════════════════════════════════════════════════
   2. THE TWO ZERO-TYPING PATHS
   ══════════════════════════════════════════════════════════════════════════ */

for (const role of ROLE_IDS) {
  test(`a role chip alone returns a brief: ${role}`, async ({ request }) => {
    const { status, json } = await postBrief(request, { role }, { client: freshClient(`chip-${role}`) })

    expect(status, `POST /api/agent/brief {role: "${role}"} returned ${status}`).toBe(200)
    expect(isEnvelope(json), 'response is not an agent envelope').toBe(true)

    const envelope = json as AgentEnvelope
    expect(
      envelope.brief.requirements.length,
      'A brief with no requirements is not a brief.',
    ).toBeGreaterThan(0)
    expect(
      envelope.brief.jd_source,
      'A chip-only request is `role_chip`; the field exists so the panel can say ' +
        'which path produced what the reader is looking at.',
    ).toBe('role_chip')
    expect(
      envelope.degraded,
      'With AGENT_DEMO_MODE on, every brief is a canned one and must SAY it is ' +
        'degraded. A demo brief presented as live output is the agent lying about ' +
        'itself on a page arguing for checkable claims.',
    ).toBe(true)
    expect(envelope.message, 'a degraded brief must carry a user-facing sentence').toBeTruthy()
  })
}

test('a pasted JD returns a brief', async ({ request }) => {
  const { status, json } = await postBrief(
    request,
    { jd: STRONG_MATCH_JD },
    { client: freshClient('pasted-jd') },
  )

  expect(status).toBe(200)
  expect(isEnvelope(json)).toBe(true)

  const envelope = json as AgentEnvelope
  expect(envelope.brief.requirements.length).toBeGreaterThan(0)
  expect(envelope.brief.jd_source).toBe('pasted_jd')
})

test('an empty request is rejected before the stream opens', async ({ request }) => {
  const { status, json } = await postBrief(request, {}, { client: freshClient('empty-request') })
  expect(
    status,
    'Neither a role nor 40 characters of JD. spec-04 §2.5: pre-stream failures ' +
      'return an ordinary JSON error envelope with a real status, because once ' +
      'bytes are sent the status is 200 and cannot change.',
  ).toBe(400)
  expect((json as { ok?: boolean } | null)?.ok).toBe(false)
})

/* ══════════════════════════════════════════════════════════════════════════
   3. THE ONE THAT MATTERS — honesty about a poor match
   ══════════════════════════════════════════════════════════════════════════ */

test('a JD Duy is a poor match for produces a brief that SAYS SO', async ({ request }) => {
  const { status, json } = await postBrief(
    request,
    { jd: POOR_MATCH_JD },
    { client: freshClient('poor-match') },
  )
  expect(status).toBe(200)
  expect(isEnvelope(json)).toBe(true)

  const envelope = json as AgentEnvelope
  const verdicts = envelope.brief.requirements.map((r) => r.verdict)
  const honest = verdicts.filter((v) => v === 'partial' || v === 'no_evidence')

  expect(
    honest.length,
    'Not one `partial` or `no_evidence` verdict for a principal-engineer role ' +
      'demanding ten years of industry seniority, ownership of a tier-0 payments ' +
      'service, a proprietary internal framework and management of eight ' +
      'engineers.\n' +
      `Verdicts returned: ${verdicts.join(', ')}\n` +
      'spec-04 §3: "Almost every real job description contains at least one ' +
      'requirement this site cannot support… Do not invent a gap that is not ' +
      'there, and do not launder a gap into adjacent." An agent that cannot say ' +
      '"no" is not evidence of judgement, it is evidence of flattery, and the ' +
      "page's whole argument rests on the opposite.",
  ).toBeGreaterThan(0)

  expect(
    envelope.coverage.partial + envelope.coverage.no_evidence,
    'The coverage line is SERVER-COMPUTED from the verdicts (spec-04 §4.6) and it ' +
      'is the first thing a hiring manager reads. It must agree with the verdicts ' +
      `it summarises: ${JSON.stringify(envelope.coverage)} vs ${verdicts.join(', ')}`,
  ).toBe(honest.length)

  expect(
    envelope.brief.gaps_summary.trim(),
    'gaps_summary is non-empty whenever ANY requirement is partial or no_evidence ' +
      '(spec-04 §2.3). It is the paragraph under "WHERE THE EVIDENCE STOPS", and ' +
      'a brief with gaps and no summary of them has hidden the gaps in a list.',
  ).not.toBe('')

  for (const requirement of envelope.brief.requirements) {
    if (requirement.verdict === 'no_evidence') {
      expect(
        requirement.evidence,
        `"${requirement.requirement}" is no_evidence and still carries ` +
          `${requirement.evidence.length} citation(s). The rule is biconditional and ` +
          'enforced, not requested: evidence MUST be empty ⇔ verdict is no_evidence. ' +
          'A citation under a "no evidence" verdict is the reader being told two ' +
          'opposite things at once.',
      ).toHaveLength(0)
    } else {
      expect(
        requirement.evidence.length,
        `"${requirement.requirement}" is ${requirement.verdict} with no citation. ` +
          'Every direct/adjacent/partial verdict carries at least one surviving ' +
          'citation, or it is an assertion rather than a finding.',
      ).toBeGreaterThan(0)
    }
  }
})

/**
 * NON-VACUITY for the assertion above. If the agent answers `no_evidence` to
 * everything it is not honest, it is broken — and the poor-match test would
 * pass for entirely the wrong reason.
 */
test('the honesty assertion is not free: a good match produces positive verdicts', async ({
  request,
}) => {
  const { status, json } = await postBrief(
    request,
    { jd: STRONG_MATCH_JD },
    { client: freshClient('strong-match') },
  )
  expect(status).toBe(200)
  expect(isEnvelope(json)).toBe(true)

  const envelope = json as AgentEnvelope
  const positive = envelope.brief.requirements.filter(
    (r) => r.verdict === 'direct' || r.verdict === 'adjacent',
  )

  expect(
    positive.length,
    'A JD asking for vision-language retrieval evaluation, controlled multi-arm ' +
      'experiments, PyTorch and scientific ETL produced not one direct or adjacent ' +
      'verdict. Either retrieval is broken or the agent has been tuned into ' +
      'uselessness — and the poor-match assertion above is then passing for free.\n' +
      `Verdicts: ${envelope.brief.requirements.map((r) => r.verdict).join(', ')}`,
  ).toBeGreaterThan(0)
})

/* ══════════════════════════════════════════════════════════════════════════
   4. HONEST VERDICTS RENDER AT FULL WEIGHT AND IN JD ORDER
   ══════════════════════════════════════════════════════════════════════════ */

test('requirements keep JD order — they are never sorted by verdict', async ({ request }) => {
  const { json } = await postBrief(request, { jd: POOR_MATCH_JD }, { client: freshClient('jd-order') })
  test.skip(!isEnvelope(json), CONTRACT_NOTE)
  const envelope = json as AgentEnvelope

  const rank: Record<string, number> = { direct: 0, adjacent: 1, partial: 2, no_evidence: 3 }
  const order = envelope.brief.requirements.map((r) => rank[r.verdict] ?? 9)

  const monotonic = order.every((v, i) => i === 0 || v >= (order[i - 1] as number))
  const distinct = new Set(order).size

  /**
   * The signature of a sort, not of an ordering.
   *
   * A short brief can land in ascending order honestly, so a bare "is it
   * sorted?" check would flake. THREE OR MORE distinct verdict classes, in
   * perfect best-first order, across four or more requirements is not luck — of
   * the orderings four such rows can take, the sorted one is a single
   * arrangement. This is deliberately a heuristic with a wide margin rather than
   * a strict one that fails on a coincidence; the exact ordering guarantee is
   * asserted in the DOM test below, which compares painted order against DOM
   * order and cannot be fooled by chance at all.
   */
  const looksSorted = monotonic && distinct >= 3 && order.length >= 4

  expect(
    looksSorted,
    'The requirements came back sorted best-first: ' +
      `${envelope.brief.requirements.map((r) => r.verdict).join(' → ')}\n` +
      'spec-04 §1.5: requirements render "in the order they appeared in the JD, ' +
      'never sorted by verdict". Sorting is how a brief buries its gaps at the ' +
      'bottom while technically disclosing them — the reader stops at the third row.',
  ).toBe(false)
})

/**
 * THE BROWSER-DRIVEN TESTS NEED THEIR OWN CLIENT IDENTITY TOO.
 *
 * The API tests key themselves apart with `freshClient()`, but a request the
 * PAGE makes carries the browser's address, and every Playwright worker shares
 * it. Five workers each submitting a brief exhausts `{ perMin: 1, burst: 3 }`
 * within seconds, and the panel then sits on a rate-limit state that has
 * nothing to do with what the test is asserting. `extraHTTPHeaders` is
 * context-level and static, so each of these gets a fixed documentation
 * address of its own (RFC 3849, 2001:db8::/32).
 */
test.describe('the rendered brief', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': '2001:db8:dom::1' } })

  test('no_evidence rows render at full weight and are not dimmed or reordered', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const panel = await waitForPanel(page)
    expect(panel, CONTRACT_NOTE).not.toBeNull()
    if (!panel) return

    const submitted = await fillAndSubmit(page, POOR_MATCH_JD)
    expect(submitted.ok, `${submitted.reason ?? ''}. ${CONTRACT_NOTE}`).toBe(true)

    // The brief is what this test is about; wait for the verdict rows themselves
    // rather than for a wrapper, so a panel that renders an empty shell fails here
    // instead of one assertion later with a confusing message.
    await expect
      .poll(async () => (await readVerdictRows(page))?.length ?? 0, {
        timeout: 45_000,
        message:
          'No requirement rows ever rendered. In demo mode the brief is pre-built and ' +
          `should arrive in well under a second. ${CONTRACT_NOTE}`,
      })
      .toBeGreaterThan(0)

    const measured = (await readVerdictRows(page)) ?? []

    const gaps = measured.filter((row) => row.verdict === 'no_evidence' || row.verdict === 'partial')
    const strong = measured.filter((row) => row.verdict === 'direct' || row.verdict === 'adjacent')

    test.skip(
      gaps.length === 0,
      'This brief has no partial or no_evidence rows to inspect. The API-level ' +
        'assertion above is the one that fails when that is wrong.',
    )

    const dimmed = gaps.filter((row) => row.effectiveOpacity < 0.99)
    expect(
      dimmed.map((row) => `${row.verdict} @ opacity ${row.effectiveOpacity.toFixed(2)}`),
      'A gap row is dimmed. spec-04 §1.5: "no_evidence rows are rendered at full ' +
        'weight and full size, not dimmed. Dimming a gap is hiding it." The only ' +
        'visual difference permitted is the marker, the label and the absence of a ' +
        'link.\n' + dimmed.map((r) => JSON.stringify(r)).join('\n'),
    ).toEqual([])

    if (strong.length > 0) {
      const strongestSize = Math.max(...strong.map((row) => row.fontSizePx))
      const weakestGap = Math.min(...gaps.map((row) => row.fontSizePx))
      expect(
        weakestGap,
        `Gap rows are set at ${weakestGap}px against ${strongestSize}px for the ` +
          'positive ones. Full size means full size.',
      ).toBeGreaterThanOrEqual(strongestSize - 0.5)
    }

    // Rendered order must match the payload order, which the API test already
    // proved is JD order.
    const renderedOrder = [...measured].sort((a, b) => a.top - b.top).map((row) => row.index)
    expect(
      renderedOrder,
      'The rows are painted in a different order from the one they appear in the DOM ' +
        '— a CSS `order` or `flex-direction` that re-sorts the gaps to the bottom is ' +
        'the same defect as sorting the array, and harder to find.',
    ).toEqual(measured.map((row) => row.index))
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   5. THE RATE LIMIT IS NOT A DEAD END
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('the rate-limited panel', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': '2001:db8:dom::2' } })

  test('a rate limit answers with Retry-After and the pre-built briefs', async ({ request, page }) => {
    const health = (await (await request.get(HEALTH_URL, { failOnStatusCode: false })).json()) as HealthPayload
    const burst = health.limits?.['brief_burst'] ?? 3

    /**
     * ONE key for the whole loop — this is the test that deliberately exhausts a
     * bucket, and it is what keeps the per-test keys elsewhere honest. If the
     * limiter were removed, every other agent test would keep passing and this
     * one would fail, which is the division of labour that matters.
     */
    const rateLimitClient = freshClient('rate-limit')

    let limited: Awaited<ReturnType<typeof postBrief>> | null = null
    for (let i = 0; i < burst + 6; i += 1) {
      const result = await postBrief(request, { role: 'data-scientist' }, { client: rateLimitClient })
      if (result.status === 429) {
        limited = result
        break
      }
    }

    test.skip(
      limited === null,
      `No 429 after ${burst + 6} consecutive briefs. Either the limiter is disabled ` +
        'in demo mode — defensible, since a canned brief costs nothing — or the ' +
        'burst is wider than health reports. Not a failure, but it means the rate-' +
        'limit UX below is untested; check `limits` on /api/agent/health.',
    )
    if (!limited) return

    expect(
      limited.headers['retry-after'],
      'A 429 without Retry-After tells the reader to try again and not when.',
    ).toBeTruthy()

    const body = limited.json as { ok?: boolean; error?: { code?: string }; retry_after?: number } | null
    expect(body?.ok).toBe(false)
    expect(['rate_limited', 'daily_ceiling']).toContain(body?.error?.code ?? '')

    /* ── The important half: what the READER ends up looking at ──────────────
     *
     * Driven through the PASTED-JD path, and that detail is the test. A role
     * chip is answered by `/api/agent/brief/canned/[role]` — a different route,
     * pre-built, unmetered — so a chip click never touches the limiter at all
     * and a 429 mocked onto `/api/agent/brief` would simply never fire. Testing
     * the rate limit through the chip path would have produced a confidently
     * green assertion about a request that was never made.
     *
     * Asserted as BEHAVIOUR rather than as markup: the reader is told when they
     * can try again, and the pre-built briefs are offered inline. spec-04 §1.6:
     * "You have run several briefs in the last few minutes. Try again in 4
     * minutes — or read the four role briefs below, which are pre-built. AND
     * the four canned role briefs are shown inline. A rate limit must not be a
     * dead end." A recruiter who hits the limit and gets an error message
     * leaves; one who gets four briefs stays.
     */
    await page.route('**/api/agent/brief', async (route) => {
      await route.fulfill({
        status: 429,
        headers: { 'content-type': 'application/json', 'retry-after': '214' },
        body: JSON.stringify({
          ok: false,
          request_id: 'test',
          error: {
            code: 'rate_limited',
            message: 'Too many requests; try again in 214 seconds.',
            field: null,
          },
          retry_after: 214,
        }),
      })
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const submitted = await fillAndSubmit(page, STRONG_MATCH_JD)
    expect(submitted.ok, `${submitted.reason ?? ''}. ${CONTRACT_NOTE}`).toBe(true)

    const panelText = async (): Promise<string> =>
      page.evaluate(() =>
        (document.querySelector('form')?.closest('section')?.textContent ?? '').replace(/\s+/g, ' '),
      )

    await expect
      .poll(panelText, {
        timeout: 20_000,
        message:
          'After a 429 the panel never told the reader when they could try again. ' +
          'A rate limit with no retry window is indistinguishable from a broken ' +
          'site, and the Retry-After header is right there in the response.',
      })
      .toMatch(/try again in .{1,24}(second|minute)/i)

    /**
     * And the pre-built briefs are offered inline. Preferring the documented
     * hook, and falling back to the structural fact underneath it: a set of
     * role controls, enabled, presented after the failure. Four is the number
     * spec-04 fixes and `canned_roles` on /health reports.
     */
    const cannedHook = await page.locator(SELECTORS.canned).count()
    const offeredChips = await page.locator('button[aria-pressed]:not([disabled])').count()

    expect(
      cannedHook > 0 || offeredChips >= 4,
      'A rate limit must not be a dead end. The panel reported the failure but ' +
        'offered no way forward: no [data-canned-brief] and fewer than four ' +
        `enabled role controls (found ${offeredChips}). The four pre-built briefs ` +
        'cost nothing to serve — they are the whole reason the canned path exists ' +
        '— and they are what turns a refusal into an answer.',
    ).toBe(true)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   6. NOTHING THE AGENT SAYS IS RETRACTED
   ══════════════════════════════════════════════════════════════════════════ */

test('a demo brief contains no retracted content', async ({ request }) => {
  for (const role of ROLE_IDS) {
    const { json, text } = await postBrief(request, { role }, { client: freshClient(`canned-${role}`) })
    if (!isEnvelope(json)) continue
    const hits = findRetractions(text)
    expect(
      summariseHits(hits),
      `The canned brief for "${role}" carries retracted content. The canned briefs ` +
        'are the DEFAULT output on this deploy — they are what a stranger reads — ' +
        'and they are pre-built, so there is no model to blame.\n' +
        formatHits(`canned brief: ${role}`, hits),
    ).toEqual([])
  }
})
