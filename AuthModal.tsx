import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn, signUp } from '@/lib/api';
import { SA_PROVINCES, type SAProvince } from '@/types';
import { X, Eye, EyeOff, Mail, Lock, User, MapPin, Shield, ArrowRight } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup';
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, initialMode = 'signin' }) => {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [province, setProvince] = useState<SAProvince>('Northern Cape');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [popiaConsent, setPopiaConsent] = useState(false);

  // Reset mode when initialMode changes
  React.useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === 'signup') {
        if (!popiaConsent) {
          toast({ title: 'POPIA Consent Required', description: 'Please accept the data processing terms to continue.', variant: 'destructive' });
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          toast({ title: 'Password too short', description: 'Password must be at least 6 characters.', variant: 'destructive' });
          setLoading(false);
          return;
        }
        await signUp(email, password, fullName, province);
        toast({ title: 'Account Created!', description: 'Welcome to SnapUp! Please check your email to verify your account.' });
      } else {
        await signIn(email, password);
        toast({ title: 'Welcome back!', description: 'You have successfully signed in.' });
      }
      onClose();
      // Reset form
      setEmail('');
      setPassword('');
      setFullName('');
      setPopiaConsent(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Something went wrong', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleGoToPage = (page: 'login' | 'signup') => {
    onClose();
    // Use window.location for navigation since we may not have router context
    window.location.href = page === 'login' ? '/login' : '/signup';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-7 text-white relative">
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all">
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <span className="text-xl font-black">S</span>
            </div>
            <span className="text-xl font-bold">SnapUp</span>
          </div>
          <h2 className="text-2xl font-bold">
            {mode === 'signin' ? 'Welcome Back' : 'Join SnapUp'}
          </h2>
          <p className="text-blue-100 mt-1 text-sm">
            {mode === 'signin' ? 'Sign in to your account to continue' : 'Create your free marketplace account'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                  placeholder="e.g. Thabo Mokoena"
                  required
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                placeholder="you@example.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-11 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                placeholder={mode === 'signup' ? 'Minimum 6 characters' : 'Enter your password'}
                minLength={6}
                required
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors" tabIndex={-1}>
                {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
              </button>
            </div>
          </div>

          {mode === 'signup' && (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Province</label>
                <div className="relative">
                  <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400 pointer-events-none" />
                  <select
                    value={province}
                    onChange={(e) => setProvince(e.target.value as SAProvince)}
                    className="w-full pl-11 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm appearance-none cursor-pointer"
                  >
                    {SA_PROVINCES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <svg className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* POPIA Consent */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-blue-800">POPIA Data Protection</p>
                    <p className="text-xs text-blue-700/80 mt-1 leading-relaxed">
                      In compliance with South Africa's Protection of Personal Information Act (POPIA), 
                      we process your data only for marketplace services. You can request access, 
                      correction, or deletion of your data at any time via{' '}
                      <a href="mailto:snapmart.officialapp@gmail.com" className="font-medium underline">
                        snapmart.officialapp@gmail.com
                      </a>.
                    </p>
                    <label className="flex items-center gap-2.5 mt-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={popiaConsent}
                        onChange={(e) => setPopiaConsent(e.target.checked)}
                        className="w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-xs text-blue-800 font-medium">
                        I consent to the processing of my personal information
                        <span className="text-red-500 ml-0.5">*</span>
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading || (mode === 'signup' && !popiaConsent)}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-200 active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                {mode === 'signin' ? 'Signing in...' : 'Creating account...'}
              </>
            ) : (
              <>
                {mode === 'signin' ? 'Sign In' : 'Create Account'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Divider */}
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-white px-3 text-gray-400 uppercase tracking-wider font-medium">or</span></div>
          </div>

          {/* Switch mode / Go to page */}
          <div className="text-center space-y-2">
            <p className="text-sm text-gray-500">
              {mode === 'signin' ? (
                <>Don't have an account?{' '}
                  <button type="button" onClick={() => setMode('signup')} className="font-semibold text-blue-600 hover:text-blue-700 hover:underline">
                    Sign Up
                  </button>
                </>
              ) : (
                <>Already have an account?{' '}
                  <button type="button" onClick={() => setMode('signin')} className="font-semibold text-blue-600 hover:text-blue-700 hover:underline">
                    Sign In
                  </button>
                </>
              )}
            </p>
            <p className="text-xs text-gray-400">
              Or use the{' '}
              <button type="button" onClick={() => handleGoToPage(mode === 'signin' ? 'login' : 'signup')} className="text-blue-500 hover:underline">
                full {mode === 'signin' ? 'login' : 'signup'} page
              </button>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AuthModal;
