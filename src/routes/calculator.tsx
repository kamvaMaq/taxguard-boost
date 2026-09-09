import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "@/components/StatCard";
import { Disclaimer } from "@/components/Disclaimer";
import { useTaxConfig } from "@/hooks/useTaxData";
import { calculateAnnualTax } from "@/lib/tax-engine";
import { rands, percent } from "@/lib/format";

export const Route = createFileRoute("/calculator")({
  head: () => ({
    meta: [
      { title: "South African tax calculator — TaxGuard SA" },
      {
        name: "description",
        content:
          "Estimate your annual tax, monthly PAYE and take-home pay using current South African brackets and rebates. No sign-up needed.",
      },
      { property: "og:title", content: "South African tax calculator — TaxGuard SA" },
      {
        property: "og:description",
        content: "Estimate annual tax, monthly PAYE and take-home pay. Free, no sign-up.",
      },
    ],
  }),
  component: CalculatorPage,
});

/** Returns a plain-language problem with the value, or null when it is usable. */
function moneyError(value: string, label: string, required = false): string | null {
  const trimmed = value.trim();
  if (!trimmed) return required ? `Enter your ${label}.` : null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return `${label} must be a number, like 25000 or 25000.50.`;
  const n = Number(trimmed);
  if (n < 0) return `${label} cannot be negative.`;
  if (n > 100_000_000) return `${label} looks too large. Please check it.`;
  return null;
}

function CalculatorPage() {
  const { data } = useTaxConfig();
  const [basis, setBasis] = useState<"monthly" | "annual">("monthly");
  const [amount, setAmount] = useState("");
  const [bonus, setBonus] = useState("");
  const [other, setOther] = useState("");
  const [age, setAge] = useState("");

  const config = data?.active ?? null;

  const errors = useMemo(() => {
    const ageTrimmed = age.trim();
    let ageError: string | null = null;
    if (!ageTrimmed) ageError = "Enter your age.";
    else if (!/^\d{1,3}$/.test(ageTrimmed)) ageError = "Age must be a whole number.";
    else if (Number(ageTrimmed) < 16 || Number(ageTrimmed) > 120)
      ageError = "Enter an age between 16 and 120.";
    return {
      amount: moneyError(amount, "salary or business profit", true),
      bonus: moneyError(bonus, "yearly bonus"),
      other: moneyError(other, "other yearly income"),
      age: ageError,
    };
  }, [amount, bonus, other, age]);

  const hasErrors = Object.values(errors).some(Boolean);

  const result = useMemo(() => {
    if (!config || hasErrors) return null;
    const base = Number(amount);
    const annualBase = basis === "monthly" ? base * 12 : base;
    const annual = annualBase + Number(bonus || 0) + Number(other || 0);
    return { annual, calc: calculateAnnualTax(config, annual, Number(age)) };
  }, [config, amount, basis, bonus, other, age, hasErrors]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to="/">
          <ArrowLeft className="size-4" aria-hidden /> Back
        </Link>
      </Button>
      <h1 className="font-display text-3xl font-semibold">Tax calculator</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        South Africa uses progressive tax brackets — think of a staircase. You only pay the higher
        rate on the portion of income that lands on that higher step, not on everything you earn.
        Nothing here is saved.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="surface space-y-4 p-5">
          <div className="space-y-2">
            <Label htmlFor="basis">Is that amount monthly or yearly?</Label>
            <Select value={basis} onValueChange={(v) => setBasis(v as "monthly" | "annual")}>
              <SelectTrigger id="basis">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="annual">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">Salary or business profit (R)</Label>
            <Input
              id="amount"
              inputMode="decimal"
              placeholder="Enter the amount"
              aria-invalid={!!errors.amount}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {errors.amount ? (
              <p className="text-xs text-destructive">{errors.amount}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="bonus">Yearly bonus (R)</Label>
            <Input
              id="bonus"
              inputMode="decimal"
              placeholder="Leave blank if none"
              aria-invalid={!!errors.bonus}
              value={bonus}
              onChange={(e) => setBonus(e.target.value)}
            />
            {errors.bonus ? <p className="text-xs text-destructive">{errors.bonus}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="other">Other yearly income (R)</Label>
            <Input
              id="other"
              inputMode="decimal"
              placeholder="Leave blank if none"
              aria-invalid={!!errors.other}
              value={other}
              onChange={(e) => setOther(e.target.value)}
            />
            {errors.other ? <p className="text-xs text-destructive">{errors.other}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="age">Your age</Label>
            <Input
              id="age"
              inputMode="numeric"
              placeholder="Enter your age"
              aria-invalid={!!errors.age}
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
            {errors.age ? <p className="text-xs text-destructive">{errors.age}</p> : null}
            <p className="text-xs text-muted-foreground">
              Age matters because of rebates (a fixed amount subtracted from your tax) that increase
              at 65 and again at 75.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {!config ? (
            <div className="surface p-5 text-sm text-muted-foreground">
              Loading the tax tables…
            </div>
          ) : result ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Taxable income (year)" value={rands(result.annual, 0)} />
                <StatCard
                  label="Estimated tax (year)"
                  value={rands(result.calc.annualTax, 0)}
                  tone="primary"
                />
                <StatCard
                  label="Estimated monthly PAYE"
                  value={rands(result.calc.monthlyTax, 0)}
                  tone="primary"
                />
                <StatCard
                  label="Estimated take-home (month)"
                  value={rands(result.annual / 12 - result.calc.monthlyTax, 0)}
                  tone="success"
                />
              </div>
              <div className="surface space-y-2 p-5 text-sm">
                <p className="font-medium">How we got there ({config.tax_year} tables)</p>
                <p className="text-muted-foreground">
                  Tax before rebates: {rands(result.calc.taxBeforeRebates, 0)} · Rebates:{" "}
                  −{rands(result.calc.rebate, 0)} · Tax for the year:{" "}
                  {rands(result.calc.annualTax, 0)}.
                </p>
                <p className="text-muted-foreground">
                  Your top step (marginal rate) is {percent(result.calc.marginalRate, 0)}, but you
                  only pay that on the income sitting on that step. Overall you pay about{" "}
                  {percent(result.calc.effectiveRate)} of your income in tax.
                </p>
                {result.calc.belowThreshold ? (
                  <p className="text-success">
                    This is below the tax threshold of {rands(result.calc.threshold, 0)} for your
                    age, so no income tax is estimated.
                  </p>
                ) : null}
              </div>
              {data?.stale ? (
                <div className="surface border-warning p-4 text-sm text-muted-foreground">
                  These tables were written for {config.tax_year}. We are now in a different tax
                  year — check the current SARS figures before relying on this.
                </div>
              ) : null}
            </>
          ) : (
            <div className="surface p-5 text-sm text-muted-foreground">
              Fill in your amount and your age on the left and the estimate appears here. Nothing is
              filled in for you, so every figure you see comes from what you typed.
            </div>
          )}
          <Disclaimer compact />
        </div>
      </div>
    </div>
  );
}
