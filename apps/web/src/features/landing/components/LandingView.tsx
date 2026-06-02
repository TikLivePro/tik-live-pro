'use client';

import React from 'react';
import { LandingNav } from './LandingNav';
import { HeroSection } from './HeroSection';
import { FeaturesSection } from './FeaturesSection';
import { PricingSection } from './PricingSection';
import { LandingFooter } from './LandingFooter';

export function LandingView(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main>
        <HeroSection />
        <FeaturesSection />
        <PricingSection />
      </main>
      <LandingFooter />
    </div>
  );
}
