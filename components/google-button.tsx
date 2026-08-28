import { signInWithGoogle } from "@/lib/actions";
import { Button } from "@/components/ui/button";

function GoogleMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.7-5.5 3.7-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.9 1.5l2.6-2.6C16.9 3 14.7 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.7H12z" /></svg>;
}

/** Server-action form: one click starts the Supabase Google OAuth flow. */
export function GoogleButton({ next, label = "Continue with Google" }: { next: string; label?: string }) {
  return (
    <form action={signInWithGoogle}>
      <input type="hidden" name="next" value={next} />
      <Button type="submit" variant="outline" className="h-11 w-full gap-2 text-base"><GoogleMark />{label}</Button>
    </form>
  );
}
