import React, { useMemo, useState } from "react";

const KEYS = [7,8,9,4,5,6,1,2,3,0];

export default function ShotPad({ currentValue, onSet, onClear, min=0, max=10 }) {
  const [buffer, setBuffer] = useState("");

  const display = useMemo(() => {
    if (buffer !== "") return buffer;
    if (Number.isInteger(currentValue)) return String(currentValue);
    return "—";
  }, [buffer, currentValue]);

  function tap(n) {
    const next = (buffer + String(n)).slice(0, 2); // max 2 digits
    setBuffer(next);
    const asNum = Number(next);
    if (Number.isInteger(asNum) && asNum >= min && asNum <= max) {
      // Sofort setzen (Auto-Save)
      onSet(asNum);
      setBuffer("");
    }
  }

  return (
    <div>
      <div className="bigVal">{display}</div>

      <div className="numPad">
        {KEYS.map(k => (
          <div key={k} className="key" onClick={() => tap(k)}>{k}</div>
        ))}
        <div className="key" onClick={() => { setBuffer(""); onClear(); }}>⌫</div>
        <div className="key" onClick={() => { setBuffer(""); onSet(10); }}>10</div>
      </div>

      <div className="small" style={{ marginTop: 8 }}>
        Tippen = speichern. ⌫ löscht den Wert.
      </div>
    </div>
  );
}
