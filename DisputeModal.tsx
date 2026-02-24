import React, { useState } from 'react';
import { createDispute, uploadDisputeEvidence, formatZAR } from '@/lib/api';
import { DISPUTE_REASON_LABELS, type DisputeReason } from '@/types';
import {
  X, AlertTriangle, Camera, Loader2, Shield, Upload, CheckCircle2,
  Package, FileWarning, Ban, HelpCircle
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface DisputeModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderTitle: string;
  orderAmount: number;
  orderImage?: string;
  onDisputeCreated: () => void;
}

const REASON_ICONS: Record<DisputeReason, React.ReactNode> = {
  item_not_received: <Package className="w-5 h-5" />,
  item_not_as_described: <FileWarning className="w-5 h-5" />,
  damaged: <AlertTriangle className="w-5 h-5" />,
  wrong_item: <Ban className="w-5 h-5" />,
  other: <HelpCircle className="w-5 h-5" />,
};

const DisputeModal: React.FC<DisputeModalProps> = ({
  isOpen, onClose, orderId, orderTitle, orderAmount, orderImage, onDisputeCreated
}) => {
  const [reason, setReason] = useState<DisputeReason | ''>('');
  const [description, setDescription] = useState('');
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'reason' | 'details' | 'confirm'>('reason');
  const [consentGiven, setConsentGiven] = useState(false);

  if (!isOpen) return null;

  const handleEvidenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (evidenceUrls.length >= 3) {
      toast({ title: 'Maximum photos', description: 'You can upload up to 3 evidence photos.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const remaining = 3 - evidenceUrls.length;
      const filesToUpload = Array.from(files).slice(0, remaining);
      const urls = await Promise.all(filesToUpload.map(f => uploadDisputeEvidence(f)));
      setEvidenceUrls(prev => [...prev, ...urls]);
      toast({ title: 'Evidence uploaded', description: `${urls.length} photo(s) uploaded.` });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message || 'Failed to upload evidence.', variant: 'destructive' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeEvidence = (index: number) => {
    setEvidenceUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!reason || !description.trim()) {
      toast({ title: 'Missing info', description: 'Please select a reason and provide a description.', variant: 'destructive' });
      return;
    }
    if (!consentGiven) {
      toast({ title: 'Consent required', description: 'Please agree to the POPIA data processing consent.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      await createDispute({
        order_id: orderId,
        reason: reason as DisputeReason,
        description: description.trim(),
        evidence_urls: evidenceUrls,
      });
      toast({ title: 'Dispute submitted', description: 'Your dispute has been submitted. The seller will be notified.' });
      onDisputeCreated();
      onClose();
    } catch (err: any) {
      toast({ title: 'Failed to submit', description: err.message || 'Something went wrong.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl my-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-red-600 to-orange-600 rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-white">Report an Issue</h2>
            <p className="text-sm text-red-100">Order: {orderTitle}</p>
          </div>
          <button onClick={onClose} className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Order Summary */}
        <div className="px-6 pt-4">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            {orderImage && (
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                <img src={orderImage} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{orderTitle}</p>
              <p className="text-sm font-bold text-gray-700">{formatZAR(orderAmount)}</p>
            </div>
          </div>
        </div>

        {/* Step Progress */}
        <div className="px-6 pt-4">
          <div className="flex items-center gap-2">
            {['reason', 'details', 'confirm'].map((s, i) => (
              <React.Fragment key={s}>
                <div className={`flex items-center gap-1.5 ${
                  step === s ? 'text-red-600' : i < ['reason', 'details', 'confirm'].indexOf(step) ? 'text-emerald-600' : 'text-gray-400'
                }`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    step === s ? 'bg-red-100 text-red-600' : i < ['reason', 'details', 'confirm'].indexOf(step) ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {i < ['reason', 'details', 'confirm'].indexOf(step) ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className="text-xs font-medium hidden sm:inline">{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                </div>
                {i < 2 && <div className={`flex-1 h-0.5 ${i < ['reason', 'details', 'confirm'].indexOf(step) ? 'bg-emerald-300' : 'bg-gray-200'}`} />}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="p-6 space-y-4 max-h-[55vh] overflow-y-auto">
          {/* Step 1: Select Reason */}
          {step === 'reason' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 font-medium">What went wrong with your order?</p>
              <div className="space-y-2">
                {(Object.entries(DISPUTE_REASON_LABELS) as [DisputeReason, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setReason(key)}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-left ${
                      reason === key
                        ? 'border-red-400 bg-red-50 text-red-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      reason === key ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {REASON_ICONS[key]}
                    </div>
                    <span className="text-sm font-medium">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Description + Evidence */}
          {step === 'details' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Describe the issue <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Please describe the issue in detail. What happened? What did you expect?"
                  rows={4}
                  maxLength={1000}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none resize-none bg-gray-50 focus:bg-white transition-all text-sm"
                />
                <p className="text-xs text-gray-400 mt-1 text-right">{description.length}/1000</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Photo Evidence <span className="text-xs text-gray-400 font-normal">(optional, max 3)</span>
                </label>
                <div className="flex flex-wrap gap-3">
                  {evidenceUrls.map((url, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border-2 border-gray-200 group">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeEvidence(i)}
                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                      >
                        <X className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  ))}
                  {evidenceUrls.length < 3 && (
                    <label className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-red-400 hover:bg-red-50 transition-all">
                      {uploading ? (
                        <Loader2 className="w-5 h-5 text-red-500 animate-spin" />
                      ) : (
                        <>
                          <Camera className="w-4 h-4 text-gray-400" />
                          <span className="text-[10px] text-gray-400 mt-0.5">Add Photo</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        onChange={handleEvidenceUpload}
                        className="hidden"
                        disabled={uploading}
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-amber-800 mb-2">Dispute Summary</h4>
                <div className="space-y-1.5 text-sm text-amber-700">
                  <p><span className="font-medium">Reason:</span> {reason ? DISPUTE_REASON_LABELS[reason as DisputeReason] : ''}</p>
                  <p><span className="font-medium">Description:</span> {description.substring(0, 100)}{description.length > 100 ? '...' : ''}</p>
                  <p><span className="font-medium">Evidence:</span> {evidenceUrls.length} photo(s)</p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-start gap-2">
                  <Shield className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-blue-800">POPIA Data Processing Consent</p>
                    <p className="text-xs text-blue-700 mt-1">
                      By submitting this dispute, you consent to SnapUp processing the information provided
                      (description, photos) for the purpose of resolving this dispute. Data will be shared with
                      the seller and retained only as long as necessary. You can request deletion after resolution.
                    </p>
                  </div>
                </div>
                <label className="flex items-center gap-2 mt-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentGiven}
                    onChange={e => setConsentGiven(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs text-blue-800 font-medium">I consent to the processing of my dispute data</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-200">
          {step !== 'reason' && (
            <button
              onClick={() => setStep(step === 'confirm' ? 'details' : 'reason')}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
            >
              Back
            </button>
          )}
          <div className="flex-1" />
          {step === 'reason' && (
            <button
              onClick={() => { if (reason) setStep('details'); }}
              disabled={!reason}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          )}
          {step === 'details' && (
            <button
              onClick={() => { if (description.trim().length >= 10) setStep('confirm'); else toast({ title: 'Too short', description: 'Please provide at least 10 characters.', variant: 'destructive' }); }}
              disabled={description.trim().length < 10}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          )}
          {step === 'confirm' && (
            <button
              onClick={handleSubmit}
              disabled={submitting || !consentGiven}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : 'Submit Dispute'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DisputeModal;
