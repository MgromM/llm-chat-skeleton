import { Rocket } from 'lucide-react';

export function BrandLogo({ size = 'base' }: { size?: 'base' | 'sm' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-bold ${size === 'sm' ? 'text-sm' : 'text-base'}`}>
      <Rocket className="-rotate-45 text-brand-red" size={size === 'sm' ? 15 : 18} />
      <span className="text-brand-dark">Wyślij</span>
      <span className="text-brand-red">Rakietę</span>
    </span>
  );
}
