import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Listing } from '@/types';
import ListingCard from './ListingCard';
import { Heart, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface FavoritesViewProps {
  favorites: string[];
  onToggleFavorite: (listingId: string) => void;
  onViewDetail: (listing: Listing) => void;
}

const FavoritesView: React.FC<FavoritesViewProps> = ({ favorites, onToggleFavorite, onViewDetail }) => {
  const { user } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFavorites();
  }, [favorites]);

  const loadFavorites = async () => {
    if (favorites.length === 0) {
      setListings([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('listings')
        .select(`
          *,
          profiles!listings_user_id_fkey(full_name, avatar_url, province),
          categories!listings_category_id_fkey(name, slug, icon)
        `)
        .in('id', favorites)
        .eq('status', 'active');

      if (fetchError) throw fetchError;

      const mapped = (data || []).map((item: any) => ({
        ...item,
        seller_name: item.profiles?.full_name,
        seller_avatar: item.profiles?.avatar_url,
        category_name: item.categories?.name,
        category_slug: item.categories?.slug,
        category_icon: item.categories?.icon,
      }));
      setListings(mapped);
    } catch (err: any) {
      setError(err.message || 'Failed to load saved items');
      toast({ title: 'Error', description: 'Failed to load saved items', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Saved Items</h2>
          <p className="text-gray-500 text-sm mt-1">{favorites.length} item{favorites.length !== 1 ? 's' : ''} saved</p>
        </div>
        {!loading && favorites.length > 0 && (
          <button
            onClick={loadFavorites}
            className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-gray-200"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading saved items...</p>
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="text-center py-20 bg-red-50 rounded-2xl border-2 border-dashed border-red-200">
          <AlertTriangle className="w-16 h-16 text-red-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">Failed to load saved items</h3>
          <p className="text-gray-500 mb-4">{error}</p>
          <button onClick={loadFavorites} className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all inline-flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Try Again
          </button>
        </div>
      )}

      {!loading && !error && listings.length === 0 && (
        <div className="text-center py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
          <Heart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">No saved items</h3>
          <p className="text-gray-500">Click the heart icon on any listing to save it here.</p>
        </div>
      )}

      {!loading && !error && listings.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {listings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              isFavorited={true}
              onToggleFavorite={onToggleFavorite}
              onViewDetail={onViewDetail}
              isLoggedIn={!!user}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default FavoritesView;
