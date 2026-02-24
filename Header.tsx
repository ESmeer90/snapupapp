import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import { useCart } from '@/contexts/CartContext';
import { signOut } from '@/lib/api';
import type { Category } from '@/types';
import {
  Search, Plus, Heart, MessageSquare, User, LogOut, Menu, X, ChevronDown, ChevronRight,
  MapPin, Receipt, Package, Settings, Shield, BarChart3, Tag, Grid3X3, BellRing, Bookmark,
  Smartphone, Car, Home as HomeIcon, Shirt, Sofa, Briefcase, Wrench, Dumbbell,
  Baby, Leaf, BookOpen, PawPrint, Gamepad2, Refrigerator, ShoppingCart
} from 'lucide-react';

import NotificationBell from '@/components/snapup/NotificationBell';
import { toast } from '@/components/ui/use-toast';
import { useSwipeToClose } from '@/hooks/useSwipeToClose';




const categoryIconMap: Record<string, React.ReactNode> = {
  Smartphone: <Smartphone className="w-4 h-4" />,
  Car: <Car className="w-4 h-4" />,
  Home: <HomeIcon className="w-4 h-4" />,
  Shirt: <Shirt className="w-4 h-4" />,
  Sofa: <Sofa className="w-4 h-4" />,
  Briefcase: <Briefcase className="w-4 h-4" />,
  Wrench: <Wrench className="w-4 h-4" />,
  Dumbbell: <Dumbbell className="w-4 h-4" />,
  Baby: <Baby className="w-4 h-4" />,
  Leaf: <Leaf className="w-4 h-4" />,
  BookOpen: <BookOpen className="w-4 h-4" />,
  PawPrint: <PawPrint className="w-4 h-4" />,
  Gamepad2: <Gamepad2 className="w-4 h-4" />,
  Refrigerator: <Refrigerator className="w-4 h-4" />,
};

const categoryColorMap: Record<string, string> = {
  electronics: 'text-blue-600 bg-blue-50',
  vehicles: 'text-red-600 bg-red-50',
  property: 'text-emerald-600 bg-emerald-50',
  fashion: 'text-pink-600 bg-pink-50',
  furniture: 'text-amber-600 bg-amber-50',
  jobs: 'text-violet-600 bg-violet-50',
  services: 'text-cyan-600 bg-cyan-50',
  'sports-leisure': 'text-lime-600 bg-lime-50',
  'baby-kids': 'text-rose-500 bg-rose-50',
  'garden-diy': 'text-green-600 bg-green-50',
  'books-education': 'text-indigo-600 bg-indigo-50',
  pets: 'text-orange-500 bg-orange-50',
  gaming: 'text-purple-600 bg-purple-50',
  appliances: 'text-teal-600 bg-teal-50',
};

interface HeaderProps {
  onOpenAuth: (mode: 'signin' | 'signup') => void;
  onOpenCreateListing: () => void;
  onSearch: (query: string) => void;
  onViewChange: (view: string) => void;
  currentView: string;
  searchQuery: string;
  categories?: Category[];
  selectedCategory?: string | null;
  onSelectCategory?: (catId: string | null) => void;
}

