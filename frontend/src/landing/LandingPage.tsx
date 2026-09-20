import { useEffect, useLayoutEffect } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { setLenis } from "./lib/scroll";
import { Nav } from "./components/Nav";
import { Hero } from "./components/Hero";
import { ContextSection } from "./components/ContextSection";
import { Explorer } from "./components/Explorer";
import { Thinking } from "./components/Thinking";
import { Architecture } from "./components/Architecture";
import { Finale } from "./components/Finale";
import "./landing.css";

gsap.registerPlugin(ScrollTrigger);

const PAGE_TITLE = "ARIA — Personal AI CFO";

export default function LandingPage() {
  // The dashboard styles <body> for its own theme. Take that over only while the landing page
  // is mounted, and hand the page back at the top when it leaves.
  useLayoutEffect(() => {
    const previousTitle = document.title;
    document.body.classList.add("aria-landing-active");
    document.title = PAGE_TITLE;
    return () => {
      document.body.classList.remove("aria-landing-active");
      document.title = previousTitle;
      window.scrollTo(0, 0);
    };
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const lenis = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    });
    setLenis(lenis);
    lenis.on("scroll", ScrollTrigger.update);

    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      setLenis(null);
    };
  }, []);

  return (
    <div className="aria-landing">
      <a
        href="#product"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-ink focus:px-5 focus:py-2.5 focus:text-sm focus:text-cream"
      >
        Skip to product
      </a>
      <Nav />
      <main>
        <Hero />
        <ContextSection />
        <Explorer />
        <Thinking />
        <Architecture />
      </main>
      <Finale />
    </div>
  );
}
