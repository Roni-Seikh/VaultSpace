"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/client/api";
import { supabaseBrowser } from "@/lib/supabase/browser";

export function DeleteAccount() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true); setError(null);
    try {
      await api("/api/account", { method: "DELETE", body: { confirm: "DELETE" } });
      await supabaseBrowser().auth.signOut().catch(() => undefined);
      router.push("/");
      router.refresh();
    } catch (e) { setError(errorMessage(e)); setBusy(false); }
  }

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}><Trash2 className="h-4 w-4" />Delete my account</Button>
      <Dialog open={open} onClose={() => { setOpen(false); setText(""); setError(null); }} title="Delete your account?" size="sm"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" loading={busy} disabled={text !== "DELETE"} onClick={confirm}>Delete everything</Button></>}>
        <div className="space-y-4 text-sm text-muted">
          <p>This permanently deletes your account, all files and versions, folders, share links and history. <strong className="text-fg">It cannot be undone</strong> and we cannot recover your data afterwards.</p>
          <Field label='Type "DELETE" to confirm' value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
          {error && <p role="alert" className="text-danger">{error}</p>}
        </div>
      </Dialog>
    </>
  );
}
