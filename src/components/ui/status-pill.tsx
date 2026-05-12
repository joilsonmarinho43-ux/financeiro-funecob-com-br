import * as React from "react";
import { cn } from "@/lib/utils";

export type StatusVariant =
  | "paid"
  | "pending"
  | "overdue"
  | "canceled"
  | "info"
  | "neutral";

const styles: Record<StatusVariant, string> = {
  paid: "bg-success-soft text-success",
  pending: "bg-warning-soft text-warning",
  overdue: "bg-danger-soft text-danger",
  canceled: "bg-muted text-muted-foreground",
  info: "bg-info-soft text-info",
  neutral: "bg-neutral-soft text-foreground/70",
};

interface Props extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: StatusVariant;
  dot?: boolean;
}

export function StatusPill({ variant = "neutral", dot = true, className, children, ...rest }: Props) {
  const dotColor: Record<StatusVariant, string> = {
    paid: "bg-success",
    pending: "bg-warning",
    overdue: "bg-danger",
    canceled: "bg-muted-foreground",
    info: "bg-info",
    neutral: "bg-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none",
        styles[variant],
        className,
      )}
      {...rest}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotColor[variant])} />}
      {children}
    </span>
  );
}
