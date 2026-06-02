import { ArrowLeft, Hand, Mic, Keyboard } from "lucide-react";
import Link from "next/link";

export default function HistoryPage() {
  const historyItems = [
    { id: 1, text: "Terima Kasih", time: "Hari ini, 10:42 AM", icon: Hand, bgColor: "bg-[#FCEEE6]" },
    { id: 2, text: "Sampai Jumpa", time: "Kemarin, 14:15 PM", icon: Mic, bgColor: "bg-[#EBF5EE]" },
    { id: 3, text: "Apa Kabar?", time: "Senin, 09:30 AM", icon: Hand, bgColor: "bg-[#FCEEE6]" },
    { id: 4, text: "Tolong Bantu Saya", time: "Minggu, 16:45 PM", icon: Keyboard, bgColor: "bg-[#E6F3FA]" },
  ];

  return (
    <div className="flex flex-col min-h-screen pb-24 relative bg-[#FCF9F5]">
      
      {/* --- HEADER KONSISTEN (PUTIH MELENGKUNG) --- */}
      <div className="bg-white rounded-b-[2.5rem] pt-8 pb-6 px-6 shadow-sm flex items-center justify-center relative z-10">
        <Link href="/" className="absolute left-6 text-[#F97316] hover:opacity-70 transition-opacity">
          <ArrowLeft size={24} />
        </Link>
        <h1 className="text-2xl font-bold text-[#F97316] tracking-wide">Signtara</h1>
      </div>

      <div className="px-6 pt-8 animate-in fade-in duration-500 flex-grow">
        {/* Judul Halaman */}
        <div className="mb-6 ml-1">
          <h2 className="text-3xl font-bold text-[#5C3A21] mb-1">Riwayat</h2>
          <p className="text-sm text-gray-500">Catatan perjalanan bahasamu.</p>
        </div>

        {/* Daftar Riwayat */}
        <div className="flex flex-col gap-4">
          {historyItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.id} className="bg-white rounded-[2rem] p-4 flex items-center gap-4 shadow-sm border border-gray-50 transition-all hover:border-orange-100">
                <div className={`${item.bgColor} w-14 h-14 shrink-0 rounded-full flex items-center justify-center text-[#5C3A21]`}>
                  <Icon size={24} />
                </div>
                <div className="flex flex-col overflow-hidden">
                  <h3 className="text-lg font-bold text-[#5C3A21] truncate">{item.text}</h3>
                  <p className="text-xs font-semibold text-gray-400 mt-0.5">{item.time}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}