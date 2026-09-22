-- Fills in `country` for the entries that predate it, and fixes the three
-- locations the exercise turned up as broken.
--
-- Drafted with scripts/draft-country-backfill.ts over a dump of every distinct
-- location, then corrected by hand -- which is the whole reason the column
-- exists, because the draft got two of them wrong in a way no reviewer of a
-- bare number would ever have noticed. `Minneapolis, MN` and `Savannah, GA`
-- both carry sign-flipped longitudes that put their pins in Asia, so the
-- inference read them as Mongolia and Gabon. They are Minnesota and Georgia.
--
-- Every row is filled in, whatever its status, not only the published ones.
-- A rejected entry can be restored and a pending one will be approved, and
-- either would otherwise arrive in the catalog with no country and silently
-- take the country count off the About page. So Russia is assigned here even
-- though both Russian entries are rejected and the site shows neither: the
-- column records where an entry is, and `status` decides whether it counts.
--
-- Matching is on the trailing region token rather than the full location
-- string. Every token is ASCII, while the city halves include `Reykjavík` and
-- `Velikiy Novgorod`, and a string literal that disagreed with the stored text
-- by one accent would silently leave that row to the US catch-all at the end.
--
-- The tokens below are unambiguous *in this data*, which was checked entry by
-- entry rather than assumed. `, DE` is Delaware as well as Germany, but the
-- only two rows carrying it are Berlin and Schweich. `, CA` is deliberately
-- absent: every one of those is California, and Canada's entries are filed
-- under province codes instead.

-- Leading and trailing whitespace first, so the tokens below match and so
-- `Little Rock, AR ` stops counting as a city of its own.
UPDATE restrooms SET location = TRIM(location) WHERE location <> TRIM(location);

-- Norway. "NW" is not a region code at all -- a typo for NO -- so the display
-- string is corrected alongside the country.
UPDATE restrooms SET location = 'Oslo, NO', country = 'NO'
  WHERE TRIM(location) = 'Oslo, NW';

-- Canada. Written with province codes, which is also what the submission form
-- now produces for Canadian entries, so these display strings already match
-- the current convention.
UPDATE restrooms SET country = 'CA'
  WHERE location LIKE '%, ON' OR location LIKE '%, MB' OR location LIKE '%, QC';

UPDATE restrooms SET country = 'IS' WHERE location LIKE '%, IS'; -- Iceland
UPDATE restrooms SET country = 'DE' WHERE location LIKE '%, DE'; -- Germany
UPDATE restrooms SET country = 'ES' WHERE location LIKE '%, ES'; -- Spain
UPDATE restrooms SET country = 'IE' WHERE location LIKE '%, IE'; -- Ireland
UPDATE restrooms SET country = 'TR' WHERE location LIKE '%, TR'; -- Turkey
UPDATE restrooms SET country = 'RU' WHERE location LIKE '%, RU'; -- Russia
UPDATE restrooms SET country = 'FR' WHERE location LIKE '%, FR'; -- France
UPDATE restrooms SET country = 'CN' WHERE location LIKE '%, CN'; -- China
UPDATE restrooms SET country = 'AT' WHERE location LIKE '%, AT'; -- Austria

-- Everything still unassigned is in the United States. A catch-all rather than
-- sixty more string literals: the non-US entries above are the complete set,
-- checked against the dump, and this way a row cannot be missed by a typo in a
-- city name. It also sweeps up the entries whose own token is unreliable --
-- `Veyo, Utah` spelled out, `Minneapolis, MN` and `Savannah, GA` with their
-- bad pins -- all of which are US.
UPDATE restrooms SET country = 'US' WHERE country IS NULL;

-- Capitalisation, now that the row is being touched anyway.
UPDATE restrooms SET location = 'Quebec City, QC' WHERE location = 'Quebec city, QC';
