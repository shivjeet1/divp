import { Callout } from '../components/Callout';
import { Mermaid } from '../components/Mermaid';
import { Table } from '../components/Table';
import {
  BACKEND_MODULES,
  CONFIG_KEYS,
  CONTRACT_SURFACE,
  DATA_MODEL_TABLE,
  SESSION_DESIGN,
  TRUST_SPLIT,
} from '../content/architecture';
import { DATA_MODEL, TRUST_BOUNDARY } from '../content/diagrams';

export function Architecture() {
  return (
    <article>
      <header className="section-head">
        <div className="eyebrow">Introduction</div>
        <h1>Architecture</h1>
        <p className="lead">
          Four moving parts — a Next.js frontend, an Express backend, PostgreSQL and an on-chain
          registry — arranged around one idea: the contract owns authorization, everything else owns
          lifecycle.
        </p>
      </header>

      <section className="block">
        <h2>The trust split</h2>
        <div className="two-col">
          {TRUST_SPLIT.map((t) => (
            <div className={`card ${t.truth ? 'card-accent' : ''}`} key={t.store}>
              <h3>
                {t.store}
                {t.truth ? ' · authoritative' : ''}
              </h3>
              <p>{t.holds}</p>
            </div>
          ))}
        </div>
        <Callout variant="info" title="Why it matters">
          The backend consults the contract at verification time and — with{' '}
          <code>SESSION_RECHECK_ONCHAIN=true</code> (default) — again on every authenticated
          request. An on-chain revocation kills live sessions immediately instead of waiting for a
          JWT to expire.
        </Callout>
      </section>

      <section className="block">
        <h2>Trust boundary</h2>
        <Mermaid
          chart={TRUST_BOUNDARY}
          caption="Figure 2 — The backend sits between an untrusted client and the authoritative contract; it re-validates everything the client sends."
        />
      </section>

      <section className="block">
        <h2>The contract: IdentityRegistry</h2>
        <ul className="bullet-list">
          {CONTRACT_SURFACE.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <Callout variant="warn" title="Deployment addresses">
          Addresses flow{' '}
          <code>deploy script → contracts/deployment.json → .env (IDENTITY_CONTRACT_ADDRESS)</code>.
          The backend cross-checks <code>CHAIN_ID</code> against the RPC endpoint at startup and
          fails closed on a mismatch, so it can never silently talk to the wrong chain.
        </Callout>
      </section>

      <section className="block">
        <h2>Backend module map</h2>
        <Table
          headers={['Module', 'Responsibility']}
          rows={BACKEND_MODULES.map((m) => [m.module, m.responsibility])}
          mono={[0]}
        />
      </section>

      <section className="block">
        <h2>Data model</h2>
        <Mermaid
          chart={DATA_MODEL}
          caption="Figure 3 — PostgreSQL holds nonces, sessions and an audit trail. Authorization is deliberately absent: it is read from the chain."
        />
        <Table
          headers={['Table', 'Purpose', 'Key constraints']}
          rows={DATA_MODEL_TABLE.map((d) => [d.table, d.purpose, d.constraints])}
          mono={[0]}
        />
      </section>

      <section className="block">
        <h2>Session &amp; token design</h2>
        <ul className="bullet-list">
          {SESSION_DESIGN.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="block">
        <h2>Configuration contract</h2>
        <p>
          The frontend learns security-critical values from <code>GET /auth/config</code>. The
          backend independently re-validates every one of them during verification — the config
          endpoint is a convenience, not a trust source.
        </p>
        <Table
          headers={['Value', 'Purpose']}
          rows={CONFIG_KEYS.map((c) => [c.key, c.purpose])}
          mono={[0]}
        />
      </section>
    </article>
  );
}
