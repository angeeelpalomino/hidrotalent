import React from "react";
import { Menu } from "lucide-react";

type MobileNavProps = { onOpenSidebar: () => void };

const MobileNav: React.FC<MobileNavProps> = ({ onOpenSidebar }) => {
  return (
    <header className="sticky top-0 z-40 supports-[backdrop-filter]:bg-white/70 bg-white/90 backdrop-blur border-b border-gray-200 lg:hidden">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onOpenSidebar}
            className="p-2 rounded-lg hover:bg-gray-100 ring-1 ring-transparent hover:ring-gray-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5 text-gray-700" />
          </button>
          <img src="/logopaw.jpeg" alt="Logo" className="h-8 w-8 rounded-xl ring-1 ring-gray-200/60" />
          <span className="font-semibold text-gray-900 tracking-tight truncate">
            P.A.W
          </span>
        </div>
      </div>
    </header>
  );
};

export default MobileNav;
