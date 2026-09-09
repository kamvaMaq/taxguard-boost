import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MapPin, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { findTaxOffices, type TaxOffice } from "@/lib/places.functions";

type MapsWindow = Window & {
  google?: typeof globalThis & { maps?: unknown };
  __taxguardMapsReady?: boolean;
  __taxguardMapsInit?: () => void;
};

function loadMaps(): Promise<void> {
  const w = window as MapsWindow;
  if (w.__taxguardMapsReady) return Promise.resolve();
  const key = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"];
  const channel = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID"] ?? "";
  if (!key) return Promise.reject(new Error("The map is not configured yet."));

  return new Promise((resolve, reject) => {
    const existing = document.getElementById("taxguard-maps-js");
    if (existing) {
      existing.addEventListener("error", () => reject(new Error("The map failed to load.")));
      const poll = setInterval(() => {
        if (w.__taxguardMapsReady) {
          clearInterval(poll);
          resolve();
        }
      }, 100);
      return;
    }
    w.__taxguardMapsInit = () => {
      w.__taxguardMapsReady = true;
      resolve();
    };
    const script = document.createElement("script");
    script.id = "taxguard-maps-js";
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__taxguardMapsInit&channel=${channel}`;
    script.onerror = () => reject(new Error("The map failed to load."));
    document.head.appendChild(script);
  });
}

export function TaxOfficeLocator() {
  const search = useServerFn(findTaxOffices);
  const [place, setPlace] = useState("");
  const [busy, setBusy] = useState(false);
  const [offices, setOffices] = useState<TaxOffice[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!offices || offices.length === 0 || !mapEl.current) return;
    let cancelled = false;
    loadMaps()
      .then(() => {
        if (cancelled || !mapEl.current) return;
        const g = (window as any).google;
        const centre = { lat: offices[0].lat, lng: offices[0].lng };
        mapRef.current ??= new g.maps.Map(mapEl.current, { center: centre, zoom: 11 });
        mapRef.current.setCenter(centre);
        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current = offices.map(
          (o) =>
            new g.maps.Marker({
              map: mapRef.current,
              position: { lat: o.lat, lng: o.lng },
              title: o.name,
            }),
        );
      })
      .catch((err: Error) => toast.error(err.message));
    return () => {
      cancelled = true;
    };
  }, [offices]);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const value = place.trim();
    if (value.length < 2) {
      toast.error("Type a town, suburb or city first.");
      return;
    }
    setBusy(true);
    try {
      const results = await search({ data: { place: value } });
      setOffices(results);
      setSelected(results[0]?.id ?? null);
      if (results.length === 0) toast.info("No SARS branch found for that place. Try a bigger town.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not search right now.");
    } finally {
      setBusy(false);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      toast.error("Your browser will not share your location.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const results = await search({
            data: { place: `${pos.coords.latitude},${pos.coords.longitude}` },
          });
          setOffices(results);
          setSelected(results[0]?.id ?? null);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not search right now.");
        } finally {
          setBusy(false);
        }
      },
      () => {
        setBusy(false);
        toast.error("We could not read your location. Type a town instead.");
      },
    );
  }

  return (
    <div className="surface p-5">
      <h2 className="font-display text-xl font-semibold">Find your nearest SARS branch</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Some things still have to be done in person. Type where you are and we show the nearest
        offices on a map.
      </p>

      <form onSubmit={run} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1 space-y-2">
          <Label htmlFor="place">Town, suburb or city</Label>
          <Input
            id="place"
            value={place}
            placeholder="e.g. Soweto, Johannesburg"
            onChange={(e) => setPlace(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Search className="size-4" aria-hidden />
          )}
          Search
        </Button>
        <Button type="button" variant="outline" onClick={useMyLocation} disabled={busy}>
          <MapPin className="size-4" aria-hidden /> Use my location
        </Button>
      </form>

      {offices && offices.length > 0 ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <ul className="space-y-2">
            {offices.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(o.id);
                    if (mapRef.current) {
                      mapRef.current.setCenter({ lat: o.lat, lng: o.lng });
                      mapRef.current.setZoom(14);
                    }
                  }}
                  className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                    selected === o.id
                      ? "border-foreground/30 bg-muted"
                      : "border-border hover:bg-muted/60"
                  }`}
                >
                  <span className="block font-medium">{o.name}</span>
                  <span className="block text-xs text-muted-foreground">{o.address}</span>
                </button>
              </li>
            ))}
          </ul>
          <div
            ref={mapEl}
            role="application"
            aria-label="Map of nearby SARS branches"
            className="h-72 w-full rounded-xl border border-border bg-muted"
          />
        </div>
      ) : null}
    </div>
  );
}
