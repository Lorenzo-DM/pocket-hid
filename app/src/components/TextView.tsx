import { useState } from 'react';
import type { DeviceLink } from '../protocol/connection';

interface Props {
  conn: DeviceLink;
}

// Il firmware fase 1 mappa solo ASCII: contiamo i caratteri fuori range
// per avvisare l'utente (accentati ecc. verranno saltati dal firmware).

function countNonAscii(s: string): number {
  let n = 0;
  for (const ch of s) if (ch.codePointAt(0)! > 0x7e) n++;
  return n;
}

export function TextView({ conn }: Props) {
  const [text, setText] = useState('');

  const send = () => {
    if (!text) return;
    if (conn.send({ t: 'text', s: text })) setText('');
  };

  const nonAscii = countNonAscii(text);

  return (
    <div className="textview">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Scrivi qui la frase da inviare…"
        rows={6}
      />
      {nonAscii > 0 && (
        <p className="warn">
          ⚠ {nonAscii} carattere(i) non supportati dal firmware in questa fase
          (accentati, emoji…) verranno saltati.
        </p>
      )}
      <button className="primary" onClick={send} disabled={!text}>
        Invia
      </button>
    </div>
  );
}
