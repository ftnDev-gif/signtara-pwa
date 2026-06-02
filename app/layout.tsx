import type { Metadata } from "next";
import { Quicksand } from "next/font/google"; // Kita asumsikan pakai Quicksand untuk efek membulat
import "./globals.css";
import BottomNav from "../components/BottomNav";

const quicksand = Quicksand({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Signtara PWA",
  description: "Aplikasi Penerjemah Bahasa Isyarat BISINDO",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className={`${quicksand.className} antialiased`}>
        {/* Kita batasi lebar maksimalnya seperti layar HP dan tengahkan */}
        <main className="max-w-md mx-auto min-h-screen bg-signtara-bg relative shadow-sm pb-24">
          {children}
          <BottomNav />
        </main>
      </body>
    </html>
  );
}