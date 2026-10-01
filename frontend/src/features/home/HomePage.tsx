import { ChatIcon, ImageIcon, MicIcon } from '../../lib/icons';
import type { Route } from '../../components/Layout';

type Props = { onNavigate: (route: Route) => void };

const FEATURES = [
  {
    route: '/chat' as Route,
    Icon: ChatIcon,
    tag: 'Conversational AI',
    title: 'Chat',
    desc: 'Ask questions, explore ideas, and hold multi-turn conversations powered by the sarvam-105b-conversations model.',
    cta: 'Open Chat',
  },
  {
    route: '/images' as Route,
    Icon: ImageIcon,
    tag: 'Text-to-image generation',
    title: 'Images',
    desc: 'Describe a scene, subject, or style and generate a 1024×1024 image. Apply one-click style presets or craft your own prompt.',
    cta: 'Open Images',
  },
  {
    route: '/voice' as Route,
    Icon: MicIcon,
    tag: 'Real-time voice AI',
    title: 'Voice',
    desc: 'Speak directly to the AI assistant using your browser microphone. Responses stream back in real time over WebRTC.',
    cta: 'Open Voice',
  },
];

export function HomePage({ onNavigate }: Props) {
  return (
    <div className="home">
      <div className="home-hero">
        <div className="home-hero-mark">AI</div>
        <h1>AI Workspace</h1>
        <p className="home-hero-sub">
          One interface for conversational AI, image generation, and real-time voice.
        </p>
        <button className="btn primary home-cta" onClick={() => onNavigate('/chat')}>
          Get started
        </button>
      </div>

      <div className="home-grid">
        {FEATURES.map(({ route, Icon, tag, title, desc, cta }) => (
          <div key={route} className="home-card">
            <div className="home-card-icon"><Icon /></div>
            <div className="home-card-tag">{tag}</div>
            <h2 className="home-card-title">{title}</h2>
            <p className="home-card-desc">{desc}</p>
            <button className="btn primary home-card-btn" onClick={() => onNavigate(route)}>
              {cta}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
