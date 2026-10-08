import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { HttpRequest, InvocationContext } from '@azure/functions';
import { aiAssistant } from './ai-assistant';
import { msftQuote } from './msft-quote';

const originalEnv = { ...process.env };

function context(functionName: string): InvocationContext {
  return new InvocationContext({
    functionName,
    logHandler: () => undefined,
  });
}

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('aiAssistant', () => {
  it('rejects invalid JSON', async () => {
    const request = new HttpRequest({
      method: 'POST',
      url: 'https://example.test/api/ai-assistant',
      headers: { 'x-forwarded-for': '203.0.113.1' },
      body: { string: '{invalid' },
    });

    const response = await aiAssistant(request, context('ai-assistant'));

    assert.equal(response.status, 400);
  });

  it('rejects oversized calculated facts', async () => {
    const request = new HttpRequest({
      method: 'POST',
      url: 'https://example.test/api/ai-assistant',
      headers: { 'x-forwarded-for': '203.0.113.2' },
      body: {
        string: JSON.stringify({
          topic: 'Calcul fiscal',
          facts: { value: 'x'.repeat(8000) },
        }),
      },
    });

    const response = await aiAssistant(request, context('ai-assistant'));

    assert.equal(response.status, 413);
  });

  it('reports unavailable service when Azure OpenAI is not configured', async () => {
    delete process.env.AZURE_OPENAI_ENDPOINT;
    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.AZURE_OPENAI_DEPLOYMENT;
    const request = new HttpRequest({
      method: 'POST',
      url: 'https://example.test/api/ai-assistant',
      headers: { 'x-forwarded-for': '203.0.113.3' },
      body: { string: JSON.stringify({ topic: 'Calcul fiscal', facts: {} }) },
    });

    const response = await aiAssistant(request, context('ai-assistant'));

    assert.equal(response.status, 503);
  });
});

describe('msftQuote', () => {
  it('reports unavailable service when Finnhub is not configured', async () => {
    delete process.env.FINNHUB_API_KEY;
    const request = new HttpRequest({
      method: 'GET',
      url: 'https://example.test/api/msft-quote',
      headers: { 'x-forwarded-for': '203.0.113.4' },
    });

    const response = await msftQuote(request, context('msft-quote'));

    assert.equal(response.status, 503);
  });
});
