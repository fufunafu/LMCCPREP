import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate } from "@/components/admin/stat";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminQuestion } from "@/lib/admin-data";

function text(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(text).join("\n\n");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(text).join("\n\n");
  return String(value);
}

export default async function AdminQuestionPage({ params }: { params: Promise<{ qid: string }> }) {
  const { qid } = await params;
  if (!/^\d+$/.test(qid)) notFound();
  const question = await getAdminQuestion(Number(qid));
  if (!question) notFound();
  const options = (question.options as unknown[]) ?? [];
  return (
    <div className="space-y-4">
      <Link href="/admin/questions" className="text-sm text-muted-foreground hover:text-foreground">← All questions</Link>
      <Card>
        <CardHeader><CardTitle className="flex flex-wrap items-center gap-2">Question {question.qid}<Badge variant="secondary">{question.subject_id}</Badge>{question.topicName && <Badge variant="outline">{question.topicName}</Badge>}</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="whitespace-pre-wrap leading-6">{question.stem}</p>
          <ol className="space-y-1">{options.map((option, index) => <li key={index} className={index === question.answer_index ? "font-semibold text-emerald-800 dark:text-emerald-300" : ""}>{index + 1}. {text(option)}{index === question.answer_index ? " ✓" : ""}</li>)}</ol>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Explanation</p><p className="mt-1 whitespace-pre-wrap leading-6">{text(question.explanation) || "—"}</p></div>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader><CardTitle>Rights and review</CardTitle></CardHeader><CardContent><dl className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Rights status</dt><dd>{question.distribution_rights_status}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Editorial status</dt><dd>{question.editorial_status}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Last reviewed</dt><dd>{formatDate(question.last_reviewed_at)}{question.reviewer_role ? ` (${question.reviewer_role})` : ""}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Source</dt><dd>{question.source}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Author / licence</dt><dd className="text-right">{question.content_author ?? "—"}{question.license_or_permission ? ` · ${question.license_or_permission}` : ""}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Needs review</dt><dd>{question.needs_review ? "Yes" : "No"}</dd></div>
          {question.review_note && <div><dt className="text-muted-foreground">Review note</dt><dd className="mt-1 whitespace-pre-wrap">{question.review_note}</dd></div>}
          {question.distribution_rights_note && <div><dt className="text-muted-foreground">Rights note</dt><dd className="mt-1 whitespace-pre-wrap">{question.distribution_rights_note}</dd></div>}
        </dl></CardContent></Card>
        <Card><CardHeader><CardTitle>Usage</CardTitle></CardHeader><CardContent><dl className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Attempts</dt><dd>{question.attemptCount}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Correct</dt><dd>{question.attemptCount ? `${Math.round((question.correctCount / question.attemptCount) * 100)}%` : "—"}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Has figure</dt><dd>{question.has_figure ? "Yes" : "No"}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Tags</dt><dd className="text-right">{((question.tags as string[] | null) ?? []).join(", ") || "—"}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Created</dt><dd>{formatDate(question.created_at)}</dd></div>
        </dl></CardContent></Card>
      </div>
    </div>
  );
}
