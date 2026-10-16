import { Callout } from '../components/Callout';
import { CodeBlock } from '../components/CodeBlock';
import { Table } from '../components/Table';
import {
  COMMANDS,
  ENV_VARS,
  PREREQUISITES,
  QUICKSTART,
  SEEDED_ACCOUNTS,
  SEED_MNEMONIC,
} from '../content/setup';

export function Setup() {
  return (
    <article>
      <header className="section-head">
        <div className="eyebrow">Guide</div>
        <h1>Setup &amp; commands</h1>
        <p className="lead">
          A local-development stack: PostgreSQL in Docker, a Ganache chain, an Express backend and a
          Next.js frontend — plus this documentation portal on its own port.
        </p>
      </header>

      <section className="block">
        <h2>Prerequisites</h2>
        <ul className="bullet-list">
          {PREREQUISITES.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </section>

      <section className="block">
        <h2>Quick start</h2>
        {QUICKSTART.map((step) => (
          <div className="quickstart-step" key={step.title}>
            <h3>{step.title}</h3>
            {step.note ? <p className="muted">{step.note}</p> : null}
            <CodeBlock code={step.code} label="bash" />
          </div>
        ))}
        <Callout variant="ok" title="One command in dev">
          <code>./start.sh</code> starts Ganache, the backend and the frontend, and bootstraps a
          fresh chain (deploy + seed) automatically when the registry is missing. This docs portal
          runs separately with <code>npm run dev:docs</code> on <code>http://localhost:5173</code>.
        </Callout>
      </section>

      <section className="block">
        <h2>Seeded test accounts</h2>
        <p>
          Deterministic Ganache mnemonic: <code>{SEED_MNEMONIC}</code> — the well-known Hardhat test
          phrase, <strong>public test material, never use in production</strong>.
        </p>
        <Table
          headers={['#', 'Address', 'On-chain role']}
          rows={SEEDED_ACCOUNTS.map((r) => r.cells)}
          mono={[1]}
        />
        <Callout variant="warn" title="ADMIN_PRIVATE_KEY is not a secret">
          It is the publicly-known Hardhat key #0, used so the admin API can sign local
          transactions. Admin write endpoints fail closed (
          <code>503 ADMIN_SIGNER_NOT_CONFIGURED</code>) when it is empty.
        </Callout>
      </section>

      <section className="block">
        <h2>Commands</h2>
        <Table headers={['Command', 'Purpose']} rows={COMMANDS.map((r) => r.cells)} mono={[0]} />
      </section>

      <section className="block">
        <h2>Environment variables</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              {ENV_VARS.map((v) => (
                <tr key={v.key}>
                  <td className="mono">
                    {v.key}
                    {v.secret ? <span className="badge err">secret</span> : null}
                  </td>
                  <td>{v.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Callout variant="info" title="Restart after editing .env">
          The backend reads the root <code>.env</code> at process start — restart it after changing
          variables (<code>tsx watch</code> only reloads source files).
        </Callout>
      </section>
    </article>
  );
}
