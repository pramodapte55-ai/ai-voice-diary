import React, { useState, useRef, useEffect } from 'react';

function App() {
  const [name, setName] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [displayText, setDisplayText] = useState('');
  const [displayType, setDisplayType] = useState(''); 
  const [aiResponse, setAiResponse] = useState('');
  const [processingStatus, setProcessingStatus] = useState('');

  // PWA Automated & Manual Installation State Trackers
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallAvailable, setIsInstallAvailable] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Failsafe: Open the install availability channel immediately on the UI canvas
      setIsInstallAvailable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // If already launched inside standalone installed mode, hide install buttons
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstallAvailable(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const triggerNativeInstallApp = async () => {
    if (!deferredPrompt) {
      // If the browser hidden prompt hasn't fired yet, give clear instructions
      alert("To install: Tap the 3 vertical dots in the top-right corner of Chrome, then select 'Add to Home screen'.");
      return;
    }
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User installation decision: ${outcome}`);
    
    setDeferredPrompt(null);
    setIsInstallAvailable(false);
  };

  const startRecording = async () => {
    setDisplayText('');
    setAiResponse('');
    setDisplayType('');
    setProcessingStatus('');
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');
        formData.append('name', name || 'Anonymous');

        try {
          setProcessingStatus("Transcribing voice frequency...");
          
          const statusInterval = setInterval(() => {
            setProcessingStatus((prev) => {
              if (prev === "Transcribing voice frequency...") return "Detecting language script...";
              if (prev === "Detecting language script...") return "Running cross-language vector match...";
              if (prev === "Running cross-language vector match...") return "Updating SQL database ledger...";
              return prev;
            });
          }, 2000);

          const BACKEND_URL = 'https://ai-voice-diary.onrender.com';
          const response = await fetch(`${BACKEND_URL}/api/process-voice`, {
            method: 'POST',
            body: formData,
          });

          clearInterval(statusInterval);
          setProcessingStatus('');

          const data = await response.json();
          const spokenText = data.transcription || "";
          setDisplayText(spokenText);

          if (data.type === "query") {
            setDisplayType('query');
            setAiResponse(data.reply || "No direct memory trace found.");
          } else {
            setDisplayType('store');
          }

        } catch (error) {
          console.error("Backend failed:", error);
          setProcessingStatus('');
          setAiResponse("Could not reach backend memory ledger.");
        }

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error(err);
      alert("Please allow microphone permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-white flex flex-col justify-between p-6 overflow-hidden select-none">
      
      {/* BRANDING & UTILITY ROW */}
      <div className="w-full max-w-4xl mx-auto flex flex-col md:flex-row justify-between items-center pt-4 gap-4">
        <div className="flex flex-col items-start">
          <h1 className="text-xl font-semibold text-black tracking-tight">
            Voice Memory Ledger
          </h1>
          
          {/* ALWAYS ACCESSIBLE MANUAL APP INSTALLATION ACTION BUTTON */}
          <button
            onClick={triggerNativeInstallApp}
            className="mt-1 flex items-center space-x-1.5 text-xs font-semibold text-gray-500 bg-gray-100 hover:bg-black hover:text-white px-2.5 py-1 rounded-full border border-gray-200 shadow-sm transition-all"
          >
            <span>📱 Install to Phone Screen</span>
          </button>
        </div>

        <div className="w-full max-w-xs flex flex-col items-center">
          <input 
            type="text" 
            value={name} 
            onChange={(e) => setName(e.target.value)}
            className="w-full p-2 border-b-2 border-gray-300 text-center focus:outline-none focus:border-black text-lg font-medium text-black bg-transparent"
          />
          <span className="text-xs text-gray-400 mt-1 tracking-wide">
            type your name
          </span>
        </div>
      </div>

      {/* CORE ENGINE CANVAS */}
      <div className="flex-1 flex flex-col items-center justify-center w-full">
        <button 
          onClick={isRecording ? stopRecording : startRecording}
          className={`w-28 h-28 rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-transform ${
            isRecording ? 'bg-red-600 animate-pulse' : 'bg-black'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 text-white">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
          </svg>
        </button>
        
        <p className="text-gray-500 text-sm mt-4 tracking-wide font-medium">
          {isRecording ? 'Recording... Tap to Stop' : 'Press the MIC & speak'}
        </p>

        {/* LIVE PROCESSING STATUS LOADER */}
        {processingStatus && (
          <div className="mt-8 flex flex-col items-center space-y-3">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-black rounded-full animate-spin"></div>
            <p className="text-sm font-medium text-black tracking-wide bg-gray-100 px-4 py-1.5 rounded-full border border-gray-200 shadow-sm">
              {processingStatus}
            </p>
          </div>
        )}

        {/* COMPLETED RESPONSE BOARD */}
        {displayText && !processingStatus && (
          <div className="mt-6 max-w-md w-full px-6 py-4 bg-gray-50 rounded-2xl border border-gray-100 text-center shadow-sm">
            {displayType === 'store' && (
              <p className="text-gray-700 text-sm font-medium">
                Stored successfully: <span className="text-black italic font-semibold">"{displayText}"</span>
              </p>
            )}

            {displayType === 'query' && (
              <div className="space-y-2">
                <p className="text-gray-400 text-xs tracking-wide uppercase font-semibold">Question</p>
                <p className="text-gray-900 text-sm font-medium italic">"{displayText}"</p>
                <div className="w-8 border-t-2 border-black mx-auto my-2"></div>
                <p className="text-gray-400 text-xs tracking-wide uppercase font-semibold pt-1">Answer</p>
                <p className="text-black text-base font-semibold tracking-tight">{aiResponse}</p>
              </div>
            )}
          </div>
        )}

        {/* ONBOARDING PROMPTS CARD */}
        {!isRecording && !displayText && !processingStatus && (
          <div className="mt-6 flex flex-col items-center text-center text-xs text-gray-400 space-y-1 bg-gray-50 px-4 py-3 rounded-xl border border-gray-100 min-w-[240px]">
            <span className="font-semibold text-gray-500 uppercase tracking-wider text-[10px] mb-1">Example</span>
            <span>"My keys are on the table"</span>
            <span className="italic text-gray-400 text-[11px]">then later ask...</span>
            <span>"Where are my keys?"</span>
            <div className="w-full border-t border-gray-200 my-2"></div>
            <span className="text-gray-500 font-medium tracking-wide">speak in Marathi or English</span>
          </div>
        )}
      </div>

      <div className="h-6"></div>
    </div>
  );
}

export default App;