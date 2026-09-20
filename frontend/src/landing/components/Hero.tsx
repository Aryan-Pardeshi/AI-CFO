import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { LOGIN_URL } from "../lib/site";
import { scrollToId } from "../lib/scroll";
import { CountUp, DemoTag, GhostButton, MonoTag, PrimaryButton } from "./ui";

const EASE = [0.22, 1, 0.36, 1] as const;

/* Abstract financial data landscape behind the product panel */
function DataLandscape() {
  const reduced = useReducedMotion();
  const draw = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { pathLength: 0, opacity: 0 },
          animate: { pathLength: 1, opacity: 1 },
          transition: { duration: 1.8, delay, ease: EASE },
        };

  return (
    <svg
      viewBox="0 0 640 560"
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      {/* area fills */}
      <motion.path
        d="M-20 470 C 120 430 200 340 320 330 C 440 320 540 250 660 220 L 660 580 L -20 580 Z"
        fill="#DCE7DE"
        initial={reduced ? undefined : { opacity: 0, y: 26 }}
        animate={{ opacity: 0.9, y: 0 }}
        transition={{ duration: 1.4, delay: 0.2, ease: EASE }}
      />
      <motion.path
        d="M-20 510 C 140 490 260 420 380 415 C 500 410 580 360 660 340 L 660 580 L -20 580 Z"
        fill="#E8BCA1"
        initial={reduced ? undefined : { opacity: 0, y: 26 }}
        animate={{ opacity: 0.55, y: 0 }}
        transition={{ duration: 1.4, delay: 0.35, ease: EASE }}
      />
      <motion.path
        d="M-20 545 C 160 535 300 490 430 486 C 540 482 600 452 660 440 L 660 580 L -20 580 Z"
        fill="#A9C0CA"
        initial={reduced ? undefined : { opacity: 0, y: 20 }}
        animate={{ opacity: 0.5, y: 0 }}
        transition={{ duration: 1.4, delay: 0.5, ease: EASE }}
      />
      {/* stroke lines */}
      <motion.path
        d="M-20 470 C 120 430 200 340 320 330 C 440 320 540 250 660 220"
        fill="none"
        stroke="#0B6B50"
        strokeWidth="2"
        strokeOpacity="0.55"
        {...draw(0.4)}
      />
      <motion.path
        d="M-20 380 C 140 370 240 280 360 262 C 480 244 560 180 660 150"
        fill="none"
        stroke="#C3A56A"
        strokeWidth="1.6"
        strokeOpacity="0.6"
        strokeDasharray="1 7"
        strokeLinecap="round"
        {...draw(0.7)}
      />
    </svg>
  );
}

function HeroRight() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const bgY = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const cardY = useTransform(scrollYProgress, [0, 1], [0, -40]);

  // Desktop-only subtle mouse tilt
  const tiltX = useSpring(useMotionValue(0), { stiffness: 120, damping: 18 });
  const tiltY = useSpring(useMotionValue(0), { stiffness: 120, damping: 18 });
  const tiltEnabled =
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches;

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!tiltEnabled || reduced) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    tiltY.set(px * 7);
    tiltX.set(-py * 7);
  };
  const onPointerLeave = () => {
    tiltX.set(0);
    tiltY.set(0);
  };

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className="relative flex items-center justify-center [perspective:1200px] lg:justify-end"
    >
      <motion.div
        style={reduced ? undefined : { y: bgY }}
        className="absolute -inset-x-10 -bottom-16 -top-8 overflow-hidden rounded-[40px] lg:-inset-x-6"
      >
        <DataLandscape />
      </motion.div>
      <motion.div
        style={
          reduced
            ? undefined
            : {
                y: cardY,
                rotateX: tiltX,
                rotateY: tiltY,
                transformPerspective: 1200,
              }
        }
        className="w-full max-w-md [transform-style:preserve-3d]"
      >
        <SnapshotPanel />
      </motion.div>
    </div>
  );
}

/* Small net-worth sparkline that draws itself once */
function SnapshotSparkline() {
  const reduced = useReducedMotion();
  const line =
    "M2 46 C 26 42 40 32 62 30 C 84 28 98 36 120 24 C 142 12 160 14 182 8";
  return (
    <svg
      viewBox="0 0 184 54"
      className="mt-2 h-12 w-full"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0B6B50" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#0B6B50" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* faint gridlines */}
      {[14, 30, 46].map((y) => (
        <line
          key={y}
          x1="0"
          x2="184"
          y1={y}
          y2={y}
          stroke="rgba(25,25,22,0.06)"
          strokeDasharray="2 4"
        />
      ))}
      <motion.path
        d={`${line} L182 54 L2 54 Z`}
        fill="url(#sparkFill)"
        initial={reduced ? undefined : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.9 }}
      />
      <motion.path
        d={line}
        fill="none"
        stroke="#0B6B50"
        strokeWidth="2"
        strokeLinecap="round"
        initial={reduced ? undefined : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.5, delay: 0.7, ease: EASE }}
      />
      <motion.circle
        cx="182"
        cy="8"
        r="3.2"
        fill="#0B6B50"
        stroke="#fff"
        strokeWidth="1.4"
        initial={reduced ? false : { scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 2.05, duration: 0.35, ease: EASE }}
      />
    </svg>
  );
}

