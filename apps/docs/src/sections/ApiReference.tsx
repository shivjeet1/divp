import { MethodBadge, StatusBadge } from '../components/Badge';
import { Callout } from '../components/Callout';
import { CodeBlock } from '../components/CodeBlock';
import { Table } from '../components/Table';
import { COOKIE_TABLE, ENDPOINTS, ERROR_CODES, ERROR_SHAPE } from '../content/api';
import type { Endpoint } from '../content/api';

const GROUPS: Endpoint['group'][] = ['Public', 'SIWE flow', 'Session', 'Protected', 'Admin'];

export function ApiReference() {
  return (
    <article>
      <header className="section-head">
        <div className="eyebrow">Reference</div>
        <h1>API reference</h1>
        <p className="lead">
          Base URL <code>http://localhost:4000</code>. All responses are JSON. Auth-bearing
          endpoints use the <code>{COOKIE_TABLE.name}</code> HttpOnly cookie, and every mutating
          request must send <code>Origin</code>.
        </p>
      </header>

      <Callout variant="warn" title="Mutating requests need an Origin">
        POST / PATCH / DELETE without an allowed <code>Origin</code> are rejected with{' '}
        <code>ORIGIN_NOT_ALLOWED</code> (403). Server-to-server and curl clients must send{' '}
        <code>Origin: http://localhost:3000</code> explicitly — that header is the CSRF defense.
      </Callout>

      <section className="block">
        <h2>Error contract</h2>
        <CodeBlock code={ERROR_SHAPE} label="json" />
        <p className="muted">
          <code>error</code> is a stable machine-readable code; <code>message</code> is safe,
          user-facing text. Validation errors additionally carry field-level <code>details</code>.
          Internal failures are always a generic <code>INTERNAL_ERROR</code>.
        </p>
      </section>

      {GROUPS.map((group) => (
        <section className="block" key={group}>
          <h2>{group}</h2>
          <div className="endpoint-list">
            {ENDPOINTS.filter((e) => e.group === group).map((endpoint) => (
              <div className="endpoint" key={endpoint.id}>
                <div className="endpoint-head">
                  <MethodBadge method={endpoint.method} />
                  <code className="endpoint-path">{endpoint.path}</code>
                </div>
                <div className="endpoint-auth">{endpoint.auth}</div>
                <p>{endpoint.summary}</p>
                <div className="endpoint-io">
                  {endpoint.request ? <CodeBlock code={endpoint.request} label="request" /> : null}
                  {endpoint.response ? (
                    <CodeBlock code={endpoint.response} label="response" />
                  ) : null}
                </div>
                {endpoint.errors?.length ? (
                  <ul className="endpoint-errors">
                    {endpoint.errors.map((err) => (
                      <li key={err}>
                        <code>{err}</code>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="block">
        <h2>Error codes</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Status</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              {ERROR_CODES.map((e) => (
                <tr key={e.code}>
                  <td className="mono">{e.code}</td>
                  <td>
                    <StatusBadge status={e.status} />
                  </td>
                  <td>{e.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="block">
        <h2>Cookies</h2>
        <Table
          headers={['Name', 'Flags', 'Notes']}
          rows={[[COOKIE_TABLE.name, COOKIE_TABLE.flags, COOKIE_TABLE.notes]]}
          mono={[0]}
        />
      </section>
    </article>
  );
}
