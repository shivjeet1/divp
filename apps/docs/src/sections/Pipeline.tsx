import { Callout } from '../components/Callout';
import { CodeBlock } from '../components/CodeBlock';
import { Mermaid } from '../components/Mermaid';
import { PipelineStepper } from '../components/PipelineStepper';
import { ERROR_SHAPE } from '../content/api';
import { AUTH_SEQUENCE } from '../content/diagrams';

export function Pipeline() {
  return (
    <article>
      <header className="section-head">
        <div className="eyebrow">Flows</div>
        <h1>Authentication pipeline</h1>
        <p className="lead">
          Twelve stages take a visitor from &ldquo;no session&rdquo; to an authenticated Web2
          request — and back. Step through them below; each stage shows what runs where and which
          error code stops the pipeline on failure.
        </p>
      </header>

      <PipelineStepper />

      <section className="block">
        <h2>End-to-end sequence</h2>
        <Mermaid
          chart={AUTH_SEQUENCE}
          caption="Figure 4 — The full happy path across all five participants, numbered to match the stepper above."
        />
      </section>

      <section className="block">
        <h2>Error contract</h2>
        <p>
          Every stage that fails throws an <code>AppError</code> with a stable, machine-readable
          code. The pipeline stops at the first failure and writes an audit row with the reason.
          Errors never leak stacks, SQL or secrets.
        </p>
        <CodeBlock code={ERROR_SHAPE} label="json" />
        <Callout variant="info" title="Order matters">
          The nonce is consumed <em>after</em> signature verification but <em>before</em> session
          creation, so no path can mint a session without burning a nonce — that ordering is what
          makes replay impossible.
        </Callout>
      </section>
    </article>
  );
}
