"use client";
import dynamic from "next/dynamic";

const PdfViewer = dynamic(() => import("@/components/pdf/PdfViewer"), { ssr: false });

export default function PdfPage() {
  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-8 dark:bg-black">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Leitor de PDF com Anotações
        </h1>
        <PdfViewer />
      </div>
    </div>
  );
}


