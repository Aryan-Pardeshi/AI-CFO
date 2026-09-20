import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiActivity, FiMessageSquare, FiRadio, FiTarget,
  FiArrowRight, FiTrendingUp, FiShield, FiChevronDown,
} from 'react-icons/fi';

const QUOTES = [
  { text: 'An investment in knowledge pays the best interest.', author: 'Benjamin Franklin' },
  { text: 'Do not save what is left after spending, but spend what is left after saving.', author: 'Warren Buffett' },
  { text: 'Know what you own, and know why you own it.', author: 'Peter Lynch' },
  { text: 'A budget is telling your money where to go instead of wondering where it went.', author: 'Dave Ramsey' },
  { text: 'You cannot predict. You can prepare.', author: 'Howard Marks' },
  { text: 'Beware of little expenses; a small leak will sink a great ship.', author: 'Benjamin Franklin' },
];

const FEATURES = [
  {
    Icon: FiActivity,
    title: 'Portfolio and net-worth overview',
    desc: 'Holdings, cash, and fixed deposits in one place, with allocation and concentration notes computed from your own data.',
    accent: '#064E3B',
  },
  {
    Icon: FiMessageSquare,
    title: 'ARIA advisory, grounded in tools',
    desc: 'Answers come from deterministic calculators and your stored profile - never invented numbers.',
    accent: '#A16207',
  },
  {
    Icon: FiRadio,
    title: 'Market context with provenance',
    desc: 'News and quotes carry source and as-of timestamps, or an honest unavailable state when upstream is down.',
    accent: '#B45309',
  },
  {
    Icon: FiTarget,
    title: 'Goals, FIRE, and monthly tracking',
    desc: 'Milestones, FIRE scenarios, and month-by-month cash flow derived from committed statements.',
    accent: '#7C3AED',
  },
];

const METRICS = [
  { value: 'Cognito-secured', label: 'Your data stays yours' },
  { value: 'Educational', label: 'Not investment advice' },
  { value: 'Paise-precise', label: 'Integer money math' },
];

const NAV_H = 68;

const gridStyle = {
  backgroundImage:
    'linear-gradient(rgba(6,78,59,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(6,78,59,0.04) 1px, transparent 1px)',
  backgroundSize: '48px 48px',
};

