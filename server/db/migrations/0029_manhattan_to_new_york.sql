-- Files Manhattan entries under the city their mailing address uses. The city
-- field follows postal convention, and while Brooklyn, Bronx and Staten Island
-- addresses carry the borough's name, Manhattan's say `New York, NY`.
--
-- Every status, not only published, for the same reason 0028 gave: a pending
-- or rejected row can still reach the catalog later.
UPDATE restrooms SET location = 'New York, NY' WHERE location = 'Manhattan, NY';
