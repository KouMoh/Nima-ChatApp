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
  getDocs,
  where
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
  Maximize2,
  SquarePen
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
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'home' | 'text'>('home');
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const [chatSessions, setChatSessions] = useState<any[]>([]);
  
  const { start: startLive, stop: stopLive, isActive: isLiveActive, aiTranscription } = useGeminiLive();

  // Load chat sessions
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(query(
      collection(db, 'chats'), 
      where('participants', 'array-contains', user.uid)
    ), (snapshot) => {
      // Generate sessions
      const sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      sessions.sort((a: any, b: any) => {
        const tA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
        const tB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
        return tB - tA;
      });
      setChatSessions(sessions);
    }, (error) => {
      console.error("Chat list error:", error);
    });
    return unsub;
  }, [user]);

  // Initialization: Ensure user profile and PRIVATE chat exist
  useEffect(() => {
    if (!user) return;

    const initialize = async () => {
      try {
        const privateChatId = `ai_${user.uid}`;
        setActiveChat(privateChatId);

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

        // 2. Ensure private chat exists (we'll just use the first one from history or create a new one dynamically, but keep legacy AI chat)
        const chatDocRef = doc(db, 'chats', privateChatId);
        const chatDoc = await getDoc(chatDocRef);
        if (!chatDoc.exists()) {
          await setDoc(chatDocRef, {
            id: privateChatId,
            participants: [user.uid],
            type: 'ai',
            updatedAt: serverTimestamp(),
            title: 'Welcome Chat',
            lastMessage: 'Welcome to your private NimmLy session!'
          });
        }
        
      } catch (err) {
        console.error("Initialization error:", err);
      }
    };

    initialize();
  }, [user]);

  // Load messages
  useEffect(() => {
    if (!activeChat) return;

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
    if (!inputText.trim() || !activeChat) return;

    const text = inputText;
    setInputText("");

    try {
      // Send to Firestore
      try {
        await addDoc(collection(db, 'chats', activeChat, 'messages'), {
          chatId: activeChat,
          senderId: user?.uid,
          content: text,
          type: 'text',
          createdAt: serverTimestamp()
        });
      } catch (err) {
        console.error("User message add failed", err);
        throw err;
      }

      // If it's a "New Chat", generate a title from the first message
      const currentSession = chatSessions.find(c => c.id === activeChat);
      let newTitle = currentSession?.title;
      if (!newTitle || newTitle === 'New Chat' || newTitle === 'Welcome Chat') {
        try {
          const titleResponse = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [{ role: 'user', parts: [{ text: `Generate a short, concise topic title (max 5 words) for a conversation that starts with this message. Return ONLY the title text, no quotes, no prefixes: "${text}"` }] }]
          });
          newTitle = titleResponse.text?.trim() || text.split(' ').slice(0, 4).join(' ') + '...';
          // Clean up quotes if Gemini included them
          newTitle = newTitle.replace(/^"|"$/g, '').trim();
        } catch (err) {
          console.error("Failed to generate title", err);
          newTitle = text.split(' ').slice(0, 4).join(' ') + (text.split(' ').length > 4 ? '...' : '');
        }
      }

      // Update chat metadata
      try {
        await setDoc(doc(db, 'chats', activeChat), {
          lastMessage: text,
          title: newTitle,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.error("Chat update failed", err);
        throw err;
      }

      // Gemini Response (if not using Live)
      if (!isLiveActive) {
        let aiResponse = "I'm sorry, I couldn't process that.";
        try {
          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [
              ...messages.slice(-10).map(m => ({
                role: m.senderId === 'ai' ? 'model' : 'user',
                parts: [{ text: m.content }]
              })),
              { role: 'user', parts: [{ text }] }
            ],
            config: {
              systemInstruction: "You are NimmLy, a cutting-edge assistant. Be concise, bold, and helpful."
            }
          });
          aiResponse = response.text || aiResponse;
        } catch (err) {
          console.error("AI response generation failed", err);
        }

        try {
          await addDoc(collection(db, 'chats', activeChat, 'messages'), {
            chatId: activeChat,
            senderId: 'ai',
            content: aiResponse,
            type: 'text',
            createdAt: serverTimestamp()
          });
        } catch (err) {
          console.error("AI message add failed", err);
          throw err;
        }

        try {
          await setDoc(doc(db, 'chats', activeChat), {
            lastMessage: aiResponse,
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (err) {
          console.error("Chat metadata update after AI failed", err);
          throw err;
        }
      }
    } catch (err) {
      console.error("Message error:", err);
    }
  };

  const toggleCall = () => {
    setActiveView('home');
    if (isLiveActive) {
      stopLive();
      setIsCallActive(false);
    } else {
      startLive("You are NimmLy, a cutting-edge assistant. Be concise, bold, and helpful.");
      setIsCallActive(true);
    }
  };

  const startNewChat = async () => {
    if (!user) return;
    const newChatId = doc(collection(db, 'chats')).id;
    await setDoc(doc(db, 'chats', newChatId), {
      id: newChatId,
      participants: [user.uid],
      type: 'ai',
      updatedAt: serverTimestamp(),
      title: 'New Chat'
    });
    setActiveChat(newChatId);
    setActiveView('text');
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  };

  return (
    <div className="flex h-screen bg-[#050505] text-white overflow-hidden font-sans">
      {/* Background Hero Text (Bold Typography) */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-0">
        <h1 className="text-[20vw] font-black text-white/[0.02] uppercase tracking-tighter leading-none select-none">
          {isLiveActive ? "Thinking" : "NimmLy"}
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
              <div className="flex items-center justify-between pb-4">
                <h1 className="text-2xl font-black tracking-[-1px] uppercase font-['Space_Grotesk'] text-[#3b82f6]">NimmLy</h1>
                <button onClick={() => setIsSidebarOpen(false)} className="text-zinc-500 p-2 hover:bg-zinc-800 rounded-lg">
                   <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center justify-between px-1 pb-4 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#18181b] flex items-center justify-center overflow-hidden border border-white/5 shrink-0">
                     {user?.photoURL ? <img src={user.photoURL} alt="p" className="w-full h-full object-cover" /> : <UserIcon className="w-5 h-5 text-zinc-500" />}
                  </div>
                  <div className="overflow-hidden">
                     <p className="text-xs font-bold truncate">{user?.displayName}</p>
                     <p className="text-[10px] text-zinc-500 font-medium">Pro Account</p>
                  </div>
                </div>
                <button onClick={logout} className="text-red-500/80 hover:text-red-500 p-2 rounded-lg transition-all" title="Sign Out">
                   <LogOut className="w-4 h-4" />
                </button>
              </div>

              <nav className="space-y-2">
                <button 
                  onClick={() => { setActiveView('home'); setIsVideoEnabled(true); if(window.innerWidth < 1024) setIsSidebarOpen(false); }}
                  className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition-all", activeView === 'home' && isVideoEnabled ? "bg-[#18181b] text-white" : "text-zinc-500 hover:text-white")}
                >
                  <VideoIcon className={cn("w-4 h-4", activeView === 'home' && isVideoEnabled ? "text-[#3b82f6]" : "")} />
                  <span>Video Chat</span>
                </button>
                <button 
                  onClick={() => { setActiveView('home'); setIsVideoEnabled(false); if(window.innerWidth < 1024) setIsSidebarOpen(false); }}
                  className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition-all", activeView === 'home' && !isVideoEnabled ? "bg-[#18181b] text-white" : "text-zinc-500 hover:text-white")}
                >
                  <Mic className={cn("w-4 h-4", activeView === 'home' && !isVideoEnabled ? "text-[#3b82f6]" : "")} />
                  <span>Voice Assistant</span>
                </button>
              </nav>

              <div className="pt-2 border-t border-zinc-800/50 mt-2">
                <button 
                  onClick={startNewChat}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-zinc-300 hover:text-white hover:bg-[#18181b] rounded-lg text-sm font-medium transition-all"
                >
                  <SquarePen className="w-4 h-4" />
                  <span>New chat</span>
                </button>
              </div>

              <div className="pt-4 flex-1 overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <h3 className="text-xs font-semibold text-white mb-2 px-3">Chats</h3>
                <div className="space-y-0.5">
                   {chatSessions.map(session => (
                     <button
                       key={session.id}
                       onClick={() => { setActiveChat(session.id); setActiveView('text'); if(window.innerWidth < 1024) setIsSidebarOpen(false); }}
                       className={cn("w-full text-left max-w-full overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2 rounded-lg text-[13px] transition-all font-medium text-[#e4e4e7] hover:bg-[#27272a]/50 hover:text-white", activeChat === session.id && activeView === 'text' && "bg-[#27272a]/80 text-white")}
                       title={session.title || 'Untitled Session'}
                     >
                       {session.title || 'Untitled Session'}
                     </button>
                   ))}
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative z-0 w-full">
        {/* Top Bar */}
        <header className="absolute top-0 w-full z-50 p-4 md:p-8 flex items-center justify-between gap-4 pointer-events-none">
           <div className="flex items-center gap-2 md:gap-4 overflow-hidden pointer-events-auto">
             {!isSidebarOpen && (
               <button onClick={() => setIsSidebarOpen(true)} className="p-2.5 bg-[#18181b] rounded-xl text-white shrink-0">
                 <Maximize2 className="w-5 h-5" />
               </button>
             )}
             <div className="call-status flex items-center gap-2 md:gap-3 bg-[#3b82f6]/10 border border-[#3b82f6]/20 px-3 md:px-4 py-1.5 md:py-2 rounded-full truncate">
               <div className={cn("w-2 h-2 rounded-full bg-[#3b82f6] shrink-0", isCallActive && "animate-pulse")} />
               <span className="text-[9px] md:text-[10px] font-bold text-[#3b82f6] uppercase tracking-widest whitespace-nowrap truncate">
                 {isLiveActive ? "Live Session" : "NimmLy Ready"}
               </span>
             </div>
           </div>

           <div className="flex items-center gap-2 pointer-events-auto">
              {activeView === 'text' && (
                <button 
                  onClick={() => setActiveView('home')}
                  className="flex items-center gap-2 px-3 md:px-4 h-10 md:h-12 bg-[#18181b] hover:bg-[#27272a] text-zinc-400 hover:text-white rounded-xl md:rounded-2xl transition-all text-[10px] md:text-xs font-bold uppercase tracking-wider mr-2 border border-[#27272a]"
                >
                  <X className="w-4 h-4 shrink-0" /> <span className="hidden sm:inline whitespace-nowrap">Close Chat</span>
                </button>
              )}
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
        <div className="flex-1 flex flex-col justify-center items-center px-6 md:px-8 text-center gap-4 md:gap-6 relative overflow-hidden w-full pt-20">
          <AnimatePresence mode="wait">
            {!isCallActive ? (
              activeView === 'home' ? (
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
                    I'm processing your current context. Start a live session or open text chat to begin.
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="chat"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 w-full flex flex-col pt-24 pb-20 md:pb-32 px-4 md:px-8"
                >
                  <div className="flex-1 w-full max-w-4xl mx-auto flex flex-col gap-4 overflow-hidden relative border border-zinc-800 rounded-2xl bg-[#0a0a0a]">
                    
                    {/* Top Half: AI Messages */}
                    <div className="flex-1 overflow-y-auto flex flex-col p-4 md:p-6 custom-scrollbar relative">
                      {messages.filter(m => m.senderId === 'ai').length === 0 ? (
                        <div className="text-zinc-500 text-center italic mt-auto mb-auto font-medium">AI responses will appear here.</div>
                      ) : (
                        <div className="flex flex-col gap-2 md:gap-3 mt-auto">
                          {messages.filter(m => m.senderId === 'ai').map((m) => (
                            <motion.div 
                              key={m.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="px-3 py-1 md:px-4 md:py-1 rounded-[12px] md:rounded-[14px] text-[14px] md:text-[15px] leading-tight max-w-[85%] md:max-w-[75%] shadow-sm text-left w-fit bg-[#18181b] border border-[#27272a] self-start text-zinc-300 rounded-tl-sm"
                            >
                              {m.content}
                            </motion.div>
                          ))}
                          <div ref={scrollRef} className="h-2 shrink-0" />
                        </div>
                      )}
                    </div>

                    <div className="w-full h-px bg-[#27272a] shrink-0" />

                    {/* Bottom Half: User Messages */}
                    <div className="flex-1 overflow-y-auto flex flex-col gap-2 md:gap-3 p-4 md:p-6 custom-scrollbar">
                      {messages.filter(m => m.senderId === user?.uid).length === 0 ? (
                        <div className="text-zinc-500 text-center italic mt-auto mb-auto font-medium">Your messages will appear here.</div>
                      ) : (
                        [...messages].filter(m => m.senderId === user?.uid).reverse().map((m) => (
                          <motion.div 
                            key={m.id}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="px-3 py-1 md:px-4 md:py-1 rounded-[12px] md:rounded-[14px] text-[14px] md:text-[15px] leading-tight max-w-[85%] md:max-w-[75%] shadow-sm text-left w-fit bg-[#3b82f6] text-white self-end font-medium rounded-br-sm"
                          >
                            {m.content}
                          </motion.div>
                        ))
                      )}
                    </div>
                  </div>
                </motion.div>
              )
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
                  <h2 className="text-2xl md:text-4xl font-black uppercase tracking-tight text-[#3b82f6]">NimmLy Live</h2>
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
        <AnimatePresence>
          {activeView === 'text' && !isCallActive && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-0 left-0 right-0 p-4 md:p-8 z-20 bg-gradient-to-t from-[#050505] via-[#050505] to-transparent pt-12"
            >
               <form 
                 onSubmit={handleSendMessage}
                 className="max-w-3xl mx-auto flex items-center gap-2 md:gap-4 bg-[#18181b] border border-[#27272a] p-2 md:p-3 pl-4 md:pl-6 rounded-2xl md:rounded-[2rem] shadow-[0_20px_40px_rgba(0,0,0,0.8)] focus-within:border-[#3b82f6] transition-all"
               >
                  <div className="text-[#3b82f6] opacity-50 shrink-0">✨</div>
                  <input 
                    type="text" 
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Ask anything..." 
                    className="flex-1 bg-transparent border-none text-sm outline-none text-white placeholder-zinc-600 font-medium min-w-0"
                  />
                  <button 
                    type="submit"
                    disabled={!inputText.trim()}
                    className="px-6 md:px-8 py-2 md:py-3 bg-white text-black rounded-lg md:rounded-xl font-bold text-[10px] md:text-xs tracking-wider md:tracking-widest hover:bg-[#3b82f6] hover:text-white transition-all disabled:opacity-20 shrink-0"
                  >
                    Send
                  </button>
               </form>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

    </div>
  );
}
