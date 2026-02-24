import React, { useState, useRef, useEffect } from 'react';
import { Share2, Copy, Check, X } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

// Analytics tracking for share events
function trackShareEvent(platform: string, contentType: string, contentId?: string) {
  try {
    // Log to console for now; can be wired to Supabase analytics table later
    console.log(`[ShareAnalytics] platform=${platform}, type=${contentType}, id=${contentId || 'unknown'}, ts=${new Date().toISOString()}`);
    // Future: supabase.from('analytics_events').insert({ event: 'share', platform, content_type: contentType, content_id: contentId });
  } catch {}
}

interface ShareButtonProps {
  /** The URL to share */
  url: string;
  /** Title for the share (used in OG and message formatting) */
  title: string;
  /** Optional price string (e.g. "R 1,500") for formatted WhatsApp message */
  price?: string;
  /** Optional image URL for OG tags */
  imageUrl?: string;
  /** Content type for analytics tracking */
  contentType?: 'listing' | 'tracking' | 'profile' | 'page';
  /** Content ID for analytics */
  contentId?: string;
  /** Visual variant */
  variant?: 'button' | 'icon' | 'compact';
  /** Custom class names */
  className?: string;
}

// WhatsApp SVG icon (official green)
const WhatsAppIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

// Facebook SVG icon
const FacebookIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

// Twitter/X SVG icon
const XIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const ShareButton: React.FC<ShareButtonProps> = ({
  url,
  title,
  price,
  imageUrl,
  contentType = 'page',
  contentId,
  variant = 'button',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Build the full URL
  const fullUrl = url.startsWith('http') ? url : `https://snapup.co.za${url}`;

  // WhatsApp message formatting (critical for SA market)
  const whatsappMessage = price
    ? `Check out ${title} for ${price} on SnapUp: ${fullUrl}`
    : `Check out ${title} on SnapUp: ${fullUrl}`;

  const handleWhatsApp = () => {
    trackShareEvent('whatsapp', contentType, contentId);
    const encoded = encodeURIComponent(whatsappMessage);
    window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener,noreferrer');
    setIsOpen(false);
  };

  const handleFacebook = () => {
    trackShareEvent('facebook', contentType, contentId);
    const encoded = encodeURIComponent(fullUrl);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encoded}`, '_blank', 'noopener,noreferrer,width=600,height=400');
    setIsOpen(false);
  };

  const handleTwitter = () => {
    trackShareEvent('twitter', contentType, contentId);
    const text = price
      ? `${title} for ${price} on @SnapUpZA`
      : `${title} on @SnapUpZA`;
    const encoded = encodeURIComponent(text);
    const urlEncoded = encodeURIComponent(fullUrl);
    window.open(`https://twitter.com/intent/tweet?text=${encoded}&url=${urlEncoded}`, '_blank', 'noopener,noreferrer,width=600,height=400');
    setIsOpen(false);
  };

  const handleCopyLink = async () => {
    trackShareEvent('copy_link', contentType, contentId);
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      toast({ title: 'Link copied!', description: 'Share link has been copied to your clipboard.' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = fullUrl;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        toast({ title: 'Link copied!', description: 'Share link has been copied to your clipboard.' });
        setTimeout(() => setCopied(false), 2000);
      } catch {
        toast({ title: 'Copy failed', description: 'Please copy the URL manually.', variant: 'destructive' });
      }
      document.body.removeChild(textArea);
    }
    setIsOpen(false);
  };

  // Native share API (mobile)
  const handleNativeShare = async () => {
    if (navigator.share) {
      trackShareEvent('native', contentType, contentId);
      try {
        await navigator.share({
          title,
          text: price ? `${title} for ${price} on SnapUp` : `${title} on SnapUp`,
          url: fullUrl,
        });
      } catch (err: any) {
        // User cancelled - not an error
        if (err.name !== 'AbortError') {
          console.warn('Native share failed:', err);
        }
      }
      setIsOpen(false);
      return;
    }
    // If native share not available, toggle dropdown
    setIsOpen(!isOpen);
  };

  const shareOptions = [
    {
      label: 'WhatsApp',
      icon: <WhatsAppIcon className="w-4 h-4" />,
      onClick: handleWhatsApp,
      color: 'hover:bg-green-50 text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      label: 'Facebook',
      icon: <FacebookIcon className="w-4 h-4" />,
      onClick: handleFacebook,
      color: 'hover:bg-blue-50 text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      label: 'X (Twitter)',
      icon: <XIcon className="w-4 h-4" />,
      onClick: handleTwitter,
      color: 'hover:bg-gray-50 text-gray-800',
      bgColor: 'bg-gray-100',
    },
    {
      label: copied ? 'Copied!' : 'Copy Link',
      icon: copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />,
      onClick: handleCopyLink,
      color: copied ? 'hover:bg-emerald-50 text-emerald-600' : 'hover:bg-purple-50 text-purple-600',
      bgColor: copied ? 'bg-emerald-100' : 'bg-purple-100',
    },
  ];

  // Render trigger button based on variant
  const renderTrigger = () => {
    if (variant === 'icon') {
      return (
        <button
          onClick={handleNativeShare}
          className={`p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all ${className}`}
          title="Share"
          aria-label="Share"
        >
          <Share2 className="w-5 h-5" />
        </button>
      );
    }

    if (variant === 'compact') {
      return (
        <button
          onClick={handleNativeShare}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-all ${className}`}
        >
          <Share2 className="w-3.5 h-3.5" />
          Share
        </button>
      );
    }

    // Default 'button' variant
    return (
      <button
        onClick={handleNativeShare}
        className={`flex-1 flex items-center justify-center gap-2 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-all ${className}`}
      >
        <Share2 className="w-4 h-4" />
        Share
      </button>
    );
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {renderTrigger()}

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 bottom-full mb-2 right-0 w-56 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">Share via</span>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Share Options */}
          <div className="p-2">
            {shareOptions.map((option) => (
              <button
                key={option.label}
                onClick={option.onClick}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${option.color}`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${option.bgColor}`}>
                  {option.icon}
                </div>
                <span className="text-sm font-medium text-gray-700">{option.label}</span>
              </button>
            ))}
          </div>

          {/* URL Preview */}
          <div className="px-3 pb-3">
            <div className="bg-gray-50 rounded-lg px-3 py-2 flex items-center gap-2">
              <span className="text-[11px] text-gray-400 truncate flex-1 font-mono">{fullUrl}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShareButton;
