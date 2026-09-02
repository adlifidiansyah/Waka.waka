import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "brand";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink-900 text-white hover:bg-ink-800 focus-visible:ring-ink-900/30",
  secondary:
    "border border-ink-300 bg-white text-ink-800 hover:bg-ink-50 focus-visible:ring-ink-900/20",
  ghost: "text-ink-600 hover:bg-ink-100 hover:text-ink-900 focus-visible:ring-ink-900/20",
  danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600/30",
  // Paints itself with the portal's brand colour.
  brand:
    "bg-[var(--portal-brand)] text-[var(--portal-brand-contrast)] hover:brightness-110 focus-visible:ring-[var(--portal-brand)]/40",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-sm gap-2",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
