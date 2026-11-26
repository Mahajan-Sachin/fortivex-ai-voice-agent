import { useEffect, useRef, useState } from "react";
import {
  Bot,
  CalendarCheck,
  Database,
  Globe,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Radio,
  Send,
  Sparkles,
  User,
  Volume2,
  VolumeX,
} from "lucide-react";

const SCORE_COLORS = {
  Hot: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  Warm: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  Cold: "bg-slate-500/15 text-slate-300 border-slate-500/40",
  New: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40",
};

const SENTIMENT_COLORS = {
  Positive: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  Neutral: "bg-slate-500/15 text-slate-300 border-slate-500/40",
  Skeptical: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  Frustrated: "bg-rose-500/15 text-rose-300 border-rose-500/40",
};

const DEMO_PROMPTS = [
  {
    label: "EdTech Collision",
    lang: "en",
    text: "Hi, I'm Rohan from EduPulse. We are launching an EdTech startup and need AI course content, a sales CRM, and student attendance tracking.",
  },
  {
    label: "Price Skepticism",
    lang: "en",
    text: "Honestly, custom AI software sounds way too expensive for a small startup. Why shouldn't I just use free tools?",
  },
  {
    label: "Hindi Inquiry",
    lang: "hi",
    text: "Namaste, main apni sales team ke liye Fortivex CRM aur AI automation ke baare mein jaanna chahta hoon.",
  },
];

