import { useEffect } from "react";
import { useOrganization } from "@/hooks/useOrganization";

function hexToHSL(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function useOrgTheme() {
  const { organization } = useOrganization();

  useEffect(() => {
    const root = document.documentElement;
    const primaryColor = (organization as any)?.primary_color;
    const secondaryColor = (organization as any)?.secondary_color;

    if (primaryColor) {
      const hsl = hexToHSL(primaryColor);
      if (hsl) {
        root.style.setProperty("--primary", hsl);
        root.style.setProperty("--ring", hsl);
        root.style.setProperty("--sidebar-primary", hsl);
        root.style.setProperty("--sidebar-ring", hsl);
        root.style.setProperty("--chart-1", hsl);
      }
    }

    if (secondaryColor) {
      const hsl = hexToHSL(secondaryColor);
      if (hsl) {
        root.style.setProperty("--sidebar-background", hsl);

        // Parse to derive darker/lighter variants
        const parts = hsl.split(" ");
        const hue = parseInt(parts[0]);
        const sat = parseInt(parts[1]);
        const light = parseInt(parts[2]);
        
        root.style.setProperty("--sidebar-accent", `${hue} ${sat}% ${Math.min(light + 8, 95)}%`);
        root.style.setProperty("--sidebar-border", `${hue} ${Math.max(sat - 5, 0)}% ${Math.min(light + 12, 90)}%`);
      }
    }

    return () => {
      // Cleanup: remove inline styles so defaults apply
      root.style.removeProperty("--primary");
      root.style.removeProperty("--ring");
      root.style.removeProperty("--sidebar-primary");
      root.style.removeProperty("--sidebar-ring");
      root.style.removeProperty("--chart-1");
      root.style.removeProperty("--sidebar-background");
      root.style.removeProperty("--sidebar-accent");
      root.style.removeProperty("--sidebar-border");
    };
  }, [organization]);
}
