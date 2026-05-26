import { useState, useEffect, useRef } from "react";
import { 
  Mic, 
  Square, 
  Loader2, 
  Database, 
  Trash2, 
  Sparkles, 
  Info, 
  Clock, 
  Search, 
  Bookmark, 
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Terminal,
  KeyRound,
  FileCheck
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Memory {
  id: number;
  timestamp: string;
  category: string;
  memory: string;
}

interface SystemResponse {
  success: boolean;
  action: "SAVE" | "SEARCH";
  transcription: string;
  providerUsed: string;
  category?: string;
  memory?: string;
  query?: string;
  message: string;
  matchedCount?: number;
}

export default function App() {
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "processing">("idle");
  const [systemResponse, setSystemResponse] = useState<SystemResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isFetchingMemories, setIsFetchingMemories] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // API Key local persistence states
  const [openAiKey, setOpenAiKey] = useState(() => localStorage.getItem("voice_ledger_openai_key") || "");
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem("voice_ledger_gemini_key") || "");
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);

  // Status logs console terminal states
  const [statusLogs, setStatusLogs] = useState<string[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<any>(null);
  const logTerminalEndRef = useRef<HTMLDivElement | null>(null);

  // Automatically scroll log console terminal to bottom when new logs stream in
  useEffect(() => {
    if (logTerminalEndRef.current) {
      logTerminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [statusLogs]);

  // Logging utility helper
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setStatusLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  };

  // Safe localStorage state updater for keys
  const handleOpenAiKeyChange = (val: string) => {
    setOpenAiKey(val);
    localStorage.setItem("voice_ledger_openai_key", val);
  };

  const handleGeminiKeyChange = (val: string) => {
    setGeminiKey(val);
    localStorage.setItem("voice_ledger_gemini_key", val);
  };

  const clearLogsConsole = () => {
    setStatusLogs([]);
  };

  // Fetch SQLite memory ledger list
  const fetchMemories = async () => {
    setIsFetchingMemories(true);
    try {
      const res = await fetch("/api/memories");
      const data = await res.json();
      if (data.success) {
        setMemories(data.memories);
      }
    } catch (err) {
      console.error("Failed to load memory ledger:", err);
    } finally {
      setIsFetchingMemories(false);
    }
  };

  useEffect(() => {
    fetchMemories();
    return () => {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    };
  }, []);

  // Format Unix seconds to readable mm:ss format
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Begin capturing native microphone stream
  const startRecording = async () => {
    setErrorMessage(null);
    setSystemResponse(null);
    audioChunksRef.current = [];
    setRecordingDuration(0);
    
    // Log listening state
    addLog("Status: Listening... Speak your statement or question clearly into the mic.");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Select browser standard supported container format
      let options = {};
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        options = { mimeType: "audio/webm;codecs=opus" };
      } else if (MediaRecorder.isTypeSupported("audio/webm")) {
        options = { mimeType: "audio/webm" };
      } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
        options = { mimeType: "audio/ogg;codecs=opus" };
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        options = { mimeType: "audio/mp4" };
      }

      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        addLog("Status: Speech captured. Packaging raw audio buffer chunks...");
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: recorder.mimeType || "audio/webm" 
        });
        await uploadAndProcessAudio(audioBlob);
        
        // Disable tracks to preserve microphone privacy indicator light
        stream.getTracks().forEach((track) => track.stop());
      };

      // Launch recorder
      recorder.start(250);
      setRecordingState("recording");

      // Set up recording time counter
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

    } catch (err: any) {
      console.error("Mic Capture Error:", err);
      const captureErrorMsg = "Could not access your microphone. Please verify site permissions in your browser's address bar.";
      setErrorMessage(captureErrorMsg);
      addLog(`Status: Mic Error - ${captureErrorMsg}`);
      setRecordingState("idle");
    }
  };

  // Cease recording and trigger the stop callback (which fires the AI pipeline)
  const stopRecording = () => {
    if (mediaRecorderRef.current && recordingState === "recording") {
      addLog("Status: Ceased audio capture. Resolving audio stream...");
      mediaRecorderRef.current.stop();
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    }
  };

  // Transmit raw audio data blob to backend Express REST controller
  const uploadAndProcessAudio = async (audioBlob: Blob) => {
    setRecordingState("processing");
    addLog("Status: Distributing payload to Server Node endpoint /api/process-voice...");
    
    // Choose logs representation based on whether custom OpenAI keys are initialized
    if (openAiKey.trim()) {
      addLog("Status: Dispatching payload to OpenAI Whisper API for transcription...");
    } else {
      addLog("Status: Route configured for active Google Gemini transcription fallback...");
    }

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      // Set dynamic header configurations
      const headers: Record<string, string> = {};
      if (openAiKey.trim()) {
        headers["x-openai-key"] = openAiKey.trim();
      }
      if (geminiKey.trim()) {
        headers["x-gemini-key"] = geminiKey.trim();
      }

      const response = await fetch("/api/process-voice", {
        method: "POST",
        headers,
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Cognitive pipeline failed to process request.");
      }

      // Add dynamic terminal feedback based on returned backend transaction properties
      addLog(`Status: Transcribed text found: "${result.transcription}"`);
      addLog("Status: Asking Gemini to route cognitive intent...");

      if (result.action === "SAVE") {
        addLog(`Status: Successfully saved to ledger! Action: SAVE | Category: [${result.category}]`);
      } else if (result.action === "SEARCH") {
        addLog(`Status: Successfully resolved ledger search query! Found ${result.matchedCount || 0} relative match(es) in database.`);
      }

      setSystemResponse(result);
      fetchMemories(); // Instantly synchronize UI grid
    } catch (err: any) {
      console.error("Upload failure:", err);
      const errTxt = err.message || "An unexpected error occurred during transcription.";
      setErrorMessage(errTxt);
      addLog(`Status: Error processing voice - ${errTxt}`);
      setRecordingState("idle");
    } finally {
      if (recordingState !== "recording") {
        setRecordingState("idle");
      }
    }
  };

  // Delete an individual memory row
  const deleteMemory = async (id: number) => {
    try {
      const resp = await fetch(`/api/memories/${id}`, { method: "DELETE" });
      const data = await resp.json();
      if (data.success) {
        addLog(`Status: Removed memory record ID [${id}] from SQLite filesystem.`);
        // Redraw list without the row
        setMemories((prev) => prev.filter((m) => m.id !== id));
      } else {
        alert(data.error || "Could not delete record.");
      }
    } catch (err) {
      console.error("Delete call aborted:", err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white pb-16 antialiased">
      {/* Decorative background grid and ambient lighting */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.08),transparent_50%),radial-gradient(circle_at_70%_80%,rgba(239,68,68,0.05),transparent_50%)] pointer-events-none" />
      
      {/* TOP NAVIGATION HEADER */}
      <header className="relative max-w-7xl mx-auto px-6 py-6 md:py-8 flex flex-col sm:flex-row items-center justify-between border-b border-slate-900 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
            <Database className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="font-semibold text-lg tracking-tight bg-gradient-to-r from-slate-100 via-indigo-100 to-indigo-400 bg-clip-text text-transparent">
              Voice Memory Ledger
            </h1>
            <p className="text-xs text-slate-500">Cognitive SQLite Storage SaaS Engine</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-full text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            SQLite Node Connected
          </div>
        </div>
      </header>

      {/* NEW: API KEY MANAGER INTERFACE (Client Provided Headers) */}
      <section className="relative max-w-5xl mx-auto px-6 pt-6">
        <div className="bg-slate-900/40 backdrop-blur-md border border-slate-900 rounded-2xl p-4 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound className="w-4 h-4 text-indigo-400" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Transient Sandbox API Credentials</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* OpenAI Key Input */}
            <div className="relative">
              <label className="block text-[11px] font-mono font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
                Enter OpenAI API Key (Whisper Transcription)
              </label>
              <div className="relative">
                <input 
                  type={showOpenAiKey ? "text" : "password"} 
                  value={openAiKey} 
                  onChange={(e) => handleOpenAiKeyChange(e.target.value)} 
                  placeholder="sk-proj-..." 
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-3 pr-10 py-1.5 text-xs font-mono text-slate-300 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/25 transition-all placeholder:text-slate-700"
                />
                <button 
                  type="button"
                  onClick={() => setShowOpenAiKey(!showOpenAiKey)} 
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showOpenAiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">If blank, transcribes using Google Gemini natively.</p>
            </div>

            {/* Gemini Key Input */}
            <div className="relative">
              <label className="block text-[11px] font-mono font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
                Enter Google Gemini API Key (Cognitive Brain)
              </label>
              <div className="relative">
                <input 
                  type={showGeminiKey ? "text" : "password"} 
                  value={geminiKey} 
                  onChange={(e) => handleGeminiKeyChange(e.target.value)} 
                  placeholder="AIzaSy..." 
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-3 pr-10 py-1.5 text-xs font-mono text-slate-300 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/25 transition-all placeholder:text-slate-700"
                />
                <button 
                  type="button"
                  onClick={() => setShowGeminiKey(!showGeminiKey)} 
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showGeminiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Required to routing categorizations & answers.</p>
            </div>
          </div>
        </div>
      </section>

      {/* MAIN APPLICATION CONTAINER */}
      <main className="relative max-w-5xl mx-auto px-6 pt-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: THE CAPTURAL NODE CONTROLLER */}
        <section className="lg:col-span-5 flex flex-col items-center gap-6">
          
          <div className="w-full bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl p-8 flex flex-col items-center text-center shadow-xl">
            <h2 className="text-xs font-semibold tracking-wide text-indigo-400 uppercase mb-2">Voice Capturer Node</h2>
            <p className="text-xs text-slate-400 mb-8 max-w-xs">
              State facts to write them, or ask questions to query your historic logs.
            </p>

            {/* REACTIVE MICROPHONE BUTTON STYLING */}
            <div className="relative mb-6 flex flex-col items-center">
              {/* Pulsing ring animation for active states */}
              <AnimatePresence>
                {recordingState === "recording" && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1.3 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "easeOut" }}
                    className="absolute inset-0 bg-red-500/20 rounded-full pointer-events-none"
                  />
                )}
                {recordingState === "processing" && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1.15 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="absolute inset-0 bg-indigo-500/10 rounded-full pointer-events-none border border-dashed border-indigo-500/30 animate-spin"
                    style={{ animationDuration: "12s" }}
                  />
                )}
              </AnimatePresence>

              {/* Standard button */}
              <button
                id="mic-node-button"
                onClick={recordingState === "recording" ? stopRecording : startRecording}
                disabled={recordingState === "processing"}
                className={`z-10 w-28 h-28 rounded-full border flex items-center justify-center shadow-2xl transition-all duration-300 ${
                  recordingState === "recording"
                    ? "bg-red-500 border-red-400 text-white cursor-pointer hover:bg-red-400"
                    : recordingState === "processing"
                    ? "bg-slate-800 border-slate-700 text-slate-400 cursor-not-allowed"
                    : "bg-slate-800/90 border-slate-700/80 text-slate-300 cursor-pointer hover:border-indigo-500 hover:text-white hover:bg-slate-800"
                }`}
              >
                {recordingState === "recording" ? (
                  <Square className="w-8 h-8 fill-current" />
                ) : recordingState === "processing" ? (
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                ) : (
                  <Mic className="w-9 h-9" />
                )}
              </button>

              {/* Status Tags */}
              <div className="mt-5 min-h-[24px]">
                {recordingState === "recording" && (
                  <span className="flex items-center gap-1.5 text-xs text-red-400 font-medium font-mono">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    RECORDING ({formatTime(recordingDuration)})
                  </span>
                )}
                {recordingState === "processing" && (
                  <span className="flex items-center gap-2 text-xs text-indigo-400 font-medium font-mono">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    COGNITIVE PROCESSING
                  </span>
                )}
                {recordingState === "idle" && (
                  <span className="text-xs text-slate-500 font-medium">
                    Press button to record Voice
                  </span>
                )}
              </div>
            </div>

            {/* Error Message display */}
            {errorMessage && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full flex gap-2 p-3.5 bg-red-500/10 border border-red-500/20 text-red-300 text-xs text-left rounded-xl mb-4"
              >
                <AlertCircle className="w-4 h-4 shrink-0 stroke-[2.5]" />
                <span>{errorMessage}</span>
              </motion.div>
            )}

            {/* NEW: LIVE "STATUS LOG" TERMINAL BOX */}
            <div className="w-full mt-2 text-left border-t border-slate-800/75 pt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono font-semibold tracking-wider text-indigo-400 uppercase flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                  Live Status Log Terminal
                </span>
                {statusLogs.length > 0 && (
                  <button 
                    onClick={clearLogsConsole}
                    className="text-[10px] text-slate-500 hover:text-slate-300 font-mono transition-colors"
                  >
                    Clear Logs
                  </button>
                )}
              </div>
              
              <div className="w-full bg-slate-950 border border-slate-900 rounded-xl p-4 font-mono text-[10.5px] text-slate-300 h-48 overflow-y-auto space-y-2 relative shadow-inner">
                <div className="absolute top-3 right-4 flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${recordingState === "recording" ? "bg-red-500 animate-ping" : recordingState === "processing" ? "bg-indigo-500 animate-pulse" : "bg-indigo-500/30"}`} />
                  <span className="text-[9px] text-slate-600 uppercase font-semibold">LIVE_STREAM</span>
                </div>
                
                {statusLogs.length === 0 ? (
                  <div className="text-slate-700 italic py-1 leading-relaxed">
                    &gt; Console pipeline idle. Records or speech queries will populate execution logs here.
                  </div>
                ) : (
                  statusLogs.map((log, index) => (
                    <div key={index} className="text-indigo-200/90 leading-relaxed border-l border-slate-800 pl-2 shrink-0 select-text">
                      <span className="text-slate-600 font-medium">$&gt;</span> {log}
                    </div>
                  ))
                )}
                <div ref={logTerminalEndRef} />
              </div>
            </div>

            {/* Tips area */}
            <div className="w-full p-4 bg-slate-950/40 border border-slate-900 rounded-xl text-left text-[11px] text-slate-400 mt-6">
              <span className="font-semibold text-slate-300 block mb-1.5 flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-slate-400" /> Standard Voice Blueprints
              </span>
              <ul className="list-disc pl-4 space-y-1 text-slate-400/95 leading-normal">
                <li><span className="text-indigo-300">Fact:</span> &quot;Remember my office alarm passcode is 4029&quot;</li>
                <li><span className="text-indigo-300">Question:</span> &quot;What was my office passcode again?&quot;</li>
              </ul>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: COGNITIVE RESPONSE TERMINAL & HISTORY GRID */}
        <section className="lg:col-span-7 flex flex-col gap-6">
          
          {/* COGNITIVE PIPELINE RESPONSE CARD */}
          <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 md:p-8 shadow-xl">
            <h2 className="text-sm font-semibold tracking-wide text-indigo-400 uppercase mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> Cognitive Response Terminal
            </h2>

            <AnimatePresence mode="wait">
              {systemResponse ? (
                <motion.div 
                  key="response-present"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="space-y-6"
                >
                  {/* Transcription Sub-card */}
                  <div className="p-4 bg-slate-950/80 border border-slate-900 rounded-xl relative">
                    <span className="absolute -top-2 left-3 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-full text-[10px] uppercase font-mono text-indigo-400 font-semibold tracking-wider">
                      Spoken Audio Input
                    </span>
                    <p className="text-slate-300 pt-1 leading-relaxed italic text-[14px]">
                      &quot;{systemResponse.transcription}&quot;
                    </p>
                    <div className="mt-2.5 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                      <span>Transcribed with: {systemResponse.providerUsed}</span>
                      <span>1 Ch • 16kHz Webm</span>
                    </div>
                  </div>

                  {/* Decision Tag Routing & Outcome */}
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {systemResponse.action === "SAVE" ? (
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-emerald-400 font-mono text-xs font-semibold">
                          <Bookmark className="w-3.5 h-3.5" />
                          INTENT ROUTED: [SAVE]
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 border border-indigo-500/30 rounded-full text-indigo-400 font-mono text-xs font-semibold">
                          <Search className="w-3.5 h-3.5" />
                          INTENT ROUTED: [SEARCH]
                        </div>
                      )}

                      {systemResponse.category && (
                        <div className="px-2.5 py-0.5 bg-slate-800 border border-slate-700 rounded-md text-[11px] font-medium text-slate-300">
                          Category: {systemResponse.category}
                        </div>
                      )}
                      
                      {systemResponse.query && (
                        <div className="px-2.5 py-0.5 bg-slate-800 border border-slate-700 rounded-md text-[11px] font-medium text-indigo-300 font-mono">
                          Keyword: &quot;{systemResponse.query}&quot;
                        </div>
                      )}
                    </div>

                    {/* Final Formulated System Response Textarea */}
                    <div className="p-5 bg-gradient-to-br from-indigo-950/20 to-slate-950/60 border border-indigo-500/15 rounded-xl text-slate-100">
                      <div className="flex gap-2.5 items-start">
                        {systemResponse.action === "SAVE" ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <Sparkles className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <p className="text-slate-250 text-sm font-medium leading-relaxed">
                            {systemResponse.message}
                          </p>
                          {systemResponse.action === "SAVE" && systemResponse.memory && (
                            <div className="mt-3 text-xs p-2.5 bg-slate-950/80 border border-slate-900 rounded-lg font-mono text-indigo-300">
                              <span className="text-slate-500 block mb-0.5">Logged Record Payload:</span>
                              {systemResponse.memory}
                            </div>
                          )}
                          {systemResponse.action === "SEARCH" && typeof systemResponse.matchedCount === "number" && (
                            <span className="block mt-2.5 text-[10px] text-slate-500 font-mono">
                              Located {systemResponse.matchedCount} historical database hit(s) for query synthesis.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="response-absent"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-12 flex flex-col items-center justify-center text-center text-slate-500"
                >
                  <div className="w-12 h-12 rounded-full bg-slate-950 flex items-center justify-center border border-slate-900 mb-3">
                    <HelpCircle className="w-6 h-6 text-slate-600" />
                  </div>
                  <p className="text-xs max-w-sm font-normal">
                    No active voice events processed. Trigger the microphone to begin transcription, AI analysis, and autonomous SQLite execution.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* SECURE SQLITE LEDGER HISTORY INVENTORY */}
          <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-wide text-slate-300 uppercase flex items-center gap-2">
                <Database className="w-4 h-4 text-slate-400" /> SQLite Ledger Database
              </h3>
              <span className="font-mono text-[11px] px-2 py-0.5 bg-slate-950 border border-slate-900 rounded-full text-indigo-400">
                {memories.length} Records Saved
              </span>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/50 max-h-[350px] overflow-y-auto">
              {isFetchingMemories ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-500 font-mono text-xs gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-600" />
                  SYNCING RECORD TIMELINE...
                </div>
              ) : memories.length > 0 ? (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-mono text-[10px] uppercase tracking-wider">
                      <th className="py-2 px-4 font-semibold">Category</th>
                      <th className="py-2 px-4 font-semibold">Logged Memory</th>
                      <th className="py-2 px-4 font-semibold hidden md:table-cell"><span className="flex items-center gap-1"><Clock className="w-3 h-3 text-slate-500" /> Logged Date</span></th>
                      <th className="py-2 px-4 text-right w-12 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    <AnimatePresence>
                      {memories.map((entry) => (
                        <motion.tr 
                          key={entry.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="hover:bg-slate-900/40 transition-colors"
                        >
                          <td className="py-3 px-4 font-medium align-top whitespace-nowrap">
                            <span className="px-2 py-0.5 bg-slate-900 border border-slate-800 text-[10px] rounded text-indigo-300 font-medium">
                              {entry.category}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-300 leading-normal align-top font-sans select-text">
                            {entry.memory}
                          </td>
                          <td className="py-3 px-4 text-slate-500 font-mono text-[10px] whitespace-nowrap align-top hidden md:table-cell">
                            {new Date(entry.timestamp).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                          </td>
                          <td className="py-3 px-4 text-right align-top">
                            <button
                              onClick={() => deleteMemory(entry.id)}
                              className="text-slate-600 hover:text-red-400 p-1.5 rounded-md transition-colors cursor-pointer"
                              title="Delete Record"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              ) : (
                <div className="py-12 flex flex-col items-center justify-center text-center text-slate-500 px-6">
                  <Database className="w-8 h-8 text-slate-800 mb-2" />
                  <p className="text-xs max-w-xs font-normal">
                    Database empty. State some key facts to the mic capturer to persist them securely here.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
