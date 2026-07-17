-- Beta-archivist applications are retired: the site is back to open account
-- creation (see /api/auth/signup), so the invite/application flow and its table
-- are no longer used. Dropping the table also drops its indexes.
DROP TABLE IF EXISTS `beta_applications`;
