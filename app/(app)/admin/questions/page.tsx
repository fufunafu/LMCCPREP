import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAdminQuestions } from "@/lib/admin-data";

const RIGHTS = ["original", "licensed", "verified", "unverified", "quarantined"];
const EXAMS = [["mccqe", "MCCQE"], ["usmle", "USMLE"]] as const;
const EDITORIAL = ["pending", "reviewed", "stale", "personal"];

function statusBadge(value: string) {
  const good = value === "original" || value === "licensed" || value === "verified" || value === "reviewed";
  const bad = value === "quarantined" || value === "stale";
  return <Badge className={good ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : bad ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100"}>{value}</Badge>;
}

export default async function AdminQuestionsPage({ searchParams }: { searchParams: Promise<{ exam?: string; subject?: string; rights?: string; editorial?: string; q?: string; page?: string }> }) {
  const params = await searchParams;
  const result = await listAdminQuestions({ ...params, page: Number(params.page ?? 1) || 1 });
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const pageHref = (page: number) => `/admin/questions?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, value]) => value)), page: String(page) })}`;
  return (
    <div className="space-y-4">
      <div className="flex gap-2 text-sm">{EXAMS.map(([id, label]) => <Link key={id} href={`/admin/questions?exam=${id}`} className={`rounded-lg border px-3 py-1.5 ${params.exam === id ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" : ""}`}>{label}</Link>)}<Link href="/admin/questions" className={`rounded-lg border px-3 py-1.5 ${!params.exam ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" : ""}`}>All exams</Link></div>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">{result.subjects.filter((subject) => !params.exam || subject.examId === params.exam).map((subject) => <Link key={subject.id} href={`/admin/questions?subject=${subject.id}`} className="rounded-xl border bg-background p-3 text-sm hover:border-emerald-600"><p className="font-medium">{subject.name}</p><p className="text-xs text-muted-foreground">{subject.approved} approved of {subject.total}</p></Link>)}</div>
      <form className="flex flex-wrap gap-2 text-sm">
        <input name="q" defaultValue={params.q ?? ""} placeholder="Search stem or QID" className="h-9 min-w-56 rounded-lg border bg-background px-3" />
        <input type="hidden" name="exam" value={params.exam ?? ""} /><select name="subject" defaultValue={params.subject ?? ""} className="h-9 rounded-lg border bg-background px-3"><option value="">All subjects</option>{result.subjects.filter((subject) => !params.exam || subject.examId === params.exam).map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>
        <select name="rights" defaultValue={params.rights ?? ""} className="h-9 rounded-lg border bg-background px-3"><option value="">Any rights status</option>{RIGHTS.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <select name="editorial" defaultValue={params.editorial ?? ""} className="h-9 rounded-lg border bg-background px-3"><option value="">Any editorial status</option>{EDITORIAL.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <button type="submit" className="h-9 rounded-lg bg-emerald-800 px-3 font-medium text-white hover:bg-emerald-900">Filter</button>
      </form>
      <p className="text-sm text-muted-foreground">{result.total} question{result.total === 1 ? "" : "s"} · page {result.page} of {pages}</p>
      <div className="overflow-x-auto rounded-xl border bg-background">
        <Table>
          <TableHeader><TableRow><TableHead>QID</TableHead><TableHead>Subject</TableHead><TableHead>Stem</TableHead><TableHead>Rights</TableHead><TableHead>Editorial</TableHead><TableHead>Source</TableHead></TableRow></TableHeader>
          <TableBody>{result.rows.map((row) => <TableRow key={row.qid}><TableCell><Link href={`/admin/questions/${row.qid}`} className="font-medium underline-offset-2 hover:underline">{row.qid}</Link></TableCell><TableCell className="text-xs">{row.subjectId}{row.topicId ? <div className="text-muted-foreground">{row.topicId}</div> : null}</TableCell><TableCell className="max-w-xl text-xs leading-5">{row.stem.length > 180 ? `${row.stem.slice(0, 180)}…` : row.stem}</TableCell><TableCell>{statusBadge(row.rights)}</TableCell><TableCell>{statusBadge(row.editorial)}</TableCell><TableCell className="text-xs">{row.source}</TableCell></TableRow>)}</TableBody>
        </Table>
      </div>
      {pages > 1 && <div className="flex gap-2 text-sm">{result.page > 1 && <Link href={pageHref(result.page - 1)} className="rounded-lg border px-3 py-1.5">Previous</Link>}{result.page < pages && <Link href={pageHref(result.page + 1)} className="rounded-lg border px-3 py-1.5">Next</Link>}</div>}
    </div>
  );
}
