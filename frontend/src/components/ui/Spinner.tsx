interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'dark' | 'white' | 'brand';
  className?: string;
}

const sizeClasses = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' };
const colorClasses = {
  dark: 'border-gray-200 border-t-[#111111]',
  white: 'border-white/30 border-t-white',
  brand: 'border-[#69E7A8]/30 border-t-[#69E7A8]',
};

export function Spinner({ size = 'md', color = 'dark', className = '' }: SpinnerProps) {
  return (
    <div
      className={`rounded-full border-2 animate-spin ${sizeClasses[size]} ${colorClasses[color]} ${className}`}
    />
  );
}

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <Spinner size="lg" />
    </div>
  );
}
