import { GITHUB_URL, LOGIN_URL } from "../lib/site";
import { scrollToId } from "../lib/scroll";
import { AriaMark, GhostButton, PrimaryButton, Reveal } from "./ui";
import { SiteLink } from "./SiteLink";

const FOOTER_LINKS: { label: string; action: () => void }[] = [
  { label: "Product", action: () => scrollToId("product") },
  {
    label: "FIRE",
    action: () => {
      window.dispatchEvent(new CustomEvent("aria:tab", { detail: "fire" }));
      scrollToId("product");
    },
  },
  { label: "How it works", action: () => scrollToId("thinking") },
  { label: "Architecture", action: () => scrollToId("architecture") },
];

function CurvesBackdrop() {
  return (
    <svg
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] w-full"
      viewBox="0 0 1440 360"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M0 300 C 240 260 420 180 720 170 C 1020 160 1200 100 1440 60 L 1440 360 L 0 360 Z"
        fill="#DCE7DE"
        opacity="0.8"
      />
      <path
        d="M0 330 C 280 310 480 250 760 244 C 1040 238 1240 190 1440 160 L 1440 360 L 0 360 Z"
        fill="#E8BCA1"
        opacity="0.4"
      />
      <path
        d="M0 350 C 320 342 560 306 820 302 C 1080 298 1280 268 1440 250 L 1440 360 L 0 360 Z"
        fill="#A9C0CA"
        opacity="0.4"
      />
      <path
        d="M0 300 C 240 260 420 180 720 170 C 1020 160 1200 100 1440 60"
        fill="none"
        stroke="#0B6B50"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function Finale() {
  return (
    <section className="relative overflow-hidden border-t border-line bg-cream">
      <CurvesBackdrop />

      <div className="relative mx-auto max-w-7xl px-5 pb-10 pt-20 sm:px-8 lg:pt-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-serif text-[clamp(2.6rem,6vw,4.4rem)] leading-[1.02] text-ink">
            Ask better questions
            <br />
            about your <span className="italic text-green">money</span>.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-[16px] leading-relaxed text-muted">
            Bring the context together.
            <br />
            Let the numbers answer first.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <PrimaryButton href={LOGIN_URL}>
              Open ARIA
              <span
                aria-hidden="true"
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              >
                →
              </span>
            </PrimaryButton>
            <GhostButton href={GITHUB_URL}>
              View source{" "}
              <span
                aria-hidden="true"
                className="transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              >
                ↗
              </span>
            </GhostButton>
          </div>
        </Reveal>

        {/* footer */}
        <footer className="mt-16 rounded-t-[28px] border border-b-0 border-line bg-cream/80 px-6 pb-8 pt-8 backdrop-blur-sm sm:px-10">
          <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
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

            <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
              {FOOTER_LINKS.map((link) => (
                <button
                  key={link.label}
                  type="button"
                  onClick={link.action}
                  className="text-sm font-medium text-muted transition-colors hover:text-ink"
                >
                  {link.label}
                </button>
              ))}
              <SiteLink
                href={GITHUB_URL}
                className="text-sm font-medium text-muted transition-colors hover:text-ink"
              >
                GitHub
              </SiteLink>
              <SiteLink
                href={LOGIN_URL}
                className="text-sm font-medium text-muted transition-colors hover:text-ink"
              >
                Login
              </SiteLink>
            </nav>
          </div>

          <div className="mt-8 flex flex-col gap-4 border-t border-line pt-6 md:flex-row md:items-center md:justify-between">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              Built for WeMakeDevs × AWS First Commit
            </p>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-ink">
              Numbers first. AI second.
            </p>
          </div>

          <p className="mt-6 max-w-3xl text-xs leading-relaxed text-muted/80">
            ARIA is an educational personal finance intelligence platform. It
            is not presented as a SEBI-registered investment adviser and does
            not perform autonomous trading.
          </p>
        </footer>
      </div>
    </section>
  );
}
