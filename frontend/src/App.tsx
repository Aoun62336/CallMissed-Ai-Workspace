import { useEffect, useState } from 'react';
import { AccessGate } from './components/AccessGate';
import { Layout, type Route } from './components/Layout';
import { ChatPage } from './features/chat/ChatPage';
import { ImagesPage } from './features/images/ImagesPage';
import { VoicePage } from './features/voice/VoicePage';

function normalize(pathname: string): Route {
  if (pathname === '/images') return '/images';
  if (pathname === '/voice') return '/voice';
  return '/chat';
}

export function App() {
  const [route, setRoute] = useState<Route>(() => normalize(window.location.pathname));

  useEffect(() => {
    if (window.location.pathname === '/' || !['/chat', '/images', '/voice'].includes(window.location.pathname)) {
      window.history.replaceState({}, '', route);
    }
    const onPop = () => setRoute(normalize(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function navigate(next: Route) {
    if (next === route) return;
    window.history.pushState({}, '', next);
    setRoute(next);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  return <AccessGate>
    <Layout route={route} onNavigate={navigate}>
      {route === '/images' ? <ImagesPage/> : route === '/voice' ? <VoicePage/> : <ChatPage/>}
    </Layout>
  </AccessGate>;
}
