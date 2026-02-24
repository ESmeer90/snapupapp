import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import { useCart } from '@/contexts/CartContext';
import { Home, PlusCircle, MessageSquare, User, ShoppingCart, Heart } from 'lucide-react';

interface BottomNavProps {
  currentView: string;
  onViewChange: (view: string) => void;
  onOpenAuth: (mode: 'signin' | 'signup') => void;
  onOpenCreateListing: () => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ currentView, onViewChange, onOpenAuth, onOpenCreateListing }) => {
  const { user } = useAuth();
  const { unreadCount } = useChat();
  let cartCtx: any = null;
  try { cartCtx = useCart(); } catch { /* CartProvider not available */ }
  const cartCount = cartCtx?.cartCount || 0;
  const navigate = useNavigate();

  const handleSell = () => {
    if (!user) {
      onOpenAuth('signin');
      return;
    }
    navigate('/post-item');
  };

  const handleChat = () => {
    if (!user) {
      onOpenAuth('signin');
      return;
    }
    onViewChange('messages');
  };

  const handleCart = () => {
    if (!user) {
      onOpenAuth('signin');
      return;
    }
    onViewChange('cart');
  };

  const handleProfile = () => {
    if (!user) {
      onOpenAuth('signin');
      return;
    }
    onViewChange('profile');
  };

  const tabs = [
    {
      id: 'home',
      label: 'Home',
      icon: Home,
      action: () => onViewChange('home'),
      active: currentView === 'home',
      badge: 0,
    },
    {
      id: 'cart',
      label: 'Cart',
      icon: ShoppingCart,
      action: handleCart,
      active: currentView === 'cart',
      badge: cartCount,
    },
    {
      id: 'sell',
      label: 'Sell',
      icon: PlusCircle,
      action: handleSell,
      active: false,
      badge: 0,
      isPrimary: true,
    },
    {
      id: 'chat',
      label: 'Chat',
      icon: MessageSquare,
      action: handleChat,
      active: currentView === 'messages',
      badge: unreadCount,
    },
    {
      id: 'profile',
      label: 'Profile',
      icon: User,
      action: handleProfile,
      active: currentView === 'profile' || currentView === 'dashboard',
      badge: 0,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg md:hidden safe-area-bottom">
      <div className="flex items-center justify-around px-2 py-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isPrimary = (tab as any).isPrimary;

          if (isPrimary) {
            return (
              <button
                key={tab.id}
                onClick={tab.action}
                className="flex flex-col items-center justify-center -mt-5"
              >
                <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-blue-700 rounded-full flex items-center justify-center shadow-lg shadow-blue-300 active:scale-95 transition-transform">
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <span className="text-[10px] font-semibold text-blue-600 mt-0.5">{tab.label}</span>
              </button>
            );
          }

          return (
            <button
              key={tab.id}
              onClick={tab.action}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-lg transition-all relative active:scale-95 ${
                tab.active
                  ? 'text-blue-600'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${tab.active ? 'text-blue-600' : ''}`} />
                {tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] flex items-center justify-center px-1 text-[9px] font-bold bg-red-500 text-white rounded-full">
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </div>
              <span className={`text-[10px] mt-0.5 ${tab.active ? 'font-semibold text-blue-600' : 'font-medium'}`}>
                {tab.label}
              </span>
              {tab.active && (
                <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-blue-600 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
