import * as React from "react";
import { cn } from "@/lib/utils";

export const badgeVariants = {
  default: "bg-elevated text-muted border-border",
  brand: "bg-brand/12 text-brand border-brand/30",
  emerald: "bg-emerald/12 text-emerald-bright border-emerald/30",
  success: "bg-emerald/12 text-emerald-bright border-emerald/30",
  warning: "bg-warning/12 text-warning border-warning/30",
  danger: "bg-danger/12 text-danger border-danger/30",
  outline: "bg-transparent text-muted border-border",
} as const;

export type BadgeVariant = keyof typeof badgeVariants;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        badgeVariants[variant],
        className,
      )}
      {...props}
    />
  );
}
