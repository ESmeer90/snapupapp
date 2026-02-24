import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2 as Loader2Icon } from 'lucide-react';
import type { Listing, ListingCondition, Category } from '@/types';

import { SA_PROVINCES, CONDITION_LABELS } from '@/types';
import ListingCard from './ListingCard';
import { CategoryChips } from './CategoryGrid';
import MapView from './MapView';
import { formatZAR, createSavedSearch } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import {
  SlidersHorizontal, ArrowUpDown, MapPin, Package, RefreshCw,
  AlertTriangle, Search, X, ChevronDown, ChevronUp, DollarSign,
  Sparkles, Tag, Filter, Lightbulb, Map as MapIcon, Grid3X3, Eye,
  Bell, BellRing, Bookmark, Loader2
} from 'lucide-react';


interface ListingsGridProps {
  listings: Listing[];
  loading: boolean;
  favorites: string[];
  onToggleFavorite: (listingId: string) => void;
  onViewDetail: (listing: Listing) => void;
  isLoggedIn: boolean;
  selectedProvince: string;
  onProvinceChange: (province: string) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
  searchQuery: string;
  selectedCategory: string | null;
  categoryName: string;
  onCategoryChange: (cat: string | null) => void;
  error?: string | null;
  onRetry?: () => void;
  // Filter props
  minPrice: string;
  maxPrice: string;
  onMinPriceChange: (val: string) => void;
  onMaxPriceChange: (val: string) => void;
  selectedCondition: string;
  onConditionChange: (val: string) => void;
  onClearAllFilters: () => void;
  onSearchChange: (val: string) => void;
  // Pagination props
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  // Categories for inline chips
  categories?: Category[];
}

const CONDITIONS: { key: ListingCondition; label: string }[] = [
  { key: 'new', label: 'Brand New' },
  { key: 'like_new', label: 'Like New' },
  { key: 'good', label: 'Good' },
  { key: 'fair', label: 'Fair' },
  { key: 'poor', label: 'Poor' },
];

