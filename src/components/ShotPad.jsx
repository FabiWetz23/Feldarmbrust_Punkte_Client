import React, { useMemo, useState } from "react";

const KEYS = [7, 8, 9, 4, 5, 6, 1, 2, 3, 0];

export default function ShotPad({ currentValue, onSet, onClear, min = 0, max = 10 }) {
  const [buffer, setBuffer] = useState("");

  const display = useMemo(() => {
    if (buffer !== "") return buffer;
    if (Number.isInteger(currentValue)) {
      if (currentValue === 11) return "⑩";
      return String(currentValue);
    }
    return "—";
  }, [buffer, currentValue]);

  function tap(n) {
    const next = (buffer + String(n)).slice(0, 2); // max 2 digits
    setBuffer(next);
    const asNum = Number(next);
    // Allow 11 for manual entry or button press
    if (Number.isInteger(asNum) && (asNum === 11 || (asNum >= min && asNum <= max))) {
      // Sofort setzen (Auto-Save)
      onSet(asNum);
      setBuffer("");
    }
  }

  return (
    <div>
      <div className="bigVal">{display}</div>

      <div className="numPad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(k => (
          <div
            key={k}
            className="key"
            onClick={() => tap(k)}
            onTouchEnd={(e) => { e.preventDefault(); tap(k); }}
          >
            {k}
          </div>
        ))}

        {/* Inner Ten (11) */}
        <div
          className="key"
          style={{ color: "var(--primary)", borderColor: "var(--primary)" }}
          onClick={() => { setBuffer(""); onSet(11); }}
          onTouchEnd={(e) => { e.preventDefault(); setBuffer(""); onSet(11); }}
        >
          ⑩
        </div>

        {/* Delete */}
        <div
          className="key"
          onClick={() => { setBuffer(""); onClear(); }}
          onTouchEnd={(e) => { e.preventDefault(); setBuffer(""); onClear(); }}
        >
          ⌫
        </div>
      </div>

      <div className="small" style={{ marginTop: 8 }}>
        Tap to save. ⌫ to clear.
      </div>
    </div>
  );
}
