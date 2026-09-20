import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "../utils/cn";
import { CountUp, DemoTag, MonoTag } from "./ui";

const EASE = [0.22, 1, 0.36, 1] as const;

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "card-lift flex flex-col rounded-[28px] border border-line bg-white/90 p-5 shadow-[0_28px_60px_-30px_rgba(25,25,22,0.25)] sm:p-7",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <MonoTag className="text-ink/70">{title}</MonoTag>
        <DemoTag />
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}

/* ================================ OVERVIEW ================================ */

const SPEND = [
  { label: "Housing", value: 22, color: "#0B6B50" },
  { label: "Food", value: 12, color: "#C3A56A" },
  { label: "Lifestyle", value: 10, color: "#E8BCA1" },
  { label: "Transport", value: 8, color: "#A9C0CA" },
  { label: "Other", value: 12, color: "#BDD0C2" },
];

const ALLOC = [
  { label: "Stocks", pct: 40, color: "#0B6B50" },
  { label: "ETFs", pct: 24, color: "#BDD0C2" },
  { label: "Mutual funds", pct: 8, color: "#A9C0CA" },
  { label: "FDs", pct: 13, color: "#C3A56A" },
  { label: "Cash", pct: 15, color: "#E8BCA1" },
];

export function OverviewVisual() {
  const reduced = useReducedMotion();
  return (
    <Panel title="Overview — one dashboard">
      {/* stat strip */}
      <div className="grid grid-cols-3 gap-4 border-b border-line pb-5 sm:grid-cols-5">
        <div>
          <p className="font-mono text-[9.5px] uppercase tracking-[0.13em] text-muted">
            Net worth
          </p>
          <p className="tabular mt-1 font-mono text-lg font-semibold leading-none text-ink sm:text-xl">
            <CountUp to={34.4} decimals={1} prefix="₹" suffix="L" />
          </p>
        </div>
        <div>
          <p className="font-mono text-[9.5px] uppercase tracking-[0.13em] text-muted">
            Monthly income
          </p>
          <p className="tabular mt-1 font-mono text-lg font-semibold leading-none text-ink sm:text-xl">
            <CountUp to={1.2} decimals={2} prefix="₹" suffix="L" />
          </p>
        </div>
        <div>
          <p className="font-mono text-[9.5px] uppercase tracking-[0.13em] text-muted">
            Outflow
          </p>
          <p className="tabular mt-1 font-mono text-lg font-semibold leading-none text-ink sm:text-xl">
            <CountUp to={64} prefix="₹" suffix="K" />
          </p>
        </div>
        <div>
          <p className="font-mono text-[9.5px] uppercase tracking-[0.13em] text-muted">
            Surplus
          </p>
          <p className="tabular mt-1 font-mono text-lg font-semibold leading-none text-green sm:text-xl">
            <CountUp to={56} prefix="₹" suffix="K" />
          </p>
        </div>
        <div className="col-span-3 sm:col-span-1">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.13em] text-muted">
            Savings rate
          </p>
          <p className="tabular mt-1 font-mono text-lg font-semibold leading-none text-green sm:text-xl">
            <CountUp to={46.7} decimals={1} suffix="%" />
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        {/* cash-flow curve */}
        <div>
          <MonoTag>Cash flow — last 6 months</MonoTag>
          <svg viewBox="0 0 420 180" className="mt-3 w-full" role="img" aria-label="Cash flow trend chart (demo data)">
            {[40, 80, 120].map((y) => (
              <line key={y} x1="0" x2="420" y1={y} y2={y} stroke="rgba(25,25,22,0.07)" />
            ))}
            <motion.path
              d="M0 150 C 60 138, 90 96, 150 92 C 210 88, 240 108, 300 84 C 350 64, 390 52, 420 46 L 420 180 L 0 180 Z"
              fill="#DCE7DE"
              initial={reduced ? undefined : { opacity: 0 }}
              animate={{ opacity: 0.9 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            />
            <motion.path
              d="M0 150 C 60 138, 90 96, 150 92 C 210 88, 240 108, 300 84 C 350 64, 390 52, 420 46"
              fill="none"
              stroke="#0B6B50"
              strokeWidth="2.5"
              strokeLinecap="round"
              initial={reduced ? undefined : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2, delay: 0.2, ease: EASE }}
            />
            <circle cx="420" cy="46" r="4" fill="#0B6B50" />
            <text x="300" y="30" className="fill-green font-mono" fontSize="11">
              surplus ↑
            </text>
          </svg>
          {/* FIRE indicator */}
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-sagelight px-4 py-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-green">
              FIRE age
            </span>
            <span className="font-mono text-lg font-semibold text-ink">38</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/70">
              <motion.div
                className="h-full rounded-full bg-green"
                initial={reduced ? undefined : { width: 0 }}
                animate={{ width: "34%" }}
                transition={{ duration: 1, delay: 0.5, ease: EASE }}
              />
            </div>
            <span className="font-mono text-[10px] text-muted">
              34% of corpus
            </span>
          </div>
        </div>

        {/* right column */}
        <div className="space-y-5">
          <div>
            <MonoTag>Where it goes — spending</MonoTag>
            <div className="mt-3 flex items-center gap-5">
              {/* donut */}
              <div className="relative h-[118px] w-[118px] shrink-0">
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background:
                      "conic-gradient(#0B6B50 0 34%, #C3A56A 34% 53%, #E8BCA1 53% 69%, #A9C0CA 69% 81%, #BDD0C2 81% 100%)",
                  }}
                  initial={reduced ? undefined : { rotate: -90, scale: 0.8, opacity: 0 }}
                  animate={{ rotate: 0, scale: 1, opacity: 1 }}
                  transition={{ duration: 1, delay: 0.35, ease: EASE }}
                />
                <div className="absolute inset-[16px] flex flex-col items-center justify-center rounded-full bg-white">
                  <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted">
                    Spending
                  </span>
                  <span className="tabular font-mono text-lg font-semibold text-ink">
                    ₹64K
                  </span>
                </div>
              </div>
              <ul className="flex-1 space-y-2">
                {SPEND.map((s, i) => (
                  <motion.li
                    key={s.label}
                    className="flex items-center gap-2 text-xs text-muted"
                    initial={reduced ? undefined : { opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.7 + i * 0.08, ease: EASE }}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: s.color }}
                    />
                    <span className="flex-1">{s.label}</span>
                    <span className="tabular font-mono text-[11px] text-ink">
                      ₹{s.value}K
                    </span>
                  </motion.li>
                ))}
              </ul>
            </div>
          </div>
          <div>
            <MonoTag>Portfolio allocation</MonoTag>
            <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full">
              {ALLOC.map((a) => (
                <motion.div
                  key={a.label}
                  style={{ background: a.color }}
                  initial={reduced ? undefined : { flexGrow: 0.0001 }}
                  animate={{ flexGrow: a.pct }}
                  transition={{ duration: 0.9, delay: 0.4, ease: EASE }}
                />
              ))}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
              {ALLOC.map((a) => (
                <span key={a.label} className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: a.color }}
                  />
                  {a.label} {a.pct}%
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

/* =============================== PORTFOLIO ================================ */

const HOLDINGS = [
  { name: "RELIANCE", pct: 30, risk: true },
  { name: "NIFTY ETF", pct: 24, risk: false },
  { name: "HDFCBANK", pct: 16, risk: false },
  { name: "MIDCAP ETF", pct: 14, risk: false },
  { name: "OTHER", pct: 16, risk: false },
];

export function PortfolioVisual() {
  const reduced = useReducedMotion();
  return (
    <Panel title="Portfolio intelligence">
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="font-mono text-[9.5px] uppercase tracking-[0.13em] text-muted">
            Portfolio value
          </p>
          <p className="tabular mt-1 font-mono text-3xl font-semibold text-ink">
            ₹28.6L
          </p>

          <ul className="mt-6 space-y-3.5">
            {HOLDINGS.map((h, i) => (
              <li key={h.name}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span
                    className={cn(
                      "font-mono text-xs font-medium tracking-wide",
                      h.risk ? "text-risk" : "text-ink",
                    )}
                  >
                    {h.name}
                    {h.risk && (
                      <span className="ml-2 rounded-full bg-risk/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.1em] text-risk">
                        concentrated
                      </span>
                    )}
                  </span>
                  <span className="tabular font-mono text-xs text-muted">
                    {h.pct}%
                  </span>
                </div>
                <div className="relative h-2.5 w-full rounded-full bg-cream2">
                  <motion.div
                    className={cn(
                      "h-full rounded-full",
                      h.risk ? "bg-risk" : "bg-sage",
                    )}
                    initial={reduced ? undefined : { width: 0 }}
                    animate={{ width: `${(h.pct / 30) * 100}%` }}
                    transition={{ duration: 0.9, delay: 0.15 + i * 0.1, ease: EASE }}
                  />
                  {h.risk && (
                    <motion.span
                      className="absolute -top-1 h-[18px] w-[2px] bg-ink/60"
                      style={{ left: `${(25 / 30) * 100}%` }}
                      initial={reduced ? false : { opacity: 0, scaleY: 0 }}
                      animate={{ opacity: 1, scaleY: 1 }}
                      transition={{ duration: 0.4, delay: 1.15, ease: EASE }}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-line bg-cream px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink transition-colors hover:border-green/40 hover:text-green"
          >
            Import broker CSV
            <span aria-hidden="true">→</span>
          </button>

          <div className="mt-6 flex items-start gap-2.5 border-t border-line pt-5 text-sm leading-relaxed text-muted">
            <span aria-hidden="true" className="mt-0.5 text-green">
              ⓘ
            </span>
            <span>
              Portfolio context and market awareness. Not buy or sell advice.
            </span>
          </div>
        </div>

        {/* concentration insight */}
        <motion.div
          initial={reduced ? undefined : { opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 1.25, ease: EASE }}
          className="flex h-fit flex-col rounded-2xl border border-risk/25 bg-risk/5 p-5"
        >
          <MonoTag className="text-risk">
            <span className="h-1.5 w-1.5 rounded-full bg-risk" />
            Concentration detected
          </MonoTag>
          <p className="tabular mt-3 font-mono text-5xl font-semibold text-risk">
            30%
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            Threshold &gt; 25% per stock
          </p>
          <p className="mt-4 text-sm leading-relaxed text-ink/80">
            One holding represents 30% of the portfolio. ARIA flags the
            exposure — the decision stays yours.
          </p>
          <div className="mt-4 border-t border-risk/15 pt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
            Informational only · Not buy/sell advice
          </div>
        </motion.div>
      </div>
    </Panel>
  );
}

/* ================================== FIRE ================================== */

function firePoints(withGoal: boolean): [number, number][] {
  const pts: [number, number][] = [];
  for (let x = 40; x <= 560; x += 20) {
    const t = (x - 40) / 520;
    let y = 272 - 232 * Math.pow(t, 1.6);
    if (withGoal && x > 170) {
      const s = Math.min(1, (x - 170) / 80);
      y += 34 * (s * s * (3 - 2 * s));
    }
    pts.push([x, y]);
  }
  return pts;
}

const toLine = (pts: [number, number][]) =>
  "M" + pts.map((p) => `${p[0]},${p[1].toFixed(1)}`).join(" L");
const toArea = (pts: [number, number][]) =>
  toLine(pts) + " L560,292 L40,292 Z";

const AGE_TICKS = [
  { age: 25, x: 40 },
  { age: 30, x: 170 },
  { age: 35, x: 300 },
  { age: 40, x: 430 },
  { age: 45, x: 560 },
];

export function FireVisual() {
  const reduced = useReducedMotion();
  const [goal, setGoal] = useState(!!reduced);

  useEffect(() => {
    if (reduced) return;
    const t = window.setTimeout(() => setGoal(true), 1400);
    return () => window.clearTimeout(t);
  }, [reduced]);

  const base = useMemo(() => firePoints(false), []);
  const withGoal = useMemo(() => firePoints(true), []);
  const pts = goal ? withGoal : base;
  const markerX = goal ? 430 : 378;
  const spring = { type: "spring", stiffness: 70, damping: 20 } as const;

  return (
    <Panel title="FIRE planning">
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <svg viewBox="0 0 600 330" className="w-full" role="img" aria-label="FIRE projection chart showing FIRE age moving from 38 to 40 after adding a car goal (demo data)">
            {/* grid */}
            {[80, 156, 232].map((y) => (
              <line key={y} x1="40" x2="560" y1={y} y2={y} stroke="rgba(25,25,22,0.06)" />
            ))}
            {/* required corpus */}
            <line
              x1="40"
              x2="560"
              y1="156"
              y2="156"
              stroke="#C3A56A"
              strokeWidth="1.6"
              strokeDasharray="5 5"
            />
            <text x="44" y="148" fontSize="11" className="fill-gold font-mono">
              Required FIRE corpus
            </text>

            {/* area — present on entry, morphs when the goal enters */}
            <motion.path
              animate={{ d: toArea(pts) }}
              initial={false}
              transition={{ duration: 1.1, ease: EASE }}
              fill="#DCE7DE"
              opacity="0.7"
            />
            {/* line — draws on entry, then morphs when the goal enters */}
            <motion.path
              animate={{ d: toLine(pts), pathLength: 1 }}
              initial={reduced ? false : { pathLength: 0 }}
              transition={{ duration: 1.1, ease: EASE }}
              fill="none"
              stroke="#0B6B50"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* car goal marker */}
            <AnimatePresence>
              {goal && (
                <motion.g
                  initial={reduced ? undefined : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <line x1="170" x2="170" y1="128" y2="272" stroke="#B96761" strokeWidth="1.3" strokeDasharray="3 4" />
                  <circle cx="170" cy="252" r="4.5" fill="#B96761" />
                  <text x="178" y="132" fontSize="11" className="fill-risk font-mono">
                    Car ₹15L @ 30
                  </text>
                </motion.g>
              )}
            </AnimatePresence>

            {/* FIRE marker */}
            <motion.g animate={{ x: markerX - 378 }} initial={false} transition={spring}>
              <line x1="378" x2="378" y1="60" y2="292" stroke="#0B6B50" strokeWidth="1.6" />
              <circle cx="378" cy="156" r="5.5" fill="#0B6B50" stroke="#F5F2EC" strokeWidth="2" />
              <rect x="330" y="34" width="96" height="24" rx="12" fill="#0B6B50" />
              <text x="378" y="50" fontSize="11.5" textAnchor="middle" className="fill-cream font-mono">
                {goal ? "FIRE age 40" : "FIRE age 38"}
              </text>
            </motion.g>

            {/* axis */}
            {AGE_TICKS.map((t) => (
              <text key={t.age} x={t.x} y="316" fontSize="11" textAnchor="middle" className="fill-muted font-mono">
                {t.age}
              </text>
            ))}
          </svg>
          <p className="mt-2 text-sm italic text-muted">
            See the cost of a decision in years — not just rupees.
          </p>
        </div>

        {/* scenario card */}
        <div className="card-lift flex h-fit flex-col rounded-2xl border border-line bg-cream p-5">
          <div className="flex items-center justify-between">
            <MonoTag className="text-ink/70">Scenario — Car goal</MonoTag>
            <button
              type="button"
              role="switch"
              aria-checked={goal}
              aria-label="Toggle car goal scenario"
              onClick={() => setGoal((v) => !v)}
              className={cn(
                "relative h-6 w-11 rounded-full transition-colors duration-300",
                goal ? "bg-green" : "bg-ink/20",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-300",
                  goal ? "left-[22px]" : "left-0.5",
                )}
              />
            </button>
          </div>

          <p className="tabular mt-4 font-mono text-2xl font-semibold text-ink">
            ₹15,00,000
          </p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            Target age 30
          </p>

          <div className="mt-5 flex items-center gap-3 border-t border-line pt-5">
            <span className="tabular font-mono text-3xl font-semibold text-ink/60">
              38
            </span>
            <span aria-hidden="true" className="text-muted">
              →
            </span>
            <span
              className={cn(
                "tabular font-mono text-3xl font-semibold transition-colors duration-500",
                goal ? "text-green" : "text-ink/30",
              )}
            >
              40
            </span>
            <AnimatePresence>
              {goal && (
                <motion.span
                  initial={reduced ? undefined : { opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className="ml-auto rounded-full bg-gold/15 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-gold"
                >
                  +2 years
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Goal-impact simulation runs deterministically — a what-if, never a
            transaction.
          </p>
        </div>
      </div>
    </Panel>
  );
}

/* ================================ CASH FLOW =============================== */

const PIPELINE = ["Bank CSV", "Parse", "Validate", "Categorize", "Review", "Commit"];

const REVIEW_ROWS = [
  { merchant: "Zomato", category: "Food", amount: "− ₹640", approved: true },
  { merchant: "Salary credit", category: "Income", amount: "+ ₹1,20,000", approved: true },
  { merchant: "Amazon", category: "Lifestyle", amount: "− ₹2,180", approved: true },
  { merchant: "SIP — Nifty ETF", category: "Investment", amount: "− ₹15,000", approved: false },
];

export function CashFlowVisual() {
  const reduced = useReducedMotion();
  return (
    <Panel title="Bank statements — cash flow">
      <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr]">
        <div>
          {/* pipeline */}
          <ol className="flex flex-wrap items-center gap-y-3">
            {PIPELINE.map((step, i) => {
              const isReview = step === "Review";
              return (
                <li key={step} className="flex items-center">
                  <motion.span
                    initial={reduced ? undefined : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.1 + i * 0.12, ease: EASE }}
                    className={cn(
                      "rounded-full border px-3.5 py-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] sm:px-4",
                      isReview
                        ? "border-gold bg-gold/15 text-ink shadow-[0_6px_18px_-6px_rgba(195,165,106,0.55)]"
                        : "border-line bg-cream text-muted",
                    )}
                  >
                    {isReview && (
                      <span className="relative mr-2 inline-flex h-2 w-2 align-middle">
                        <motion.span
                          className="absolute inline-flex h-full w-full rounded-full bg-gold"
                          animate={reduced ? undefined : { scale: [1, 2.4], opacity: [0.7, 0] }}
                          transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
                        />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
                      </span>
                    )}
                    {step === "Bank CSV" && (
                      <svg
                        viewBox="0 0 24 24"
                        className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <path d="M6 2.5 H13.5 L18 7 V21.5 H6 Z" />
                        <path d="M13.5 2.5 V7 H18" />
                        <path d="M9 12 H15 M9 15.5 H15 M9 19 H12.5" />
                      </svg>
                    )}
                    {step}
                  </motion.span>
                  {i < PIPELINE.length - 1 && (
                    <span aria-hidden="true" className="mx-1.5 text-ink/30 sm:mx-2.5">
                      →
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-gold">
            You approve every transaction before it enters your model
          </p>

          {/* figures */}
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              { label: "Income", value: "₹1.20L", pct: 100, color: "#0B6B50" },
              { label: "Expenses", value: "₹64K", pct: 53, color: "#B96761" },
              { label: "Surplus", value: "₹56K", pct: 47, color: "#C3A56A" },
            ].map((row, i) => (
              <div key={row.label} className="card-lift rounded-2xl border border-line bg-cream p-4">
                <p className="font-mono text-[9.5px] uppercase tracking-[0.13em] text-muted">
                  {row.label}
                </p>
                <p className="tabular mt-1 font-mono text-2xl font-semibold" style={{ color: row.color }}>
                  {row.value}
                </p>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: row.color }}
                    initial={reduced ? undefined : { width: 0 }}
                    animate={{ width: `${row.pct}%` }}
                    transition={{ duration: 0.9, delay: 0.5 + i * 0.12, ease: EASE }}
                  />
                </div>
              </div>
            ))}
          </div>

          <p className="mt-6 font-serif text-xl italic text-ink/80">
            Review comes before commit.
          </p>
        </div>

        {/* review queue */}
        <div className="card-lift flex h-fit flex-col rounded-2xl border border-gold/30 bg-gold/[0.06] p-5">
          <MonoTag className="text-ink/70">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            Review queue
          </MonoTag>
          <ul className="mt-4 divide-y divide-gold/15">
            {REVIEW_ROWS.map((row, i) => (
              <motion.li
                key={row.merchant}
                initial={reduced ? undefined : { opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.3 + i * 0.1, ease: EASE }}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {row.merchant}
                  </p>
                  <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
                    {row.category}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="tabular font-mono text-xs text-ink/80">
                    {row.amount}
                  </span>
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                      row.approved
                        ? "bg-green/15 text-green"
                        : "bg-ink/8 text-muted",
                    )}
                    aria-label={row.approved ? "Approved" : "Pending review"}
                  >
                    {row.approved ? "✓" : "…"}
                  </span>
                </div>
              </motion.li>
            ))}
          </ul>
          <p className="mt-4 border-t border-gold/15 pt-3 text-sm leading-relaxed text-ink/70">
            Every categorized transaction is queued for your review before it
            is committed to your financial model.
          </p>
        </div>
      </div>
    </Panel>
  );
}

/* ================================ NET WORTH =============================== */

const ASSETS = [
  { label: "Investments", value: "₹31.0L" },
  { label: "Fixed deposits", value: "₹5.5L" },
  { label: "Cash", value: "₹6.3L" },
];

export function NetWorthVisual() {
  const reduced = useReducedMotion();
  return (
    <Panel title="Net worth — the full balance sheet">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        {/* ledger */}
        <div className="font-mono">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted">
            Assets
          </p>
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {ASSETS.map((a, i) => (
              <motion.li
                key={a.label}
                initial={reduced ? undefined : { opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.1 + i * 0.1, ease: EASE }}
                className="flex items-baseline justify-between py-2.5"
              >
                <span className="text-sm text-ink/80">{a.label}</span>
                <span className="tabular text-sm font-medium text-ink">
                  {a.value}
                </span>
              </motion.li>
            ))}
          </ul>
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5, ease: EASE }}
            className="flex items-baseline justify-between py-2.5"
          >
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted">
              Total assets
            </span>
            <span className="tabular text-base font-semibold text-ink">
              ₹42.8L
            </span>
          </motion.div>
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8, ease: EASE }}
            className="flex items-baseline justify-between border-t border-line py-2.5"
          >
            <span className="text-sm text-risk">− Liabilities</span>
            <span className="tabular text-sm font-medium text-risk">₹8.4L</span>
          </motion.div>
          <motion.div
            initial={reduced ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 1.15, ease: EASE }}
            className="mt-1 flex items-baseline justify-between rounded-xl bg-sagelight px-4 py-3.5"
          >
            <span className="text-[10px] uppercase tracking-[0.16em] text-green">
              Net worth
            </span>
            <span className="tabular text-2xl font-semibold text-green">
              ₹34.4L
            </span>
          </motion.div>
        </div>

        {/* projection */}
        <div>
          <MonoTag>Forward projection — 5 years</MonoTag>
          <svg viewBox="0 0 360 220" className="mt-3 w-full" role="img" aria-label="Net worth forward projection chart (demo data)">
            {[60, 120, 180].map((y) => (
              <line key={y} x1="20" x2="340" y1={y} y2={y} stroke="rgba(25,25,22,0.07)" />
            ))}
            <motion.path
              d="M20 180 C 90 168, 140 140, 200 112 C 250 88, 300 64, 340 48"
              fill="none"
              stroke="#0B6B50"
              strokeWidth="2.5"
              strokeLinecap="round"
              initial={reduced ? undefined : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.3, delay: 0.3, ease: EASE }}
            />
            <motion.path
              d="M200 112 C 250 96, 300 82, 340 74"
              fill="none"
              stroke="#A9C0CA"
              strokeWidth="2"
              strokeDasharray="2 6"
              strokeLinecap="round"
              initial={reduced ? undefined : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1, delay: 1.2, ease: EASE }}
            />
            <circle cx="20" cy="180" r="4" fill="#0B6B50" />
            <text x="30" y="196" fontSize="11" className="fill-muted font-mono">
              ₹34.4L today
            </text>
            <text x="238" y="44" fontSize="11" className="fill-green font-mono">
              projected
            </text>
            <text x="252" y="100" fontSize="11" className="fill-blue font-mono">
              conservative
            </text>
          </svg>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Assets, FDs, cash and liabilities roll up into one number — then
            project forward under configurable assumptions.
          </p>
        </div>
      </div>
    </Panel>
  );
}
