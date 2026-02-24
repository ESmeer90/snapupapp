import React from 'react';
import { Camera, MessageSquare, Handshake, Shield, Zap, MapPin } from 'lucide-react';

const features = [
  {
    icon: <Camera className="w-6 h-6" />,
    title: 'Snap & List',
    description: 'Take a photo, set your price, and your listing is live in seconds.',
    color: 'bg-blue-100 text-blue-600',
  },
  {
    icon: <MessageSquare className="w-6 h-6" />,
    title: 'Chat Safely',
    description: 'Message buyers and sellers directly through our secure platform.',
    color: 'bg-emerald-100 text-emerald-600',
  },
  {
    icon: <Handshake className="w-6 h-6" />,
    title: 'Meet & Deal',
    description: 'Arrange a safe meetup and complete your transaction locally.',
    color: 'bg-amber-100 text-amber-600',
  },
  {
    icon: <Shield className="w-6 h-6" />,
    title: 'POPIA Protected',
    description: 'Your personal data is secured under South African privacy law.',
    color: 'bg-purple-100 text-purple-600',
  },
  {
    icon: <Zap className="w-6 h-6" />,
    title: 'Instant Listings',
    description: 'No approval wait times. Your ad goes live immediately.',
    color: 'bg-rose-100 text-rose-600',
  },
  {
    icon: <MapPin className="w-6 h-6" />,
    title: 'All 9 Provinces',
    description: 'From Cape Town to Limpopo — find deals near you across SA.',
    color: 'bg-cyan-100 text-cyan-600',
  },
];

const FeaturesSection: React.FC = () => {
  return (
    <section className="bg-gray-50 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900">How SnapUp Works</h2>
          <p className="text-gray-500 mt-2 max-w-lg mx-auto">
            The easiest way to buy and sell in South Africa. Simple, safe, and free.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl p-6 border border-gray-200 hover:shadow-lg hover:border-gray-300 transition-all duration-300 group"
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${feature.color} group-hover:scale-110 transition-transform`}>
                {feature.icon}
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">{feature.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
