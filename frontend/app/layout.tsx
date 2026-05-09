import './global.css'
import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'

export const metadata: Metadata = {
  title: 'Web3 Transaction Risk Review — AML Demo',
  description:
    'A transaction-level risk review prototype using the Elliptic Bitcoin Transaction Graph. Rules, evidence, and AI-assisted review drafts — not a money laundering detection system.',
  robots: { index: true, follow: true },
}

const cx = (...classes: string[]) => classes.filter(Boolean).join(' ')

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cx('bg-[#f7f1ea] text-[#171717]', GeistSans.variable, GeistMono.variable)}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
