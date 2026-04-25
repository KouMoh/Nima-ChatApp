import { useState, useCallback, useRef, useEffect } from 'react';
import { ai } from '../lib/gemini';
import { Modality, LiveServerMessage } from '@google/genai';

export function useGeminiLive() {
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState("");
  const [aiTranscription, setAiTranscription] = useState("");
  
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<AudioWorkletNode | ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);

  // Buffer to store audio chunks for gapless playback
  const playNextInQueue = useCallback(() => {
    if (!audioContextRef.current || audioQueueRef.current.length === 0 || isPlayingRef.current) return;

    isPlayingRef.current = true;
    const chunk = audioQueueRef.current.shift()!;
    const audioBuffer = audioContextRef.current.createBuffer(1, chunk.length, 24000);
    audioBuffer.getChannelData(0).set(chunk);

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => {
      isPlayingRef.current = false;
      playNextInQueue();
    };
    source.start();
  }, []);

  const stop = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (microphoneRef.current) {
      microphoneRef.current.disconnect();
      microphoneRef.current = null;
    }
    setIsActive(false);
  }, []);

  const start = useCallback(async (systemInstruction: string = "You are a helpful assistant.") => {
    try {
      setError(null);
      
      // Initialize Audio Context
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphoneRef.current = audioContextRef.current.createMediaStreamSource(stream);
      
      // ScriptProcessor is deprecated but easier for a quick implementation without separate worklet files
      // In a real production app, we'd use AudioWorklet
      const processor = audioContextRef.current.createScriptProcessor(2048, 1, 1);
      processorRef.current = processor;

      const sessionPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsActive(true);
            microphoneRef.current?.connect(processor);
            processor.connect(audioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Transcription
            if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
              setAiTranscription(prev => prev + message.serverContent?.modelTurn?.parts?.[0]?.text);
            }
            
            // Audio output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              const binaryString = atob(base64Audio);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              // Convert 16-bit PCM to Float32 and boost volume
              const pcm16 = new Int16Array(bytes.buffer);
              const float32 = new Float32Array(pcm16.length);
              const VOLUME_BOOST = 3.0;
              for (let i = 0; i < pcm16.length; i++) {
                // Boost volume and clamp between -1.0 and 1.0 to prevent clipping distortion
                float32[i] = Math.max(-1, Math.min(1, (pcm16[i] / 32768.0) * VOLUME_BOOST));
              }
              audioQueueRef.current.push(float32);
              playNextInQueue();
            }

            // Interruption
            if (message.serverContent?.interrupted) {
              audioQueueRef.current = [];
              isPlayingRef.current = false;
            }
          },
          onerror: (err) => {
            console.error("Live session error:", err);
            setError(err.message);
            stop();
          },
          onclose: () => {
            stop();
          }
        }
      });

      sessionRef.current = await sessionPromise;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Convert to 16-bit PCM
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
        }
        
        const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
        sessionRef.current?.sendRealtimeInput({
          audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
        });
      };

    } catch (err) {
      console.error("Failed to start Live session:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      stop();
    }
  }, [playNextInQueue, stop]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { start, stop, isActive, error, transcription, aiTranscription };
}
