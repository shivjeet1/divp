import mermaid from 'mermaid';
import { useEffect, useRef, useState } from 'react';

/**
 * Mermaid is initialised once with a monochrome theme that matches the portal
 * palette: black panels, zinc borders and grey connection lines. Each
 * <Mermaid /> instance renders its chart into a unique id, so multiple
 * diagrams can coexist (and React StrictMode's double-effect is harmless).
 */
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'base',
  themeVariables: {
    darkMode: true,
    background: '#0a0a0a',
    primaryColor: '#0a0a0a',
    primaryTextColor: '#e4e4e7',
    primaryBorderColor: '#3f3f46',
    secondaryColor: '#18181b',
    tertiaryColor: '#18181b',
    lineColor: '#71717a',
    textColor: '#e4e4e7',
    nodeTextColor: '#e4e4e7',
    edgeLabelBackground: '#0a0a0a',
    // sequence diagrams
    actorBkg: '#0a0a0a',
    actorBorder: '#3f3f46',
    actorTextColor: '#e4e4e7',
    actorLineColor: '#27272a',
    signalColor: '#a1a1aa',
    signalTextColor: '#d4d4d8',
    labelBoxBkgColor: '#0a0a0a',
    labelBoxBorderColor: '#3f3f46',
    labelTextColor: '#e4e4e7',
    loopTextColor: '#e4e4e7',
    activationBkgColor: '#18181b',
    activationBorderColor: '#52525b',
    sequenceNumberColor: '#a1a1aa',
    noteBkgColor: '#18181b',
    noteBorderColor: '#3f3f46',
    noteTextColor: '#d4d4d8',
    // entity-relationship diagrams
    attributeBackgroundColorOdd: '#0a0a0a',
    attributeBackgroundColorEven: '#18181b',
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: '13px',
  },
  flowchart: { curve: 'basis', htmlLabels: true },
  sequence: { useMaxWidth: true, mirrorActors: false },
});

let sequence = 0;

export interface MermaidProps {
  chart: string;
  caption?: string;
}

export function Mermaid({ chart, caption }: MermaidProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const id = `mmd-${(sequence += 1)}`;

    mermaid
      .render(id, chart)
      .then(({ svg }) => {
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chart]);

  return (
    <figure className="diagram">
      {error ? (
        <pre className="diagram-error">
          Diagram failed to render:
          {'\n'}
          {error}
        </pre>
      ) : (
        <div className="diagram-canvas" ref={ref} />
      )}
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}
