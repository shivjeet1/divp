import type { ReactNode } from 'react';

export type CalloutVariant = 'info' | 'warn' | 'error' | 'ok';

export interface CalloutProps {
  variant?: CalloutVariant;
  title?: string;
  children: ReactNode;
}

export function Callout({ variant = 'info', title, children }: CalloutProps) {
  return (
    <div className={`callout ${variant}`}>
      {title ? <div className="callout-title">{title}</div> : null}
      <div className="callout-body">{children}</div>
    </div>
  );
}
