import { useEffect, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
} from "motion/react";
import { cn } from "../utils/cn";
import { GITHUB_URL, LOGIN_URL } from "../lib/site";
import { scrollToId } from "../lib/scroll";
import { AriaMark } from "./ui";
import { SiteLink } from "./SiteLink";

const LINKS: { label: string; id: string; tab?: string }[] = [
  { label: "Product", id: "product" },
  { label: "How it works", id: "thinking" },
  { label: "FIRE", id: "product", tab: "fire" },
  { label: "Architecture", id: "architecture" },
];

function navigate(link: { id: string; tab?: string }) {
  if (link.tab) {
    window.dispatchEvent(new CustomEvent("aria:tab", { detail: link.tab }));
  }
  scrollToId(link.id);
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();

  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: 200,
    damping: 40,
    restDelta: 0.001,
  });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled
          ? "border-b border-line bg-cream/85 backdrop-blur-md"
          : "border-b border-transparent bg-transparent",
      )}
    >
      {/* page progress */}
      <motion.div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[2px] origin-left bg-green"
        style={{ scaleX: reduced ? scrollYProgress : progress }}
      />

      <nav
        className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 sm:px-8"
        aria-label="Main"
      >
        {/* left — brand */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            scrollToId("top");
          }}
          className="flex items-center gap-2.5"
        >
          <AriaMark />
        </a>

        {/* center — links (desktop) */}
        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <button
              key={link.label}
              type="button"
              onClick={() => navigate(link)}
              className="nav-link rounded-full px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-ink/5 hover:text-ink"
            >
              {link.label}
            </button>
          ))}
        </div>

        {/* right — actions (desktop) */}
        <div className="hidden items-center gap-2 md:flex">
          <SiteLink
            href={GITHUB_URL}
            className="rounded-full px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-ink/5 hover:text-ink"
          >
            GitHub
          </SiteLink>
          <SiteLink
            href={LOGIN_URL}
            className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-cream transition-colors hover:bg-green"
          >
            Login
          </SiteLink>
        </div>

        {/* mobile hamburger */}
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-line md:hidden"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="relative block h-3 w-4" aria-hidden="true">
            <span
              className={cn(
                "absolute left-0 top-0 h-[1.5px] w-full bg-ink transition-transform duration-300",
                open && "top-[5px] rotate-45",
              )}
            />
            <span
              className={cn(
                "absolute left-0 top-[5px] h-[1.5px] w-full bg-ink transition-opacity duration-200",
                open && "opacity-0",
              )}
            />
            <span
              className={cn(
                "absolute left-0 top-[10px] h-[1.5px] w-full bg-ink transition-transform duration-300",
                open && "top-[5px] -rotate-45",
              )}
            />
          </span>
        </button>
      </nav>

      {/* mobile panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduced ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-b border-line bg-cream/95 backdrop-blur-md md:hidden"
          >
            <div className="flex flex-col gap-1 px-5 pb-6 pt-2">
              {LINKS.map((link) => (
                <button
                  key={link.label}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setTimeout(() => navigate(link), 60);
                  }}
                  className="rounded-xl px-3 py-3 text-left text-base font-medium text-ink transition-colors hover:bg-ink/5"
                >
                  {link.label}
                </button>
              ))}
              <div className="mt-3 flex items-center gap-3">
                <SiteLink
                  href={GITHUB_URL}
                  className="flex-1 rounded-full border border-ink/20 px-5 py-3 text-center text-sm font-medium text-ink"
                >
                  GitHub
                </SiteLink>
                <SiteLink
                  href={LOGIN_URL}
                  className="flex-1 rounded-full bg-ink px-5 py-3 text-center text-sm font-medium text-cream"
                >
                  Login
                </SiteLink>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
