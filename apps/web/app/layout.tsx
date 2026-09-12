import type { ReactNode } from 'react'

export const metadata = {
  title: 'PRODX Manufacturing ERP',
  description: 'Textile and carton manufacturing ERP',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f2f5f5' }}>
        {children}
      </body>
    </html>
  )
}
