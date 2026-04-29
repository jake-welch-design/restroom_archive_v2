CREATE TABLE `rate_limits` (
  `key` text NOT NULL,
  `window` integer NOT NULL,
  `count` integer NOT NULL DEFAULT 1,
  PRIMARY KEY (`key`, `window`)
);
