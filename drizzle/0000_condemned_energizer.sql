CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`business` text NOT NULL,
	`city` text NOT NULL,
	`province` text NOT NULL,
	`category` text NOT NULL,
	`pay` real NOT NULL,
	`pay_type` text NOT NULL,
	`hours` real NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`radius` real NOT NULL,
	`start` text NOT NULL,
	`contact` text NOT NULL,
	`created_at` integer NOT NULL
);
