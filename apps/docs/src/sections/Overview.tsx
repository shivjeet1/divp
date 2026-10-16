import { Callout } from '../components/Callout';
import { Mermaid } from '../components/Mermaid';
import { Table } from '../components/Table';
import { SYSTEM_ARCHITECTURE } from '../content/diagrams';
import { FACTS, HERO, HIGHLIGHTS, REPO_LAYOUT, STACK } from '../content/overview';

export function Overview() {
  return (
    <article>
      <header className="section-head">
        <div className="eyebrow">{HERO.eyebrow}</div>
        <h1>{HERO.title}</h1>
        <p className="lead">{HERO.tagline}</p>
      </header>

      <Callout variant="ok" title="Nothing here is mocked">
        {HERO.disclaimer}
      </Callout>

      <Mermaid
        chart={SYSTEM_ARCHITECTURE}
        caption="Figure 1 — The browser talks to the Express backend, which persists lifecycle data in PostgreSQL and reads authorization truth from the on-chain IdentityRegistry."
      />

      <section className="block">
        <h2>At a glance</h2>
        <div className="fact-grid">
          {FACTS.map((fact) => (
            <div className="fact" key={fact.label}>
              <div className="fact-label">{fact.label}</div>
              <div className="fact-value">{fact.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="block">
        <h2>Why it is interesting</h2>
        <div className="card-grid">
          {HIGHLIGHTS.map((h) => (
            <div className="card" key={h.title}>
              <h3>{h.title}</h3>
              <p>{h.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="block">
        <h2>Stack</h2>
        <Table
          headers={['Layer', 'Technology', 'Role']}
          rows={STACK.map((s) => [s.layer, s.tech, s.role])}
        />
      </section>

      <section className="block">
        <h2>Repository layout</h2>
        <Table
          headers={['Path', 'What it is']}
          rows={REPO_LAYOUT.map((r) => [r.path, r.what])}
          mono={[0]}
        />
      </section>

      <section className="block">
        <h2>How to read this portal</h2>
        <p>
          Use the sidebar to move between sections. Start with <strong>Architecture</strong> for the
          components and trust model, then step through the <strong>Auth pipeline</strong>{' '}
          interactively. The <strong>API reference</strong> and <strong>Security</strong> sections
          are the reference material;
          <strong> Setup</strong> and the <strong>Test matrix</strong> explain how to run and prove
          it.
        </p>
      </section>
    </article>
  );
}
