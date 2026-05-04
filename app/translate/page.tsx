"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Hand, Mic, Keyboard, Volume2, HelpCircle, Camera as CameraIcon, RefreshCw, Play, Square, X } from "lucide-react";
import Link from "next/link";
import * as tf from '@tensorflow/tfjs';

export default function TranslatePage() {
  const [showTutorial, setShowTutorial] = useState(true);
  const [activeTab, setActiveTab] = useState("tuli");
  const [isTyping, setIsTyping] = useState(false);
  const [isCheckingMemory, setIsCheckingMemory] = useState(true);
  const [isCameraActive, setIsCameraActive] = useState(false);

  // State Teman Dengar
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState(""); 
  
  // State & Ref AI
  const [isModelReady, setIsModelReady] = useState(false);
  const [detectedSign, setDetectedSign] = useState(""); 
  const [isAutoSpeak, setIsAutoSpeak] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Ref untuk nyawa AI (Mencegah re-render berlebih)
  const modelRef = useRef<tf.LayersModel | null>(null);
  const classNamesRef = useRef<string[]>([]);
  const handsRef = useRef<any>(null);
  
  // Ref untuk logika urutan frame (Sequence)
  const sequenceRef = useRef<number[][]>([]);
  const lastKeypointsRef = useRef<number[]>(new Array(126).fill(0));
  const isPredictingRef = useRef(false);
  const animationFrameId = useRef<number | null>(null);

  // 1. Cek Tutorial
  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem("signtara_tutorial_seen");
    if (hasSeenTutorial === "true") {
      setShowTutorial(false);
    }
    setIsCheckingMemory(false);
  }, []);

  // 2. Load "Otak" (TensorFlow) dan "Mata" (MediaPipe) saat komponen dimuat
  useEffect(() => {
    const loadAIModel = async () => {
      try {
        // A. Load Daftar Kosakata (Kamus)
        const classResponse = await fetch('/model/class_names.json');
        classNamesRef.current = await classResponse.json();

        // B. Load Otak AI (TensorFlow)
        const model = await tf.loadLayersModel('/model/model.json');
        modelRef.current = model;

        // C. Load Mata AI (MediaPipe Hands) secara dinamis untuk menghindari error Turbopack
        const mediapipe = await import('@mediapipe/hands');
        const Hands = mediapipe.Hands || (mediapipe as any).default.Hands || (window as any).Hands;

        const hands = new Hands({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
          }
        });
        
        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        hands.onResults(handleHandResults);
        handsRef.current = hands;

        console.log("Semua sistem AI (TensorFlow & MediaPipe) siap!");
        setIsModelReady(true);
      } catch (error) {
        console.error("Gagal memuat model AI:", error);
      }
    };

    loadAIModel();
    
    // Cleanup saat keluar halaman
    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, []);

  // 3. Matikan kamera jika pindah tab
  useEffect(() => {
    if (activeTab === "dengar") {
      stopCamera();
    }
  }, [activeTab]);

  // =========================================================================
  // --- FUNGSI UTAMA AI: MEMBACA TANGAN & MENEBAK ---
  // =========================================================================
  const handleHandResults = async (results: any) => {
    // A. Ekstraksi 126 Titik Koordinat (Persis seperti Python)
    let lh = new Array(63).fill(0);
    let rh = new Array(63).fill(0);

    if (results.multiHandLandmarks && results.multiHandedness) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const handLandmarks = results.multiHandLandmarks[i];
        const label = results.multiHandedness[i].label; // 'Left' atau 'Right'
        
        const keypoints = handLandmarks.map((lm: any) => [lm.x, lm.y, lm.z]).flat();

        if (label === 'Left') {
          lh = keypoints;
        } else {
          rh = keypoints;
        }
      }
    }

    let currentKeypoints = [...lh, ...rh];

    // B. Logika Anti-Freeze (Gunakan frame sebelumnya jika tiba-tiba kosong)
    const isAllZeros = currentKeypoints.every(val => val === 0);
    const wasLastAllZeros = lastKeypointsRef.current.every(val => val === 0);
    
    if (isAllZeros && !wasLastAllZeros) {
      currentKeypoints = lastKeypointsRef.current;
    } else {
      lastKeypointsRef.current = currentKeypoints;
    }

    // C. Masukkan ke dalam kumpulan Sequence (20 Frame)
    sequenceRef.current.push(currentKeypoints);
    if (sequenceRef.current.length > 20) {
      sequenceRef.current.shift(); // Buang yang paling lama
    }

    // D. Lakukan Prediksi jika sudah terkumpul 20 Frame
    if (sequenceRef.current.length === 20 && !isPredictingRef.current && modelRef.current && classNamesRef.current.length > 0) {
      isPredictingRef.current = true;
      
      try {
        // Ubah bentuk data JS ke Tensor AI: Shape [1, 20, 126]
        const inputTensor = tf.tensor3d([sequenceRef.current]);
        
        // AI Menebak
        const prediction = modelRef.current.predict(inputTensor) as tf.Tensor;
        const scores = await prediction.data();
        
        // Cari tebakan dengan skor tertinggi
        const maxScore = Math.max(...Array.from(scores));
        const maxIndex = scores.indexOf(maxScore);
        
        // Hapus sampah memori agar web tidak lemot (SANGAT PENTING!)
        tf.dispose([inputTensor, prediction]);

        // Jika yakin di atas 60%, tampilkan hasilnya!
        if (maxScore > 0.6) {
          setDetectedSign(classNamesRef.current[maxIndex].toUpperCase());
        }

      } catch (err) {
        console.error("Error saat prediksi AI:", err);
      } finally {
        // Buka gembok prediksi agar bisa menebak kata selanjutnya
        setTimeout(() => { isPredictingRef.current = false; }, 300); // Jeda 0.3 detik per kata
      }
    }
  };

  // Looping pengiriman gambar dari video ke MediaPipe
  const processVideoFrame = async () => {
    if (videoRef.current && videoRef.current.readyState >= 2 && handsRef.current) {
      await handsRef.current.send({ image: videoRef.current });
    }
    // Terus berputar selama kamera aktif
    if (videoRef.current && videoRef.current.srcObject) {
      animationFrameId.current = requestAnimationFrame(processVideoFrame);
    }
  };

  // --- FUNGSI HARDWARE: KAMERA ---
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraActive(true);
      
      // Reset sequence saat kamera baru nyala
      sequenceRef.current = [];
      lastKeypointsRef.current = new Array(126).fill(0);
      
      // Mulai Looping AI
      processVideoFrame();

    } catch (err) {
      console.error("Akses kamera ditolak atau error:", err);
      alert("Gagal mengakses kamera. Pastikan Anda telah memberikan izin akses kamera pada browser.");
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const tracks = stream.getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  // --- FUNGSI HARDWARE: MIKROFON & SPEAKER ---
  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Maaf, browser Anda belum mendukung fitur Voice-to-Text.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "id-ID"; 
    recognition.interimResults = true; 
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const current = event.resultIndex;
      const text = event.results[current][0].transcript;
      setTranscript(text.toUpperCase());
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const speakDetectedSign = () => {
    const textToSpeak = detectedSign || "Menunggu isyarat"; 
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = 'id-ID'; 
      utterance.rate = 0.9; 
      window.speechSynthesis.speak(utterance);
    } else {
      alert("Maaf, browser Anda tidak mendukung fitur Text-to-Speech.");
    }
  };

  const handleClearText = () => setTranscript("");
  // Jika Auto-Speak menyala dan ada teks baru, langsung bunyikan!
  useEffect(() => {
    if (isAutoSpeak && detectedSign) {
      speakDetectedSign();
    }
  }, [detectedSign, isAutoSpeak]);
  const handleStartFromTutorial = () => {
    localStorage.setItem("signtara_tutorial_seen", "true");
    setShowTutorial(false);
  };

  if (isCheckingMemory) return <div className="min-h-screen bg-[#FCF9F5]"></div>;

  if (showTutorial) {
    return (
      <div className="flex flex-col min-h-screen bg-[#FCF9F5]">
        <div className="bg-white rounded-b-[2.5rem] pt-8 pb-6 px-6 shadow-sm flex items-center justify-center relative z-10">
          <Link href="/" className="absolute left-6 text-[#F97316] hover:opacity-70 transition-opacity"><ArrowLeft size={24} /></Link>
          <h1 className="text-2xl font-bold text-[#F97316] tracking-wide">Signtara</h1>
        </div>
        <div className="px-8 pt-8 pb-10 flex flex-col flex-grow animate-in fade-in zoom-in duration-300">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-bold text-[#5C3A21] mb-2">Cara Penggunaan</h2>
            <p className="text-sm text-gray-500">Ikuti 3 langkah mudah ini untuk hasil terbaik.</p>
          </div>
          <div className="space-y-10 flex-grow">
            <div className="flex items-center gap-6 bg-white/50 p-4 rounded-3xl"><div className="w-16 h-16 shrink-0 bg-[#FCEEE6] rounded-2xl flex items-center justify-center text-[#5C3A21]"><Hand size={30} /></div><div><h3 className="font-bold text-[#5C3A21] text-lg">Posisi Tangan</h3><p className="text-sm text-gray-500 leading-snug">Pegang perangkat dengan stabil dan pastikan objek berada di tengah bingkai layar.</p></div></div>
            <div className="flex items-center gap-6 bg-white/50 p-4 rounded-3xl"><div className="w-16 h-16 shrink-0 bg-[#EBF5EE] rounded-2xl flex items-center justify-center text-[#5C3A21]"><RefreshCw size={30} /></div><div><h3 className="font-bold text-[#5C3A21] text-lg">Pencahayaan</h3><p className="text-sm text-gray-500 leading-snug">Pastikan area cukup terang. Hindari cahaya yang membelakangi objek.</p></div></div>
            <div className="flex items-center gap-6 bg-white/50 p-4 rounded-3xl"><div className="w-16 h-16 shrink-0 bg-[#E6F3FA] rounded-2xl flex items-center justify-center text-[#5C3A21]"><CameraIcon size={30} /></div><div><h3 className="font-bold text-[#5C3A21] text-lg">Jarak Ideal</h3><p className="text-sm text-gray-500 leading-snug">Jaga jarak sekitar 30-50 cm dari objek agar fokus kamera bekerja sempurna.</p></div></div>
          </div>
          <button onClick={handleStartFromTutorial} className="w-full bg-[#FFB18B] text-[#5C3A21] py-5 rounded-full font-bold text-lg shadow-sm hover:bg-[#EAA17B] transition-all flex items-center justify-center gap-3 mt-6 active:scale-95">
            Mengerti, Mulai Kamera <CameraIcon size={22} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen pb-24 relative bg-[#FCF9F5]">
      <div className="bg-white rounded-b-[2.5rem] pt-8 pb-6 px-6 shadow-sm flex items-center justify-center relative z-10 shrink-0">
        <Link href="/" className="absolute left-6 text-[#F97316] hover:opacity-70 transition-opacity"><ArrowLeft size={24} /></Link>
        <h1 className="text-2xl font-bold text-[#F97316] tracking-wide">Signtara</h1>
        <button onClick={() => setShowTutorial(true)} className="absolute right-6 text-[#F97316] hover:opacity-70 transition-opacity"><HelpCircle size={24} /></button>
      </div>

      <div className="px-6 pt-8 flex-grow flex flex-col relative z-10 animate-in fade-in duration-500">
        <div className="bg-gray-200/50 p-1 rounded-full flex mb-8 shrink-0">
          <button onClick={() => setActiveTab("tuli")} className={`flex-1 py-3.5 rounded-full font-bold text-sm transition-all ${activeTab === 'tuli' ? 'bg-[#5C3A21] text-white shadow-md' : 'text-gray-500'}`}>Teman Tuli</button>
          <button onClick={() => setActiveTab("dengar")} className={`flex-1 py-3.5 rounded-full font-bold text-sm transition-all ${activeTab === 'dengar' ? 'bg-[#5C3A21] text-white shadow-md' : 'text-gray-500'}`}>Teman Dengar</button>
        </div>

        <div className="flex flex-col flex-grow w-full relative z-10 animate-in fade-in duration-300">
          {activeTab === "tuli" ? (
            <div className="flex flex-col h-full animate-in slide-in-from-left-4 duration-300">
              <div className="relative w-full aspect-[4/5] bg-gray-300 rounded-[3rem] overflow-hidden border-4 border-white shadow-xl mb-6 flex flex-col items-center justify-center bg-black shrink-0">
                <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 w-full h-full object-cover ${isCameraActive ? 'opacity-100' : 'opacity-0'}`} />
                {!isCameraActive ? (
                  <button onClick={startCamera} className="flex flex-col items-center gap-3 group z-10">
                    <div className="w-16 h-16 bg-white/80 rounded-full flex items-center justify-center text-[#F97316] group-hover:scale-110 transition-transform shadow-lg"><Play size={32} className="ml-1" /></div>
                    <p className="text-sm font-bold text-[#5C3A21] bg-white/80 px-4 py-1.5 rounded-full backdrop-blur-sm shadow-sm">Tap untuk Menyalakan Kamera</p>
                  </button>
                ) : (
                  <>
                    <button onClick={stopCamera} className="absolute top-4 right-4 bg-white/80 p-3 rounded-full text-red-500 shadow-sm hover:bg-white transition-colors z-10"><Square size={20} fill="currentColor" /></button>
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur-md px-4 py-2 rounded-full border border-white flex items-center gap-2 shadow-sm z-10">
                      <div className="w-2 h-2 rounded-full animate-pulse bg-[#F97316]" /><span className="text-[10px] font-bold uppercase tracking-wider text-[#5C3A21]">Teman Tuli Mode</span>
                    </div>
                  </>
                )}
              </div>

              <div className="bg-white rounded-[2.5rem] p-6 shadow-lg flex flex-col items-center relative min-h-[180px] border border-orange-50 mt-auto mb-2 shrink-0">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Detected Sign</p>
                <h2 className={`${detectedSign.length > 15 ? 'text-xl' : 'text-3xl'} font-black text-[#5C3A21] text-center mb-6 leading-tight transition-all duration-300`}>
                  {!isModelReady ? (
                    <span className="flex items-center gap-2 animate-pulse text-gray-400 text-2xl">
                      <RefreshCw className="animate-spin" size={24}/> MEMUAT MODEL AI...
                    </span>
                  ) : detectedSign ? (
                    detectedSign
                  ) : (
                    <span className="text-gray-300 text-2xl">MENUNGGU ISYARAT...</span>
                  )}
                </h2>
                <div className="w-full flex items-center justify-between gap-4 mt-auto">
                  <span className="text-xs font-bold text-gray-300">Tr</span>
                  <input type="range" min="1" max="100" defaultValue="40" className="flex-grow h-1.5 bg-gray-100 rounded-full appearance-none accent-[#F97316]" />
                  <span className="text-lg font-bold text-gray-400">Tt</span>
                  <button 
                    onClick={() => setIsAutoSpeak(!isAutoSpeak)}
                    className={`p-3 rounded-full transition-colors active:scale-95 ${isAutoSpeak ? 'bg-green-500 text-white shadow-md' : 'bg-[#EBF5EE] text-green-600 hover:bg-green-100'}`}
                    title={isAutoSpeak ? "Matikan Suara Otomatis" : "Nyalakan Suara Otomatis"}
                  >
                    <Volume2 size={20} />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-300">
              <div className="bg-white rounded-[2.5rem] p-6 sm:p-8 shadow-md flex flex-col flex-1 items-center relative border border-orange-50 mb-6 overflow-hidden">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4 shrink-0">Detected Voice</p>
                {transcript.length > 0 && (
                  <button onClick={handleClearText} className="absolute top-6 right-6 text-gray-300 hover:text-red-500 transition-colors p-2 bg-gray-50 rounded-full z-10 shrink-0" title="Hapus Teks">
                    <X size={20} />
                  </button>
                )}
                <div className="w-full flex-grow overflow-y-auto flex flex-col justify-center px-2 pb-2">
                  {isTyping ? (
                    <textarea 
                      autoFocus
                      value={transcript}
                      onChange={(e) => setTranscript(e.target.value.toUpperCase())}
                      placeholder="Ketik pesan di sini..."
                      className="w-full h-full min-h-[150px] bg-gray-50 rounded-2xl text-[#5C3A21] font-bold text-xl focus:outline-none focus:ring-2 focus:ring-[#F97316] transition-all resize-none p-4 break-words"
                    />
                  ) : (
                    <h2 className="text-2xl font-bold text-[#5C3A21] text-center leading-relaxed m-auto w-full break-words break-all sm:break-normal whitespace-pre-wrap">
                      {transcript || <span className="text-gray-300 font-medium text-xl">Silakan tekan mikrofon untuk berbicara...</span>}
                    </h2>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-[2.5rem] p-6 shadow-md flex items-center gap-6 border border-orange-50 relative shrink-0">
                {isTyping ? (
                  <div className="w-full flex gap-3">
                    <button onClick={() => setIsTyping(false)} className="flex-1 py-4 bg-gray-100 rounded-xl font-bold text-gray-500">Tutup</button>
                    <button onClick={() => setIsTyping(false)} className="flex-1 py-4 bg-[#F97316] text-white rounded-xl font-bold">Selesai</button>
                  </div>
                ) : (
                  <>
                    <button 
                      onClick={startListening}
                      className={`w-16 h-16 rounded-full flex items-center justify-center shrink-0 shadow-inner transition-colors ${isListening ? 'bg-orange-200' : 'bg-[#FCEEE6]'}`}
                    >
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white transition-all ${isListening ? 'bg-red-500 animate-pulse scale-110' : 'bg-[#F97316]'}`}>
                        <Mic size={24} />
                      </div>
                    </button>
                    <div className="flex flex-col">
                      <p className="font-bold text-[#F97316] text-sm">{isListening ? 'Mendengarkan...' : 'Tekan Mic'}</p>
                      <p className="text-xs text-gray-400">{isListening ? 'Silakan berbicara sekarang.' : 'Untuk mulai mengubah suara.'}</p>
                    </div>
                    <button onClick={() => setIsTyping(true)} className="absolute top-6 right-6 text-gray-300 hover:text-[#F97316]">
                      <Keyboard size={20} />
                    </button>
                  </>
                )}
              </div>
              <div className="mx-auto bg-white/80 backdrop-blur-md px-5 py-2.5 rounded-full border border-gray-100 flex items-center gap-2 shadow-sm mt-8 pb-2 shrink-0">
                <div className="w-2 h-2 rounded-full animate-pulse bg-blue-500" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#5C3A21]">Teman Dengar Mode</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}