import { useState, useCallback, useRef, useEffect } from 'react';
import { ai } from '../lib/gemini';
import { Modality, LiveServerMessage, Type } from '@google/genai';

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
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [volume, setVolume] = useState(1.0);
  const volumeRef = useRef(1.0);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const startSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      if (sessionRef.current) {
        sessionRef.current.sendClientContent({
          turns: [{
            role: "user",
            parts: [{text: "System prompt: The user has been completely silent. Please say something proactively about the topic, ask the user to speak up, or give a very soft, playful warning that you will stop if they don't answer."}]
          }],
          turnComplete: true
        });
      }
    }, 2500); // Trigger after 2.5 seconds of silence
  }, [clearSilenceTimer]);

  // Buffer to store audio chunks for gapless playback
  const playNextInQueue = useCallback(() => {
    if (!audioContextRef.current || audioQueueRef.current.length === 0 || isPlayingRef.current) {
       if (!isPlayingRef.current && sessionRef.current) {
         startSilenceTimer();
       }
       return;
    }

    clearSilenceTimer(); // AI is playing audio, no silence timer

    isPlayingRef.current = true;
    const chunk = audioQueueRef.current.shift()!;
    const audioBuffer = audioContextRef.current.createBuffer(1, chunk.length, 24000);
    audioBuffer.getChannelData(0).set(chunk);

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => {
      if (currentAudioSourceRef.current === source) {
        isPlayingRef.current = false;
        currentAudioSourceRef.current = null;
        playNextInQueue();
      }
    };
    currentAudioSourceRef.current = source;
    source.start();
  }, [clearSilenceTimer, startSilenceTimer]);

  const stop = useCallback(() => {
    clearSilenceTimer();
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

  const start = useCallback(async (systemInstruction: string = "You are a helpful assistant.", voiceName: string = "Aoede") => {
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
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } },
          },
          systemInstruction: { parts: [{ text: systemInstruction }] },
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          tools: [{
            functionDeclarations: [{
              name: 'set_ai_volume',
              description: 'Sets your own audio volume. Use this whenever the user asks you to speak louder, quieter, reduce your volume, etc. The default volume is 1.0. Max is 3.0, min is 0.1.',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  new_volume: {
                    type: Type.NUMBER,
                    description: "The requested volume level between 0.1 (very quiet) and 3.0 (very loud)."
                  }
                },
                required: ["new_volume"]
              }
            }]
          }]
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

            // Function calling (Tools)
            if (message.toolCall?.functionCalls) {
              for (const call of message.toolCall.functionCalls) {
                if (call.name === 'set_ai_volume') {
                  const newVol = (call.args as any)?.new_volume;
                  const finalVol = typeof newVol === 'number' ? newVol : 1.0;
                  setVolume(finalVol);
                  console.log("Volume updated by AI to:", finalVol);
                  
                  if (sessionRef.current) {
                    sessionRef.current.sendToolResponse({
                      functionResponses: [{
                        id: call.id,
                        name: call.name,
                        response: { result: `Volume successfully set to ${finalVol}` }
                      }]
                    });
                  }
                }
              }
            }
            
            // Audio output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              const binaryString = atob(base64Audio);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              // Convert 16-bit PCM to Float32 and apply volume modifier
              const pcm16 = new Int16Array(bytes.buffer);
              const float32 = new Float32Array(pcm16.length);
              const VOLUME_BOOST = 3.0 * volumeRef.current;
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
              if (currentAudioSourceRef.current) {
                currentAudioSourceRef.current.onended = null;
                try { currentAudioSourceRef.current.stop(); } catch(e) {}
                currentAudioSourceRef.current = null;
              }
            }
          },
          onerror: (err: any) => {
            const errorMessage = err instanceof Error ? err.message : String(err);
            if (errorMessage.includes("Network error") || errorMessage.includes("abnormal")) {
              console.warn("Live session connection dropped (Network error). You may need to restart the session.");
            } else {
              console.error("Live session error:", err);
            }
            if (errorMessage.includes("Network error") && !isActive) {
              return;
            }
            setError(errorMessage);
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
        
        // Convert to 16-bit PCM and calculate user volume
        let sumSquares = 0;
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          sumSquares += inputData[i] * inputData[i];
          pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
        }
        
        const rms = Math.sqrt(sumSquares / inputData.length);
        if (rms > 0.02) {
          // User is speaking, clear the silence timer
          clearSilenceTimer();
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

  return { start, stop, isActive, error, transcription, aiTranscription, volume, setVolume };
}
