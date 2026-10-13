import { cn } from "@/lib/utils";

/**
 * Global Traders HubX mark — a connected globe with an upward trajectory.
 * Communicates: Global + Trading + Connection + Growth. Original artwork.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={cn("h-9 w-9", className)}
      aria-hidden="true"
      role="img"
    >
      <defs>
        <linearGradient id="gt-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e8c766" />
          <stop offset="50%" stopColor="#d4a72c" />
          <stop offset="100%" stopColor="#a87f1e" />
        </linearGradient>
      </defs>
      <rect
        x="1"
        y="1"
        width="38"
        height="38"
        rx="11"
        fill="#0b1220"
        stroke="url(#gt-gold)"
        strokeWidth="1.5"
      />
      {/* Globe */}
      <circle
        cx="20"
        cy="23"
        r="9"
        fill="none"
        stroke="url(#gt-gold)"
        strokeWidth="1.6"
        opacity="0.55"
      />
      <ellipse
        cx="20"
        cy="23"
        rx="3.8"
        ry="9"
        fill="none"
        stroke="url(#gt-gold)"
        strokeWidth="1.1"
        opacity="0.45"
      />
      {/* Upward trajectory arrow */}
      <path
        d="M20 6 L26.5 13.5 L22.4 13.5 L22.4 21 L17.6 21 L17.6 13.5 L13.5 13.5 Z"
        fill="url(#gt-gold)"
      />
      {/* Connected nodes */}
      <circle cx="10.5" cy="23" r="1.7" fill="#18a66a" />
      <circle cx="29.5" cy="23" r="1.7" fill="#18a66a" />
    </svg>
  );
}

export function Logo({
  className,
  showWordmark = true,
  siteName = "Global Traders HubX",
}: {
  className?: string;
  showWordmark?: boolean;
  siteName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      {showWordmark && (
        <span className="font-display text-base font-bold tracking-tight text-foreground sm:text-lg">
          {siteName}
          <span className="text-brand">.</span>
        </span>
      )}
    </span>
  );
}
