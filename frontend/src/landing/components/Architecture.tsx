import { motion, useReducedMotion } from "motion/react";
import { MonoTag, Reveal, SectionEyebrow } from "./ui";
import {
  AmplifyMark,
  AppSyncMark,
  CloudWatchMark,
  CognitoMark,
  DynamoMark,
  GatewayMark,
  LambdaMark,
  ModelMark,
  ReactMark,
  S3Mark,
  SamMark,
  SecretsMark,
  StrandsMark,
  ViteMark,
} from "./TechLogos";
import type { ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

const TOP_FLOW: { name: string; icon: ReactNode }[] = [
  {
    name: "React + Vite",
    icon: (
      <span className="flex items-center -space-x-1">
        <ReactMark className="h-4 w-4" />
        <ViteMark className="h-3.5 w-3.5 text-gold" />
      </span>
    ),
  },
  { name: "AWS Amplify", icon: <AmplifyMark className="h-4 w-4" /> },
  { name: "Amazon Cognito", icon: <CognitoMark className="h-4 w-4" /> },
  { name: "API Gateway", icon: <GatewayMark className="h-4 w-4" /> },
];

const LAMBDAS = [
  {
    name: "Node Lambda",
    icon: <LambdaMark className="h-4 w-4 text-green" />,
    items: ["Profile", "Holdings", "Goals", "Loans"],
  },
  {
    name: "Finance Lambda",
    icon: <LambdaMark className="h-4 w-4 text-green" />,
    items: ["Portfolio", "FIRE", "Net Worth", "Statements"],
  },
  {
    name: "Agent Lambda",
    icon: <LambdaMark className="h-4 w-4 text-green" />,
    items: ["ARIA", "Async jobs", "Tool orchestration"],
  },
];

const SHARED: { name: string; desc: string; icon: ReactNode }[] = [
  { name: "DynamoDB", desc: "Financial state", icon: <DynamoMark className="h-4 w-4" /> },
  { name: "S3", desc: "Private statement artifacts", icon: <S3Mark className="h-4 w-4" /> },
  { name: "AppSync Events", desc: "Realtime progress", icon: <AppSyncMark className="h-4 w-4" /> },
  { name: "Secrets Manager", desc: "Credentials", icon: <SecretsMark className="h-4 w-4" /> },
  { name: "CloudWatch", desc: "Observability", icon: <CloudWatchMark className="h-4 w-4" /> },
  { name: "AWS SAM", desc: "Infrastructure as code", icon: <SamMark className="h-4 w-4" /> },
];

function FlowArrow({ index, vertical }: { index: number; vertical?: boolean }) {
  const reduced = useReducedMotion();
  return (
    <motion.span
      aria-hidden="true"
      initial={reduced ? false : { opacity: 0, ...(vertical ? { y: -6 } : { x: -6 }) }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.45, delay: 0.35 + index * 0.18, ease: EASE }}
      className="py-0.5 text-ink/40 sm:px-2 sm:py-0"
    >
      {vertical ? "↓" : "→"}
    </motion.span>
  );
}

function TopNode({ node, index }: { node: (typeof TOP_FLOW)[number]; index: number }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay: index * 0.18, ease: EASE }}
      className="flex w-full items-center justify-center gap-2 rounded-full border border-line bg-white/90 px-4 py-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink sm:w-auto sm:px-5"
    >
      <span className="text-green">{node.icon}</span>
      {node.name}
    </motion.div>
  );
}

function FanoutPaths() {
  const reduced = useReducedMotion();
  const paths = [
    "M500 0 C 500 26, 167 26, 167 48",
    "M500 0 L 500 48",
    "M500 0 C 500 26, 833 26, 833 48",
  ];
  return (
    <svg viewBox="0 0 1000 48" preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
      {paths.map((d) => (
        <motion.path
          key={d}
          d={d}
          fill="none"
          stroke="rgba(25,25,22,0.28)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          initial={reduced ? undefined : { pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, delay: 0.95, ease: EASE }}
        />
      ))}
    </svg>
  );
}

function DrawLine({ delay = 0, className }: { delay?: number; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      aria-hidden="true"
      initial={reduced ? false : { scaleY: 0, opacity: 0 }}
      whileInView={{ scaleY: 1, opacity: 1 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay, ease: EASE }}
      style={{ transformOrigin: "top center" }}
      className={className}
    />
  );
}

