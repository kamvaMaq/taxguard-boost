import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

export type TaxOffice = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
};

/**
 * Finds SARS branches / tax offices near a place name the visitor typed.
 * Results come straight from Google Places — nothing is invented here.
 */
export const findTaxOffices = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ place: z.string().trim().min(2).max(80) }).parse(data),
  )
  .handler(async ({ data }): Promise<TaxOffice[]> => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!lovableKey || !mapsKey) throw new Error("The branch finder is not configured yet.");

    const res = await fetch(`${GATEWAY}/places/v1/places:searchText`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": mapsKey,
        "Content-Type": "application/json",
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location",
      },
      body: JSON.stringify({
        textQuery: `SARS South African Revenue Service branch in ${data.place}`,
        maxResultCount: 6,
        regionCode: "ZA",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Places search failed [${res.status}]: ${body}`);
      throw new Error("Could not search for branches right now. Please try again.");
    }

    const json = (await res.json()) as {
      places?: {
        id: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude: number; longitude: number };
      }[];
    };

    return (json.places ?? [])
      .filter((p) => p.location)
      .map((p) => ({
        id: p.id,
        name: p.displayName?.text ?? "SARS branch",
        address: p.formattedAddress ?? "",
        lat: p.location!.latitude,
        lng: p.location!.longitude,
      }));
  });
