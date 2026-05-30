import {
  Package, ShoppingCart, Warehouse, ChefHat, Store, Lock, BookOpen,
  Users, Briefcase, Settings, Home, BarChart3, ClipboardList, Truck,
  DollarSign, Tag, Receipt, Calendar, Star, Zap, Box, Archive, Layers,
  Clock, Bell, Globe, TrendingUp, Calculator, Utensils, UtensilsCrossed,
  Flame, Thermometer, Building2, Award, Shield, CreditCard, PieChart,
  FileText, Coffee, Grid3x3, Boxes, Wrench,
  type LucideIcon,
} from 'lucide-react';

export const MODULE_ICON_MAP: Record<string, LucideIcon> = {
  'package':           Package,
  'shopping-cart':     ShoppingCart,
  'warehouse':         Warehouse,
  'chef-hat':          ChefHat,
  'store':             Store,
  'lock':              Lock,
  'book-open':         BookOpen,
  'users':             Users,
  'briefcase':         Briefcase,
  'settings':          Settings,
  'home':              Home,
  'bar-chart-3':       BarChart3,
  'clipboard-list':    ClipboardList,
  'truck':             Truck,
  'dollar-sign':       DollarSign,
  'tag':               Tag,
  'receipt':           Receipt,
  'calendar':          Calendar,
  'star':              Star,
  'zap':               Zap,
  'box':               Box,
  'archive':           Archive,
  'layers':            Layers,
  'clock':             Clock,
  'bell':              Bell,
  'globe':             Globe,
  'trending-up':       TrendingUp,
  'calculator':        Calculator,
  'utensils':          Utensils,
  'utensils-crossed':  UtensilsCrossed,
  'flame':             Flame,
  'thermometer':       Thermometer,
  'building-2':        Building2,
  'award':             Award,
  'shield':            Shield,
  'credit-card':       CreditCard,
  'pie-chart':         PieChart,
  'file-text':         FileText,
  'coffee':            Coffee,
  'grid-3x3':          Grid3x3,
  'boxes':             Boxes,
  'wrench':            Wrench,
};

export const MODULE_ICON_GROUPS: Array<{ label: string; icons: string[] }> = [
  {
    label: 'Cocina',
    icons: ['chef-hat', 'utensils', 'utensils-crossed', 'flame', 'thermometer', 'coffee', 'book-open'],
  },
  {
    label: 'Ventas',
    icons: ['shopping-cart', 'store', 'dollar-sign', 'credit-card', 'receipt', 'tag', 'trending-up', 'bar-chart-3', 'pie-chart', 'calculator'],
  },
  {
    label: 'Inventario',
    icons: ['package', 'box', 'boxes', 'archive', 'warehouse', 'truck', 'layers', 'grid-3x3'],
  },
  {
    label: 'Gestión',
    icons: ['users', 'briefcase', 'clipboard-list', 'calendar', 'clock', 'bell', 'settings', 'file-text', 'globe', 'building-2', 'shield', 'lock', 'award', 'star', 'zap', 'wrench'],
  },
];

export function resolveModuleIcon(key: string | null | undefined): LucideIcon {
  if (key && MODULE_ICON_MAP[key]) return MODULE_ICON_MAP[key];
  return Package;
}
