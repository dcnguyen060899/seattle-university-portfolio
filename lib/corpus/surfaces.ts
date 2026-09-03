/**
 * lib/corpus/surfaces.ts — display helpers shared by the page, the résumé and the
 * structured data.
 *
 * These are formatting functions and nothing else. Every one of them reads through
 * the licence gate in index.ts, so a helper cannot become a side door around it.
 * If you find yourself wanting a helper that takes a string instead of a claim id,
 * that is the design telling you a literal is about to be typed somewhere.
 */

import {
  ARTIFACTS,
  ROLES,
  artifactById,
  claimById,
  claimText,
  claimValue,
  claimWithCaveats,
  getRecords,
  orgById,
  personById,
  roleById,
} from './index'
import type { Artifact, Claim, ClaimId, Period, Role, RoleId, Surface } from './types'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const QUARTER_OF_MONTH = ['winter', 'winter', 'winter', 'spring', 'spring', 'spring',
  'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn']

/**
 * Render a period.
 *
 * Two rules the rest of the site depends on:
 *  - A null `end` renders as "present". Never as a guessed end date, and never as
 *    a dash into empty space. Two of Duy's positions are ongoing, and a résumé
 *    that closes them is wrong in the direction that costs him an interview.
 *  - A null `start` renders the end alone. Only one date on the bachelor's degree
 *    is sourced, and inventing the other to make the timeline look tidy is exactly
 *    the class of small lie this corpus exists to prevent.
 */
export function formatPeriod(period: Period | null | undefined): string {
  if (!period) return ''
  const one = (iso: string | null): string => {
    if (!iso) return ''
    const [y, m] = iso.split('-')
    if (!y) return ''
    if (!m) return y
    const monthIndex = Number(m) - 1
    if (period.precision === 'year') return y
    // A month outside 1-12 would be a data bug the schema already rejects. If one
    // ever slipped through, fall back to the year rather than render "undefined".
    const quarter = QUARTER_OF_MONTH[monthIndex]
    const month = MONTHS[monthIndex]
    if (period.precision === 'quarter') return quarter ? `${quarter} ${y}` : y
    return month ? `${month} ${y}` : y
  }
  const start = one(period.start)
  const end = period.end === null ? 'present' : one(period.end)
  if (!start) return end
  if (start === end) return start
  return `${start} – ${end}`
}

/** A role's dates, honouring `ongoing`. */
export const rolePeriod = (roleId: RoleId): string => formatPeriod(roleById(roleId).period)

/** "Research Data Engineer, Computational Neuroscience Lab, Seattle University". */
export function roleHeading(roleId: RoleId): string {
  const role = roleById(roleId)
  const org = orgById(role.orgId)
  return `${role.title}, ${org.name}`
}

/** "Advisor: Dr. Wenjing Yang" — or nothing, if the role has no named advisor. */
export function roleAdvisors(roleId: RoleId): string {
  const role = roleById(roleId)
  const names = (role.advisorIds ?? []).map((id) => personById(id).name)
  if (!names.length) return ''
  return names.length === 1 ? `Advisor: ${names[0]}` : `Advisors: ${names.join(', ')}`
}

/**
 * The bullet form: the claim's sentence, plus every caveat it drags along, joined
 * so that dropping one is not something a caller can do by forgetting.
 */
export function bullet(id: ClaimId, surface: Surface): string {
  const { claim, caveats } = claimWithCaveats(id, surface)
  if (!caveats.length) return claim.statement
  return `${claim.statement} ${caveats.map((c) => c.statement).join(' ')}`
}

/** A stat tile is (value, label). The value comes from the corpus; the label is editorial. */
export function stat(id: ClaimId, label: string, surface: Surface = 'page') {
  return { value: claimValue(id, surface), label, claimId: id }
}

/** Claims for a role, licensed for the surface, in corpus order. */
export function roleBullets(roleId: RoleId, surface: Surface): Claim[] {
  return getRecords({ subject: roleId, surface }).filter((c) => c.kind !== 'caveat')
}

/** Roles in narrative-weight order, heaviest first, ties broken by recency. */
export function rolesByWeight(): Role[] {
  return [...ROLES].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight
    const aEnd = a.period.end ?? '9999'
    const bEnd = b.period.end ?? '9999'
    return bEnd.localeCompare(aEnd)
  })
}

/**
 * How to present an artifact.
 *
 * `under-review` and `on-request` return a description and NO href. A manuscript
 * under review cannot be linked, and a link that 404s on a portfolio is worse than
 * a sentence saying the thing exists and can be supplied.
 */
export function artifactLink(id: Artifact['id']): {
  title: string
  href: string | null
  note: string | null
} {
  const a = artifactById(id)
  switch (a.access) {
    case 'public':
      return { title: a.title, href: a.url, note: null }
    case 'under-review':
      return { title: a.title, href: null, note: 'under review — not public yet' }
    case 'on-request':
      return { title: a.title, href: null, note: 'available on request' }
    default:
      return { title: a.title, href: null, note: 'private' }
  }
}

/** Every legacy path that must keep resolving. Feeds check C12. */
export const legacyPaths = (): string[] =>
  ARTIFACTS.map((a) => a.legacyPath).filter((p): p is string => Boolean(p))

/**
 * The one-line credential summary for the education block.
 * Built from claims so it cannot say something the corpus does not carry.
 */
export function educationLine(surface: Surface = 'page'): string {
  return [
    claimText('clm:msds-enrolment', surface),
    claimText('clm:msds-honor-roll', surface),
  ].join(' ')
}

/** True when a claim must be written in the present progressive. */
export const isInFlight = (id: ClaimId): boolean => claimById(id).status === 'in-progress'
