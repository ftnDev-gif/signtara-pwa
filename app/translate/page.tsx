"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Mic, Keyboard, Volume2, HelpCircle, Camera as CameraIcon, RefreshCw, Play, Square, X, Bookmark } from "lucide-react";
import { Hand } from "lucide-react";
import Link from "next/link";
import * as tf from '@tensorflow/tfjs';

export default function TranslatePage() {
  const [showTutorial, setShowTutorial] = useState(true);
  const [activeTab, setActiveTab] = useState("tuli");
  const [isTyping, setIsTyping] = useState(false);
  const [isCheckingMemory, setIsCheckingMemory] = useState(true);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [fontSize, setFontSize] = useState(32);

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState(""); 
  
  const [isModelReady, setIsModelReady] = useState(false);
  const [detectedSign, setDetectedSign] = useState(""); 
  const [sentence, setSentence] = useState<string[]>([]);
  const [isAutoSpeak, setIsAutoSpeak] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const modelRef = useRef<tf.GraphModel | null>(null);
  const classNamesRef = useRef<string[]>([]);
  const holisticRef = useRef<any>(null);
  
  const sequenceRef = useRef<number[][]>([]);
  const lastKeypointsRef = useRef<number[]>(new Array(258).fill(0));
  const isPredictingRef = useRef(false);
  const animationFrameId = useRef<number | null>(null);

  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem("signtara_tutorial_seen");
    if (hasSeenTutorial === "true") {
      setShowTutorial(false);
    }
    setIsCheckingMemory(false);
  }, []);

  useEffect(() => {
    const loadAIModel = async () => {
      try {
        const classResponse = await fetch('/model/class_names.json');
        classNamesRef.current = await classResponse.json();

        const model = await tf.loadGraphModel('/model/model.json?v=17');
        modelRef.current = model;

        const mediapipe = await import('@mediapipe/holistic');
        const Holistic = mediapipe.Holistic || (mediapipe as any).default.Holistic || (window as any).Holistic;

        const holistic = new Holistic({
          locateFile: (file: string) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
          }
        });
        
        holistic.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        holistic.onResults(handleHolisticResults);
        holisticRef.current = holistic;

        console.log("Semua sistem AI (TensorFlow & MediaPipe Holistic) siap!");
        setIsModelReady(true);
      } catch (error) {
        console.error("Gagal memuat model AI:", error);
      }
    };

    loadAIModel();
    
    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, []);

  useEffect(() => {
    if (activeTab === "dengar") {
      stopCamera();
    }
  }, [activeTab]);

  const handleHolisticResults = async (results: any) => {
    let pose = new Array(132).fill(0);
    if (results.poseLandmarks) {
      pose = results.poseLandmarks.map((lm: any) => [lm.x, lm.y, lm.z, lm.visibility]).flat();
    }

    let lh = new Array(63).fill(0);
    if (results.leftHandLandmarks) {
      lh = results.leftHandLandmarks.map((lm: any) => [lm.x, lm.y, lm.z]).flat();
    }

    let rh = new Array(63).fill(0);
    if (results.rightHandLandmarks) {
      rh = results.rightHandLandmarks.map((lm: any) => [lm.x, lm.y, lm.z]).flat();
    }

    let currentKeypoints = [...pose, ...lh, ...rh];

    const isAllZeros = currentKeypoints.every(val => val === 0);
    const wasLastAllZeros = lastKeypointsRef.current.every(val => val === 0);
    
    if (isAllZeros && !wasLastAllZeros) {
      currentKeypoints = lastKeypointsRef.current;
    } else {
      lastKeypointsRef.current = currentKeypoints;
    }

    sequenceRef.current.push(currentKeypoints);
    if (sequenceRef.current.length > 30) {
      sequenceRef.current.shift();
    }

    if (sequenceRef.current.length === 30 && !isPredictingRef.current && modelRef.current && classNamesRef.current.length > 0) {
      isPredictingRef.current = true;
      
      try {
        const inputTensor = tf.tensor3d([sequenceRef.current]);
        
        const prediction = modelRef.current.execute(inputTensor) as tf.Tensor;
        const scores = await prediction.data();
        
        const maxScore = Math.max(...Array.from(scores));
        const maxIndex = scores.indexOf(maxScore);
        
        tf.dispose([inputTensor, prediction]);

        if (maxScore > 0.6) {
          const newSign = classNamesRef.current[maxIndex].toUpperCase();
          
          console.log("Skor tertinggi saat ini:", maxScore, "Hasil:", newSign);

          setSentence(prev => {
            if (prev[prev.length - 1] !== newSign) {
              return [...prev, newSign];
            }
            return prev;
          });
        }

      } catch (err) {
        console.error("Error saat prediksi AI:", err);
      } finally {
        setTimeout(() => { isPredictingRef.current = false; }, 2000);
      }
    }
  };

  const processVideoFrame = async () => {
    if (
      videoRef.current && 
      videoRef.current.readyState >= 2 && 
      videoRef.current.videoWidth > 0 &&
      videoRef.current.videoHeight > 0 &&
      holisticRef.current
    ) {
      await holisticRef.current.send({ image: videoRef.current });
    }
    
    if (videoRef.current && videoRef.current.srcObject) {
      animationFrameId.current = requestAnimationFrame(processVideoFrame);
    }
  };

  const startCamera = async (requestedMode?: string | React.MouseEvent) => {
    const modeToUse = typeof requestedMode === "string" ? requestedMode : facingMode;

    try {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: { exact: modeToUse } } 
      }); 
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
        setFacingMode(modeToUse as "environment" | "user");
      }
    } catch (err) {
      console.warn(`Kamera mode ${modeToUse} tidak tersedia, mencoba mode alternatif...`);
      const fallbackMode = modeToUse === "environment" ? "user" : "environment";
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: fallbackMode } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          setIsCameraActive(true);
          setFacingMode(fallbackMode);
        }
      } catch (fallbackErr) {
        alert("Gagal mengakses kamera. Pastikan izin kamera telah diberikan.");
        setIsCameraActive(false);
      }
    }
  };

  const handleToggleCamera = () => {
    const newMode = facingMode === "environment" ? "user" : "environment";
    if (isCameraActive) {
      startCamera(newMode);
    } else {
      setFacingMode(newMode);
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

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
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
    const textToSpeak = sentence.length > 0 ? sentence.join(" ") : "Belum ada isyarat yang terdeteksi";
    
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = 'id-ID'; 
      utterance.rate = 0.9; 
      window.speechSynthesis.speak(utterance);
    } else {
      alert("Maaf, browser Anda tidak mendukung fitur Text-to-Speech.");
    }
  };

  const saveToHistory = (text: string, mode: string) => {
    if (!text || text === "MENUNGGU ISYARAT...") return;
    
    const newItem = {
      id: Date.now(),
      text: text,
      mode: mode,
      timestamp: new Date().toLocaleTimeString("id-ID", { hour: '2-digit', minute: '2-digit' }) + ", " + new Date().toLocaleDateString("id-ID")
    };

    const existingHistory = JSON.parse(localStorage.getItem("signtara_history") || "[]");
    
    const updatedHistory = [newItem, ...existingHistory].slice(0, 50); 
    
    localStorage.setItem("signtara_history", JSON.stringify(updatedHistory));
  };

  const handleClearText = () => {
    setTranscript("");
  };

  useEffect(() => {
    if (isAutoSpeak && sentence.length > 0) {
      speakDetectedSign();
    }
  }, [sentence, isAutoSpeak]);

  useEffect(() => {
    const reloadText = localStorage.getItem("signtara_reload_text");
    const reloadMode = localStorage.getItem("signtara_reload_mode");

    if (reloadText && reloadMode) {
      if (reloadMode === "Teman Tuli") {
        setActiveTab("tuli");
        setSentence(reloadText.split(" ")); 
      } else if (reloadMode === "Teman Dengar") {
        setActiveTab("dengar");
        setTranscript(reloadText);
      }
      
      localStorage.removeItem("signtara_reload_text");
      localStorage.removeItem("signtara_reload_mode");
    }
  }, []);

  useEffect(() => {
    const lastTab = localStorage.getItem("signtara_active_tab");
    if (lastTab) setActiveTab(lastTab);

    const draftText = localStorage.getItem("signtara_draft_text");
    if (draftText) setTranscript(draftText);
  }, []);

  useEffect(() => {
    localStorage.setItem("signtara_active_tab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem("signtara_draft_text", transcript);
  }, [transcript]);

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
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className={`absolute inset-0 w-full h-full object-cover ${isCameraActive ? 'opacity-100' : 'opacity-0'} ${facingMode === "user" ? "scale-x-[-1]" : ""}`} 
                />
                {!isCameraActive ? (
                  <button onClick={startCamera} className="flex flex-col items-center gap-3 group z-10">
                    <div className="w-16 h-16 bg-white/80 rounded-full flex items-center justify-center text-[#F97316] group-hover:scale-110 transition-transform shadow-lg"><Play size={32} className="ml-1" /></div>
                    <p className="text-sm font-bold text-[#5C3A21] bg-white/80 px-4 py-1.5 rounded-full backdrop-blur-sm shadow-sm">Tap untuk Menyalakan Kamera</p>
                  </button>
                ) : (
                  <>
                    <button onClick={stopCamera} className="absolute top-4 right-4 bg-white/80 p-3 rounded-full text-red-500 shadow-sm hover:bg-white transition-colors z-10">
                      <Square size={20} fill="currentColor" />
                    </button>

                    <button 
                      onClick={handleToggleCamera}
                      className="absolute top-4 left-4 bg-black/40 backdrop-blur-sm p-3 rounded-full text-white shadow-md hover:bg-black/60 transition-colors active:scale-95 z-10"
                      title="Tukar Kamera"
                    >
                      <RefreshCw size={20} />
                    </button>

                    <div className="absolute top-5 left-1/2 -translate-x-1/2 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full text-white flex items-center gap-2 z-10 shadow-sm">
                      <CameraIcon size={14} />
                      <span className="text-[10px] font-bold tracking-wider uppercase">
                        {facingMode === "environment" ? "Belakang" : "Depan"}
                      </span>
                    </div>

                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur-md px-4 py-2 rounded-full border border-white flex items-center gap-2 shadow-sm z-10">
                      <div className="w-2 h-2 rounded-full animate-pulse bg-[#F97316]" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#5C3A21]">Teman Tuli Mode</span>
                    </div>
                  </>
                )}
              </div>

              <div className="bg-white rounded-[2.5rem] p-6 shadow-lg flex flex-col items-center relative min-h-[180px] border border-orange-50 mt-auto mb-2 shrink-0">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Isyarat Terdeteksi</p>
                <h2 className="font-black text-[#5C3A21] text-center mb-6 leading-tight transition-all duration-75"
                  style={{ fontSize: `${fontSize}px` }}
                >
                  {sentence.length > 0 
                    ? sentence.join(" ") 
                    : <span className="text-gray-300 text-xl animate-pulse">MENUNGGU ISYARAT...</span>
                  }
                </h2>
                <div className="w-full flex items-center justify-between gap-4 mt-auto">
                  <span className="text-sm font-bold text-gray-400">tt</span>
  
                  <input 
                    type="range" 
                    min="16"
                    max="64"
                    value={fontSize} 
                    onChange={(e) => setFontSize(Number(e.target.value))} 
                    className="flex-grow h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-[#F97316]" 
                  />
                  
                  <span className="text-lg font-bold text-gray-400">TT</span>
                  
                  <div className="flex items-center gap-2 shrink-0">
                    <button 
                      onClick={() => {
                        saveToHistory(sentence.join(" "), "Teman Tuli");
                        alert("Tersimpan di Riwayat!"); 
                      }}
                      className="bg-[#E6F3FA] p-3 rounded-full text-blue-600 hover:bg-blue-100 transition-colors active:scale-95 shrink-0" 
                      title="Simpan ke Riwayat"
                    >
                      <Bookmark size={20} />
                    </button>
                    <button 
                      onClick={() => setIsAutoSpeak(!isAutoSpeak)}
                      className={`p-3 rounded-full transition-colors active:scale-95 shrink-0 ${isAutoSpeak ? 'bg-green-500 text-white shadow-md' : 'bg-[#EBF5EE] text-green-600 hover:bg-green-100'}`}
                      title={isAutoSpeak ? "Matikan Suara Otomatis" : "Nyalakan Suara Otomatis"}
                    >
                      <Volume2 size={20} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-300">
              <div className="bg-white rounded-[2.5rem] p-6 sm:p-8 shadow-md flex flex-col flex-1 items-center relative border border-orange-50 mb-6 overflow-hidden">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4 shrink-0">Suara Terdeteksi</p>
                {transcript.length > 0 && (
                  <div className="absolute top-4 right-4 flex gap-2 z-10 shrink-0">
                    <button 
                      onClick={() => {
                        saveToHistory(transcript, "Teman Dengar");
                        alert("Tersimpan di Riwayat!"); 
                      }} 
                      className="p-2 bg-[#E6F3FA] text-blue-600 rounded-full hover:bg-blue-100 transition-colors active:scale-95" 
                      title="Simpan ke Riwayat"
                    >
                      <Bookmark size={20} />
                    </button>
                    <button 
                      onClick={handleClearText} 
                      className="p-2 bg-red-50 text-red-500 rounded-full hover:bg-red-100 transition-colors active:scale-95" 
                      title="Hapus Teks"
                    >
                      <X size={20} />
                    </button>
                  </div>
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
                    <h2 
                      onClick={() => setIsTyping(true)}
                      title="Ketuk untuk mengetik manual"
                      className="text-2xl font-bold text-[#5C3A21] text-center leading-relaxed m-auto w-full break-words break-all sm:break-normal whitespace-pre-wrap cursor-pointer hover:bg-orange-50/50 p-4 rounded-2xl transition-colors"
                    >
                      {transcript || <span className="text-gray-300 font-medium text-xl">Silakan tekan mikrofon atau ketuk di sini untuk mengetik...</span>}
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