/**
 * Copy-paste UI patterns from the marketing site.
 * All classes resolve via the tokens in styles.css.
 */
import { Logo } from "@/components/Logo";

/* -------------------- Primary CTA button (gradient) -------------------- */
export function PrimaryCTA() {
  return (
    <a
      href="/auth/signup"
      className="inline-flex items-center justify-center rounded-md bg-gradient-brand px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 ring-glow"
    >
      Get started free
    </a>
  );
}

/* -------------------- Secondary / outline button -------------------- */
export function SecondaryCTA() {
  return (
    <a
      href="/docs"
      className="inline-flex items-center justify-center rounded-md border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
    >
      Learn more
    </a>
  );
}

/* -------------------- Brand-accent heading -------------------- */
export function BrandHeading() {
  return (
    <h1 className="font-display text-4xl font-semibold md:text-6xl">
      Trade with <span className="text-gradient-brand">clarity</span>.
    </h1>
  );
}

/* -------------------- Sticky frosted header -------------------- */
export function PortalHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 glass">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
        <Logo size={36} />
        <nav className="flex items-center gap-2">
          <a className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground" href="/dashboard">Dashboard</a>
          <a className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground" href="/journal">Journal</a>
          <a className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground" href="/scanners">Scanners</a>
        </nav>
      </div>
    </header>
  );
}

/* -------------------- Dashboard stat card -------------------- */
export function StatCard({ label, value, delta }: { label: string; value: string; delta: number }) {
  const up = delta >= 0;
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold tabular">{value}</p>
      <p className={`mt-1 text-sm font-medium tabular ${up ? "text-bull" : "text-bear"}`}>
        {up ? "▲" : "▼"} {Math.abs(delta)}%
      </p>
    </div>
  );
}

/* -------------------- Hero CTA card with radial fade -------------------- */
export function HeroCTACard() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-10 text-center md:p-14">
      <div className="pointer-events-none absolute inset-0 bg-radial-fade" />
      <div className="relative">
        <h2 className="font-display text-2xl font-semibold md:text-4xl">
          Ready to <span className="text-gradient-brand">level up</span>?
        </h2>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PrimaryCTA />
          <SecondaryCTA />
        </div>
      </div>
    </section>
  );
}

/* -------------------- Bull / Bear chip -------------------- */
export function DirectionChip({ direction }: { direction: "bull" | "bear" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        direction === "bull"
          ? "bg-[color-mix(in_oklab,var(--bull)_15%,transparent)] text-bull"
          : "bg-[color-mix(in_oklab,var(--bear)_15%,transparent)] text-bear"
      }`}
    >
      {direction === "bull" ? "Bullish" : "Bearish"}
    </span>
  );
}
