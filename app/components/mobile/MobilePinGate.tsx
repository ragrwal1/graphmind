"use client";

import { useState } from "react";
import { Delete } from "lucide-react";

const PIN_LENGTH = 4;

type Props = { onAuthenticated: () => void };

export function MobilePinGate({ onAuthenticated }: Props) {
  const [digits, setDigits] = useState<string[]>([]);

  const handleDigit = (d: string) => {
    if (digits.length >= PIN_LENGTH) return;
    const next = [...digits, d];
    setDigits(next);
    if (next.length === PIN_LENGTH) {
      onAuthenticated();
    }
  };

  const handleDelete = () => {
    setDigits((d) => d.slice(0, -1));
  };

  return (
    <div className="pin-gate">
      <div className="pin-gate-inner">
        <p className="pin-label">Enter passcode</p>
        <div className="pin-dots">
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <span
              key={i}
              className={`pin-dot ${i < digits.length ? "filled" : ""}`}
            />
          ))}
        </div>
        <div className="pin-keypad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
            <button key={d} className="pin-key" onClick={() => handleDigit(String(d))}>
              {d}
            </button>
          ))}
          <div className="pin-key-empty" />
          <button className="pin-key" onClick={() => handleDigit("0")}>
            0
          </button>
          <button className="pin-key pin-key-delete" onClick={handleDelete} aria-label="Delete">
            <Delete size={22} />
          </button>
        </div>
      </div>
    </div>
  );
}
