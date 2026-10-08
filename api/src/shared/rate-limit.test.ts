import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRateLimiter, getClientIp } from './rate-limit';

describe('getClientIp', () => {
  it('uses the first address supplied by the trusted proxy', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.10, 10.0.0.1',
      'x-client-ip': '198.51.100.5',
    });

    assert.equal(getClientIp({ headers }), '203.0.113.10');
  });

  it('does not trust x-client-ip as a fallback', () => {
    const headers = new Headers({ 'x-client-ip': '198.51.100.5' });

    assert.equal(getClientIp({ headers }), 'unknown');
  });
});

describe('createRateLimiter', () => {
  it('rejects requests above the configured limit until the window resets', () => {
    let now = 1_000;
    const limiter = createRateLimiter({
      windowMs: 60_000,
      maxRequests: 2,
      now: () => now,
    });

    assert.equal(limiter.check('client').allowed, true);
    assert.equal(limiter.check('client').allowed, true);
    assert.deepEqual(limiter.check('client'), { allowed: false, retryAfterSec: 60 });

    now += 60_000;
    assert.equal(limiter.check('client').allowed, true);
  });

  it('keeps independent counters for different clients', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1 });

    assert.equal(limiter.check('client-a').allowed, true);
    assert.equal(limiter.check('client-a').allowed, false);
    assert.equal(limiter.check('client-b').allowed, true);
  });

  it('evicts an entry when the capacity is reached', () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      maxRequests: 1,
      maxEntries: 1,
    });

    assert.equal(limiter.check('client-a').allowed, true);
    assert.equal(limiter.check('client-b').allowed, true);
    assert.equal(limiter.check('client-a').allowed, true);
  });
});
