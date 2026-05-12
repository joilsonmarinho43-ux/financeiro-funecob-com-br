import * as React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ElementType;
  label?: string;
  extended?: boolean;
}

export const Fab = React.forwardRef<HTMLButtonElement, Props>(
  ({ icon: Icon = Plus, label, extended, className, children, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label || "Nova ação"}
        className={cn(
          "fixed right-4 z-40 bottom-[calc(1rem+env(safe-area-inset-bottom))]",
          "bg-primary text-primary-foreground shadow-fab active:scale-95 transition-transform",
          "flex items-center justify-center gap-2",
          extended ? "h-14 px-5 rounded-full text-sm font-semibold" : "h-14 w-14 rounded-full",
          "md:bottom-6 md:right-6",
          className,
        )}
        {...rest}
      >
        <Icon className="h-6 w-6" />
        {extended && <span>{label}</span>}
        {children}
      </button>
    );
  },
);
Fab.displayName = "Fab";
