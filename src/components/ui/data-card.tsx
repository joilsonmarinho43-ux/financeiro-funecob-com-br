import * as React from "react";
import { cn } from "@/lib/utils";

interface Props extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  pill?: React.ReactNode;
  amount?: React.ReactNode;
  amountTone?: "default" | "success" | "danger" | "warning";
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  /** Left accent bar color: success | warning | danger | info | none */
  accent?: "success" | "warning" | "danger" | "info" | "none";
}

const accentBg: Record<NonNullable<Props["accent"]>, string> = {
  success: "bg-success-soft border-l-success",
  warning: "bg-warning-soft border-l-warning",
  danger: "bg-danger-soft border-l-danger",
  info: "bg-info-soft border-l-info",
  none: "bg-card border-l-transparent",
};

const amountColor: Record<NonNullable<Props["amountTone"]>, string> = {
  default: "text-foreground",
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
};

export function DataCard({
  title,
  subtitle,
  pill,
  amount,
  amountTone = "default",
  meta,
  actions,
  accent = "none",
  className,
  ...rest
}: Props) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 border-l-4 shadow-card",
        accentBg[accent],
        "p-3.5",
        className,
      )}
      {...rest}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-foreground truncate">{title}</p>
            {pill}
          </div>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground truncate">{subtitle}</p>}
          {meta && <div className="mt-2 text-xs text-muted-foreground">{meta}</div>}
        </div>
        {amount !== undefined && (
          <div className={cn("text-right shrink-0 text-base font-bold tabular-nums", amountColor[amountTone])}>
            {amount}
          </div>
        )}
      </div>
      {actions && <div className="mt-3 flex items-center gap-1 flex-wrap">{actions}</div>}
    </div>
  );
}
