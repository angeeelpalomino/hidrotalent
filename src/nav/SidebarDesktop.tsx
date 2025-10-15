import React, { useEffect, useState } from "react";
import {
  Home as HomeIcon,
  ReceiptText,
  ArrowLeftRight,
  Boxes,
  BarChart3, // Icono para Estadísticas
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { NavLink } from "react-router-dom";

type Item = { label: string; to: string; icon: React.ComponentType<any> };

export const items: Item[] = [
  { label: "Inicio", to: "/", icon: HomeIcon },
  { label: "Ventas", to: "/ventas", icon: ReceiptText },
  { label: "Transacciones", to: "/transacciones", icon: ArrowLeftRight },
  { label: "Inventario", to: "/Inventario", icon: Boxes },
  { label: "Estadísticas", to: "/estadisticas", icon: BarChart3 }, // NUEVA OPCIÓN
];

const SidebarDesktop: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("sidebar:collapsed");
      if (saved) setCollapsed(saved === "1");
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("sidebar:collapsed", collapsed ? "1" : "0");
    } catch {}
  }, [collapsed]);

  return (
    <aside className="hidden lg:flex lg:flex-col lg:shrink-0">
      <div
        className={[
          "fixed top-3 bottom-3 left-3 z-40",
          "bg-white border border-gray-200",
          "rounded-2xl shadow-sm",
          "transition-[width] duration-300 ease-out",
          collapsed ? "w-16" : "w-64",
          "flex flex-col overflow-hidden",
        ].join(" ")}
      >
        <div className="h-14 flex items-center justify-between px-3 border-b border-gray-200">
          <div className="flex items-center gap-2 overflow-hidden">
            <img
              src="/logopaw.jpeg"
              alt="Logo"
              className="h-8 w-8 rounded-lg ring-1 ring-gray-200/60"
            />
            {!collapsed && (
              <span className="text-sm font-semibold tracking-tight text-gray-900 truncate">
                PAW
              </span>
            )}
          </div>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="p-1.5 rounded-md hover:bg-gray-100 ring-1 ring-transparent hover:ring-gray-200/70"
            aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
            title={collapsed ? "Expandir" : "Colapsar"}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4 text-gray-700" />
            ) : (
              <ChevronLeft className="h-4 w-4 text-gray-700" />
            )}
          </button>
        </div>

        <nav className="px-2 py-2 flex-1">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.label}
                to={item.to}
                className={({ isActive }) =>
                  [
                    "group flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium",
                    "text-gray-700",
                    "hover:bg-gray-100",
                    "ring-1 ring-transparent hover:ring-gray-200/70",
                    isActive ? "bg-gray-100" : "",
                  ].join(" ")
                }
                title={collapsed ? item.label : undefined}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 ring-1 ring-gray-200/70 group-hover:bg-white">
                  <Icon className="h-4 w-4 text-gray-700" />
                </span>
                {!collapsed && (
                  <span className="truncate text-gray-900">{item.label}</span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className={collapsed ? "w-20" : "w-72"} />
    </aside>
  );
};

export default SidebarDesktop;