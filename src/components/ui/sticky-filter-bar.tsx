import * as React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface FilterChip {
  key: string;
  label: string;
  count?: number;
}

interface Props {
  search: string;
  onSearch: (v: string) => void;
  placeholder?: string;
  chips?: FilterChip[];
  activeChip?: string;
  onChipChange?: (key: string) => void;
  rightSlot?: React.ReactNode;
  className?: string;
}

export function StickyFilterBar({
  search,
  onSearch,
  placeholder = "Buscar...",
  chips,
  activeChip,
  onChipChange,
  rightSlot,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "sticky top-14 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3",
        "bg-background/85 backdrop-blur-md border-b border-border/60",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={placeholder}
            className="pl-9 h-11 rounded-xl bg-card"
          />
        </div>
        {rightSlot}
      </div>
      {chips && chips.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1">
          {chips.map((c) => {
            const active = activeChip === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => onChipChange?.(c.key)}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 h-8 text-xs font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-card"
                    : "bg-card text-foreground/70 border border-border hover:bg-muted",
                )}
              >
                {c.label}
                {typeof c.count === "number" && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10px] font-bold",
                      active ? "bg-primary-foreground/20" : "bg-muted",
                    )}
                  >
                    {c.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
