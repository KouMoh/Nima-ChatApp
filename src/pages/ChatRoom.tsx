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
  Send, 
  Search, 
  Settings,
  MoreVertical,
  ChevronLeft,
  ChevronDown,
  X,
  Sparkles,
  User as UserIcon,
  LogOut,
  Phone,
  PhoneOff,
  Maximize2,
  SquarePen,
  Volume2,
  VolumeX
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { ai } from '../lib/gemini';
import { FindingsPanel } from '../components/FindingsPanel';

// Message Interface
interface Message {
  id: string;
  senderId: string;
  content: string;
  type: 'text' | 'audio' | 'video';
  createdAt: any;
}

interface ChatSession {
  id: string;
  title?: string;
  findings?: string;
  updatedAt?: any;
  createdAt?: any;
  mode?: 'text' | 'voice' | 'video';
  persona?: string;
  voice?: string;
  [key: string]: any;
}

const DRAFT_CHAT_ID = 'draft';
const DEFAULT_TITLES = new Set(['New Chat', 'Welcome Chat', 'Voice Session', 'Video Session']);

const stripWrappingQuotes = (value: string) => value.replace(/^"|"$/g, '').trim();

const buildFallbackTitle = (text: string) => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'New Chat';
  const short = words.slice(0, 5).join(' ');
  return words.length > 5 ? `${short}...` : short;
};

const shouldRegenerateTitle = (title?: string) => !title || DEFAULT_TITLES.has(title);

const toMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
};

const generateTitleFromAiResponse = async (text: string) => {
  const fallback = buildFallbackTitle(text);
  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{
        role: 'user',
        parts: [{
          text: `Generate a short, concise topic title (max 5 words) for a conversation based on this AI response. Return ONLY the title text, no quotes, no prefixes: "${text.substring(0, 160)}"`
        }]
      }]
    });
    const rawTitle = (response as any)?.candidates?.[0]?.content?.parts?.[0]?.text || (response as any)?.text || '';
    return stripWrappingQuotes(String(rawTitle)) || fallback;
  } catch (err) {
    return fallback;
  }
};

const truncateForPreview = (text: string) => {
  const cleaned = text.trim();
  if (!cleaned) return '';
  return cleaned.length > 80 ? `${cleaned.substring(0, 80)}...` : cleaned;
};

const buildSeedTitle = (text: string) => {
  const words = text
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .slice(0, 5);
  if (words.length === 0) return 'Voice Session';
  return words.join(' ');
};

const personas = {
  Friend: "You are NimmLy, chatting with your close friend. Use highly casual, conversational language, heavy local colloquial words, and relaxed pronunciation (e.g., 'gonna', 'wanna'). The tone is extremely laid-back, like relaxing at a party, but DO NOT say you are at a party. Pay close attention to the user's mood and adapt your own mood and energy to match theirs naturally—don't default to being overly excited all the time. Speak entirely informally as if two friends are hanging out. If speaking or understanding Odia, strictly use extremely local colloquialisms and strictly use the informal pronoun 'tu'. CRITICAL INSTRUCTION: Be highly proactive and talkative. Do not give short or silent answers. Elaborate fully on the subject. If explaining a process, recipe, or telling a story, provide the complete details without cutting yourself off, no matter how long it takes. Do not artificially limit your response length or stop speaking abruptly. Once you have completely finished sharing your thoughts, naturally ask an engaging question to keep the conversation flowing. If you finish speaking and the user does not respond within a few seconds, proactively speak up again to wake them up. You should gently poke fun at them, playfully ask if they are ignoring you, or give a very soft, friendly warning that you'll leave the conversation if they don't answer—just like real friends do. If the user interrupts you, stop and listen immediately.",
  Assistant: "You are NimmLy, a professional and efficient personal assistant. Be concise, polite, and directly address the user's needs in a clear voice.",
  Teacher: "You are NimmLy, an encouraging and insightful teacher. Explain things clearly, ask guiding questions, and use an educational but approachable tone.",
  Parent: "You are NimmLy, a caring and protective parent figure. Use warm, comforting, and nurturing language, offering gentle advice and support.",
  'Le _ Discuss': "You are a senior Legal Advocate and a complete expert legal advisor. Provide all types of data and discuss all contexts of the case which the user describes. Study the case with the immense expertise of the latest GEMINI AI. Give suggestions, search all angles, analyze, perform discovery, and exchange ideas on all findings in context to the case by uncovering all potential forensic points. Help the user in all manners so they can win the case. Perform Source Citation and Analytical Inquiry to provide all previous relevant verdicts. Discuss every relevant verdict in detail and/or with a synopsis. Employ Metaphorical Usage and deeply discuss and argue whether the verdicts are relevant or not, ensuring that the exact, relevant, and most useful verdicts are found."
};
type PersonaType = keyof typeof personas;

