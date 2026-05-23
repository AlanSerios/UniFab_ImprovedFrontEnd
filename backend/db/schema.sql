
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `user_tokens`;
DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `user_type` enum('student','faculty','researcher','others') NOT NULL,
  `is_admin` tinyint(1) NOT NULL DEFAULT '0',
  `is_email_verified` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_users_admin_verified_created` (`is_admin`,`is_email_verified`,`created_at`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_tokens` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `token_type` enum('refresh','email_verification','forgot_password') NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime DEFAULT NULL,
  `consumed_at` datetime DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_tokens_type_hash` (`token_type`,`token_hash`),
  KEY `idx_user_tokens_user_type_active` (`user_id`,`token_type`,`revoked_at`,`consumed_at`,`expires_at`),
  CONSTRAINT `fk_user_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `admin_audit_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admin_audit_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `actor_id` int unsigned DEFAULT NULL,
  `event_type` varchar(100) NOT NULL,
  `entity_type` varchar(80) NOT NULL,
  `entity_id` varchar(80) DEFAULT NULL,
  `summary` varchar(500) DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_admin_audit_events_created` (`created_at`,`id`),
  KEY `idx_admin_audit_events_actor_created` (`actor_id`,`created_at`,`id`),
  KEY `idx_admin_audit_events_entity` (`entity_type`,`entity_id`,`created_at`,`id`),
  CONSTRAINT `fk_admin_audit_events_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `site_content`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `site_content` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `content_key` varchar(80) NOT NULL,
  `title` varchar(160) NOT NULL,
  `body` text,
  `metadata` json DEFAULT NULL,
  `updated_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_site_content_key` (`content_key`),
  KEY `idx_site_content_updated_by` (`updated_by`),
  CONSTRAINT `fk_site_content_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `file_events`;