export default function App() {
  const [tab, setTab] = useState("call"); // "call" | "crm"
  const [session, setSession] = useState(null);
  const [windows, setWindows] = useState([]);
  const [health, setHealth] = useState(null);
  const [crmData, setCrmData] = useState(null);
  const [greetingAudio, setGreetingAudio] = useState("");

  const [input, setInput] = useState("");
  const [language, setLanguage] = useState("en");
  const [recording, setRecording] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [vadStatus, setVadStatus] = useState("idle"); // idle | listening | speaking_user | ai_speaking
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioRef = useRef(null);
  const chatEndRef = useRef(null);

  // Refs for Hands-Free VAD loop
  const handsFreeRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const loadingRef = useRef(false);
  const sessionIdRef = useRef(null);
  const vadCleanupRef = useRef(null);

  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    sessionIdRef.current = session?.session_id || null;
  }, [session?.session_id]);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
  };

  const playAudio = (b64) => {
    if (!b64) return;
    stopAudio();
    const audio = new Audio(`data:audio/mp3;base64,${b64}`);
    audioRef.current = audio;
    setIsSpeaking(true);
    setVadStatus("ai_speaking");
    audio.onended = () => {
      setIsSpeaking(false);
      if (handsFreeRef.current) setVadStatus("listening");
    };
    audio.onerror = () => setIsSpeaking(false);
    audio.play().catch(() => setIsSpeaking(false));
  };

  const startNewSession = async (retries = 8) => {
    setError("");
    stopAudio();
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const res = await fetch("/api/session", { method: "POST" });
        if (!res.ok) throw new Error("Backend starting...");
        const data = await res.json();
        setSession(data.session);
        setWindows(data.office_windows || []);
        setGreetingAudio(data.greeting_audio || "");
        setTab("call");
        fetch("/api/health").then((r) => r.ok && r.json()).then((h) => h && setHealth(h)).catch(() => {});
        return;
      } catch {
        if (attempt === retries - 1) {
          setError("Cannot reach backend on port 8000. Make sure the backend terminal is running.");
          return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  };

  const fetchCrm = async () => {
    const res = await fetch("/api/crm");
    if (res.ok) setCrmData(await res.json());
  };

  useEffect(() => {
    startNewSession();
    return () => {
      vadCleanupRef.current?.();
      stopAudio();
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages?.length, loading]);

  const sendVoiceBlob = async (blob) => {
    const form = new FormData();
    form.append("audio", blob, "recording.webm");
    if (sessionIdRef.current) form.append("session_id", sessionIdRef.current);

    setLoading(true);
    try {
      const res = await fetch("/api/voice-turn", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Voice turn failed");
      setSession(data.session);
      setWindows(data.office_windows || []);
      if (data.language) setLanguage(data.language);
      playAudio(data.audio_base64);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const sendTextTurn = async (textToSend, langOverride) => {
    const clean = textToSend.trim();
    if (!clean || loading) return;
    setError("");
    setLoading(true);
    setInput("");
    try {
      const res = await fetch("/api/text-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: session?.session_id,
          text: clean,
          language: langOverride || language,
          speak: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Request failed");
      setSession(data.session);
      setWindows(data.office_windows || []);
      playAudio(data.audio_base64);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Manual Push-to-Talk
  const toggleRecording = async () => {
    if (handsFree) toggleHandsFree();
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }
    setError("");
    stopAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await sendVoiceBlob(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError("Microphone access denied or unavailable. Use the text box below as fallback.");
    }
  };

  // Hands-Free VAD with Noise Gate (200ms onset), Pause Tolerance (1.35s), and AI-Speaking Shield
  const toggleHandsFree = async () => {
    if (handsFree) {
      vadCleanupRef.current?.();
      vadCleanupRef.current = null;
      setHandsFree(false);
      setVadStatus("idle");
      return;
    }

    setError("");
    if (greetingAudio && session?.messages?.length === 1) {
      playAudio(greetingAudio);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.fftSize);
      let activeRecorder = null;
      let localChunks = [];
      let speechStartMs = 0;
      let lastLoudMs = 0;
      let isUserSpeaking = false;

      const THRESHOLD = 0.028; // Filters steady background hum
      const ONSET_MS = 200; // Ignores brief coughs/clicks
      const PAUSE_TOLERANCE_MS = 1350; // Allows natural thinking pauses before sending

      setHandsFree(true);
      setVadStatus(isSpeakingRef.current ? "ai_speaking" : "listening");

      const interval = setInterval(() => {
        // Echo & Interruption Shield: pause VAD while AI is speaking or backend is processing
        if (isSpeakingRef.current || loadingRef.current) {
          speechStartMs = 0;
          return;
        }

        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const now = Date.now();

        if (rms > THRESHOLD) {
          lastLoudMs = now;
          if (!isUserSpeaking) {
            if (!speechStartMs) speechStartMs = now;
            if (now - speechStartMs >= ONSET_MS) {
              isUserSpeaking = true;
              setVadStatus("speaking_user");
              localChunks = [];
              activeRecorder = new MediaRecorder(stream);
              activeRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) localChunks.push(e.data);
              };
              activeRecorder.onstop = async () => {
                const blob = new Blob(localChunks, { type: "audio/webm" });
                if (blob.size >= 1500) {
                  await sendVoiceBlob(blob);
                }
              };
              activeRecorder.start();
            }
          }
        } else {
          speechStartMs = 0;
          if (isUserSpeaking && now - lastLoudMs >= PAUSE_TOLERANCE_MS) {
            isUserSpeaking = false;
            setVadStatus("listening");
            if (activeRecorder && activeRecorder.state !== "inactive") {
              activeRecorder.stop();
            }
          }
        }
      }, 60);

      vadCleanupRef.current = () => {
        clearInterval(interval);
        if (activeRecorder && activeRecorder.state !== "inactive") {
          activeRecorder.onstop = null;
          activeRecorder.stop();
        }
        stream.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => {});
      };
    } catch {
      setError("Microphone access denied or unavailable. Use the text box below as fallback.");
    }
  };

  const handleEndCall = async () => {
    if (!session?.session_id) return;
    if (handsFree) toggleHandsFree();
    stopAudio();
    setLoading(true);
    try {
      const res = await fetch("/api/end-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: session.session_id }),
      });
      const data = await res.json();
      setSession(data.session);
      setCrmData(data.crm);
    } finally {
      setLoading(false);
    }
  };

  const lead = session?.lead_info || {};
  const numericScore = session?.lead_score_numeric ?? 15;

  return (
    <div className="min-h-screen bg-[#060a16] text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-[#090f20]/90 backdrop-blur px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-white">
              Fortivex AI <span className="text-cyan-400 font-normal">Voice Concierge</span>
            </h1>
            <p className="text-xs text-slate-400">
              Autonomous Sales, Multi-Product Routing &amp; CRM Sync
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {health && (
            <span className="hidden md:inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-slate-300">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              {health.groq_pool.models.llm_primary} • {health.groq_pool.total_keys}-Key Failover
            </span>
          )}

          <div className="flex rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-xs">
            <button
              onClick={() => setTab("call")}
              className={`px-3 py-1.5 rounded-md transition ${
                tab === "call" ? "bg-cyan-500/20 text-cyan-300 font-medium" : "text-slate-400 hover:text-white"
              }`}
            >
              Live Call
            </button>
            <button
              onClick={() => {
                setTab("crm");
                fetchCrm();
              }}
              className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                tab === "crm" ? "bg-cyan-500/20 text-cyan-300 font-medium" : "text-slate-400 hover:text-white"
              }`}
            >
              <Database className="w-3.5 h-3.5" /> Fortivex CRM
            </button>
          </div>

          <button
            onClick={startNewSession}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 transition"
          >
            <PhoneCall className="w-3.5 h-3.5 text-emerald-400" /> New Call
          </button>
          <button
            onClick={handleEndCall}
            disabled={!session || session.status === "Completed" || loading}
            className="text-xs px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 disabled:opacity-40 flex items-center gap-1.5 transition"
          >
            <PhoneOff className="w-3.5 h-3.5" /> End Call
          </button>
        </div>
      </header>

      {/* Main Content */}
      {tab === "call" ? (
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Voice & Transcript */}
          <section className="lg:col-span-7 bg-[#0b1224] border border-slate-800/80 rounded-2xl flex flex-col h-[calc(100vh-120px)] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800/80 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    session?.status === "Completed" ? "bg-slate-500" : "bg-emerald-400 animate-pulse"
                  }`}
                />
                <span>Session #{session?.session_id || "..."}</span>
                <span className="text-xs text-slate-400">({session?.status || "Active"})</span>
                {handsFree && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                    {vadStatus === "speaking_user"
                      ? "Listening to you..."
                      : vadStatus === "ai_speaking"
                      ? "Aria speaking (mic shielded)"
                      : "Hands-Free Ready"}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                {greetingAudio && (
                  <button
                    onClick={() => (isSpeaking ? stopAudio() : playAudio(greetingAudio))}
                    className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 flex items-center gap-1"
                    title="Play or stop Aria's audio"
                  >
                    {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    {isSpeaking ? "Stop Audio" : "Play Greeting"}
                  </button>
                )}
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-slate-200"
                >
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="ar">Arabic</option>
                </select>
              </div>
            </div>

            {/* Transcript */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {session?.messages?.map((m, i) => (
                <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  {m.role === "assistant" && (
                    <div className="h-8 w-8 rounded-full bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 text-cyan-300" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-blue-600/25 border border-blue-500/30 text-slate-100"
                        : "bg-slate-900/90 border border-slate-800 text-slate-200"
                    }`}
                  >
                    {m.content}
                  </div>
                  {m.role === "user" && (
                    <div className="h-8 w-8 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-blue-300" />
                    </div>
                  )}
                </div>
              ))}

              {session?.messages?.length === 1 && (
                <div className="pt-2 flex flex-wrap gap-2">
                  {DEMO_PROMPTS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => {
                        setLanguage(p.lang);
                        sendTextTurn(p.text, p.lang);
                      }}
                      className="text-xs px-3 py-1.5 rounded-full bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 transition"
                    >
                      + {p.label}
                    </button>
                  ))}
                </div>
              )}

              {loading && (
                <div className="flex items-center gap-2 text-xs text-cyan-400">
                  <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
                  Processing voice / LangGraph RAG...
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {error && (
              <div className="mx-5 mb-2 px-3 py-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300">
                {error}
              </div>
            )}

            {/* Controls */}
            <div className="p-4 border-t border-slate-800/80 bg-[#080e1d] flex items-center gap-2.5">
              <button
                onClick={toggleHandsFree}
                disabled={session?.status === "Completed"}
                className={`h-11 px-3.5 rounded-xl font-medium text-xs flex items-center gap-1.5 transition shrink-0 border ${
                  handsFree
                    ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                    : "bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300"
                } disabled:opacity-40`}
                title="Auto-detect speech &amp; 1.35s thinking pauses, shielded while Aria speaks"
              >
                <Radio className={`w-4 h-4 ${handsFree ? "animate-pulse" : ""}`} />
                {handsFree ? "Hands-Free On" : "Hands-Free"}
              </button>

              <button
                onClick={toggleRecording}
                disabled={loading || session?.status === "Completed"}
                className={`h-11 px-3.5 rounded-xl font-medium text-xs flex items-center gap-1.5 transition shrink-0 ${
                  recording
                    ? "bg-rose-500 text-white animate-pulse shadow-lg shadow-rose-500/30"
                    : "bg-cyan-500 hover:bg-cyan-400 text-slate-950"
                } disabled:opacity-40`}
              >
                {recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                {recording ? "Stop" : "Speak"}
              </button>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendTextTurn(input);
                }}
                className="flex-1 flex items-center gap-2"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={loading || session?.status === "Completed"}
                  placeholder="Or type a message (backup for noisy rooms)..."
                  className="flex-1 bg-slate-900 border border-slate-800 focus:border-cyan-500/60 outline-none rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading || session?.status === "Completed"}
                  className="h-11 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 transition"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </section>

          {/* Right: Live CRM & Insights */}
          <aside className="lg:col-span-5 space-y-4 overflow-y-auto h-[calc(100vh-120px)] pr-1">
            {/* Qualification & Sentiment */}
            <div className="bg-[#0b1224] border border-slate-800/80 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Live Lead Qualification &amp; Sentiment
                </h3>
                <div className="flex gap-2">
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                      SCORE_COLORS[session?.lead_score || "New"]
                    }`}
                  >
                    {session?.lead_score || "New"} ({numericScore}/100)
                  </span>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                      SENTIMENT_COLORS[session?.sentiment || "Neutral"]
                    }`}
                  >
                    {session?.sentiment || "Neutral"}
                  </span>
                </div>
              </div>

              <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-500"
                  style={{ width: `${numericScore}%` }}
                />
              </div>

              <div className="grid grid-cols-1 gap-1.5 text-[11px] bg-slate-900/70 border border-slate-800/80 rounded-xl p-2.5">
                <div>
                  <span className="text-slate-400">Score Rationale: </span>
                  <span className="text-slate-200">{session?.qualification_reason}</span>
                </div>
                <div>
                  <span className="text-slate-400">Sentiment Cue: </span>
                  <span className="text-slate-200">{session?.sentiment_reason}</span>
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-400 mb-1.5">Recommended Fortivex Solution(s)</div>
                <div className="flex flex-wrap gap-1.5">
                  {lead.recommended_products?.length ? (
                    lead.recommended_products.map((prod) => (
                      <span
                        key={prod}
                        className="text-xs px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-200"
                      >
                        {prod}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">Awaiting discovery...</span>
                  )}
                </div>
              </div>
            </div>

            {/* Extracted CRM Fields */}
            <div className="bg-[#0b1224] border border-slate-800/80 rounded-2xl p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Extracted CRM Record
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  ["Name", lead.name],
                  ["Company", lead.company],
                  ["Email", lead.email],
                  ["Segment", lead.customer_type],
                  ["Budget / Scale", lead.budget],
                  ["Timeline", lead.timeline],
                ].map(([label, val]) => (
                  <div key={label} className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-2.5">
                    <div className="text-slate-500">{label}</div>
                    <div className="text-slate-200 font-medium mt-0.5 truncate">{val || "—"}</div>
                  </div>
                ))}
              </div>
              {lead.need && (
                <div className="mt-3 bg-slate-900/70 border border-slate-800/80 rounded-xl p-2.5 text-xs">
                  <div className="text-slate-500">Identified Need</div>
                  <div className="text-slate-200 mt-0.5">{lead.need}</div>
                </div>
              )}
            </div>

            {/* Appointment Booking */}
            <div className="bg-[#0b1224] border border-slate-800/80 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2.5">
                <CalendarCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Appointment Scheduling
                </h3>
              </div>
              {session?.booked_slot ? (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-200">
                  <div className="font-semibold">{session.booking_type} Confirmed</div>
                  <div className="mt-0.5">{session.booked_slot}</div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs text-slate-400">Pick any time inside our hub windows or request 24/7 email follow-up:</div>
                  <div className="space-y-1">
                    {windows.map((w) => (
                      <div key={w} className="text-[11px] px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-300">
                        {w}
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <button
                      onClick={() => sendTextTurn("Please book Tomorrow at 3:00 PM IST for a demo.")}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 transition"
                    >
                      Book Tomorrow 3 PM IST
                    </button>
                    <button
                      onClick={() => sendTextTurn("I prefer online-only 24/7 email follow-up instead of a call.")}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition"
                    >
                      24/7 Email Follow-up
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Call Summary & Insights */}
            <div className="bg-[#0b1224] border border-slate-800/80 rounded-2xl p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Call Summary &amp; Business Insights
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">{session?.call_summary}</p>
              {session?.business_insights?.length > 0 && (
                <ul className="space-y-1.5 text-xs text-cyan-200/90 list-disc list-inside">
                  {session.business_insights.map((ins, idx) => (
                    <li key={idx}>{ins}</li>
                  ))}
                </ul>
              )}
              {session?.objections?.length > 0 && (
                <div className="pt-1">
                  <div className="text-[11px] text-orange-300 font-medium mb-1">Objections Noted:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {session.objections.map((o, idx) => (
                      <span
                        key={idx}
                        className="text-[11px] px-2 py-0.5 rounded bg-orange-500/15 border border-orange-500/30 text-orange-200"
                      >
                        {o}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </main>
      ) : (
        /* CRM Pipeline Tab */
        <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              ["Total Calls", crmData?.metrics?.total_calls ?? 0],
              ["Hot Leads", crmData?.metrics?.hot_leads ?? 0],
              ["Warm Leads", crmData?.metrics?.warm_leads ?? 0],
              ["Booked Demos", crmData?.metrics?.booked_appointments ?? 0],
            ].map(([label, val]) => (
              <div key={label} className="bg-[#0b1224] border border-slate-800 rounded-2xl p-4">
                <div className="text-xs text-slate-400">{label}</div>
                <div className="text-2xl font-semibold text-white mt-1">{val}</div>
              </div>
            ))}
          </div>

          <div className="bg-[#0b1224] border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 text-sm font-medium">
              Fortivex CRM — Lead &amp; Call Log
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 text-slate-400">
                  <tr>
                    <th className="p-3.5">Lead / Company</th>
                    <th className="p-3.5">Recommended</th>
                    <th className="p-3.5">Score</th>
                    <th className="p-3.5">Sentiment</th>
                    <th className="p-3.5">Booked Slot</th>
                    <th className="p-3.5">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {crmData?.leads?.map((l) => (
                    <tr key={l.session_id} className="hover:bg-slate-900/40">
                      <td className="p-3.5">
                        <div className="font-medium text-white">
                          {l.lead_info?.name || "Unnamed"} {l.lead_info?.company ? `(${l.lead_info.company})` : ""}
                        </div>
                        <div className="text-slate-400">{l.lead_info?.email || l.session_id}</div>
                      </td>
                      <td className="p-3.5">
                        {l.lead_info?.recommended_products?.join(", ") || "—"}
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded-full border ${SCORE_COLORS[l.lead_score]}`}>
                          {l.lead_score} ({l.lead_score_numeric ?? 15})
                        </span>
                      </td>
                      <td className="p-3.5">{l.sentiment}</td>
                      <td className="p-3.5 text-emerald-300">{l.booked_slot || "—"}</td>
                      <td className="p-3.5 text-slate-300 max-w-xs">{l.call_summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
