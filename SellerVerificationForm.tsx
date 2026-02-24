import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { uploadAvatar } from '@/lib/api';
import {
  BadgeCheck, Upload, Loader2, CheckCircle2, AlertTriangle, X,
  Shield, FileText, User, Camera, Eye, Clock, XCircle, ChevronDown
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface SellerVerificationFormProps {
  onVerificationSubmitted?: () => void;
}

type VerificationData = {
  id: string;
  full_legal_name: string;
  id_number: string;
  id_type: string;
  document_url: string;
  document_back_url?: string;
  selfie_url?: string;
  status: string;
  admin_notes?: string;
  created_at: string;
  reviewed_at?: string;
};

const SellerVerificationForm: React.FC<SellerVerificationFormProps> = ({ onVerificationSubmitted }) => {
  const { user, profile } = useAuth();
  const [existing, setExisting] = useState<VerificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [fullLegalName, setFullLegalName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [idType, setIdType] = useState<'sa_id' | 'passport'>('sa_id');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentPreview, setDocumentPreview] = useState<string | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadingBack, setUploadingBack] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadExistingVerification();
  }, [user]);

  const loadExistingVerification = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('seller_verifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!error && data) {
        setExisting(data);
        setFullLegalName(data.full_legal_name);
        setIdNumber(data.id_number);
        setIdType(data.id_type as 'sa_id' | 'passport');
      }
    } catch (err) {
      console.error('Failed to load verification:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'front' | 'back') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast({ title: 'Invalid file', description: 'Please select a JPEG, PNG, or WebP image.', variant: 'destructive' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 10MB.', variant: 'destructive' });
      return;
    }
    if (type === 'front') {
      setDocumentFile(file);
      setDocumentPreview(URL.createObjectURL(file));
    } else {
      setBackFile(file);
      setBackPreview(URL.createObjectURL(file));
    }
  };

  const validateSAID = (id: string): boolean => {
    if (id.length !== 13) return false;
    return /^\d{13}$/.test(id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!fullLegalName.trim()) {
      toast({ title: 'Name required', description: 'Enter your full legal name as on your ID.', variant: 'destructive' });
      return;
    }
    if (idType === 'sa_id' && !validateSAID(idNumber)) {
      toast({ title: 'Invalid ID number', description: 'SA ID must be exactly 13 digits.', variant: 'destructive' });
      return;
    }
    if (idType === 'passport' && idNumber.trim().length < 5) {
      toast({ title: 'Invalid passport number', description: 'Enter a valid passport number.', variant: 'destructive' });
      return;
    }
    if (!documentFile) {
      toast({ title: 'Document required', description: 'Please upload the front of your ID document.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      // Upload front document
      setUploadingDoc(true);
      const docUrl = await uploadAvatar(documentFile);
      setUploadingDoc(false);

      // Upload back if provided
      let backUrl: string | undefined;
      if (backFile) {
        setUploadingBack(true);
        backUrl = await uploadAvatar(backFile);
        setUploadingBack(false);
      }

      // Insert verification record
      const { error: insertError } = await supabase
        .from('seller_verifications')
        .insert({
          user_id: user.id,
          full_legal_name: fullLegalName.trim(),
          id_number: idNumber.trim(),
          id_type: idType,
          document_url: docUrl,
          document_back_url: backUrl || null,
          status: 'pending',
        });

      if (insertError) throw insertError;

      // Update profile verification status
      await supabase
        .from('profiles')
        .update({ verification_status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', user.id);

      toast({ title: 'Verification Submitted', description: 'Your ID verification is under review. You\'ll be notified once approved.' });
      await loadExistingVerification();
      onVerificationSubmitted?.();
    } catch (err: any) {
      toast({ title: 'Submission Failed', description: err.message || 'Failed to submit verification.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
      setUploadingDoc(false);
      setUploadingBack(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        </div>
      </div>
    );
  }

  // Already verified
  if (profile?.verified_seller) {
    return (
      <div className="bg-white rounded-2xl border border-emerald-200 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
            <BadgeCheck className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Verified Seller</h2>
            <p className="text-sm text-emerald-600">Your identity has been verified</p>
          </div>
        </div>
        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-800">Your seller account is verified. Buyers can see your verified badge.</span>
          </div>
        </div>
      </div>
    );
  }

  // Pending verification
  if (existing?.status === 'pending') {
    return (
      <div className="bg-white rounded-2xl border border-amber-200 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Verification Pending</h2>
            <p className="text-sm text-amber-600">Your documents are being reviewed</p>
          </div>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600" />
            <span className="text-sm text-amber-800">Submitted {new Date(existing.created_at).toLocaleDateString('en-ZA')}</span>
          </div>
          <p className="text-xs text-amber-700">Our team typically reviews verifications within 24-48 hours. You'll receive a notification once reviewed.</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">Name</p>
            <p className="text-sm font-medium text-gray-900">{existing.full_legal_name}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">ID Type</p>
            <p className="text-sm font-medium text-gray-900">{existing.id_type === 'sa_id' ? 'SA ID Card' : 'Passport'}</p>
          </div>
        </div>
      </div>
    );
  }

  // Rejected - can resubmit
  if (existing?.status === 'rejected') {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
            <XCircle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Verification Rejected</h2>
            <p className="text-sm text-red-600">Please review and resubmit</p>
          </div>
        </div>
        {existing.admin_notes && (
          <div className="bg-red-50 rounded-xl p-4 border border-red-100 mb-4">
            <p className="text-xs font-semibold text-red-800 mb-1">Reason:</p>
            <p className="text-sm text-red-700">{existing.admin_notes}</p>
          </div>
        )}
        <VerificationForm
          fullLegalName={fullLegalName}
          setFullLegalName={setFullLegalName}
          idNumber={idNumber}
          setIdNumber={setIdNumber}
          idType={idType}
          setIdType={setIdType}
          documentFile={documentFile}
          documentPreview={documentPreview}
          backFile={backFile}
          backPreview={backPreview}
          docInputRef={docInputRef}
          backInputRef={backInputRef}
          handleFileSelect={handleFileSelect}
          handleSubmit={handleSubmit}
          submitting={submitting}
          uploadingDoc={uploadingDoc}
          uploadingBack={uploadingBack}
          setDocumentFile={setDocumentFile}
          setDocumentPreview={setDocumentPreview}
          setBackFile={setBackFile}
          setBackPreview={setBackPreview}
        />
      </div>
    );
  }

  // New submission form
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
          <BadgeCheck className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Seller Verification</h2>
          <p className="text-sm text-gray-500">Verify your identity to earn a trusted seller badge</p>
        </div>
      </div>

      <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100 mb-6">
        <div className="flex items-start gap-2">
          <Shield className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-indigo-700 space-y-1">
            <p><strong>Why verify?</strong> Verified sellers get a badge on their profile and listings, increasing buyer trust and sales.</p>
            <p><strong>POPIA:</strong> Your ID documents are stored securely and only accessible to admin reviewers. They are deleted after verification.</p>
          </div>
        </div>
      </div>

      <VerificationForm
        fullLegalName={fullLegalName}
        setFullLegalName={setFullLegalName}
        idNumber={idNumber}
        setIdNumber={setIdNumber}
        idType={idType}
        setIdType={setIdType}
        documentFile={documentFile}
        documentPreview={documentPreview}
        backFile={backFile}
        backPreview={backPreview}
        docInputRef={docInputRef}
        backInputRef={backInputRef}
        handleFileSelect={handleFileSelect}
        handleSubmit={handleSubmit}
        submitting={submitting}
        uploadingDoc={uploadingDoc}
        uploadingBack={uploadingBack}
        setDocumentFile={setDocumentFile}
        setDocumentPreview={setDocumentPreview}
        setBackFile={setBackFile}
        setBackPreview={setBackPreview}
      />
    </div>
  );
};

// Sub-component for the actual form fields
const VerificationForm: React.FC<{
  fullLegalName: string; setFullLegalName: (v: string) => void;
  idNumber: string; setIdNumber: (v: string) => void;
  idType: 'sa_id' | 'passport'; setIdType: (v: 'sa_id' | 'passport') => void;
  documentFile: File | null; documentPreview: string | null;
  backFile: File | null; backPreview: string | null;
  docInputRef: React.RefObject<HTMLInputElement>;
  backInputRef: React.RefObject<HTMLInputElement>;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>, type: 'front' | 'back') => void;
  handleSubmit: (e: React.FormEvent) => void;
  submitting: boolean; uploadingDoc: boolean; uploadingBack: boolean;
  setDocumentFile: (f: File | null) => void; setDocumentPreview: (s: string | null) => void;
  setBackFile: (f: File | null) => void; setBackPreview: (s: string | null) => void;
}> = (props) => {
  return (
    <form onSubmit={props.handleSubmit} className="space-y-5">
      {/* ID Type */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Document Type <span className="text-red-500">*</span></label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'sa_id' as const, label: 'SA ID Card', desc: '13-digit SA ID number' },
            { value: 'passport' as const, label: 'Passport', desc: 'International passport' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => props.setIdType(opt.value)}
              className={`flex flex-col items-start p-3 rounded-xl border-2 transition-all text-left ${
                props.idType === opt.value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className={`text-sm font-semibold ${props.idType === opt.value ? 'text-indigo-700' : 'text-gray-700'}`}>{opt.label}</span>
              <span className="text-[10px] text-gray-500 mt-0.5">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Full Legal Name */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Legal Name <span className="text-red-500">*</span></label>
        <div className="relative">
          <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
          <input
            type="text"
            value={props.fullLegalName}
            onChange={(e) => props.setFullLegalName(e.target.value)}
            placeholder="As it appears on your ID"
            className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
            required
          />
        </div>
      </div>

      {/* ID Number */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          {props.idType === 'sa_id' ? 'SA ID Number' : 'Passport Number'} <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
          <input
            type="text"
            value={props.idNumber}
            onChange={(e) => {
              const val = props.idType === 'sa_id' ? e.target.value.replace(/\D/g, '').slice(0, 13) : e.target.value;
              props.setIdNumber(val);
            }}
            placeholder={props.idType === 'sa_id' ? '8501015800088' : 'A12345678'}
            maxLength={props.idType === 'sa_id' ? 13 : 20}
            className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm font-mono"
            required
          />
        </div>
        {props.idType === 'sa_id' && (
          <p className="text-xs text-gray-400 mt-1">{props.idNumber.length}/13 digits</p>
        )}
      </div>

      {/* Front of ID */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          Front of {props.idType === 'sa_id' ? 'ID Card' : 'Passport'} <span className="text-red-500">*</span>
        </label>
        {!props.documentPreview ? (
          <div
            onClick={() => props.docInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-all group"
          >
            <Camera className="w-8 h-8 mx-auto mb-2 text-gray-400 group-hover:text-indigo-500 transition-colors" />
            <p className="text-sm font-medium text-gray-600 group-hover:text-indigo-600">Upload front of ID</p>
            <p className="text-xs text-gray-400 mt-1">JPEG, PNG, or WebP (max 10MB)</p>
          </div>
        ) : (
          <div className="relative rounded-xl overflow-hidden border-2 border-indigo-200">
            <img src={props.documentPreview} alt="ID front" className="w-full h-40 object-cover" />
            <button
              type="button"
              onClick={() => { props.setDocumentFile(null); props.setDocumentPreview(null); }}
              className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 shadow-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <input ref={props.docInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => props.handleFileSelect(e, 'front')} className="hidden" />
      </div>

      {/* Back of ID (optional) */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          Back of ID <span className="text-xs text-gray-400 font-normal">(optional, recommended)</span>
        </label>
        {!props.backPreview ? (
          <div
            onClick={() => props.backInputRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-gray-300 hover:bg-gray-50 transition-all group"
          >
            <Upload className="w-6 h-6 mx-auto mb-1 text-gray-300 group-hover:text-gray-400 transition-colors" />
            <p className="text-xs text-gray-500">Upload back of ID (optional)</p>
          </div>
        ) : (
          <div className="relative rounded-xl overflow-hidden border-2 border-gray-200">
            <img src={props.backPreview} alt="ID back" className="w-full h-32 object-cover" />
            <button
              type="button"
              onClick={() => { props.setBackFile(null); props.setBackPreview(null); }}
              className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 shadow-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <input ref={props.backInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => props.handleFileSelect(e, 'back')} className="hidden" />
      </div>

      {/* POPIA Notice */}
      <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
        <div className="flex items-start gap-2">
          <Shield className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">
            <strong>POPIA Compliance:</strong> Your ID documents are encrypted and stored securely. They are only accessible to authorized admin reviewers for verification purposes. Documents may be deleted after successful verification per data minimization principles.
          </p>
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={props.submitting || !props.documentFile}
        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-200 text-sm"
      >
        {props.submitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {props.uploadingDoc ? 'Uploading document...' : props.uploadingBack ? 'Uploading back...' : 'Submitting...'}
          </>
        ) : (
          <>
            <BadgeCheck className="w-4 h-4" />
            Submit for Verification
          </>
        )}
      </button>
    </form>
  );
};

export default SellerVerificationForm;
