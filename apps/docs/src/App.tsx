import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { Sidebar } from './components/Sidebar';
import { DEFAULT_SECTION, SECTIONS } from './content/nav';
import { ApiReference } from './sections/ApiReference';
import { Architecture } from './sections/Architecture';
import { Flows } from './sections/Flows';
import { Overview } from './sections/Overview';
import { Pipeline } from './sections/Pipeline';
import { Security } from './sections/Security';
import { Setup } from './sections/Setup';
import { Tests } from './sections/Tests';

const RENDERERS: Record<string, ComponentType> = {
  overview: Overview,
  architecture: Architecture,
  pipeline: Pipeline,
  flows: Flows,
  api: ApiReference,
  security: Security,
  setup: Setup,
  tests: Tests,
};

const parseHash = (hash: string): string => {
  const id = hash.replace(/^#\/?/, '').trim();
  return SECTIONS.some((s) => s.id === id) ? id : DEFAULT_SECTION;
};

function FooterNav({ section }: { section: string }) {
  const index = SECTIONS.findIndex((s) => s.id === section);
  const prev = index > 0 ? SECTIONS[index - 1] : null;
  const next = index >= 0 && index < SECTIONS.length - 1 ? SECTIONS[index + 1] : null;

  return (
    <nav className="footer-nav" aria-label="Section navigation">
      {prev ? (
        <a className="footer-link" href={`#/${prev.id}`}>
          <span className="footer-dir">← Previous</span>
          <strong>{prev.label}</strong>
        </a>
      ) : (
        <span />
      )}
      {next ? (
        <a className="footer-link next" href={`#/${next.id}`}>
          <span className="footer-dir">Next →</span>
          <strong>{next.label}</strong>
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
}

export default function App() {
  const [section, setSection] = useState(() => parseHash(window.location.hash));
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onHashChange = () => setSection(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [section]);

  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const Section = RENDERERS[section] ?? Overview;

  return (
    <div className="layout">
      <Sidebar current={section} open={menuOpen} onNavigate={() => setMenuOpen(false)} />

      <div className="main">
        <div className="topbar">
          <button
            type="button"
            className="menu-toggle"
            aria-label="Toggle navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            ☰
          </button>
          <span className="topbar-title">{current.label}</span>
          <span className="topbar-blurb">{current.blurb}</span>
        </div>

        <main className="content">
          <Section />
          <FooterNav section={section} />
        </main>

        <footer className="site-foot">
          Decentralized Identity Verification Pipeline · documentation portal ·{' '}
          <code>localhost:5173</code>
        </footer>
      </div>
    </div>
  );
}
