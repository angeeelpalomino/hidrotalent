import * as React from "react";
import { cn } from "../../lib/utils";

type TabsContextType = { value: string; onValueChange?: (v: string) => void };
const TabsContext = React.createContext<TabsContextType | null>(null);

export function Tabs({
  value,
  onValueChange,
  children,
  className,
}: {
  value: string;
  onValueChange?: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(className)}>
      <TabsContext.Provider value={{ value, onValueChange }}>{children}</TabsContext.Provider>
    </div>
  );
}

export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("inline-grid rounded-lg bg-slate-100 p-1", className)}>{children}</div>;
}

export function TabsTrigger({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = React.useContext(TabsContext)!;
  const active = ctx.value === value;
  return (
    <button
      type="button"
      onClick={() => ctx.onValueChange?.(value)}
      className={cn(
        "px-3 py-1.5 text-sm rounded-md transition-colors",
        active ? "bg-white text-slate-900 shadow" : "text-slate-600 hover:text-slate-900",
        className
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = React.useContext(TabsContext)!;
  if (ctx.value !== value) return null;
  return <div className={cn(className)}>{children}</div>;
}
