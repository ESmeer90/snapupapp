import { useEffect } from 'react';

interface SEOHeadProps {
  title?: string;
  description?: string;
  canonical?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: string;
  ogUrl?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  noIndex?: boolean;
  jsonLd?: Record<string, any>;
}

const BASE_TITLE = 'SnapUp';
const BASE_URL = 'https://snapup.co.za';
const DEFAULT_DESCRIPTION = "South Africa's trusted online marketplace. Buy and sell electronics, vehicles, fashion, furniture and more. Secure payments, buyer protection, POPIA compliant.";
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.png`;

function setMetaTag(property: string, content: string, isProperty = false) {
  const attr = isProperty ? 'property' : 'name';
  let element = document.querySelector(`meta[${attr}="${property}"]`) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attr, property);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function setCanonical(url: string) {
  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', url);
}

function setJsonLd(data: Record<string, any>, id: string) {
  let script = document.getElementById(id) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.id = id;
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

function removeJsonLd(id: string) {
  const script = document.getElementById(id);
  if (script) {
    script.remove();
  }
}

/**
 * SEOHead - Lightweight dynamic head management for SnapUp pages.
 * Updates document title, meta description, OG tags, Twitter cards,
 * canonical URL, and JSON-LD structured data per page.
 * 
 * No external dependencies required (replaces react-helmet-async).
 */
const SEOHead: React.FC<SEOHeadProps> = ({
  title,
  description,
  canonical,
  ogTitle,
  ogDescription,
  ogImage,
  ogType = 'website',
  ogUrl,
  twitterTitle,
  twitterDescription,
  twitterImage,
  noIndex = false,
  jsonLd,
}) => {
  useEffect(() => {
    // Store original values for cleanup
    const originalTitle = document.title;

    // Set document title
    const fullTitle = title ? `${title} | ${BASE_TITLE}` : `${BASE_TITLE} - Buy & Sell in South Africa | Trusted Online Marketplace`;
    document.title = fullTitle;

    // Meta description
    const desc = description || DEFAULT_DESCRIPTION;
    setMetaTag('description', desc);
    setMetaTag('title', fullTitle);

    // Robots
    if (noIndex) {
      setMetaTag('robots', 'noindex, nofollow');
    } else {
      setMetaTag('robots', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
    }

    // Canonical URL
    const canonicalUrl = canonical ? `${BASE_URL}${canonical}` : BASE_URL;
    setCanonical(canonicalUrl);

    // Open Graph
    setMetaTag('og:title', ogTitle || fullTitle, true);
    setMetaTag('og:description', ogDescription || desc, true);
    setMetaTag('og:image', ogImage || DEFAULT_OG_IMAGE, true);
    setMetaTag('og:type', ogType, true);
    setMetaTag('og:url', ogUrl ? `${BASE_URL}${ogUrl}` : canonicalUrl, true);
    setMetaTag('og:site_name', 'SnapUp', true);
    setMetaTag('og:locale', 'en_ZA', true);

    // Twitter Card
    setMetaTag('twitter:card', 'summary_large_image');
    setMetaTag('twitter:title', twitterTitle || ogTitle || fullTitle);
    setMetaTag('twitter:description', twitterDescription || ogDescription || desc);
    setMetaTag('twitter:image', twitterImage || ogImage || DEFAULT_OG_IMAGE);
    setMetaTag('twitter:url', ogUrl ? `${BASE_URL}${ogUrl}` : canonicalUrl);

    // JSON-LD (page-specific)
    if (jsonLd) {
      setJsonLd({ '@context': 'https://schema.org', ...jsonLd }, 'seo-page-jsonld');
    }

    // Cleanup on unmount - restore defaults
    return () => {
      document.title = originalTitle;
      removeJsonLd('seo-page-jsonld');
    };
  }, [title, description, canonical, ogTitle, ogDescription, ogImage, ogType, ogUrl, twitterTitle, twitterDescription, twitterImage, noIndex, jsonLd]);

  return null; // This component renders nothing - it only manages <head>
};

export default SEOHead;
