/**
 * Full-pipeline smoke test against the running backend.
 * Simulates what the frontend + MetaMask do, using ethers' HD wallet
 * (identical `personal_sign` semantics: EIP-191 personal message signing).
 *
 * Usage: node scripts/smoke-auth.js [--chain 1337] [--domain evil.example]
 */
const { HDNodeWallet } = require('ethers');
const { randomBytes } = require('crypto');

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:4000';
const MNEMONIC = 'test test test test test test test test test test test junk';
const ORIGIN = process.env.ORIGIN ?? 'http://localhost:3000';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

async function api(path, options = {}) {
  const res = await fetch(BACKEND + path, {
    ...options,
    headers: {
      Origin: ORIGIN,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, headers: res.headers };
}

function buildSiwe({
  domain,
  address,
  statement,
  uri,
  chainId,
  nonce,
  issuedAt,
  expirationTime,
  requestId,
}) {
  const lines = [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    '',
    statement,
    '',
    `URI: ${uri}`,
    'Version: 1',
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expirationTime}`,
    `Request ID: ${requestId}`,
  ];
  return lines.join('\n');
}

async function getNonce(address) {
  const r = await api('/auth/nonce', { method: 'POST', body: JSON.stringify({ address }) });
  if (r.status !== 200) throw new Error(`nonce failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

async function signSiwe(wallet, overrides = {}) {
  const cfg = await api('/auth/config').then((r) => r.body);
  const nonceRes = await getNonce(wallet.address);
  const now = new Date();
  const issuedAt = overrides.issuedAt ?? now.toISOString();
  const expirationTime =
    overrides.expirationTime ?? new Date(now.getTime() + 5 * 60 * 1000).toISOString();
  const message = buildSiwe({
    domain: overrides.domain ?? cfg.domain,
    address: overrides.address ?? wallet.address,
    statement: cfg.statement,
    uri: overrides.uri ?? cfg.uri,
    chainId: overrides.chainId ?? cfg.chainId,
    nonce: overrides.nonce ?? nonceRes.nonce,
    issuedAt,
    expirationTime,
    requestId: overrides.requestId ?? randomBytes(8).toString('hex'),
  });
  const signature = await wallet.signMessage(message);
  return { message, signature, nonceRes };
}

function account(index) {
  return HDNodeWallet.fromPhrase(MNEMONIC, undefined, `m/44'/60'/0'/0/${index}`);
}

async function expectBlocked(label, result) {
  const blocked = result.status >= 400;
  console.log(
    `${blocked ? 'BLOCKED' : '*** NOT BLOCKED ***'}  ${label} -> ${result.status} ${JSON.stringify(result.body)}`,
  );
  return blocked;
}

async function main() {
  const user = account(1); // seeded as USER
  const outsider = account(4); // unregistered
  let failures = 0;

  console.log('== 1. happy path ==');
  const cfg = await api('/auth/config');
  console.log('config:', cfg.status, JSON.stringify(cfg.body));
  const health = await api('/health');
  console.log('health:', health.status, JSON.stringify(health.body));

  const login = await signSiwe(user);
  const verified = await api('/auth/verify', {
    method: 'POST',
    body: JSON.stringify(login),
  });
  console.log('verify:', verified.status, JSON.stringify(verified.body));
  const cookie = verified.headers.get('set-cookie');
  if (verified.status !== 200 || !cookie) {
    console.log('HAPPY PATH FAILED');
    process.exit(1);
  }
  const cookiePair = cookie.split(';')[0];

  const me = await api('/auth/me', { headers: { Cookie: cookiePair } });
  console.log('me:', me.status, JSON.stringify(me.body));
  const protectedRes = await api('/api/protected', { headers: { Cookie: cookiePair } });
  console.log('protected:', protectedRes.status, JSON.stringify(protectedRes.body));
  const adminRes = await api('/api/protected/admin', { headers: { Cookie: cookiePair } });
  failures += (await expectBlocked('role gate: USER -> admin resource', adminRes)) ? 0 : 1;

  console.log('\n== 2. replay (reuse captured message+signature) ==');
  failures += (await expectBlocked(
    'replay',
    await api('/auth/verify', { method: 'POST', body: JSON.stringify(login) }),
  ))
    ? 0
    : 1;

  console.log('\n== 3. wrong chain ==');
  const wrongChain = await signSiwe(user, { chainId: 1 });
  failures += (await expectBlocked(
    'wrong chain',
    await api('/auth/verify', { method: 'POST', body: JSON.stringify(wrongChain) }),
  ))
    ? 0
    : 1;

  console.log('\n== 4. wrong domain ==');
  const wrongDomain = await signSiwe(user, { domain: 'evil.example' });
  failures += (await expectBlocked(
    'wrong domain',
    await api('/auth/verify', { method: 'POST', body: JSON.stringify(wrongDomain) }),
  ))
    ? 0
    : 1;

  console.log('\n== 5. wrong wallet (message claims Wallet A, signed by Wallet B) ==');
  // Nonce is issued for the *claimed* wallet A; B produces the signature.
  const claimedA = account(1);
  const signerB = account(4);
  const nonceForA = await getNonce(claimedA.address);
  const now5 = new Date();
  const wrongWalletMsg = buildSiwe({
    domain: cfg.body.domain,
    address: claimedA.address,
    statement: cfg.body.statement,
    uri: cfg.body.uri,
    chainId: cfg.body.chainId,
    nonce: nonceForA.nonce,
    issuedAt: now5.toISOString(),
    expirationTime: new Date(now5.getTime() + 300000).toISOString(),
    requestId: 'req-wrong-wallet',
  });
  const wrongWallet = {
    message: wrongWalletMsg,
    signature: await signerB.signMessage(wrongWalletMsg),
  };
  failures += (await expectBlocked(
    'wrong wallet',
    await api('/auth/verify', { method: 'POST', body: JSON.stringify(wrongWallet) }),
  ))
    ? 0
    : 1;

  console.log('\n== 6. unauthorized wallet (valid sig, unregistered #4) ==');
  const unauthorized = await signSiwe(outsider);
  failures += (await expectBlocked(
    'unauthorized wallet',
    await api('/auth/verify', { method: 'POST', body: JSON.stringify(unauthorized) }),
  ))
    ? 0
    : 1;

  console.log('\n== 7. expired SIWE ==');
  const expired = await signSiwe(user, {
    issuedAt: new Date(Date.now() - 3600_000).toISOString(),
    expirationTime: new Date(Date.now() - 1800_000).toISOString(),
  });
  failures += (await expectBlocked(
    'expired siwe',
    await api('/auth/verify', { method: 'POST', body: JSON.stringify(expired) }),
  ))
    ? 0
    : 1;

  console.log('\n== 8. tampered signature (fresh message) ==');
  const fresh = await signSiwe(user);
  const tampered = { ...fresh, signature: fresh.signature.slice(0, -4) + '0000' };
  failures += (await expectBlocked(
    'tampered signature',
    await api('/auth/verify', { method: 'POST', body: JSON.stringify(tampered) }),
  ))
    ? 0
    : 1;

  console.log('\n== 9. logout ==');
  const out = await api('/auth/logout', { method: 'POST', headers: { Cookie: cookiePair } });
  console.log('logout:', out.status, JSON.stringify(out.body));
  const meAfter = await api('/auth/me', { headers: { Cookie: cookiePair } });
  failures += (await expectBlocked('me after logout (revoked)', meAfter)) ? 0 : 1;

  console.log(failures === 0 ? '\nSMOKE: ALL PASS' : `\nSMOKE: ${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
