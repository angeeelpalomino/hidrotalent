import React from "react";
import { X } from "lucide-react";
import { NavLink } from "react-router-dom";
import { items } from "./SidebarDesktop";

const linkBase =
  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition text-gray-700 hover:bg-gray-100";

const SidebarMobile: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  return (
    <>
      <div
        className={`fixed inset-0 bg-black/40 transition-opacity lg:hidden ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-gray-200 transform transition-transform duration-300 lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Menú móvil"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <img src="/logopaw.jpeg" alt="Logo" className="h-8 w-8 rounded" />
            <span className="font-semibold text-gray-900">Menú</span>
          </div>
        </div>

        <nav className="p-3 space-y-1">
          {items.map((item) => {
            const Icon = item.icon as any;
            return (
              <NavLink
                key={item.label}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) => `${linkBase} ${isActive ? "bg-gray-100" : ""}`}
              >
                <Icon className="h-5 w-5 text-gray-700" />
                <span className="text-gray-900">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-2 rounded-md hover:bg-gray-100"
          aria-label="Cerrar menú"
        >
          <X className="h-5 w-5 text-gray-700" />
        </button>
      </aside>
    </>
  );
};

export default SidebarMobile;
