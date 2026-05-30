import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/components/ui/Toaster";

const BUCKET = "sample-files";

interface VoiceFeedbackProps {
  value: string;
  onChange: (text: string) => void;
  onAudioUrl?: (url: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  maxLength?: number;
}

type RecState = "idle" | "recording" | "transcribing";

// SpeechRecognition with cross-browser support
const SpeechRecognition =
  (typeof window !== "undefined" &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) ||
  null;

export function VoiceFeedback({
  value,
  onChange,
  onAudioUrl,
  placeholder = "Type feedback or click mic to record…",
  disabled = false,
  rows = 2,
  maxLength,
}: VoiceFeedbackProps) {
  const { user } = useAuth();
  const [recState, setRecState] = useState<RecState>("idle");
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptRef = useRef("");

  const hasSpeechApi = !!SpeechRecognition;

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    mediaRecorderRef.current = null;
    recognitionRef.current = null;
    chunksRef.current = [];
    timerRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const canRecord = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  async function startRecording() {
    if (!canRecord) {
      toast.error("Voice recording requires HTTPS. Use the deployed site or chrome://flags to allow on localhost.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      transcriptRef.current = value;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
        setAudioPreviewUrl(URL.createObjectURL(blob));
      };

      mr.start(250);

      // Start speech recognition for live transcription
      if (hasSpeechApi) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "hi-IN";
        // Multi-language: listen for Hindi primarily, engine auto-detects English
        // Setting maxAlternatives helps accuracy
        recognition.maxAlternatives = 1;

        recognition.onresult = (event: any) => {
          let interim = "";
          let final = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              final += transcript + " ";
            } else {
              interim = transcript;
            }
          }
          if (final) {
            transcriptRef.current += final;
            onChange(transcriptRef.current.trim());
          }
        };

        recognition.onerror = (event: any) => {
          if (event.error !== "aborted") {
            console.warn("Speech recognition error:", event.error);
          }
        };

        recognition.onend = () => {
          // Auto-restart if still recording (recognition times out after silence)
          if (mediaRecorderRef.current?.state === "recording") {
            try { recognition.start(); } catch {}
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
      }

      setRecState("recording");
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch (err) {
      toast.error("Microphone access denied. Check browser permissions.");
    }
  }

  async function stopRecording() {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecState("idle");
  }

  async function uploadAudio(): Promise<string | null> {
    if (!audioBlob || !user) return null;
    setUploading(true);
    const path = `${user.id}/feedback/${Date.now()}-voice.webm`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, audioBlob, {
      contentType: "audio/webm",
      upsert: false,
    });
    setUploading(false);
    if (error) {
      toast.error("Audio upload failed");
      return null;
    }
    return path;
  }

  function clearAudio() {
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    setAudioBlob(null);
    setAudioPreviewUrl(null);
    onAudioUrl?.(null);
  }

  // Expose upload for parent to call before submit
  useEffect(() => {
    if (audioBlob && onAudioUrl) {
      // Auto-upload when recording stops
      void uploadAudio().then((url) => {
        if (url) onAudioUrl(url);
      });
    }
  }, [audioBlob]);

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          maxLength={maxLength}
          disabled={disabled || recState === "recording"}
          className={cn(
            "w-full rounded-md border border-input bg-card px-3 py-1.5 pr-12 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
            recState === "recording" && "border-destructive/50 bg-destructive/5"
          )}
        />
        {/* Mic button — overlaid on the textarea */}
        <div className="absolute right-2 top-2">
          {recState === "idle" ? (
            <button
              type="button"
              onClick={startRecording}
              disabled={disabled || uploading}
              title={hasSpeechApi ? "Record voice feedback (auto-transcribes)" : "Record voice feedback"}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
            >
              <Mic className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              title="Stop recording"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-white animate-pulse"
            >
              <Square className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Recording indicator */}
      {recState === "recording" && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
          <span className="text-[11px] font-medium text-destructive">Recording… {fmtTime(duration)}</span>
          {hasSpeechApi && (
            <span className="ml-auto text-[10px] text-muted-foreground">Live transcription active</span>
          )}
        </div>
      )}

      {/* Audio preview + controls */}
      {audioPreviewUrl && recState === "idle" && (
        <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5">
          <audio src={audioPreviewUrl} controls className="h-7 flex-1 [&::-webkit-media-controls-panel]:bg-transparent" />
          <button
            type="button"
            onClick={clearAudio}
            disabled={disabled || uploading}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive disabled:opacity-50"
            title="Remove recording"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
        </div>
      )}

      {!canRecord && (
        <p className="text-[10px] text-muted-foreground">🎤 Voice recording requires HTTPS — available on the deployed site</p>
      )}
      {canRecord && !hasSpeechApi && recState === "idle" && !audioBlob && (
        <p className="text-[10px] text-muted-foreground">Voice recording available · transcription requires Chrome/Edge</p>
      )}
    </div>
  );
}