DROP TABLE IF EXISTS `file_references`;
DROP TABLE IF EXISTS `file_objects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `file_objects` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `storage_provider` enum('local') NOT NULL DEFAULT 'local',
  `storage_key` varchar(1000) NOT NULL,
  `public_path` varchar(1000) DEFAULT NULL,
  `original_file_name` varchar(255) DEFAULT NULL,
  `mime_type` varchar(120) DEFAULT NULL,
  `extension` varchar(20) DEFAULT NULL,
  `file_size` bigint unsigned DEFAULT NULL,
  `checksum_sha256` char(64) DEFAULT NULL,
  `visibility` enum('private','public') NOT NULL DEFAULT 'private',
  `storage_status` enum('present','staged','delete_pending','deleted','missing','delete_failed') NOT NULL DEFAULT 'present',
  `created_by` int unsigned DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` int unsigned DEFAULT NULL,
  `delete_reason` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_file_objects_storage_key` (`storage_key`(255)),
  KEY `idx_file_objects_checksum_size` (`checksum_sha256`,`file_size`),
  KEY `idx_file_objects_storage_status` (`storage_status`,`deleted_at`,`id`),
  KEY `idx_file_objects_status_created` (`storage_status`,`created_at`,`id`),
  KEY `idx_file_objects_created_by` (`created_by`),
  KEY `idx_file_objects_deleted_by` (`deleted_by`),
  CONSTRAINT `fk_file_objects_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_file_objects_deleted_by` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `file_references` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `file_object_id` bigint unsigned NOT NULL,
  `reference_type` varchar(80) NOT NULL,
  `reference_id` bigint unsigned NOT NULL,
  `reference_column` varchar(80) DEFAULT NULL,
  `file_role` varchar(80) NOT NULL,
  `owner_user_id` int unsigned DEFAULT NULL,
  `visibility` enum('private','public') DEFAULT NULL,
  `status` enum('active','replaced','removed','expired','archived','deleted','owner_deleted') NOT NULL DEFAULT 'active',
  `metadata` json DEFAULT NULL,
  `attached_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `detached_at` datetime DEFAULT NULL,
  `detach_reason` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_file_references_file_status` (`file_object_id`,`status`,`reference_type`),
  KEY `idx_file_references_reference` (`reference_type`,`reference_id`,`status`),
  KEY `idx_file_references_owner` (`owner_user_id`,`status`),
  CONSTRAINT `fk_file_references_file_object` FOREIGN KEY (`file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_file_references_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `file_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `file_object_id` bigint unsigned DEFAULT NULL,
  `file_reference_id` bigint unsigned DEFAULT NULL,
  `event_type` varchar(80) NOT NULL,
  `actor_id` int unsigned DEFAULT NULL,
  `summary` varchar(500) DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_file_events_file` (`file_object_id`,`created_at`,`id`),
  KEY `idx_file_events_reference` (`file_reference_id`,`created_at`,`id`),
  KEY `idx_file_events_actor` (`actor_id`,`created_at`,`id`),
  CONSTRAINT `fk_file_events_file_object` FOREIGN KEY (`file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_file_events_reference` FOREIGN KEY (`file_reference_id`) REFERENCES `file_references` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_file_events_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `schema_migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `schema_migrations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `migration_name` varchar(255) NOT NULL,
  `checksum_sha256` char(64) NOT NULL,
  `execution_type` enum('applied','baseline') NOT NULL DEFAULT 'applied',
  `applied_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_schema_migrations_name` (`migration_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `materials`;
DROP TABLE IF EXISTS `material_colors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `materials` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `material_key` varchar(50) NOT NULL,
  `display_name` varchar(100) NOT NULL,
  `material_cost_per_gram` decimal(10,4) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_materials_material_key` (`material_key`),
  CONSTRAINT `chk_materials_cost_nonnegative` CHECK ((`material_cost_per_gram` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `pricing_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pricing_config` (
  `id` int unsigned NOT NULL,
  `machine_hour_rate` decimal(10,2) NOT NULL DEFAULT '0.00',
  `base_fee` decimal(10,2) NOT NULL DEFAULT '0.00',
  `waste_factor` decimal(5,4) NOT NULL DEFAULT '0.0000',
  `support_markup_factor` decimal(5,4) NOT NULL DEFAULT '0.0000',
  `electricity_cost_per_kwh` decimal(10,4) NOT NULL DEFAULT '0.0000',
  `power_consumption_watts` decimal(10,2) NOT NULL DEFAULT '0.00',
  `currency` varchar(10) NOT NULL DEFAULT 'PHP',
  `updated_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_pricing_config_updated_by` (`updated_by`),
  CONSTRAINT `fk_pricing_config_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `slicer_profiles`;
DROP TABLE IF EXISTS `slicer_profile_validation_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `slicer_profiles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `material_id` bigint unsigned NOT NULL,
  `quality` varchar(20) NOT NULL,
  `printer_name` varchar(100) NOT NULL,
  `nozzle` varchar(20) NOT NULL,
  `support_rule` varchar(30) NOT NULL DEFAULT 'auto',
  `orientation_rule` varchar(30) NOT NULL DEFAULT 'original',
  `profile_filename` varchar(255) NOT NULL,
  `file_object_id` bigint unsigned DEFAULT NULL,
  `version_number` int unsigned NOT NULL DEFAULT '1',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `validation_status` enum('not_run','passed','failed') NOT NULL DEFAULT 'not_run',
  `validation_message` text,
  `validated_at` datetime DEFAULT NULL,
  `uploaded_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_slicer_profiles_material_quality_version` (`material_id`,`quality`,`version_number`),
  KEY `idx_slicer_profiles_material_quality_active` (`material_id`,`quality`,`is_active`),
  KEY `idx_slicer_profiles_file_object` (`file_object_id`),
  KEY `idx_slicer_profiles_uploaded_by` (`uploaded_by`),
  CONSTRAINT `fk_slicer_profiles_file_object` FOREIGN KEY (`file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_slicer_profiles_material` FOREIGN KEY (`material_id`) REFERENCES `materials` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_slicer_profiles_uploaded_by` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_slicer_profiles_quality` CHECK ((`quality` in (_utf8mb4'draft',_utf8mb4'standard',_utf8mb4'fine')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `material_colors` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `material_id` bigint unsigned NOT NULL,
  `color_name` varchar(80) NOT NULL,
  `hex_code` varchar(7) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `display_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_material_colors_material_name` (`material_id`,`color_name`),
  KEY `idx_material_colors_material_active_order` (`material_id`,`is_active`,`display_order`,`color_name`),
  CONSTRAINT `fk_material_colors_material` FOREIGN KEY (`material_id`) REFERENCES `materials` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `slicer_profile_validation_events` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `material_id` bigint unsigned DEFAULT NULL,
  `material_key` varchar(50) NOT NULL,
  `quality` enum('draft','standard','fine') NOT NULL,
  `profile_original_name` varchar(255) DEFAULT NULL,
  `profile_filename` varchar(255) DEFAULT NULL,
  `status` enum('passed','failed') NOT NULL,
  `message` text,
  `uploaded_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_slicer_profile_validation_events_created_at` (`created_at`),
  KEY `idx_slicer_profile_validation_events_status` (`status`),
  KEY `fk_slicer_profile_validation_events_material` (`material_id`),
  KEY `fk_slicer_profile_validation_events_uploaded_by` (`uploaded_by`),
  CONSTRAINT `fk_slicer_profile_validation_events_material` FOREIGN KEY (`material_id`) REFERENCES `materials` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_slicer_profile_validation_events_uploaded_by` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `design_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `design_categories` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `slug` varchar(120) NOT NULL,
  `description` text,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int unsigned DEFAULT NULL,
  `updated_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_design_categories_name` (`name`),
  UNIQUE KEY `uq_design_categories_slug` (`slug`),
  KEY `fk_design_categories_created_by` (`created_by`),
  KEY `fk_design_categories_updated_by` (`updated_by`),
  CONSTRAINT `fk_design_categories_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_design_categories_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `design_tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `design_tags` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `slug` varchar(120) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int unsigned DEFAULT NULL,
  `updated_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_design_tags_name` (`name`),
  UNIQUE KEY `uq_design_tags_slug` (`slug`),
  KEY `fk_design_tags_created_by` (`created_by`),
  KEY `fk_design_tags_updated_by` (`updated_by`),
  CONSTRAINT `fk_design_tags_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_design_tags_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `printers`;
DROP TABLE IF EXISTS `printer_materials`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `printers` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `model` varchar(120) DEFAULT NULL,
  `technology` varchar(80) NOT NULL DEFAULT 'FDM',
  `build_volume` varchar(120) DEFAULT NULL,
  `nozzle_size` varchar(40) DEFAULT NULL,
  `status` enum('active','maintenance','retired') NOT NULL DEFAULT 'active',
  `is_public` tinyint(1) NOT NULL DEFAULT '1',
  `display_order` int NOT NULL DEFAULT '0',
  `notes` text,
  `created_by` int unsigned DEFAULT NULL,
  `updated_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_printers_public_status_order` (`is_public`,`status`,`display_order`,`name`),
  KEY `fk_printers_created_by` (`created_by`),
  KEY `fk_printers_updated_by` (`updated_by`),
  CONSTRAINT `fk_printers_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_printers_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `printer_materials` (
  `printer_id` int unsigned NOT NULL,
  `material_id` bigint unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`printer_id`,`material_id`),
  KEY `idx_printer_materials_material` (`material_id`),
  CONSTRAINT `fk_printer_materials_printer` FOREIGN KEY (`printer_id`) REFERENCES `printers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_printer_materials_material` FOREIGN KEY (`material_id`) REFERENCES `materials` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `saved_designs`;
DROP TABLE IF EXISTS `design_storage_cleanup_results`;
DROP TABLE IF EXISTS `design_storage_cleanup_runs`;
DROP TABLE IF EXISTS `local_design_images`;
DROP TABLE IF EXISTS `local_design_files`;
DROP TABLE IF EXISTS `local_designs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `local_designs` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `source_kind` enum('lab','community') NOT NULL DEFAULT 'lab',
  `title` varchar(255) NOT NULL,
  `description` text,
  `material` varchar(100) DEFAULT NULL,
  `dimensions` varchar(255) DEFAULT NULL,
  `license_type` varchar(255) DEFAULT NULL,
  `ownership_confirmed` tinyint(1) NOT NULL DEFAULT '0',
  `policy_acknowledged` tinyint(1) NOT NULL DEFAULT '0',
  `category_id` int unsigned DEFAULT NULL,
  `moderation_status` enum('draft','screening','auto_approved','needs_admin_review','auto_rejected','admin_approved','admin_rejected','hidden') NOT NULL DEFAULT 'admin_approved',
  `is_print_ready` tinyint(1) NOT NULL DEFAULT '1',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `moderation_flags` json DEFAULT NULL,
  `moderation_summary` text,
  `moderation_feedback` text,
  `moderation_decision_source` enum('none','rules','ai','render','admin') NOT NULL DEFAULT 'none',
  `latest_moderation_run_id` bigint unsigned DEFAULT NULL,
  `moderation_content_hash` char(64) DEFAULT NULL,
  `moderation_policy_version` varchar(80) DEFAULT NULL,
  `published_at` datetime DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `reviewed_by` int unsigned DEFAULT NULL,
  `print_ready_at` datetime DEFAULT NULL,
  `print_ready_by` int unsigned DEFAULT NULL,
  `is_featured` tinyint(1) NOT NULL DEFAULT '0',
  `featured_rank` int unsigned NOT NULL DEFAULT '0',
  `featured_at` datetime DEFAULT NULL,
  `featured_by` int unsigned DEFAULT NULL,
  `library_note` text,
  `is_library_hidden` tinyint(1) NOT NULL DEFAULT '0',
  `uploaded_by` int unsigned NOT NULL,
  `archived_at` datetime DEFAULT NULL,
  `archived_by` int unsigned DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` int unsigned DEFAULT NULL,
  `delete_reason` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_local_designs_uploaded_by` (`uploaded_by`),
  KEY `idx_local_designs_category_id` (`category_id`),
  KEY `idx_local_designs_archived_active_created_at` (`archived_at`,`is_active`,`created_at`,`id`),
  KEY `idx_local_designs_public_library` (`source_kind`,`moderation_status`,`is_active`,`archived_at`,`created_at`,`id`),
  KEY `idx_local_designs_public_high_traffic` (`source_kind`,`moderation_status`,`is_active`,`archived_at`,`deleted_at`,`created_at`,`id`),
  KEY `idx_local_designs_admin_queue` (`archived_at`,`source_kind`,`moderation_status`,`created_at`,`id`),
  KEY `idx_local_designs_library_sections` (`is_library_hidden`,`is_featured`,`is_print_ready`,`source_kind`,`featured_rank`,`created_at`,`id`),
  KEY `idx_local_designs_owner_status` (`uploaded_by`,`moderation_status`,`created_at`,`id`),
  KEY `idx_local_designs_latest_moderation_run` (`latest_moderation_run_id`),
  KEY `idx_local_designs_public_moderation_hash` (`moderation_status`,`latest_moderation_run_id`,`moderation_content_hash`),
  KEY `fk_local_designs_reviewed_by` (`reviewed_by`),
  KEY `fk_local_designs_print_ready_by` (`print_ready_by`),
  KEY `fk_local_designs_featured_by` (`featured_by`),
  KEY `fk_local_designs_archived_by` (`archived_by`),
  KEY `idx_local_designs_deleted_at` (`deleted_at`),
  KEY `fk_local_designs_deleted_by` (`deleted_by`),
  CONSTRAINT `fk_local_designs_uploaded_by` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_local_designs_category` FOREIGN KEY (`category_id`) REFERENCES `design_categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_local_designs_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_local_designs_print_ready_by` FOREIGN KEY (`print_ready_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_local_designs_featured_by` FOREIGN KEY (`featured_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_local_designs_archived_by` FOREIGN KEY (`archived_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_local_designs_deleted_by` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `local_design_files`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `local_design_files` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `local_design_id` int unsigned NOT NULL,
  `file_object_id` bigint unsigned DEFAULT NULL,
  `model_snapshot_file_object_id` bigint unsigned DEFAULT NULL,
  `original_file_name` varchar(255) DEFAULT NULL,
  `extension` varchar(20) DEFAULT NULL,
  `file_size` int unsigned DEFAULT NULL,
  `checksum_sha256` char(64) DEFAULT NULL,
  `sort_order` int unsigned NOT NULL DEFAULT '0',
  `is_primary` tinyint(1) NOT NULL DEFAULT '0',
  `is_print_ready` tinyint(1) NOT NULL DEFAULT '0',
  `status` enum('active','replaced','removed') NOT NULL DEFAULT 'active',
  `removed_at` datetime DEFAULT NULL,
  `removed_by` int unsigned DEFAULT NULL,
  `replaced_by_id` int unsigned DEFAULT NULL,
  `removal_reason` varchar(500) DEFAULT NULL,
  `storage_status` enum('present','delete_pending','deleted','missing','delete_failed') NOT NULL DEFAULT 'present',
  `storage_deleted_at` datetime DEFAULT NULL,
  `storage_delete_reason` varchar(500) DEFAULT NULL,
  `storage_cleanup_job_id` bigint unsigned DEFAULT NULL,
  `last_storage_check_at` datetime DEFAULT NULL,
  `print_ready_at` datetime DEFAULT NULL,
  `print_ready_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_local_design_files_design_order` (`local_design_id`,`is_primary`,`sort_order`,`id`),
  KEY `idx_local_design_files_print_ready` (`local_design_id`,`is_print_ready`,`sort_order`,`id`),
  KEY `idx_local_design_files_checksum` (`local_design_id`,`checksum_sha256`),
  KEY `idx_local_design_files_status` (`local_design_id`,`status`,`is_primary`,`sort_order`,`id`),
  KEY `idx_local_design_files_storage_cleanup` (`storage_status`,`status`,`removed_at`,`local_design_id`,`id`),
  KEY `idx_local_design_files_file_object` (`file_object_id`),
  KEY `idx_local_design_files_snapshot_file_object` (`model_snapshot_file_object_id`),
  KEY `fk_local_design_files_print_ready_by` (`print_ready_by`),
  KEY `fk_local_design_files_removed_by` (`removed_by`),
  KEY `fk_local_design_files_replaced_by` (`replaced_by_id`),
  CONSTRAINT `fk_local_design_files_design` FOREIGN KEY (`local_design_id`) REFERENCES `local_designs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_local_design_files_file_object` FOREIGN KEY (`file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_local_design_files_snapshot_file_object` FOREIGN KEY (`model_snapshot_file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_local_design_files_print_ready_by` FOREIGN KEY (`print_ready_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_local_design_files_removed_by` FOREIGN KEY (`removed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_local_design_files_replaced_by` FOREIGN KEY (`replaced_by_id`) REFERENCES `local_design_files` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `local_design_images`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `local_design_images` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `local_design_id` int unsigned NOT NULL,
  `file_object_id` bigint unsigned DEFAULT NULL,
  `original_file_name` varchar(255) DEFAULT NULL,
  `checksum_sha256` char(64) DEFAULT NULL,
  `sort_order` int unsigned NOT NULL DEFAULT '0',
  `is_primary` tinyint(1) NOT NULL DEFAULT '0',
  `status` enum('active','replaced','removed') NOT NULL DEFAULT 'active',
  `removed_at` datetime DEFAULT NULL,
  `removed_by` int unsigned DEFAULT NULL,
  `replaced_by_id` int unsigned DEFAULT NULL,
  `removal_reason` varchar(500) DEFAULT NULL,
  `storage_status` enum('present','delete_pending','deleted','missing','delete_failed') NOT NULL DEFAULT 'present',
  `storage_deleted_at` datetime DEFAULT NULL,
  `storage_delete_reason` varchar(500) DEFAULT NULL,
  `storage_cleanup_job_id` bigint unsigned DEFAULT NULL,
  `last_storage_check_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_local_design_images_design_order` (`local_design_id`,`is_primary`,`sort_order`,`id`),
  KEY `idx_local_design_images_checksum` (`local_design_id`,`checksum_sha256`),
  KEY `idx_local_design_images_status` (`local_design_id`,`status`,`is_primary`,`sort_order`,`id`),
  KEY `idx_local_design_images_storage_cleanup` (`storage_status`,`status`,`removed_at`,`local_design_id`,`id`),
  KEY `idx_local_design_images_file_object` (`file_object_id`),
  KEY `fk_local_design_images_removed_by` (`removed_by`),
  KEY `fk_local_design_images_replaced_by` (`replaced_by_id`),
  CONSTRAINT `fk_local_design_images_design` FOREIGN KEY (`local_design_id`) REFERENCES `local_designs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_local_design_images_file_object` FOREIGN KEY (`file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_local_design_images_removed_by` FOREIGN KEY (`removed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_local_design_images_replaced_by` FOREIGN KEY (`replaced_by_id`) REFERENCES `local_design_images` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `design_storage_cleanup_runs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `design_storage_cleanup_runs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `job_type` enum('manual','scheduled') NOT NULL DEFAULT 'manual',
  `dry_run` tinyint(1) NOT NULL DEFAULT '1',
  `actor_id` int unsigned DEFAULT NULL,
  `retention_days` int unsigned NOT NULL DEFAULT '180',
  `mmf_retention_days` int unsigned NOT NULL DEFAULT '365',
  `retention_cutoff` datetime NOT NULL,
  `mmf_retention_cutoff` datetime NOT NULL,
  `status` enum('running','completed','failed') NOT NULL DEFAULT 'running',
  `candidate_count` int unsigned NOT NULL DEFAULT '0',
  `deleted_count` int unsigned NOT NULL DEFAULT '0',
  `skipped_count` int unsigned NOT NULL DEFAULT '0',
  `missing_count` int unsigned NOT NULL DEFAULT '0',
  `failed_count` int unsigned NOT NULL DEFAULT '0',
  `error_message` text,
  `started_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_design_storage_cleanup_runs_started` (`started_at`,`id`),
  KEY `fk_design_storage_cleanup_runs_actor` (`actor_id`),
  CONSTRAINT `fk_design_storage_cleanup_runs_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `design_storage_cleanup_results`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `design_storage_cleanup_results` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `cleanup_run_id` bigint unsigned NOT NULL,
  `asset_kind` enum('local_model','local_image','mmf_cached_file') NOT NULL,
  `asset_id` int unsigned NOT NULL,
  `local_design_id` int unsigned DEFAULT NULL,
  `public_path` varchar(1000) DEFAULT NULL,
  `file_size` int unsigned DEFAULT NULL,
  `result` enum('would_delete','deleted','skipped','missing','failed') NOT NULL,
  `reason` varchar(500) DEFAULT NULL,
  `reference_summary` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_design_storage_cleanup_results_run` (`cleanup_run_id`,`result`,`id`),
  KEY `idx_design_storage_cleanup_results_asset` (`asset_kind`,`asset_id`),
  CONSTRAINT `fk_design_storage_cleanup_results_run` FOREIGN KEY (`cleanup_run_id`) REFERENCES `design_storage_cleanup_runs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `saved_designs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `saved_designs` (
  `user_id` int unsigned NOT NULL,
  `local_design_id` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`local_design_id`),
  KEY `idx_saved_designs_design_id` (`local_design_id`),
  KEY `idx_saved_designs_user_created` (`user_id`,`created_at`,`local_design_id`),
  CONSTRAINT `fk_saved_designs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_saved_designs_local_design` FOREIGN KEY (`local_design_id`) REFERENCES `local_designs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `local_design_tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `local_design_tags` (
  `local_design_id` int unsigned NOT NULL,
  `tag_id` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`local_design_id`,`tag_id`),
  KEY `idx_local_design_tags_tag_id` (`tag_id`),
  CONSTRAINT `fk_local_design_tags_design` FOREIGN KEY (`local_design_id`) REFERENCES `local_designs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_local_design_tags_tag` FOREIGN KEY (`tag_id`) REFERENCES `design_tags` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `local_design_audit_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `local_design_audit_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `local_design_id` int unsigned NOT NULL,
  `actor_id` int unsigned DEFAULT NULL,
  `actor_type` enum('system','user','admin') NOT NULL DEFAULT 'system',
  `event_type` varchar(80) NOT NULL,
  `from_status` varchar(80) DEFAULT NULL,
  `to_status` varchar(80) DEFAULT NULL,
  `summary` text,
  `metadata` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_design_audit_design_created` (`local_design_id`,`created_at`,`id`),
  KEY `idx_design_audit_actor_created` (`actor_id`,`created_at`,`id`),
  CONSTRAINT `fk_design_audit_design` FOREIGN KEY (`local_design_id`) REFERENCES `local_designs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_design_audit_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `local_design_moderation_renders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `local_design_moderation_renders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `local_design_id` int unsigned NOT NULL,
  `angle_label` varchar(80) NOT NULL,
  `file_object_id` bigint unsigned DEFAULT NULL,
  `moderation_status` enum('pending','passed','flagged','failed') NOT NULL DEFAULT 'pending',
  `moderation_flags` json DEFAULT NULL,
  `moderation_summary` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_design_renders_design_created` (`local_design_id`,`created_at`,`id`),
  KEY `idx_local_design_renders_file_object` (`file_object_id`),
  CONSTRAINT `fk_design_renders_design` FOREIGN KEY (`local_design_id`) REFERENCES `local_designs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_local_design_renders_file_object` FOREIGN KEY (`file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

DROP TABLE IF EXISTS `local_design_moderation_run_items`;
DROP TABLE IF EXISTS `local_design_moderation_runs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `local_design_moderation_runs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `local_design_id` int unsigned NOT NULL,
  `trigger_kind` enum('publish','owner_edit','admin_recheck','startup_retry') NOT NULL,
  `actor_id` int unsigned DEFAULT NULL,
  `actor_type` enum('system','user','admin') NOT NULL DEFAULT 'system',
  `status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
  `provider` varchar(40) NOT NULL DEFAULT 'openai',
  `moderation_model` varchar(120) NOT NULL,
  `policy_model` varchar(120) DEFAULT NULL,
  `policy_version` varchar(80) NOT NULL,
  `content_hash` char(64) NOT NULL,
  `final_decision` enum('auto_approved','needs_admin_review') DEFAULT NULL,
  `summary` text,
  `feedback` text,
  `flags` json DEFAULT NULL,
  `error_message` text,
  `queued_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `started_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ldmr_design_created` (`local_design_id`,`created_at`,`id`),
  KEY `idx_ldmr_status_queue` (`status`,`queued_at`,`id`),
  KEY `idx_ldmr_design_hash_decision` (`local_design_id`,`content_hash`,`status`,`final_decision`),
  KEY `fk_ldmr_actor` (`actor_id`),
  CONSTRAINT `fk_ldmr_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ldmr_design` FOREIGN KEY (`local_design_id`) REFERENCES `local_designs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

DROP TABLE IF EXISTS `local_design_moderation_run_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `local_design_moderation_run_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `run_id` bigint unsigned NOT NULL,
  `local_design_id` int unsigned NOT NULL,
  `item_type` enum('metadata','file_name','image_name','gallery_image','model_snapshot','model_render','policy_classification') NOT NULL,
  `local_design_file_id` int unsigned DEFAULT NULL,
  `local_design_image_id` int unsigned DEFAULT NULL,
  `file_object_id` bigint unsigned DEFAULT NULL,
  `label` varchar(500) NOT NULL,
  `input_hash` char(64) NOT NULL,
  `status` enum('pending','passed','flagged','failed','skipped') NOT NULL DEFAULT 'pending',
  `provider` varchar(40) NOT NULL DEFAULT 'openai',
  `model` varchar(120) DEFAULT NULL,
  `categories` json DEFAULT NULL,
  `category_scores` json DEFAULT NULL,
  `policy_result` json DEFAULT NULL,
  `summary` text,
  `error_message` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ldmri_run_created` (`run_id`,`created_at`,`id`),
  KEY `idx_ldmri_design_type_status` (`local_design_id`,`item_type`,`status`),
  KEY `idx_ldmri_file_object` (`file_object_id`),
  KEY `idx_ldmri_design_file` (`local_design_file_id`),
  KEY `idx_ldmri_design_image` (`local_design_image_id`),
  CONSTRAINT `fk_ldmri_run` FOREIGN KEY (`run_id`) REFERENCES `local_design_moderation_runs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ldmri_design` FOREIGN KEY (`local_design_id`) REFERENCES `local_designs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ldmri_design_file` FOREIGN KEY (`local_design_file_id`) REFERENCES `local_design_files` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ldmri_design_image` FOREIGN KEY (`local_design_image_id`) REFERENCES `local_design_images` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ldmri_file_object` FOREIGN KEY (`file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `external_integration_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `external_integration_tokens` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `provider` varchar(80) NOT NULL,
  `access_token_encrypted` text NOT NULL,
  `refresh_token_encrypted` text NOT NULL,
  `token_type` varchar(40) NOT NULL DEFAULT 'Bearer',
  `expires_at` timestamp NULL DEFAULT NULL,
  `scope` varchar(500) DEFAULT NULL,
  `account_user_id` varchar(120) DEFAULT NULL,
  `connected_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_external_integration_tokens_provider` (`provider`),
  KEY `idx_external_integration_tokens_expires_at` (`expires_at`),
  KEY `fk_external_integration_tokens_connected_by` (`connected_by`),
  CONSTRAINT `fk_external_integration_tokens_connected_by` FOREIGN KEY (`connected_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `design_overrides`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `design_overrides` (
  `id` int NOT NULL AUTO_INCREMENT,
  `mmf_object_id` int unsigned NOT NULL,
  `is_hidden` tinyint(1) NOT NULL DEFAULT '0',
  `is_pinned` tinyint(1) NOT NULL DEFAULT '0',
  `is_print_ready` tinyint(1) NOT NULL DEFAULT '0',
  `linked_local_design_id` int unsigned DEFAULT NULL,
  `mapping_status` enum('not_requested','needs_file','mapped','manual_link','failed') NOT NULL DEFAULT 'not_requested',
  `mapping_error` text,
  `mapping_metadata` json DEFAULT NULL,
  `print_ready_verified_at` timestamp NULL DEFAULT NULL,
  `print_ready_verified_by` int unsigned DEFAULT NULL,
  `client_note` text,
  `created_by` int unsigned NOT NULL,
  `updated_by` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_design_overrides_mmf_object_id` (`mmf_object_id`),
  KEY `idx_design_overrides_linked_local_design_id` (`linked_local_design_id`),
  KEY `idx_design_overrides_mapping_status` (`mapping_status`),
  KEY `fk_design_overrides_print_ready_verified_by` (`print_ready_verified_by`),
  KEY `fk_design_overrides_created_by` (`created_by`),
  KEY `fk_design_overrides_updated_by` (`updated_by`),
  CONSTRAINT `fk_design_overrides_linked_local_design` FOREIGN KEY (`linked_local_design_id`) REFERENCES `local_designs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_design_overrides_print_ready_verified_by` FOREIGN KEY (`print_ready_verified_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_design_overrides_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_design_overrides_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `mmf_print_ready_files`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `mmf_print_ready_files` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `mmf_object_id` int unsigned NOT NULL,
  `mmf_file_id` int unsigned DEFAULT NULL,
  `archive_entry_path` varchar(500) DEFAULT NULL,
  `archive_entry_name` varchar(255) DEFAULT NULL,
  `file_object_id` bigint unsigned DEFAULT NULL,
  `model_snapshot_file_object_id` bigint unsigned DEFAULT NULL,
  `original_file_name` varchar(255) DEFAULT NULL,
  `extension` varchar(20) DEFAULT NULL,
  `file_size` int unsigned DEFAULT NULL,
  `checksum_sha256` char(64) DEFAULT NULL,
  `source_url` varchar(500) DEFAULT NULL,
  `license_snapshot` json DEFAULT NULL,
  `source_snapshot` json DEFAULT NULL,
  `mapped_by` int unsigned DEFAULT NULL,
  `verified_by` int unsigned DEFAULT NULL,
  `verified_at` timestamp NULL DEFAULT NULL,
  `status` enum('cached','failed','removed','archived') NOT NULL DEFAULT 'cached',
  `error_message` text,
  `storage_status` enum('present','delete_pending','deleted','missing','delete_failed') NOT NULL DEFAULT 'present',
  `storage_deleted_at` datetime DEFAULT NULL,
  `storage_delete_reason` varchar(500) DEFAULT NULL,
  `storage_cleanup_job_id` bigint unsigned DEFAULT NULL,
  `last_storage_check_at` datetime DEFAULT NULL,
  `sort_order` int unsigned NOT NULL DEFAULT '0',
  `is_primary` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mmf_print_ready_files_selection` (`mmf_object_id`,`mmf_file_id`,`archive_entry_path`),
  KEY `idx_mmf_print_ready_files_object_order` (`mmf_object_id`,`status`,`is_primary`,`sort_order`,`id`),
  KEY `idx_mmf_print_ready_files_status` (`status`),
  KEY `idx_mmf_print_ready_files_storage_cleanup` (`storage_status`,`status`,`updated_at`,`id`),
  KEY `idx_mmf_print_ready_files_file_object` (`file_object_id`),
  KEY `idx_mmf_print_ready_files_snapshot_file_object` (`model_snapshot_file_object_id`),
  KEY `fk_mmf_print_ready_files_mapped_by` (`mapped_by`),
  KEY `fk_mmf_print_ready_files_verified_by` (`verified_by`),
  CONSTRAINT `fk_mmf_print_ready_files_file_object` FOREIGN KEY (`file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_mmf_print_ready_files_snapshot_file_object` FOREIGN KEY (`model_snapshot_file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_mmf_print_ready_files_mapped_by` FOREIGN KEY (`mapped_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_mmf_print_ready_files_verified_by` FOREIGN KEY (`verified_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `quote_records`;
DROP TABLE IF EXISTS `quote_attempts`;
DROP TABLE IF EXISTS `cart_items`;
DROP TABLE IF EXISTS `quote_assets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `quote_assets` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `owner_user_id` int unsigned DEFAULT NULL,
  `source_type` enum('upload','library','mmf') NOT NULL,
  `design_id` int unsigned DEFAULT NULL,
  `file_object_id` bigint unsigned DEFAULT NULL,
  `file_original_name` varchar(255) DEFAULT NULL,
  `file_mime_type` varchar(120) DEFAULT NULL,
  `file_size` int unsigned DEFAULT NULL,
  `thumbnail_file_object_id` bigint unsigned DEFAULT NULL,
  `status` enum('active','used','expired','deleted') NOT NULL DEFAULT 'active',
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_quote_assets_owner_status_expires` (`owner_user_id`,`status`,`expires_at`),
  KEY `idx_quote_assets_owner_status_expires_id` (`owner_user_id`,`status`,`expires_at`,`id`),
  KEY `idx_quote_assets_status_expires` (`status`,`expires_at`,`id`),
  KEY `idx_quote_assets_file_object` (`file_object_id`),
  KEY `idx_quote_assets_thumbnail_file_object` (`thumbnail_file_object_id`),
  CONSTRAINT `fk_quote_assets_file_object` FOREIGN KEY (`file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_quote_assets_owner_user` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_quote_assets_thumbnail_file_object` FOREIGN KEY (`thumbnail_file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `quote_records` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `quote_token_hash` char(64) NOT NULL,
  `quote_asset_id` bigint unsigned DEFAULT NULL,
  `owner_user_id` int unsigned DEFAULT NULL,
  `source_type` enum('upload','library','mmf') NOT NULL,
  `design_id` int unsigned DEFAULT NULL,
  `file_object_id` bigint unsigned DEFAULT NULL,
  `file_original_name` varchar(255) DEFAULT NULL,
  `file_mime_type` varchar(120) DEFAULT NULL,
  `file_size` int unsigned DEFAULT NULL,
  `thumbnail_file_object_id` bigint unsigned DEFAULT NULL,
  `material` varchar(50) NOT NULL,
  `material_color_id` bigint unsigned DEFAULT NULL,
  `material_color_name` varchar(80) DEFAULT NULL,
  `material_color_hex` varchar(7) DEFAULT NULL,
  `print_quality` enum('draft','standard','fine') NOT NULL,
  `infill` decimal(5,2) NOT NULL,
  `quantity` int unsigned NOT NULL,
  `estimated_cost` decimal(10,2) NOT NULL,
  `design_snapshot` json DEFAULT NULL,
  `quote_snapshot` json NOT NULL,
  `pricing_config_snapshot` json NOT NULL,
  `material_snapshot` json NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `quote_token_hash` (`quote_token_hash`),
  KEY `idx_quote_records_asset_created` (`quote_asset_id`,`created_at`,`id`),
  KEY `idx_quote_records_expires_at` (`expires_at`),
  KEY `idx_quote_records_used_at` (`used_at`),
  KEY `idx_quote_records_material_color_id` (`material_color_id`),
  KEY `idx_quote_records_file_object` (`file_object_id`),
  KEY `idx_quote_records_thumbnail_file_object` (`thumbnail_file_object_id`),
  KEY `idx_quote_records_owner_user` (`owner_user_id`,`used_at`,`expires_at`),
  KEY `idx_quote_records_owner_used_expires_created` (`owner_user_id`,`used_at`,`expires_at`,`created_at`,`id`),
  CONSTRAINT `fk_quote_records_asset` FOREIGN KEY (`quote_asset_id`) REFERENCES `quote_assets` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_quote_records_file_object` FOREIGN KEY (`file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_quote_records_material_color` FOREIGN KEY (`material_color_id`) REFERENCES `material_colors` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_quote_records_owner_user` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_quote_records_thumbnail_file_object` FOREIGN KEY (`thumbnail_file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_quote_records_infill` CHECK (((`infill` >= 0) and (`infill` <= 100))),
  CONSTRAINT `chk_quote_records_quantity` CHECK ((`quantity` >= 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cart_items` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `quote_record_id` int unsigned NOT NULL,
  `status` enum('active','submitted','removed') NOT NULL DEFAULT 'active',
  `submitted_at` datetime DEFAULT NULL,
  `removed_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cart_items_user_quote` (`user_id`,`quote_record_id`),
  KEY `idx_cart_items_user_status_created` (`user_id`,`status`,`created_at`,`id`),
  KEY `idx_cart_items_quote_status` (`quote_record_id`,`status`),
  CONSTRAINT `fk_cart_items_quote_record` FOREIGN KEY (`quote_record_id`) REFERENCES `quote_records` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_cart_items_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `quote_attempts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `source_type` enum('upload','library','mmf') NOT NULL,
  `source_identifier` varchar(120) DEFAULT NULL,
  `user_id` int unsigned DEFAULT NULL,
  `material` varchar(50) DEFAULT NULL,
  `material_color_id` bigint unsigned DEFAULT NULL,
  `material_color_name` varchar(80) DEFAULT NULL,
  `material_color_hex` varchar(7) DEFAULT NULL,
  `print_quality` enum('draft','standard','fine') DEFAULT NULL,
  `infill` decimal(5,2) DEFAULT NULL,
  `quantity` int unsigned DEFAULT NULL,
  `file_original_name` varchar(255) DEFAULT NULL,
  `status` enum('success','failed') NOT NULL,
  `error_status_code` int unsigned DEFAULT NULL,
  `error_message` text,
  `quote_record_id` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_quote_attempts_created_at` (`created_at`),
  KEY `idx_quote_attempts_status_created_at` (`status`,`created_at`),
  KEY `idx_quote_attempts_source_type` (`source_type`),
  KEY `fk_quote_attempts_user` (`user_id`),
  KEY `fk_quote_attempts_quote_record` (`quote_record_id`),
  CONSTRAINT `fk_quote_attempts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_quote_attempts_quote_record` FOREIGN KEY (`quote_record_id`) REFERENCES `quote_records` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `print_request_items`;
DROP TABLE IF EXISTS `request_draft_items`;
DROP TABLE IF EXISTS `request_drafts`;
DROP TABLE IF EXISTS `print_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `print_requests` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `reference_number` varchar(40) NOT NULL,
  `client_id` int unsigned NOT NULL,
  `source_type` enum('upload','library','mmf') NOT NULL,
  `design_id` int unsigned DEFAULT NULL,
  `file_object_id` bigint unsigned DEFAULT NULL,
  `file_original_name` varchar(255) DEFAULT NULL,
  `file_mime_type` varchar(120) DEFAULT NULL,
  `file_size` int unsigned DEFAULT NULL,
  `requestor_name` varchar(160) DEFAULT NULL,
  `contact_number` varchar(60) DEFAULT NULL,
  `college_department` varchar(160) DEFAULT NULL,
  `purpose` text,
  `design_snapshot` json DEFAULT NULL,
  `quote_token` varchar(64) DEFAULT NULL,
  `quote_snapshot` json DEFAULT NULL,
  `material` varchar(50) NOT NULL,
  `material_color_id` bigint unsigned DEFAULT NULL,
  `material_color_name` varchar(80) DEFAULT NULL,
  `material_color_hex` varchar(7) DEFAULT NULL,
  `print_quality` enum('draft','standard','fine') NOT NULL,
  `infill` decimal(5,2) NOT NULL,
  `quantity` int unsigned NOT NULL,
  `notes` text,
  `estimated_cost` decimal(10,2) DEFAULT NULL,
  `confirmed_cost` decimal(10,2) DEFAULT NULL,
  `payment_slip_file_object_id` bigint unsigned DEFAULT NULL,
  `payment_slip_generated_at` datetime DEFAULT NULL,
  `payment_slip_generated_by` int unsigned DEFAULT NULL,
  `receipt_original_name` varchar(255) DEFAULT NULL,
  `receipt_mime_type` varchar(120) DEFAULT NULL,
  `receipt_size` int unsigned DEFAULT NULL,
  `receipt_uploaded_at` datetime DEFAULT NULL,
  `receipt_reference_number` varchar(120) DEFAULT NULL,
  `receipt_verified_at` datetime DEFAULT NULL,
  `receipt_verified_by` int unsigned DEFAULT NULL,
  `receipt_verification_note` text,
  `terms_accepted_at` datetime DEFAULT NULL,
  `terms_version` varchar(50) DEFAULT NULL,
  `status` enum('pending_review','design_in_progress','approved','payment_slip_issued','payment_verified','printing','completed','rejected','cancelled') NOT NULL DEFAULT 'pending_review',
  `rejection_reason` text,
  `archived_at` datetime DEFAULT NULL,
  `archived_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reference_number` (`reference_number`),
  KEY `fk_print_requests_local_design` (`design_id`),
  KEY `idx_print_requests_client_id` (`client_id`),
  KEY `idx_print_requests_status` (`status`),
  KEY `idx_print_requests_source_type` (`source_type`),
  KEY `idx_print_requests_material_color_id` (`material_color_id`),
  KEY `idx_print_requests_created_at` (`created_at`),
  KEY `idx_print_requests_archived_status_created_at` (`archived_at`,`status`,`created_at`,`id`),
  KEY `idx_print_requests_client_archive_status_created` (`client_id`,`archived_at`,`status`,`created_at`,`id`),
  KEY `idx_print_requests_archive_status_source_created` (`archived_at`,`status`,`source_type`,`created_at`,`id`),
  KEY `idx_print_requests_file_object` (`file_object_id`),
  KEY `idx_print_requests_payment_slip_file_object` (`payment_slip_file_object_id`),
  KEY `fk_print_requests_archived_by` (`archived_by`),
  KEY `fk_print_requests_payment_slip_generated_by` (`payment_slip_generated_by`),
  KEY `fk_print_requests_receipt_verified_by` (`receipt_verified_by`),
  CONSTRAINT `fk_print_requests_client` FOREIGN KEY (`client_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_print_requests_file_object` FOREIGN KEY (`file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_print_requests_local_design` FOREIGN KEY (`design_id`) REFERENCES `local_designs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_print_requests_material_color` FOREIGN KEY (`material_color_id`) REFERENCES `material_colors` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_print_requests_payment_slip_file_object` FOREIGN KEY (`payment_slip_file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_print_requests_payment_slip_generated_by` FOREIGN KEY (`payment_slip_generated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_print_requests_receipt_verified_by` FOREIGN KEY (`receipt_verified_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_print_requests_archived_by` FOREIGN KEY (`archived_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_print_requests_infill` CHECK (((`infill` >= 0) and (`infill` <= 100))),
  CONSTRAINT `chk_print_requests_quantity` CHECK ((`quantity` >= 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `request_drafts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `draft_token` char(64) NOT NULL,
  `user_id` int unsigned NOT NULL,
  `status` enum('active','submitted','expired','abandoned') NOT NULL DEFAULT 'active',
  `source` enum('single_quote','cart','selected_cart') NOT NULL DEFAULT 'cart',
  `expires_at` datetime NOT NULL,
  `submitted_print_request_id` int unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_request_drafts_token` (`draft_token`),
  KEY `idx_request_drafts_user_status_expires` (`user_id`,`status`,`expires_at`),
  KEY `idx_request_drafts_submitted_request` (`submitted_print_request_id`),
  CONSTRAINT `fk_request_drafts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_request_drafts_print_request` FOREIGN KEY (`submitted_print_request_id`) REFERENCES `print_requests` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `request_draft_items` (
  `draft_id` int unsigned NOT NULL,
  `cart_item_id` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`draft_id`,`cart_item_id`),
  KEY `idx_request_draft_items_cart_item` (`cart_item_id`),
  CONSTRAINT `fk_request_draft_items_draft` FOREIGN KEY (`draft_id`) REFERENCES `request_drafts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_request_draft_items_cart_item` FOREIGN KEY (`cart_item_id`) REFERENCES `cart_items` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `print_request_items` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `print_request_id` int unsigned NOT NULL,
  `source_type` enum('upload','library','mmf') NOT NULL,
  `design_id` int unsigned DEFAULT NULL,
  `file_object_id` bigint unsigned DEFAULT NULL,
  `file_original_name` varchar(255) DEFAULT NULL,
  `file_mime_type` varchar(120) DEFAULT NULL,
  `file_size` int unsigned DEFAULT NULL,
  `thumbnail_file_object_id` bigint unsigned DEFAULT NULL,
  `design_snapshot` json DEFAULT NULL,
  `quote_token` varchar(64) DEFAULT NULL,
  `quote_snapshot` json NOT NULL,
  `pricing_config_snapshot` json NOT NULL,
  `material_snapshot` json NOT NULL,
  `material` varchar(50) NOT NULL,
  `material_color_id` bigint unsigned DEFAULT NULL,
  `material_color_name` varchar(80) DEFAULT NULL,
  `material_color_hex` varchar(7) DEFAULT NULL,
  `print_quality` enum('draft','standard','fine') NOT NULL,
  `infill` decimal(5,2) NOT NULL,
  `quantity` int unsigned NOT NULL,
  `estimated_cost` decimal(10,2) NOT NULL,
  `confirmed_cost` decimal(10,2) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_print_request_items_request` (`print_request_id`,`id`),
  KEY `idx_print_request_items_design_id` (`design_id`),
  KEY `idx_print_request_items_source_type` (`source_type`),
  KEY `idx_print_request_items_material_color_id` (`material_color_id`),
  KEY `idx_print_request_items_file_object` (`file_object_id`),
  KEY `idx_print_request_items_thumbnail_file_object` (`thumbnail_file_object_id`),
  CONSTRAINT `fk_print_request_items_file_object` FOREIGN KEY (`file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_print_request_items_request` FOREIGN KEY (`print_request_id`) REFERENCES `print_requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_print_request_items_local_design` FOREIGN KEY (`design_id`) REFERENCES `local_designs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_print_request_items_material_color` FOREIGN KEY (`material_color_id`) REFERENCES `material_colors` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_print_request_items_thumbnail_file_object` FOREIGN KEY (`thumbnail_file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_print_request_items_infill` CHECK (((`infill` >= 0) and (`infill` <= 100))),
  CONSTRAINT `chk_print_request_items_quantity` CHECK ((`quantity` >= 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `print_request_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `print_request_events` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `print_request_id` int unsigned NOT NULL,
  `event_type` enum('transition','correction') NOT NULL,
  `from_status` enum('pending_review','design_in_progress','approved','payment_slip_issued','payment_verified','printing','completed','rejected','cancelled') DEFAULT NULL,
  `to_status` enum('pending_review','design_in_progress','approved','payment_slip_issued','payment_verified','printing','completed','rejected','cancelled') DEFAULT NULL,
  `previous_state_snapshot` json DEFAULT NULL,
  `next_state_snapshot` json DEFAULT NULL,
  `changed_by` int unsigned NOT NULL,
  `changed_by_role` enum('client','admin','system') NOT NULL,
  `note` text,
  `reverted_at` datetime DEFAULT NULL,
  `reverted_by` int unsigned DEFAULT NULL,
  `reverted_by_event_id` int unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_print_request_events_request_created` (`print_request_id`,`created_at`,`id`),
  KEY `idx_print_request_events_type_reverted` (`event_type`,`reverted_at`),
  KEY `fk_print_request_events_changed_by` (`changed_by`),
  KEY `fk_print_request_events_reverted_by` (`reverted_by`),
  KEY `fk_print_request_events_reverted_by_event` (`reverted_by_event_id`),
  CONSTRAINT `fk_print_request_events_request` FOREIGN KEY (`print_request_id`) REFERENCES `print_requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_print_request_events_changed_by` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_print_request_events_reverted_by` FOREIGN KEY (`reverted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_print_request_events_reverted_by_event` FOREIGN KEY (`reverted_by_event_id`) REFERENCES `print_request_events` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `print_request_status_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `print_request_status_history` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `print_request_id` int unsigned NOT NULL,
  `status` enum('pending_review','design_in_progress','approved','payment_slip_issued','payment_verified','printing','completed','rejected','cancelled') NOT NULL,
  `changed_by` int unsigned NOT NULL,
  `changed_by_role` enum('client','admin','system') NOT NULL,
  `note` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_print_request_status_history_user` (`changed_by`),
  KEY `idx_print_request_status_history_request_id` (`print_request_id`),
  CONSTRAINT `fk_print_request_status_history_request` FOREIGN KEY (`print_request_id`) REFERENCES `print_requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_print_request_status_history_user` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;


