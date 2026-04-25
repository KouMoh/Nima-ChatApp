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
        const genAI = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
        const chat = genAI.startChat({
          history: messages.slice(-10).map(m => ({
            role: m.senderId === 'ai' ? 'model' : 'user',
            parts: [{ text: m.content }]
          }))
        });
        
        const result = await chat.sendMessage(text);
        const aiResponse = result.response.text();

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
      <motion.aside
        initial={false}
        animate={{ width: isSidebarOpen ? 280 : 0, opacity: isSidebarOpen ? 1 : 0 }}
        className="relative border-r border-[#27272a] flex flex-col overflow-hidden bg-[#050505] z-10"
      >
        <div className="p-6 flex flex-col gap-8 flex-1">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-black tracking-[-1px] uppercase font-['Space_Grotesk'] text-[#3b82f6]">Nexus AI</h1>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-zinc-500">
               <ChevronLeft className="w-5 h-5" />
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
                <div className="w-10 h-10 rounded-xl bg-[#18181b] flex items-center justify-center overflow-hidden border border-white/5">
                   {user?.photoURL ? <img src={user.photoURL} alt="p" /> : <UserIcon className="w-5 h-5 text-zinc-500" />}
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

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative z-10">
        {/* Top Bar */}
        <header className="p-8 pb-4 flex items-center justify-between">
           <div className="flex items-center gap-4">
             {!isSidebarOpen && (
               <button onClick={() => setIsSidebarOpen(true)} className="p-2 bg-[#18181b] rounded-xl text-white">
                 <Maximize2 className="w-5 h-5" />
               </button>
             )}
             <div className="call-status flex items-center gap-3 bg-[#3b82f6]/10 border border-[#3b82f6]/20 px-4 py-2 rounded-full">
               <div className={cn("w-2 h-2 rounded-full bg-[#3b82f6]", isCallActive && "animate-pulse")} />
               <span className="text-[10px] font-bold text-[#3b82f6] uppercase tracking-widest whitespace-nowrap">
                 {isLiveActive ? "Live Session (1080p)" : "Awaiting User Input"}
               </span>
             </div>
           </div>

           <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsMuted(!isMuted)}
                className="w-12 h-12 bg-[#18181b] rounded-2xl flex items-center justify-center hover:bg-[#27272a] transition-all"
              >
                {isMuted ? <MicOff className="w-5 h-5 text-red-500" /> : <Mic className="w-5 h-5" />}
              </button>
              <button 
                onClick={() => setIsVideoEnabled(!isVideoEnabled)}
                className="w-12 h-12 bg-[#18181b] rounded-2xl flex items-center justify-center hover:bg-[#27272a] transition-all"
              >
                {isVideoEnabled ? <VideoIcon className="w-5 h-5 text-[#3b82f6]" /> : <VideoOff className="w-5 h-5 text-zinc-500" />}
              </button>
              <button 
                onClick={toggleCall}
                className={cn(
                  "px-6 h-12 rounded-2xl flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-all",
                  isLiveActive ? "bg-red-500 text-white" : "bg-white text-black hover:bg-zinc-200"
                )}
              >
                {isLiveActive ? "End Session" : "Start Live"}
              </button>
           </div>
        </header>

        {/* Dynamic Viewport (Bold Typography Theme) */}
        <div className="flex-1 flex flex-col justify-center items-center px-8 text-center gap-6 relative">
          <AnimatePresence mode="wait">
            {!isCallActive ? (
              <motion.div 
                key="idle"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <h1 className="text-[84px] font-black leading-[0.9] tracking-[-4px] max-w-2xl uppercase">
                  Ready to assist, {user?.displayName?.split(' ')[0]}.
                </h1>
                <p className="text-zinc-500 text-xl font-medium max-w-lg mx-auto">
                  I'm processing your current context. Start a live session or type below to begin.
                </p>
              </motion.div>
            ) : (
              <motion.div 
                key="active"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-12"
              >
                <div className="relative group">
                   <motion.div 
                     animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
                     transition={{ repeat: Infinity, duration: 2 }}
                     className="absolute inset-0 bg-[#3b82f6]/20 rounded-full blur-[80px]"
                   />
                   <div className="relative w-48 h-48 rounded-full border-4 border-[#3b82f6] flex items-center justify-center bg-[#050505]">
                      <Sparkles className="w-20 h-20 text-[#3b82f6]" />
                   </div>
                </div>
                <div className="space-y-4">
                  <h2 className="text-4xl font-black uppercase tracking-tight text-[#3b82f6]">Nexus Live</h2>
                  <p className="text-xl font-serif italic text-zinc-300 max-w-md mx-auto">
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
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="absolute bottom-[160px] right-12 w-72 aspect-video bg-black rounded-3xl overflow-hidden border border-[#3f3f46] shadow-[0_32px_64px_rgba(0,0,0,0.8)] z-20 group"
            >
               <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
               <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#3b82f6]">Local Stream</span>
               </div>
               <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Area */}
        <div className="p-12 pt-0 z-20">
           <form 
             onSubmit={handleSendMessage}
             className="max-w-3xl mx-auto flex items-center gap-4 bg-[#18181b] border border-[#27272a] p-4 pl-8 rounded-[2rem] shadow-[0_20px_40px_rgba(0,0,0,0.4)] focus-within:border-[#3b82f6] transition-all"
           >
              <div className="text-[#3b82f6] opacity-50">✨</div>
              <input 
                type="text" 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask anything or speak naturally..." 
                className="flex-1 bg-transparent border-none text-base outline-none text-white placeholder-zinc-600 font-medium"
              />
              <button 
                type="submit"
                disabled={!inputText.trim()}
                className="px-8 py-3 bg-white text-black rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-[#3b82f6] hover:text-white transition-all disabled:opacity-20"
              >
                Send
              </button>
           </form>
        </div>
      </main>

      {/* Chat History Modal / Overlay (Optional) */}
      <AnimatePresence>
        {messages.length > 0 && !isCallActive && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="fixed top-32 right-12 bottom-48 w-80 flex flex-col gap-4 pointer-events-none z-10"
          >
             <div className="flex-1 overflow-y-auto space-y-4 px-4 mask-fade-top pointer-events-auto">
               {messages.slice(-5).map((m) => (
                 <motion.div 
                   key={m.id}
                   initial={{ opacity: 0, x: 10 }}
                   animate={{ opacity: 1, x: 0 }}
                   className={cn(
                     "p-4 rounded-2xl text-[13px] leading-relaxed",
                     m.senderId === user?.uid 
                       ? "bg-[#3b82f6] text-white ml-8 font-medium" 
                       : "bg-[#18181b] border border-[#27272a] mr-8 text-zinc-300"
                   )}
                 >
                   {m.content}
                 </motion.div>
               ))}
               <div ref={scrollRef} />
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
