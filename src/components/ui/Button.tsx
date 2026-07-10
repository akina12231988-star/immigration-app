import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "seal" | "ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-brand text-brand-foreground hover:bg-brand-strong active:scale-[0.98]",
  secondary:
    "bg-surface text-foreground border border-border hover:bg-background active:scale-[0.98]",
  seal: "bg-seal text-seal-foreground hover:opacity-90 active:scale-[0.98]",
  ghost: "bg-transparent text-brand hover:bg-brand/10 active:scale-[0.98]",
};

const BASE_CLASSES =
  "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-base font-bold transition min-h-[52px] disabled:opacity-40 disabled:pointer-events-none";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
  icon?: ReactNode;
}

// 片手操作を想定し、最小タップ高さ52pxを確保した大きめボタン
export function Button({
  variant = "primary",
  fullWidth = false,
  icon,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${
        fullWidth ? "w-full" : ""
      } ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

interface LinkButtonProps {
  href: string;
  variant?: Variant;
  fullWidth?: boolean;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function LinkButton({
  href,
  variant = "primary",
  fullWidth = false,
  icon,
  className = "",
  children,
}: LinkButtonProps) {
  return (
    <Link
      href={href}
      className={`${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${
        fullWidth ? "w-full" : ""
      } ${className}`}
    >
      {icon}
      {children}
    </Link>
  );
}
