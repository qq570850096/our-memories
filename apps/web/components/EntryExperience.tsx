"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowRight, Camera, Delete, Heart, KeyRound, LockKeyhole, MapPinned } from "lucide-react";
import { LocalPrivacyBadge, LocalPrivacyImage } from "@/components/LocalPrivacyImage";
import {
  appSettingsUpdatedEvent,
  readAppSettings,
  syncAppSettings,
  type AppSettings,
} from "@/data/appSettings";
import {
  loginPhotosUpdatedEvent,
  readLoginPhotoTexts,
  readLoginPhotos,
} from "@/data/loginPhotoStore";
import { login } from "@/lib/apiClient";

const passcodeLength = 4;
const loginPhotoVersion = "placeholder-20260601";
const loginPhotoPath = (fileName: string) => `/photos/login/${fileName}.jpg?v=${loginPhotoVersion}`;

const stamps = [
  {
    id: "hangzhou",
    city: "杭州",
    label: "春日湖畔",
    note: "风从西湖边吹过来，像把那一天重新翻开。",
    photo: loginPhotoPath("hangzhou"),
  },
  {
    id: "shanghai",
    city: "上海",
    label: "外滩傍晚",
    note: "灯亮起来的时候，城市像一张慢慢显影的照片。",
    photo: loginPhotoPath("shanghai"),
  },
  {
    id: "macau",
    city: "澳门",
    label: "旧城花影",
    note: "小巷、坡道和花影，都被收进同一只相框。",
    photo: loginPhotoPath("macau"),
  },
  {
    id: "hongkong",
    city: "香港",
    label: "夜色亮起",
    note: "海面反光的时候，回忆也跟着亮了一下。",
    photo: loginPhotoPath("hongkong"),
  },
  {
    id: "qingdao",
    city: "青岛",
    label: "海风经过",
    note: "海边的风把照片吹得很亮，也把时间吹慢了。",
    photo: loginPhotoPath("qingdao"),
  },
  {
    id: "zhengzhou",
    city: "郑州",
    label: "见面那天",
    note: "有些城市不是风景，是故事真正开始的地方。",
    photo: loginPhotoPath("zhengzhou"),
  },
  {
    id: "zhuhai",
    city: "珠海",
    label: "海边散步",
    note: "浪慢慢退下去，脚步和心跳都变轻了。",
    photo: loginPhotoPath("zhuhai"),
  },
  {
    id: "guangzhou",
    city: "广州",
    label: "旧街热气",
    note: "热气、灯光和街角的声音，拼成一张很近的照片。",
    photo: loginPhotoPath("guangzhou"),
  },
  {
    id: "jinan",
    city: "济南",
    label: "泉边小记",
    note: "水声很轻，像把回忆放进透明的玻璃瓶里。",
    photo: loginPhotoPath("jinan"),
  },
] as const;

const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "delete"] as const;

type Stamp = {
  id: (typeof stamps)[number]["id"];
  city: string;
  label: string;
  note: string;
  photo: string;
};

function PixelHeart() {
  return (
    <svg className="h-9 w-9 pixelated" viewBox="0 0 22 22" aria-hidden="true">
      <path
        d="M5 3h4v2h2V3h4v2h2v6h-2v2h-2v2h-2v2H9v-2H7v-2H5v-2H3V5h2z"
        fill="#F5DCE0"
      />
      <path
        d="M5 3h4v2H5v6H3V5h2zm10 0v2h2v6h-2V5h-4V3zm0 8v2h-2v2h-2v2H9v-2H7v-2H5v-2h2v2h2v2h2v-2h2v-2z"
        fill="#E8B8C2"
      />
      <path d="M7 5h2v2H7zm8 2h-2V5h2z" fill="#FAFBF7" />
    </svg>
  );
}

function KeyLabel({ value }: Readonly<{ value: (typeof keys)[number] }>) {
  if (value === "delete") return <Delete className="h-4 w-4" />;
  if (value === "clear") return <span className="text-xs font-semibold">清空</span>;
  return <span>{value}</span>;
}

function LoginPhoto({
  src,
  alt,
  className,
  fill,
  sizes,
  width,
  height,
  priority,
}: Readonly<{
  src: string;
  alt: string;
  className?: string;
  fill?: boolean;
  sizes?: string;
  width?: number;
  height?: number;
  priority?: boolean;
}>) {
  return (
    <LocalPrivacyImage
      className={className}
      src={src}
      alt={alt}
      fill={fill}
      sizes={sizes}
      width={width}
      height={height}
      priority={priority}
    />
  );
}

