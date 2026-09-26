import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'My Finance | Personal Finance',
  description: 'A private, focused place for everyday finances.',
};

const themeBootstrap = `
try {
  const preference = localStorage.getItem('finance-theme') || 'light';
  const effective = preference === 'system'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : preference;
  document.documentElement.dataset.theme = effective;
} catch (_) {}
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }}/></head><body>{children}</body></html>;
}
