import { useEffect, useRef, useState } from "react";
import {
  motion,
  useInView,
  useReducedMotion,
} from "motion/react";
import {
  DemoTag,
  MonoTag,
  Reveal,
  RevealGroup,
  RevealItem,
  SectionEyebrow,
} from "./ui";
import { cn } from "../utils/cn";

const EASE = [0.22, 1, 0.36, 1] as const;

const ANALYSIS_STEPS = [
  "Financial Snapshot",
  "Portfolio Analysis",
  "Cash Flow",
  "Goal Impact",
];

type StepState = "idle" | "processing" | "complete";

function AnalysisCard() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [states, setStates] = useState<StepState[]>(
    ANALYSIS_STEPS.map(() => "idle"),
  );

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setStates(ANALYSIS_STEPS.map(() => "complete"));
      return;
    }
    const timers: number[] = [];
    ANALYSIS_STEPS.forEach((_, i) => {
      timers.push(
        window.setTimeout(() => {
          setStates((prev) =>
            prev.map((s, j) => (j === i ? "processing" : s)),
          );
        }, 300 + i * 620),
      );
      timers.push(
        window.setTimeout(() => {
          setStates((prev) =>
            prev.map((s, j) => (j === i ? "complete" : s)),
          );
        }, 820 + i * 620),
      );
    });
    return () => timers.forEach(window.clearTimeout);
  }, [inView, reduced]);

  const allComplete = states.every((s) => s === "complete");

  return (
    <div
      ref={ref}
      className="card-lift flex h-full flex-col rounded-[24px] border border-line bg-white/85 p-6 sm:p-7"
    >
      <MonoTag className="text-ink/70">ARIA analysis</MonoTag>
      <ul className="mt-5 divide-y divide-line">
        {ANALYSIS_STEPS.map((step, i) => {
          const state = states[i];
          return (
            <li key={step} className="flex items-center justify-between py-3">
              <span
                className={cn(
                  "flex items-center gap-2.5 text-sm font-medium transition-colors duration-300",
                  state === "idle" ? "text-muted/60" : "text-ink",
                )}
              >
                {state === "idle" && (
                  <span className="h-3.5 w-3.5 rounded-full border border-ink/15" />
                )}
                {state === "processing" && (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-gold/30 border-t-gold" />
                )}
                {state === "complete" && (
                  <motion.span
                    initial={reduced ? false : { scale: 0.3, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.35, ease: EASE }}
                    className="flex h-4 w-4 items-center justify-center rounded-full bg-green/12 text-[9px] font-bold text-green"
                  >
                    ✓
                  </motion.span>
                )}
                {step}
              </span>
              <span
                className={cn(
                  "font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors duration-300",
                  state === "complete"
                    ? "text-green"
                    : state === "processing"
                      ? "text-gold"
                      : "text-muted/40",
                )}
              >
                {state === "idle"
                  ? "Queued"
                  : state === "processing"
                    ? "Running…"
                    : "Complete"}
              </span>
            </li>
          );
        })}
      </ul>
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 10 }}
        animate={allComplete ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, ease: EASE }}
        className={cn(
          "mt-auto rounded-xl px-4 py-3 text-center font-mono text-[11px] font-semibold uppercase tracking-[0.16em]",
          allComplete
            ? "bg-green text-cream"
            : "border border-line bg-cream text-muted/50",
        )}
      >
        {allComplete ? "Grounded response ready" : "Awaiting engine results…"}
      </motion.div>
    </div>
  );
}

const PIPELINE: { label: string; sub?: string[] }[] = [
  { label: "Your data" },
  {
    label: "Finance engines",
    sub: ["Portfolio", "Risk", "FIRE", "Net Worth", "Cash Flow"],
  },
  { label: "Structured results" },
  { label: "ARIA" },
  { label: "Explanation" },
];

const CHIPS = ["Read-only", "What-if", "Authenticated context"];

export function Thinking() {
  return (
    <section id="thinking" className="border-t border-line bg-sagelight py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <SectionEyebrow className="justify-center">
            How ARIA thinks
          </SectionEyebrow>
          <h2 className="font-serif text-[clamp(2.4rem,5vw,3.8rem)] leading-[1.04] text-ink">
            The AI isn’t the calculator.
            <br />
            <span className="italic text-green">
              It knows which calculator to ask.
            </span>
          </h2>
        </Reveal>

        {/* two-column visual */}
        <RevealGroup className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-2">
          {/* question */}
          <RevealItem className="h-full">
            <div className="card-lift flex h-full flex-col rounded-[24px] border border-line bg-white/85 p-6 sm:p-7">
              <div className="flex items-center justify-between">
                <MonoTag className="text-ink/70">Question</MonoTag>
                <DemoTag label="Demo flow" />
              </div>
              <p className="mt-6 font-serif text-[26px] leading-snug text-ink sm:text-[30px]">
                “Can I afford a ₹15L car without pushing FIRE past 40?”
              </p>
              <div className="mt-auto pt-8">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  One question · six data domains
                </p>
              </div>
            </div>
          </RevealItem>

          {/* analysis */}
          <RevealItem className="h-full">
            <AnalysisCard />
          </RevealItem>
        </RevealGroup>

        {/* pipeline */}
        <Reveal delay={0.1} className="mt-12">
          <ol className="mx-auto flex max-w-5xl flex-col items-stretch justify-center gap-2 md:flex-row md:items-start md:gap-0">
            {PIPELINE.map((stage, i) => (
              <li
                key={stage.label}
                className="flex flex-col items-center md:flex-1 md:flex-row"
              >
                <div
                  className={
                    "card-lift w-full rounded-2xl border px-4 py-3.5 text-center md:w-auto md:flex-1 " +
                    (stage.label === "ARIA"
                      ? "border-green/30 bg-green text-cream"
                      : "border-line bg-white/85 text-ink")
                  }
                >
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em]">
                    {stage.label}
                  </p>
                  {stage.sub && (
                    <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">
                      {stage.sub.join(" · ")}
                    </p>
                  )}
                </div>
                {i < PIPELINE.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="py-1 text-ink/35 md:px-2.5 md:py-0"
                  >
                    <span className="hidden md:inline">→</span>
                    <span className="md:hidden">↓</span>
                  </span>
                )}
              </li>
            ))}
          </ol>
        </Reveal>

        <Reveal delay={0.15} className="mt-12 text-center">
          <p className="font-serif text-2xl leading-snug text-ink sm:text-3xl">
            The financial engines calculate.
            <br />
            <span className="italic text-green">ARIA explains.</span>
          </p>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted">
            Deterministic engines for portfolio, returns, risk, FIRE, net
            worth, tax, capital gains, insurance estimates, credit-card payoff
            and short-term analysis power every answer.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {CHIPS.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-green/25 bg-white/70 px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-green"
              >
                {chip}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
