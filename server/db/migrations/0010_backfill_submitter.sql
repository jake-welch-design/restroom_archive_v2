UPDATE `restrooms`
SET `submitted_by` = (SELECT `id` FROM `users` WHERE `username` = 'jake')
WHERE `submitted_by` IS NULL;
