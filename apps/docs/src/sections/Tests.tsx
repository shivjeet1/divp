import { Callout } from '../components/Callout';
import { Table } from '../components/Table';
import { TEST_LAYERS, TEST_MATRIX, TEST_NOTES } from '../content/tests';

export function Tests() {
  return (
    <article>
      <header className="section-head">
        <div className="eyebrow">Guide</div>
        <h1>Test matrix</h1>
        <p className="lead">
          Five layers prove the pipeline: contract, backend unit + integration, frontend unit,
          browser end-to-end, and a live smoke run against the real contract and database.
        </p>
      </header>

      <section className="block">
        <h2>Suites</h2>
        <Table
          headers={['Suite', 'Command', 'Count', 'What it covers']}
          rows={TEST_MATRIX.map((t) => [t.suite, t.command, t.count, t.what])}
          mono={[1, 2]}
        />
      </section>

      <section className="block">
        <h2>Layers</h2>
        <div className="card-grid">
          {TEST_LAYERS.map((l) => (
            <div className="card" key={l.layer}>
              <h3>{l.layer}</h3>
              <p>{l.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="block">
        <h2>Notes</h2>
        <ul className="bullet-list">
          {TEST_NOTES.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <Callout variant="ok" title="Running the whole battery">
          <code>npm run test</code> chains the contract, backend, frontend and docs suites;{' '}
          <code>npm run smoke</code> exercises the live stack; <code>npm run test:e2e</code> drives
          a real browser. The live suites need Docker, a running chain and a migrated database.
        </Callout>
      </section>
    </article>
  );
}
