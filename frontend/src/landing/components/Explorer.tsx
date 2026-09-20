import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from "motion/react";
import { cn } from "../utils/cn";
import { Reveal, SectionEyebrow } from "./ui";
import {
  CashFlowVisual,
  FireVisual,
  NetWorthVisual,
  OverviewVisual,
  PortfolioVisual,
} from "./ExplorerVisuals";

const EASE = [0.22, 1, 0.36, 1] as const;

type TabId = "overview" | "portfolio" | "fire" | "cashflow" | "networth";

const TABS: { id: TabId; num: string; label: string; desc: string }[] = [
  {
    id: "overview",
    num: "01",
    label: "Overview",
    desc: "Income, spending, surplus and savings rate in one view.",
  },
  {
    id: "portfolio",
    num: "02",
    label: "Portfolio",
    desc: "Holdings, weights and concentration analysis.",
  },
  {
    id: "fire",
    num: "03",
    label: "FIRE",
    desc: "Projected FIRE age — and what each goal costs in years.",
  },
  {
    id: "cashflow",
    num: "04",
    label: "Cash Flow",
    desc: "Bank statement CSVs parsed, reviewed, then committed.",
  },
  {
    id: "networth",
    num: "05",
    label: "Net Worth",
    desc: "Assets minus liabilities, projected forward.",
  },
];

const VISUALS: Record<TabId, () => React.ReactElement> = {
  overview: OverviewVisual,
  portfolio: PortfolioVisual,
  fire: FireVisual,
  cashflow: CashFlowVisual,
  networth: NetWorthVisual,
};

export function Explorer() {
  const [active, setActive] = useState<TabId>("overview");
  const reduced = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const panelInView = useInView(panelRef, { once: true, margin: "-120px" });

  // Allow nav "FIRE" link to open the FIRE tab
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as TabId;
      if (TABS.some((t) => t.id === detail)) setActive(detail);
    };
    window.addEventListener("aria:tab", handler);
    return () => window.removeEventListener("aria:tab", handler);
  }, []);

  const Visual = VISUALS[active];

  return (
    <section id="product" className="bg-cream py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="max-w-2xl">
          <SectionEyebrow>Product explorer</SectionEyebrow>
          <h2 className="font-serif text-[clamp(2.4rem,5vw,3.8rem)] leading-[1.02] text-ink">
            Your financial life,
            <br />
            from every <span className="italic text-green">angle</span>.
          </h2>
        </Reveal>

        <div className="mt-10 grid gap-5 lg:grid-cols-[280px_1fr] lg:gap-8">
          {/* Mobile: horizontal chips */}
          <div
            className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 lg:hidden"
            role="tablist"
            aria-label="Product areas"
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active === tab.id}
                onClick={() => setActive(tab.id)}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                  active === tab.id
                    ? "border-green bg-green text-cream"
                    : "border-line bg-white/70 text-muted",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Desktop: vertical selector */}
          <div
            className="hidden flex-col gap-1.5 lg:flex"
            role="tablist"
            aria-label="Product areas"
            aria-orientation="vertical"
          >
            {TABS.map((tab) => {
              const isActive = active === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActive(tab.id)}
                  onMouseEnter={() => setActive(tab.id)}
                  className={cn(
                    "group relative rounded-2xl border px-5 py-4 text-left transition-all duration-300",
                    isActive
                      ? "border-line bg-white shadow-[0_14px_30px_-18px_rgba(25,25,22,0.3)]"
                      : "border-transparent hover:bg-ink/4",
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="tab-accent"
                      className="absolute bottom-3 left-0 top-3 w-[3px] rounded-full bg-green"
                      transition={
                        reduced
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 300, damping: 30 }
                      }
                    />
                  )}
                  <div className="flex items-baseline gap-3">
                    <span
                      className={cn(
                        "font-mono text-[10px]",
                        isActive ? "text-green" : "text-muted/70",
                      )}
                    >
                      {tab.num}
                    </span>
                    <span
                      className={cn(
                        "text-[15px] font-semibold",
                        isActive ? "text-ink" : "text-muted",
                      )}
                    >
                      {tab.label}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "mt-1 pl-7 text-[12.5px] leading-snug transition-colors",
                      isActive ? "text-muted" : "text-muted/60",
                    )}
                  >
                    {tab.desc}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Visual */}
          <motion.div
            ref={panelRef}
            layout={!reduced}
            transition={{ duration: 0.45, ease: EASE }}
            className="min-h-[360px]"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={`${active}-${panelInView ? "in" : "out"}`}
                role="tabpanel"
                initial={
                  reduced
                    ? false
                    : { opacity: 0, y: 24, scale: 0.98, filter: "blur(8px)" }
                }
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                exit={
                  reduced
                    ? undefined
                    : { opacity: 0, y: -14, scale: 0.985, filter: "blur(6px)" }
                }
                transition={{ duration: 0.5, ease: EASE }}
              >
                {(panelInView || reduced) && <Visual />}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
