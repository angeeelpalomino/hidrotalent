import React, { useEffect, useState } from "react";
import SidebarDesktop from "../nav/SidebarDesktop";
import MobileNav from "../nav/MobileNav";
import SidebarMobile from "../nav/SidebarMobile";

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [openMobile, setOpenMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const handler = () => setOpenMobile(false);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <MobileNav onOpenSidebar={() => setOpenMobile(true)} />
      <SidebarMobile open={openMobile} onClose={() => setOpenMobile(false)} />
      <div className="flex">
        <SidebarDesktop />
        <main className="flex-1 w-full">
          <div className="container py-4 sm:py-6 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default Layout;