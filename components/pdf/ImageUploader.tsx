"use client";

import { useRef, useState } from "react";

export default function ImageUploader({ onAdd }: { onAdd: (file: File, caption: string) => Promise<void> | void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || !files[0]) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) return;
    setBusy(true);
    try {
      await onAdd(file, caption.trim());
      setCaption("");
      if (inputRef.current) inputRef.current.value = "";
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={(e) => handleFiles(e.target.files)}
          className="text-xs"
        />
        <button
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-zinc-700"
        >
          {busy ? "Enviando…" : "Selecionar"}
        </button>
      </div>
      <input
        type="text"
        placeholder="Legenda/nota da imagem"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        className="mt-2 w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-zinc-500 dark:border-zinc-700"
      />
    </div>
  );
}


