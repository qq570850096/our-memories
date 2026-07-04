"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/authContext";

const NotificationBell = dynamic(() =>
  import("@/components/NotificationBell").then((mod) => mod.NotificationBell)
);
const PullToRefresh = dynamic(() =>
  import("@/components/PullToRefresh").then((mod) => mod.PullToRefresh)
);
const PushRegistration = dynamic(() =>
  import("@/components/PushRegistration").then((mod) => mod.PushRegistration)
);
const RealtimeBridge = dynamic(() =>
  import("@/components/RealtimeBridge").then((mod) => mod.RealtimeBridge)
);

export function AuthenticatedRuntime() {
  const { session } = useAuth();
  const pathname = usePathname();
  if (!session) return null;
  return (
    <>
      <PullToRefresh />
      <PushRegistration />
      <RealtimeBridge />
      {pathname.replace(/\/$/, "") === "/map" && <NotificationBell />}
    </>
  );
}
