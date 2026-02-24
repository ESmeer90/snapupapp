import React from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';

interface CTABannerProps {
  isLoggedIn: boolean;
  onOpenAuth: (mode: 'signup') => void;
  onOpenCreateListing: () => void;
}

const CTABanner: React.FC<CTABannerProps> = ({ isLoggedIn, onOpenAuth, onOpenCreateListing }) => {
  return (
    <section className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 relative overflow-hidden">
      <div className="absolute inset-0 opacity-10">
        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <circle cx="80" cy="20" r="30" fill="white" />
          <circle cx="20" cy="80" r="40" fill="white" />
        </svg>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/15 backdrop-blur-sm rounded-full text-white/90 text-sm mb-6">
          <Sparkles className="w-4 h-4" />
          100% Free to List
        </div>

        <h2 className="text-3xl sm:text-4xl font-black text-white max-w-2xl mx-auto">
          Got something to sell? List it on SnapUp today!
        </h2>
        <p className="text-blue-100 mt-4 max-w-lg mx-auto">
          Reach thousands of buyers across South Africa. It's free, fast, and secure.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          {isLoggedIn ? (
            <button
              onClick={onOpenCreateListing}
              className="px-8 py-4 bg-white text-blue-700 font-bold rounded-xl hover:bg-blue-50 transition-all shadow-xl flex items-center gap-2"
            >
              Start Selling Now
              <ArrowRight className="w-5 h-5" />
            </button>
          ) : (
            <>
              <a
                href="/signup"
                className="px-8 py-4 bg-white text-blue-700 font-bold rounded-xl hover:bg-blue-50 transition-all shadow-xl flex items-center gap-2"
              >
                Create Free Account
                <ArrowRight className="w-5 h-5" />
              </a>
              <p className="text-blue-200 text-sm">No credit card required</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
};

export default CTABanner;