function LambdaCard({
  lambda,
  index,
  agent,
}: {
  lambda: (typeof LAMBDAS)[number];
  index: number;
  agent?: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay: 1 + index * 0.14, ease: EASE }}
      className="h-full"
    >
      <div className="card-lift flex h-full flex-col rounded-2xl border border-line bg-white/90 p-5">
        <div className="flex items-center gap-2">
          {lambda.icon}
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink">
            {lambda.name}
          </p>
        </div>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {lambda.items.map((item) => (
            <li
              key={item}
              className="rounded-full bg-cream px-2.5 py-1 text-[11px] font-medium text-muted"
            >
              {item}
            </li>
          ))}
        </ul>
        {agent && (
          <div className="mt-4 border-t border-line pt-4">
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: 1.7, ease: EASE }}
              className="flex items-center justify-center gap-2 rounded-xl bg-green px-3 py-2.5 text-center"
            >
              <StrandsMark className="h-4 w-4 text-cream" />
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-cream">
                Strands Agents SDK
              </p>
            </motion.div>
            <DrawLine delay={1.95} className="mx-auto h-4 w-px bg-ink/25" />
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: 2.1, ease: EASE }}
              className="flex items-center justify-center gap-2 rounded-xl border border-line bg-cream px-3 py-2.5 text-center"
            >
              <ModelMark className="h-4 w-4 text-green" />
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink">
                  Model Layer
                </p>
                <p className="text-[10px] text-muted">Provider-configurable</p>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function Architecture() {
  const reduced = useReducedMotion();

  return (
    <section
      id="architecture"
      className="border-t border-line bg-cream2 py-16 lg:py-24"
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal className="max-w-2xl">
          <SectionEyebrow>Architecture</SectionEyebrow>
          <h2 className="font-serif text-[clamp(2.4rem,5vw,3.6rem)] leading-[1.04] text-ink">
            Built like a system.
            <br />
            Not a chatbot wrapper.
          </h2>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted">
            ARIA separates identity, financial computation, persistence and
            agent execution across a serverless AWS architecture.
          </p>
        </Reveal>

        <div className="mt-12">
          {/* top flow */}
          <ol className="flex flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:justify-center sm:gap-0">
            {TOP_FLOW.map((node, i) => (
              <li key={node.name} className="flex flex-col items-center sm:flex-row">
                <TopNode node={node} index={i} />
                {i < TOP_FLOW.length - 1 && (
                  <>
                    <span className="hidden sm:inline">
                      <FlowArrow index={i} />
                    </span>
                    <span className="sm:hidden">
                      <FlowArrow index={i} vertical />
                    </span>
                  </>
                )}
              </li>
            ))}
          </ol>

          {/* fan-out connector (desktop) */}
          <div className="mx-auto hidden h-12 max-w-4xl sm:block" aria-hidden="true">
            <FanoutPaths />
          </div>
          <div className="flex justify-center sm:hidden" aria-hidden="true">
            <DrawLine delay={1} className="my-1.5 h-6 w-px bg-ink/25" />
          </div>

          {/* lambdas */}
          <div className="mx-auto grid max-w-4xl gap-3 sm:grid-cols-3">
            {LAMBDAS.map((l, i) => (
              <LambdaCard
                key={l.name}
                lambda={l}
                index={i}
                agent={l.name === "Agent Lambda"}
              />
            ))}
          </div>

          {/* connector down to shared layer */}
          <div className="flex justify-center" aria-hidden="true">
            <DrawLine delay={1.5} className="my-3 h-8 w-px bg-ink/25" />
          </div>

          {/* shared layer */}
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, delay: 1.6, ease: EASE }}
            className="mx-auto max-w-4xl rounded-2xl border border-line bg-white/70 p-4 sm:p-5"
          >
            <MonoTag className="text-ink/60">Shared platform layer</MonoTag>
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {SHARED.map((s, i) => (
                <motion.div
                  key={s.name}
                  initial={reduced ? false : { opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.45, delay: 1.75 + i * 0.09, ease: EASE }}
                  className="card-lift flex items-start gap-2.5 rounded-xl border border-line bg-cream px-3.5 py-3"
                >
                  <span className="mt-0.5 shrink-0 text-green">{s.icon}</span>
                  <span>
                    <span className="block font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink">
                      {s.name}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                      {s.desc}
                    </span>
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
