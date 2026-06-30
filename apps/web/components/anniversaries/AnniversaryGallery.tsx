"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Music, Pause, Play, VolumeX, X } from "lucide-react";
import type { AnniversaryCard } from "@map-of-us/shared";
import { LocalPrivacyImg } from "@/components/LocalPrivacyImage";

type GalleryCard = AnniversaryCard & {
  bgmUrl?: string;
  bgmPreset?: string;
  voiceUrl?: string;
};

type AnniversaryGalleryProps = {
  card: GalleryCard | null;
  onClose: () => void;
};

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

const presetLabels: Record<string, string> = {
  first: "初见",
  travel: "远行",
  night: "晚安",
};

const presetNotes: Record<string, number[]> = {
  first: [392, 440, 494, 587, 494, 440],
  travel: [330, 392, 440, 523, 440, 392],
  night: [262, 330, 392, 330, 294, 262],
};

export function AnniversaryGallery({ card, onClose }: Readonly<AnniversaryGalleryProps>) {
  const [index, setIndex] = useState(0);
  const [musicOn, setMusicOn] = useState(false);
  const [musicBlocked, setMusicBlocked] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fadeTimerRef = useRef<number | undefined>(undefined);
  const presetPlayerRef = useRef<{
    context: AudioContext;
    gain: GainNode;
    oscillator: OscillatorNode;
    interval: number;
  } | null>(null);
  const photos = useMemo(() => {
    if (!card) return [];
    const values = card.photos?.length ? card.photos : card.image ? [card.image] : [];
    return Array.from(new Set(values));
  }, [card]);
  const bgmSrc = card?.bgmUrl ?? "";
  const presetKey = bgmSrc ? "" : card?.bgmPreset ?? "";

  const stopPreset = useCallback((fade = true) => {
    const player = presetPlayerRef.current;
    if (!player) return;
    window.clearInterval(player.interval);
    const now = player.context.currentTime;
    player.gain.gain.cancelScheduledValues(now);
    player.gain.gain.setValueAtTime(player.gain.gain.value, now);
    player.gain.gain.linearRampToValueAtTime(0, now + (fade ? 0.45 : 0.01));
    window.setTimeout(() => {
      player.oscillator.stop();
      void player.context.close();
      if (presetPlayerRef.current === player) presetPlayerRef.current = null;
    }, fade ? 480 : 20);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIndex(0);
      setMusicOn(false);
      setMusicBlocked(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [card?.id]);

  useEffect(() => {
    const audio = audioRef.current;
    window.clearInterval(fadeTimerRef.current);
    if (!bgmSrc) return;
    if (!audio) return;

    if (!musicOn || !bgmSrc) {
      const start = audio.volume;
      let step = 0;
      fadeTimerRef.current = window.setInterval(() => {
        step += 1;
        audio.volume = Math.max(0, start * (1 - step / 10));
        if (step >= 10) {
          audio.pause();
          window.clearInterval(fadeTimerRef.current);
        }
      }, 45);
      return;
    }

    audio.volume = 0;
    audio.loop = true;
    audio.play()
      .then(() => {
        setMusicBlocked(false);
        let step = 0;
        fadeTimerRef.current = window.setInterval(() => {
          step += 1;
          audio.volume = Math.min(0.72, 0.72 * (step / 12));
          if (step >= 12) window.clearInterval(fadeTimerRef.current);
        }, 45);
      })
      .catch(() => {
        setMusicBlocked(true);
        setMusicOn(false);
      });
  }, [bgmSrc, musicOn]);

  useEffect(() => {
    if (!presetKey || bgmSrc) {
      stopPreset();
      return;
    }
    if (!musicOn) {
      stopPreset();
      return;
    }
    const notes = presetNotes[presetKey];
    if (!notes?.length || typeof window === "undefined") return;
    const audioWindow = window as AudioWindow;
    const AudioContextClass = audioWindow.AudioContext || audioWindow.webkitAudioContext;
    if (!AudioContextClass) {
      const timer = window.setTimeout(() => {
        setMusicBlocked(true);
        setMusicOn(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    stopPreset(false);
    const context = new AudioContextClass();
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    let noteIndex = 0;
    oscillator.type = presetKey === "night" ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(notes[0], context.currentTime);
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(0.12, context.currentTime + 0.55);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    const interval = window.setInterval(() => {
      noteIndex = (noteIndex + 1) % notes.length;
      oscillator.frequency.setTargetAtTime(notes[noteIndex], context.currentTime, 0.08);
    }, 520);
    presetPlayerRef.current = { context, gain, oscillator, interval };

    return () => {
      stopPreset();
    };
  }, [bgmSrc, musicOn, presetKey, stopPreset]);

  useEffect(() => {
    const timer = fadeTimerRef.current;
    return () => {
      window.clearInterval(timer);
      stopPreset(false);
    };
  }, [stopPreset]);

  useEffect(() => {
    if (!card) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, onClose]);

  if (!card) return null;

  const activePhoto = photos[index] ?? "";
  const canMove = photos.length > 1;
  const move = (delta: number) => {
    if (!canMove) return;
    setIndex((current) => (current + delta + photos.length) % photos.length);
  };

  return (
    <div className="fixed inset-0 z-[90] bg-ink/92 text-cream">
      {bgmSrc ? <audio ref={audioRef} src={bgmSrc} preload="none" /> : null}
      <button
        className="absolute inset-0 cursor-default"
        type="button"
        onClick={onClose}
        aria-label="关闭画廊"
      />
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-b from-ink/78 to-transparent px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold">{card.title}</h2>
          <p className="mt-1 text-xs font-semibold text-cream/64">
            {[card.date, card.bgmPreset ? presetLabels[card.bgmPreset] : ""].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {(bgmSrc || presetKey) && (
            <button
              className="grid h-10 w-10 place-items-center rounded-[6px] border border-cream/18 bg-cream/10 text-cream transition hover:bg-cream/18"
              type="button"
              onClick={() => setMusicOn((value) => !value)}
              aria-label={musicOn ? "暂停背景音乐" : "播放背景音乐"}
            >
              {musicOn ? <Pause className="h-5 w-5" /> : <Music className="h-5 w-5" />}
            </button>
          )}
          <button
            className="grid h-10 w-10 place-items-center rounded-[6px] border border-cream/18 bg-cream/10 text-cream transition hover:bg-cream/18"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            aria-label="关闭画廊"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative z-10 grid h-full place-items-center px-0 py-20 sm:px-12">
        {activePhoto ? (
          <LocalPrivacyImg className="max-h-full w-full object-contain" src={activePhoto} alt={`${card.title} 画廊照片`} />
        ) : (
          <div className="grid h-full w-full place-items-center text-cream/52">没有照片</div>
        )}
      </div>

      {canMove && (
        <>
          <button
            className="absolute left-3 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-[6px] border border-cream/18 bg-cream/10 text-cream transition hover:bg-cream/18"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              move(-1);
            }}
            aria-label="上一张"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            className="absolute right-3 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-[6px] border border-cream/18 bg-cream/10 text-cream transition hover:bg-cream/18"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              move(1);
            }}
            aria-label="下一张"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-ink/82 to-transparent px-4 pb-5 pt-16">
        <div className="mx-auto max-w-3xl">
          {card.note && <p className="text-sm leading-7 text-cream/82">{card.note}</p>}
          <div className="mt-3 flex items-center justify-between gap-3 text-xs font-semibold text-cream/58">
            <span>{photos.length > 0 ? `${index + 1} / ${photos.length}` : "0 / 0"}</span>
            {musicBlocked ? (
              <span className="inline-flex items-center gap-1">
                <VolumeX className="h-3.5 w-3.5" />
                音乐需要手动播放
              </span>
            ) : bgmSrc ? (
              <span className="inline-flex items-center gap-1">
                {musicOn ? <Play className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                背景音乐默认关闭
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
