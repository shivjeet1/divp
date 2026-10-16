import { useEffect, useState } from 'react';
import { ACTOR_LABEL, PIPELINE_STEPS } from '../content/pipeline';
import { CodeBlock } from './CodeBlock';

const ACTOR_TONE: Record<string, string> = {
  client: 'info',
  backend: 'ok',
  database: 'warn',
  chain: 'err',
};

/**
 * Interactive step-through of the authentication pipeline. Past steps are
 * marked "done", the current one is highlighted, and auto-play advances every
 * few seconds until the end.
 */
export function PipelineStepper() {
  const total = PIPELINE_STEPS.length;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const step = PIPELINE_STEPS[index];
  const atEnd = index >= total - 1;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (atEnd) {
        setPlaying(false);
      } else {
        setIndex((i) => i + 1);
      }
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [playing, index, atEnd]);

  const go = (next: number) => {
    setPlaying(false);
    setIndex(Math.min(Math.max(next, 0), total - 1));
  };

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (atEnd) setIndex(0);
    setPlaying(true);
  };

  const progress = ((index + 1) / total) * 100;

  return (
    <div className="stepper">
      <div className="stepper-rail" role="tablist" aria-label="Authentication pipeline steps">
        {PIPELINE_STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={`rail-step ${i === index ? 'active' : ''} ${i < index ? 'done' : ''}`}
            onClick={() => go(i)}
            title={s.title}
          >
            <span className="rail-num">{s.n}</span>
            <span className="rail-label">{s.title}</span>
          </button>
        ))}
      </div>

      <div className="stepper-panel">
        <div className="stepper-progress" aria-hidden="true">
          <div className="stepper-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="stepper-controls">
          <button
            type="button"
            className="secondary"
            onClick={() => go(index - 1)}
            disabled={index === 0}
          >
            ← Prev
          </button>
          <button type="button" onClick={togglePlay}>
            {playing ? 'Pause' : atEnd ? 'Replay' : 'Auto-play'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => go(index + 1)}
            disabled={atEnd}
          >
            Next →
          </button>
          <span className="stepper-counter">
            Step {step.n} / {total}
          </span>
        </div>

        <div className="stepper-body">
          <div className="stepper-head">
            <span className={`badge ${ACTOR_TONE[step.actor] ?? ''}`}>
              {ACTOR_LABEL[step.actor]}
            </span>
            <code className="stepper-protocol">{step.protocol}</code>
          </div>

          <h3 className="stepper-title">{step.title}</h3>
          <p className="stepper-summary">{step.summary}</p>
          <p className="stepper-detail">{step.detail}</p>

          {step.checks?.length ? (
            <div className="stepper-checks">
              <div className="stepper-checks-label">Enforced checks</div>
              <ul>
                {step.checks.map((c) => (
                  <li key={c}>
                    <code>{c}</code>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {step.code ? <CodeBlock code={step.code} label="payload" /> : null}

          {step.failure ? (
            <div className="stepper-failure">
              <span className={`badge ${step.failure.status >= 500 ? 'err' : 'warn'}`}>
                {step.failure.status}
              </span>
              <span className="stepper-failure-code">{step.failure.code}</span>
              <span className="stepper-failure-label">on failure</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
