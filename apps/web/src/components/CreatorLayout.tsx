'use client';

import React from 'react';
import { useSidebar } from './SidebarContext';
import { CreatorSidebar } from '@/features/stream/components/CreatorSidebar';
import { cn } from '@/lib/utils';

interface Props {
  children: React.ReactNode;
}

export function CreatorLayout({ children }: Props): React.ReactElement {
  const { isCollapsed, isOpen, setOpen } = useSidebar();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity duration-300"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar navigation */}
      <CreatorSidebar
        className={cn(
          'fixed inset-y-0 left-0 z-50 transition-all duration-300 ease-in-out lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          isCollapsed ? 'lg:w-[72px]' : 'lg:w-60'
        )}
      />

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col transition-all duration-300">
        {children}
      </div>
    </div>
  );
}
