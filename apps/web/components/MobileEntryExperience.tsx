"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Delete, Heart, LockKeyhole } from "lucide-react";
import { apiBaseUrl, login } from "@/lib/apiClient";
import { useAuth } from "@/lib/authContext";

const passcodeLength = 4;
const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "delete"] as const;

function PixelHeart() {
  return (
    <svg className="h-10 w-10 pixelated" viewBox="0 0 22 22" aria-hidden="true">
      <path
        d="M5 3h4v2h2V3h4v2h2v6h-2v2h-2v2h-2v2H9v-2H7v-2H5v-2H3V5h2z"
        fill="var(--color-sakura)"
      />
      <path
        d="M5 3h4v2H5v6H3V5h2zm10 0v2h2v6h-2V5h-4V3zm0 8v2h-2v2h-2v2H9v-2H7v-2H5v-2h2v2h2v2h2v-2h2v-2z"
        fill="var(--color-bloom)"
      />
      <path d="M7 5h2v2H7zm8 2h-2V5h2z" fill="var(--color-cream)" />
    </svg>
  );
}

function KeyLabel({ value }: Readonly<{ value: (typeof keys)[number] }>) {
  if (value === "delete") return <Delete className="h-4 w-4" />;
  if (value === "clear") return <span className="text-xs font-semibold">清空</span>;
  return <span>{value}</span>;
}

export default function MobileEntryExperience() {
  const router = useRouter();
  const { session } = useAuth();
  const [spaceCode] = useState("our-space-2026");
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "wrong" | "open">("idle");

  useEffect(() => {
    if (session?.accessToken) router.replace("/map");
  }, [router, session?.accessToken]);

  const submitCode = async (nextCode: string) => {
    if (nextCode.length < passcodeLength || status === "checking" || status === "open") return;

    if (step === 1) {
      setStatus("checking");
      const res = await fetch(`${apiBaseUrl()}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceCode, password: nextCode, userId: "me" }),
      }).catch(() => null);
      const data = (await res?.json().catch(() => null)) as { accessToken?: string } | null;
      if (res?.ok && data?.accessToken) {
        setStep(2);
        setStatus("idle");
        return;
      }
      setStatus("wrong");
      window.setTimeout(() => {
        setCode("");
        setStatus("idle");
      }, 420);
      return;
    }

    if (!selectedUserId) {
      setStatus("wrong");
      window.setTimeout(() => setStatus("idle"), 420);
      return;
    }

    setStatus("checking");
    if (await login(spaceCode, nextCode, selectedUserId).catch(() => false)) {
      setStatus("open");
      window.setTimeout(() => router.replace("/map"), 260);
      return;
    }
    setStatus("wrong");
    window.setTimeout(() => {
      setCode("");
      setStatus("idle");
    }, 420);
  };

  const pressKey = (key: (typeof keys)[number]) => {
    if (status === "checking" || status === "open") return;
    if (key === "clear") {
      setCode("");
      setStatus("idle");
      return;
    }
    if (key === "delete") {
      setCode((current) => current.slice(0, -1));
      setStatus("idle");
      return;
    }
    setCode((current) => {
      const nextCode = `${current}${key}`.slice(0, passcodeLength);
      if (nextCode.length === passcodeLength) void submitCode(nextCode);
      return nextCode;
    });
  };

  return (
    <main className="login-stage relative h-[100dvh] overflow-hidden bg-paper text-slate-soft">
      <div className="login-paper absolute inset-0" />
      <div className="login-grid absolute inset-0 opacity-50" aria-hidden="true" />
      <section className="relative z-10 flex h-full w-full items-center justify-center px-3 py-[calc(env(safe-area-inset-top)+0.75rem)]">
        <div
          className={`login-panel flex h-full max-h-[720px] w-full max-w-md flex-col justify-between overflow-hidden rounded-[8px] border border-warm-dim/86 bg-warm-cream/78 p-4 shadow-[0_28px_80px_rgba(91,71,50,0.12)] backdrop-blur-xl ${
            status === "wrong" ? "animate-[login-shake_0.34s_ease]" : ""
          }`}
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <PixelHeart />
                <div>
                  <p className="text-lg font-semibold leading-tight text-slate">我们的回忆</p>
                  <p className="mt-0.5 text-xs font-semibold text-clay">private memories</p>
                </div>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded-full border border-sakura bg-sakura/58 text-rose">
                {status === "open" ? <Heart className="h-5 w-5 fill-rose" /> : <LockKeyhole className="h-5 w-5" />}
              </span>
            </div>

            <div className="mt-7">
              <p className="text-[44px] font-semibold leading-[0.92] tracking-normal text-slate">
                输入
                <span className="block text-rose">纪念日</span>
              </p>
              <p className="mt-4 text-sm font-medium leading-7 text-ink-soft">
                一扇只给我们的回忆门，密码藏在开始的那一天。
              </p>
            </div>

            <div className="mt-6 rounded-[8px] border border-warm-border bg-white/54 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-clay">anniversary code</span>
                <span className={status === "wrong" ? "text-xs font-semibold text-rose" : "text-xs font-semibold text-clay/62"}>
                  {status === "open" ? "已解锁" : status === "checking" ? "验证中" : status === "wrong" ? "再想想" : step === 1 ? "4 digits" : "选择身份"}
                </span>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-2">
                {step === 1 ? (
                  <div className="col-span-2 text-center text-xs font-medium text-ink-soft">输入纪念日密码</div>
                ) : (
                  (["me", "ta"] as const).map((userId) => (
                    <button
                      key={userId}
                      className={`rounded-[7px] border px-3 py-2 text-xs font-semibold transition ${
                        selectedUserId === userId
                          ? "border-bloom bg-sakura/70 text-rose"
                          : "border-warm-border bg-white/42 text-clay"
                      }`}
                      type="button"
                      onClick={() => setSelectedUserId(userId)}
                      disabled={status === "checking" || status === "open"}
                    >
                      {userId === "me" ? "刘永伦" : "郭文盈"}
                    </button>
                  ))
                )}
              </div>

              <div className="grid grid-cols-[repeat(4,minmax(0,1fr))] gap-2">
                {Array.from({ length: passcodeLength }).map((_, index) => (
                  <span
                    className={index < code.length ? "login-code-dot is-filled" : "login-code-dot"}
                    key={`mobile-code-${index}`}
                  />
                ))}
              </div>

              <div className="mt-3 grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2">
                {keys.map((key) => (
                  <button
                    className="login-key grid h-12 place-items-center rounded-[8px] border border-warm-border bg-cream/76 text-base font-semibold text-slate-soft shadow-[0_8px_18px_rgba(91,71,50,0.05)] transition active:scale-[0.98] disabled:cursor-default disabled:opacity-54"
                    key={key}
                    type="button"
                    onClick={() => pressKey(key)}
                    disabled={status === "checking" || status === "open" || (step === 2 && !selectedUserId)}
                    aria-label={key === "delete" ? "删除一位" : key === "clear" ? "清空密码" : `输入 ${key}`}
                  >
                    <KeyLabel value={key} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-slate px-4 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(39,56,70,0.18)] transition active:scale-[0.99] disabled:opacity-50"
            type="button"
            onClick={() => void submitCode(code)}
            disabled={status === "checking" || status === "open" || (step === 2 && !selectedUserId)}
          >
            {status === "checking" ? "验证中" : step === 1 ? "下一步" : "解锁"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </main>
  );
}
