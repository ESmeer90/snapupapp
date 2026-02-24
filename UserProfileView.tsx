import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  getPublicProfile, getUserActiveListings, updateProfile, changePassword,
  uploadAvatar, formatZAR, timeAgo
} from '@/lib/api';
import type { Listing, PublicProfile, SAProvince } from '@/types';
import { SA_PROVINCES } from '@/types';
import {
  User, MapPin, Calendar, Star, Package, ShoppingBag, Eye, Edit3,
  Save, Loader2, CheckCircle2, Lock, Mail, Shield, X, Camera,
  MessageSquare, Heart, Tag, Clock, ExternalLink, AlertTriangle,
  ChevronRight, Settings, BarChart3, Info, Phone, Globe, Image as ImageIcon
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import AvatarCropModal from './AvatarCropModal';
import TrustScoreWidget from './TrustScoreWidget';


const PLACEHOLDER_IMAGES = [
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=300&fit=crop',
  'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=400&h=300&fit=crop',
];

type ProfileTab = 'listings' | 'about' | 'edit';

interface UserProfileViewProps {
  profileUserId?: string;
  onViewDetail?: (listing: Listing) => void;
  onViewChange?: (view: string) => void;
  onStartChat?: (listing: Listing) => void;
  onViewSellerReviews?: (sellerId: string, sellerName: string) => void;
}


const UserProfileView: React.FC<UserProfileViewProps> = ({
  profileUserId,
  onViewDetail,
  onViewChange,
  onStartChat,
  onViewSellerReviews,
}) => {

  const { user, profile: authProfile, refreshProfile } = useAuth();
  const isOwnProfile = !profileUserId || profileUserId === user?.id;
  const targetUserId = isOwnProfile ? user?.id : profileUserId;

  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>('listings');

  // Edit form state
  const [editFullName, setEditFullName] = useState('');
  const [editProvince, setEditProvince] = useState<SAProvince>('Northern Cape');
  const [editBio, setEditBio] = useState('');
  const [editShowEmail, setEditShowEmail] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Avatar upload state
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadProfileData = useCallback(async () => {
    if (!targetUserId) return;
    setLoading(true);
    setLoadError(null);
    try {
      // Load public profile data
      const profileData = await getPublicProfile(targetUserId);

      if (!profileData && isOwnProfile && authProfile) {
        // Fallback: build from auth profile if getPublicProfile fails
        const fallback: PublicProfile = {
          id: authProfile.id,
          full_name: authProfile.full_name,
          province: authProfile.province,
          bio: authProfile.bio,
          avatar_url: authProfile.avatar_url,
          show_email: authProfile.show_email || false,
          email: authProfile.show_email ? authProfile.email : null,
          created_at: authProfile.created_at,
          listing_count: 0,
          sold_count: 0,
          avg_rating: 0,
          total_ratings: 0,
        };
        setPublicProfile(fallback);
      } else if (profileData) {
        setPublicProfile(profileData);
      } else {
        setLoadError('Profile not found. The user may have deleted their account.');
      }

      // Load listings
      try {
        const listingsData = await getUserActiveListings(targetUserId);
        setListings(listingsData);
      } catch {
        setListings([]);
      }
    } catch (err: any) {
      console.error('Profile load error:', err);
      setLoadError(err.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [targetUserId, isOwnProfile, authProfile]);

  useEffect(() => {
    loadProfileData();
  }, [loadProfileData]);

  // Initialize edit form when profile loads
  useEffect(() => {
    if (isOwnProfile && authProfile) {
      setEditFullName(authProfile.full_name || '');
      setEditProvince(authProfile.province || 'Northern Cape');
      setEditBio(authProfile.bio || '');
      setEditShowEmail(authProfile.show_email || false);
      setEditPhone(authProfile.phone || '');
    } else if (publicProfile) {
      setEditFullName(publicProfile.full_name || '');
      setEditProvince(publicProfile.province || 'Northern Cape');
      setEditBio(publicProfile.bio || '');
      setEditShowEmail(publicProfile.show_email || false);
    }
  }, [isOwnProfile, authProfile, publicProfile]);

  // Realtime subscription for profile updates
  useEffect(() => {
    if (!targetUserId) return;
    const channel = supabase
      .channel(`profile-${targetUserId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${targetUserId}`,
      }, () => {
        loadProfileData();
        if (isOwnProfile) refreshProfile();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'listings',
        filter: `user_id=eq.${targetUserId}`,
      }, () => {
        getUserActiveListings(targetUserId).then(setListings).catch(() => {});
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [targetUserId, isOwnProfile, loadProfileData, refreshProfile]);

  // Avatar file selection
  const handleAvatarClick = () => {
    if (!isOwnProfile) return;
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: 'Invalid file type', description: 'Please select a JPEG, PNG, or WebP image.', variant: 'destructive' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Please select an image under 5MB.', variant: 'destructive' });
      return;
    }

    setAvatarFile(file);
    setShowCropModal(true);
    e.target.value = '';
  };

  const handleCropConfirm = async (croppedFile: File) => {
    setUploadingAvatar(true);
    try {
      const url = await uploadAvatar(croppedFile);
      toast({ title: 'Avatar updated!', description: 'Your profile picture has been updated.' });
      setPublicProfile(prev => prev ? { ...prev, avatar_url: url } : prev);
      await refreshProfile();
      setShowCropModal(false);
      setAvatarFile(null);
    } catch (err: any) {
      console.error('Avatar upload error:', err);
      toast({ title: 'Upload failed', description: err.message || 'Failed to upload avatar. Please try again.', variant: 'destructive' });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleCropCancel = () => {
    setShowCropModal(false);
    setAvatarFile(null);
  };

  // Save profile edits
  const handleSaveProfile = async () => {
    if (!user) return;
    if (!editFullName.trim()) {
      toast({ title: 'Validation Error', description: 'Full name is required.', variant: 'destructive' });
      return;
    }
    if (editBio.length > 500) {
      toast({ title: 'Validation Error', description: 'Bio must be 500 characters or less.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await updateProfile(user.id, {
        full_name: editFullName.trim(),
        province: editProvince,
        bio: editBio.trim(),
        show_email: editShowEmail,
        phone: editPhone.trim() || undefined,
      } as any);
      await refreshProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      toast({ title: 'Profile updated!', description: 'Your changes have been saved.' });
      loadProfileData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to update profile', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Change password
  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast({ title: 'Error', description: 'Password must be at least 6 characters.', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Error', description: 'Passwords do not match.', variant: 'destructive' });
      return;
    }
    setChangingPassword(true);
    try {
      await changePassword(newPassword);
      toast({ title: 'Password changed!', description: 'Your password has been updated.' });
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordChange(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to change password', variant: 'destructive' });
    } finally {
      setChangingPassword(false);
    }
  };

  // Get display avatar URL
  const displayAvatarUrl = isOwnProfile
    ? (authProfile?.avatar_url || publicProfile?.avatar_url)
    : publicProfile?.avatar_url;

  const displayName = isOwnProfile
    ? (authProfile?.full_name || publicProfile?.full_name || 'User')
    : (publicProfile?.full_name || 'User');

  const displayProvince = isOwnProfile
    ? (authProfile?.province || publicProfile?.province)
    : publicProfile?.province;

  const joinDate = publicProfile?.created_at
    ? new Date(publicProfile.created_at).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long' })
    : (isOwnProfile && authProfile?.created_at
      ? new Date(authProfile.created_at).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long' })
      : '');

  // Loading state
  if (loading) {
    return (
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
          <p className="text-gray-500 font-medium">Loading profile...</p>
        </div>
      </section>
    );
  }

  // Error state
  if (loadError && !publicProfile) {
    return (
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-10 h-10 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Profile Not Found</h2>
          <p className="text-gray-500 mb-6 text-center max-w-md">{loadError}</p>
          <button
            onClick={() => onViewChange?.('home')}
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all"
          >
            Go Home
          </button>
        </div>
      </section>
    );
  }

  const profile = publicProfile;

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      {/* Hidden file input for avatar */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Profile Header */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm mb-6">
        {/* Cover gradient */}
        <div className="h-32 sm:h-40 bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 relative">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        </div>

        <div className="px-6 pb-6 -mt-16 sm:-mt-20 relative">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
            {/* Avatar */}
            <div className="relative group">
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 border-white shadow-xl overflow-hidden bg-gray-100 flex-shrink-0">
                {displayAvatarUrl ? (
                  <img
                    src={displayAvatarUrl}
                    alt={displayName}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center">
                    <User className="w-12 h-12 sm:w-14 sm:h-14 text-blue-400" />
                  </div>
                )}
              </div>
              {isOwnProfile && (
                <button
                  onClick={handleAvatarClick}
                  className="absolute bottom-1 right-1 w-9 h-9 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-blue-700 transition-all border-2 border-white group-hover:scale-110"
                  title="Change avatar"
                >
                  <Camera className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Name & Info */}
            <div className="flex-1 min-w-0 pt-2 sm:pb-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 truncate">{displayName}</h1>
                {/* Compact Trust Score Badge in Header */}
                {targetUserId && (
                  <TrustScoreWidget sellerId={targetUserId} variant="compact" />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-500">
                {displayProvince && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4 text-blue-500" />
                    {displayProvince}
                  </span>
                )}
                {joinDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    Joined {joinDate}
                  </span>
                )}
                {(profile?.avg_rating ?? 0) > 0 && (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-xs font-medium">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    {profile!.avg_rating.toFixed(1)} ({profile!.total_ratings} reviews)
                  </span>
                )}
              </div>
              {profile?.bio && (
                <p className="mt-2 text-gray-600 text-sm line-clamp-2">{profile.bio}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {isOwnProfile ? (
                <button
                  onClick={() => setActiveTab('edit')}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-all"
                >
                  <Edit3 className="w-4 h-4" /> Edit Profile
                </button>
              ) : (
                listings.length > 0 && onStartChat && (
                  <button
                    onClick={() => onStartChat(listings[0])}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                  >
                    <MessageSquare className="w-4 h-4" /> Message
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Active Listings', value: profile?.listing_count ?? listings.length, icon: <Package className="w-5 h-5 text-blue-500" />, color: 'bg-blue-50' },
          { label: 'Items Sold', value: profile?.sold_count ?? 0, icon: <ShoppingBag className="w-5 h-5 text-emerald-500" />, color: 'bg-emerald-50' },
          { label: 'Avg Rating', value: (profile?.avg_rating ?? 0) > 0 ? profile!.avg_rating.toFixed(1) : 'N/A', icon: <Star className="w-5 h-5 text-amber-500" />, color: 'bg-amber-50' },
          { label: 'Reviews', value: profile?.total_ratings ?? 0, icon: <MessageSquare className="w-5 h-5 text-purple-500" />, color: 'bg-purple-50' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
            <div className={`w-10 h-10 ${stat.color} rounded-xl flex items-center justify-center mx-auto mb-2`}>
              {stat.icon}
            </div>
            <p className="text-xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
        {[
          { id: 'listings' as ProfileTab, label: 'Listings', icon: <Package className="w-4 h-4" /> },
          { id: 'about' as ProfileTab, label: 'About', icon: <Info className="w-4 h-4" /> },
          ...(isOwnProfile ? [{ id: 'edit' as ProfileTab, label: 'Edit Profile', icon: <Edit3 className="w-4 h-4" /> }] : []),
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'listings' && (
        <div>
          {listings.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Package className="w-10 h-10 text-gray-300" />
              </div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">No active listings</h3>
              <p className="text-gray-500 text-sm mb-4">
                {isOwnProfile ? "You haven't posted any items yet." : "This user hasn't posted any items yet."}
              </p>
              {isOwnProfile && (
                <button
                  onClick={() => onViewChange?.('home')}
                  className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                >
                  Start Selling
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {listings.map((listing) => (
                <button
                  key={listing.id}
                  onClick={() => onViewDetail?.(listing)}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md hover:border-blue-200 transition-all text-left group"
                >
                  <div className="aspect-square bg-gray-100 relative overflow-hidden">
                    <img
                      src={listing.images?.[0] || PLACEHOLDER_IMAGES[0]}
                      alt={listing.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMAGES[0]; }}
                    />
                    {listing.category_name && (
                      <span className="absolute top-2 left-2 px-2 py-0.5 bg-white/90 backdrop-blur-sm text-xs font-medium text-gray-700 rounded-full">
                        {listing.category_name}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="font-semibold text-gray-900 text-sm truncate group-hover:text-blue-600 transition-colors">{listing.title}</h3>
                    <p className="text-blue-600 font-bold mt-1">{formatZAR(listing.price)}</p>
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
                      <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{listing.location}</span>
                      <span className="flex items-center gap-0.5"><Eye className="w-3 h-3" />{listing.view_count}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'about' && (
        <div className="space-y-6">
          {/* Full Trust Score Widget - replaces old Seller Reputation section */}
          {targetUserId && (
            <TrustScoreWidget sellerId={targetUserId} variant="full" />
          )}

          <div className="grid md:grid-cols-2 gap-6">
            {/* Bio Section */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <User className="w-5 h-5 text-blue-500" /> About
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                {profile?.bio || (isOwnProfile ? 'Add a bio to tell others about yourself.' : 'This user has not added a bio yet.')}
              </p>
              {isOwnProfile && !profile?.bio && (
                <button
                  onClick={() => setActiveTab('edit')}
                  className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Add bio
                </button>
              )}
            </div>

            {/* Contact Info */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-500" /> Contact
              </h3>
              {profile?.show_email && profile?.email ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-700">{profile.email}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-xl">
                  <Shield className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-500">
                    Contact information is private per POPIA regulations.
                    {!isOwnProfile && ' Use the messaging feature to get in touch.'}
                  </p>
                </div>
              )}
              {isOwnProfile && (
                <div className="mt-3 flex items-start gap-2 p-3 bg-blue-50 rounded-xl border border-blue-100">
                  <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700">
                    You can control email visibility in the Edit Profile tab. Per POPIA, your email will only be shown if you explicitly consent.
                  </p>
                </div>
              )}
            </div>

            {/* Quick Links (own profile only) */}
            {isOwnProfile && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Globe className="w-5 h-5 text-blue-500" /> Quick Links
                </h3>
                <div className="space-y-1">
                  {[
                    { label: 'Seller Dashboard', icon: <BarChart3 className="w-4 h-4" />, view: 'dashboard' },
                    { label: 'Messages', icon: <MessageSquare className="w-4 h-4" />, view: 'messages' },
                    { label: 'Saved Items', icon: <Heart className="w-4 h-4" />, view: 'favorites' },
                    { label: 'Price Alerts', icon: <Tag className="w-4 h-4" />, view: 'price-alerts' },
                    { label: 'Account Settings', icon: <Settings className="w-4 h-4" />, view: 'settings', isLink: true },
                  ].map((link) => (
                    link.isLink ? (
                      <a
                        key={link.label}
                        href="/settings"
                        className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-all group"
                      >
                        <span className="flex items-center gap-3 text-sm text-gray-700 group-hover:text-blue-600">
                          {link.icon} {link.label}
                        </span>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-400" />
                      </a>
                    ) : (
                      <button
                        key={link.label}
                        onClick={() => onViewChange?.(link.view)}
                        className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-all group text-left"
                      >
                        <span className="flex items-center gap-3 text-sm text-gray-700 group-hover:text-blue-600">
                          {link.icon} {link.label}
                        </span>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-400" />
                      </button>
                    )
                  ))}
                </div>
              </div>
            )}

            {/* Seller Rating Stars (kept as supplementary to TrustScoreWidget) */}
            {/* Seller Rating Stars with View All Reviews link */}
            {(profile?.total_ratings ?? 0) > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Star className="w-5 h-5 text-amber-500" /> Rating Breakdown
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl font-black text-gray-900">{profile!.avg_rating.toFixed(1)}</div>
                    <div>
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-4 h-4 ${s <= Math.round(profile!.avg_rating) ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{profile!.total_ratings} reviews</p>
                    </div>
                  </div>
                  {/* View All Reviews Button */}
                  {targetUserId && onViewSellerReviews && (
                    <button
                      onClick={() => onViewSellerReviews(targetUserId, displayName)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 transition-all"
                    >
                      <Star className="w-4 h-4" />
                      View All {profile!.total_ratings} Reviews
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      )}


      {activeTab === 'edit' && isOwnProfile && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Profile Info Form */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-blue-500" /> Profile Information
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
                <input
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  maxLength={100}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Province</label>
                <select
                  value={editProvince}
                  onChange={(e) => setEditProvince(e.target.value as SAProvince)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white"
                >
                  {SA_PROVINCES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone (optional)</label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="+27 XX XXX XXXX"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Bio <span className="text-gray-400 font-normal">({editBio.length}/500)</span>
                </label>
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value.slice(0, 500))}
                  placeholder="Tell others about yourself..."
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-none"
                />
              </div>

              {/* POPIA Email Consent */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editShowEmail}
                    onChange={(e) => setEditShowEmail(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Show email on profile</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Per POPIA regulations, your email will only be visible to other users if you explicitly consent.
                    </p>
                  </div>
                </label>
              </div>

              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
              >
                {saving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                ) : saved ? (
                  <><CheckCircle2 className="w-4 h-4" /> Saved!</>
                ) : (
                  <><Save className="w-4 h-4" /> Save Changes</>
                )}
              </button>
            </div>
          </div>

          {/* Password & Avatar Section */}
          <div className="space-y-6">
            {/* Avatar Upload Card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-blue-500" /> Profile Picture
              </h3>
              <div className="flex items-center gap-4">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-100 border-2 border-gray-200">
                    {displayAvatarUrl ? (
                      <img src={displayAvatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center">
                        <User className="w-10 h-10 text-blue-400" />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleAvatarClick}
                    className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Camera className="w-6 h-6 text-white" />
                  </button>
                </div>
                <div className="flex-1">
                  <button
                    onClick={handleAvatarClick}
                    className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-all"
                  >
                    Upload Photo
                  </button>
                  <p className="text-xs text-gray-400 mt-2">JPEG, PNG, or WebP. Max 5MB. Will be cropped to circle.</p>
                </div>
              </div>
              <div className="mt-4 flex items-start gap-2 p-3 bg-blue-50 rounded-xl border border-blue-100">
                <Shield className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700">
                  By uploading a profile picture, you consent to its processing and display on SnapUp per POPIA. You can remove it at any time.
                </p>
              </div>
            </div>

            {/* Password Change Card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Lock className="w-5 h-5 text-blue-500" /> Security
              </h3>
              {!showPasswordChange ? (
                <button
                  onClick={() => setShowPasswordChange(true)}
                  className="w-full py-3 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-all flex items-center justify-center gap-2"
                >
                  <Lock className="w-4 h-4" /> Change Password
                </button>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat new password"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                    />
                    {confirmPassword && newPassword !== confirmPassword && (
                      <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowPasswordChange(false); setNewPassword(''); setConfirmPassword(''); }}
                      className="flex-1 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleChangePassword}
                      disabled={changingPassword || newPassword.length < 6 || newPassword !== confirmPassword}
                      className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                      Update
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Avatar Crop Modal */}
      {showCropModal && avatarFile && (
        <AvatarCropModal
          imageFile={avatarFile}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
          uploading={uploadingAvatar}
        />
      )}
    </section>
  );
};

export default UserProfileView;
