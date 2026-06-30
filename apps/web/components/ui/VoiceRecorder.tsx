"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2, Upload } from "lucide-react";
import { uploadAudio, type UploadedAudio } from "@/lib/upload";
import { VoicePlayer } from "@/components/ui/VoicePlayer";

type VoiceRecorderProps = {
  folder: string;
  value?: string;
  disabled?: boolean;
  maxSeconds?: number;
  onChange: (voiceUrl: string, upload?: UploadedAudio) => void;
  onError?: (message: string) => void;
};

const preferredMimeTypes = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
];

function supportedMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function formatSeconds(seconds: number) {
  return `0:${Math.max(0, seconds).toString().padStart(2, "0")}`;
}

export function VoiceRecorder({
  folder,
  value,
  disabled = false,
  maxSeconds = 60,
  onChange,
  onError,
}: Readonly<VoiceRecorderProps>) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [localPreview, setLocalPreview] = useState("");
  const interruptedRef = useRef(false);

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const clearTimers = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
    timerRef.current = null;
    stopTimerRef.current = null;
  };

  useEffect(() => {
    return () => {
      clearTimers();
      cleanupStream();
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  const fail = useCallback((message: string) => {
    onError?.(message);
  }, [onError]);

  const interrupt = useCallback((message = "录音已中断，请重新录制") => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    interruptedRef.current = true;
    fail(message);
    recorder.stop();
  }, [fail]);

  const start = async () => {
    if (disabled || recording || uploading) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      fail("当前浏览器不支持录音");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = supportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      interruptedRef.current = false;
      streamRef.current = stream;
      recorderRef.current = recorder;
      stream.getTracks().forEach((track) => {
        track.addEventListener("ended", () => interrupt("录音权限或设备被系统中断，请重新录制"), { once: true });
      });

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        clearTimers();
        cleanupStream();
        setRecording(false);
        if (interruptedRef.current) {
          chunksRef.current = [];
          recorderRef.current = null;
          interruptedRef.current = false;
          return;
        }
        void uploadRecording();
      });
      recorder.start();
      setElapsed(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => setElapsed((current) => Math.min(maxSeconds, current + 1)), 1000);
      stopTimerRef.current = window.setTimeout(() => stop(), maxSeconds * 1000);
    } catch (error) {
      cleanupStream();
      const name = error instanceof DOMException ? error.name : "";
      fail(name === "NotAllowedError" ? "麦克风权限被拒绝，请在系统设置中允许后再录音" : "请允许麦克风权限后再录音");
    }
  };

  const stop = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    interruptedRef.current = false;
    recorder.stop();
  };

  useEffect(() => {
    if (!recording) return;
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        interrupt("应用进入后台，录音已停止，请重新录制");
      }
    };
    const handlePageHide = () => interrupt("页面已离开，录音已停止，请重新录制");
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [interrupt, recording]);

  const uploadRecording = async () => {
    const chunks = chunksRef.current;
    chunksRef.current = [];
    if (chunks.length === 0) {
      fail("没有录到声音，请再试一次");
      return;
    }
    const mimeType = recorderRef.current?.mimeType || "audio/webm";
    const blob = new Blob(chunks, { type: mimeType });
    if (localPreview) URL.revokeObjectURL(localPreview);
    const previewUrl = URL.createObjectURL(blob);
    setLocalPreview(previewUrl);
    setUploading(true);
    try {
      const uploaded = await uploadAudio(blob, folder, elapsed * 1000);
      onChange(uploaded.url, uploaded);
    } catch {
      fail("语音上传失败，请稍后再试");
    } finally {
      setUploading(false);
      recorderRef.current = null;
    }
  };

  const clear = () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview("");
    setElapsed(0);
    onChange("");
  };

  const playerSrc = value || localPreview;

  return (
    <div className="space-y-2 rounded-[8px] border border-dim/72 bg-white/36 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-ink/62">语音</p>
          <p className="mt-0.5 text-[11px] font-medium text-ink/42">
            {recording ? `录音中 ${formatSeconds(elapsed)} / ${formatSeconds(maxSeconds)}` : uploading ? "正在上传" : "最长 60 秒"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {playerSrc && !recording && (
            <button
              className="grid h-9 w-9 place-items-center rounded-[7px] text-ink/58 transition hover:bg-sakura/45 hover:text-rose-ink disabled:opacity-40"
              type="button"
              onClick={clear}
              disabled={disabled || uploading}
              aria-label="删除语音"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            className={recording ? "grid h-9 w-9 place-items-center rounded-[7px] bg-rose-ink text-white" : "grid h-9 w-9 place-items-center rounded-[7px] bg-slate text-white transition active:scale-95 disabled:opacity-45"}
            type="button"
            onClick={recording ? stop : start}
            disabled={disabled || uploading}
            aria-label={recording ? "停止录音" : "开始录音"}
          >
            {uploading ? <Upload className="h-4 w-4" /> : recording ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {playerSrc && !recording && <VoicePlayer src={playerSrc} compact />}
    </div>
  );
}
