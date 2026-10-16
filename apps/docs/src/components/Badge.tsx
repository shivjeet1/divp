const STATUS_TONE = (status: number): string => {
  if (status < 300) return 'ok';
  if (status < 500) return 'warn';
  return 'err';
};

export function MethodBadge({ method }: { method: string }) {
  return <span className={`method method-${method.toLowerCase()}`}>{method}</span>;
}

export function StatusBadge({ status }: { status: number }) {
  return <span className={`badge ${STATUS_TONE(status)}`}>{status}</span>;
}

export function Pill({ children, tone = '' }: { children: string; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
