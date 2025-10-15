import * as React from "react";
import { cn } from "../../lib/utils";

/**
 * Tooltips súper simples sin portal/aria avanzada.
 * Estructura:
 * <Tooltip>
 *   <TooltipTrigger>...</TooltipTrigger>
 *   <TooltipContent>Texto</TooltipContent>
 * </Tooltip>
 */
export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function Tooltip({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("relative inline-block group", className)}>{children}</div>;
}

export function TooltipTrigger({ children }: { children: React.ReactNode; asChild?: boolean }) {
  return <>{children}</>;
}

export function TooltipContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-full z-50 -translate-x-1/2 translate-y-2 whitespace-nowrap rounded-md border bg-slate-900 px-2 py-1 text-xs text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100">
      {children}
    </div>
  );
}
