import React, { useState, useRef, useEffect } from 'react';

function App() {
  const [name, setName] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [displayText, setDisplayText] = useState('');
  const [displayType, setDisplayType] = useState(''); 
  const [aiResponse, setAiResponse] = useState('');
  const [processingStatus, setProcessingStatus] = useState('');
  
  // NEW: Direct error visibility state
  const [errorMessage, setErrorMessage] = useState('');

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallAvailable, setIsInstallAvailable] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallAvailable(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const startRecording = async () => {
    setDisplayText('');
    setAiResponse('');
    setDisplayType('');
    setProcessingStatus('');
    setErrorMessage(''); // Clear past errors
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');
        formData.append('name', name || 'Anonymous');

        try {
          setProcessingStatus("Connecting to live memory ledger...");
          
          const BACKEND_URL = 'https://ai-voice-diary.onrender.com';
          const response = await fetch(`${BACKEND_URL}/api/process-voice`, {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`Server returned status code ${response.status}`);
          }

          const data = await response.json();
          console.log("Database Response Payload:", data);

          const spokenText = data.transcription || "";
          setDisplayText(spokenText);

          if (data.type === "query") {
            setDisplayType('query');
            setAiResponse(data.reply || "No matching memory trace found.");
          } else {
            setDisplayType('store');
          }

        } catch (error: any) {
          console.error("Network Link Failure:", error);
          setProcessingStatus('');
          setDisplayType('error');
          setErrorMessage(error.message || "Network timeout or connection lost.");
          setDisplayText("Connection Mismatch");
        }

        setProcessingStatus('');
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
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
      
      {/* TITLE ROW */}
      <div className="w-full max-w-4xl mx-auto flex flex-col md:flex-row justify-between items-center pt-4 gap-4">
        <h1 className="text-xl font-semibold text-black tracking-tight">Voice Memory Ledger</h1>
        <input 
          type="text" 
          value={name} 
          onChange={(e) => setName(e.target.value)}
          placeholder="Type name"
          className="p-2 border-b-2 border-gray-300 text-center focus:outline-none focus:border-black text-lg font-medium text-black bg-transparent"
        />
      </div>

      {/* CORE MIC CANVAS */}
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
        
        <p className="text-gray-500 text-sm mt-4 font-medium">
          {isRecording ? 'Recording... Tap to Stop' : 'Press MIC & speak'}
        </p>

        {/* PROCESSING STATUS */}
        {processingStatus && (
          <div className="mt-8 flex flex-col items-center space-y-2">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-black rounded-full animate-spin"></div>
            <p className="text-sm font-medium text-black bg-gray-100 px-4 py-1.5 rounded-full border shadow-sm">
              {processingStatus}
            </p>
          </div>
        )}

        {/* SCRIPT FEEDBACK PANEL */}
        {displayText && !processingStatus && (
          <div className="mt-6 max-w-md w-full px-6 py-4 bg-gray-50 rounded-2xl border text-center shadow-sm">
            {displayType === 'store' && (
              <p className="text-gray-700 text-sm font-medium">
                Stored successfully: <span className="text-black italic font-semibold">"{displayText}"</span>
              </p>
            )}

            {displayType === 'query' && (
              <div className="space-y-2">
                <p className="text-gray-400 text-xs uppercase font-semibold">Question</p>
                <p className="text-gray-900 text-sm font-medium italic">"{displayText}"</p>
                <div className="w-8 border-t-2 border-black mx-auto my-2"></div>
                <p className="text-gray-400 text-xs uppercase font-semibold">Answer</p>
                <p className="text-black text-base font-bold">{aiResponse}</p>
              </div>
            )}

            {displayType === 'error' && (
              <div className="space-y-1 text-red-600">
                <p className="text-xs uppercase font-bold tracking-wide">Network Connection Error</p>
                <p className="text-sm font-medium bg-red-50 p-2 rounded-lg border border-red-200">{errorMessage}</p>
                <p className="text-[11px] text-gray-500 pt-1">Make sure your Render backend service is completely awake and running.</p>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="h-6"></div>
    </div>
  );
}

export default App;