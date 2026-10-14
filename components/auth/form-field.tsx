"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextFieldProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, hint, className, id, name, ...props }, ref) => {
    const inputId = id ?? name;
    return (
      <label htmlFor={inputId} className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <input
          ref={ref}
          id={inputId}
          name={name}
          className={cn(
            "h-11 w-full rounded-xl border border-border bg-elevated px-3.5 text-sm text-foreground",
            "placeholder:text-faint transition-colors",
            "focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/25",
            "disabled:opacity-50",
            className,
          )}
          {...props}
        />
        {hint ? <span className="text-xs text-faint">{hint}</span> : null}
      </label>
    );
  },
);
TextField.displayName = "TextField";

export interface TextAreaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
}

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, hint, className, id, name, ...props }, ref) => {
    const inputId = id ?? name;
    return (
      <label htmlFor={inputId} className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <textarea
          ref={ref}
          id={inputId}
          name={name}
          className={cn(
            "w-full rounded-xl border border-border bg-elevated px-3.5 py-3 text-sm text-foreground",
            "placeholder:text-faint transition-colors resize-y",
            "focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/25",
            "disabled:opacity-50",
            className,
          )}
          {...props}
        />
        {hint ? <span className="text-xs text-faint">{hint}</span> : null}
      </label>
    );
  },
);
TextArea.displayName = "TextArea";

/** Inline error banner shared by every auth form. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
    >
      {message}
    </div>
  );
}

/** Inline success banner (verify / reset confirmations). */
export function FormNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="rounded-xl border border-emerald/40 bg-emerald/10 px-3.5 py-2.5 text-sm text-emerald-bright"
    >
      {message}
    </div>
  );
}
