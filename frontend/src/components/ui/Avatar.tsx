/**
 * Avatar con iniciales y gradiente determinístico por nombre.
 * Compartido entre módulos de negocio (Personal Shopper, Importaciones).
 */

const AVATAR_GRADIENTS = [
  'from-rose-400 to-pink-500',
  'from-fuchsia-400 to-purple-500',
  'from-amber-400 to-rose-500',
  'from-sky-400 to-indigo-500',
  'from-emerald-400 to-teal-500',
  'from-orange-400 to-pink-500',
  'from-violet-400 to-fuchsia-500',
];

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const getGradient = (name: string) => {
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
};

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <div
      className={`shrink-0 rounded-full bg-gradient-to-br ${getGradient(name)}
                  flex items-center justify-center text-white font-bold shadow-sm`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {getInitials(name)}
    </div>
  );
}
