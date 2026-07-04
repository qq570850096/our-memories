"use client";

import { useEffect } from "react";
import { registerCurrentDeviceForPush } from "@/lib/pushRegistration";
import { useAuth } from "@/lib/authContext";

export function PushRegistration() {
  const { session } = useAuth();

  useEffect(() => {
    if (!session) return;
    registerCurrentDeviceForPush().catch(() => null);
  }, [session]);

  return null;
}
