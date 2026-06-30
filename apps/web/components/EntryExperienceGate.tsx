"use client";

import { useEffect, useState, type ComponentType } from "react";
import MobileEntryExperience from "@/components/MobileEntryExperience";

export default function EntryExperienceGate() {
  const [mobile, setMobile] = useState(true);
  const [DesktopEntryExperience, setDesktopEntryExperience] = useState<ComponentType | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px), (pointer: coarse)");
    let cancelled = false;
    const loadDesktop = () => {
      void import("@/components/EntryExperience").then((mod) => {
        if (!cancelled) setDesktopEntryExperience(() => mod.default);
      });
    };
    const update = () => {
      setMobile(media.matches);
      if (!media.matches) loadDesktop();
    };
    update();
    media.addEventListener("change", update);
    return () => {
      cancelled = true;
      media.removeEventListener("change", update);
    };
  }, []);

  if (mobile || !DesktopEntryExperience) {
    return <MobileEntryExperience />;
  }

  return <DesktopEntryExperience />;
}
