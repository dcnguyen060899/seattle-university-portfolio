'use client';

/**
 * components/site/agent-panel/useAsk.ts — the free-form question.
 *
 * Non-streaming, deliberately. A question answers in a few seconds and produces
 * one short paragraph; a progress list for that is theatre. The brief streams
 * because it can take twenty seconds at the tail and the reader needs to see
 * that something real is happening. Two different waits, two different answers.
 *
 * HISTORY IS SENT BACK, AND THE SERVER DOES NOT BELIEVE IT. The last few turns
 * travel in the request body so a follow-up question makes sense, and the
 * server fences them as `<previous_turn>` DATA inside the current user turn —
 * never as an `assistant` message. This page controls that array, so anything
 * in it is a stranger's text by definition, including the parts this page
 * itself wrote a moment ago.
 */

import { useCallback, useRef, useState } from 'react';

import type { AnswerEnvelope, ErrorEnvelope } from '@/lib/agent/contracts';
import { MAX_HISTORY_TURNS } from '@/lib/agent/limits';

export interface AskTurn {
  question: string;
  answer: string;
  envelope: AnswerEnvelope;
}

export interface UseAsk {
  turns: AskTurn[];
  status: 'idle' | 'running' | 'error';
  error: string | null;
  ask: (question: string) => Promise<void>;
  clear: () => void;
}

export function useAsk(): UseAsk {
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [status, setStatus] = useState<UseAsk['status']>('idle');
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const clear = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setTurns([]);
    setStatus('idle');
    setError(null);
  }, []);

  const ask = useCallback(
    async (question: string) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setStatus('running');
      setError(null);

      // Only the last few turns travel, and each is capped server-side. A long
      // conversation must not become an unbounded prompt.
      const history = turns.slice(-MAX_HISTORY_TURNS).map((t) => ({
        question: t.question,
        answer: t.answer,
      }));

      try {
        const res = await fetch('/api/agent/qa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ question, history }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as ErrorEnvelope | null;
          setError(body?.error.message ?? 'That question could not be sent.');
          setStatus('error');
          return;
        }

        const envelope = (await res.json()) as AnswerEnvelope;
        setTurns((prev) => [
          ...prev,
          { question, answer: envelope.answer.answer, envelope },
        ]);
        setStatus('idle');
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        setError('The request did not reach the server. Check the connection and try again.');
        setStatus('error');
      } finally {
        controllerRef.current = null;
      }
    },
    [turns],
  );

  return { turns, status, error, ask, clear };
}
