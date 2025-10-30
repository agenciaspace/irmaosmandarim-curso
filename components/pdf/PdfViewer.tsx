"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { useDropzone } from "react-dropzone";
import localforage from "localforage";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import ImageUploader from "./ImageUploader";

// Configure PDF.js worker for Next.js bundling
// This must run in the browser
pdfjs.GlobalWorkerOptions.workerSrc =
  "https://unpkg.com/pdfjs-dist@5.4.296/build/pdf.worker.min.mjs";

type Source =
  | { kind: "empty" }
  | { kind: "file"; file: File }
  | { kind: "url"; url: string };

export default function PdfViewer() {
  const [source, setSource] = useState<Source>({ kind: "empty" });
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
  const [error, setError] = useState<string>("");
  const [docId, setDocId] = useState<string>("");
  const [pageNote, setPageNote] = useState<string>("");
  const [globalNote, setGlobalNote] = useState<string>("");
  const fileHashRef = useRef<string>("");

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles[0]) {
      setSource({ kind: "file", file: acceptedFiles[0] });
      setError("");
      setPageNumber(1);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { "application/pdf": [".pdf"] },
  });

  const documentFile = useMemo(() => {
    if (source.kind === "file") return source.file;
    if (source.kind === "url") return source.url;
    return undefined;
  }, [source]);

  function onDocumentLoadSuccess({ numPages: nextNumPages }: { numPages: number }) {
    setNumPages(nextNumPages);
    setPageNumber(1);
  }

  function loadFromUrl(input: string) {
    const url = input.trim();
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (!/\.pdf($|\?)/i.test(parsed.pathname)) {
        setError("O link não parece ser um PDF.");
        return;
      }
      setSource({ kind: "url", url });
      setError("");
      setPageNumber(1);
    } catch {
      setError("URL inválida.");
    }
  }

  const canPrev = pageNumber > 1;
  const canNext = numPages ? pageNumber < numPages : false;

  // Compute a persistent document id for storage
  useEffect(() => {
    async function computeId() {
      if (source.kind === "url") {
        setDocId(`url:${source.url}`);
        return;
      }
      if (source.kind === "file") {
        try {
          const buffer = await source.file.arrayBuffer();
          const digest = await crypto.subtle.digest("SHA-256", buffer);
          const hashArray = Array.from(new Uint8Array(digest));
          const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
          fileHashRef.current = hashHex;
          setDocId(`file:${hashHex}`);
        } catch {
          setDocId(`file:${source.file.name}`);
        }
      } else {
        setDocId("");
      }
    }
    computeId();
  }, [source]);

  // Load persisted state (page, notes) when docId or page changes
  useEffect(() => {
    if (!docId) return;
    try {
      const raw = localStorage.getItem(`pdf:${docId}:state`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.lastPage && typeof parsed.lastPage === "number") {
          setPageNumber(parsed.lastPage);
        }
        if (parsed.globalNote) setGlobalNote(parsed.globalNote);
        const note = parsed.pageNotes?.[String(pageNumber)] ?? "";
        setPageNote(note);
      } else {
        setPageNote("");
        setGlobalNote("");
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  useEffect(() => {
    if (!docId) return;
    try {
      const raw = localStorage.getItem(`pdf:${docId}:state`);
      const parsed = raw ? JSON.parse(raw) : {};
      const next = {
        ...parsed,
        lastPage: pageNumber,
      };
      localStorage.setItem(`pdf:${docId}:state`, JSON.stringify(next));
      // Load current page note whenever page changes
      const note = next.pageNotes?.[String(pageNumber)] ?? "";
      setPageNote(note);
    } catch {
      // ignore
    }
  }, [docId, pageNumber]);

  function savePageNote(value: string) {
    setPageNote(value);
    if (!docId) return;
    try {
      const raw = localStorage.getItem(`pdf:${docId}:state`);
      const parsed = raw ? JSON.parse(raw) : {};
      const pageNotes = parsed.pageNotes ?? {};
      pageNotes[String(pageNumber)] = value;
      const next = { ...parsed, pageNotes };
      localStorage.setItem(`pdf:${docId}:state`, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function saveGlobalNote(value: string) {
    setGlobalNote(value);
    if (!docId) return;
    try {
      const raw = localStorage.getItem(`pdf:${docId}:state`);
      const parsed = raw ? JSON.parse(raw) : {};
      const next = { ...parsed, globalNote: value };
      localStorage.setItem(`pdf:${docId}:state`, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  // Image uploads via IndexedDB (localforage)
  const [images, setImages] = useState<Array<{ id: string; page: number; caption: string; url: string }>>([]);

  useEffect(() => {
    if (!docId) return;
    async function loadImages() {
      const metaKey = `pdf:${docId}:images:meta`;
      const meta = (await localforage.getItem<any>(metaKey)) ?? { items: [] };
      const loaded: Array<{ id: string; page: number; caption: string; url: string }> = [];
      for (const item of meta.items as Array<{ id: string; page: number; caption: string }>) {
        const blob = await localforage.getItem<Blob>(`pdf:${docId}:image:${item.id}`);
        if (blob) {
          const url = URL.createObjectURL(blob);
          loaded.push({ ...item, url });
        }
      }
      setImages(loaded);
    }
    loadImages();
  }, [docId]);

  async function addImage(file: File, caption: string) {
    if (!docId) return;
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    const hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const id = `${hash}-${Date.now()}`;
    const metaKey = `pdf:${docId}:images:meta`;
    const item = { id, page: pageNumber, caption };
    const prev = (await localforage.getItem<any>(metaKey)) ?? { items: [] };
    await Promise.all([
      localforage.setItem(`pdf:${docId}:image:${id}`, new Blob([buffer], { type: file.type })),
      localforage.setItem(metaKey, { items: [item, ...prev.items] }),
    ]);
    const url = URL.createObjectURL(new Blob([buffer], { type: file.type }));
    setImages((imgs) => [{ ...item, url }, ...imgs]);
  }

  async function removeImage(id: string) {
    if (!docId) return;
    const metaKey = `pdf:${docId}:images:meta`;
    const prev = (await localforage.getItem<any>(metaKey)) ?? { items: [] };
    const nextItems = (prev.items as any[]).filter((i) => i.id !== id);
    await Promise.all([
      localforage.removeItem(`pdf:${docId}:image:${id}`),
      localforage.setItem(metaKey, { items: nextItems }),
    ]);
    setImages((imgs) => imgs.filter((i) => i.id !== id));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <div
          {...getRootProps()}
          className={[
            "flex cursor-pointer items-center justify-center rounded-xl border border-dashed p-6 text-center transition-colors",
            isDragActive
              ? "border-zinc-500 bg-zinc-50 dark:bg-zinc-900"
              : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700",
          ].join(" ")}
        >
          <input {...getInputProps()} />
          {isDragActive ? (
            <p>Solte o PDF aqui…</p>
          ) : (
            <p>
              Arraste um arquivo PDF ou clique para selecionar do seu dispositivo
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="url"
            placeholder="Ou cole um link de PDF (https://...)"
            className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                loadFromUrl((e.target as HTMLInputElement).value);
              }
            }}
          />
          <button
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            onClick={() => {
              const input = (document.activeElement as HTMLInputElement) ?? null;
              if (input && input.tagName === "INPUT") {
                loadFromUrl(input.value);
              }
            }}
          >
            Abrir
          </button>
        </div>
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <button
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-zinc-700"
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={!canPrev}
          >
            Página anterior
          </button>
          <button
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-zinc-700"
            onClick={() => setPageNumber((p) => (numPages ? Math.min(numPages, p + 1) : p + 1))}
            disabled={!canNext}
          >
            Próxima página
          </button>
          <span className="ml-2 text-sm text-zinc-600 dark:text-zinc-400">
            {numPages ? `Página ${pageNumber} de ${numPages}` : "Nenhum PDF carregado"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700"
            onClick={() => setScale((s) => Math.max(0.5, parseFloat((s - 0.1).toFixed(2))))}
          >
            −
          </button>
          <span className="w-14 text-center text-sm">{Math.round(scale * 100)}%</span>
          <button
            className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700"
            onClick={() => setScale((s) => Math.min(3, parseFloat((s + 0.1).toFixed(2))))}
          >
            +
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 flex justify-center rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
          {documentFile ? (
            <Document
              file={documentFile}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={(e) => setError(e?.message ?? "Falha ao carregar o PDF")}
              loading={<div className="p-12 text-sm text-zinc-500">Carregando…</div>}
              error={<div className="p-12 text-sm text-red-600">Erro ao carregar PDF</div>}
            >
              <Page pageNumber={pageNumber} scale={scale} renderTextLayer renderAnnotationLayer />
            </Document>
          ) : (
            <div className="p-12 text-sm text-zinc-500">Carregue um PDF para visualizar</div>
          )}
        </div>

        <aside className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Progresso e Anotações</h2>
          <div className="mb-4 text-xs text-zinc-600 dark:text-zinc-400">
            {numPages ? (
              <span>
                Progresso: página {pageNumber} de {numPages} ({Math.round((pageNumber / numPages) * 100)}%)
              </span>
            ) : (
              <span>Nenhum PDF carregado</span>
            )}
          </div>
          <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Nota desta página</label>
          <textarea
            className="mb-3 w-full rounded-lg border border-zinc-300 bg-transparent p-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
            rows={4}
            value={pageNote}
            onChange={(e) => savePageNote(e.target.value)}
            placeholder="Escreva suas anotações sobre esta página..."
          />
          <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Nota geral do livro</label>
          <textarea
            className="mb-3 w-full rounded-lg border border-zinc-300 bg-transparent p-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
            rows={3}
            value={globalNote}
            onChange={(e) => saveGlobalNote(e.target.value)}
            placeholder="Resumo, ideias principais, vocabulário novo..."
          />

          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Imagens e treinos</h3>
            <ImageUploader onAdd={addImage} />
            {images.length > 0 ? (
              <ul className="mt-3 grid grid-cols-2 gap-2">
                {images.map((img) => (
                  <li key={img.id} className="group relative overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
                    <img src={img.url} alt={img.caption || "imagem"} className="h-28 w-full object-cover" />
                    <div className="p-2">
                      <p className="line-clamp-2 text-xs text-zinc-700 dark:text-zinc-300">{img.caption}</p>
                      <p className="mt-1 text-[10px] text-zinc-500">Página {img.page}</p>
                    </div>
                    <button
                      className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => removeImage(img.id)}
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-zinc-500">Sem imagens ainda.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}


