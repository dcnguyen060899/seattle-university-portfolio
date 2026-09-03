'use client';

/**
 * components/site/agent-panel/useAgentStream.ts — the client half of the wire
 * contract.
 *
 * WHY A HAND-ROLLED READER AND NOT `EventSource`. `EventSource` is GET-only,
 * and a pasted job description is a POST body. So this reads the response body
 * as a stream and parses the same three-line SSE frames the server writes.
 *
 * THE SPLIT THIS FILE HAS TO RESPECT. Status codes are decided BEFORE the
 * stream opens; once bytes are flowing the status is 200 and cannot change. So
 * a non-2xx is read from `res.status` and is a form-level error, and an
 * in-stream failure arrives as a `brief` event with `degraded: true`. Reading
 * `res.status` for the second kind — or waiting for a brief that will never
 * come after the first — is the mistake this comment exists to prevent.
 *
 * It also accepts a plain JSON response, because the same routes answer
 * non-streaming when `Accept` does not ask for events, and a proxy that strips
 * SSE is a real thing on corporate networks.
 */

import { useCallback, useRef, useState } from 'react';

import type {
  BriefEnvelope,
  ErrorEnvelope,
  MetaEvent,
  TraceStage,
} from '@/lib/agent/contracts';

export interface StreamState {
  status: 'idle' | 'running' | 'done' | 'error';
  meta: MetaEvent | null;
  stages: TraceStage[];
  envelope: BriefEnvelope | null;
  error: { code: string; message: string; retryAfter: number | null } | null;
}

const IDLE: StreamState = {
  status: 'idle',
  meta: null,
  stages: [],
  envelope: null,
  error: null,
};

interface Frame {
  event: string;
  data: unknown;
}

/** Parse whatever complete frames the buffer holds; return the remainder. */
function drain(buffer: string): { frames: Frame[]; rest: string } {
  const frames: Frame[] = [];
  let rest = buffer;
  let index = rest.indexOf('\n\n');
  while (index !== -1) {
    const block = rest.slice(0, index);
    rest = rest.slice(index + 2);
    index = rest.indexOf('\n\n');

    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue; // keepalive comment
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) continue;
    try {
      frames.push({ event, data: JSON.parse(dataLines.join('\n')) as unknown });
    } catch {
      // A half-written frame cannot happen (the split is on the terminator),
      // so a parse failure here means the server sent something malformed.
      // Dropping it is correct: the guaranteed `brief` frame still follows.
    }
  }
  return { frames, rest };
}

export interface UseAgentStream {
  state: StreamState;
  /** Run a live brief against a pasted job description. */
  runBrief: (input: { role: string | null; jd: string }) => Promise<void>;
  /** Fetch a pre-built brief for a role. One round trip, no model, no cost. */
  loadCanned: (role: string) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

export function useAgentStream(): UseAgentStream {
  const [state, setState] = useState<StreamState>(IDLE);
  const controllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const reset = useCallback(() => {
    cancel();
    setState(IDLE);
  }, [cancel]);

  const loadCanned = useCallback(async (role: string) => {
    cancel();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ ...IDLE, status: 'running' });

    try {
      const res = await fetch(`/api/agent/brief/canned/${role}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ErrorEnvelope | null;
        setState({
          ...IDLE,
          status: 'error',
          error: {
            code: body?.error.code ?? 'internal_error',
            message:
              body?.error.message ??
              'That pre-built brief could not be loaded. Paste a job description instead.',
            retryAfter: body?.retry_after ?? null,
          },
        });
        return;
      }
      const envelope = (await res.json()) as BriefEnvelope;
      setState({
        status: 'done',
        meta: {
          request_id: envelope.request_id,
          runtime: 'nodejs',
          region: envelope.telemetry.region,
          model: envelope.telemetry.model,
          corpus_version: envelope.telemetry.corpus_version,
          corpus_size: envelope.telemetry.corpus_size,
          mode: envelope.telemetry.mode,
        },
        stages: envelope.trace,
        envelope,
        error: null,
      });
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return;
      setState({
        ...IDLE,
        status: 'error',
        error: {
          code: 'network',
          message: 'The request did not reach the server. Check the connection and try again.',
          retryAfter: null,
        },
      });
    } finally {
      controllerRef.current = null;
    }
  }, [cancel]);

  const runBrief = useCallback(
    async (input: { role: string | null; jd: string }) => {
      cancel();
      const controller = new AbortController();
      controllerRef.current = controller;
      setState({ ...IDLE, status: 'running' });

      try {
        const res = await fetch('/api/agent/brief', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({ role: input.role, jd: input.jd }),
          signal: controller.signal,
        });

        // ── pre-stream failure: the status is real and the body is an envelope
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as ErrorEnvelope | null;
          setState({
            ...IDLE,
            status: 'error',
            error: {
              code: body?.error.code ?? 'internal_error',
              message: body?.error.message ?? 'The request was refused.',
              retryAfter: body?.retry_after ?? null,
            },
          });
          return;
        }

        // ── a proxy stripped the stream, or the server chose JSON
        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.includes('text/event-stream') || !res.body) {
          const envelope = (await res.json()) as BriefEnvelope;
          setState({
            status: 'done',
            meta: null,
            stages: envelope.trace,
            envelope,
            error: null,
          });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { frames, rest } = drain(buffer);
          buffer = rest;

          for (const frame of frames) {
            if (frame.event === 'meta') {
              const meta = frame.data as MetaEvent;
              setState((s) => ({ ...s, meta }));
            } else if (frame.event === 'stage') {
              const stage = frame.data as TraceStage;
              setState((s) => ({ ...s, stages: [...s.stages, stage] }));
            } else if (frame.event === 'brief') {
              const envelope = frame.data as BriefEnvelope;
              setState((s) => ({ ...s, envelope, stages: envelope.trace }));
            } else if (frame.event === 'done') {
              setState((s) => ({ ...s, status: 'done' }));
            } else if (frame.event === 'error') {
              const data = frame.data as { code: string; message: string };
              setState((s) => ({
                ...s,
                error: { code: data.code, message: data.message, retryAfter: null },
              }));
            }
          }
        }

        // The server guarantees a brief before the stream ends. If one never
        // arrived, the connection was cut mid-flight — say so plainly rather
        // than leaving a spinner running forever.
        setState((s) =>
          s.envelope
            ? { ...s, status: 'done' }
            : {
                ...s,
                status: 'error',
                error: {
                  code: 'incomplete',
                  message:
                    'The connection closed before the brief arrived. Try again, or pick a role for the pre-built brief.',
                  retryAfter: null,
                },
              },
        );
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        setState({
          ...IDLE,
          status: 'error',
          error: {
            code: 'network',
            message: 'The request did not reach the server. Check the connection and try again.',
            retryAfter: null,
          },
        });
      } finally {
        controllerRef.current = null;
      }
    },
    [cancel],
  );

  return { state, runBrief, loadCanned, cancel, reset };
}