const Header: React.FC<HeaderProps> = ({
  onOpenAuth, onOpenCreateListing, onSearch, onViewChange, currentView, searchQuery,
  categories = [], selectedCategory = null, onSelectCategory
}) => {
  const { user, profile } = useAuth();
  const { unreadCount } = useChat();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [showCategoriesInMenu, setShowCategoriesInMenu] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Swipe-to-close for mobile menu (swipe right to dismiss)
  const menuSwipe = useSwipeToClose({
    onClose: () => { setMobileMenuOpen(false); setShowCategoriesInMenu(false); },
    direction: 'right',
    threshold: 80,
  });


  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  // Body scroll lock for mobile menu
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [mobileMenuOpen]);

  const debouncedSearch = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearch(value);
    }, 400);
  }, [onSearch]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalSearch(value);
    debouncedSearch(value);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onSearch(localSearch);
  };

  const handleClearSearch = () => {
    setLocalSearch('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onSearch('');
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      toast({ title: 'Signed out', description: 'You have been signed out successfully.' });
      setUserMenuOpen(false);
      setMobileMenuOpen(false);
      onViewChange('home');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleCategorySelect = (catId: string | null) => {
    if (onSelectCategory) {
      onSelectCategory(catId);
    }
    setMobileMenuOpen(false);
    setUserMenuOpen(false);
    setShowCategoriesInMenu(false);
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
    setShowCategoriesInMenu(false);
  };

  const avatarUrl = profile?.avatar_url;
  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo */}
          <button onClick={() => { onViewChange('home'); handleClearSearch(); if (onSelectCategory) onSelectCategory(null); }} className="flex items-center gap-2 flex-shrink-0 group">
            <svg className="w-9 h-9 flex-shrink-0" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ imageRendering: 'auto' }}>
              <defs>
                <linearGradient id="logoGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#2563EB" />
                  <stop offset="1" stopColor="#1D4ED8" />
                </linearGradient>
              </defs>
              <rect width="40" height="40" rx="10" fill="url(#logoGrad)" />
              <path d="M24.5 13.5C24.5 13.5 22.5 12 19.5 12C16 12 13.5 14.2 13.5 17C13.5 19.8 16 21 19.5 22C23 23 25.5 24.2 25.5 27C25.5 29.8 23 32 19.5 32C16 32 14 30.5 14 30.5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="19.5" y1="10" x2="19.5" y2="12" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="19.5" y1="32" x2="19.5" y2="34" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <span className="text-xl font-bold text-gray-900 hidden sm:block">Snap<span className="text-blue-600">Up</span></span>
          </button>


          {/* Search */}
          <form onSubmit={handleSearchSubmit} className="flex-1 max-w-xl">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={localSearch}
                onChange={handleSearchChange}
                placeholder="Search listings..."
                className="w-full pl-10 pr-10 py-2.5 bg-gray-100 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
              />
              {localSearch && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </form>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-2">
            {user ? (
              <>
                <a
                  href="/post-item"
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all text-sm shadow-lg shadow-blue-200"
                >
                  <Plus className="w-4 h-4" /> Sell Item
                </a>
                <button
                  onClick={() => onViewChange('favorites')}
                  className={`p-2.5 rounded-xl transition-all ${currentView === 'favorites' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
                  title="Saved Items"
                >
                  <Heart className="w-5 h-5" />
                </button>
                <button
                  onClick={() => onViewChange('messages')}
                  className={`p-2.5 rounded-xl transition-all relative ${currentView === 'messages' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
                  title="Messages"
                >
                  <MessageSquare className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold bg-red-500 text-white rounded-full animate-pulse">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>

                {/* Notification Bell */}
                <NotificationBell onViewChange={onViewChange} />

                {/* Hamburger Menu (Desktop) */}
                <div className="relative">
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-gray-100 transition-all"
                  >
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-blue-100 flex items-center justify-center flex-shrink-0 ring-2 ring-gray-200">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={profile?.full_name || 'User'}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.innerHTML = `<span class="text-xs font-bold text-blue-600">${initials}</span>`; }}
                        />
                      ) : (
                        <span className="text-xs font-bold text-blue-600">{initials}</span>
                      )}
                    </div>
                    <Menu className="w-4 h-4 text-gray-500" />
                  </button>
                  {userMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => { setUserMenuOpen(false); setShowCategoriesInMenu(false); }} />
                      <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 z-20 overflow-hidden max-h-[80vh] overflow-y-auto">
                        {/* User Info */}
                        <div className="p-4 border-b border-gray-100 bg-gray-50">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-blue-100 flex items-center justify-center flex-shrink-0">
                              {avatarUrl ? (
                                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-sm font-bold text-blue-600">{initials}</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 truncate">{profile?.full_name || 'User'}</p>
                              <p className="text-xs text-gray-500 truncate">{user.email}</p>
                              <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-400">
                                <MapPin className="w-3 h-3" />
                                {profile?.province || 'Northern Cape'}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Categories Section */}
                        <div className="border-b border-gray-100">
                          <button
                            onClick={() => setShowCategoriesInMenu(!showCategoriesInMenu)}
                            className="w-full px-4 py-3 text-left text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors flex items-center justify-between"
                          >
                            <span className="flex items-center gap-2">
                              <Grid3X3 className="w-4 h-4 text-blue-600" />
                              Browse Categories
                            </span>
                            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showCategoriesInMenu ? 'rotate-180' : ''}`} />
                          </button>
                          {showCategoriesInMenu && (
                            <div className="px-2 pb-2 space-y-0.5">
                              {selectedCategory && (
                                <button
                                  onClick={() => handleCategorySelect(null)}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium"
                                >
                                  <X className="w-4 h-4" />
                                  Clear Category Filter
                                </button>
                              )}
                              {categories.map((cat) => {
                                const isSelected = selectedCategory === cat.id;
                                const colorClass = categoryColorMap[cat.slug] || 'text-gray-600 bg-gray-50';
                                return (
                                  <button
                                    key={cat.id}
                                    onClick={() => handleCategorySelect(isSelected ? null : cat.id)}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-all ${
                                      isSelected
                                        ? 'bg-blue-100 text-blue-700 font-semibold'
                                        : 'text-gray-700 hover:bg-gray-50'
                                    }`}
                                  >
                                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-blue-200 text-blue-700' : colorClass}`}>
                                      {categoryIconMap[cat.icon] || <Tag className="w-4 h-4" />}
                                    </span>
                                    <span className="flex-1 text-left">{cat.name}</span>
                                    {isSelected && (
                                      <span className="w-2 h-2 bg-blue-600 rounded-full" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Navigation */}
                        <div className="py-1">
                          <button onClick={() => { onViewChange('profile'); setUserMenuOpen(false); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-3">
                            <User className="w-4 h-4" /> My Profile
                          </button>
                          <a href="/post-item" className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-3">
                            <Plus className="w-4 h-4" /> Post New Item
                          </a>
                          <button onClick={() => { onViewChange('dashboard'); setUserMenuOpen(false); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-3">
                            <BarChart3 className="w-4 h-4" /> Seller Dashboard
                          </button>
                          <button onClick={() => { onViewChange('orders'); setUserMenuOpen(false); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-3">
                            <Receipt className="w-4 h-4" /> My Orders
                          </button>
                          <button onClick={() => { onViewChange('favorites'); setUserMenuOpen(false); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-3">
                            <Heart className="w-4 h-4" /> Saved Items
                          </button>
                          <button onClick={() => { onViewChange('messages'); setUserMenuOpen(false); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-3">
                            <MessageSquare className="w-4 h-4" />
                            Messages
                            {unreadCount > 0 && (
                              <span className="ml-auto px-1.5 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
                                {unreadCount > 99 ? '99+' : unreadCount}
                              </span>
                            )}
                          </button>
                          <button onClick={() => { onViewChange('transactions'); setUserMenuOpen(false); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-3">
                            <Receipt className="w-4 h-4" /> Transactions
                          </button>
                          <button onClick={() => { onViewChange('price-alerts'); setUserMenuOpen(false); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-3">
                            <BellRing className="w-4 h-4" /> Price Alerts
                          </button>
                          <button onClick={() => { onViewChange('saved-searches'); setUserMenuOpen(false); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-3">
                            <Bookmark className="w-4 h-4" /> Saved Searches
                          </button>
                        </div>

                        <div className="border-t border-gray-100 py-1">
                          <a href="/settings" className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-3">
                            <Settings className="w-4 h-4" /> Account Settings
                          </a>
                          <a href="/privacy-policy" className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-3">
                            <Shield className="w-4 h-4" /> Privacy Policy
                          </a>
                          <button onClick={handleSignOut} className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-3">
                            <LogOut className="w-4 h-4" /> Sign Out
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Non-logged-in hamburger menu with categories */}
                <div className="relative">
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="p-2.5 rounded-xl text-gray-600 hover:bg-gray-100 transition-all"
                    title="Menu"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                  {userMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => { setUserMenuOpen(false); setShowCategoriesInMenu(false); }} />
                      <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 z-20 overflow-hidden max-h-[80vh] overflow-y-auto">
                        {/* Categories for non-logged in */}
                        <div className="border-b border-gray-100">
                          <button
                            onClick={() => setShowCategoriesInMenu(!showCategoriesInMenu)}
                            className="w-full px-4 py-3 text-left text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors flex items-center justify-between"
                          >
                            <span className="flex items-center gap-2">
                              <Grid3X3 className="w-4 h-4 text-blue-600" />
                              Browse Categories
                            </span>
                            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showCategoriesInMenu ? 'rotate-180' : ''}`} />
                          </button>
                          {showCategoriesInMenu && (
                            <div className="px-2 pb-2 space-y-0.5">
                              {selectedCategory && (
                                <button
                                  onClick={() => handleCategorySelect(null)}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium"
                                >
                                  <X className="w-4 h-4" />
                                  Clear Category Filter
                                </button>
                              )}
                              {categories.map((cat) => {
                                const isSelected = selectedCategory === cat.id;
                                const colorClass = categoryColorMap[cat.slug] || 'text-gray-600 bg-gray-50';
                                return (
                                  <button
                                    key={cat.id}
                                    onClick={() => handleCategorySelect(isSelected ? null : cat.id)}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-all ${
                                      isSelected
                                        ? 'bg-blue-100 text-blue-700 font-semibold'
                                        : 'text-gray-700 hover:bg-gray-50'
                                    }`}
                                  >
                                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-blue-200 text-blue-700' : colorClass}`}>
                                      {categoryIconMap[cat.icon] || <Tag className="w-4 h-4" />}
                                    </span>
                                    <span className="flex-1 text-left">{cat.name}</span>
                                    {isSelected && <span className="w-2 h-2 bg-blue-600 rounded-full" />}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div className="p-3 space-y-2">
                          <a href="/login" className="block w-full py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-xl hover:bg-gray-50 text-center">
                            Sign In
                          </a>
                          <a href="/signup" className="block w-full py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 text-center">
                            Join Free
                          </a>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <a
                  href="/login"
                  className="px-4 py-2.5 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all"
                >
                  Sign In
                </a>
                <a
                  href="/signup"
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all text-sm shadow-lg shadow-blue-200"
                >
                  Join Free
                </a>
              </>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <div className="md:hidden flex items-center gap-0.5">
            {/* Mobile Notification Bell */}
            {user && (
              <div className="relative overflow-visible">
                <NotificationBell onViewChange={(view) => { onViewChange(view); closeMobileMenu(); }} />
              </div>
            )}
            <button
              onClick={() => { setMobileMenuOpen(!mobileMenuOpen); setShowCategoriesInMenu(false); }}
              className="p-2.5 text-gray-600 hover:bg-gray-100 rounded-xl relative flex-shrink-0"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              {!mobileMenuOpen && unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </button>
          </div>

        </div>
      </div>

      {/* ============================================================= */}
      {/* MOBILE FULL-SCREEN SLIDE-IN MENU PANEL                        */}
      {/* ============================================================= */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true">
          {/* Backdrop overlay - fades with swipe */}
          <div
            className={`absolute inset-0 bg-black/50 backdrop-blur-sm ${!menuSwipe.isSwiping ? 'mobile-menu-backdrop' : ''}`}
            onClick={closeMobileMenu}
            style={menuSwipe.backdropStyle}
            aria-hidden="true"
          />

          {/* Slide-in panel from right - follows finger during swipe */}
          <div
            className={`absolute top-0 right-0 bottom-0 w-[85vw] max-w-[360px] bg-white shadow-2xl flex flex-col ${!menuSwipe.isSwiping ? 'mobile-menu-panel' : ''}`}
            style={menuSwipe.panelStyle}
            onTouchStart={menuSwipe.handleTouchStart}
            onTouchMove={menuSwipe.handleTouchMove}
            onTouchEnd={menuSwipe.handleTouchEnd}
          >
            {/* Swipe indicator bar */}
            <div className="flex justify-center pt-2 pb-0 flex-shrink-0">
              <div className="w-8 h-1 rounded-full bg-gray-300" />
            </div>

            {/* Panel Header with safe-area-inset-top */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0"
              style={{ paddingTop: `max(12px, env(safe-area-inset-top, 12px))` }}
            >
              <span className="text-lg font-bold text-gray-900">Menu</span>
              <button
                onClick={closeMobileMenu}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition-colors"
                aria-label="Close menu"
              >
                <X className="w-5 h-5 text-gray-700" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div
              className="flex-1 overflow-y-auto overscroll-contain mobile-menu-scroll"
              style={{ paddingBottom: `calc(80px + env(safe-area-inset-bottom, 0px))` }}
            >
              {/* User Info (logged in) */}
              {user && (
                <div className="px-4 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-blue-100 flex items-center justify-center flex-shrink-0 ring-2 ring-white shadow-sm">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-sm font-bold text-blue-600">{initials}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate text-base">{profile?.full_name || 'User'}</p>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-400">
                        <MapPin className="w-3 h-3" />
                        {profile?.province || 'Northern Cape'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Categories Section */}
              <div className="border-b border-gray-100">
                <button
                  onClick={() => setShowCategoriesInMenu(!showCategoriesInMenu)}
                  className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                      <Grid3X3 className="w-4 h-4 text-blue-600" />
                    </span>
                    Browse Categories
                    {selectedCategory && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-full">1</span>
                    )}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showCategoriesInMenu ? 'rotate-180' : ''}`} />
                </button>
                {showCategoriesInMenu && (
                  <div className="px-3 pb-3 space-y-0.5">
                    {selectedCategory && (
                      <button
                        onClick={() => handleCategorySelect(null)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 active:bg-red-100 rounded-lg transition-colors font-medium"
                      >
                        <X className="w-4 h-4" />
                        Clear Category Filter
                      </button>
                    )}
                    <div className="grid grid-cols-2 gap-1.5">
                      {categories.map((cat) => {
                        const isSelected = selectedCategory === cat.id;
                        const colorClass = categoryColorMap[cat.slug] || 'text-gray-600 bg-gray-50';
                        return (
                          <button
                            key={cat.id}
                            onClick={() => handleCategorySelect(isSelected ? null : cat.id)}
                            className={`flex items-center gap-2 px-2.5 py-2.5 text-xs rounded-lg transition-all ${
                              isSelected
                                ? 'bg-blue-100 text-blue-700 font-semibold border border-blue-200'
                                : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100 border border-transparent'
                            }`}
                          >
                            <span className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-blue-200 text-blue-700' : colorClass}`}>
                              {categoryIconMap[cat.icon] || <Tag className="w-3.5 h-3.5" />}
                            </span>
                            <span className="truncate">{cat.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Navigation Items */}
              {user ? (
                <div className="py-2">
                  {/* Primary Actions */}
                  <div className="px-3 pb-2 space-y-1">
                    <button
                      onClick={() => { onViewChange('profile'); closeMobileMenu(); }}
                      className="w-full flex items-center gap-3 px-3 py-3 text-sm font-medium text-blue-600 bg-blue-50 rounded-xl active:bg-blue-100 transition-colors"
                    >
                      <User className="w-4 h-4" /> My Profile
                    </button>
                    <a
                      href="/post-item"
                      className="w-full flex items-center gap-3 px-3 py-3 text-sm font-medium text-blue-600 bg-blue-50 rounded-xl active:bg-blue-100 transition-colors"
                    >
                      <Plus className="w-4 h-4" /> Post an Item
                    </a>
                  </div>

                  {/* Secondary Navigation */}
                  <div className="px-3 space-y-0.5">
                    {[
                      { id: 'dashboard', label: 'Seller Dashboard', icon: BarChart3 },
                      { id: 'my-listings', label: 'My Listings', icon: Package },
                      { id: 'orders', label: 'My Orders', icon: Receipt },
                      { id: 'transactions', label: 'Transactions', icon: Receipt },
                      { id: 'favorites', label: 'Saved Items', icon: Heart },
                      { id: 'messages', label: 'Messages', icon: MessageSquare, badge: unreadCount },
                      { id: 'price-alerts', label: 'Price Alerts', icon: BellRing },
                      { id: 'saved-searches', label: 'Saved Searches', icon: Bookmark },
                    ].map((item) => (
                      <button
                        key={item.id}
                        onClick={() => { onViewChange(item.id); closeMobileMenu(); }}
                        className="w-full flex items-center justify-between px-3 py-3 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 rounded-xl transition-colors"
                      >
                        <span className="flex items-center gap-3">
                          <item.icon className="w-4 h-4 text-gray-500" />
                          {item.label}
                        </span>
                        {item.badge && item.badge > 0 ? (
                          <span className="px-2 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-300" />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Settings & Sign Out */}
                  <div className="border-t border-gray-100 mt-2 pt-2 px-3 space-y-0.5">
                    <a
                      href="/settings"
                      className="w-full flex items-center gap-3 px-3 py-3 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 rounded-xl transition-colors"
                    >
                      <Settings className="w-4 h-4 text-gray-500" /> Account Settings
                      <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
                    </a>
                    <a
                      href="/privacy-policy"
                      className="w-full flex items-center gap-3 px-3 py-3 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 rounded-xl transition-colors"
                    >
                      <Shield className="w-4 h-4 text-gray-500" /> Privacy Policy
                      <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
                    </a>
                    <button
                      onClick={() => { handleSignOut(); closeMobileMenu(); }}
                      className="w-full flex items-center gap-3 px-3 py-3 text-sm text-red-600 hover:bg-red-50 active:bg-red-100 rounded-xl transition-colors"
                    >
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  <p className="text-sm text-gray-500 text-center mb-2">Sign in to access all features</p>
                  <a
                    href="/login"
                    className="block w-full py-3 text-sm font-medium text-gray-700 border border-gray-300 rounded-xl hover:bg-gray-50 active:bg-gray-100 text-center transition-colors"
                  >
                    Sign In
                  </a>
                  <a
                    href="/signup"
                    className="block w-full py-3 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 active:bg-blue-800 text-center transition-colors"
                  >
                    Join Free
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </header>
  );
};

export default Header;
