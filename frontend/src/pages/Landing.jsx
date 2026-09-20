import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import {
  FiActivity, FiMessageSquare, FiRadio, FiTarget,
  FiArrowRight, FiTrendingUp, FiShield, FiZap,
  FiChevronDown,
} from 'react-icons/fi';

/* ─────────────────────────────────────────────────────────
   FINANCIAL QUOTES — one shown at random on each page load
───────────────────────────────────────────────────────── */
const QUOTES = [
  { text: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin" },
  { text: "The stock market is a device for transferring money from the impatient to the patient.", author: "Warren Buffett" },
  { text: "In investing, what is comfortable is rarely profitable.", author: "Robert Arnott" },
  { text: "The four most dangerous words in investing are: 'This time it's different.'", author: "Sir John Templeton" },
  { text: "The individual investor should act consistently as an investor and not as a speculator.", author: "Benjamin Graham" },
  { text: "Wide diversification is only required when investors do not understand what they are doing.", author: "Warren Buffett" },
  { text: "Risk comes from not knowing what you are doing.", author: "Warren Buffett" },
  { text: "October: This is one of the peculiarly dangerous months to speculate in stocks.", author: "Mark Twain" },
  { text: "The best investment you can make is in yourself.", author: "Warren Buffett" },
  { text: "Price is what you pay. Value is what you get.", author: "Warren Buffett" },
  { text: "The market is filled with individuals who know the price of everything but the value of nothing.", author: "Philip Fisher" },
  { text: "Behind every stock is a company. Find out what it's doing.", author: "Peter Lynch" },
  { text: "The key to making money in stocks is not to get scared out of them.", author: "Peter Lynch" },
  { text: "Know what you own, and know why you own it.", author: "Peter Lynch" },
  { text: "In the short run, the market is a voting machine. In the long run, it is a weighing machine.", author: "Benjamin Graham" },
  { text: "It's not how much money you make, but how much money you keep.", author: "Robert Kiyosaki" },
  { text: "Financial peace isn't the acquisition of stuff. It's learning to live on less than you make.", author: "Dave Ramsey" },
  { text: "You must gain control over your money or the lack of it will forever control you.", author: "Dave Ramsey" },
  { text: "A budget is telling your money where to go instead of wondering where it went.", author: "Dave Ramsey" },
  { text: "Investing should be more like watching paint dry or watching grass grow.", author: "Paul Samuelson" },
  { text: "Markets are constantly in a state of uncertainty and flux and money is made by discounting the obvious.", author: "George Soros" },
  { text: "It's not whether you're right or wrong that's important, but how much money you make when you're right.", author: "George Soros" },
  { text: "The biggest risk of all is not taking one.", author: "Mellody Hobson" },
  { text: "Do not save what is left after spending, but spend what is left after saving.", author: "Warren Buffett" },
  { text: "The goal of the non-professional should not be to pick winners but should rather be to own a cross-section of businesses.", author: "Warren Buffett" },
  { text: "Compound interest is the eighth wonder of the world.", author: "Albert Einstein" },
  { text: "I will tell you the secret to getting rich on Wall Street. Close the doors. You try to be greedy when others are fearful.", author: "Warren Buffett" },
  { text: "The intelligent investor is a realist who sells to optimists and buys from pessimists.", author: "Benjamin Graham" },
  { text: "Opportunities come infrequently. When it rains gold, put out the bucket, not the thimble.", author: "Warren Buffett" },
  { text: "If you don't find a way to make money while you sleep, you will work until you die.", author: "Warren Buffett" },
  { text: "The difference between successful people and really successful people is that really successful people say no to almost everything.", author: "Warren Buffett" },
  { text: "Never invest in a business you cannot understand.", author: "Warren Buffett" },
  { text: "Time in the market beats timing the market.", author: "Ken Fisher" },
  { text: "The most important quality for an investor is temperament, not intellect.", author: "Warren Buffett" },
  { text: "I never attempt to make money on the stock market. I buy on the assumption that they could close the market the next day.", author: "Warren Buffett" },
  { text: "Someone is sitting in the shade today because someone planted a tree a long time ago.", author: "Warren Buffett" },
  { text: "The first rule is not to lose. The second rule is not to forget the first rule.", author: "Warren Buffett" },
  { text: "Diversification is protection against ignorance. It makes little sense if you know what you are doing.", author: "Warren Buffett" },
  { text: "It is not necessary to do extraordinary things to get extraordinary results.", author: "Warren Buffett" },
  { text: "The time of maximum pessimism is the best time to buy, and the time of maximum optimism is the best time to sell.", author: "Sir John Templeton" },
  { text: "To achieve satisfactory investment results is easier than most people realize.", author: "Benjamin Graham" },
  { text: "An investor without investment objectives is like a traveler without a destination.", author: "Ralph Seger" },
  { text: "How many millionaires do you know who have become wealthy by investing in savings accounts?", author: "Robert G. Allen" },
  { text: "The real measure of your wealth is how much you'd be worth if you lost all your money.", author: "Anonymous" },
  { text: "Financial freedom is available to those who learn about it and work for it.", author: "Robert Kiyosaki" },
  { text: "The more you learn, the more you earn.", author: "Warren Buffett" },
  { text: "Money is a terrible master but an excellent servant.", author: "P.T. Barnum" },
  { text: "Don't look for the needle in the haystack. Just buy the haystack!", author: "John Bogle" },
  { text: "The stock market is filled with individuals who know the price of everything, but the value of nothing.", author: "Philip Fisher" },
  { text: "Investing is the intersection of economics and psychology.", author: "Seth Klarman" },
  { text: "Value investing is at its core the marriage of a contrarian streak and a calculator.", author: "Seth Klarman" },
  { text: "Buy not on optimism, but on arithmetic.", author: "Benjamin Graham" },
  { text: "The secret to investing is to figure out the value of something — and then pay a lot less.", author: "Joel Greenblatt" },
  { text: "A margin of safety is achieved when securities are purchased at prices sufficiently below underlying value.", author: "Seth Klarman" },
  { text: "Confronted with a challenge to distill the secret of sound investment into three words, we venture the motto, Margin of Safety.", author: "Benjamin Graham" },
  { text: "If you have trouble imagining a 20% loss in the stock market, you shouldn't be in stocks.", author: "John Bogle" },
  { text: "The stock market is the only market where things go on sale and all the customers run out of the store.", author: "Cullen Roche" },
  { text: "Your success in investing will depend in part on your character and guts.", author: "Sir John Templeton" },
  { text: "Go for a business that any idiot can run — because sooner or later, any idiot probably is going to run it.", author: "Peter Lynch" },
  { text: "You get recessions, you have stock market declines. If you don't understand that's going to happen, then you're not ready.", author: "Peter Lynch" },
  { text: "Far more money has been lost by investors preparing for corrections, or trying to anticipate corrections, than has been lost in corrections themselves.", author: "Peter Lynch" },
  { text: "All intelligent investing is value investing — acquiring more than you are paying for.", author: "Charlie Munger" },
  { text: "It's not supposed to be easy. Anyone who finds it easy is stupid.", author: "Charlie Munger" },
  { text: "I have nothing to offer but blood, toil, tears, and sweat — and compound interest.", author: "Charlie Munger" },
  { text: "Invert, always invert.", author: "Charlie Munger" },
  { text: "Show me the incentive and I'll show you the outcome.", author: "Charlie Munger" },
  { text: "The big money is not in the buying and the selling, but in the waiting.", author: "Charlie Munger" },
  { text: "Spend each day trying to be a little wiser than you were when you woke up.", author: "Charlie Munger" },
  { text: "Those who have knowledge don't predict. Those who predict don't have knowledge.", author: "Lao Tzu" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Formal education will make you a living; self-education will make you a fortune.", author: "Jim Rohn" },
  { text: "Real wealth is not about money. Real wealth is: not having to go to meetings, not having to spend time with jerks.", author: "Naval Ravikant" },
  { text: "Earn with your mind, not your time.", author: "Naval Ravikant" },
  { text: "A calm sea never made a skilled sailor — nor a volatile market an unskilled investor.", author: "Anonymous" },
  { text: "Every master was once a disaster.", author: "T. Harv Eker" },
  { text: "Capital as such is not evil; it is its wrong use that is evil.", author: "Mahatma Gandhi" },
  { text: "Wealth consists not in having great possessions, but in having few wants.", author: "Epictetus" },
  { text: "He who loses wealth loses much; he who loses a friend loses more; but he that loses his courage loses all.", author: "Miguel de Cervantes" },
  { text: "Annual income twenty pounds, annual expenditure nineteen — result, happiness.", author: "Charles Dickens" },
  { text: "Beware of little expenses; a small leak will sink a great ship.", author: "Benjamin Franklin" },
  { text: "Money often costs too much.", author: "Ralph Waldo Emerson" },
  { text: "Not he who has much is rich, but he who gives much.", author: "Erich Fromm" },
  { text: "The art is not in making money, but in keeping it.", author: "Proverb" },
  { text: "Many people take no care of their money till they come nearly to the end of it.", author: "Johann Wolfgang von Goethe" },
  { text: "The glow of one warm thought is to me worth more than money.", author: "Thomas Jefferson" },
  { text: "He who buys what he does not need steals from himself.", author: "Swedish Proverb" },
  { text: "A penny saved is a penny earned.", author: "Benjamin Franklin" },
  { text: "Never spend your money before you have earned it.", author: "Thomas Jefferson" },
  { text: "Empty pockets never held anyone back. Only empty heads and empty hearts can do that.", author: "Norman Vincent Peale" },
  { text: "Capital allocators earn outsized returns for one reason: they think differently.", author: "Howard Marks" },
  { text: "The most important thing is to survive, so that you can be there when you're right.", author: "Howard Marks" },
  { text: "You can't predict. You can prepare.", author: "Howard Marks" },
  { text: "Being too far ahead of your time is indistinguishable from being wrong.", author: "Howard Marks" },
  { text: "The definition of genius is taking the complex and making it simple.", author: "Albert Einstein" },
  { text: "Markets discount everything — except human nature.", author: "Anonymous" },
  { text: "In trading, the goal is not to be right. The goal is to make money.", author: "Paul Tudor Jones" },
  { text: "Don't focus on making money; focus on protecting what you have.", author: "Paul Tudor Jones" },
  { text: "The trend is your friend until the end when it bends.", author: "Ed Seykota" },
  { text: "Win or lose, everybody gets what they want out of the market.", author: "Ed Seykota" },
  { text: "The elements of good trading are cutting losses, cutting losses, and cutting losses.", author: "Ed Seykota" },
  { text: "I just wait until there is money lying in the corner, and all I have to do is go over there and pick it up.", author: "Jim Rogers" },
  { text: "Bottoms in the investment world don't end with four-year lows; they end with 10- or 15-year lows.", author: "Jim Rogers" },
  { text: "If I waited for perfection, I would never have made a single investment.", author: "Anonymous" },
];

/* ─────────────────────────────────────────────────────────
   FEATURE DATA — no emojis, use icons
───────────────────────────────────────────────────────── */
const FEATURES = [
  {
    Icon: FiActivity,
    title: 'Real-Time Portfolio Engine',
    desc: 'Live pricing, P&L tracking, and multi-benchmark performance comparison — powered by Yahoo Finance API with sub-second latency.',
    accent: '#064E3B',
  },
  {
    Icon: FiMessageSquare,
    title: 'ARIA Advisory Intelligence',
    desc: 'An embedded AI financial advisor that surfaces data-backed insights, personalized to your portfolio composition and risk profile.',
    accent: '#A16207',
  },
  {
    Icon: FiRadio,
    title: 'Curated Market Intelligence',
    desc: 'Asset-specific news streams tailored to your holdings. Filter noise. Surface signal. Stay ahead of the market narrative.',
    accent: '#B45309',
  },
  {
    Icon: FiTarget,
    title: 'Precision Goal Tracking',
    desc: 'Define financial milestones with target amounts and timelines. Track progress with structured visualizations and smart alerts.',
    accent: '#7C3AED',
  },
];

const CONTRIBUTORS = [
  { name: 'Aviral Mishra', role: 'Product Lead & Full-Stack Engineering', initials: 'AM', color: '#064E3B' },
  { name: 'Riya Sharma', role: 'AI & Machine Learning Research', initials: 'RS', color: '#A16207' },
  { name: 'Karan Mehta', role: 'Frontend Engineering & Design Systems', initials: 'KM', color: '#B45309' },
  { name: 'Nisha Patel', role: 'Backend Architecture & Infrastructure', initials: 'NP', color: '#7C3AED' },
];

/* ─────────────────────────────────────────────────────────
   METRICS STRIP
───────────────────────────────────────────────────────── */
const METRICS = [
  { value: 'Real-Time', label: 'Price Feeds' },
  { value: 'AI-Powered', label: 'Advisory Engine' },
  { value: 'Zero', label: 'Commission or Fees' },
];

/* ─────────────────────────────────────────────────────────
   SUBTLE GRID PATTERN STYLE (background)
───────────────────────────────────────────────────────── */
const gridStyle = {
  backgroundImage: `
    linear-gradient(rgba(6,78,59,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(6,78,59,0.04) 1px, transparent 1px)
  `,
  backgroundSize: '48px 48px',
};

/* ══════════════════════════════════════════════════════════
   LANDING COMPONENT
══════════════════════════════════════════════════════════ */
const Landing = () => {
  const navigate = useNavigate();
  const lenisRef = useRef(null);
  const [scrolled, setScrolled] = useState(false);
  const [heroVisible, setHeroVisible] = useState(false);

  // Pick a random quote once on mount (stays the same for the session, changes on refresh)
  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], []);

  useEffect(() => {
    // Fade-in hero
    const t = setTimeout(() => setHeroVisible(true), 80);

    // Lenis — landing page only
    const lenis = new Lenis({ lerp: 0.075, smoothTouch: false });
    lenisRef.current = lenis;

    const onScroll = ({ scroll }) => setScrolled(scroll > 50);
    lenis.on('scroll', onScroll);

    let rafId;
    const raf = (time) => { lenis.raf(time); rafId = requestAnimationFrame(raf); };
    rafId = requestAnimationFrame(raf);

    return () => { clearTimeout(t); cancelAnimationFrame(rafId); lenis.destroy(); };
  }, []);

  const scrollTo = (id) =>
    lenisRef.current?.scrollTo(document.getElementById(id), { offset: -68, duration: 1.2 });

  /* NAV HEIGHT */
  const NAV_H = 68;

  return (
    <div style={{ fontFamily: 'var(--font-sans)', backgroundColor: '#FAF9F6', color: '#1C1917', overflowX: 'hidden' }}>

      {/* ══ STICKY NAV ════════════════════════════════════════ */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
        height: NAV_H,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 3rem',
        background: scrolled ? 'rgba(250,249,246,0.88)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px) saturate(160%)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(20px) saturate(160%)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(6,78,59,0.1)' : '1px solid transparent',
        transition: 'background 0.4s ease, border-color 0.4s ease',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }} onClick={() => window.scrollTo(0,0)}>
          <div style={{
            width: 30, height: 30, background: '#064E3B',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 800, fontSize: '0.8rem', letterSpacing: '-0.5px',
          }}>A</div>
          <span style={{
            fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: '1.05rem',
            color: scrolled ? '#1C1917' : '#fff',
            transition: 'color 0.4s',
            letterSpacing: '0.5px',
          }}>ARIA</span>
        </div>

        {/* Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem' }}>
          {[{ id: 'features', label: 'Features' }, { id: 'team', label: 'Our Team' }].map(({ id, label }) => (
            <button key={id} onClick={() => scrollTo(id)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.88rem', fontWeight: 500, letterSpacing: '0.2px',
              color: scrolled ? '#57534E' : 'rgba(255,255,255,0.75)',
              transition: 'color 0.3s',
              padding: 0,
            }}
              onMouseOver={e => e.currentTarget.style.color = scrolled ? '#1C1917' : '#fff'}
              onMouseOut={e => e.currentTarget.style.color = scrolled ? '#57534E' : 'rgba(255,255,255,0.75)'}
            >{label}</button>
          ))}
          <button onClick={() => navigate('/login')} style={{
            padding: '0.5rem 1.35rem',
            background: '#064E3B', color: '#fff',
            border: 'none', cursor: 'pointer',
            fontWeight: 600, fontSize: '0.83rem', letterSpacing: '0.3px',
            transition: 'background 0.2s, transform 0.15s',
          }}
            onMouseOver={e => { e.currentTarget.style.background = '#043528'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseOut={e => { e.currentTarget.style.background = '#064E3B'; e.currentTarget.style.transform = 'none'; }}
          >Sign In</button>
        </div>
      </nav>

      {/* ══ HERO ══════════════════════════════════════════════ */}
      <section id="hero" style={{
        position: 'relative', minHeight: '100vh',
        display: 'flex', alignItems: 'center',
        overflow: 'hidden',
      }}>
        {/* Background Image */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'url(/landing_hero.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center 40%',
          backgroundRepeat: 'no-repeat',
          transform: 'scale(1.04)',
        }} />

        {/* Multi-layer overlay — dark left, atmospheric right */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(115deg, rgba(3,14,8,0.94) 35%, rgba(3,14,8,0.55) 65%, rgba(3,14,8,0.2) 100%)',
        }} />
        {/* Green tint wash at bottom */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%',
          background: 'linear-gradient(to top, rgba(6,78,59,0.18), transparent)',
        }} />

        {/* CONTENT */}
        <div style={{
          position: 'relative', zIndex: 2,
          padding: '0 4rem',
          maxWidth: '720px',
          opacity: heroVisible ? 1 : 0,
          transform: heroVisible ? 'none' : 'translateY(20px)',
          transition: 'opacity 0.9s ease, transform 0.9s ease',
        }}>
          {/* Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            border: '1px solid rgba(110,231,183,0.25)',
            background: 'rgba(6,78,59,0.3)',
            padding: '0.28rem 0.85rem',
            marginBottom: '1.75rem',
            fontSize: '0.72rem', fontWeight: 700, letterSpacing: '1.5px',
            textTransform: 'uppercase', color: '#6EE7B7',
            backdropFilter: 'blur(8px)',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6EE7B7', display: 'inline-block', boxShadow: '0 0 6px #6EE7B7' }} />
            AI-Powered Financial Intelligence
          </div>

          {/* Headline */}
          <h1 style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(2.8rem, 5.5vw, 4.5rem)',
            fontWeight: 600, lineHeight: 1.12,
            color: '#FAFAF9',
            marginBottom: '1.5rem',
            letterSpacing: '-0.5px',
          }}>
            Your Personal<br />
            <em style={{ fontStyle: 'italic', color: '#86EFAC', fontWeight: 400 }}>Chief Financial</em><br />
            Officer — Reimagined.
          </h1>

          {/* Subhead */}
          <p style={{
            fontSize: '1.05rem', lineHeight: 1.72,
            color: 'rgba(250,250,249,0.62)',
            marginBottom: '2.5rem',
            maxWidth: '500px',
            fontWeight: 400,
          }}>
            ARIA brings institutional-grade portfolio analytics, AI-driven financial advisory, and real-time market intelligence — distilled for the modern investor.
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: '0.875rem', flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/register')} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.9rem 2rem',
              background: '#064E3B', color: '#fff',
              border: '1px solid #064E3B', cursor: 'pointer',
              fontWeight: 700, fontSize: '0.9rem', letterSpacing: '0.2px',
              transition: 'all 0.2s',
            }}
              onMouseOver={e => { e.currentTarget.style.background = '#043528'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(6,78,59,0.4)'; }}
              onMouseOut={e => { e.currentTarget.style.background = '#064E3B'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              Start for Free <FiArrowRight size={15} />
            </button>
            <button onClick={() => scrollTo('features')} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.9rem 2rem',
              background: 'transparent', color: 'rgba(250,250,249,0.82)',
              border: '1px solid rgba(250,250,249,0.22)', cursor: 'pointer',
              fontWeight: 500, fontSize: '0.9rem',
              transition: 'all 0.2s', backdropFilter: 'blur(4px)',
            }}
              onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(250,250,249,0.55)'; e.currentTarget.style.color = '#fff'; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(250,250,249,0.22)'; e.currentTarget.style.color = 'rgba(250,250,249,0.82)'; }}
            >
              Explore Features <FiChevronDown size={15} />
            </button>
          </div>

          {/* Metrics strip */}
          <div style={{
            display: 'flex', gap: '0',
            marginTop: '3.5rem',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            paddingTop: '2rem',
            flexWrap: 'wrap',
          }}>
            {METRICS.map((m, i) => (
              <div key={i} style={{
                paddingRight: '2.5rem',
                marginRight: '2.5rem',
                borderRight: i < METRICS.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none',
              }}>
                <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#FAFAF9', fontFamily: 'var(--font-serif)', letterSpacing: '-0.3px' }}>{m.value}</div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(250,250,249,0.45)', marginTop: '0.12rem', letterSpacing: '0.3px' }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll cue */}
        <div style={{
          position: 'absolute', bottom: '2.25rem', left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
          opacity: heroVisible ? 0.45 : 0, transition: 'opacity 1.2s ease 0.5s',
          cursor: 'pointer',
        }} onClick={() => scrollTo('features')}>
          <span style={{ fontSize: '0.65rem', color: '#fff', letterSpacing: '2px', textTransform: 'uppercase' }}>Scroll</span>
          <FiChevronDown size={16} color="#fff" />
        </div>
      </section>

      {/* ══ FEATURES SECTION ══════════════════════════════════ */}
      <section id="features" style={{ ...gridStyle, padding: '7rem 4rem', background: '#FAF9F6' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

          {/* Section label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ width: 32, height: 1, background: '#064E3B', opacity: 0.5 }} />
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#064E3B', letterSpacing: '2px', textTransform: 'uppercase' }}>
              Platform Capabilities
            </span>
          </div>

          <h2 style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(2rem, 3.5vw, 2.75rem)',
            fontWeight: 600, lineHeight: 1.2,
            color: '#1C1917',
            marginBottom: '3.5rem',
            maxWidth: '560px',
          }}>
            Everything an institutional investor demands.
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1px',
            background: '#D6D3D1',
            border: '1px solid #D6D3D1',
          }}>
            {FEATURES.map(({ Icon, title, desc, accent }, i) => (
              <div key={i} style={{
                background: '#FAF9F6',
                padding: '2.25rem 2rem',
                transition: 'background 0.2s ease',
                cursor: 'default',
                position: 'relative',
                overflow: 'hidden',
              }}
                onMouseOver={e => e.currentTarget.style.background = '#fff'}
                onMouseOut={e => e.currentTarget.style.background = '#FAF9F6'}
              >
                {/* Accent line top */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: accent, opacity: 0 }}
                  ref={el => {
                    if (!el) return;
                    el.parentElement.onmouseenter = () => el.style.opacity = '1';
                    el.parentElement.onmouseleave = () => el.style.opacity = '0';
                  }}
                />
                <div style={{
                  width: 40, height: 40,
                  border: `1px solid ${accent}22`,
                  background: `${accent}0D`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '1.25rem',
                  transition: 'all 0.2s',
                }}>
                  <Icon size={18} color={accent} />
                </div>
                <h3 style={{
                  fontFamily: 'var(--font-serif)', fontSize: '1.05rem',
                  fontWeight: 600, marginBottom: '0.65rem', color: '#1C1917',
                  lineHeight: 1.35,
                }}>{title}</h3>
                <p style={{
                  fontSize: '0.875rem', color: '#57534E', lineHeight: 1.65, margin: 0,
                }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ QUOTE BAND ════════════════════════════════════════ */}
      <section style={{
        background: '#061208',
        padding: '5.5rem 4rem',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Subtle texture lines */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'repeating-linear-gradient(90deg, rgba(110,231,183,0.03) 0px, rgba(110,231,183,0.03) 1px, transparent 1px, transparent 60px)',
          pointerEvents: 'none',
        }} />

        <div style={{ maxWidth: '780px', margin: '0 auto', textAlign: 'center', position: 'relative' }}>
          {/* Decorative quote mark */}
          <div style={{
            fontFamily: 'Georgia, serif',
            fontSize: '6rem',
            color: 'rgba(6,78,59,0.35)',
            lineHeight: 0.6,
            marginBottom: '1rem',
            userSelect: 'none',
          }}>"</div>

          <blockquote style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(1.25rem, 2.5vw, 1.75rem)',
            fontWeight: 400,
            fontStyle: 'italic',
            lineHeight: 1.55,
            color: '#ECFDF5',
            margin: '0 0 1.75rem 0',
          }}>
            {quote.text}
          </blockquote>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
            <div style={{ width: 32, height: 1, background: 'rgba(110,231,183,0.3)' }} />
            <cite style={{
              fontSize: '0.82rem', fontWeight: 600, fontStyle: 'normal',
              color: '#6EE7B7', letterSpacing: '1px', textTransform: 'uppercase',
            }}>
              {quote.author}
            </cite>
            <div style={{ width: 32, height: 1, background: 'rgba(110,231,183,0.3)' }} />
          </div>

          <p style={{
            fontSize: '0.72rem', color: 'rgba(110,231,183,0.3)',
            marginTop: '2rem', letterSpacing: '0.5px',
          }}>Quote refreshes on every visit</p>

          <button onClick={() => navigate('/register')} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            marginTop: '2.5rem',
            padding: '0.8rem 2rem',
            background: '#064E3B', color: '#fff',
            border: '1px solid rgba(6,78,59,0.6)', cursor: 'pointer',
            fontWeight: 600, fontSize: '0.875rem',
            transition: 'all 0.2s',
          }}
            onMouseOver={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#064E3B'; }}
            onMouseOut={e => { e.currentTarget.style.background = '#064E3B'; e.currentTarget.style.color = '#fff'; }}
          >
            Open Your Dashboard <FiArrowRight size={14} />
          </button>
        </div>
      </section>

      {/* ══ TEAM SECTION ══════════════════════════════════════ */}
      <section id="team" style={{ padding: '7rem 4rem', background: '#fff' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ width: 32, height: 1, background: '#064E3B', opacity: 0.5 }} />
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#064E3B', letterSpacing: '2px', textTransform: 'uppercase' }}>
              The Builders
            </span>
          </div>

          <h2 style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(2rem, 3.5vw, 2.75rem)',
            fontWeight: 600, lineHeight: 1.2,
            color: '#1C1917',
            marginBottom: '3.5rem',
            maxWidth: '480px',
          }}>
            Engineers who obsess over the details.
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1.5rem',
          }}>
            {CONTRIBUTORS.map((c, i) => (
              <div key={i} style={{
                border: '1px solid #D6D3D1',
                padding: '2rem 1.75rem',
                background: '#FAF9F6',
                display: 'flex', flexDirection: 'column', gap: '1rem',
                transition: 'border-color 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease',
                cursor: 'default',
              }}
                onMouseOver={e => {
                  e.currentTarget.style.borderColor = c.color;
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = `0 12px 32px ${c.color}18`;
                }}
                onMouseOut={e => {
                  e.currentTarget.style.borderColor = '#D6D3D1';
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{
                  width: 48, height: 48,
                  background: c.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 700, fontSize: '0.95rem', letterSpacing: '0.5px',
                }}>
                  {c.initials}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1C1917', marginBottom: '0.25rem' }}>{c.name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#78716C', lineHeight: 1.4 }}>{c.role}</div>
                </div>
                <div style={{
                  marginTop: 'auto', paddingTop: '1rem',
                  borderTop: '1px solid #E7E5E4',
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                }}>
                  <div style={{ width: 8, height: 8, background: c.color, opacity: 0.7 }} />
                  <span style={{ fontSize: '0.72rem', color: '#A8A29E', letterSpacing: '0.3px' }}>Core Team</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FINAL CTA STRIP ═══════════════════════════════════ */}
      <section style={{
        background: '#064E3B',
        padding: '5rem 4rem',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        textAlign: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Background pattern */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle at 80% 50%, rgba(134,239,172,0.06) 0%, transparent 60%)',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', maxWidth: '580px' }}>
          <FiShield size={28} color="rgba(110,231,183,0.6)" style={{ marginBottom: '1.25rem' }} />
          <h2 style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(1.75rem, 3vw, 2.4rem)',
            fontWeight: 600, color: '#ECFDF5',
            marginBottom: '1rem', lineHeight: 1.3,
          }}>
            Take control of your financial future. Today.
          </h2>
          <p style={{ color: 'rgba(236,253,245,0.6)', fontSize: '0.95rem', lineHeight: 1.65, marginBottom: '2rem' }}>
            Join investors who have moved beyond spreadsheets and guesswork — into data-driven financial clarity.
          </p>
          <button onClick={() => navigate('/register')} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.9rem 2.25rem',
            background: '#fff', color: '#064E3B',
            border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: '0.9rem',
            transition: 'all 0.2s',
          }}
            onMouseOver={e => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseOut={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'none'; }}
          >
            Get Started — It's Free <FiArrowRight size={14} />
          </button>
        </div>
      </section>

      {/* ══ FOOTER ════════════════════════════════════════════ */}
      <footer style={{
        background: '#030E08',
        padding: '2rem 3rem',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ width: 26, height: 26, background: '#064E3B', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '0.75rem' }}>A</div>
          <span style={{ fontFamily: 'var(--font-serif)', color: '#6EE7B7', fontWeight: 600, fontSize: '0.9rem', letterSpacing: '0.3px' }}>ARIA</span>
        </div>

        <p style={{ fontSize: '0.75rem', color: 'rgba(110,231,183,0.25)', letterSpacing: '0.2px' }}>
          © 2026 ARIA AI CFO · Built for educational purposes
        </p>

        <div style={{ display: 'flex', gap: '1.5rem' }}>
          {[{ id: 'features', label: 'Features' }, { id: 'team', label: 'Team' }].map(({ id, label }) => (
            <button key={id} onClick={() => scrollTo(id)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.78rem', color: 'rgba(110,231,183,0.35)',
              letterSpacing: '0.5px', transition: 'color 0.2s',
            }}
              onMouseOver={e => e.currentTarget.style.color = 'rgba(110,231,183,0.7)'}
              onMouseOut={e => e.currentTarget.style.color = 'rgba(110,231,183,0.35)'}
            >{label}</button>
          ))}
        </div>
      </footer>
    </div>
  );
};

export default Landing;
