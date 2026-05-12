import * as React from "react";
import { Eye, EyeOff, Copy, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  value?: string;
  defaultReveal?: boolean;
  copyable?: boolean;
  containerClassName?: string;
}

export function SecretField({
  value = "",
  defaultReveal = false,
  copyable = true,
  containerClassName,
  className,
  ...rest
}: Props) {
  const [reveal, setReveal] = React.useState(defaultReveal);
  const [copied, setCopied] = React.useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast({ title: "Copiado!" });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  return (
    <div className={cn("relative", containerClassName)}>
      <Input
        type={reveal ? "text" : "password"}
        value={value}
        className={cn("pr-20 font-mono text-sm", className)}
        {...rest}
      />
      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => setReveal((r) => !r)}
          aria-label={reveal ? "Ocultar" : "Revelar"}
        >
          {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
        {copyable && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={handleCopy}
            aria-label="Copiar"
          >
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}
