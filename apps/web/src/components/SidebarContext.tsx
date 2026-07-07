'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface SidebarContextType {
  isCollapsed: boolean;
  isOpen: boolean;
  toggleCollapse: () => void;
  toggleOpen: () => void;
  setCollapsed: (val: boolean) => void;
  setOpen: (val: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setCollapsedState] = useState(false);
  const [isOpen, setOpenState] = useState(false);

  // Hydrate collapsed state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('sidebar-collapsed');
    if (stored === 'true') {
      setCollapsedState(true);
    }
  }, []);

  const toggleCollapse = () => {
    setCollapsedState((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  };

  const toggleOpen = () => {
    setOpenState((prev) => !prev);
  };

  const setCollapsed = (val: boolean) => {
    setCollapsedState(val);
    localStorage.setItem('sidebar-collapsed', String(val));
  };

  const setOpen = (val: boolean) => {
    setOpenState(val);
  };

  return (
    <SidebarContext.Provider
      value={{
        isCollapsed,
        isOpen,
        toggleCollapse,
        toggleOpen,
        setCollapsed,
        setOpen,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}