export default function EntryExperience() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings>({});
  const [loginPhotos, setLoginPhotos] = useState<Record<string, string>>({});
  const [loginPhotoTexts, setLoginPhotoTexts] = useState<AppSettings["loginPhotoTexts"]>({});
  const [activeId, setActiveId] = useState<Stamp["id"]>("hangzhou");
  const [spaceCode] = useState<string>("our-space-2026");
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "wrong" | "open">("idle");
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const smoothX = useSpring(pointerX, { stiffness: 80, damping: 22 });
  const smoothY = useSpring(pointerY, { stiffness: 80, damping: 22 });
  const driftX = useTransform(smoothX, [-0.5, 0.5], [-16, 16]);
  const driftY = useTransform(smoothY, [-0.5, 0.5], [-12, 12]);
  const reverseX = useTransform(smoothX, [-0.5, 0.5], [12, -12]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettings(readAppSettings());
      void syncAppSettings().then(setSettings).catch(() => {});
      void readLoginPhotos().then(setLoginPhotos).catch(() => setLoginPhotos({}));
      void readLoginPhotoTexts().then(setLoginPhotoTexts).catch(() => setLoginPhotoTexts({}));
    }, 0);

    const handleSettingsUpdate = (event: Event) => {
      const nextSettings = (event as CustomEvent<AppSettings>).detail;
      setSettings(nextSettings);
    };
    const handleLoginPhotosUpdate = () => {
      void readLoginPhotos().then(setLoginPhotos).catch(() => setLoginPhotos({}));
      void readLoginPhotoTexts().then(setLoginPhotoTexts).catch(() => setLoginPhotoTexts({}));
    };

    window.addEventListener(appSettingsUpdatedEvent, handleSettingsUpdate);
    window.addEventListener(loginPhotosUpdatedEvent, handleLoginPhotosUpdate);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(appSettingsUpdatedEvent, handleSettingsUpdate);
      window.removeEventListener(loginPhotosUpdatedEvent, handleLoginPhotosUpdate);
    };
  }, []);

  const loginStamps = useMemo<Stamp[]>(() => {
    return stamps.map((stamp) => ({
      ...stamp,
      city: loginPhotoTexts?.[stamp.id]?.city ?? settings.loginPhotoTexts?.[stamp.id]?.city ?? stamp.city,
      label: loginPhotoTexts?.[stamp.id]?.label ?? settings.loginPhotoTexts?.[stamp.id]?.label ?? stamp.label,
      photo: loginPhotos[stamp.id] ?? settings.loginPhotos?.[stamp.id] ?? stamp.photo,
    }));
  }, [loginPhotoTexts, loginPhotos, settings.loginPhotoTexts, settings.loginPhotos]);

  const activeStamp = loginStamps.find((stamp) => stamp.id === activeId) ?? loginStamps[0];

  const submitCode = async (nextCode: string) => {
    if (nextCode.length < passcodeLength || status === "checking" || status === "open") return;

    if (step === 1) {
      setStatus("checking");
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080"}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceCode, password: nextCode, userId: "me" }),
      }).catch(() => null);
      const data = (await res?.json().catch(() => null)) as { accessToken?: string } | null;

      if (res?.ok && data?.accessToken) {
        setStep(2);
        setStatus("idle");
      } else {
        setStatus("wrong");
        window.setTimeout(() => {
          setCode("");
          setStatus("idle");
        }, 560);
      }
      return;
    }

    if (step === 2 && selectedUserId) {
      setStatus("checking");
      if (await login(spaceCode, nextCode, selectedUserId).catch(() => false)) {
        setStatus("open");
        window.setTimeout(() => router.push("/map"), 720);
      } else {
        setStatus("wrong");
        window.setTimeout(() => {
          setCode("");
          setStatus("idle");
        }, 560);
      }
    }
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
      if (nextCode.length === passcodeLength) {
        void submitCode(nextCode);
      }
      return nextCode;
    });
  };

  return (
    <main
      className="login-stage relative h-[100dvh] overflow-hidden bg-[#F9F6EC] text-[#344451]"
      onPointerMove={(event) => {
        pointerX.set(event.clientX / window.innerWidth - 0.5);
        pointerY.set(event.clientY / window.innerHeight - 0.5);
      }}
    >
      <LocalPrivacyBadge />
      <div className="login-paper absolute inset-0" />
      <motion.div className="login-sun" style={{ x: reverseX }} aria-hidden="true" />
      <motion.div className="login-cloud login-cloud-a" style={{ x: driftX }} aria-hidden="true" />
      <motion.div className="login-cloud login-cloud-b" style={{ x: reverseX }} aria-hidden="true" />
      <div className="login-grid absolute inset-0" aria-hidden="true" />

      <section className="relative z-10 grid h-full min-h-0 w-full grid-cols-1 gap-3 overflow-hidden px-4 py-4 sm:px-6 lg:grid-cols-[minmax(360px,0.86fr)_minmax(520px,1.14fr)] lg:gap-5 lg:px-8">
        <motion.div
          className="login-panel flex min-h-0 min-w-0 max-w-full flex-col justify-between overflow-hidden rounded-[8px] border border-[#DCCFC1]/86 bg-[#FEFCF5]/74 p-4 shadow-[0_28px_80px_rgba(91,71,50,0.12)] backdrop-blur-xl sm:p-5"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.58 }}
        >
          <div className="min-h-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <PixelHeart />
                <div>
                  <p className="text-lg font-semibold leading-tight text-[#273846]">我们的回忆</p>
                  <p className="mt-0.5 text-xs font-semibold text-[#8A796C]">private memories</p>
                </div>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded-full border border-[#F5DCE0] bg-[#F5DCE0]/58 text-[#D86F82]">
                {status === "open" ? <Heart className="h-5 w-5 fill-[#D86F82]" /> : <LockKeyhole className="h-5 w-5" />}
              </span>
            </div>

            <div className="mt-5">
              <p className="text-[clamp(38px,7vw,74px)] font-semibold leading-[0.9] tracking-normal text-[#273846]">
                输入
                <span className="block text-[#D86F82]">纪念日</span>
              </p>
              <p className="mt-4 max-w-[430px] text-sm font-medium leading-7 text-[#61717A] sm:text-base">
                一扇只给我们的回忆门，密码藏在开始的那一天。
              </p>
            </div>

            <motion.div
              className="mt-5 w-full min-w-0 max-w-full rounded-[8px] border border-[#E1D3C6] bg-white/54 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]"
              animate={status === "wrong" ? { x: [-8, 8, -6, 6, 0] } : { x: 0 }}
              transition={{ duration: 0.34 }}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#8A796C]">
                  <KeyRound className="h-4 w-4 text-[#D86F82]" />
                  anniversary code
                </span>
                <span className={status === "wrong" ? "text-xs font-semibold text-[#D86F82]" : "text-xs font-semibold text-[#8A796C]/62"}>
                  {status === "open" ? "已解锁" : status === "checking" ? "验证中" : status === "wrong" ? "再想想" : step === 1 ? "4 digits" : "选择身份"}
                </span>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-2">
                {step === 1 ? (
                  <div className="col-span-2 text-center text-xs font-medium text-[#61717A]">
                    输入纪念日密码
                  </div>
                ) : (
                  <>
                    {(["me", "ta"] as const).map((userId) => (
                      <button
                        key={userId}
                        className={`rounded-[7px] border px-3 py-2 text-xs font-semibold transition ${
                          selectedUserId === userId
                            ? "border-[#E8B8C2] bg-[#F5DCE0]/70 text-[#D86F82]"
                            : "border-[#E1D3C6] bg-white/42 text-[#8A796C]"
                        }`}
                        type="button"
                        onClick={() => setSelectedUserId(userId)}
                        disabled={status === "checking" || status === "open"}
                      >
                        {userId === "me" ? "刘永伦" : "郭文盈"}
                      </button>
                    ))}
                  </>
                )}
              </div>

              <div className="grid grid-cols-[repeat(4,minmax(0,1fr))] gap-2">
                {Array.from({ length: passcodeLength }).map((_, index) => (
                  <span
                    className={index < code.length ? "login-code-dot is-filled" : "login-code-dot"}
                    key={`code-${index}`}
                  />
                ))}
              </div>

              <div className="mt-3 grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2">
                {keys.map((key) => (
                  <button
                    className="login-key grid h-11 place-items-center rounded-[8px] border border-[#E1D3C6] bg-[#FAFBF7]/76 text-base font-semibold text-[#344451] shadow-[0_8px_18px_rgba(91,71,50,0.05)] transition hover:-translate-y-0.5 hover:border-[#E8B8C2] hover:bg-white disabled:cursor-default disabled:opacity-54"
                    key={key}
                    type="button"
                    onClick={() => pressKey(key)}
                    disabled={status === "checking" || status === "open"}
                    aria-label={key === "delete" ? "删除一位" : key === "clear" ? "清空密码" : `输入 ${key}`}
                  >
                    <KeyLabel value={key} />
                  </button>
                ))}
              </div>
            </motion.div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <Link
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-[#DCCFC1] bg-white/52 px-4 text-sm font-semibold text-[#344451] transition hover:-translate-y-0.5 hover:bg-white"
              href="/memories"
            >
              <Camera className="h-4 w-4 text-[#D86F82]" />
              相册
            </Link>
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] bg-[#273846] px-4 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(39,56,70,0.18)] transition hover:-translate-y-0.5 hover:bg-[#D86F82]"
              type="button"
              onClick={() => void submitCode(code)}
              disabled={status === "checking" || status === "open" || (step === 2 && !selectedUserId)}
            >
              {status === "checking" ? "验证中" : step === 1 ? "下一步" : "解锁"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </motion.div>

        <motion.div
          className="relative hidden min-h-0 overflow-hidden rounded-[8px] border border-[#DCCFC1]/86 bg-[#161F27] shadow-[0_28px_80px_rgba(91,71,50,0.12)] lg:block"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.58, delay: 0.08 }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              className="absolute inset-0 overflow-hidden"
              key={activeStamp.id}
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.42 }}
            >
              <LoginPhoto
                className="h-full w-full object-cover opacity-42 saturate-[1.08]"
                src={activeStamp.photo}
                alt=""
                fill
                sizes="60vw"
                priority
              />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(22,31,39,0.84),rgba(22,31,39,0.24)_50%,rgba(22,31,39,0.72)),radial-gradient(circle_at_72%_22%,rgba(245,220,224,0.24),transparent_34%)]" />
            </motion.div>
          </AnimatePresence>

          <motion.div className="absolute inset-6" style={{ x: driftX, y: driftY }}>
            <div className="absolute left-0 top-0 max-w-[390px]">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/10 px-3 py-2 text-xs font-semibold text-white/76 backdrop-blur">
                  <Camera className="h-4 w-4 text-[#F5DCE0]" />
                  private album
                </div>
                <p className="mt-6 max-w-[360px] text-[clamp(48px,5.4vw,82px)] font-semibold leading-[0.88] tracking-normal text-white">
                  旧照片
                  <span className="block text-[#F5AFC0]">新地图</span>
                </p>
                <p className="mt-5 max-w-[320px] text-sm font-medium leading-7 text-white/62">
                  从过去出发，
                  <br />
                  去看我们走过的地方。
                </p>
              </div>
            </div>

            <div className="absolute bottom-[15%] right-[5%] top-[3%] w-[42%] min-w-[330px]">
              <AnimatePresence mode="wait">
                <motion.div
                  className="login-polaroid absolute inset-x-0 top-0 overflow-hidden rounded-[8px] border border-white/72 bg-[#FEFCF5] p-3 shadow-[0_34px_76px_rgba(0,0,0,0.34)]"
                  key={`${activeStamp.id}-polaroid`}
                  initial={{ opacity: 0, rotate: -2, y: 18 }}
                  animate={{ opacity: 1, rotate: 1.5, y: 0 }}
                  exit={{ opacity: 0, rotate: 3, y: -14 }}
                  transition={{ type: "spring", stiffness: 120, damping: 18 }}
                >
                  <div className="relative aspect-[4/5] overflow-hidden rounded-[6px] bg-[#D6E8F0]">
                    <LoginPhoto
                      className="h-full w-full object-cover"
                      src={activeStamp.photo}
                      alt={`${activeStamp.city} 旅行照片`}
                      fill
                      sizes="420px"
                      priority
                    />
                    <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#15212A]/52 to-transparent" />
                  </div>
                  <div className="flex items-end justify-between gap-3 px-1 pb-1 pt-3">
                    <div className="min-w-0">
                      <p className="text-2xl font-semibold leading-none text-[#273846]">{activeStamp.city}</p>
                      <p className="mt-2 text-sm font-medium text-[#61717A]">{activeStamp.label}</p>
                    </div>
                    <MapPinned className="h-6 w-6 text-[#D86F82]" />
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="absolute bottom-[5%] left-0 right-0 flex items-end justify-center gap-2.5 px-4">
              {loginStamps.map((stamp, index) => (
                <button
                  className={stamp.id === activeId ? "login-mini-photo is-active" : "login-mini-photo"}
                  key={stamp.id}
                  style={{ rotate: `${index % 2 === 0 ? -4 : 4}deg` }}
                  type="button"
                  onClick={() => setActiveId(stamp.id)}
                  onMouseEnter={() => setActiveId(stamp.id)}
                  onFocus={() => setActiveId(stamp.id)}
                  aria-label={`切换到${stamp.city}`}
                >
                  <LoginPhoto
                    className="h-full w-full rounded-[5px] object-cover"
                    src={stamp.photo}
                    alt=""
                    width={112}
                    height={82}
                  />
                  <span>{stamp.city}</span>
                </button>
              ))}
            </div>
          </motion.div>

          {status === "open" && (
            <motion.div
              className="absolute inset-0 z-20 grid place-items-center bg-[#FEFCF5]/70 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <motion.div
                className="rounded-[8px] border border-[#F5DCE0] bg-white/78 px-5 py-4 text-center shadow-[0_22px_56px_rgba(91,71,50,0.14)]"
                initial={{ scale: 0.92, y: 12 }}
                animate={{ scale: 1, y: 0 }}
              >
                <Heart className="mx-auto h-7 w-7 fill-[#D86F82] text-[#D86F82]" />
                <p className="mt-2 text-sm font-semibold text-[#344451]">正在打开地图</p>
              </motion.div>
            </motion.div>
          )}
        </motion.div>
      </section>
    </main>
  );
}
