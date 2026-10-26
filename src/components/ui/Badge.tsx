import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'amber' | 'green' | 'red';
  className?: string;
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium',
        {
          'bg-zinc-800 text-zinc-300': variant === 'default',
          'bg-amber-500/20 text-amber-400 border border-amber-500/30': variant === 'amber',
          'bg-green-500/20 text-green-400 border border-green-500/30': variant === 'green',
          'bg-red-500/20 text-red-400 border border-red-500/30': variant === 'red',
        },
        className
      )}
    >
      {children}
    </span>
  );
}
