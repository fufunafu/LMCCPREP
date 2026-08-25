"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { addUserQuestion } from "@/lib/actions";
import type { Subject } from "@/lib/types";

export function AuthorQuestion({ subjects }: { subjects: Subject[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [topicName, setTopicName] = useState("");
  const [stem, setStem] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [answer, setAnswer] = useState(0);
  const [explanation, setExplanation] = useState("");

  const setOption = (i: number, value: string) => setOptions((cur) => cur.map((o, idx) => (idx === i ? value : o)));
  const addOption = () => setOptions((cur) => (cur.length >= 6 ? cur : [...cur, ""]));
  const removeOption = (i: number) => setOptions((cur) => { const next = cur.filter((_, idx) => idx !== i); if (answer >= next.length) setAnswer(next.length - 1); return next; });

  const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
  const valid = subjectId && topicName.trim() && stem.trim() && cleanOptions.length >= 2 && cleanOptions.length === options.length && options[answer]?.trim() && explanation.trim();

  const submit = () => start(async () => {
    try {
      await addUserQuestion({
        subjectId, topicName: topicName.trim(), stem: stem.trim(),
        options: options.map((o) => o.trim()).filter(Boolean),
        answerIdx: answer, explanation: explanation.split(/\n\n+/).map((p) => p.trim()).filter(Boolean),
      });
      toast.success("Question added", { description: "It's now in your bank and available in sessions." });
      router.push("/questions");
    } catch (error) {
      toast.error("Could not save", { description: error instanceof Error ? error.message : "Please try again." });
    }
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <PageHeader eyebrow="Contribute" title="Add your own question" description="Write a question for a subject the bank is missing (e.g. Obstetrics & Gynecology). It's saved to your account and appears in your sessions and browser." />
      <div className="space-y-5">
        <Card><CardHeader><CardTitle className="text-base">Category</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="subject">Subject</Label><select id="subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="h-10 w-full rounded-lg border bg-background px-3 text-sm">{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="topic">Topic</Label><Input id="topic" value={topicName} onChange={(e) => setTopicName(e.target.value)} placeholder="e.g. Preeclampsia" /></div>
        </CardContent></Card>

        <Card><CardHeader><CardTitle className="text-base">Question</CardTitle></CardHeader><CardContent className="space-y-4">
          <div className="space-y-2"><Label htmlFor="stem">Clinical vignette / question</Label><Textarea id="stem" value={stem} onChange={(e) => setStem(e.target.value)} placeholder="A 28-year-old at 34 weeks gestation presents with..." className="min-h-32" /></div>
          <div className="space-y-2"><Label>Options. Tap the circle to mark the correct one</Label>
            {options.map((option, i) => (
              <div key={i} className="flex items-center gap-3">
                <button type="button" aria-label={`Mark option ${i + 1} correct`} aria-pressed={answer === i} onClick={() => setAnswer(i)} className={cn("grid size-7 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold", answer === i ? "border-emerald-800 bg-emerald-800 text-white" : "text-muted-foreground")}>{String.fromCharCode(65 + i)}</button>
                <Input value={option} onChange={(e) => setOption(i, e.target.value)} placeholder={`Option ${String.fromCharCode(65 + i)}`} />
                {options.length > 2 && <Button variant="ghost" size="icon" aria-label="Remove option" onClick={() => removeOption(i)}><Trash2 className="size-4" /></Button>}
              </div>
            ))}
            {options.length < 6 && <Button variant="outline" size="sm" onClick={addOption}><Plus className="size-4" />Add option</Button>}
          </div>
          <div className="space-y-2"><Label htmlFor="explanation">Explanation</Label><Textarea id="explanation" value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Explain why the answer is correct. Separate paragraphs with a blank line." className="min-h-32" /></div>
        </CardContent></Card>

        <div className="flex justify-end gap-3"><Button variant="outline" onClick={() => router.push("/questions")}>Cancel</Button><Button className="bg-emerald-800 hover:bg-emerald-900" disabled={!valid || pending} onClick={submit}>{pending ? "Saving…" : "Add question"}</Button></div>
      </div>
    </div>
  );
}
