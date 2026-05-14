"use client";

import { useEffect, useState } from "react";
import { MobilePinGate } from "@/app/components/mobile/MobilePinGate";
import { MobileHome } from "@/app/components/mobile/MobileHome";

const SESSION_KEY = "rs_mobile_authed";

export default function MobilePage() {
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setAuthed(sessionStorage.getItem(SESSION_KEY) === "1");
    setReady(true);
  }, []);

  if (!ready) return null;

  const handleAuthenticated = () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    setAuthed(true);
  };

  return authed ? (
    <MobileHome />
  ) : (
    <MobilePinGate onAuthenticated={handleAuthenticated} />
  );
}
