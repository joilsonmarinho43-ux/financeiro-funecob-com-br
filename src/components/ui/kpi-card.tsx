import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  label: string;
  value: React.ReactNode;
  icon?: React.ElementType;
  tone?: "primary" | "success" | "warning" | "danger" | "info" | "neutral";
  hint?: React.ReactNode;
  className?: string;
}

const toneBg: Record<NonNullable<Props["tone"]>, string> = {
  primary: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-neutral-soft text-foreground/70",
};

export function KpiCard({ label, value, icon: Icon, tone = "primary", hint, className }: Props) {
  return (
    <Card className={cn("border-0 shadow-card rounded-2xl", className)}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="mt-2 text-financial text-foreground truncate">{value}</p>
            {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
          </div>
          {Icon && (
            <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center shrink-0", toneBg[tone])}>
              <Icon className="h-5 w-5" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
