/**
 * The recruiter agent's public surface. The page territory imports `AgentPanel`
 * and decides only WHERE it sits; everything inside — the chips, the form, the
 * brief, the run strip, every degraded state — belongs to this directory.
 *
 * The panel takes no props and declares no ground. It inherits `paper` from the
 * band around it and reads `--fg`, `--fg-muted`, `--fg-accent`, `--edge`,
 * `--surface-pressed` and `--fg-pressed` like every other component, which is
 * why moving it to a different ground would still be correct — and why nothing
 * in here may ever name a colour.
 */

export { AgentPanel } from './AgentPanel';
export { BriefView } from './BriefView';
export { HowProduced } from './HowProduced';
export { RunStrip } from './RunStrip';
export { useAgentStream } from './useAgentStream';
export type { StreamState, UseAgentStream } from './useAgentStream';
export { useAsk } from './useAsk';
export type { AskTurn, UseAsk } from './useAsk';
