import { SECTION_GROUPS, SECTIONS } from '../content/nav';

export interface SidebarProps {
  current: string;
  open: boolean;
  onNavigate: () => void;
}

export function Sidebar({ current, open, onNavigate }: SidebarProps) {
  return (
    <nav className={`sidebar ${open ? 'open' : ''}`} aria-label="Documentation sections">
      <a className="brand" href="#/overview" onClick={onNavigate}>
        <span className="brand-mark">DIVP</span>
        <span className="brand-sub">docs &amp; visualization</span>
      </a>

      {SECTION_GROUPS.map((group) => (
        <div key={group} className="nav-group">
          <div className="nav-group-label">{group}</div>
          {SECTIONS.filter((s) => s.group === group).map((s) => (
            <a
              key={s.id}
              href={`#/${s.id}`}
              className={`nav-link ${current === s.id ? 'active' : ''}`}
              aria-current={current === s.id ? 'page' : undefined}
              onClick={onNavigate}
            >
              {s.label}
            </a>
          ))}
        </div>
      ))}

      <div className="sidebar-foot">
        <div className="nav-group-label">Repository</div>
        <div className="sidebar-note">
          Apps: <code>backend</code> · <code>frontend</code> · <code>docs</code>
          <br />
          Ports: <code>4000</code> · <code>3000</code> · <code>5173</code>
        </div>
      </div>
    </nav>
  );
}
