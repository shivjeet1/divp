import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Decentralized Identity Verification Pipeline',
  description:
    'Sign-In with Ethereum (EIP-4361) to secure Web2 session bridge with on-chain authorization.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