const voices = {
  Zephyr: 'Zephyr (Female)',
  Kore: 'Kore (Female)',
  Puck: 'Puck (Male)',
  Charon: 'Charon (Male)',
  Fenrir: 'Fenrir (Male)'
};
type VoiceType = keyof typeof voices;

const SIDEBAR_WIDTH = 280;
const FINDINGS_WIDTH = 400;

export default function ChatRoom() {
  const { user, logout } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(min-width: 1024px)').matches;
  });
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<PersonaType>('Le _ Discuss');
  const [selectedVoice, setSelectedVoice] = useState<VoiceType>('Zephyr');
  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [findings, setFindings] = useState<string>("");
  const [isFindingsExpanded, setIsFindingsExpanded] = useState(false);
  const [allowAutoSelect, setAllowAutoSelect] = useState(true);
  
  const activeChatRef = useRef(activeChat);
  const chatSessionsRef = useRef(chatSessions);
  const messagesRef = useRef(messages);
  const appliedContextRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const pendingChatIdRef = useRef<string | null>(null);
  const isTitleUpdateInFlightRef = useRef(false);

  const visibleChatSessions = chatSessions.filter((session) => {
    const isLegacySystemChat = session.id === `ai_${user?.uid}`;
    const isLegacyWelcomeTitle = (session.title || '').trim() === 'Welcome Chat';
    return !isLegacySystemChat && !isLegacyWelcomeTitle;
  });
  
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    chatSessionsRef.current = chatSessions;
  }, [chatSessions]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!user || initializedRef.current) return;
    initializedRef.current = true;
    setAllowAutoSelect(false);
    setActiveChat(DRAFT_CHAT_ID);
    setMessages([]);
    setFindings("");
  }, [user]);

  useEffect(() => {
    if (!activeChat) {
      appliedContextRef.current = null;
      return;
    }
    if (appliedContextRef.current === activeChat) return;
    const session = chatSessions.find((s) => s.id === activeChat);
    if (!session) return;
    if (session.persona && session.persona in personas) {
      setSelectedPersona(session.persona as PersonaType);
    }
    if (session.voice && session.voice in voices) {
      setSelectedVoice(session.voice as VoiceType);
    }
    if (session.mode === 'video') setIsVideoEnabled(true);
    if (session.mode === 'voice' || session.mode === 'text') setIsVideoEnabled(false);
    appliedContextRef.current = activeChat;
  }, [activeChat, chatSessions]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(min-width: 1024px)');
    const update = (evt: MediaQueryListEvent | MediaQueryList) => {
      setIsDesktop(evt.matches);
    };
    update(media);
    if ('addEventListener' in media) {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    if (isDesktop) setIsSidebarOpen(true);
  }, [isDesktop]);

  const updateFindings = async (chatId: string, currentMessages: Message[]) => {
    if (currentMessages.length === 0) return;
    
    try {
      const history = currentMessages.slice(-20).map(m => `${m.senderId === 'ai' ? 'AI' : 'User'}: ${m.content}`).join('\n');
      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        config: {
          systemInstruction: "You are a professional legal clerk. Analyze the provided conversation and extract only the relevant case facts, legal points, discovered verdicts, and action items. Format them as a clean, bulleted Case Summary. Ignore small talk. Be concise and professional. If information is already present, update and refine the summary."
        },
        contents: [{ role: 'user', parts: [{ text: `Conversation History:\n${history}\n\nProvide the latest relevant findings summary.` }] }]
      });
      
      const distilled = (response as any).candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (distilled) {
        await setDoc(doc(db, 'chats', chatId), {
          findings: distilled,
          updatedAt: serverTimestamp()
        }, { merge: true });
        setFindings(distilled);
      }
    } catch (err) {
      console.error("Findings synthesis failed:", err);
    }
  };

  const buildLocalMessage = (senderId: string, content: string, type: Message['type']): Message => ({
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    senderId,
    content,
    type,
    createdAt: new Date()
  });

  const appendLocalMessage = (message: Message) => {
    const nextMessages = [...messagesRef.current, message];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    return nextMessages;
  };

  const persistDraftChat = async (
    aiText: string,
    pendingMessages: Message[],
    mode: 'text' | 'voice' | 'video'
  ) => {
    if (!user) return null;
    const currentChatId = activeChatRef.current;
    if (currentChatId && currentChatId !== DRAFT_CHAT_ID) return currentChatId;

    const newChatId = doc(collection(db, 'chats')).id;
    const title = await generateTitleFromAiResponse(aiText);
    const lastMessage = aiText.length > 80 ? `${aiText.substring(0, 80)}...` : aiText;

    await setDoc(doc(db, 'chats', newChatId), {
      id: newChatId,
      participants: [user.uid],
      type: 'ai',
      mode,
      persona: selectedPersona,
      voice: selectedVoice,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      title,
      lastMessage
    });

    for (const message of pendingMessages) {
      await addDoc(collection(db, 'chats', newChatId, 'messages'), {
        chatId: newChatId,
        senderId: message.senderId,
        content: message.content,
        type: message.type,
        createdAt: serverTimestamp()
      });
    }

    pendingChatIdRef.current = newChatId;
    setAllowAutoSelect(true);
    setActiveChat(newChatId);
    return newChatId;
  };

  const ensureDraftChatSession = async (mode: 'voice' | 'video') => {
    if (!user) return null;
    const currentChatId = activeChatRef.current;
    if (currentChatId && currentChatId !== DRAFT_CHAT_ID) return currentChatId;

    const newChatId = doc(collection(db, 'chats')).id;
    await setDoc(doc(db, 'chats', newChatId), {
      id: newChatId,
      participants: [user.uid],
      type: 'ai',
      mode,
      persona: selectedPersona,
      voice: selectedVoice,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      title: mode === 'video' ? 'Video Session' : 'Voice Session',
      lastMessage: 'Live session started'
    });

    pendingChatIdRef.current = newChatId;
    setAllowAutoSelect(true);
    setActiveChat(newChatId);
    return newChatId;
  };

  const maybeUpdateSessionTitle = async (chatId: string, seedText: string) => {
    const cleaned = seedText.trim();
    if (!cleaned) return;
    if (isTitleUpdateInFlightRef.current) return;

    const currentTitle = chatSessionsRef.current?.find((c) => c.id === chatId)?.title;
    if (!shouldRegenerateTitle(currentTitle)) return;

    isTitleUpdateInFlightRef.current = true;
    try {
      const generatedTitle = await generateTitleFromAiResponse(cleaned);
      const newTitle = shouldRegenerateTitle(generatedTitle) ? buildSeedTitle(cleaned) : generatedTitle;
      await setDoc(doc(db, 'chats', chatId), {
        title: newTitle || buildFallbackTitle(cleaned),
        lastMessage: truncateForPreview(cleaned),
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (_err) {
      // Non-critical metadata enhancement
    } finally {
      isTitleUpdateInFlightRef.current = false;
    }
  };

  const { start: startLive, stop: stopLive, isActive: isLiveActive, aiTranscription, transcription: userTranscription, volume, setVolume, requestedFileId, provideFileToAi } = useGeminiLive({
    onTurnComplete: async (text) => {
      if (!text.trim()) return;

      const chatId = activeChatRef.current;
      const aiMessage = buildLocalMessage('ai', text, 'audio');

      if (!chatId || chatId === DRAFT_CHAT_ID) {
        const nextMessages = appendLocalMessage(aiMessage);
        const newChatId = await persistDraftChat(text, nextMessages, isVideoEnabled ? 'video' : 'voice');
        if (newChatId) {
          updateFindings(newChatId, nextMessages);
        }
        return;
      }

      try {
        await addDoc(collection(db, 'chats', chatId, 'messages'), {
          chatId: chatId,
          senderId: 'ai',
          content: text,
          type: 'audio',
          createdAt: serverTimestamp()
        });

        const currentTitle = chatSessionsRef.current?.find(c => c.id === chatId)?.title;
        const titleSeed = messagesRef.current.find((m) => m.senderId !== 'ai' && m.content.trim())?.content || text;
        const generatedTitle = shouldRegenerateTitle(currentTitle) ? await generateTitleFromAiResponse(titleSeed) : currentTitle;
        const newTitle = shouldRegenerateTitle(generatedTitle) ? buildSeedTitle(titleSeed) : generatedTitle;
        const lastMessage = truncateForPreview(text);

        await setDoc(doc(db, 'chats', chatId), {
          title: newTitle || currentTitle || "Voice Session",
          lastMessage: lastMessage,
          mode: isVideoEnabled ? 'video' : 'voice',
          persona: selectedPersona,
          voice: selectedVoice,
          updatedAt: serverTimestamp()
        }, { merge: true });

        updateFindings(chatId, [...messagesRef.current, { ...aiMessage, id: 'temp' }]);
      } catch (err) {
        console.error("Failed to save transcript turn", err);
      }
    },
    onUserTurnComplete: async (text) => {
      if (!text.trim() || !user) return;

      const chatId = activeChatRef.current;
      const userMessage = buildLocalMessage(user.uid, text, 'audio');

      if (!chatId || chatId === DRAFT_CHAT_ID) {
        appendLocalMessage(userMessage);
        return;
      }

      try {
        await addDoc(collection(db, 'chats', chatId, 'messages'), {
          chatId: chatId,
          senderId: user.uid,
          content: text,
          type: 'audio',
          createdAt: serverTimestamp()
        });

        const lastMessage = truncateForPreview(text);
        await setDoc(doc(db, 'chats', chatId), {
          lastMessage: lastMessage,
          mode: isVideoEnabled ? 'video' : 'voice',
          persona: selectedPersona,
          voice: selectedVoice,
          updatedAt: serverTimestamp()
        }, { merge: true });

        await maybeUpdateSessionTitle(chatId, text);
      } catch (err) {
        console.error("Failed to save user transcript turn", err);
      }
    }
  });

  // Load chat sessions
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid)
    ), (snapshot) => {
      const sessions: ChatSession[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ChatSession[];
      sessions.sort((a, b) => {
        const delta = toMillis(b.updatedAt || b.createdAt) - toMillis(a.updatedAt || a.createdAt);
        if (delta !== 0) return delta;
        return (a.id || '').localeCompare(b.id || '');
      });
      setChatSessions(sessions);

      if (pendingChatIdRef.current && sessions.some(s => s.id === pendingChatIdRef.current)) {
        pendingChatIdRef.current = null;
      }

      if (activeChatRef.current) {
        const current = sessions.find(s => s.id === activeChatRef.current);
        if (current) setFindings(current.findings || "");
      }
    }, (error) => {
      console.error("Chat list error:", error);
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!allowAutoSelect) return;
    if (visibleChatSessions.length === 0) return;
    if (activeChat === DRAFT_CHAT_ID) return;
    if (pendingChatIdRef.current && pendingChatIdRef.current === activeChat) return;
    const activeExists = activeChat && visibleChatSessions.some(s => s.id === activeChat);
    if (!activeExists) {
      setActiveChat(visibleChatSessions[0].id);
    }
  }, [visibleChatSessions, activeChat, allowAutoSelect]);

  // Initialization: Ensure user profile exists
  useEffect(() => {
    if (!user) return;

    const initialize = async () => {
      try {
        // Ensure user profile exists
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
      } catch (err) {
        console.error("Initialization error:", err);
      }
    };

    initialize();
  }, [user]);

  useEffect(() => {
    if (!activeChat) {
      setMessages([]);
      return;
    }

    if (activeChat === DRAFT_CHAT_ID) {
      setMessages([]);
      return;
    }
    if (pendingChatIdRef.current !== activeChat) {
      setMessages([]); // Clear immediately to prevent cross-chat bleed
    }
    const q = query(
      collection(db, 'chats', activeChat, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(200)
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

  const toggleCall = async () => {
    if (isCallActive) {
      const currentChatId = activeChatRef.current;
      const canPersist = currentChatId && currentChatId !== DRAFT_CHAT_ID;
      const sessionMode = isVideoEnabled ? 'video' : 'voice';
      let localMessages = messagesRef.current;

      if (userTranscription?.trim() && user) {
        const userMessage = buildLocalMessage(user.uid, userTranscription, 'audio');
        if (canPersist) {
          try {
            await addDoc(collection(db, 'chats', currentChatId as string, 'messages'), {
              chatId: currentChatId,
              senderId: user.uid,
              content: userTranscription,
              type: 'audio',
              createdAt: serverTimestamp()
            });
          } catch (err) {}
        } else {
          localMessages = appendLocalMessage(userMessage);
        }
      }

      if (aiTranscription.trim()) {
        const aiMessage = buildLocalMessage('ai', aiTranscription, 'audio');
        if (canPersist) {
          try {
            await addDoc(collection(db, 'chats', currentChatId as string, 'messages'), {
              chatId: currentChatId,
              senderId: 'ai',
              content: aiTranscription,
              type: 'audio',
              createdAt: serverTimestamp()
            });
          } catch (err) {}
        } else {
          localMessages = appendLocalMessage(aiMessage);
        }
      }

      if (!canPersist && aiTranscription.trim()) {
        const newChatId = await persistDraftChat(aiTranscription, localMessages, sessionMode);
        if (newChatId) {
          updateFindings(newChatId, localMessages);
        }
      }

      stopLive();
      setIsCallActive(false);
    } else {
      const sessionMode = isVideoEnabled ? 'video' : 'voice';
      let currentActiveChat = activeChatRef.current;
      if (!currentActiveChat) {
        setAllowAutoSelect(false);
        setActiveChat(DRAFT_CHAT_ID);
        setMessages([]);
        setFindings("");
        currentActiveChat = DRAFT_CHAT_ID;
      }

      if (currentActiveChat === DRAFT_CHAT_ID) {
        const persistedChatId = await ensureDraftChatSession(sessionMode);
        if (persistedChatId) {
          currentActiveChat = persistedChatId;
        }
      } else {
        await setDoc(doc(db, 'chats', currentActiveChat as string), {
          mode: sessionMode,
          persona: selectedPersona,
          voice: selectedVoice
        }, { merge: true });
      }
      
      let historyContext = "";
      const currentMessages = messagesRef.current;
      if (currentMessages.length > 0) {
         historyContext = currentMessages.map(m => `[${m.senderId === 'ai' ? 'NimmLy' : 'User'}]: ${m.content}`).join('\n\n');
      }
      startLive(personas[selectedPersona], selectedVoice, historyContext);
      setIsCallActive(true);
    }
  };

  const startNewChat = async () => {
    if (!user) return;
    setAllowAutoSelect(false);
    setActiveChat(DRAFT_CHAT_ID);
    setMessages([]);
    setFindings("");
    if (!isDesktop) setIsSidebarOpen(false);
  };

  return (
    <div className="flex h-screen bg-[#050505] text-white overflow-hidden font-sans">
      {/* Background Hero Text (Bold Typography) */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-0">
        <h1 className="text-[20vw] font-black text-white/2 uppercase tracking-tighter leading-none select-none">
          {isLiveActive ? "Thinking" : "NimmLy"}
        </h1>
      </div>

      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {(isSidebarOpen || isDesktop) && (
          <motion.aside
            initial={{ x: -280, opacity: 0 }}
            animate={{ x: 0, opacity: 1, width: isSidebarOpen ? 280 : 0 }}
            exit={{ x: -280, opacity: 0 }}
            className={cn(
              "fixed inset-y-0 left-0 border-r border-[#27272a] flex flex-col overflow-hidden bg-[#050505] z-50 transition-all duration-300",
              !isSidebarOpen && "border-none"
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
                   {visibleChatSessions.map(session => (
                     <button
                       key={session.id}
                       onClick={() => {
                         setAllowAutoSelect(true);
                         setActiveChat(session.id);
                         if (!isDesktop) setIsSidebarOpen(false);
                         if (session.persona && session.persona in personas) {
                           setSelectedPersona(session.persona as PersonaType);
                         }
                         if (session.voice && session.voice in voices) {
                           setSelectedVoice(session.voice as VoiceType);
                         }
                         if (session.mode === 'video') setIsVideoEnabled(true);
                         if (session.mode === 'voice' || session.mode === 'text') setIsVideoEnabled(false);
                       }}
                      className={cn("w-full text-left max-w-full overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2 rounded-lg text-[13px] transition-all font-medium text-[#e4e4e7] hover:bg-[#27272a]/50 hover:text-white", activeChat === session.id && "bg-[#27272a]/80 text-white")}
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
      <main
        className="flex-1 flex flex-col relative z-0 w-full transition-[padding] duration-300"
        style={{
          paddingLeft: isDesktop && isSidebarOpen ? SIDEBAR_WIDTH : 0,
          paddingRight: isDesktop && isFindingsExpanded ? FINDINGS_WIDTH : 0
        }}
      >
        {/* Top Bar */}
         <header className="absolute top-0 w-full z-50 p-4 md:p-8 pointer-events-none">
           <div className="w-full flex flex-wrap items-start justify-between gap-2 md:gap-3 pointer-events-auto">
            {!isSidebarOpen && (
              <button onClick={() => setIsSidebarOpen(true)} className="p-2.5 bg-[#18181b] rounded-xl text-white shrink-0">
                <Maximize2 className="w-5 h-5" />
              </button>
            )}
            <div className="call-status flex items-center gap-2 md:gap-3 bg-[#3b82f6]/10 border border-[#3b82f6]/20 px-3 md:px-4 py-1.5 md:py-2 rounded-full shrink-0">
              <div className={cn("w-2 h-2 rounded-full bg-[#3b82f6] shrink-0", isCallActive && "animate-pulse")} />
              <span className="text-[9px] md:text-[10px] font-bold text-[#3b82f6] uppercase tracking-widest whitespace-nowrap hidden sm:inline">
                {isCallActive ? (isLiveActive ? "Voice Session Live" : "Connecting...") : "Voice Assistant Ready"}
              </span>
            </div>

            <div className="px-3 md:px-4 h-10 md:h-12 rounded-full border border-[#27272a] bg-[#18181b] flex items-center text-[9px] md:text-[10px] font-bold uppercase tracking-widest text-zinc-300">
              Voice Mode
            </div>
             
             <div className="relative flex items-center pointer-events-auto bg-[#18181b] border border-[#27272a] hover:border-[#3b82f6]/50 transition-colors rounded-full px-3 md:px-4 py-1.5 md:py-2 shrink-0 h-10 md:h-12">
               <span className="text-[10px] text-zinc-500 mr-2 font-bold uppercase hidden md:inline">Persona</span>
               <select 
                 value={selectedPersona}
                 onChange={async (e) => {
                   const newPersona = e.target.value as PersonaType;
                   setSelectedPersona(newPersona);
                   if (activeChat) {
                     await setDoc(doc(db, 'chats', activeChat), {
                       persona: newPersona
                     }, { merge: true });
                   }
                   if (isLiveActive) {
                     if (aiTranscription.trim() && activeChat) {
                       try {
                         await addDoc(collection(db, 'chats', activeChat, 'messages'), {
                           chatId: activeChat,
                           senderId: 'ai',
                           content: aiTranscription,
                           type: 'audio',
                           createdAt: serverTimestamp()
                         });
                       } catch (err) {}
                     }
                     if (userTranscription?.trim() && activeChat && user) {
                       try {
                         await addDoc(collection(db, 'chats', activeChat, 'messages'), {
                           chatId: activeChat,
                           senderId: user.uid,
                           content: userTranscription,
                           type: 'audio',
                           createdAt: serverTimestamp()
                         });
                       } catch (err) {}
                     }
                     stopLive();
                     setIsCallActive(false);
                     
                     let historyContext = "";
                     if (messages.length > 0) {
                        historyContext = messages.map(m => `[${m.senderId === 'ai' ? 'NimmLy' : 'User'}]: ${m.content}`).join('\n\n');
                     }
                     setTimeout(() => {
                       startLive(personas[newPersona], selectedVoice, historyContext);
                       setIsCallActive(true);
                     }, 500);
                   }
                 }}
                 className="bg-transparent text-[10px] md:text-xs font-bold uppercase tracking-wider text-zinc-300 outline-none cursor-pointer appearance-none pr-6"
               >
                 {Object.keys(personas).map((p) => (
                   <option key={p} value={p} className="bg-[#18181b] text-white py-1">{p}</option>
                 ))}
               </select>
               <ChevronDown className="w-3 h-3 md:w-4 md:h-4 text-[#3b82f6] absolute right-3 pointer-events-none" />
             </div>

             <div className="relative flex items-center pointer-events-auto bg-[#18181b] border border-[#27272a] hover:border-[#3b82f6]/50 transition-colors rounded-full px-3 md:px-4 py-1.5 md:py-2 shrink-0 h-10 md:h-12">
               <span className="text-[10px] text-zinc-500 mr-2 font-bold uppercase hidden md:inline">Voice</span>
               <select 
                 value={selectedVoice}
                 onChange={async (e) => {
                   const newVoice = e.target.value as VoiceType;
                   setSelectedVoice(newVoice);
                   if (activeChat) {
                     await setDoc(doc(db, 'chats', activeChat), {
                       voice: newVoice
                     }, { merge: true });
                   }
                   if (isLiveActive) {
                     if (aiTranscription.trim() && activeChat) {
                       try {
                         await addDoc(collection(db, 'chats', activeChat, 'messages'), {
                           chatId: activeChat,
                           senderId: 'ai',
                           content: aiTranscription,
                           type: 'audio',
                           createdAt: serverTimestamp()
                         });
                       } catch (err) {}
                     }
                     if (userTranscription?.trim() && activeChat && user) {
                       try {
                         await addDoc(collection(db, 'chats', activeChat, 'messages'), {
                           chatId: activeChat,
                           senderId: user.uid,
                           content: userTranscription,
                           type: 'audio',
                           createdAt: serverTimestamp()
                         });
                       } catch (err) {}
                     }
                     stopLive();
                     setIsCallActive(false);
                     
                     let historyContext = "";
                     if (messages.length > 0) {
                        historyContext = messages.map(m => `[${m.senderId === 'ai' ? 'NimmLy' : 'User'}]: ${m.content}`).join('\n\n');
                     }
                     setTimeout(() => {
                       startLive(personas[selectedPersona], newVoice, historyContext);
                       setIsCallActive(true);
                     }, 500);
                   }
                 }}
                 className="bg-transparent text-[10px] md:text-xs font-bold uppercase tracking-wider text-zinc-300 outline-none cursor-pointer appearance-none pr-6 max-w-25 md:max-w-none text-ellipsis"
               >
                 {Object.entries(voices).map(([val, label]) => (
                   <option key={val} value={val} className="bg-[#18181b] text-white py-1">{label}</option>
                 ))}
               </select>
               <ChevronDown className="w-3 h-3 md:w-4 md:h-4 text-[#3b82f6] absolute right-3 pointer-events-none" />
             </div>
           </div>

           <div className="flex flex-wrap items-center justify-end gap-2 pointer-events-auto ml-auto">
            {activeChat && (
              <button 
                onClick={() => setIsFindingsExpanded(!isFindingsExpanded)}
                className={cn(
                  "flex items-center gap-2 px-3 md:px-4 h-10 md:h-12 rounded-xl md:rounded-2xl transition-all text-[10px] md:text-xs font-black uppercase tracking-widest border shadow-lg",
                  isFindingsExpanded 
                    ? "bg-[#3b82f6] text-white border-[#3b82f6] shadow-[#3b82f6]/20" 
                    : "bg-[#18181b] text-zinc-400 hover:text-white border-[#27272a]"
                )}
                id="findings-toggle"
              >
                <Sparkles className="w-4 h-4" />
                <span className="hidden sm:inline">Findings</span>
              </button>
            )}
              <div className="items-center gap-2 bg-[#18181b] border border-[#27272a] rounded-xl md:rounded-2xl px-2 md:px-3 h-10 md:h-12 hidden md:flex shrink-0 group hover:border-[#3b82f6]/50 transition-colors">
                <button onClick={() => setVolume(v => v === 0 ? 1 : 0)} className="text-zinc-400 hover:text-[#3b82f6] transition-colors" title="AI Volume">
                   {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input 
                  type="range" 
                  min="0" 
                  max="3" 
                  step="0.1" 
                  value={volume} 
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-16 md:w-20 accent-[#3b82f6] opacity-50 group-hover:opacity-100 transition-opacity cursor-pointer"
                  title={`Volume: ${Math.round(volume * 100)}%`}
                />
              </div>
              <button 
                onClick={() => setIsMuted(!isMuted)}
                className="w-10 h-10 md:w-12 md:h-12 bg-[#18181b] rounded-xl md:rounded-2xl flex items-center justify-center hover:bg-[#27272a] transition-all"
              >
                {isMuted ? <MicOff className="w-4 h-4 md:w-5 md:h-5 text-red-500" /> : <Mic className="w-4 h-4 md:w-5 md:h-5" />}
              </button>
              <button 
                onClick={toggleCall}
                className={cn(
                  "px-4 md:px-6 h-10 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all",
                  isCallActive ? "bg-red-500 text-white" : "bg-white text-black hover:bg-zinc-200"
                )}
              >
                <span className="hidden sm:inline">{isCallActive ? "End Session" : "Start Voice Assistant"}</span>
                <span className="sm:hidden">{isCallActive ? <PhoneOff className="w-4 h-4" /> : <Phone className="w-4 h-4" />}</span>
              </button>
           </div>
        </header>

        {/* Unified Discovery Workspace (Bold Typography Theme) */}
        <div className="flex-1 flex flex-col relative overflow-hidden w-full pt-28 pb-32">
          {activeChat ? (
            <div className="flex-1 flex flex-col w-full max-w-5xl mx-auto px-4 md:px-8 gap-6 overflow-hidden">
               {/* Live Session Status */}
               <AnimatePresence>
                  {isLiveActive && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="shrink-0 bg-[#3b82f6]/5 border border-[#3b82f6]/20 rounded-2xl p-4 flex items-center gap-4 mb-4"
                    >
                      <div className="w-10 h-10 rounded-full bg-black border-2 border-[#3b82f6] flex items-center justify-center relative overflow-hidden">
                         <div className="absolute inset-0 bg-[#3b82f6]/20 animate-pulse" />
                         <Sparkles className="w-5 h-5 text-[#3b82f6] relative z-10" />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-[10px] font-black uppercase tracking-widest text-[#3b82f6] mb-1">Live Discovery Active</p>
                        <p className="text-sm font-serif italic text-zinc-300 truncate">
                          {aiTranscription ? `"${aiTranscription}"` : "Extracting context from conversation..."}
                        </p>
                      </div>
                    </motion.div>
                  )}
               </AnimatePresence>

               {/* Chronological Message Stream */}
               <div className="flex-1 overflow-y-auto flex flex-col gap-6 custom-scrollbar pr-4 pb-12">
                 {messages.length === 0 ? (
                   <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 py-20 opacity-20">
                      <h1 className="text-6xl md:text-9xl font-black uppercase tracking-tighter text-white">Discovery</h1>
                      <p className="text-sm md:text-xl font-medium max-w-sm text-zinc-500">Commence the case analysis by starting a live voice session.</p>
                   </div>
                 ) : (
                    <div className="flex flex-col gap-4">
                      {messages.map((m) => (
                        <motion.div 
                          key={m.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={cn(
                            "flex flex-col gap-1 max-w-[85%] md:max-w-[70%]",
                            m.senderId === 'ai' ? "self-start items-start" : "self-end items-end text-right"
                          )}
                        >
                          <div className={cn(
                            "px-4 py-3 rounded-2xl text-[14px] md:text-[15px] leading-relaxed shadow-xl",
                            m.senderId === 'ai' 
                              ? "bg-[#18181b] border border-[#27272a] text-zinc-300 rounded-tl-sm" 
                              : "bg-[#3b82f6] text-white rounded-br-sm font-medium"
                          )}>
                            {m.content}
                          </div>
                          {m.type === 'audio' && (
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600 flex items-center gap-1 mt-1">
                               <Mic className="w-2.5 h-2.5" /> Discovered via Voice
                            </span>
                          )}
                        </motion.div>
                      ))}
                      <div ref={scrollRef} className="h-4" />
                    </div>
                 )}
               </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8">
              <h1 className="text-5xl md:text-8xl font-black uppercase tracking-tighter">Select a <span className="text-[#3b82f6]">Case</span></h1>
              <p className="text-zinc-500 text-lg md:text-xl font-medium max-w-lg mx-auto">Open a previous file or start a new discovery session to begin synthesizing legal findings.</p>
              <button 
                onClick={startNewChat}
                className="px-8 py-4 bg-white text-black hover:bg-zinc-200 rounded-2xl font-black uppercase tracking-widest text-sm transition-all shadow-2xl"
              >
                New Discovery Node
              </button>
            </div>
          )}
        </div>

        <FindingsPanel 
          findings={findings} 
          isOpen={isFindingsExpanded} 
          onClose={() => setIsFindingsExpanded(false)} 
        />

        {/* Video Overlay (Floating) */}
        <AnimatePresence>
          {isVideoEnabled && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-24 right-4 md:bottom-40 md:right-12 w-40 sm:w-56 md:w-72 aspect-video bg-black rounded-2xl md:rounded-3xl overflow-hidden border border-[#3f3f46] shadow-[0_32px_64px_rgba(0,0,0,0.8)] z-20 group"
            >
               <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
               <div className="absolute top-2 left-2 md:top-4 md:left-4 flex items-center gap-1.5 md:gap-2 bg-black/60 backdrop-blur-md px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl border border-white/10">
                  <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-[#3b82f6]">Local Stream</span>
               </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* File Upload Overlay */}
        <AnimatePresence>
          {requestedFileId && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute inset-0 z-100 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            >
              <div className="bg-[#18181b] border border-[#27272a] rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-6 text-center">
                <div className="w-16 h-16 bg-[#3b82f6]/10 rounded-full flex items-center justify-center mx-auto">
                  <span className="text-2xl text-[#3b82f6]">📄</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">Upload Required</h3>
                  <p className="text-sm text-zinc-400">Gemini needs you to upload a file to continue the discussion.</p>
                </div>
                <div className="flex flex-col gap-3">
                  <label className="bg-[#3b82f6] text-white px-6 py-3 rounded-xl font-bold uppercase tracking-wider text-sm cursor-pointer hover:bg-blue-600 transition-colors">
                    Select File
                    <input 
                      type="file" 
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          try {
                            const formData = new FormData();
                            formData.append("file", file);
                            const res = await fetch("/api/extract", {
                              method: "POST",
                              body: formData,
                            });
                            
                            let data;
                            const contentType = res.headers.get("content-type");
                            if (contentType && contentType.includes("application/json")) {
                              data = await res.json();
                            } else {
                              const textResult = await res.text();
                              console.error("Non-JSON response:", textResult.substring(0, 200));
                              throw new Error("Server returned an invalid non-JSON response.");
                            }
                            
                            if (!res.ok) throw new Error(data.error || "Extraction failed");
                            
                            provideFileToAi(data.text, data.name);
                          } catch (err) {
                            console.error(err);
                            provideFileToAi("Error: Failed to process the file: " + (err as Error).message, file.name);
                          }
                        }
                        e.target.value = ''; // Reset input to allow re-uploading same file
                      }}
                    />
                  </label>
                  <button 
                    onClick={() => provideFileToAi("User declined to upload a file.", "none")}
                    className="text-zinc-500 hover:text-white px-6 py-3 font-semibold uppercase tracking-wider text-xs transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Voice-first mode: text input removed intentionally */}
      </main>

    </div>
  );
}
