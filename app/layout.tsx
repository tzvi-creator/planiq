import type { Metadata } from 'next';
import { Heebo } from 'next/font/google';
import './globals.css';
import AppFrame from '@/components/AppFrame';

const heebo = Heebo({ subsets: ['hebrew', 'latin'], variable: '--font-heebo', display: 'swap' });

export const metadata: Metadata = {
  title: 'PlanIQ – קריאת תכניות חכמה',
  description: 'מערכת בעברית לקריאת תכניות אדריכלות ויועצים, הפקת כמויות ומפרט, בדיקת תקנים וסופר פוזיציה',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body>
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
