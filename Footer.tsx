import React from 'react';
import { Mail, MapPin, Phone, Shield, Facebook, Twitter, Instagram, ExternalLink, Package } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-900 text-gray-300">
      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                <span className="text-white font-black text-lg">S</span>
              </div>
              <span className="text-xl font-bold text-white">Snap<span className="text-blue-400">Up</span></span>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed mb-4">
              South Africa's trusted online marketplace. Buy and sell anything locally with confidence. 
              POPIA compliant and secure.
            </p>
            <div className="flex items-center gap-3">
              <a href="#" className="w-9 h-9 bg-gray-800 hover:bg-blue-600 rounded-lg flex items-center justify-center transition-colors">
                <Facebook className="w-4 h-4" />
              </a>
              <a href="#" className="w-9 h-9 bg-gray-800 hover:bg-blue-600 rounded-lg flex items-center justify-center transition-colors">
                <Twitter className="w-4 h-4" />
              </a>
              <a href="#" className="w-9 h-9 bg-gray-800 hover:bg-blue-600 rounded-lg flex items-center justify-center transition-colors">
                <Instagram className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-3 text-sm">
              <li><a href="/" className="hover:text-blue-400 transition-colors">Browse Listings</a></li>
              <li><a href="/post-item" className="hover:text-blue-400 transition-colors">Post an Ad</a></li>
              <li>
                <a href="/track" className="hover:text-blue-400 transition-colors flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-blue-400" />
                  Track Order
                </a>
              </li>
              <li><a href="/signup" className="hover:text-blue-400 transition-colors">Create Account</a></li>
              <li><a href="/login" className="hover:text-blue-400 transition-colors">Sign In</a></li>
              <li><a href="/settings" className="hover:text-blue-400 transition-colors">Account Settings</a></li>
              <li>
                <a href="/buyer-protection" className="hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  Buyer Protection
                </a>
              </li>
            </ul>

          </div>

          {/* Categories */}
          <div>
            <h3 className="text-white font-semibold mb-4">Categories</h3>
            <ul className="space-y-3 text-sm">
              <li><button className="hover:text-blue-400 transition-colors">Electronics</button></li>
              <li><button className="hover:text-blue-400 transition-colors">Vehicles</button></li>
              <li><button className="hover:text-blue-400 transition-colors">Property</button></li>
              <li><button className="hover:text-blue-400 transition-colors">Fashion</button></li>
              <li><button className="hover:text-blue-400 transition-colors">Furniture</button></li>
              <li><button className="hover:text-blue-400 transition-colors">Jobs</button></li>
            </ul>
          </div>

          {/* Contact & Legal */}
          <div>
            <h3 className="text-white font-semibold mb-4">Contact & Legal</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <a href="mailto:snapmart.officialapp@gmail.com" className="hover:text-blue-400 transition-colors">
                  snapmart.officialapp@gmail.com
                </a>
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <span>Kimberley, Northern Cape, SA</span>
              </li>
              <li className="mt-4">
                <a href="/privacy-policy" className="hover:text-blue-400 transition-colors flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-blue-400" />
                  Privacy Policy (POPIA)
                </a>
              </li>
              <li>
                <a href="/terms-of-service" className="hover:text-blue-400 transition-colors flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-blue-400" />
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="/buyer-protection" className="hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  Buyer Protection Policy
                </a>
              </li>
              <li>
                <a href="/privacy-policy#data-subject-rights" className="hover:text-blue-400 transition-colors">
                  Your Data Rights
                </a>
              </li>
              <li>
                <a href="/settings" className="hover:text-blue-400 transition-colors">
                  Account & Data Management
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>


      {/* Buyer Protection Banner */}
      <div className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <a href="/buyer-protection" className="flex items-center justify-center gap-2 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
            <Shield className="w-4 h-4" />
            <span>
              Buyer Protection: Every eligible purchase covered up to R5,000.{' '}
              <span className="underline">Learn more</span>
            </span>
          </a>
        </div>
      </div>

      {/* POPIA Compliance Bar */}
      <div className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Shield className="w-4 h-4 text-blue-500" />
              <span>
                POPIA Compliant |{' '}
                <a href="/privacy-policy" className="text-blue-400 hover:underline">
                  Your personal data is protected under South Africa's Protection of Personal Information Act
                </a>
              </span>
            </div>
            <p className="text-xs text-gray-500">
              &copy; {new Date().getFullYear()} SnapUp Marketplace. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
