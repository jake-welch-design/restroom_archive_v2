import type { H3Event } from "h3";
import { countryName, subdivisionsFor } from "~~/shared/utils/regions";
import { publicUrls } from "~~/server/utils/urls";

/**
 * Cross-checks a submission's pin against the place it is being filed under.
 *
 * Exists because of one recurring mistake: a dropped minus sign, or latitude
 * and longitude the wrong way round, which the range checks accept and which
 * puts "Minneapolis, MN" in Mongolia. The typed location is the one other
 * statement of where the room is, so the pin is checked against that.
 *
 * The place is looked up with OpenStreetMap's Nominatim, and the lookup is made
 * from here rather than from the browser on purpose: the geocoder is sent a
 * city name and nothing about the person who typed it, which is what lets the
 * privacy notice go on saying that no other third party receives data.
 */

const SEARCH_URL = "https://nominatim.openstreetmap.org/search";

/**
 * How far outside a place's bounds a pin may fall and still count as there.
 *
 * Generous on purpose. People file a room under the city they think of it as
 * being in, which is often the one next door, and a village comes back as a
 * point with almost no bounds of its own. The mistakes this is for are off by
 * thousands of kilometres, so there is nothing to gain from a tight margin and
 * a refused correct pin to lose.
 */
const MARGIN_KM = 50;
const KM_PER_DEGREE = 111;

interface Place {
  // [south, north, west, east], as strings.
  boundingbox: [string, string, string, string];
}

function isNear(lat: number, lng: number, place: Place): boolean {
  const [south, north, west, east] = place.boundingbox.map(Number);
  const latMargin = MARGIN_KM / KM_PER_DEGREE;
  // A degree of longitude narrows towards the poles; the floor keeps the
  // division finite at them.
  const lngMargin = latMargin / Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  return (
    lat >= south - latMargin &&
    lat <= north + latMargin &&
    lng >= west - lngMargin &&
    lng <= east + lngMargin
  );
}

async function search(
  params: Record<string, string>,
  userAgent: string,
): Promise<Place[]> {
  const query = new URLSearchParams({
    ...params,
    format: "jsonv2",
    limit: "10",
  });
  const res = await fetch(`${SEARCH_URL}?${query}`, {
    // Nominatim's usage policy asks for a User-Agent that identifies the
    // application, and answers 403 to a runtime's default one.
    headers: { "User-Agent": userAgent },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`geocoder answered ${res.status}`);
  return res.json();
}

/**
 * True if the pin is in or near the named place, false if it is somewhere
 * else, and null if that could not be established -- the geocoder is down, or
 * refusing us, or knows neither the city nor the region.
 *
 * Null is for the caller to let through. A submission should not be refused
 * because a third party is having a bad day, and every entry is still looked
 * at by an admin before it is published. A failed lookup is logged, because
 * letting everything through is otherwise indistinguishable from working.
 */
export async function coordsMatchLocation(
  event: H3Event,
  input: {
    city: string;
    country: string;
    subdivision?: string;
    lat: number;
    lng: number;
  },
): Promise<boolean | null> {
  const country = countryName(input.country);
  if (!country) return null;
  const state = subdivisionsFor(input.country)?.find(
    (r) => r.code === input.subdivision,
  )?.name;
  const userAgent = `RestroomArchive (+${publicUrls(event).site})`;

  try {
    // The structured form only matches settlements, so a misspelt city finds
    // nothing rather than a street that happens to share the misspelling.
    // Every match is kept: there are five Newports in the UK, and a pin in any
    // of them agrees with "Newport".
    let places = await search(
      { city: input.city.trim(), ...(state ? { state } : {}), country },
      userAgent,
    );
    // A city the geocoder does not know still has a state or a country around
    // it, which is enough to catch a pin on the wrong continent.
    if (!places.length)
      places = await search(
        { q: [state, country].filter(Boolean).join(", ") },
        userAgent,
      );
    if (!places.length) return null;
    return places.some((p) => isNear(input.lat, input.lng, p));
  } catch (err) {
    console.error("location check failed", err);
    return null;
  }
}
