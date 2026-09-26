"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Highlighter } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStudy } from "@/components/study-provider";
import { studyStore } from "@/lib/study-store";
import { addHighlight, anchorHighlight, highlightRange, resolveHighlight, spansOverlap, type TextHighlight } from "@/lib/text-highlights";

const EMPTY: TextHighlight[] = [];
const subscribe = () => () => {};
const supported = () => typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";
type SelectionAnchor = { anchor: TextHighlight; text: string; left: number; top: number };

export function QuestionHighlighter({ questionId, children }: { questionId: string; children: ReactNode }) {
  const { snapshot } = useStudy();
  const saved = snapshot?.highlights?.[questionId] ?? EMPTY;
  const root = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const name = `question-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const enabled = useSyncExternalStore(subscribe, supported, () => false);
  const [selection, setSelection] = useState<SelectionAnchor | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  useEffect(() => {
    const container = root.current;
    if (!enabled || !container) return;
    const paint = () => {
      const ranges: Range[] = [];
      for (const region of container.querySelectorAll<HTMLElement>("[data-highlight-region]")) {
        for (const item of saved.filter((h) => h.region === region.dataset.highlightRegion)) {
          const span = resolveHighlight(region.textContent ?? "", item);
          const range = span && highlightRange(region, span);
          if (range) ranges.push(range);
        }
      }
      CSS.highlights.set(name, new Highlight(...ranges));
    };
    paint();
    const observer = new MutationObserver(paint);
    observer.observe(container, { childList: true, characterData: true, subtree: true });
    return () => { observer.disconnect(); CSS.highlights.delete(name); };
  }, [enabled, name, saved]);

  useEffect(() => {
    if (!enabled) return;
    const readSelection = () => {
      if (toolbar.current?.contains(document.activeElement)) return;
      const selected = window.getSelection();
      if (!selected || selected.isCollapsed || selected.rangeCount !== 1) { setSelection(null); return; }
      const range = selected.getRangeAt(0);
      const element = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement;
      const region = element?.closest<HTMLElement>("[data-highlight-region]");
      if (!region || !root.current?.contains(region) || !region.contains(range.endContainer) || !selected.toString().trim()) { setSelection(null); return; }
      const before = document.createRange(); before.selectNodeContents(region); before.setEnd(range.startContainer, range.startOffset);
      const start = before.toString().length;
      const text = region.textContent ?? "";
      const rect = range.getBoundingClientRect();
      setSelection({ anchor: anchorHighlight(text, region.dataset.highlightRegion!, start, start + range.toString().length, "selection"), text,
        left: Math.max(8, Math.min(window.innerWidth - 256, rect.left)), top: Math.max(8, Math.min(window.innerHeight - 56, rect.bottom + 8)) });
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setSelection(null); window.getSelection()?.removeAllRanges(); } };
    document.addEventListener("selectionchange", readSelection);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", readSelection);
    window.addEventListener("scroll", readSelection, true);
    return () => { document.removeEventListener("selectionchange", readSelection); document.removeEventListener("keydown", escape); window.removeEventListener("resize", readSelection); window.removeEventListener("scroll", readSelection, true); };
  }, [enabled]);

  const overlaps = (item: TextHighlight) => {
    if (!selection || item.region !== selection.anchor.region) return false;
    const span = resolveHighlight(selection.text, item);
    return span !== null && spansOverlap(selection.anchor, span);
  };
  const persist = async (transform: (items: TextHighlight[]) => TextHighlight[]) => {
    if (!snapshot || pending.current) return;
    pending.current = true; setBusy(true);
    try {
      await studyStore.local((current) => {
        if (current.userId !== snapshot.userId || current.examId !== snapshot.examId) throw new Error("Your account or exam changed. Reopen this question.");
        return { ...current, highlights: { ...current.highlights, [questionId]: transform(current.highlights?.[questionId] ?? []) } };
      });
      setSelection(null); window.getSelection()?.removeAllRanges();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save this highlight. Please try again."); }
    finally { pending.current = false; setBusy(false); }
  };

  return <div ref={root}>
    <style>{`::highlight(${name}) { background-color: #bbf7d0; color: #14532d; } .dark ::highlight(${name}) { background-color: #166534; color: #dcfce7; }`}</style>
    {children}
    {selection && enabled && <div ref={toolbar} role="group" aria-label="Text highlighting" className="fixed z-50 flex items-center gap-1 rounded-xl border bg-background p-1.5 shadow-lg" style={{ left: selection.left, top: selection.top }} onPointerDown={(event) => event.preventDefault()}>
      <Button size="sm" disabled={busy} onClick={() => void persist((items) => addHighlight(items, { ...selection.anchor, id: crypto.randomUUID() }, selection.text))}><Highlighter />Highlight</Button>
      {saved.some(overlaps) && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void persist((items) => items.filter((h) => !overlaps(h)))}>Remove</Button>}
    </div>}
  </div>;
}
