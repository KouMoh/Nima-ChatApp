import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../lib/firebase';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
  getDocs
} from 'firebase/firestore';
import { useAuth } from '../components/Auth';
import { useGeminiLive } from '../hooks/useGeminiLive';
import { 
  MessageSquare, 
  Mic, 
  MicOff, 
  Video as VideoIcon, 
  VideoOff, 
  Send, 
  Search, 
  Settings,
  MoreVertical,
  ChevronLeft,
  X,
  Sparkles,
  User as UserIcon,
  LogOut,
  Phone,
  PhoneOff,
  Maximize2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { ai } from '../lib/gemini';

// Message Interface
interface Message {
  id: string;
  senderId: string;
  content: string;
  type: 'text' | 'audio' | 'video';
  createdAt: any;
}

export default function ChatRoom() {
  const { user, logout } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeChat, setActiveChat] = useState("default");
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const { start: startLive, stop: stopLive, isActive: isLiveActive, aiTranscription } = useGeminiLive();

  // Initialization: Ensure user profile and default chat exist
  useEffect(() => {
    if (!user) return;

    const initialize = async () => {
      try {
        // 1. Ensure user profile exists
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        if (!userDoc.exists()) {
          await setDoc(userDocRef, {
            uid: user.uid,
            displayName: user.displayName || 'Anonymous',
            email: user.email,
            photoURL: user.photoURL,
            status: 'online',
            lastSeen: serverTimestamp()
          });
        }

        // 2. Ensure default chat exists
        const chatDocRef = doc(db, 'chats', 'default');
        const chatDoc = await getDoc(chatDocRef);
        if (!chatDoc.exists()) {
          await setDoc(chatDocRef, {
            id: 'default',
            participants: [user.uid],
            type: 'ai',
            updatedAt: serverTimestamp(),
            lastMessage: 'Welcome to Nova!'
          });
        } else {
          // Add user to participants if not already there
          const data = chatDoc.data();
          if (data && !data.participants.includes(user.uid)) {
             await setDoc(chatDocRef, {
               ...data,
               participants: [...data.participants, user.uid]
             }, { merge: true });
          }
        }
      } catch (err) {
        console.error("Initialization error:", err);
      }
    };

    initialize();
  }, [user]);

  // Load messages
  useEffect(() => {
    const q = query(
      collection(db, 'chats', activeChat, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Message[];
      setMessages(msgs);
    }, (error) => {
      console.error("Firestore Error:", error);
    });

    return unsubscribe;
  }, [activeChat]);

  // Scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Video handle
  useEffect(() => {
    if (isVideoEnabled && videoRef.current) {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          if (videoRef.current) videoRef.current.srcObject = stream;
        })
        .catch(err => console.error("Camera error:", err));
    }
  }, [isVideoEnabled]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim()) return;

    const text = inputText;
    setInputText("");

    try {
      // Send to Firestore
      await addDoc(collection(db, 'chats', activeChat, 'messages'), {
        chatId: activeChat,
        senderId: user?.uid,
        content: text,
        type: 'text',
        createdAt: serverTimestamp()
      });

      // Update chat metadata
      await setDoc(doc(db, 'chats', activeChat), {
        lastMessage: text,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Gemini Response (if not using Live)
      if (!isLiveActive) {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [
            ...messages.slice(-10).map(m => ({
              role: m.senderId === 'ai' ? 'model' : 'user',
              parts: [{ text: m.content }]
            })),
            { role: 'user', parts: [{ text: text }] }
          ],
          config: {
            systemInstruction: "You are Nexus AI, a cutting-edge assistant. Be concise, bold, and helpful."
          }
        });
        
        const aiResponse = response.text || "I'm sorry, I couldn't process that.";

        await addDoc(collection(db, 'chats', activeChat, 'messages'), {
          chatId: activeChat,
          senderId: 'ai',
          content: aiResponse,
          type: 'text',
          createdAt: serverTimestamp()
        });

        await setDoc(doc(db, 'chats', activeChat), {
          lastMessage: aiResponse,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
    } catch (err) {
      console.error("Message error:", err);
    }
  };

  const toggleCall = () => {
    if (isLiveActive) {
      stopLive();
      setIsCallActive(false);
    } else {
      startLive("You are Nexus AI, a cutting-edge assistant. Be concise, bold, and helpful.");
      setIsCallActive(true);
    }
  };

  return (
    <div className="flex h-screen bg-[#050505] text-white overflow-hidden font-sans">
      {/* Background Hero Text (Bold Typography) */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-0">
        <h1 className="text-[20vw] font-black text-white/[0.02] uppercase tracking-tighter leading-none select-none">
          {isLiveActive ? "Thinking" : "Processing"}
        </h1>
      </div>

      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {(isSidebarOpen || window.innerWidth >= 1024) && (
          <motion.aside
            initial={{ x: -280, opacity: 0 }}
            animate={{ x: 0, opacity: 1, width: isSidebarOpen ? 280 : 0 }}
            exit={{ x: -280, opacity: 0 }}
            className={cn(
              "fixed inset-y-0 left-0 lg:relative border-r border-[#27272a] flex flex-col overflow-hidden bg-[#050505] z-50 transition-all duration-300",
              !isSidebarOpen && "lg:w-0 lg:border-none"
            )}
          >
            <div className="p-6 flex flex-col gap-8 h-full">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-black tracking-[-1px] uppercase font-['Space_Grotesk'] text-[#3b82f6]">Nexus AI</h1>
                <button onClick={() => setIsSidebarOpen(false)} className="text-zinc-500 p-2 hover:bg-zinc-800 rounded-lg">
                   <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="space-y-2">
                <button className="w-full flex items-center gap-3 px-3 py-2 bg-[#18181b] rounded-lg text-sm font-semibold transition-all">
                  <VideoIcon className="w-4 h-4 text-[#3b82f6]" />
                  <span>Video Chat</span>
                </button>
                <button className="w-full flex items-center gap-3 px-3 py-2 text-zinc-500 hover:text-white rounded-lg text-sm font-semibold transition-all">
                  <Mic className="w-4 h-4" />
                  <span>Voice Assistant</span>
                </button>
                <button className="w-full flex items-center gap-3 px-3 py-2 text-zinc-500 hover:text-white rounded-lg text-sm font-semibold transition-all">
                  <Sparkles className="w-4 h-4" />
                  <span>A.I. Playground</span>
                </button>
              </nav>

              <div className="mt-auto pt-6 border-t border-zinc-800 space-y-4">
                 <div className="flex items-center gap-3 px-1">
                    <div className="w-10 h-10 rounded-xl bg-[#18181b] flex items-center justify-center overflow-hidden border border-white/5 shrink-0">
                       {user?.photoURL ? <img src={user.photoURL} alt="p" className="w-full h-full object-cover" /> : <UserIcon className="w-5 h-5 text-zinc-500" />}
                    </div>
                    <div className="overflow-hidden">
                       <p className="text-xs font-bold truncate">{user?.displayName}</p>
                       <p className="text-[10px] text-zinc-500 font-medium">Pro Account</p>
                    </div>
                 </div>
                 <button onClick={logout} className="w-full flex items-center gap-3 px-3 py-2 text-red-500/80 hover:text-red-500 rounded-lg text-sm font-bold transition-all">
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                 </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative z-10 w-full">
        {/* Top Bar */}
        <header className="p-4 md:p-8 md:pb-4 flex items-center justify-between gap-4">
           <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
             {!isSidebarOpen && (
               <button onClick={() => setIsSidebarOpen(true)} className="p-2.5 bg-[#18181b] rounded-xl text-white shrink-0">
                 <Maximize2 className="w-5 h-5" />
               </button>
             )}
             <div className="call-status flex items-center gap-2 md:gap-3 bg-[#3b82f6]/10 border border-[#3b82f6]/20 px-3 md:px-4 py-1.5 md:py-2 rounded-full truncate">
               <div className={cn("w-2 h-2 rounded-full bg-[#3b82f6] shrink-0", isCallActive && "animate-pulse")} />
               <span className="text-[9px] md:text-[10px] font-bold text-[#3b82f6] uppercase tracking-widest whitespace-nowrap truncate">
                 {isLiveActive ? "Live Session" : "Nexus Ready"}
               </span>
             </div>
           </div>

           <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsMuted(!isMuted)}
                className="w-10 h-10 md:w-12 md:h-12 bg-[#18181b] rounded-xl md:rounded-2xl flex items-center justify-center hover:bg-[#27272a] transition-all"
              >
                {isMuted ? <MicOff className="w-4 h-4 md:w-5 md:h-5 text-red-500" /> : <Mic className="w-4 h-4 md:w-5 md:h-5" />}
              </button>
              <button 
                onClick={() => setIsVideoEnabled(!isVideoEnabled)}
                className="w-10 h-10 md:w-12 md:h-12 bg-[#18181b] rounded-xl md:rounded-2xl flex items-center justify-center hover:bg-[#27272a] transition-all"
              >
                {isVideoEnabled ? <VideoIcon className="w-4 h-4 md:w-5 md:h-5 text-[#3b82f6]" /> : <VideoOff className="w-4 h-4 md:w-5 md:h-5 text-zinc-500" />}
              </button>
              <button 
                onClick={toggleCall}
                className={cn(
                  "px-4 md:px-6 h-10 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all",
                  isLiveActive ? "bg-red-500 text-white" : "bg-white text-black hover:bg-zinc-200"
                )}
              >
                <span className="hidden sm:inline">{isLiveActive ? "End Session" : "Start Live"}</span>
                <span className="sm:hidden">{isLiveActive ? <PhoneOff className="w-4 h-4" /> : <Phone className="w-4 h-4" />}</span>
              </button>
           </div>
        </header>

        {/* Dynamic Viewport (Bold Typography Theme) */}
        <div className="flex-1 flex flex-col justify-center items-center px-6 md:px-8 text-center gap-4 md:gap-6 relative">
          <AnimatePresence mode="wait">
            {!isCallActive ? (
              <motion.div 
                key="idle"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4 md:space-y-6"
              >
                <h1 className="text-4xl sm:text-6xl md:text-[84px] font-black leading-tight sm:leading-[0.9] tracking-tight sm:tracking-[-4px] max-w-2xl uppercase">
                  Ready to assist, {user?.displayName?.split(' ')[0]}.
                </h1>
                <p className="text-zinc-500 text-base md:text-xl font-medium max-w-lg mx-auto">
                  I'm processing your current context. Start a live session or type below to begin.
                </p>
              </motion.div>
            ) : (
              <motion.div 
                key="active"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-8 md:space-y-12"
              >
                <div className="relative group">
                   <motion.div 
                     animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
                     transition={{ repeat: Infinity, duration: 2 }}
                     className="absolute inset-0 bg-[#3b82f6]/20 rounded-full blur-[40px] md:blur-[80px]"
                   />
                   <div className="relative w-32 h-32 md:w-48 md:h-48 rounded-full border-2 md:border-4 border-[#3b82f6] flex items-center justify-center bg-[#050505]">
                      <Sparkles className="w-12 h-12 md:w-20 md:h-20 text-[#3b82f6]" />
                   </div>
                </div>
                <div className="space-y-3 md:space-y-4">
                  <h2 className="text-2xl md:text-4xl font-black uppercase tracking-tight text-[#3b82f6]">Nexus Live</h2>
                  <p className="text-lg md:text-xl font-serif italic text-zinc-300 max-w-sm md:max-w-md mx-auto px-4">
                    {aiTranscription ? `"${aiTranscription}"` : "Waiting for voice input..."}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Video Overlay (Floating) */}
        <AnimatePresence>
          {isVideoEnabled && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-24 right-4 md:bottom-[160px] md:right-12 w-40 sm:w-56 md:w-72 aspect-video bg-black rounded-2xl md:rounded-3xl overflow-hidden border border-[#3f3f46] shadow-[0_32px_64px_rgba(0,0,0,0.8)] z-20 group"
            >
               <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
               <div className="absolute top-2 left-2 md:top-4 md:left-4 flex items-center gap-1.5 md:gap-2 bg-black/60 backdrop-blur-md px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl border border-white/10">
                  <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-[#3b82f6]">Local Stream</span>
               </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Area */}
        <div className="p-4 md:p-12 pt-0 z-20">
           <form 
             onSubmit={handleSendMessage}
             className="max-w-3xl mx-auto flex items-center gap-2 md:gap-4 bg-[#18181b] border border-[#27272a] p-2 md:p-4 pl-4 md:pl-8 rounded-2xl md:rounded-[2rem] shadow-[0_20px_40px_rgba(0,0,0,0.4)] focus-within:border-[#3b82f6] transition-all"
           >
              <div className="text-[#3b82f6] opacity-50 shrink-0">✨</div>
              <input 
                type="text" 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask anything..." 
                className="flex-1 bg-transparent border-none text-sm md:text-base outline-none text-white placeholder-zinc-600 font-medium min-w-0"
              />
              <button 
                type="submit"
                disabled={!inputText.trim()}
                className="px-4 md:px-8 py-2 md:py-3 bg-white text-black rounded-lg md:rounded-2xl font-black text-[9px] md:text-[10px] uppercase tracking-widest hover:bg-[#3b82f6] hover:text-white transition-all disabled:opacity-20 shrink-0"
              >
                Send
              </button>
           </form>
        </div>
      </main>

      {/* Chat History Overlay (Adaptive for mobile) */}
      <AnimatePresence>
        {messages.length > 0 && !isCallActive && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed top-24 right-4 bottom-24 left-4 lg:fixed lg:top-32 lg:right-12 lg:bottom-48 lg:left-auto lg:w-80 flex flex-col gap-4 pointer-events-none z-10"
          >
             <div className="flex-1 overflow-y-auto space-y-4 px-2 lg:px-4 mask-fade-top pointer-events-auto">
               <div className="h-full flex flex-col justify-end gap-3">
                 {messages.slice(-5).map((m) => (
                   <motion.div 
                     key={m.id}
                     initial={{ opacity: 0, x: 20 }}
                     animate={{ opacity: 1, x: 0 }}
                     className={cn(
                       "p-3 md:p-4 rounded-xl md:rounded-2xl text-[12px] md:text-[13px] leading-relaxed max-w-[85%]",
                       m.senderId === user?.uid 
                         ? "bg-[#3b82f6] text-white self-end font-medium" 
                         : "bg-[#18181b] border border-[#27272a] self-start text-zinc-300"
                     )}
                   >
                     {m.content}
                   </motion.div>
                 ))}
                 <div ref={scrollRef} />
               </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
