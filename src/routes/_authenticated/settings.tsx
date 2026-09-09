import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Disclaimer } from "@/components/Disclaimer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessProfile, useProfile, useRefresh, useTaxConfig } from "@/hooks/useTaxData";
import { LANGUAGE_OPTIONS } from "@/lib/languages";
import { currentTaxYear, taxYearFor } from "@/lib/tax-year";
import { estimateMonthlyPaye, payeStatus } from "@/lib/tax-engine";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — TaxGuard SA" },
      {
        name: "description",
        content: "Your details, your language, your business profile, and what TaxGuard stores about you.",
      },
      { property: "og:title", content: "Settings — TaxGuard SA" },
      { property: "og:description", content: "Your details, language and privacy choices." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const uid = user?.id;
  const { data: profile } = useProfile(uid);
  const { data: business } = useBusinessProfile(uid);
  const { data: config } = useTaxConfig();
  const refresh = useRefresh();

  const [p, setP] = useState({ full_name: "", preferred_language: "en", user_type: "employee" });
  const [b, setB] = useState({
    business_name: "",
    tax_election: "standard",
    vat_registered: false,
    estimated_annual_turnover: "",
  });
  const [busy, setBusy] = useState(false);
  

  useEffect(() => {
    if (profile)
      setP({
        full_name: profile.full_name ?? "",
        preferred_language: profile.preferred_language ?? "en",
        user_type: profile.user_type ?? "employee",
      });
  }, [profile]);

  useEffect(() => {
    if (business)
      setB({
        business_name: business.business_name ?? "",
        tax_election: business.tax_election ?? "standard",
        vat_registered: !!business.vat_registered,
        estimated_annual_turnover: business.estimated_annual_turnover
          ? String(business.estimated_annual_turnover)
          : "",
      });
  }, [business]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!uid) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: p.full_name || null,
        preferred_language: p.preferred_language,
        user_type: p.user_type,
      })
      .eq("id", uid);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh(["profile"]);
    toast.success("Saved.");
  }

  async function saveBusiness(e: React.FormEvent) {
    e.preventDefault();
    if (!uid) return;
    setBusy(true);
    const payload = {
      user_id: uid,
      business_name: b.business_name || "My business",
      tax_election: b.tax_election,
      vat_registered: b.vat_registered,
      estimated_annual_turnover: Number(b.estimated_annual_turnover || 0),
    };
    const { error } = business
      ? await supabase.from("business_profiles").update(payload).eq("user_id", uid)
      : await supabase.from("business_profiles").insert(payload);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh(["business-profile"]);
    toast.success("Business details saved.");
  }


  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Your details, your language and what we keep." />

      <form onSubmit={saveProfile} className="surface grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="font-display text-lg font-semibold sm:col-span-2">About you</h2>
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={p.full_name} onChange={(e) => setP({ ...p, full_name: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="language">Preferred language</Label>
          <Select value={p.preferred_language} onValueChange={(v) => setP({ ...p, preferred_language: v })}>
            <SelectTrigger id="language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="utype">What describes you best?</Label>
          <Select value={p.user_type} onValueChange={(v) => setP({ ...p, user_type: v })}>
            <SelectTrigger id="utype">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="employee">I earn a salary</SelectItem>
              <SelectItem value="business">I run a small business</SelectItem>
              <SelectItem value="both">Both — salary and a side business</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>
            Save my details
          </Button>
        </div>
      </form>

      <form onSubmit={saveBusiness} className="surface grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="font-display text-lg font-semibold sm:col-span-2">Your business</h2>
        <div className="space-y-2">
          <Label htmlFor="bname">Business name</Label>
          <Input id="bname" value={b.business_name} onChange={(e) => setB({ ...b, business_name: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="btype">How is your business taxed?</Label>
          <Select value={b.tax_election} onValueChange={(v) => setB({ ...b, tax_election: v })}>
            <SelectTrigger id="btype">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Normal income tax on profit</SelectItem>
              <SelectItem value="turnover">Turnover tax (worked out on sales)</SelectItem>
              <SelectItem value="unsure">I am not sure yet</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="turnover">Rough yearly turnover (R)</Label>
          <Input
            id="turnover"
            inputMode="decimal"
            value={b.estimated_annual_turnover}
            onChange={(e) => setB({ ...b, estimated_annual_turnover: e.target.value })}
          />
        </div>
        <div className="flex flex-col justify-end gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={b.vat_registered}
              onCheckedChange={(v) => setB({ ...b, vat_registered: !!v })}
            />
            I am registered for VAT
          </label>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>
            Save business details
          </Button>
        </div>
      </form>

      <section className="surface p-5">
        <h2 className="font-display text-lg font-semibold">Try it with example records</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Adds a few made-up payslips, deposits and receipts so you can see how everything works.
          Each one is labelled Demo and you can remove them all at once.
        </p>
        <div className="mt-3 flex gap-2">
          <Button onClick={loadDemo} disabled={demoBusy} variant="outline">
            {demoBusy ? "Working…" : "Load demo records"}
          </Button>
          <Button onClick={clearDemo} disabled={demoBusy} variant="ghost">
            Remove demo records
          </Button>
        </div>
      </section>

      <section className="surface p-5 text-sm">
        <h2 className="font-display text-lg font-semibold">What we keep, and what we never ask for</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Only you can see your records — they are locked to your account.</li>
          <li>Receipt and payslip photos are stored privately in your own folder.</li>
          <li>
            We never ask for your ID number, bank account number or eFiling password, and you should
            never type them here.
          </li>
          <li>
            Tax figures come from our tax tables for {config?.years.join(", ") ?? "the current year"}
            , not from a guess.
          </li>
        </ul>
        <p className="mt-3">Signed in as {user?.email}.</p>
      </section>

      <Disclaimer />
    </div>
  );
}
