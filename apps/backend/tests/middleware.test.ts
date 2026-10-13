import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createRateLimiter } from '../src/middleware/rateLimit';
import { requestContext } from '../src/middleware/requestContext';
import { errorHandler } from '../src/middleware/errorHandler';

describe('rate limiting middleware', () => {
  it('returns a structured 429 after the limit is exceeded', async () => {
    const app = express();
    app.use(requestContext);
    app.use(createRateLimiter(3, 60_000));
    app.get('/x', (_req, res) => res.json({ ok: true }));

    const first = await request(app).get('/x');
    expect(first.status).toBe(200);

    await request(app).get('/x');
    await request(app).get('/x');

    const blocked = await request(app).get('/x');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({
      error: 'RATE_LIMITED',
      message: expect.any(String),
    });
  });
});

describe('origin (CSRF) middleware', () => {
  it('rejects state-changing requests without an allowed Origin', async () => {
    const { originCheck } = await import('../src/middleware/requestContext');
    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.use(originCheck);
    app.post('/action', (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);

    const noOrigin = await request(app).post('/action').send({});
    expect(noOrigin.status).toBe(403);
    expect(noOrigin.body.error).toBe('ORIGIN_NOT_ALLOWED');

    const evilOrigin = await request(app)
      .post('/action')
      .set('Origin', 'https://evil.example')
      .send({});
    expect(evilOrigin.status).toBe(403);
    expect(evilOrigin.body.error).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('allows state-changing requests from the configured frontend origin', async () => {
    const { originCheck } = await import('../src/middleware/requestContext');
    const { config } = await import('../src/config');
    const app = express();
    app.use(express.json());
    app.use(requestContext);
    app.use(originCheck);
    app.post('/action', (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);

    const res = await request(app)
      .post('/action')
      .set('Origin', config.urls.corsOrigins[0])
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('does not require an Origin for safe methods', async () => {
    const { originCheck } = await import('../src/middleware/requestContext');
    const app = express();
    app.use(requestContext);
    app.use(originCheck);
    app.get('/action', (_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/action');
    expect(res.status).toBe(200);
  });
});
