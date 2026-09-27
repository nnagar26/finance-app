import { Banknote, CarFront, Coffee, CreditCard, Fuel, Gift, HeartPulse, House, Landmark, Laptop, Lightbulb, MoreHorizontal, Plane, Repeat2, ShoppingBag, ShoppingCart, Smartphone, Tag, Utensils, Wallet, Wrench } from 'lucide-react';
import { createElement } from 'react';
import type { LucideIcon } from 'lucide-react';

type ReferenceKind = 'category' | 'payment';

function iconFor(kind: ReferenceKind, name: string): LucideIcon {
  const label = name.trim().toLowerCase();
  if (kind === 'payment') {
    if (/cash/.test(label)) return Banknote;
    if (/e-?transfer|wire|interac/.test(label)) return Repeat2;
    if (/apple pay|google pay|wallet/.test(label)) return Smartphone;
    if (/bank|chequ|check/.test(label)) return Landmark;
    if (/card|visa|mastercard|amex|debit|credit/.test(label)) return CreditCard;
    return Wallet;
  }
  if (/grocer|supermarket|food store/.test(label)) return ShoppingCart;
  if (/coffee|cafe/.test(label)) return Coffee;
  if (/dining|restaurant|takeout/.test(label)) return Utensils;
  if (/rent|mortgage|home|house/.test(label)) return House;
  if (/electric|utilit|hydro/.test(label)) return Lightbulb;
  if (/gas|fuel/.test(label)) return Fuel;
  if (/car|auto|vehicle|transport|parking|transit/.test(label)) return CarFront;
  if (/insurance|health|medical/.test(label)) return HeartPulse;
  if (/internet|wifi|wi-fi|web|software/.test(label)) return Laptop;
  if (/phone|mobile/.test(label)) return Smartphone;
  if (/shopping|clothes|household|supplies/.test(label)) return ShoppingBag;
  if (/travel|flight|hotel|vacation/.test(label)) return Plane;
  if (/gift/.test(label)) return Gift;
  if (/subscription|stream|entertainment/.test(label)) return Repeat2;
  if (/bank|fee|loan|salary|income|paycheck/.test(label)) return Banknote;
  if (/repair|maintenance/.test(label)) return Wrench;
  if (/misc|other|uncategorized/.test(label)) return MoreHorizontal;
  return Tag;
}

export default function ReferenceIcon({ kind, name, size = 16 }: { kind: ReferenceKind; name: string; size?: number }) {
  return createElement(iconFor(kind, name), { size, strokeWidth: 1.9, 'aria-hidden': true, focusable: false });
}
