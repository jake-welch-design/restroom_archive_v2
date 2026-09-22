/**
 * A first guess at each existing entry's country, for drafting the 0028
 * backfill. One-time tooling, not application code: nothing in the running
 * site imports this, and it should be deleted once the backfill has run.
 *
 * It exists because rows predating the `country` column carry their country
 * only inside `location`, whose trailing token is a state in the US, a
 * province in Canada and a country elsewhere. Those readings collide -- DE is
 * Delaware and Germany, CA California and Canada -- and coordinates settle
 * only the distant cases. So this produces a draft for a human to correct,
 * never a value to write unreviewed. `npm run db:draft-backfill` prints it
 * alongside each location and flags what it is unsure about.
 */

const US_STATE_CODES = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  // Territories. These are US under either reading -- GU and PR are also
  // their own ISO country codes -- so they never reach the tie-break below.
  "AS",
  "GU",
  "MP",
  "PR",
  "VI",
]);

// Entries predating the two-letter rule spell the state out ("Veyo, Utah").
const US_STATE_NAMES = new Set([
  "ALABAMA",
  "ALASKA",
  "ARIZONA",
  "ARKANSAS",
  "CALIFORNIA",
  "COLORADO",
  "CONNECTICUT",
  "DELAWARE",
  "FLORIDA",
  "GEORGIA",
  "HAWAII",
  "IDAHO",
  "ILLINOIS",
  "INDIANA",
  "IOWA",
  "KANSAS",
  "KENTUCKY",
  "LOUISIANA",
  "MAINE",
  "MARYLAND",
  "MASSACHUSETTS",
  "MICHIGAN",
  "MINNESOTA",
  "MISSISSIPPI",
  "MISSOURI",
  "MONTANA",
  "NEBRASKA",
  "NEVADA",
  "NEW HAMPSHIRE",
  "NEW JERSEY",
  "NEW MEXICO",
  "NEW YORK",
  "NORTH CAROLINA",
  "NORTH DAKOTA",
  "OHIO",
  "OKLAHOMA",
  "OREGON",
  "PENNSYLVANIA",
  "RHODE ISLAND",
  "SOUTH CAROLINA",
  "SOUTH DAKOTA",
  "TENNESSEE",
  "TEXAS",
  "UTAH",
  "VERMONT",
  "VIRGINIA",
  "WASHINGTON",
  "WEST VIRGINIA",
  "WISCONSIN",
  "WYOMING",
  "DISTRICT OF COLUMBIA",
  "PUERTO RICO",
  "GUAM",
  "AMERICAN SAMOA",
]);

// State codes that are also ISO 3166-1 country codes, and so are the only ones
// a pin is allowed to argue with. Keeping the list explicit is what stops a
// mistyped pin from inventing a country: "Springville, UT" with an east
// longitude stays Utah, because UT is not a country code in the first place.
const AMBIGUOUS_CODES = new Set([
  "AL", // Albania
  "AZ", // Azerbaijan
  "AR", // Argentina
  "CA", // Canada
  "CO", // Colombia
  "DE", // Germany
  "GA", // Gabon
  "ID", // Indonesia
  "IL", // Israel
  "IN", // India
  "KY", // Cayman Islands
  "LA", // Laos
  "ME", // Montenegro
  "MD", // Moldova
  "MA", // Morocco
  "MN", // Mongolia
  "MS", // Montserrat
  "MO", // Macao
  "MT", // Malta
  "NE", // Niger
  "NC", // New Caledonia
  "PA", // Panama
  "SC", // Seychelles
  "SD", // Sudan
  "TN", // Tunisia
  "VA", // Vatican City
]);

// Rough [minLat, maxLat, minLng, maxLng] boxes over US land. Deliberately
// generous, because they only ever answer "is this pin nowhere near the state
// it claims": a point has to be on another continent to be ruled out.
const US_BOXES: readonly [number, number, number, number][] = [
  [24.4, 49.4, -125.0, -66.9], // contiguous 48 + DC
  [51.0, 71.5, -170.0, -129.0], // Alaska
  [51.0, 53.5, 172.0, 180.0], // western Aleutians, past the date line
  [18.8, 22.3, -160.3, -154.7], // Hawaii
  [17.6, 18.6, -68.0, -64.5], // Puerto Rico + US Virgin Islands
  [13.2, 20.6, 144.6, 146.1], // Guam + Northern Marianas
  [-14.6, -14.1, -171.1, -169.4], // American Samoa
];

function inUnitedStates(lat: number | null, lng: number | null): boolean {
  // No pin is no evidence, so it cannot overrule the state reading.
  if (lat == null || lng == null) return true;
  return US_BOXES.some(
    ([minLat, maxLat, minLng, maxLng]) =>
      lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng,
  );
}

/**
 * The country an entry belongs to, as an uppercase key for counting -- "US",
 * or whatever region token the location carries.
 *
 * A token naming a US state counts as the US, unless it is one of the codes
 * that is also a country and the coordinates put it outside the country. A
 * token that names neither is taken at face value, so a typo counts as itself
 * rather than quietly joining a real country.
 *
 * The boxes cannot separate neighbours: "Toronto, CA" sits inside the
 * contiguous-48 box and counts as California. Border cases like that have to
 * be fixed in the entry, not here.
 */
export function countryKey(
  location: string,
  lat: number | null = null,
  lng: number | null = null,
): string {
  const region = location.slice(location.lastIndexOf(",") + 1).trim();
  if (!region) return location.trim().toUpperCase();

  const key = region.toUpperCase();
  if (US_STATE_NAMES.has(key)) return "US";
  if (!US_STATE_CODES.has(key)) return key;

  return AMBIGUOUS_CODES.has(key) && !inUnitedStates(lat, lng) ? key : "US";
}

/**
 * The same guess, plus whether it is worth trusting.
 *
 * `sure` is false wherever the answer rests on something the data cannot
 * settle, and those are the lines to check by hand:
 *
 *  - an ambiguous code whose pin lands inside the US, because the boxes are
 *    far too loose to tell Toronto from Buffalo;
 *  - a token that is neither a US state nor an ISO country code, which is
 *    either a Canadian province written before there was a field for one, or
 *    a typo -- in both cases a country invented out of nothing.
 */
export function draftCountry(
  location: string,
  lat: number | null,
  lng: number | null,
  isKnownCountry: (code: string) => boolean,
): { country: string; sure: boolean; why?: string } {
  const key = countryKey(location, lat, lng);
  const token = location
    .slice(location.lastIndexOf(",") + 1)
    .trim()
    .toUpperCase();

  // An ambiguous token is never trusted, whichever way the pin points. Inside
  // the US, the boxes are too loose to rule out a border city. Outside it, the
  // pin is as likely to be wrong as the token: Minneapolis and Savannah both
  // have sign-flipped longitudes, which put them in Mongolia and Tibet and had
  // this reporting them as Mongolia and Gabon with no warning at all.
  if (AMBIGUOUS_CODES.has(token))
    return {
      country: key,
      sure: false,
      why:
        key === "US"
          ? `"${token}" is both a US state and a country; the pin is inside the US, but the boxes cannot rule out a border city`
          : `"${token}" is both a US state and a country, and the pin is outside the US -- either a genuinely foreign entry or a bad coordinate`,
    };

  if (!isKnownCountry(key))
    return {
      country: key,
      sure: false,
      why: `"${token}" is not a US state or a country code -- a province, or a typo`,
    };

  return { country: key, sure: true };
}
