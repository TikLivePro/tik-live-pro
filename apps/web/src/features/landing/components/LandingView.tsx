'use client';

import React from 'react';
import { LandingNav } from './LandingNav';
import { HeroSection } from './HeroSection';
import { FeaturesSection } from './FeaturesSection';
import { HowItWorksSection } from './HowItWorksSection';
import { PricingSection } from './PricingSection';
import { FinalCtaSection } from './FinalCtaSection';
import { LandingFooter } from './LandingFooter';

export function LandingView(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main>
        <HeroSection />
        <FeaturesSection />
        <HowItWorksSection />
        <PricingSection />
        <FinalCtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
