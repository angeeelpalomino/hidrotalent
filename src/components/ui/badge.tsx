import * as React from "react";
import { cn } from "../../lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary";
}
export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const styles = variant === "secondary" ? "bg-slate-100 text-slate-900" : "bg-indigo-600 text-white";
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", styles, className)}
      {...props}
    />
  );
}
