import React, { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { CommandPalette } from './CommandPalette';
import { AddEmployeeDrawer } from './AddEmployeeDrawer';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

export const AppLayout: React.FC = () => {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.focus();
  }, [pathname]);

  return (
    <div className="min-h-screen bg-[#FBFBFE] text-[#0E0E12]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-[#5F57C4] focus:px-4 focus:py-2 focus:text-xs focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>
      <div className="mx-auto flex min-h-screen w-full max-w-[1680px] gap-5 p-4 sm:p-5">
        <Sidebar />
        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          className="min-w-0 flex-1 space-y-5"
        >
          <TopBar />
          <Outlet />
        </main>
      </div>
      <CommandPalette />
      <AddEmployeeDrawer />
    </div>
  );
};

export default AppLayout;
