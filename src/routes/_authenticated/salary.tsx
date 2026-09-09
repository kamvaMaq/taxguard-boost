import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Disclaimer } from "@/components/Disclaimer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { extractPayslip } from "@/lib/ai.functions";
import { useAuth } from "@/hooks/useAuth";
import { useRefresh, useSalaryRecords, useTaxConfig } from "@/hooks/useTaxData";
import { estimateMonthlyPaye, payeStatus, payeStatusMeta } from "@/lib/tax-engine";
import { rands, monthLabel } from "@/lib/format";
import { taxYearFor } from "@/lib/tax-year";

export const Route = createFileRoute("/_authenticated/salary")({
  head: () => ({
    meta: [
      { title: "Salary & PAYE tracker — TaxGuard SA" },
      {
        name: "description",
        content:
          "Record each payslip and see whether the PAYE deducted matches what we estimate for that month.",
      },
      { property: "og:title", content: "Salary & PAYE tracker — TaxGuard SA" },
      {
        property: "og:description",
        content: "Catch a PAYE shortfall in the same month instead of a year later.",
      },
    ],
  }),
  component: SalaryPage,
});

const EMPTY = {
  period_month: new Date().toISOString().slice(0, 7),
  basic_salary: "",
  bonus: "",
  overtime: "",
  other_taxable_income: "",
  paye_deducted: "",
  uif: "",
  other_deductions: "",
  age: "",
};

const MONEY_FIELDS = [
  "basic_salary",
  "bonus",
  "overtime",
  "other_taxable_income",
  "paye_deducted",
  "uif",
  "other_deductions",
] as const;

function moneyError(value: string, label: string): string | null {
  const t = value.trim();
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return `${label} must be a number, like 21500 or 21500.50.`;
  if (Number(t) > 100_000_000) return `${label} looks too large. Please check it.`;
  return null;
}

