import React from 'react';
import { Search, Plus, TrendingUp, Shield, Truck } from 'lucide-react';

interface HeroProps {
  onSearch: (query: string) => void;
  onOpenAuth: (mode: 'signup') => void;
  isLoggedIn: boolean;
  onOpenCreateListing?: () => void;
}

const Hero: React.FC<HeroProps> = ({ onSearch, onOpenAuth, isLoggedIn, onOpenCreateListing }) => {
  const [query, setQuery] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };

  const quickSearches = ['iPhone', 'PlayStation', 'Laptop', 'Furniture', 'Toyota', 'Samsung'];

  return (
    <section className="bg-gradient-to-r from-blue-600 to-blue-700 relative overflow-hidden">
      {/* Subtle background decoration */}
      <div className="absolute top-0 right-0 w-72 h-72 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Left: Headline + Search */}
          <div className="flex-1 max-w-2xl">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white leading-tight">
              Buy & Sell{' '}
              <span className="text-yellow-300">Anything</span>{' '}
              Locally
            </h1>

            {/* Search Form */}
            <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search for anything..."
                  className="w-full pl-11 pr-4 py-3 bg-white rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-yellow-300 outline-none text-sm shadow-lg"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-all shadow-lg text-sm"
              >
                Search
              </button>
            </form>

            {/* Quick Searches */}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="text-blue-200 text-xs">Trending:</span>
              {quickSearches.map((term) => (
                <button
                  key={term}
                  onClick={() => onSearch(term)}
                  className="px-2.5 py-0.5 bg-white/10 hover:bg-white/20 text-white text-xs rounded-full transition-all"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>

          {/* Right: CTA Button */}
          <div className="flex flex-col items-start lg:items-end gap-3">
            {isLoggedIn ? (
              <button
                onClick={onOpenCreateListing}
                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-blue-700 font-bold rounded-xl hover:bg-blue-50 transition-all shadow-xl text-sm"
              >
                <Plus className="w-5 h-5" />
                Post an Item for Sale
              </button>
            ) : (
              <a
                href="/signup"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-blue-700 font-bold rounded-xl hover:bg-blue-50 transition-all shadow-xl text-sm"
              >
                <Plus className="w-5 h-5" />
                Start Selling Free
              </a>
            )}

            {/* Trust badges - compact */}
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-1.5 text-white/80">
                <Shield className="w-3.5 h-3.5 text-green-300" />
                <span className="text-[11px] font-medium">Buyer Protection</span>
              </div>
              <div className="flex items-center gap-1.5 text-white/80">
                <Truck className="w-3.5 h-3.5 text-cyan-300" />
                <span className="text-[11px] font-medium">Nationwide Delivery</span>
              </div>
              <div className="flex items-center gap-1.5 text-white/80">
                <TrendingUp className="w-3.5 h-3.5 text-amber-300" />
                <span className="text-[11px] font-medium">100K+ Listings</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
