import type { ReactNode } from 'react';
import { ChatIcon, ImageIcon, MicIcon } from '../lib/icons';

export type Route = '/chat' | '/images' | '/voice';

type Props = {
  route: Route;
  onNavigate: (route: Route) => void;
  children: ReactNode;
};

const items: Array<{ route: Route; label: string; icon: typeof ChatIcon }> = [
  { route: '/chat', label: 'Chat', icon: ChatIcon },
  { route: '/images', label: 'Images', icon: ImageIcon },
  { route: '/voice', label: 'Voice', icon: MicIcon },
];

export function Layout({ route, onNavigate, children }: Props) {
  return <>
    <a href="#main" className="skip">Skip to content</a>
    <aside className="sidebar">
      <div className="brand">
        <span className="mark">AI</span>
        <div><strong>AI Workspace</strong><span className="eyebrow">CallMissed assessment</span></div>
      </div>
      <nav className="nav" aria-label="Main navigation">
        {items.map(({ route: target, label, icon: Icon }) => <a
          key={target}
          href={target}
          aria-current={route === target ? 'page' : undefined}
          onClick={(event) => { event.preventDefault(); onNavigate(target); }}
        ><Icon />{label}</a>)}
      </nav>
      <footer>Independent assessment<br/>by Aoun Md.</footer>
    </aside>
    <div className="shell">
      <header className="topbar">CallMissed AI Workspace</header>
      <main id="main">{children}</main>
    </div>
  </>;
}
