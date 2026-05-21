import { useState } from "react";
import { Plus, X as XIcon, AlertTriangle, Loader2, Tag } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useDesignerCodes } from "@/hooks/useDesignerCodes";
import { useProfiles } from "@/hooks/useProfiles";
import {
  Card,
  CardContent,
  Badge,
  Button,
  Input,
  Label,
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
  ConfirmDialog,
  SkeletonText,
  EmptyState,
  toast,
} from "@/components/ui";
import { ROLE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { DesignerCode } from "@/types/database";

/**
 * DesignerCodesTab
 * --------------------------------------------------------------------------
 * One row per designer. Each row shows their assigned code letters as
 * removable pills, with an inline "Add Code" mini-form for adding new ones.
 *
 * The DB requires `joining_date` (non-null) on every code row — we use
 * "today" since the form here is for *adding* a code, not back-dating one.
 * Schema doesn't have a description field so we don't show one either.
 *
 * Uniqueness rule: a code letter must be unique across all designers (it's
 * the per-designer signal in task codes — sharing would break sequence
 * lookup). We do the duplicate check client-side before INSERT and surface
 * a clear error if the code is already taken.
 */
export function DesignerCodesTab() {
  const { codes, codesByProfile, isLoading, refetch } = useDesignerCodes();
  const { profiles, isLoading: profilesLoading } = useProfiles({
    roles: ["designer"],
  });

  const [removeCode, setRemoveCode] = useState<DesignerCode | null>(null);
  const [removing, setRemoving] = useState(false);

  const reload = () => void refetch();

  async function handleRemove() {
    if (!removeCode) return;
    setRemoving(true);
    const { error } = await supabase
      .from("designer_codes")
      .delete()
      .eq("id", removeCode.id);
    setRemoving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Code removed");
    setRemoveCode(null);
    reload();
  }

  /**
   * Returns the name of the designer who currently owns `code`, or null if
   * it's free. Used to give the conflict message a useful subject.
   */
  function codeOwner(code: string): string | null {
    const norm = code.trim().toUpperCase();
    const taken = codes.find((c) => c.code.toUpperCase() === norm);
    if (!taken) return null;
    return taken.profile?.full_name ?? "another designer";
  }

  async function handleAdd(profileId: string, code: string) {
    const norm = code.trim().toUpperCase();
    if (!norm) {
      toast.error("Code is required");
      return false;
    }
    if (norm.length > 2) {
      toast.error("Code must be 1–2 characters");
      return false;
    }
    const owner = codeOwner(norm);
    if (owner) {
      toast.error(`Code "${norm}" is already assigned to ${owner}`);
      return false;
    }
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from("designer_codes").insert({
      profile_id: profileId,
      code: norm,
      joining_date: today,
    });
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success(`Code "${norm}" added`);
    reload();
    return true;
  }

  const designers = profiles ?? [];
  const loading = isLoading || profilesLoading;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <header className="border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold text-foreground">
                Designer Codes
              </h3>
              <Badge variant="secondary" className="tabular-nums">
                {codes.length}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Letter codes used in task code generation (e.g.{" "}
              <span className="font-mono text-foreground">DF 01-K0526-FLOR-200M</span>).
              Each designer needs at least one unique code.
            </p>
          </header>

          {loading ? (
            <div className="p-5">
              <SkeletonText lines={4} />
            </div>
          ) : designers.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No designers in the team"
                description="Codes are assigned per designer — once you have designer accounts they'll appear here."
              />
            </div>
          ) : (
            <ul>
              {designers.map((d) => (
                <DesignerRow
                  key={d.id}
                  profile={d}
                  codes={codesByProfile.get(d.id) ?? []}
                  onAdd={(code) => handleAdd(d.id, code)}
                  onRemove={(c) => setRemoveCode(c)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/[0.04]">
        <CardContent className="flex items-start gap-3 p-4">
          <Tag className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="text-xs text-muted-foreground">
            Codes appear in every task code this designer creates. Removing a
            code doesn't change codes that have already been generated — those
            stay in the DB unchanged.
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!removeCode}
        title={`Remove code "${removeCode?.code}"?`}
        description="Existing task codes already using this letter stay unchanged. This only affects new tasks."
        variant="warning"
        confirmLabel={removing ? "Removing…" : "Remove"}
        onConfirm={() => void handleRemove()}
        onCancel={() => setRemoveCode(null)}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Per-designer row with code pills + inline add form
// ----------------------------------------------------------------------------

function DesignerRow({
  profile,
  codes,
  onAdd,
  onRemove,
}: {
  profile: {
    id: string;
    full_name: string;
    role: string;
    avatar_url: string | null;
  };
  codes: DesignerCode[];
  onAdd: (code: string) => Promise<boolean>;
  onRemove: (c: DesignerCode) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [codeDraft, setCodeDraft] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (saving) return;
    setSaving(true);
    const ok = await onAdd(codeDraft);
    setSaving(false);
    if (ok) {
      setCodeDraft("");
      setAddOpen(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-border/60 px-5 py-3 last:border-b-0">
      {/* Identity */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar className="h-8 w-8">
          {profile.avatar_url ? <AvatarImage src={profile.avatar_url} /> : null}
          <AvatarFallback className="text-xs">
            {getInitials(profile.full_name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {profile.full_name}
          </p>
          <Badge variant="secondary" className="text-[9px]">
            {ROLE_LABELS[profile.role as keyof typeof ROLE_LABELS] ?? profile.role}
          </Badge>
        </div>
      </div>

      {/* Codes — pill list with remove buttons */}
      <div className="flex flex-wrap items-center gap-1.5">
        {codes.length === 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
            <AlertTriangle className="h-3 w-3" />
            No code assigned
          </span>
        ) : (
          codes.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary"
            >
              {c.code}
              <button
                type="button"
                onClick={() => onRemove(c)}
                className="ml-0.5 rounded-full text-primary/60 hover:bg-primary/20 hover:text-primary"
                aria-label={`Remove code ${c.code}`}
              >
                <XIcon className="h-3 w-3" />
              </button>
            </span>
          ))
        )}

        {/* Add form / button */}
        {addOpen ? (
          <div className="ml-1 flex items-center gap-1.5">
            <Label className="sr-only" htmlFor={`code-${profile.id}`}>
              New code
            </Label>
            <Input
              id={`code-${profile.id}`}
              value={codeDraft}
              onChange={(e) => setCodeDraft(e.target.value.toUpperCase())}
              placeholder="A"
              maxLength={2}
              autoFocus
              className="h-7 w-16 font-mono text-xs uppercase"
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
                if (e.key === "Escape") {
                  setAddOpen(false);
                  setCodeDraft("");
                }
              }}
            />
            <Button
              size="sm"
              onClick={() => void submit()}
              disabled={saving}
              className="h-7 px-2 text-[11px]"
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Save"
              )}
            </Button>
            <button
              type="button"
              onClick={() => {
                setAddOpen(false);
                setCodeDraft("");
              }}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors",
              "hover:border-primary/40 hover:bg-primary/[0.04] hover:text-primary"
            )}
          >
            <Plus className="h-3 w-3" />
            Add code
          </button>
        )}
      </div>
    </li>
  );
}
