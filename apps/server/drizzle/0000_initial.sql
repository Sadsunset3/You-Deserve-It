CREATE TABLE `rooms` (
  `code` text PRIMARY KEY NOT NULL,
  `snapshot` text NOT NULL,
  `expires_at` text,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `commands` (
  `room_code` text NOT NULL,
  `command_id` text NOT NULL,
  `result` text NOT NULL,
  PRIMARY KEY (`room_code`, `command_id`)
);
--> statement-breakpoint
CREATE TABLE `ai_events` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `room_code` text NOT NULL,
  `purpose` text NOT NULL,
  `status` text NOT NULL,
  `latency_ms` integer NOT NULL,
  `created_at` text NOT NULL
);
