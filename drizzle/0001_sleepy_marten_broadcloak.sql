CREATE TABLE `checklistTemplateItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`templateId` int NOT NULL,
	`title` varchar(240) NOT NULL,
	`detail` text,
	`priority` enum('low','normal','high','critical') NOT NULL DEFAULT 'normal',
	`defaultAssigneeId` int,
	`dueTime` varchar(5),
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `checklistTemplateItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `checklistTemplates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`active` boolean NOT NULL DEFAULT true,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `checklistTemplates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dailyTasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workDate` varchar(10) NOT NULL,
	`templateItemId` int,
	`title` varchar(240) NOT NULL,
	`detail` text,
	`priority` enum('low','normal','high','critical') NOT NULL DEFAULT 'normal',
	`status` enum('pending','in_progress','blocked','complete') NOT NULL DEFAULT 'pending',
	`dueAt` bigint,
	`assignedTeamMemberId` int,
	`completedByTeamMemberId` int,
	`completedAt` bigint,
	`blockedReason` text,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dailyTasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `handovers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(240) NOT NULL,
	`detail` text NOT NULL,
	`priority` enum('low','normal','high','critical') NOT NULL DEFAULT 'normal',
	`status` enum('open','acknowledged','resolved') NOT NULL DEFAULT 'open',
	`ownerTeamMemberId` int,
	`deadlineAt` bigint,
	`decisionRecord` text,
	`createdByUserId` int,
	`acknowledgedByUserId` int,
	`acknowledgedAt` bigint,
	`resolvedByUserId` int,
	`resolvedAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `handovers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operationalIssues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(240) NOT NULL,
	`category` enum('breakdown','customer_concern','late_running','staffing','other') NOT NULL,
	`impact` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`status` enum('open','monitoring','resolved') NOT NULL DEFAULT 'open',
	`ownerTeamMemberId` int,
	`nextAction` text NOT NULL,
	`resolution` text,
	`recurringCause` varchar(240),
	`detectedAt` bigint NOT NULL,
	`targetAt` bigint,
	`createdByUserId` int,
	`resolvedAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `operationalIssues_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `performanceNotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamMemberId` int NOT NULL,
	`noteType` enum('coaching','recognition') NOT NULL,
	`note` text NOT NULL,
	`recordedByUserId` int NOT NULL,
	`recordedAt` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `performanceNotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `readinessPulses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pulseDate` varchar(10) NOT NULL,
	`teamMemberId` int NOT NULL,
	`capacity` enum('green','amber','red') NOT NULL,
	`riskNote` text,
	`supportNeeded` text,
	`submittedAt` bigint NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `readinessPulses_id` PRIMARY KEY(`id`),
	CONSTRAINT `readinessPulses_member_date_unique` UNIQUE(`teamMemberId`,`pulseDate`)
);
--> statement-breakpoint
CREATE TABLE `rotaAssignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workDate` varchar(10) NOT NULL,
	`teamMemberId` int NOT NULL,
	`assignmentType` enum('early','core','late','on_call','leave','unavailable') NOT NULL,
	`startTime` varchar(5),
	`endTime` varchar(5),
	`note` varchar(500),
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rotaAssignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `taskActivity` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`action` enum('created','commented','started','completed','blocked','reopened') NOT NULL,
	`body` text,
	`actorTeamMemberId` int,
	`actorUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `taskActivity_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `teamMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`appUserId` int,
	`displayName` varchar(120) NOT NULL,
	`email` varchar(320),
	`jobTitle` varchar(120) NOT NULL DEFAULT 'Operations Coordinator',
	`memberRole` enum('lead','coordinator','support') NOT NULL DEFAULT 'coordinator',
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`colour` varchar(16) NOT NULL DEFAULT '#1D5C63',
	`initials` varchar(4) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teamMembers_id` PRIMARY KEY(`id`),
	CONSTRAINT `teamMembers_appUser_unique` UNIQUE(`appUserId`)
);
--> statement-breakpoint
CREATE INDEX `checklistTemplateItems_template_index` ON `checklistTemplateItems` (`templateId`);--> statement-breakpoint
CREATE INDEX `checklistTemplates_active_index` ON `checklistTemplates` (`active`);--> statement-breakpoint
CREATE INDEX `dailyTasks_date_status_index` ON `dailyTasks` (`workDate`,`status`);--> statement-breakpoint
CREATE INDEX `dailyTasks_assignee_index` ON `dailyTasks` (`assignedTeamMemberId`);--> statement-breakpoint
CREATE INDEX `handovers_status_priority_index` ON `handovers` (`status`,`priority`);--> statement-breakpoint
CREATE INDEX `handovers_owner_index` ON `handovers` (`ownerTeamMemberId`);--> statement-breakpoint
CREATE INDEX `operationalIssues_status_index` ON `operationalIssues` (`status`,`impact`);--> statement-breakpoint
CREATE INDEX `operationalIssues_owner_index` ON `operationalIssues` (`ownerTeamMemberId`);--> statement-breakpoint
CREATE INDEX `performanceNotes_member_index` ON `performanceNotes` (`teamMemberId`,`recordedAt`);--> statement-breakpoint
CREATE INDEX `readinessPulses_date_index` ON `readinessPulses` (`pulseDate`,`capacity`);--> statement-breakpoint
CREATE INDEX `rotaAssignments_date_index` ON `rotaAssignments` (`workDate`);--> statement-breakpoint
CREATE INDEX `rotaAssignments_member_index` ON `rotaAssignments` (`teamMemberId`,`workDate`);--> statement-breakpoint
CREATE INDEX `taskActivity_task_index` ON `taskActivity` (`taskId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `teamMembers_status_index` ON `teamMembers` (`status`);