function SalaryPage() {
  const { user } = useAuth();
  const uid = user?.id;
  const { data: records = [] } = useSalaryRecords(uid);
  const { data: config } = useTaxConfig();
  const refresh = useRefresh();
  const readPayslip = useServerFn(extractPayslip);
  const [form, setForm] = useState(EMPTY);
  const [payslip, setPayslip] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const n = (v: string) => Number(v || 0);
  const gross = n(form.basic_salary) + n(form.bonus) + n(form.overtime) + n(form.other_taxable_income);

  const errors = useMemo(() => {
    const out: Partial<Record<keyof typeof EMPTY, string>> = {};
    for (const key of MONEY_FIELDS) {
      const err = moneyError(form[key], "That amount");
      if (err) out[key] = err;
    }
    const age = form.age.trim();
    if (!age) out.age = "Enter your age.";
    else if (!/^\d{1,3}$/.test(age) || Number(age) < 16 || Number(age) > 120)
      out.age = "Enter an age between 16 and 120.";
    if (!form.basic_salary.trim()) out.basic_salary = "Enter the basic salary on the payslip.";
    if (!form.paye_deducted.trim())
      out.paye_deducted = "Enter the PAYE deducted, or 0 if nothing was taken off.";
    return out;
  }, [form]);

  const hasErrors = Object.keys(errors).length > 0;

  const preview = useMemo(() => {
    if (!config?.active || hasErrors || gross <= 0) return null;
    const est = estimateMonthlyPaye(config.active, gross, Number(form.age));
    const status = payeStatus(est.estimatedPaye, n(form.paye_deducted));
    return { est, status, meta: payeStatusMeta[status] };
  }, [config, gross, form.age, form.paye_deducted, hasErrors]);

  async function onPickPayslip(f: File | null) {
    setPayslip(f);
    setReadNote(null);
    if (!f || !f.type.startsWith("image/")) return;
    setReading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });
      const r = await readPayslip({ data: { imageDataUrl: dataUrl } });
      const s = (v: number | null) => (v == null ? "" : String(v));
      setForm((prev) => ({
        ...prev,
        period_month: r.period_month ?? prev.period_month,
        basic_salary: s(r.basic_salary) || prev.basic_salary,
        bonus: s(r.bonus) || prev.bonus,
        overtime: s(r.overtime) || prev.overtime,
        other_taxable_income: s(r.other_taxable_income) || prev.other_taxable_income,
        paye_deducted: s(r.paye_deducted) || prev.paye_deducted,
        uif: s(r.uif) || prev.uif,
        other_deductions: s(r.other_deductions) || prev.other_deductions,
      }));
      setReadNote(
        r.confident
          ? "We filled in what we could read. Check every figure against the slip before saving."
          : "Some figures were hard to read. Please check and correct them before saving.",
      );
      toast.success("Payslip read. Please confirm the figures.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that payslip.");
      setReadNote("We could not read that photo. Type the figures in yourself.");
    } finally {
      setReading(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!uid || !config?.active) return;
    if (hasErrors) {
      toast.error(Object.values(errors)[0] ?? "Please check the figures you entered.");
      return;
    }
    if (gross <= 0) {
      toast.error("Please enter at least a basic salary.");
      return;
    }
    setBusy(true);
    try {
      const est = estimateMonthlyPaye(config.active, gross, Number(form.age));
      const actual = n(form.paye_deducted);
      const status = payeStatus(est.estimatedPaye, actual);
      const periodDate = `${form.period_month}-01`;

      let payslipPath: string | null = null;
      if (payslip) {
        const path = `${uid}/payslips/${Date.now()}-${payslip.name.replace(/[^\w.-]/g, "_")}`;
        const { error } = await supabase.storage.from("receipts").upload(path, payslip);
        if (error) throw error;
        payslipPath = path;
      }

      const net =
        gross - actual - n(form.uif) - n(form.other_deductions);

      const { data: inserted, error } = await supabase
        .from("salary_records")
        .insert({
          user_id: uid,
          period_month: periodDate,
          tax_year: taxYearFor(periodDate),
          basic_salary: n(form.basic_salary),
          bonus: n(form.bonus),
          overtime: n(form.overtime),
          other_taxable_income: n(form.other_taxable_income),
          gross_salary: gross,
          paye_deducted: actual,
          estimated_paye: Math.round(est.estimatedPaye * 100) / 100,
          paye_difference: Math.round((est.estimatedPaye - actual) * 100) / 100,
          uif: n(form.uif),
          other_deductions: n(form.other_deductions),
          net_salary: net,
          tax_status: status,
          payslip_path: payslipPath,
        })
        .select()
        .single();
      if (error) throw error;

      if (status !== "aligned") {
        const meta = payeStatusMeta[status];
        await supabase.from("tax_alerts").insert({
          user_id: uid,
          related_record_id: inserted.id,
          alert_type: status,
          severity: status === "no_paye" ? "urgent" : status === "shortfall" ? "warning" : "info",
          period_label: monthLabel(periodDate),
          description: `${meta.label}. ${meta.note}`,
          estimated_amount: Math.round(est.estimatedPaye * 100) / 100,
          actual_amount: actual,
          difference: Math.round((est.estimatedPaye - actual) * 100) / 100,
          recommended_action:
            status === "over_deducted"
              ? "Keep your payslip. Check the figure with your payroll office — only SARS can confirm a refund."
              : "Review the payslip, confirm with your employer or payroll office, and consider setting the difference aside while you check.",
        });
      }

      toast.success("Payslip recorded.");
      setForm({ ...EMPTY, age: form.age });
      setPayslip(null);
      setReadNote(null);
      refresh(["salary", "alerts"]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that payslip.");
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof typeof EMPTY, label: string, hint?: string) => (
    <div className="space-y-2">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        inputMode="decimal"
        value={form[key]}
        aria-invalid={!!errors[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder="0"
      />
      {errors[key] ? <p className="text-xs text-destructive">{errors[key]}</p> : null}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Salary & PAYE"
        description="Add one payslip at a time. We estimate what PAYE (the tax your employer deducts monthly) should have been and compare it to what was actually taken off."
      />

      <div className="surface p-5">
        <Label htmlFor="payslip" className="mb-2 block">
          Photograph your payslip (optional)
        </Label>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            id="payslip"
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            className="max-w-sm"
            onChange={(e) => onPickPayslip(e.target.files?.[0] ?? null)}
          />
          {reading ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Reading your payslip…
            </span>
          ) : (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Camera className="size-4" aria-hidden /> We fill the form in for you — you confirm
              every figure before it is saved.
            </span>
          )}
        </div>
        {readNote ? <p className="mt-3 text-sm text-muted-foreground">{readNote}</p> : null}
        {payslip ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {payslip.name} will be attached to this month as proof.
          </p>
        ) : null}
      </div>

      <form onSubmit={save} className="surface grid gap-4 p-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="period_month">Month</Label>
          <Input
            id="period_month"
            type="month"
            value={form.period_month}
            onChange={(e) => setForm((f) => ({ ...f, period_month: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="age">Your age</Label>
          <Input
            id="age"
            inputMode="numeric"
            placeholder="Enter your age"
            aria-invalid={!!errors.age}
            value={form.age}
            onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
          />
          {errors.age ? <p className="text-xs text-destructive">{errors.age}</p> : null}
        </div>
        {field("basic_salary", "Basic salary (R)")}
        {field("bonus", "Bonus this month (R)")}
        {field("overtime", "Overtime (R)")}
        {field("other_taxable_income", "Other taxable income (R)")}
        {field("paye_deducted", "PAYE deducted (R)", "Enter 0 if nothing was deducted.")}
        {field("uif", "UIF (R)")}
        {field("other_deductions", "Other deductions (R)")}

        {preview ? (
          <div className="sm:col-span-2 rounded-xl bg-muted/60 p-4 text-sm">
            <p className="font-medium">
              Gross {rands(gross, 0)} · Estimated PAYE {rands(preview.est.estimatedPaye, 0)} ·
              Recorded PAYE {rands(n(form.paye_deducted), 0)}
            </p>
            <p className="mt-1 text-muted-foreground">
              {preview.meta.label}. {preview.meta.note}
            </p>
          </div>
        ) : null}

        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save this payslip"}
          </Button>
        </div>
      </form>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Salary history</h2>
        {records.length === 0 ? (
          <p className="surface p-5 text-sm text-muted-foreground">
            No payslips recorded yet. Start with the most recent one — you can add older months
            later.
          </p>
        ) : (
          <div className="space-y-2">
            {records.map((r) => {
              const meta = payeStatusMeta[r.tax_status as keyof typeof payeStatusMeta];
              return (
                <div key={r.id} className="surface flex flex-wrap items-center gap-4 p-4">
                  <div className="min-w-40">
                    <p className="font-medium">{monthLabel(r.period_month)}</p>
                    <p className="text-xs text-muted-foreground">Tax year {r.tax_year}</p>
                  </div>
                  <div className="num text-sm">
                    <p>Gross {rands(r.gross_salary, 0)}</p>
                    <p className="text-muted-foreground">Net {rands(r.net_salary, 0)}</p>
                  </div>
                  <div className="num text-sm">
                    <p>PAYE deducted {rands(r.paye_deducted, 0)}</p>
                    <p className="text-muted-foreground">
                      Estimated {rands(r.estimated_paye, 0)}
                    </p>
                  </div>
                  <Badge
                    variant={
                      meta?.tone === "destructive"
                        ? "destructive"
                        : meta?.tone === "success"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {meta?.label ?? r.tax_status}
                  </Badge>
                  {r.is_demo ? <Badge variant="outline">Demo</Badge> : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Disclaimer compact />
    </div>
  );
}
