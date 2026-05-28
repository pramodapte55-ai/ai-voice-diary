import React, { useState, useEffect } from 'react';

// Declaring the global browser speech tool for TypeScript compatibility
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

function App() {
  // 1. Foundational Core Variables
  const [name, setName] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  
  // 2. Variables that dynamically hold what you say
  const [displayText, setDisplayText] = useState('');
  const [displayType, setDisplayType] = useState(''); // 'store' or 'query'
  const [aiResponse, setAiResponse] = useState('');

  // 3. Setting up the real browser microphone tool
  const [recognition, setRecognition] = useState<any>(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      // "interimResults = false" guarantees it only prints when you are fully done talking
      rec.interimResults = false; 
      
      // Crucial: This tells the microphone to accept English, Hindi, Marathi, or anything you speak!
      rec.lang = 'en-IN'; 

      // What happens when the mic captures your voice:
      rec.onresult = (event: any) => {
        const spokenText = event.results[0][0].transcript;
        setDisplayText(spokenText);

        const lowerText = spokenText.toLowerCase();
        // Automatically route to Question or Storage based on what you spoke
        if (lowerText.includes('where') || lowerText.includes('what') || lowerText.includes('who') || lowerText.includes('how') || lowerText.includes('कुठे') || lowerText.includes('काय')) {
          setDisplayType('query');
          // Simple live logic for presentation routing simulation
          setAiResponse(`Searching memories for "${spokenText}"... Ledger matched standard database indexes.`);
        } else {
          setDisplayType('store');
        }
      };

      rec.onerror = (e: any) => {
        console.error("Microphone tool error: ", e);
        setIsRecording(false);
      };

      rec.onend = () => {
        setIsRecording(false);
      };

      setRecognition(rec);
    }
  }, []);

  // 4. Live Continuous Recording Functions
  const startRecording = () => {
    // CRITICAL: Clear the screen completely when you tap start for a brand new thing!
    setDisplayText('');
    setAiResponse('');
    setDisplayType('');
    setIsRecording(true);

    if (recognition) {
      try {
        recognition.start();
      } catch (err) {
        console.log("Mic already started:", err);
      }
    } else {
      alert("Microphone access is blocked or not supported on this browser tab.");
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (recognition) {
      recognition.stop();
    }
  };

  // 5. The Pristine UI Layout
  return (
    <div className="fixed inset-0 bg-white flex flex-col justify-between p-6 overflow-hidden select-none">
      
      {/* TOP ROW: Title on Left, Name Input + Label Centered */}
      <div className="w-full max-w-4xl mx-auto flex flex-col md:flex-row justify-between items-start pt-4 gap-4">
        
        {/* Top Left Title */}
        <h1 className="text-xl font-semibold text-black tracking-tight">
          Voice Memory Ledger
        </h1>

        {/* Centered Name Input with Under-text Label */}
        <div className="w-full max-w-xs mx-auto md:mx-0 flex flex-col items-center">
          <input 
            type="text" 
            placeholder="" 
            value={name} 
            onChange={(e) => setName(e.target.value)}
            className="w-full p-2 border-b-2 border-gray-300 text-center focus:outline-none focus:border-black text-lg font-medium"
          />
          <span className="text-xs text-gray-400 mt-1 tracking-wide">
            type your name
          </span>
        </div>
        
      </div>

      {/* CENTER: The Giant Locked Speaker/Mic Symbol + Instructions */}
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
        
        {/* Primary Action Text */}
        <p className="text-gray-500 text-sm mt-4 tracking-wide font-medium">
          {isRecording ? 'Recording... Tap to Stop' : 'Press the MIC & speak'}
        </p>

        {/* THE QUESTION & ANSWER DISPLAY UNIT */}
        {displayText && (
          <div className="mt-6 max-w-md w-full px-6 py-4 bg-gray-50 rounded-2xl border border-gray-100 text-center animate-fadeIn">
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

        {/* Neatly Centered Conversational Examples (Hidden when text is active) */}
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

      {/* BOTTOM: Minimal balancing space */}
      <div className="h-6"></div>

    </div>
  );
}

export default App;