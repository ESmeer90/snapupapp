import React from 'react';
import type { Category } from '@/types';
import {
  Smartphone, Car, Home, Shirt, Sofa, Briefcase, Wrench, Dumbbell,
  Baby, Leaf, BookOpen, PawPrint, Gamepad2, Refrigerator, Tag
} from 'lucide-react';

const iconMap: Record<string, React.ReactNode> = {
  Smartphone: <Smartphone className="w-6 h-6" />,
  Car: <Car className="w-6 h-6" />,
  Home: <Home className="w-6 h-6" />,
  Shirt: <Shirt className="w-6 h-6" />,
  Sofa: <Sofa className="w-6 h-6" />,
  Briefcase: <Briefcase className="w-6 h-6" />,
  Wrench: <Wrench className="w-6 h-6" />,
  Dumbbell: <Dumbbell className="w-6 h-6" />,
  Baby: <Baby className="w-6 h-6" />,
  Leaf: <Leaf className="w-6 h-6" />,
  BookOpen: <BookOpen className="w-6 h-6" />,
  PawPrint: <PawPrint className="w-6 h-6" />,
  Gamepad2: <Gamepad2 className="w-6 h-6" />,
  Refrigerator: <Refrigerator className="w-6 h-6" />,
};

const smallIconMap: Record<string, React.ReactNode> = {
  Smartphone: <Smartphone className="w-3.5 h-3.5" />,
  Car: <Car className="w-3.5 h-3.5" />,
  Home: <Home className="w-3.5 h-3.5" />,
  Shirt: <Shirt className="w-3.5 h-3.5" />,
  Sofa: <Sofa className="w-3.5 h-3.5" />,
  Briefcase: <Briefcase className="w-3.5 h-3.5" />,
  Wrench: <Wrench className="w-3.5 h-3.5" />,
  Dumbbell: <Dumbbell className="w-3.5 h-3.5" />,
  Baby: <Baby className="w-3.5 h-3.5" />,
  Leaf: <Leaf className="w-3.5 h-3.5" />,
  BookOpen: <BookOpen className="w-3.5 h-3.5" />,
  PawPrint: <PawPrint className="w-3.5 h-3.5" />,
  Gamepad2: <Gamepad2 className="w-3.5 h-3.5" />,
  Refrigerator: <Refrigerator className="w-3.5 h-3.5" />,
};

const bgColorMap: Record<string, string> = {
  electronics: 'bg-blue-50 group-hover:bg-blue-100',
  vehicles: 'bg-red-50 group-hover:bg-red-100',
  property: 'bg-emerald-50 group-hover:bg-emerald-100',
  fashion: 'bg-pink-50 group-hover:bg-pink-100',
  furniture: 'bg-amber-50 group-hover:bg-amber-100',
  jobs: 'bg-violet-50 group-hover:bg-violet-100',
  services: 'bg-cyan-50 group-hover:bg-cyan-100',
  'sports-leisure': 'bg-lime-50 group-hover:bg-lime-100',
  'baby-kids': 'bg-rose-50 group-hover:bg-rose-100',
  'garden-diy': 'bg-green-50 group-hover:bg-green-100',
  'books-education': 'bg-indigo-50 group-hover:bg-indigo-100',
  pets: 'bg-orange-50 group-hover:bg-orange-100',
  gaming: 'bg-purple-50 group-hover:bg-purple-100',
  appliances: 'bg-teal-50 group-hover:bg-teal-100',
};

const textColorMap: Record<string, string> = {
  electronics: 'text-blue-600',
  vehicles: 'text-red-600',
  property: 'text-emerald-600',
  fashion: 'text-pink-600',
  furniture: 'text-amber-600',
  jobs: 'text-violet-600',
  services: 'text-cyan-600',
  'sports-leisure': 'text-lime-600',
  'baby-kids': 'text-rose-500',
  'garden-diy': 'text-green-600',
  'books-education': 'text-indigo-600',
  pets: 'text-orange-500',
  gaming: 'text-purple-600',
  appliances: 'text-teal-600',
};

interface CategoryGridProps {
  categories: Category[];
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  loading?: boolean;
}

const CategoryGrid: React.FC<CategoryGridProps> = ({ categories, selectedCategory, onSelectCategory, loading }) => {
  if (loading) {
    return (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-gray-100 rounded-2xl h-28" />
          ))}
        </div>
      </section>
    );
  }

  if (categories.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Browse Categories</h2>
          <p className="text-gray-500 text-sm mt-1">Find what you're looking for</p>
        </div>
        {selectedCategory && (
          <button
            onClick={() => onSelectCategory(null)}
            className="text-sm text-blue-600 font-medium hover:text-blue-700 transition-colors"
          >
            Clear Filter
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(isSelected ? null : cat.id)}
              className={`group relative flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all duration-200 ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 shadow-lg shadow-blue-100'
                  : 'border-transparent hover:border-gray-200 hover:shadow-md'
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                isSelected ? 'bg-blue-100 text-blue-600' : `${bgColorMap[cat.slug] || 'bg-gray-100'} ${textColorMap[cat.slug] || 'text-gray-600'}`
              }`}>
                {iconMap[cat.icon] || <Smartphone className="w-6 h-6" />}
              </div>
              <span className={`text-xs font-medium text-center leading-tight ${
                isSelected ? 'text-blue-700' : 'text-gray-700'
              }`}>
                {cat.name}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

// ============ INLINE CATEGORY CHIPS (for ListingsGrid) ============

interface CategoryChipsProps {
  categories: Category[];
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string | null) => void;
}

export const CategoryChips: React.FC<CategoryChipsProps> = ({ categories, selectedCategory, onSelectCategory }) => {
  if (categories.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
      <button
        onClick={() => onSelectCategory(null)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
          !selectedCategory
            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        }`}
      >
        <Tag className="w-3 h-3" />
        All
      </button>
      {categories.map((cat) => {
        const isSelected = selectedCategory === cat.id;
        return (
          <button
            key={cat.id}
            onClick={() => onSelectCategory(isSelected ? null : cat.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
              isSelected
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            {smallIconMap[cat.icon] || <Tag className="w-3 h-3" />}
            {cat.name}
          </button>
        );
      })}
    </div>
  );
};

export default CategoryGrid;
