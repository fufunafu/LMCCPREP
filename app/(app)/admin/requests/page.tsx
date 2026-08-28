import { formatDate } from "@/components/admin/stat";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAccessRequests } from "@/lib/admin-data";

export default async function AdminRequestsPage() {
  const requests = await listAccessRequests();
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{requests.length} request{requests.length === 1 ? "" : "s"} submitted through the public Request access form, newest first.</p>
      <div className="overflow-x-auto rounded-xl border bg-background">
        <Table>
          <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Name</TableHead><TableHead>Message</TableHead><TableHead>Received</TableHead></TableRow></TableHeader>
          <TableBody>{requests.map((request) => <TableRow key={request.id}><TableCell><a className="font-medium underline-offset-2 hover:underline" href={`mailto:${request.email}`}>{request.email}</a></TableCell><TableCell>{request.name ?? "—"}</TableCell><TableCell className="max-w-md whitespace-pre-wrap text-xs leading-5">{request.message ?? "—"}</TableCell><TableCell className="text-xs">{formatDate(request.created_at)}</TableCell></TableRow>)}</TableBody>
        </Table>
      </div>
    </div>
  );
}
