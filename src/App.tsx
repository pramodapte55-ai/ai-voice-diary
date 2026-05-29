import React, { useState, useRef, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function App() {
  const [userName, setUserName] = useState('Pramod');
  const [isRecording, setIsRecording] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Ready to record');
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Capture the native mobile browser installation prompt capability
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const triggerAppInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstallPrompt(null);
  };

  const startRecording = async () => {
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
        setStatusMessage('Processing audio transmission...');
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mp4' });
        
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.mp4');
        formData.append('name', userName);

        try {
          // Connected directly to your active live Render database endpoint
          const response = await fetch('https://ai-voice-diary.onrender.com/api/record', {
            method: 'POST',
            body: formData,
          });

          const data = await response.json();
          if (response.ok) {
            setStatusMessage('Voice memory saved and database pipeline ledger updated!');
            setApiResponse(data);
          } else {
            setStatusMessage(`Server error response: ${data.error || response.statusText}`);
          }
        } catch (error) {
          console.error(error);
          setStatusMessage('Network communication connection exception occurred.');
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setStatusMessage('Recording voice note matrix input...');
    } catch (err) {
      console.error('Microphone access denied:', err);
      setStatusMessage('Error: Could not access microphone hardware input.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  return (
    <div style={{ padding: '30px 20px', fontFamily: 'sans-serif', maxWidth: '500px', margin: '0 auto', background: '#ffffff', minHeight: '100vh' }}>
      <h2 style={{ color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 10px 0' }}>🎙️ AI Voice Diary Ledger</h2>
      
      {/* 3-Line Operational User Guidance Instructions */}
      <div style={{ background: '#fef9c3', border: '1px solid #fef08a', padding: '15px', borderRadius: '8px', fontSize: '14px', color: '#713f12', marginBottom: '20px', lineHeight: '1.5' }}>
        <div style={{ marginBottom: '6px' }}><strong>1.</strong> Enter your identification name context in the control parameter field block below.</div>
        <div style={{ marginBottom: '6px' }}><strong>2.</strong> Tap <strong>Start Recording</strong> and state your clinical log, system query, or data parameter entry.</div>
        <div><strong>3.</strong> Press <strong>Stop & Save Note</strong> to write changes directly to the cloud architecture matrix.</div>
      </div>

      {/* Dynamic Identity Parameter Context Block */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px', color: '#374151' }}>User Parameter Context Name:</label>
        <input 
          type="text" 
          value={userName} 
          onChange={(e) => setUserName(e.target.value)}
          style={{ width: '100%', padding: '12px', boxSizing: 'border-box', border: '2px solid #cbd5e1', borderRadius: '6px', fontSize: '16px', outline: 'none' }}
        />
      </div>

      {/* Direct Android Native App Installation Hook Button */}
      {installPrompt && (
        <button 
          onClick={triggerAppInstall}
          style={{ width: '100%', padding: '14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', marginBottom: '20px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
        >
          📲 Click to Install AI Voice Diary App Icon
        </button>
      )}
      
      {/* Dynamic Status Engine Monitor Box */}
      <div style={{ margin: '0 0 20px 0', padding: '15px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '15px' }}>
        <span style={{ fontWeight: 'bold', color: '#64748b' }}>System Status:</span> <span style={{ color: '#0f172a', fontWeight: 500 }}>{statusMessage}</span>
      </div>

      {/* Action Trigger Elements */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '25px' }}>
        <button 
          onClick={startRecording} 
          disabled={isRecording}
          style={{ flex: 1, padding: '14px', background: isRecording ? '#cbd5e1' : '#16a34a', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '16px', cursor: isRecording ? 'not-allowed' : 'pointer', transition: 'background 0.2s' }}
        >
          Start Recording
        </button>
        <button 
          onClick={stopRecording} 
          disabled={!isRecording}
          style={{ flex: 1, padding: '14px', background: !isRecording ? '#cbd5e1' : '#dc2626', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '16px', cursor: !isRecording ? 'not-allowed' : 'pointer', transition: 'background 0.2s' }}
        >
          Stop & Save Note
        </button>
      </div>

      {/* Synchronized Database Pipeline Engine Output Display Matrix */}
      {apiResponse && (
        <div style={{ padding: '15px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#1e40af' }}>Server Response Matrix:</h4>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, background: '#ffffff', padding: '12px', borderRadius: '6px', border: '1px solid #dbeafe', fontFamily: 'monospace', fontSize: '13px', color: '#1e293b' }}>
            {JSON.stringify(apiResponse, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default App;