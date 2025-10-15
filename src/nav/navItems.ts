import type React from "react";
import { Home, ShoppingBag, TrendingUp, Receipt } from "lucide-react";

export type Item = { label: string; to: string; icon: React.ComponentType<any> };

export const items: Item[] = [
  { label: "Inicio", to: "/", icon: Home },
 // { label: "Productos", to: "/productos", icon: ShoppingBag },
  //{ label: "Ventas", to: "/ventas", icon: TrendingUp },
 // { label: "Gastos", to: "/gastos", icon: Receipt },
];
