import React, { useState, useRef } from 'react';

function App() {
  const [name, setName] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [displayText, setDisplayText] = useState('');
  const [displayType, setDisplayType] = useState(''); 
  const [aiResponse, setAiResponse] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    setDisplayText('');
    setAiResponse('');
    setDisplayType('');
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
          setAiResponse("Searching backend database...");
          
          const BACKEND_URL = 'https://ai-voice-diary.onrender.com';
          const response = await fetch(`${BACKEND_URL}/api/process-voice`, {
            method: 'POST',
            body: formData,
          });

          const data = await response.json();
          console.log("Raw Server Response Payload:", data);

          // 1. Extract what was spoken
          const spokenText = data.transcription || data.text || data.input || "";
          setDisplayText(spokenText);

          // 2. Automatically check if it's a query or a storage entry
          const lowerText = spokenText.toLowerCase();
          const isQuery = lowerText.includes('where') || lowerText.includes('what') || lowerText.includes('who') || lowerText.includes('how') || lowerText.includes('कुठे') || lowerText.includes('काय') || lowerText.includes('कहाँ');

          // 3. Match ANY possible answer field coming from server.js
          const serverAnswer = data.reply || data.answer || data.response || data.message || data.aiResponse || data.output;

          if (isQuery) {
            setDisplayType('query');
            setAiResponse(serverAnswer || "Memory processed, but no direct text answer was returned by the database.");
          } else {
            setDisplayType('store');
          }

        } catch (error) {
          console.error("Backend Server communication failed:", error);
          setAiResponse("Could not reach the backend memory ledger.");
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
      <div className="w-full max-w-4xl mx-auto flex flex-col md:flex-row justify-between items-start pt-4 gap-4">
        <h1 className="text-xl font-semibold text-black tracking-tight">
          Voice Memory Ledger
        </h1>
        <div className="w-full max-w-xs mx-auto md:mx-0 flex flex-col items-center">
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

        {displayText && (
          <div className="mt-6 max-w-md w-full px-6 py-4 bg-gray-50 rounded-2xl border border-gray-100 text-center">
            {displayType === 'store' && (
              <p className="text-gray-700 text-sm font-medium">
                Stored: <span className="text-black italic">"{displayText}"</span>
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

        {!isRecording && !displayText && (
          <div className="mt-6 flex flex-col items-center text-center text-xs text-gray-400 space-y-1 bg-gray-50 px-4 py-3 rounded-xl border border-gray-100 min-w-[240px]">
            <span className="font-semibold text-gray-500 uppercase tracking-wider text-[10px] mb-1">Example</span>
            <span>"My keys are on the table"</span>
            <span className="italic text-gray-400 text-[11px]">then later ask...</span>
            <span>"Where are my keys?"</span>
            <div className="w-full border-t border-gray-200 my-2"></div>
            <span className="text-gray-500 font-medium tracking-wide">speak any language</span>
          </div>
        )}
      </div>

      <div className="h-6"></div>
    </div>
  );
}

export default App;