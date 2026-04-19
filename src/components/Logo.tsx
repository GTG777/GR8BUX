import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  /** Icon-only mode (no wordmark) */
  iconOnly?: boolean;
  /** Pixel size of the icon mark */
  size?: number;
}

function BrandMark({ size }: { size: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={size}
      height={size}
      className="block shrink-0 text-foreground"
      style={{ width: size, height: size }}
      role="img"
      aria-label="GR8BUX Analysis"
    >
      <defs>
        <linearGradient id="gr8bux-brand-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22C55E" />
          <stop offset="100%" stopColor="#2563EB" />
        </linearGradient>
        <linearGradient id="gr8bux-arrow-gradient" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#22C55E" />
          <stop offset="100%" stopColor="#16A34A" />
        </linearGradient>
        <path id="gr8bux-arc-top" d="M 40,128 A 88,88 0 0 1 216,128" fill="none" />
        <path id="gr8bux-arc-bottom" d="M 44,128 A 84,84 0 0 0 212,128" fill="none" />
      </defs>

      {/* Double-ring border */}
      <circle cx="128" cy="128" r="122" fill="none" stroke="url(#gr8bux-brand-gradient)" strokeWidth="3" />
      <circle cx="128" cy="128" r="114" fill="none" stroke="url(#gr8bux-brand-gradient)" strokeWidth="1.5" opacity="0.55" />

      {/* Arched wordmark */}
      <text fontFamily="'Space Grotesk', system-ui, sans-serif" fontWeight="700" fontSize="22" letterSpacing="3" fill="currentColor">
        <textPath href="#gr8bux-arc-top" startOffset="50%" textAnchor="middle">GR8BUX</textPath>
      </text>
      <text fontFamily="'Space Grotesk', system-ui, sans-serif" fontWeight="500" fontSize="14" letterSpacing="6" fill="currentColor" opacity="0.85">
        <textPath href="#gr8bux-arc-bottom" startOffset="50%" textAnchor="middle">ANALYSIS</textPath>
      </text>

      {/* Candlesticks */}
      <g stroke="url(#gr8bux-brand-gradient)" strokeLinecap="round">
        <line x1="92" y1="115" x2="92" y2="165" strokeWidth="2.5" />
        <rect x="84" y="125" width="16" height="32" rx="2.5" fill="url(#gr8bux-brand-gradient)" stroke="none" />
        <line x1="128" y1="92" x2="128" y2="172" strokeWidth="2.5" />
        <rect x="119" y="100" width="18" height="62" rx="2.5" fill="url(#gr8bux-brand-gradient)" stroke="none" />
        <line x1="164" y1="105" x2="164" y2="160" strokeWidth="2.5" />
        <rect x="156" y="115" width="16" height="38" rx="2.5" fill="url(#gr8bux-brand-gradient)" stroke="none" />
      </g>

      {/* Bullish arrow */}
      <g>
        <line x1="68" y1="170" x2="180" y2="90" stroke="url(#gr8bux-arrow-gradient)" strokeWidth="9" strokeLinecap="round" />
        <polygon points="186,86 176.19,110.17 159.95,87.35" fill="url(#gr8bux-arrow-gradient)" />
      </g>
    </svg>
  );
}

export function Logo({ className, iconOnly = false, size = 32 }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark size={size} />
      {!iconOnly && (
        <span
          className="font-display text-[1.25rem] font-bold leading-none tracking-tight text-foreground"
          style={{ letterSpacing: "-0.02em" }}
        >
          GR<span className="text-gradient-brand">8</span>BUX
        </span>
      )}
    </span>
  );
}