const Landing = () => {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [heroVisible, setHeroVisible] = useState(false);
  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], []);

  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 80);
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="landing-root">
      <style>{`
        .landing-root { font-family: var(--font-sans); background: var(--bg-color); color: var(--text-primary); overflow-x: hidden; }
        .landing-root section { scroll-margin-top: 68px; }
        .landing-hero { position: relative; min-height: 100vh; display: flex; align-items: center; overflow: hidden; background: #030E08; }
        .landing-hero-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.55; }
        .landing-hero-content { position: relative; z-index: 2; padding: 7rem 4rem 5rem 4rem; max-width: 760px; }
        .landing-section { padding: 5rem 4rem; }
        @media (max-width: 760px) {
          .landing-nav-links { display: none !important; }
          .landing-hero-content { padding: 6rem 1.25rem 3.5rem 1.25rem !important; }
          .landing-section { padding: 3.5rem 1.25rem !important; }
        }
      `}</style>
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000, height: NAV_H, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', background: scrolled ? 'rgba(250,249,246,0.92)' : 'transparent', borderBottom: scrolled ? '1px solid rgba(6,78,59,0.12)' : '1px solid transparent' }}>
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="ARIA — scroll to top"
          style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
        >
          <div style={{ width: 30, height: 30, background: '#064E3B', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '0.8rem' }} aria-hidden="true">A</div>
          <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: '1.05rem', color: scrolled ? '#1C1917' : '#fff' }}>ARIA</span>
        </button>
        <div className="landing-nav-links" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <button type="button" onClick={() => scrollTo('features')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.88rem', color: scrolled ? '#57534E' : 'rgba(255,255,255,0.78)' }}>Features</button>
          <button type="button" onClick={() => scrollTo('how')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.88rem', color: scrolled ? '#57534E' : 'rgba(255,255,255,0.78)' }}>How it works</button>
          <button type="button" onClick={() => navigate('/login')} style={{ background: 'none', border: '1px solid currentColor', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, padding: '0.5rem 1rem', color: scrolled ? '#064E3B' : '#fff' }}>Sign in</button>
          <button type="button" onClick={() => navigate('/register')} style={{ background: '#064E3B', border: '1px solid #064E3B', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, padding: '0.5rem 1rem', color: '#fff' }}>Start for free</button>
        </div>
      </nav>

      <section className="landing-hero">
        <img className="landing-hero-img" src="/landing_hero.jpg" alt="" aria-hidden="true" />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, rgba(3,14,8,0.94) 35%, rgba(3,14,8,0.55) 65%, rgba(3,14,8,0.2) 100%)' }} />
        <div className="landing-hero-content" style={{ opacity: heroVisible ? 1 : 0, transform: heroVisible ? 'none' : 'translateY(20px)', transition: 'opacity 0.9s ease, transform 0.9s ease' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', border: '1px solid rgba(110,231,183,0.25)', background: 'rgba(6,78,59,0.3)', padding: '0.28rem 0.85rem', marginBottom: '1.75rem', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#6EE7B7' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6EE7B7', display: 'inline-block' }} />
            AI-powered financial intelligence
          </div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2.4rem, 5.5vw, 4.25rem)', fontWeight: 600, lineHeight: 1.12, color: '#FAFAF9', marginBottom: '1.5rem' }}>
            Your personal<br />
            <em style={{ fontStyle: 'italic', color: '#86EFAC', fontWeight: 400 }}>chief financial</em><br />
            officer — reimagined.
          </h1>
          <p style={{ fontSize: '1.02rem', lineHeight: 1.7, color: 'rgba(250,250,249,0.65)', marginBottom: '2.25rem', maxWidth: '520px' }}>
            Portfolio analytics, FIRE planning, goal tracking, and grounded AI explanations —
            built on your real numbers. Educational information only, never guaranteed returns.
          </p>
          <div style={{ display: 'flex', gap: '0.875rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => navigate('/register')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.9rem 2rem', background: '#064E3B', color: '#fff', border: '1px solid #064E3B', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem' }}>
              Start for free <FiArrowRight size={15} />
            </button>
            <button type="button" onClick={() => scrollTo('features')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.9rem 2rem', background: 'transparent', color: 'rgba(250,250,249,0.85)', border: '1px solid rgba(250,250,249,0.25)', cursor: 'pointer', fontSize: '0.9rem' }}>
              Explore features <FiChevronDown size={15} />
            </button>
          </div>
          <div className="landing-metrics" style={{ display: 'flex', marginTop: '3rem', borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '1.75rem', flexWrap: 'wrap', gap: '2rem' }}>
            {METRICS.map((m) => (
              <div key={m.label}>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#FAFAF9', fontFamily: 'var(--font-serif)' }}>{m.value}</div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(250,250,249,0.5)', marginTop: '0.15rem' }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="landing-section" style={{ ...gridStyle, backgroundColor: '#FAF9F6' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ width: 32, height: 1, background: '#064E3B', opacity: 0.5 }} />
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#064E3B', letterSpacing: '2px', textTransform: 'uppercase' }}>Platform capabilities</span>
          </div>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)', fontWeight: 600, lineHeight: 1.2, color: '#1C1917', marginBottom: '1rem', maxWidth: '600px' }}>
            Everything you need to understand your money.
          </h2>
          <p style={{ fontSize: '0.95rem', color: '#57534E', lineHeight: 1.65, marginBottom: '3rem', maxWidth: '620px' }}>
            Every figure comes from your stored profile, holdings, loans, goals, or committed
            statements — or is plainly labelled unavailable. Nothing is fabricated.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1px', background: '#D6D3D1', border: '1px solid #D6D3D1' }}>
            {FEATURES.map(({ Icon, title, desc, accent }) => (
              <div key={title} style={{ background: '#FAF9F6', padding: '2rem 1.75rem' }}>
                <div style={{ width: 40, height: 40, border: `1px solid ${accent}22`, background: `${accent}0D`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem' }}>
                  <Icon size={18} color={accent} />
                </div>
                <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.65rem', color: '#1C1917', lineHeight: 1.35 }}>{title}</h3>
                <p style={{ fontSize: '0.875rem', color: '#57534E', lineHeight: 1.65, margin: 0 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="landing-section" style={{ background: '#061208', padding: '4.5rem 4rem' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '5rem', color: 'rgba(6,78,59,0.4)', lineHeight: 0.6, marginBottom: '1rem', userSelect: 'none' }} aria-hidden="true">&ldquo;</div>
          <blockquote style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.15rem, 2.5vw, 1.6rem)', fontStyle: 'italic', lineHeight: 1.55, color: '#ECFDF5', margin: '0 0 1.25rem 0' }}>
            {quote.text}
          </blockquote>
          <div style={{ fontSize: '0.8rem', color: 'rgba(110,231,183,0.6)', letterSpacing: '1px', textTransform: 'uppercase' }}>— {quote.author}</div>
        </div>
      </section>

      <section id="how" className="landing-section" style={{ backgroundColor: '#FFFFFF' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ width: 32, height: 1, background: '#064E3B', opacity: 0.5 }} />
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#064E3B', letterSpacing: '2px', textTransform: 'uppercase' }}>How it works</span>
          </div>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)', fontWeight: 600, color: '#1C1917', marginBottom: '2.5rem' }}>
            Real data in, honest answers out.
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
            {[
              { Icon: FiShield, step: '1', title: 'Sign in securely', desc: 'Cognito authentication. Identity always comes from the verified session - never from a form field.' },
              { Icon: FiTrendingUp, step: '2', title: 'Connect your reality', desc: 'Guided onboarding or a reviewed bank statement. Every rupee is stored as integer paise.' },
              { Icon: FiTarget, step: '3', title: 'Plan and track', desc: 'FIRE scenarios, milestones, and monthly cash flow - with sources, assumptions, and limits shown.' },
            ].map(({ Icon, step, title, desc }) => (
              // This section hardcodes a white background, so its text must use fixed colors too.
              // Inheriting var(--text-primary)/var(--text-secondary) makes these cards unreadable
              // under the persisted dark theme (near-white text on white).
              <div key={step} style={{ border: '1px solid #E7E5E4', padding: '1.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', background: '#064E3B', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem' }}>{step}</span>
                  <Icon size={18} color="#064E3B" />
                </div>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#1C1917' }}>{title}</h3>
                <p style={{ fontSize: '0.85rem', color: '#57534E', lineHeight: 1.6, margin: 0 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section" style={{ background: '#061208', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ maxWidth: '580px' }}>
          <FiShield size={28} color="rgba(110,231,183,0.6)" style={{ marginBottom: '1.25rem' }} />
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.7rem, 3vw, 2.3rem)', fontWeight: 600, color: '#ECFDF5', marginBottom: '1rem', lineHeight: 1.3 }}>
            Take control of your financial future. Today.
          </h2>
          <p style={{ color: 'rgba(236,253,245,0.6)', fontSize: '0.95rem', lineHeight: 1.65, marginBottom: '2rem' }}>
            Move beyond spreadsheets and guesswork - into data-driven clarity.
            Educational information only; not investment advice.
          </p>
          <button type="button" onClick={() => navigate('/register')} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.9rem 2.25rem', background: '#fff', color: '#064E3B', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem' }}>
            Get started - free <FiArrowRight size={14} />
          </button>
        </div>
      </section>
      <footer style={{ background: '#030E08', padding: '1.75rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ width: 26, height: 26, background: '#064E3B', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '0.75rem' }}>A</div>
          <span style={{ fontFamily: 'var(--font-serif)', color: '#6EE7B7', fontWeight: 600, fontSize: '0.9rem' }}>ARIA</span>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'rgba(110,231,183,0.3)', margin: 0 }}>
          2026 ARIA AI CFO - Educational purposes only, not investment advice.
        </p>
        <div style={{ display: 'flex', gap: '1.25rem' }}>
          <button type="button" onClick={() => navigate('/login')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.78rem', color: 'rgba(110,231,183,0.4)' }}>Sign in</button>
          <button type="button" onClick={() => navigate('/register')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.78rem', color: 'rgba(110,231,183,0.4)' }}>Register</button>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
