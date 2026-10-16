import { Callout } from '../components/Callout';
import { Table } from '../components/Table';
import {
  ATTACKS,
  RESIDUAL_RISKS,
  SECURITY_PROPERTIES,
  STRIDE_ROWS,
  THREATS,
  TRADEOFFS,
} from '../content/security';

export function Security() {
  return (
    <article>
      <header className="section-head">
        <div className="eyebrow">Reference</div>
        <h1>Security</h1>
        <p className="lead">
          Ten required attacks, each proven blocked across layers — plus a full STRIDE-flavoured
          threat model and the trade-offs that are documented rather than hidden.
        </p>
      </header>

      <section className="block">
        <h2>Security properties implemented</h2>
        <div className="card-grid">
          {SECURITY_PROPERTIES.map((p) => (
            <div className="card" key={p.title}>
              <h3>{p.title}</h3>
              <p>{p.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="block">
        <h2>Threat model</h2>
        <p className="muted">
          Assets → attacker model → threats → mitigations → residual risk. Expand each threat for
          the threat statement and its controls.
        </p>
        <div className="threat-list">
          {THREATS.map((t) => (
            <details className="threat" key={t.id}>
              <summary>
                <span className="threat-id">{t.id}</span>
                <span className="threat-title">{t.title}</span>
                <span className="badge">{t.category}</span>
              </summary>
              <div className="threat-body">
                <p>
                  <strong>Threat.</strong> {t.threat}
                </p>
                <p>
                  <strong>Mitigation.</strong> {t.mitigation}
                </p>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="block">
        <h2>The 10 attacks and their proofs</h2>
        <Table
          headers={['#', 'Attack', 'Mechanism', 'Proven in']}
          rows={ATTACKS.map((a) => [String(a.n), a.name, a.mechanism, a.where.join(' · ')])}
          mono={[0]}
        />
      </section>

      <section className="block">
        <h2>STRIDE summary</h2>
        <Table headers={['Category', 'Primary controls']} rows={STRIDE_ROWS.map((r) => r.cells)} />
      </section>

      <section className="block">
        <h2>Documented trade-offs</h2>
        <Table
          headers={['Trade-off', 'Rationale / guidance']}
          rows={TRADEOFFS.map((r) => r.cells)}
        />
      </section>

      <section className="block">
        <h2>Residual risks &amp; future work</h2>
        <ul className="bullet-list">
          {RESIDUAL_RISKS.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>

      <Callout variant="info" title="Reporting">
        Full detail lives in <code>docs/threat-model.md</code> and{' '}
        <code>docs/security-testing.md</code>; every attack maps to a specific test in the
        repository.
      </Callout>
    </article>
  );
}
