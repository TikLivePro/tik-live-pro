'use client';

import { HeroPreview } from '@/features/landing';
import { TestimonialCard } from './TestimonialCard';

export function AuthBrandPanel(): React.JSX.Element {
  return (
    <aside className="relative hidden w-[55%] flex-col overflow-hidden border-l border-border/60 bg-surface-1 lg:flex">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="bg-grid-dots absolute inset-0" />
        <div className="animate-orb-drift absolute -bottom-40 -right-32 h-[480px] w-[480px] rounded-full bg-brand/20 blur-[130px]" />
        <div className="animate-orb-drift absolute -top-32 -left-24 h-[380px] w-[380px] rounded-full bg-brand-end/10 blur-[120px] [animation-delay:-7s]" />
      </div>

      <div className="relative flex justify-center pt-12">
        <span className="bg-gradient-brand bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
          TikLivePro
        </span>
      </div>

      <div className="relative flex flex-1 items-center justify-center px-12 pb-24">
        <div className="relative w-full max-w-2xl">
          <HeroPreview className="mt-0" />
          <TestimonialCard className="animate-fade-up absolute -bottom-14 right-0 xl:-right-4 [animation-delay:0.6s]" />
        </div>
      </div>
    </aside>
  );
}
