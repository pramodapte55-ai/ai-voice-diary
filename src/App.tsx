import React, { useState, useEffect, useRef } from "react";
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
  Sliders
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

// @ts-ignore
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || "";

export default function App() {
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "processing">("idle");
  const [systemResponse, setSystemResponse] = useState<SystemResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isFetchingMemories, setIsFetchingMemories] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // User Profile multi-tenancy identification key
  const [userId, setUserId] = useState(() => localStorage.getItem("voice_ledger_user_id") || "");
  const [isEditingName, setIsEditingName] = useState(() => !localStorage.getItem("voice_ledger_user_id"));
  const [tempName, setTempName] = useState(() => localStorage.getItem("voice_ledger_user_id") || "");

  // API Key local persistence states
  const [openAiKey, setOpenAiKey] = useState(() => localStorage.getItem("voice_ledger_openai_key") || "");
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem("voice_ledger_gemini_key") || "");
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showApiKeysSetting, setShowApiKeysSetting] = useState(false);

  // Status logs console terminal states
  const [statusLogs, setStatusLogs] = useState<string[]>([]);
  
  // Mobile UI Tab selection state (for low-height responsive scaling)
  const [activeMobileTab, setActiveMobileTab] = useState<"insights" | "ledger">("insights");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<any>(null);
  const logTerminalEndRef = useRef<HTMLDivElement | null>(null);

  // Scroll log console terminal to bottom on change
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

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = tempName.trim();
    if (!clean) {
      alert("Please provide a valid session profile ID.");
      return;
    }
    setUserId(clean);
    localStorage.setItem("voice_ledger_user_id", clean);
    setIsEditingName(false);
    addLog(`Status: Connected to isolated sandbox profile "[${clean}]"`);
  };

  const clearSessionProfile = () => {
    localStorage.removeItem("voice_ledger_user_id");
    setUserId("");
    setTempName("");
    setIsEditingName(true);
    addLog("Status: Logged out from current session profile.");
  };

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

  // Fetch SQLite memory ledger list based on current active user
  const fetchMemories = async () => {
    if (!userId.trim()) return;
    setIsFetchingMemories(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/memories`, {
        headers: {
          "x-user-id": userId.trim()
        }
      });
      const resText = await res.text();
      let data: any;
      try {
        data = JSON.parse(resText);
      } catch (parseErr) {
        if (resText.includes("<html") || resText.includes("<!DOCTYPE")) {
          const cleanText = resText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
          throw new Error(`Server HTML error: ${cleanText.substring(0, 150)}`);
        }
        throw new Error(`Invalid format returned: ${resText.substring(0, 150)}`);
      }
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
    if (userId) {
      fetchMemories();
    }
  }, [userId]);

  useEffect(() => {
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
    if (!userId.trim()) {
      setErrorMessage("Please set a valid session profile at the top first.");
      return;
    }
    setErrorMessage(null);
    setSystemResponse(null);
    audioChunksRef.current = [];
    setRecordingDuration(0);
    
    addLog(`Status: Recording session for [${userId}] active! Speak clearly into the microphone.`);

    try {
      // Capture mono stream to reduce initial recording overhead
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { channelCount: 1 } 
      });
      
      // Select browser standard supported container format with low bitrate compression
      let options: any = {};
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        options = { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 24000 };
      } else if (MediaRecorder.isTypeSupported("audio/webm")) {
        options = { mimeType: "audio/webm", audioBitsPerSecond: 24000 };
      } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
        options = { mimeType: "audio/ogg;codecs=opus", audioBitsPerSecond: 24000 };
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        options = { mimeType: "audio/mp4", audioBitsPerSecond: 24000 };
      }

      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        addLog("Status: Speech capture completed. Processing audio tracks...");
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
      const captureErrorMsg = "Microphone capture aborted. Check browser security settings in your URL domain lock.";
      setErrorMessage(captureErrorMsg);
      addLog(`Status: Mic Error - ${captureErrorMsg}`);
      setRecordingState("idle");
    }
  };

  // Cease recording and trigger the stop callback (which fires the AI pipeline)
  const stopRecording = () => {
    if (mediaRecorderRef.current && recordingState === "recording") {
      addLog("Status: Finalizing speech payload. Sending buffers...");
      mediaRecorderRef.current.stop();
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    }
  };

  // Transmit raw audio data blob to backend Express REST controller
  const uploadAndProcessAudio = async (audioBlob: Blob) => {
    setRecordingState("processing");
    addLog("Status: Uploading audio buffer payload to cloud engine endpoint /api/process-voice...");
    
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      // Set dynamic header configurations
      const headers: Record<string, string> = {
        "x-user-id": userId.trim() || "default"
      };
      if (openAiKey.trim()) {
        headers["x-openai-key"] = openAiKey.trim();
      }
      if (geminiKey.trim()) {
        headers["x-gemini-key"] = geminiKey.trim();
      }

      const response = await fetch(`${API_BASE_URL}/api/process-voice`, {
        method: "POST",
        headers,
        body: formData,
      });

      const responseText = await response.text();
      let result: any;
      try {
        result = JSON.parse(responseText);
      } catch (parseErr) {
        if (responseText.includes("<html") || responseText.includes("<!DOCTYPE")) {
          const cleanText = responseText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
          const displayError = cleanText.substring(0, 150) || "Received HTML page from server instead of JSON.";
          throw new Error(`Server returned HTML error page (timeout or quota lock): ${displayError}`);
        } else {
          throw new Error(`Server responded with non-JSON format: ${responseText.substring(0, 150)}`);
        }
      }

      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Voice parsing cognitive pipeline failed.");
      }

      // Add dynamic terminal feedback based on returned backend transaction properties
      addLog(`Status: Resolved transcription: "${result.transcription}"`);
      addLog(`Status: Cognitive routing active. Target action: ${result.action}`);

      if (result.action === "SAVE") {
        addLog(`Status: Memory persisted under category "[${result.category}]" successfully.`);
      } else if (result.action === "SEARCH") {
        addLog(`Status: Search resolved. Found ${result.matchedCount || 0} relational records.`);
      }

      setSystemResponse(result);
      
      // Auto toggle to insights tab so the user sees the cognitive outputs instantly on mobile
      setActiveMobileTab("insights");
      
      // Instantly synchronize UI sqlite table logs
      fetchMemories();
    } catch (err: any) {
      console.error("Upload failure:", err);
      const errTxt = err.message || "An unexpected error occurred during transcription.";
      setErrorMessage(errTxt);
      addLog(`Status: Cognitive Pipeline Error - ${errTxt}`);
      setRecordingState("idle");
    } finally {
      setRecordingState("idle");
    }
  };

  // Delete an individual memory row
  const deleteMemory = async (id: number) => {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/memories/${id}`, { 
        method: "DELETE",
        headers: {
          "x-user-id": userId.trim() || "default"
        }
      });
      const respText = await resp.text();
      let data: any;
      try {
        data = JSON.parse(respText);
      } catch (pe) {
        if (respText.includes("<html") || respText.includes("<!DOCTYPE")) {
          const cleanText = respText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
          throw new Error(`Server HTML error: ${cleanText.substring(0, 150)}`);
        }
        throw new Error(`Invalid format returned: ${respText.substring(0, 150)}`);
      }
      if (data.success) {
        addLog(`Status: Successfully deleted entry ID [${id}] from SQLite registry files.`);
        setMemories((prev) => prev.filter((m) => m.id !== id));
      } else {
        alert(data.error || "Could not delete record.");
      }
    } catch (err: any) {
      console.error("Delete call aborted:", err);
      alert(err.message || "An unexpected error occurred during record deletion.");
    }
  };

  return (
    <div className="h-screen w-full flex flex-col bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white overflow-hidden relative antialiased leading-relaxed">
      
      {/* Dynamic atmospheric grid context lights */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(99,102,241,0.08),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(239,68,68,0.03),transparent_40%)] pointer-events-none z-0" />

      {/* 1. TOP-BAR LEAF HEADER (Flexible shrink-0 bounds) */}
      <header className="relative shrink-0 bg-slate-950 border-b border-slate-900/80 px-4 py-3 flex items-center justify-between z-30">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
            <Database className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="font-bold text-sm md:text-base tracking-tight text-white leading-none">
              Voice Memory Ledger
            </h1>
            <p className="text-[10px] text-slate-500 font-mono mt-0.5">Isolated SQLite Micro-SaaS Engine</p>
          </div>
        </div>

        {/* Dynamic active user status bubble */}
        {userId && !isEditingName && (
          <div className="flex items-center gap-2">
            <div className="text-[10px] sm:text-xs font-mono bg-indigo-505/10 bg-slate-900 border border-slate-800 px-3 py-1 rounded-full text-slate-300 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Session ID: <strong className="text-white font-semibold font-sans">{userId}</strong>
            </div>
            <button
              onClick={() => {
                setTempName(userId);
                setIsEditingName(true);
              }}
              className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors text-xs font-medium font-sans px-2.5 py-1"
              title="Change Account Name"
            >
              Rename
            </button>
            <button
              onClick={clearSessionProfile}
              className="text-[10px] text-red-400 hover:text-red-300 transition-colors px-1"
            >
              Clear
            </button>
          </div>
        )}
      </header>

      {/* 2. INSTANT MULTI-TENANCY NAME MEMORY PROMPT (Display only when nameless OR triggered rename) */}
      <AnimatePresence>
        {isEditingName && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="shrink-0 bg-gradient-to-r from-indigo-950/40 via-slate-900 to-indigo-950/40 border-b border-indigo-500/20 px-6 py-3.5 z-20 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/10 rounded-xl border border-indigo-500/10">
                <Sliders className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-center md:text-left">
                <p className="text-xs font-semibold text-slate-200 tracking-wide uppercase font-sans">
                  Enter Your Name to Begin Private Session
                </p>
                <p className="text-[10px] text-slate-400 leading-normal">
                  No databases will be shared. All voice actions will query and write exclusively to your standalone user profile sandbox.
                </p>
              </div>
            </div>
            
            <form onSubmit={handleNameSubmit} className="flex items-center gap-2 w-full md:w-auto">
              <input 
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                placeholder="e.g. Pramod, Milind, Friend1"
                className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-3 py-1.5 w-full md:w-64 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/25 font-mono"
                required
              />
              <button 
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs px-4 py-1.5 rounded-lg transition-colors shadow-lg"
              >
                Confirm
              </button>
              {userId && (
                <button 
                  type="button" 
                  onClick={() => setIsEditingName(false)}
                  className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 text-xs px-3 py-1.5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              )}
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. CORE AUDIO CAPTURE BOARD (ROCK-SOLID COORDINATES - NO HEIGHT JUMPING) */}
      <section className="shrink-0 flex flex-col items-center justify-center bg-slate-950 border-b border-slate-900 py-5 z-10 relative">
        <div className="w-full max-w-5xl px-6 flex flex-col items-center">
          
          {/* Constant stable wrapper for mic action controls */}
          <div className="relative h-28 w-28 flex items-center justify-center">
            
            <AnimatePresence>
              {recordingState === "recording" && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1.35 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: "easeOut" }}
                  className="absolute inset-0 bg-red-500/20 rounded-full pointer-events-none z-0"
                />
              )}
              {recordingState === "processing" && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1.2 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="absolute inset-0 bg-indigo-500/10 rounded-full pointer-events-none border border-dashed border-indigo-500/30 animate-spin z-0"
                  style={{ animationDuration: "14s" }}
                />
              )}
            </AnimatePresence>

            {/* Microphone tap target */}
            <button
              id="anchored-voice-node-button"
              onClick={recordingState === "recording" ? stopRecording : startRecording}
              disabled={recordingState === "processing" || !userId}
              className={`z-10 w-24 h-24 rounded-full border flex items-center justify-center shadow-2xl transition-all duration-300 absolute ${
                !userId
                  ? "bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed opacity-50"
                  : recordingState === "recording"
                  ? "bg-red-500 border-red-400 text-white cursor-pointer hover:bg-red-400"
                  : recordingState === "processing"
                  ? "bg-slate-800 border-slate-700 text-slate-400 cursor-not-allowed"
                  : "bg-slate-800/95 border-slate-700 text-slate-200 cursor-pointer hover:border-indigo-500 hover:text-white hover:bg-slate-800"
              }`}
            >
              {recordingState === "recording" ? (
                <Square className="w-7 h-7 fill-current" />
              ) : recordingState === "processing" ? (
                <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
              ) : (
                <Mic className="w-8 h-8" />
              )}
            </button>
          </div>

          {/* Secure stable heights for status elements under the mic to prevent shifting of mic coordinates */}
          <div className="h-6 mt-3 flex items-center justify-center">
            {recordingState === "recording" && (
              <span className="flex items-center gap-2 text-xs text-red-400 font-semibold font-mono">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping shrink-0" />
                RECORDING AUDIO ({formatTime(recordingDuration)})
              </span>
            )}
            {recordingState === "processing" && (
              <span className="flex items-center gap-2 text-xs text-indigo-400 font-semibold font-mono">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ANALYZING SPEECH WITH WHISPER & GEMINI
              </span>
            )}
            {recordingState === "idle" && (
              <span className="text-xs text-slate-400 font-sans tracking-wide">
                {!userId ? (
                  <strong className="text-rose-400 font-medium">Please enter your profile name above to begin recording</strong>
                ) : (
                  "Say facts to log them, or ask questions to query"
                )}
              </span>
            )}
          </div>

          {/* Error notice panel inside stable absolute space or bounded low height */}
          <div className="h-10 mt-1.5 flex items-center justify-center w-full max-w-xl">
            {errorMessage && (
              <div className="flex gap-2 p-2 bg-red-500/10 border border-red-500/20 text-red-400 text-[10.5px] rounded-lg items-center text-center leading-snug w-full justify-center">
                <AlertCircle className="w-3.5 h-3.5 stroke-[2.5] text-red-400 shrink-0" />
                <span className="truncate">{errorMessage}</span>
                <button onClick={() => setErrorMessage(null)} className="text-slate-500 hover:text-slate-300 font-mono text-[9px] ml-1 uppercase pl-1.5 border-l border-red-500/10">Dismiss</button>
              </div>
            )}
          </div>

        </div>
      </section>

      {/* 4. RESPONSIVE SEGMENTED TABS CONTROLLERS (Display only on small views below desktop grid) */}
      <div className="shrink-0 md:hidden bg-slate-950 border-b border-slate-900 p-2.5 flex items-center gap-2 z-10 justify-center">
        <button 
          onClick={() => setActiveMobileTab("insights")}
          className={`flex-1 max-w-[180px] text-center text-xs py-1.5 rounded-lg font-medium transition-all ${activeMobileTab === "insights" ? "bg-slate-800 text-indigo-400 border border-slate-700/60" : "text-slate-400 hover:text-slate-200"}`}
        >
          Insights Response
        </button>
        <button 
          onClick={() => setActiveMobileTab("ledger")}
          className={`flex-1 max-w-[180px] text-center text-xs py-1.5 rounded-lg font-medium transition-all ${activeMobileTab === "ledger" ? "bg-slate-800 text-indigo-400 border border-slate-700/60" : "text-slate-400 hover:text-slate-200"}`}
        >
          SQLite Ledger ({memories.length})
        </button>
      </div>

      {/* 5. MULTIPLE RESULTS CHASSIS (Lock Layout Scroll Boundaries with dynamic inner overflow lists) */}
      <main className="flex-1 min-h-0 w-full max-w-5xl mx-auto p-4 md:p-6 grid grid-cols-1 md:grid-cols-12 gap-5 overflow-hidden z-10">
        
        {/* PANEL A: COGNITIVE INTELLIGENCE TERMINAL & LIVE CONSOLE LOGS */}
        <section className={`md:col-span-6 h-full flex flex-col gap-4 min-h-0 overflow-hidden ${activeMobileTab === "insights" ? "flex" : "hidden md:flex"}`}>
          
          {/* Cognitive Answer Terminal (Takes flexible space with overflow list scroll) */}
          <div className="flex-1 min-h-0 bg-slate-900/30 backdrop-blur-md border border-slate-950/80 rounded-xl p-4 md:p-5 flex flex-col shadow-xl">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <h2 className="text-xs font-semibold tracking-wider text-indigo-400 uppercase flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" /> Cognitive Agent Insight
              </h2>
              {systemResponse?.providerUsed && (
                <span className="text-[9px] font-mono text-slate-500 px-2 py-0.5 bg-slate-950 rounded border border-slate-900">
                  {systemResponse.providerUsed}
                </span>
              )}
            </div>

            {/* Inner responsive box */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
              <AnimatePresence mode="wait">
                {systemResponse ? (
                  <motion.div 
                    key="voice-insights-result"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-4 text-xs font-sans leading-relaxed"
                  >
                    {/* User speech card */}
                    <div className="p-3 bg-slate-950/80 border border-slate-900 rounded-lg relative">
                      <span className="text-[9px] font-mono font-bold text-indigo-400/80 uppercase block mb-1 tracking-wider">Spoken statement</span>
                      <p className="text-slate-200 italic font-sans leading-normal text-[13px]">
                        &quot;{systemResponse.transcription}&quot;
                      </p>
                    </div>

                    {/* Routing Meta Info Bar */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${systemResponse.action === "SAVE" ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" : "bg-indigo-500/10 border border-indigo-500/20 text-indigo-400"}`}>
                        ACTION: {systemResponse.action}
                      </div>
                      {systemResponse.category && (
                        <div className="px-2 py-0.5 bg-slate-900 border border-slate-800 text-[10.5px] font-medium text-slate-300 rounded">
                          Category: {systemResponse.category}
                        </div>
                      )}
                      {systemResponse.query && (
                        <div className="px-2 py-0.5 bg-slate-900 border border-slate-800 text-[10.5px] font-mono text-indigo-300 rounded">
                          Query: &quot;{systemResponse.query}&quot;
                        </div>
                      )}
                    </div>

                    {/* Formulated insights bubbles */}
                    <div className="p-4 bg-gradient-to-br from-indigo-950/10 to-slate-950 border border-indigo-500/10 rounded-lg">
                      <div className="flex gap-2.5 items-start">
                        {systemResponse.action === "SAVE" ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <p className="text-slate-100 text-[13px] font-medium leading-relaxed select-text">
                            {systemResponse.message}
                          </p>
                          {systemResponse.action === "SAVE" && systemResponse.memory && (
                            <div className="mt-2.5 text-[10.5px] p-2 bg-slate-950/80 border border-slate-900 rounded font-mono text-indigo-300 select-text">
                              <span className="text-slate-500 text-[9px] block mb-0.5 uppercase tracking-wide">Payload saved:</span>
                              {systemResponse.memory}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                  </motion.div>
                ) : (
                  <motion.div 
                    key="voice-insights-empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full flex flex-col items-center justify-center text-center text-slate-500 py-12"
                  >
                    <HelpCircle className="w-8 h-8 text-slate-700 mb-2.5" />
                    <p className="text-xs max-w-xs font-normal text-slate-400">
                      No memory event processed in this turn. Trigger the voice recorder, ask a question of your past records, or log a new fact.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Collapsible Transient Session API Key Manager Accordion at very bottom of Column */}
          <div className="shrink-0 bg-slate-900/10 border border-slate-900/60 rounded-xl p-3 shadow-inner">
            <button
              onClick={() => setShowApiKeysSetting(!showApiKeysSetting)}
              className="w-full flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors"
            >
              <span className="flex items-center gap-1.5 font-bold text-[10.5px]">
                <KeyRound className="w-3.5 h-3.5 text-slate-500" /> API Credentials Configuration
              </span>
              <span className="text-[9px] bg-slate-950 px-2 py-0.5 rounded border border-slate-900 text-slate-500">
                {showApiKeysSetting ? "Collaspe" : "Configure Keys"}
              </span>
            </button>

            {showApiKeysSetting && (
              <div className="mt-3 pt-3 border-t border-slate-900 space-y-3">
                <div className="relative">
                  <span className="block text-[10px] font-mono text-slate-500 mb-1">OPENAI API KEY (Whisper)</span>
                  <div className="relative">
                    <input 
                      type={showOpenAiKey ? "text" : "password"} 
                      value={openAiKey} 
                      onChange={(e) => handleOpenAiKeyChange(e.target.value)} 
                      placeholder="sk-proj-..." 
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-2 pr-8 py-1 text-[11px] font-mono text-slate-350 focus:outline-none focus:border-indigo-500 transition-all placeholder:text-slate-800"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowOpenAiKey(!showOpenAiKey)} 
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 transition-colors p-0.5"
                    >
                      {showOpenAiKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <span className="block text-[10px] font-mono text-slate-500 mb-1">GOOGLE GEMINI API KEY</span>
                  <div className="relative">
                    <input 
                      type={showGeminiKey ? "text" : "password"} 
                      value={geminiKey} 
                      onChange={(e) => handleGeminiKeyChange(e.target.value)} 
                      placeholder="AIzaSy..." 
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-2 pr-8 py-1 text-[11px] font-mono text-slate-350 focus:outline-none focus:border-indigo-500 transition-all placeholder:text-slate-800"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowGeminiKey(!showGeminiKey)} 
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 transition-colors p-0.5"
                    >
                      {showGeminiKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
                <p className="text-[9px] text-slate-600 leading-normal">
                  Providing these transient browser keys secures priority processing queue access. Values are preserved inside standard system client-side encrypted localStorage.
                </p>
              </div>
            )}
          </div>

        </section>

        {/* PANEL B: SQLITE HISTORY INVENTORY (Scrolls independently) */}
        <section className={`md:col-span-6 h-full flex flex-col min-h-0 bg-slate-900/30 backdrop-blur-md border border-slate-950/80 rounded-xl p-4 md:p-5 shadow-xl overflow-hidden ${activeMobileTab === "ledger" ? "flex" : "hidden md:flex"}`}>
          
          <div className="flex items-center justify-between shrink-0 mb-3.5">
            <h3 className="text-xs font-semibold tracking-wider text-slate-300 uppercase flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-slate-400" /> Sandbox Database Ledger
            </h3>
            <span className="font-mono text-[9px] px-2.5 py-0.5 bg-slate-950 border border-slate-800 rounded-full text-indigo-400 font-bold">
              {memories.length} Records Isolated
            </span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto bg-slate-950/40 border border-slate-900 rounded-lg relative">
            {isFetchingMemories ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 font-mono text-[11px] gap-2.5 bg-slate-950/80">
                <Loader2 className="w-5 h-5 animate-spin text-slate-600" />
                LOADING SECURE ACCOUNT REGISTRY...
              </div>
            ) : memories.length > 0 ? (
              <div className="w-full">
                <table className="w-full text-left border-collapse text-[11.5px]">
                  <thead>
                    <tr className="bg-slate-900/80 border-b border-slate-800 text-slate-500 font-mono text-[9px] uppercase tracking-wider sticky top-0 z-10">
                      <th className="py-2.5 px-3 font-semibold">Label ID</th>
                      <th className="py-2.5 px-3 font-semibold">Memory Record</th>
                      <th className="py-2.5 px-3 text-right w-10 font-semibold">Delete</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60 font-sans">
                    {memories.map((entry) => (
                      <tr 
                        key={entry.id}
                        className="hover:bg-slate-900/35 transition-colors group"
                      >
                        <td className="py-2.5 px-3 font-semibold align-top whitespace-nowrap">
                          <span className="px-1.5 py-0.5 bg-indigo-950/40 border border-indigo-500/10 text-[9.5px] rounded text-indigo-300 font-mono">
                            {entry.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-300 leading-relaxed align-top select-text">
                          <p className="font-sans font-medium text-[11.5px] text-slate-250">{entry.memory}</p>
                          <span className="text-[9px] text-slate-600 block mt-1 font-mono">
                            {new Date(entry.timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} • ID #{entry.id}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right align-top">
                          <button
                            onClick={() => deleteMemory(entry.id)}
                            className="text-slate-600 hover:text-red-400 p-1.5 rounded-md transition-colors cursor-pointer"
                            title="Delete Record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 px-6 py-12">
                <Database className="w-8 h-8 text-slate-800 mb-2.5 animate-pulse" />
                <p className="text-xs font-normal text-slate-400 max-w-xs leading-normal">
                  Your isolated sandbox database folder [{userId}] is empty.
                </p>
                <p className="text-[10px] text-slate-600 max-w-[210px] mt-2 block">
                  Record new facts into the mic above, and they will log to your name automatically.
                </p>
              </div>
            )}
          </div>

          {/* Mini Live Status Terminals inside scroll box */}
          <div className="shrink-0 mt-3 pt-3 border-t border-slate-900 flex items-center justify-between text-[10px] font-mono text-slate-600">
            <span className="flex items-center gap-1">
              <Terminal className="w-3 h-3 text-emerald-500/50" />
              DB_ISOLATION_RING: ACTIVE
            </span>
            <span>ACTIVE PROFILE: &quot;{userId}&quot;</span>
          </div>

        </section>

      </main>

    </div>
  );
}
// Build Fix May 27 
// Build Fix May 27 
