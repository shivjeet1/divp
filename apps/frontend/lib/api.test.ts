import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, BackendRequestError } from '@/lib/api';

function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('sends credentials and parses /auth/config', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockResponse(200, { chainId: 1337, domain: 'localhost:3000' }));
    vi.stubGlobal('fetch', fetchMock);

    const config = await api.getConfig();
    expect(config.chainId).toBe(1337);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/auth/config');
    expect(init.credentials).toBe('include'); // cookies must flow
  });

  it('maps structured backend errors to BackendRequestError with the code', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          mockResponse(401, { error: 'AUTH_REQUIRED', message: 'Authentication required.' }),
        ),
    );

    await expect(api.me()).rejects.toBeInstanceOf(BackendRequestError);
    await api.me().catch((error: BackendRequestError) => {
      expect(error.code).toBe('AUTH_REQUIRED');
      expect(error.status).toBe(401);
      expect(error.message).toBe('Authentication required.');
    });
  });

  it('posts JSON bodies for nonce creation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        mockResponse(201, { address: '0xabc', nonce: 'n', expiresAt: '', ttlSeconds: 300 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await api.createNonce('0xabc');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ address: '0xabc' }));
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('falls back to a generic message when the backend returns non-JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('not json');
        },
      } as unknown as Response),
    );

    await api.protected().catch((error: BackendRequestError) => {
      expect(error.code).toBe('UNKNOWN_ERROR');
      expect(error.status).toBe(502);
    });
  });
});
