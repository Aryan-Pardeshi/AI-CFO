import type { CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Reveal, RevealGroup, RevealItem, SectionEyebrow } from "./ui";

const EASE = [0.22, 1, 0.36, 1] as const;

type NodeItem = { label: string; sub: string };

const LEFT_NODES: NodeItem[] = [
  { label: "Portfolio", sub: "Stocks · ETFs · MFs · FDs" },
  { label: "Cash Flow", sub: "Income · Spending" },
  { label: "Goals", sub: "Car · Home · Education" },
];

const RIGHT_NODES: NodeItem[] = [
  { label: "Loans", sub: "EMIs · Obligations" },
  { label: "Net Worth", sub: "Assets − Liabilities" },
  { label: "FIRE", sub: "Corpus · Projection" },
];

/* ─────────────────────────── Shared geometry ───────────────────────────
   One coordinate system (1000 × 460). The canvas keeps this exact aspect
   ratio, so a % in CSS equals the same number in SVG viewBox units.
   Cards, ARIA panel, dots and connector paths all use these numbers. */
const VB_W = 1000;
const VB_H = 460;

const CARD_W = 290;
const CARD_H = 100;
const CARD_TOPS = [0, 180, 360];
const LEFT_EDGE = CARD_W; // 290 — inner edge of the left cards
const RIGHT_EDGE = VB_W - CARD_W; // 710 — inner edge of the right cards

const ARIA_W = 250;
const ARIA_H = 180;
const ARIA_X = (VB_W - ARIA_W) / 2; // 375
const ARIA_Y = (VB_H - ARIA_H) / 2; // 140
const PORT_YS = [182, 230, 278]; // where the three lines enter ARIA

const pctX = (v: number) => `${(v / VB_W) * 100}%`;
const pctY = (v: number) => `${(v / VB_H) * 100}%`;

function connectorPath(side: "left" | "right", i: number) {
  const cy = CARD_TOPS[i] + CARD_H / 2;
  const py = PORT_YS[i];
  const x0 = side === "left" ? LEFT_EDGE : RIGHT_EDGE;
  const x1 = side === "left" ? ARIA_X : ARIA_X + ARIA_W;
  if (cy === py) return `M${x0} ${cy} L${x1} ${py}`;
  const dx = (x1 - x0) / 2;
  return `M${x0} ${cy} C${x0 + dx} ${cy} ${x1 - dx} ${py} ${x1} ${py}`;
}

/* ────────────────────────────── Pieces ────────────────────────────── */

function NodeBox({
  node,
  index,
  style,
}: {
  node: NodeItem;
  index: number;
  style: CSSProperties;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className="absolute"
      style={style}
      initial={reduced ? false : { opacity: 0, scale: 0.94 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay: 0.1 + index * 0.08, ease: EASE }}
    >
      <div
        className="flex h-full w-full flex-col justify-center rounded-[20px] border border-line bg-white shadow-[0_16px_36px_-20px_rgba(25,25,22,0.28)] transition-shadow duration-500 hover:shadow-[0_22px_44px_-18px_rgba(25,25,22,0.36)]"
        style={{ paddingInline: "clamp(14px, 2.2cqw, 22px)" }}
      >
        <p
          className="font-semibold tracking-tight text-ink"
          style={{ fontSize: "clamp(13px, 1.75cqw, 17px)" }}
        >
          {node.label}
        </p>
        <p
          className="mt-1 whitespace-nowrap font-mono uppercase tracking-[0.12em] text-muted"
          style={{ fontSize: "clamp(8.5px, 1.1cqw, 11px)" }}
        >
          {node.sub}
        </p>
      </div>
    </motion.div>
  );
}

