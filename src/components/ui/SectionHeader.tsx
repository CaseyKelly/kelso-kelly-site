import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  className?: string;
  align?: 'left' | 'center';
}

export function SectionHeader({ title, subtitle, className, align = 'center' }: SectionHeaderProps) {
  return (
    <div className={cn('mb-12', align === 'center' && 'text-center', className)}>
      <h2 className="font-display text-3xl md:text-4xl font-bold text-white">{title}</h2>
      {subtitle && <p className="mt-4 text-lg text-zinc-400 max-w-2xl mx-auto">{subtitle}</p>}
    </div>
  );
}