const ListingsGrid: React.FC<ListingsGridProps> = ({
  listings, loading, favorites, onToggleFavorite, onViewDetail,
  isLoggedIn, selectedProvince, onProvinceChange, sortBy, onSortChange,
  searchQuery, selectedCategory, categoryName, onCategoryChange,
  error, onRetry,
  minPrice, maxPrice, onMinPriceChange, onMaxPriceChange,
  selectedCondition, onConditionChange, onClearAllFilters, onSearchChange,
  hasMore, loadingMore, onLoadMore,
  categories = []
}) => {

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showMapView, setShowMapView] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [savingSearch, setSavingSearch] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState('');
  const [saveEmailAlerts, setSaveEmailAlerts] = useState(true);

  const handleSaveSearch = async () => {
    if (!isLoggedIn) {
      toast({ title: 'Sign in required', description: 'Please sign in to save searches.', variant: 'destructive' });
      return;
    }
    if (showSaveModal) {
      // Submit
      setSavingSearch(true);
      try {
        const name = saveSearchName.trim() || [searchQuery, categoryName, selectedProvince].filter(Boolean).join(' · ') || 'My Search';
        await createSavedSearch({
          name,
          category_id: selectedCategory || null,
          category_name: categoryName || null,
          province: selectedProvince || null,
          min_price: minPrice ? Number(minPrice) : null,
          max_price: maxPrice ? Number(maxPrice) : null,
          keywords: searchQuery || null,
          condition: selectedCondition || null,
          email_alerts: saveEmailAlerts,
        });
        toast({ title: 'Search saved!', description: saveEmailAlerts ? 'You\'ll get email alerts for new matches.' : 'Saved to your searches.' });
        setShowSaveModal(false);
        setSaveSearchName('');
      } catch (err: any) {
        toast({ title: 'Error', description: err.message || 'Failed to save search', variant: 'destructive' });
      } finally {
        setSavingSearch(false);
      }
    } else {
      setShowSaveModal(true);
    }
  };

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Sync local search with prop when it changes externally
  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  // Debounced search handler
  const handleSearchInput = useCallback((value: string) => {
    setLocalSearch(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      onSearchChange(value);
    }, 400);
  }, [onSearchChange]);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    onSearchChange(localSearch);
  };

  const handleClearSearch = () => {
    setLocalSearch('');
    onSearchChange('');
    searchInputRef.current?.focus();
  };

  // Infinite scroll observer
  useEffect(() => {
    if (!hasMore || loadingMore || !onLoadMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMore();
        }
      },
      { rootMargin: '400px' }
    );
    const el = loadMoreRef.current;
    if (el) observer.observe(el);
    return () => { if (el) observer.unobserve(el); };
  }, [hasMore, loadingMore, onLoadMore, listings.length]);

  // Price range slider state
  const [sliderMin, setSliderMin] = useState(0);
  const [sliderMax, setSliderMax] = useState(50000);

  useEffect(() => {
    setSliderMin(minPrice ? Number(minPrice) : 0);
  }, [minPrice]);
  useEffect(() => {
    setSliderMax(maxPrice ? Number(maxPrice) : 50000);
  }, [maxPrice]);

  const handleSliderMinChange = (val: number) => {
    setSliderMin(val);
    onMinPriceChange(val > 0 ? String(val) : '');
  };

  const handleSliderMaxChange = (val: number) => {
    setSliderMax(val);
    onMaxPriceChange(val < 50000 ? String(val) : '');
  };

  const title = searchQuery
    ? `Results for "${searchQuery}"`
    : selectedCategory
      ? categoryName || 'Category Listings'
      : selectedProvince
        ? `Listings in ${selectedProvince}`
        : 'Latest Listings';

  // Count active filters
  const activeFilterCount = [
    searchQuery,
    selectedCategory,
    selectedProvince,
    minPrice,
    maxPrice,
    selectedCondition,
  ].filter(Boolean).length;

  const hasActiveFilters = activeFilterCount > 0;

  const searchSuggestions = [
    'Try using fewer or different keywords',
    'Check your spelling',
    'Remove some filters to broaden results',
    'Try searching in "All Provinces"',
    'Browse categories instead of searching',
  ];

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Search Bar - prominent at top */}
      <form onSubmit={handleSearchSubmit} className="mb-4">
        <div className="relative max-w-2xl mx-auto sm:mx-0">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={localSearch}
            onChange={(e) => handleSearchInput(e.target.value)}
            placeholder="Search by title, description, or keyword..."
            className="w-full pl-12 pr-10 py-3 bg-white border border-gray-200 rounded-2xl text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm hover:border-gray-300 transition-all"
          />
          {localSearch && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </form>

      {/* Category Chips - scrollable horizontal row */}
      {categories.length > 0 && (
        <div className="mb-4">
          <CategoryChips
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={onCategoryChange}
          />
        </div>
      )}

      {/* Header & Filters Row */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{title}</h2>
            <p className="text-gray-500 text-sm mt-0.5">
              {loading ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
                  Loading listings...
                </span>
              ) : error ? (
                <span className="text-red-500">Error loading listings</span>
              ) : (
                `${listings.length}${hasMore ? '+' : ''} listing${listings.length !== 1 ? 's' : ''} found`
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Province Filter */}
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                value={selectedProvince}
                onChange={(e) => onProvinceChange(e.target.value)}
                className="pl-9 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none cursor-pointer shadow-sm hover:border-gray-300 transition-all"
              >
                <option value="">All Provinces</option>
                {SA_PROVINCES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div className="relative">
              <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                value={sortBy}
                onChange={(e) => onSortChange(e.target.value)}
                className="pl-9 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none cursor-pointer shadow-sm hover:border-gray-300 transition-all"
              >
                <option value="newest">Newest First</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="most_viewed">Most Viewed</option>
              </select>
            </div>

            {/* Map / Grid Toggle */}
            <button
              onClick={() => setShowMapView(!showMapView)}
              className={`flex items-center gap-1.5 px-3 py-2 border rounded-xl text-sm font-medium transition-all shadow-sm ${
                showMapView
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
              }`}
              title={showMapView ? 'Switch to grid view' : 'Switch to map view'}
            >
              {showMapView ? <Grid3X3 className="w-4 h-4" /> : <MapIcon className="w-4 h-4" />}
              <span className="hidden sm:inline">{showMapView ? 'Grid' : 'Map'}</span>
            </button>

            {/* Advanced Filters Toggle */}
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`flex items-center gap-2 px-3 py-2 border rounded-xl text-sm font-medium transition-all shadow-sm ${
                showAdvancedFilters || (minPrice || maxPrice || selectedCondition)
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">Filters</span>
              {(minPrice || maxPrice || selectedCondition) && (
                <span className="w-5 h-5 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {[minPrice, maxPrice, selectedCondition].filter(Boolean).length}
                </span>
              )}
              {showAdvancedFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {/* Retry Button */}
            {onRetry && !loading && (
              <button
                onClick={onRetry}
                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-gray-200 shadow-sm"
                title="Refresh listings"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Advanced Filters Panel */}
        {showAdvancedFilters && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm animate-in slide-in-from-top-2 duration-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Price Range with Slider */}
              <div className="lg:col-span-2">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">
                  <DollarSign className="w-3.5 h-3.5" />
                  Price Range (ZAR)
                </label>
                <div className="flex items-center gap-2 mb-3">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">R</span>
                    <input
                      type="number"
                      value={minPrice}
                      onChange={(e) => onMinPriceChange(e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-full pl-7 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <span className="text-gray-400 text-sm font-medium">to</span>
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">R</span>
                    <input
                      type="number"
                      value={maxPrice}
                      onChange={(e) => onMaxPriceChange(e.target.value)}
                      placeholder="50,000+"
                      min="0"
                      className="w-full pl-7 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
                <div className="relative h-6 flex items-center">
                  <div className="absolute inset-x-0 h-1.5 bg-gray-200 rounded-full" />
                  <div
                    className="absolute h-1.5 bg-blue-500 rounded-full"
                    style={{
                      left: `${(sliderMin / 50000) * 100}%`,
                      right: `${100 - (sliderMax / 50000) * 100}%`,
                    }}
                  />
                  <input
                    type="range" min="0" max="50000" step="100" value={sliderMin}
                    onChange={(e) => handleSliderMinChange(Number(e.target.value))}
                    className="absolute inset-x-0 w-full h-6 opacity-0 cursor-pointer z-10"
                  />
                  <input
                    type="range" min="0" max="50000" step="100" value={sliderMax}
                    onChange={(e) => handleSliderMaxChange(Number(e.target.value))}
                    className="absolute inset-x-0 w-full h-6 opacity-0 cursor-pointer z-20"
                  />
                  <div className="absolute w-4 h-4 bg-white border-2 border-blue-500 rounded-full shadow-md z-30 pointer-events-none" style={{ left: `calc(${(sliderMin / 50000) * 100}% - 8px)` }} />
                  <div className="absolute w-4 h-4 bg-white border-2 border-blue-500 rounded-full shadow-md z-30 pointer-events-none" style={{ left: `calc(${(sliderMax / 50000) * 100}% - 8px)` }} />
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>R0</span><span>R10k</span><span>R25k</span><span>R50k+</span>
                </div>
                <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                  {[
                    { label: 'Under R100', min: '', max: '100' },
                    { label: 'R100-R500', min: '100', max: '500' },
                    { label: 'R500-R2k', min: '500', max: '2000' },
                    { label: 'R2k-R10k', min: '2000', max: '10000' },
                    { label: 'R10k+', min: '10000', max: '' },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => { onMinPriceChange(preset.min); onMaxPriceChange(preset.max); }}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-full border transition-all ${
                        minPrice === preset.min && maxPrice === preset.max
                          ? 'bg-blue-100 border-blue-300 text-blue-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Condition */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">
                  <Sparkles className="w-3.5 h-3.5" />
                  Condition
                </label>
                <div className="space-y-2">
                  {CONDITIONS.map(({ key, label }) => (
                    <label
                      key={key}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all ${
                        selectedCondition === key
                          ? 'bg-blue-50 border border-blue-200'
                          : 'hover:bg-gray-50 border border-transparent'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCondition === key}
                        onChange={() => onConditionChange(selectedCondition === key ? '' : key)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <span className={`text-sm ${selectedCondition === key ? 'font-semibold text-blue-700' : 'text-gray-700'}`}>
                        {label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Sort By + Province */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  Sort By
                </label>
                <div className="space-y-1.5">
                  {[
                    { value: 'newest', label: 'Newest First', icon: <Tag className="w-3.5 h-3.5" /> },
                    { value: 'price_asc', label: 'Price: Low to High', icon: <DollarSign className="w-3.5 h-3.5" /> },
                    { value: 'price_desc', label: 'Price: High to Low', icon: <DollarSign className="w-3.5 h-3.5" /> },
                    { value: 'most_viewed', label: 'Most Viewed', icon: <Eye className="w-3.5 h-3.5" /> },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => onSortChange(option.value)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-all ${
                        sortBy === option.value
                          ? 'bg-blue-50 text-blue-700 font-semibold border border-blue-200'
                          : 'text-gray-700 hover:bg-gray-50 border border-transparent'
                      }`}
                    >
                      {option.icon}
                      {option.label}
                    </button>
                  ))}
                </div>

                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wider mt-4 mb-2">
                  <MapPin className="w-3.5 h-3.5" />
                  Province
                </label>
                <select
                  value={selectedProvince}
                  onChange={(e) => onProvinceChange(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none cursor-pointer"
                >
                  <option value="">All Provinces</option>
                  {SA_PROVINCES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Active Filters Bar */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 mb-4 flex-wrap bg-blue-50/50 border border-blue-100 rounded-xl px-3 py-2.5">
          <Filter className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <span className="text-xs text-blue-600 font-semibold uppercase tracking-wider mr-1">Filters:</span>

          {searchQuery && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white text-blue-700 text-xs font-medium rounded-full border border-blue-200 shadow-sm">
              <Search className="w-3 h-3" />
              &ldquo;{searchQuery}&rdquo;
              <button onClick={handleClearSearch} className="ml-0.5 hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
            </span>
          )}

          {selectedProvince && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white text-blue-700 text-xs font-medium rounded-full border border-blue-200 shadow-sm">
              <MapPin className="w-3 h-3" />
              {selectedProvince}
              <button onClick={() => onProvinceChange('')} className="ml-0.5 hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
            </span>
          )}

          {selectedCategory && categoryName && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white text-blue-700 text-xs font-medium rounded-full border border-blue-200 shadow-sm">
              <Tag className="w-3 h-3" />
              {categoryName}
              <button onClick={() => onCategoryChange(null)} className="ml-0.5 hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
            </span>
          )}

          {(minPrice || maxPrice) && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white text-blue-700 text-xs font-medium rounded-full border border-blue-200 shadow-sm">
              <DollarSign className="w-3 h-3" />
              {minPrice && maxPrice
                ? `R${Number(minPrice).toLocaleString()} - R${Number(maxPrice).toLocaleString()}`
                : minPrice
                  ? `R${Number(minPrice).toLocaleString()}+`
                  : `Up to R${Number(maxPrice).toLocaleString()}`
              }
              <button onClick={() => { onMinPriceChange(''); onMaxPriceChange(''); }} className="ml-0.5 hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
            </span>
          )}

          {selectedCondition && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white text-blue-700 text-xs font-medium rounded-full border border-blue-200 shadow-sm">
              <Sparkles className="w-3 h-3" />
              {CONDITION_LABELS[selectedCondition as ListingCondition] || selectedCondition}
              <button onClick={() => onConditionChange('')} className="ml-0.5 hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
            </span>
          )}

          {/* Save This Search button */}
          {isLoggedIn && (
            <button
              onClick={() => { if (showSaveModal) { handleSaveSearch(); } else { setShowSaveModal(true); } }}
              disabled={savingSearch}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200 hover:bg-emerald-100 transition-all shadow-sm"
            >
              {savingSearch ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bell className="w-3 h-3" />}
              Save This Search
            </button>
          )}

          <button
            onClick={onClearAllFilters}
            className="ml-auto text-xs font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-full transition-all"
          >
            Clear All ({activeFilterCount})
          </button>
        </div>
      )}


      {/* Save Search Modal */}
      {showSaveModal && (
        <div className="mb-4 bg-white border border-emerald-200 rounded-xl p-4 shadow-sm animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2 mb-3">
            <BellRing className="w-5 h-5 text-emerald-600" />
            <h3 className="font-semibold text-gray-900">Save This Search</h3>
          </div>
          <p className="text-sm text-gray-500 mb-3">Get notified when new listings match your current filters.</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={saveSearchName}
              onChange={(e) => setSaveSearchName(e.target.value)}
              placeholder={[searchQuery, categoryName, selectedProvince].filter(Boolean).join(' · ') || 'My Search'}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={saveEmailAlerts} onChange={(e) => setSaveEmailAlerts(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
              Email alerts
            </label>
            <div className="flex gap-2">
              <button onClick={() => setShowSaveModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleSaveSearch} disabled={savingSearch} className="px-4 py-2 text-sm text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5">
                {savingSearch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bookmark className="w-3.5 h-3.5" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Map View */}
      {showMapView && !loading && !error && (
        <div className="mb-6">
          <MapView
            listings={listings}
            onViewDetail={onViewDetail}
            onProvinceChange={onProvinceChange}
            selectedProvince={selectedProvince}
          />
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="aspect-[4/3] bg-gray-200" />
              <div className="p-3 sm:p-4 space-y-2.5">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-5 bg-gray-200 rounded w-1/3" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="text-center py-16 bg-red-50 rounded-2xl border-2 border-dashed border-red-200">
          <AlertTriangle className="w-16 h-16 text-red-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h3>
          <p className="text-gray-500 max-w-md mx-auto mb-6">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          )}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && listings.length === 0 && (
        <div className="text-center py-16 bg-gradient-to-b from-gray-50 to-white rounded-2xl border-2 border-dashed border-gray-200">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">No listings found</h3>
          <p className="text-gray-500 max-w-md mx-auto mb-6">
            {searchQuery
              ? `We couldn't find any listings matching "${searchQuery}".`
              : selectedProvince
                ? `No listings available in ${selectedProvince} yet.`
                : selectedCondition
                  ? `No ${CONDITION_LABELS[selectedCondition as ListingCondition] || selectedCondition} items found.`
                  : (minPrice || maxPrice)
                    ? `No listings in this price range.`
                    : 'There are no listings in this category yet. Be the first to post!'}
          </p>

          {hasActiveFilters && (
            <div className="max-w-md mx-auto mb-6">
              <div className="flex items-center gap-2 justify-center mb-3">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-gray-700">Suggestions</span>
              </div>
              <ul className="space-y-1.5 text-left">
                {searchSuggestions.slice(0, 4).map((suggestion, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-500">
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5 flex-shrink-0" />
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-center gap-3 flex-wrap">
            {hasActiveFilters && (
              <button
                onClick={onClearAllFilters}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-blue-600 font-medium border-2 border-blue-200 rounded-xl hover:bg-blue-50 transition-all"
              >
                <X className="w-4 h-4" />
                Clear All Filters
              </button>
            )}
            {selectedProvince && (
              <button
                onClick={() => onProvinceChange('')}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-gray-600 font-medium border-2 border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
              >
                <MapPin className="w-4 h-4" />
                Try All Provinces
              </button>
            )}
          </div>
        </div>
      )}

      {/* Listings Grid */}
      {!loading && !error && listings.length > 0 && !showMapView && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                isFavorited={favorites.includes(listing.id)}
                onToggleFavorite={onToggleFavorite}
                onViewDetail={onViewDetail}
                isLoggedIn={isLoggedIn}
              />
            ))}
          </div>

          {/* Infinite scroll trigger */}
          <div ref={loadMoreRef} className="h-4" />

          {/* Loading more indicator */}
          {loadingMore && (
            <div className="flex justify-center py-6">
              <div className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 rounded-2xl shadow-sm text-gray-600 text-sm">
                <Loader2Icon className="w-4 h-4 animate-spin" />
                Loading more listings...
              </div>
            </div>
          )}

          {/* Manual load more button as fallback */}
          {hasMore && !loadingMore && onLoadMore && (
            <div className="flex justify-center mt-4">
              <button
                onClick={onLoadMore}
                className="inline-flex items-center gap-2 px-8 py-3 bg-white border-2 border-gray-200 text-gray-700 font-semibold rounded-2xl hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-all shadow-sm"
              >
                <ChevronDown className="w-4 h-4" />
                Load More Listings
              </button>
            </div>
          )}

          {!hasMore && listings.length >= 24 && (
            <div className="text-center mt-6">
              <p className="text-sm text-gray-400">You've reached the end of the listings</p>
            </div>
          )}
        </>
      )}

      {/* Grid view below map */}
      {!loading && !error && listings.length > 0 && showMapView && (
        <div className="mt-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Grid3X3 className="w-5 h-5 text-blue-600" />
            {listings.length} Listings
            {selectedProvince && <span className="text-sm font-normal text-gray-500">in {selectedProvince}</span>}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                isFavorited={favorites.includes(listing.id)}
                onToggleFavorite={onToggleFavorite}
                onViewDetail={onViewDetail}
                isLoggedIn={isLoggedIn}
              />
            ))}
          </div>
          {hasMore && onLoadMore && (
            <div className="flex justify-center mt-6">
              <button
                onClick={onLoadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-white border border-gray-200 text-gray-600 font-medium rounded-xl hover:border-blue-300 hover:text-blue-700 transition-all text-sm disabled:opacity-60"
              >
                {loadingMore ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default ListingsGrid;