const STATUS_ROWS = ["Portfolio", "Cash Flow", "Goals", "FIRE"];

function SnapshotPanel() {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 36 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, delay: 0.45, ease: EASE }}
      className="relative w-full max-w-md"
    >
    <div className="card-lift rounded-[28px] border border-line bg-white/85 p-6 shadow-[0_24px_60px_-24px_rgba(25,25,22,0.22)] backdrop-blur-sm sm:p-7">
      <div className="flex items-center justify-between">
        <MonoTag className="text-ink/70">Financial snapshot</MonoTag>
        <DemoTag />
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5">
        <div className="col-span-2 flex items-end justify-between gap-4">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              Net worth
            </dt>
            <dd className="mt-1 font-mono text-[26px] font-semibold leading-none text-ink">
              <CountUp to={34.4} decimals={1} prefix="₹" suffix="L" />
            </dd>
          </div>
          <div className="w-2/3 max-w-[200px]">
            <SnapshotSparkline />
          </div>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Monthly surplus
          </dt>
          <dd className="mt-1 font-mono text-[26px] font-semibold leading-none text-green">
            <CountUp to={56} prefix="₹" suffix="K" />
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            FIRE age
          </dt>
          <dd className="mt-1 font-mono text-[26px] font-semibold leading-none text-ink">
            <CountUp to={38} />
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Largest holding
          </dt>
          <dd className="mt-1 font-mono text-[26px] font-semibold leading-none text-risk">
            <CountUp to={30} suffix="%" />
          </dd>
        </div>
      </dl>

      {/* ask ARIA */}
      <div className="mt-6 rounded-2xl bg-sagelight p-4">
        <MonoTag className="text-green">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green" />
          Ask ARIA
        </MonoTag>
        <p className="mt-2 font-serif text-[19px] leading-snug text-ink">
          “Can I afford a ₹15L car in 3 years?”
        </p>
      </div>

      {/* status rows */}
      <ul className="mt-4 space-y-1">
        {STATUS_ROWS.map((label, i) => (
          <motion.li
            key={label}
            initial={reduced ? false : { opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 1 + i * 0.18, ease: EASE }}
            className="flex items-center justify-between rounded-lg px-2 py-1.5"
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
              {label}
            </span>
            <motion.span
              initial={reduced ? false : { scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, delay: 1.15 + i * 0.18, ease: EASE }}
              className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-green/12 font-mono text-[10px] font-semibold text-green"
              aria-label="connected"
            >
              ✓
            </motion.span>
          </motion.li>
        ))}
      </ul>
    </div>
    </motion.div>
  );
}

export function Hero() {
  const reduced = useReducedMotion();
  const rise = (delay: number) => ({
    initial: reduced ? false : ({ opacity: 0, y: 28 } as const),
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.9, delay, ease: EASE },
  });

  return (
    <section
      id="top"
      className="relative overflow-hidden bg-cream texture-grain"
    >
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-5 pb-14 pt-24 sm:px-8 lg:min-h-svh lg:max-h-[920px] lg:grid-cols-[54%_46%] lg:gap-6 lg:pb-16 lg:pt-20">
        {/* LEFT */}
        <div className="relative z-10">
          <motion.p {...rise(0.05)}>
            <MonoTag className="text-green">ARIA — Personal AI CFO</MonoTag>
          </motion.p>

          <motion.h1
            {...rise(0.15)}
            className="mt-5 font-serif text-[clamp(3rem,7.2vw,5.6rem)] leading-[0.98] tracking-[-0.01em] text-ink"
          >
            Your finances.
            <br />
            Finally in <span className="italic text-green">context</span>.
          </motion.h1>

          <motion.p
            {...rise(0.3)}
            className="mt-6 max-w-xl text-[17px] leading-relaxed text-muted"
          >
            ARIA connects your portfolio, cash flow, goals, loans and FIRE plan
            — then uses real financial calculations to help answer questions
            across your entire financial life.
          </motion.p>

          <motion.div {...rise(0.42)} className="mt-8 flex flex-wrap gap-3">
            <PrimaryButton href={LOGIN_URL}>
              Open ARIA
              <span
                aria-hidden="true"
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              >
                →
              </span>
            </PrimaryButton>
            <GhostButton onClick={() => scrollToId("thinking")}>
              See how it works
              <span
                aria-hidden="true"
                className="transition-transform duration-200 group-hover:translate-x-1"
              >
                →
              </span>
            </GhostButton>
          </motion.div>

          <motion.p
            {...rise(0.55)}
            className="mt-10 inline-flex items-center gap-3 border-t border-line pt-5 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-ink"
          >
            <span className="h-px w-8 bg-gold" aria-hidden="true" />
            Numbers first. AI second.
          </motion.p>
        </div>

        {/* RIGHT */}
        <HeroRight />
      </div>
    </section>
  );
}
