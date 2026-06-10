"use client";

import { useEffect, useState } from "react";
import { adminModeUpdatedEvent, readAdminMode } from "@/data/adminMode";
import { readSession } from "@/lib/authStore";

export const readContentEditAccess = () => Boolean(readSession()) || readAdminMode();

export function useContentEditAccess() {
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    const update = () => setCanEdit(readContentEditAccess());
    const timer = window.setTimeout(update, 0);

    window.addEventListener(adminModeUpdatedEvent, update);
    window.addEventListener("storage", update);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(adminModeUpdatedEvent, update);
      window.removeEventListener("storage", update);
    };
  }, []);

  return canEdit;
}
