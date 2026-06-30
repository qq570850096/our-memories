"use client";

import { useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

type VoicePlayerProps = {
  src?: string;
  label?: string;
  compact?: boolean;
};

const bars = [0.36, 0.72, 0.48, 0.9, 0.58, 0.76, 0.42, 0.84, 0.52, 0.68, 0.4, 0.78];

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

export function VoicePlayer({ src, label = "语音", compact = false }: Readonly<VoicePlayerProps>) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  if (!src) return null;

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    await audio.play().catch(() => null);
  };

  return (
    <div className={compact ? "inline-flex items-center gap-2" : "flex items-center gap-3 rounded-[8px] border border-dim/72 bg-cream/72 px-3 py-2"}>
      <audio
        key={src}
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration);
          setCurrentTime(0);
          setPlaying(false);
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
      />
      <button
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate text-white transition active:scale-95"
        type="button"
        onClick={toggle}
        aria-label={playing ? "暂停语音" : "播放语音"}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
      </button>
      <div className={compact ? "min-w-24" : "min-w-0 flex-1"}>
        {!compact && <p className="mb-1 text-xs font-semibold text-ink/62">{label}</p>}
        <div className="flex h-7 items-center gap-1" aria-hidden="true">
          {bars.map((height, index) => {
            const active = index / bars.length <= progress;
            return (
              <span
                key={`voice-bar-${index}`}
                className={active || playing ? "w-1 rounded-full bg-rose-ink" : "w-1 rounded-full bg-dim"}
                style={{ height: `${Math.round(height * 24)}px`, opacity: active ? 1 : playing ? 0.72 : 0.5 }}
              />
            );
          })}
        </div>
      </div>
      <span className="shrink-0 text-xs font-semibold tabular-nums text-ink/52">
        {formatTime(playing ? currentTime : duration)}
      </span>
    </div>
  );
}
