import React from 'react';
import { X, Check, CheckCheck, Clock, Eye } from 'lucide-react';
import type { Message } from '@/types';

interface MessageInfoModalProps {
  message: Message;
  isMine: boolean;
  onClose: () => void;
}

const MessageInfoModal: React.FC<MessageInfoModalProps> = ({ message, isMine, onClose }) => {
  const formatFullTimestamp = (dateStr?: string | null) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return d.toLocaleString('en-ZA', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getDeliveryStatus = (): 'sent' | 'delivered' | 'read' => {
    if (message.is_read && message.read_at) return 'read';
    if (message.delivered_at) return 'delivered';
    return 'sent';
  };

  const status = getDeliveryStatus();

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">Message Info</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message Preview */}
        <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
          <div className={`inline-block max-w-full ${isMine ? 'ml-auto' : ''}`}>
            <div
              className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                isMine
                  ? 'bg-blue-600 text-white rounded-br-md'
                  : 'bg-white text-gray-800 border border-gray-200 rounded-bl-md'
              }`}
              style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
            >
              {message.image_url && !message.content && (
                <span className="text-xs opacity-80">Photo</span>
              )}
              {message.content || (message.image_url ? '' : '...')}
            </div>
          </div>
        </div>

        {/* Status Timeline */}
        <div className="px-5 py-4 space-y-4">
          {/* Sent */}
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
              <Check className="w-4 h-4 text-gray-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900">Sent</p>
                <div className="flex items-center gap-0.5">
                  <Check className="w-3.5 h-3.5 text-gray-400" />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {formatFullTimestamp(message.created_at)}
              </p>
            </div>
          </div>

          {/* Delivered */}
          <div className="flex items-start gap-3">
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
              status === 'delivered' || status === 'read' ? 'bg-gray-100' : 'bg-gray-50'
            }`}>
              <CheckCheck className={`w-4 h-4 ${
                status === 'delivered' || status === 'read' ? 'text-gray-500' : 'text-gray-300'
              }`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={`text-sm font-medium ${
                  status === 'delivered' || status === 'read' ? 'text-gray-900' : 'text-gray-400'
                }`}>
                  Delivered
                </p>
                {(status === 'delivered' || status === 'read') && (
                  <div className="flex items-center gap-0.5">
                    <CheckCheck className="w-3.5 h-3.5 text-gray-400" />
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {message.delivered_at
                  ? formatFullTimestamp(message.delivered_at)
                  : isMine
                    ? 'Not yet delivered'
                    : 'N/A'
                }
              </p>
            </div>
          </div>

          {/* Read */}
          <div className="flex items-start gap-3">
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
              status === 'read' ? 'bg-blue-50' : 'bg-gray-50'
            }`}>
              <Eye className={`w-4 h-4 ${
                status === 'read' ? 'text-blue-600' : 'text-gray-300'
              }`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={`text-sm font-medium ${
                  status === 'read' ? 'text-gray-900' : 'text-gray-400'
                }`}>
                  Read
                </p>
                {status === 'read' && (
                  <div className="flex items-center gap-0.5">
                    <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {message.read_at
                  ? formatFullTimestamp(message.read_at)
                  : isMine
                    ? 'Not yet read'
                    : 'N/A'
                }
              </p>
            </div>
          </div>
        </div>

        {/* Current Status Summary */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Current status:</span>
            {status === 'read' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                <CheckCheck className="w-3 h-3" />
                Read
              </span>
            )}
            {status === 'delivered' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-200 text-gray-700 rounded-full text-xs font-medium">
                <CheckCheck className="w-3 h-3" />
                Delivered
              </span>
            )}
            {status === 'sent' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full text-xs font-medium">
                <Check className="w-3 h-3" />
                Sent
              </span>
            )}
          </div>
        </div>

        {/* Close Button */}
        <div className="px-5 py-3 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default MessageInfoModal;