function AriaCore() {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className="h-full w-full"
      initial={reduced ? false : { opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
    >
      <div
        className="flex h-full w-full flex-col items-center justify-center bg-green text-center shadow-[0_28px_56px_-20px_rgba(11,107,80,0.5)]"
        style={{ borderRadius: "clamp(20px, 3cqw, 30px)" }}
      >
        <p
          className="font-mono font-semibold text-cream"
          style={{
            fontSize: "clamp(18px, 2.7cqw, 27px)",
            letterSpacing: "0.32em",
            marginRight: "-0.32em",
          }}
        >
          ARIA
        </p>
        <p
          className="mt-2 font-mono uppercase leading-[1.65] text-sagelight"
          style={{
            fontSize: "clamp(8px, 1.05cqw, 10.5px)",
            letterSpacing: "0.16em",
          }}
        >
          Personal
          <br />
          financial
          <br />
          context
        </p>
      </div>
    </motion.div>
  );
}

/* ───────────────────────── Desktop / tablet diagram ───────────────────────── */

function Diagram() {
  const reduced = useReducedMotion();
  const sides = ["left", "right"] as const;

  return (
    <div
      className="@container relative mx-auto mt-12 hidden w-full max-w-5xl md:block"
      style={{ aspectRatio: `${VB_W} / ${VB_H}` }}
    >
      {/* connectors — same viewBox as the layout numbers above */}
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        {sides.map((side, s) =>
          [0, 1, 2].map((i) => (
            <motion.path
              key={`${side}-${i}`}
              d={connectorPath(side, i)}
              fill="none"
              stroke="rgba(25,25,22,0.3)"
              strokeWidth="1.6"
              strokeLinecap="round"
              initial={reduced ? undefined : { pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{
                duration: 1,
                delay: 0.45 + (s * 3 + i) * 0.1,
                ease: EASE,
              }}
            />
          )),
        )}
      </svg>

      {/* left cards */}
      {LEFT_NODES.map((n, i) => (
        <NodeBox
          key={n.label}
          node={n}
          index={i}
          style={{
            left: 0,
            top: pctY(CARD_TOPS[i]),
            width: pctX(CARD_W),
            height: pctY(CARD_H),
          }}
        />
      ))}

      {/* right cards */}
      {RIGHT_NODES.map((n, i) => (
        <NodeBox
          key={n.label}
          node={n}
          index={i + 3}
          style={{
            left: pctX(RIGHT_EDGE),
            top: pctY(CARD_TOPS[i]),
            width: pctX(CARD_W),
            height: pctY(CARD_H),
          }}
        />
      ))}

      {/* ARIA panel */}
      <div
        className="absolute"
        style={{
          left: pctX(ARIA_X),
          top: pctY(ARIA_Y),
          width: pctX(ARIA_W),
          height: pctY(ARIA_H),
        }}
      >
        <AriaCore />
      </div>

      {/* tiny gold ports on the inner edge of each card */}
      {[LEFT_EDGE, RIGHT_EDGE].map((x, s) =>
        CARD_TOPS.map((top, i) => (
          <motion.span
            key={`dot-${s}-${i}`}
            className="absolute z-20 rounded-full bg-gold ring-2 ring-cream2"
            style={{
              left: pctX(x),
              top: pctY(top + CARD_H / 2),
              width: 7,
              height: 7,
              x: "-50%",
              y: "-50%",
            }}
            initial={reduced ? false : { scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{
              duration: 0.35,
              delay: 0.45 + (s * 3 + i) * 0.1,
              ease: EASE,
            }}
          />
        )),
      )}
    </div>
  );
}

/* ─────────────────────────────── Section ─────────────────────────────── */

export function ContextSection() {
  return (
    <section className="border-t border-line bg-cream2 py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal>
            <SectionEyebrow className="justify-center">
              One context
            </SectionEyebrow>
            <h2 className="font-serif text-[clamp(2.4rem,5vw,3.8rem)] leading-[1.02] text-ink">
              One financial context
              <br />
              behind every decision.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-[16px] leading-relaxed text-muted">
              Your investments, spending, liabilities and goals should not
              exist in separate worlds.
            </p>
          </Reveal>
        </div>

        {/* md+ diagram */}
        <Diagram />

        {/* mobile — vertical */}
        <div className="mt-10 md:hidden">
          <div className="mx-auto max-w-md">
            <RevealGroup className="grid grid-cols-2 gap-2.5">
              {[...LEFT_NODES, ...RIGHT_NODES].map((n) => (
                <RevealItem
                  key={n.label}
                  className="rounded-2xl border border-line bg-white px-4 py-3.5 shadow-[0_12px_28px_-18px_rgba(25,25,22,0.25)]"
                >
                  <p className="text-[15px] font-semibold tracking-tight text-ink">
                    {n.label}
                  </p>
                  <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
                    {n.sub}
                  </p>
                </RevealItem>
              ))}
            </RevealGroup>

            <div className="relative my-4 flex items-center justify-center">
              <div className="h-8 w-px bg-ink/25" aria-hidden="true" />
              <span className="absolute -bottom-1 h-1.5 w-1.5 rounded-full bg-green" />
            </div>

            <div className="@container mx-auto h-[104px] max-w-[240px]">
              <AriaCore />
            </div>
          </div>
        </div>

        <Reveal delay={0.15}>
          <p className="mt-10 text-center font-serif text-xl italic text-ink/80">
            ARIA builds the context before it gives the answer.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
