"""Per-IP token bucket (spec 4.5 / 4.6): key = last X-Forwarded-For entry else remote_addr; ``per_min``
refill with ``burst`` capacity; a ``threading.Lock`` guards the dict (gthread runs several threads);
buckets are pruned when the dict exceeds ``max_keys``.
"""
from __future__ import annotations

import math
import threading
import time


class RateLimiter:
    def __init__(self, per_min: int = 10, burst: int = 5, max_keys: int = 5000, clock=time.monotonic):
        self.rate = max(per_min, 1) / 60.0          # tokens per second
        self.burst = max(int(burst), 1)
        self.max_keys = max_keys
        self.clock = clock
        self._lock = threading.Lock()
        self._buckets: dict = {}                     # key -> [tokens, last_ts]

    def allow(self, key: str):
        """Return ``(allowed, retry_after_seconds)``; ``retry_after`` is 0 when allowed."""
        now = self.clock()
        with self._lock:
            tokens, last = self._buckets.get(key, (float(self.burst), now))
            tokens = min(float(self.burst), tokens + (now - last) * self.rate)
            if tokens >= 1.0:
                self._buckets[key] = [tokens - 1.0, now]
                self._prune(now)
                return True, 0
            self._buckets[key] = [tokens, now]
            self._prune(now)
            wait = (1.0 - tokens) / self.rate
            return False, max(1, int(math.ceil(wait)))

    def _prune(self, now: float) -> None:
        if len(self._buckets) <= self.max_keys:
            return
        horizon = self.burst / self.rate           # a bucket idle this long is full again
        for k in [k for k, (_, last) in self._buckets.items() if now - last > horizon]:
            del self._buckets[k]
        if len(self._buckets) > self.max_keys:       # still too many: drop the oldest half
            for k in sorted(self._buckets, key=lambda k: self._buckets[k][1])[: len(self._buckets) // 2]:
                del self._buckets[k]


def client_key(request) -> str:
    xff = request.headers.get("X-Forwarded-For", "")
    if xff:
        parts = [p.strip() for p in xff.split(",") if p.strip()]
        if parts:
            return parts[-1]
    return request.remote_addr or "unknown"
