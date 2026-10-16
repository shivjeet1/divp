import { Mermaid } from '../components/Mermaid';
import { ADMIN_FLOW, FRONTEND_STATE_MACHINE, REGISTRATION_FLOW } from '../content/diagrams';

export function Flows() {
  return (
    <article>
      <header className="section-head">
        <div className="eyebrow">Flows</div>
        <h1>State &amp; flows</h1>
        <p className="lead">
          The client is a small state machine, and the two most security-sensitive server flows —
          admin writes and self-registration — are deliberately narrow.
        </p>
      </header>

      <section className="block">
        <h2>Frontend state machine</h2>
        <p>
          <code>useAuth</code> tracks the session lifecycle. It subscribes to{' '}
          <code>accountsChanged</code> and <code>chainChanged</code>: a wallet switch forces a
          logout, a network switch forces re-authentication, and a reload with a mismatched wallet
          is detected during boot by comparing <code>/auth/me</code>&rsquo;s wallet against{' '}
          <code>eth_accounts[0]</code>.
        </p>
        <Mermaid
          chart={FRONTEND_STATE_MACHINE}
          caption="Figure 5 — Boot, connect, sign, authenticate — plus the transitions that revoke a session."
        />
      </section>

      <section className="block">
        <h2>Admin write flow</h2>
        <p>
          Admin endpoints require a live session <em>and</em> the <code>ADMIN</code> role from the
          chain (never the request), plus a valid Origin. The contract enforces{' '}
          <code>onlyAdmin</code> as a second line of defense, and every admin action also revokes
          the target&rsquo;s active Web2 sessions.
        </p>
        <Mermaid
          chart={ADMIN_FLOW}
          caption="Figure 6 — Registration, role changes and revocations are signed on-chain and mirrored into session revocation."
        />
      </section>

      <section className="block">
        <h2>Self-registration flow</h2>
        <p>
          A visitor can register a wallet they provably control — the request must carry a valid
          SIWE signature whose signer equals the claimed address. The wallet is always created at
          the least-privileged <code>USER</code> role, and a wallet already known to the contract
          (active or revoked) is rejected with <code>ALREADY_REGISTERED</code>: revocation cannot be
          bypassed by re-registering.
        </p>
        <Mermaid
          chart={REGISTRATION_FLOW}
          caption="Figure 7 — Proof of ownership in, least-privileged role out; known wallets are an admin-only reactivation."
        />
      </section>
    </article>
  );
}
