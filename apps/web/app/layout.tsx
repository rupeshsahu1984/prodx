import type { ReactNode } from 'react'
import './globals.css'

export const metadata = {
  title: 'PRODX Manufacturing ERP',
  description: 'Textile and carton manufacturing ERP',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
