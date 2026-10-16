import { useState } from 'react';

export interface CodeBlockProps {
  code: string;
  label?: string;
}

export function CodeBlock({ code, label = 'json' }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      console.warn('Clipboard API unavailable; copy skipped.');
    }
  };

  return (
    <div className="codeblock">
      <div className="codeblock-bar">
        <span className="codeblock-label">{label}</span>
        <button type="button" className="codeblock-copy" onClick={() => void copy()}>
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
