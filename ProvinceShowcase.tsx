import React from 'react';
import { MapPin } from 'lucide-react';

const provinces = [
  { name: 'Gauteng', city: 'Johannesburg', image: 'https://images.unsplash.com/photo-1577948000111-9c970dfe3743?w=400&h=300&fit=crop', listings: '12K+' },
  { name: 'Western Cape', city: 'Cape Town', image: 'https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=400&h=300&fit=crop', listings: '8K+' },
  { name: 'KwaZulu-Natal', city: 'Durban', image: 'https://images.unsplash.com/photo-1597911929429-58e4e2a5e7d6?w=400&h=300&fit=crop', listings: '5K+' },
  { name: 'Eastern Cape', city: 'Port Elizabeth', image: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=400&h=300&fit=crop', listings: '3K+' },
  { name: 'Free State', city: 'Bloemfontein', image: 'https://images.unsplash.com/photo-1489392191049-fc10c97e64b6?w=400&h=300&fit=crop', listings: '2K+' },
  { name: 'Northern Cape', city: 'Kimberley', image: 'https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=400&h=300&fit=crop', listings: '1.5K+' },
  { name: 'Limpopo', city: 'Polokwane', image: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=400&h=300&fit=crop', listings: '2K+' },
  { name: 'Mpumalanga', city: 'Nelspruit', image: 'https://images.unsplash.com/photo-1518709766631-a6a7f45921c3?w=400&h=300&fit=crop', listings: '1.8K+' },
  { name: 'North West', city: 'Mahikeng', image: 'https://images.unsplash.com/photo-1489392191049-fc10c97e64b6?w=400&h=300&fit=crop', listings: '1.2K+' },
];

interface ProvinceShowcaseProps {
  onSelectProvince: (province: string) => void;
}

const ProvinceShowcase: React.FC<ProvinceShowcaseProps> = ({ onSelectProvince }) => {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold text-gray-900">Shop by Province</h2>
        <p className="text-gray-500 mt-2">Find great deals in your area across all 9 South African provinces</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-4">
        {provinces.map((prov) => (
          <button
            key={prov.name}
            onClick={() => onSelectProvince(prov.name)}
            className="group relative overflow-hidden rounded-2xl aspect-[3/2] cursor-pointer"
          >
            <img
              src={prov.image}
              alt={prov.name}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <h3 className="text-white font-bold text-lg">{prov.name}</h3>
              <div className="flex items-center justify-between mt-1">
                <span className="text-white/80 text-sm flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {prov.city}
                </span>
                <span className="text-blue-400 text-sm font-semibold">{prov.listings} ads</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
};

export default ProvinceShowcase;
