
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
  `refresh_token` text,
  `forgot_password_token` varchar(255) DEFAULT NULL,
  `forgot_password_expiry` datetime DEFAULT NULL,
  `email_verification_token` varchar(255) DEFAULT NULL,
  `email_verification_expiry` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `materials`;
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
  `material_cost_per_gram` json NOT NULL,
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
  `version_number` int unsigned NOT NULL DEFAULT '1',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `uploaded_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_slicer_profiles_material_quality_version` (`material_id`,`quality`,`version_number`),
  KEY `idx_slicer_profiles_material_quality_active` (`material_id`,`quality`,`is_active`),
  KEY `idx_slicer_profiles_uploaded_by` (`uploaded_by`),
  CONSTRAINT `fk_slicer_profiles_material` FOREIGN KEY (`material_id`) REFERENCES `materials` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_slicer_profiles_uploaded_by` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_slicer_profiles_quality` CHECK ((`quality` in (_utf8mb4'draft',_utf8mb4'standard',_utf8mb4'fine')))
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
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `printers` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `model` varchar(120) DEFAULT NULL,
  `technology` varchar(80) NOT NULL DEFAULT 'FDM',
  `build_volume` varchar(120) DEFAULT NULL,
  `nozzle_size` varchar(40) DEFAULT NULL,
  `supported_materials` json DEFAULT NULL,
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
DROP TABLE IF EXISTS `local_designs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `local_designs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `description` text,
  `thumbnail_url` varchar(1000) DEFAULT NULL,
  `file_url` varchar(1000) DEFAULT NULL,
  `material` varchar(100) DEFAULT NULL,
  `dimensions` varchar(255) DEFAULT NULL,
  `license_type` varchar(255) DEFAULT NULL,
  `category_id` int unsigned DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `uploaded_by` int unsigned NOT NULL,
  `archived_at` datetime DEFAULT NULL,
  `archived_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_local_designs_uploaded_by` (`uploaded_by`),
  KEY `idx_local_designs_category_id` (`category_id`),
  KEY `idx_local_designs_archived_active_created_at` (`archived_at`,`is_active`,`created_at`,`id`),
  KEY `fk_local_designs_archived_by` (`archived_by`),
  CONSTRAINT `fk_local_designs_uploaded_by` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_local_designs_category` FOREIGN KEY (`category_id`) REFERENCES `design_categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_local_designs_archived_by` FOREIGN KEY (`archived_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `local_design_tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `local_design_tags` (
  `local_design_id` int NOT NULL,
  `tag_id` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`local_design_id`,`tag_id`),
  KEY `idx_local_design_tags_tag_id` (`tag_id`),
  CONSTRAINT `fk_local_design_tags_design` FOREIGN KEY (`local_design_id`) REFERENCES `local_designs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_local_design_tags_tag` FOREIGN KEY (`tag_id`) REFERENCES `design_tags` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
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
  `linked_local_design_id` int DEFAULT NULL,
  `client_note` text,
  `created_by` int unsigned NOT NULL,
  `updated_by` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_design_overrides_mmf_object_id` (`mmf_object_id`),
  KEY `idx_design_overrides_linked_local_design_id` (`linked_local_design_id`),
  KEY `fk_design_overrides_created_by` (`created_by`),
  KEY `fk_design_overrides_updated_by` (`updated_by`),
  CONSTRAINT `fk_design_overrides_linked_local_design` FOREIGN KEY (`linked_local_design_id`) REFERENCES `local_designs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_design_overrides_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_design_overrides_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `design_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `design_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `requested_by` int unsigned NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text NOT NULL,
  `preferred_material` varchar(100) DEFAULT NULL,
  `dimensions` varchar(255) DEFAULT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  `reference_files` json DEFAULT NULL,
  `result_design_id` int DEFAULT NULL,
  `status` enum('pending','under_review','approved','rejected','completed') NOT NULL DEFAULT 'pending',
  `admin_note` text,
  `archived_at` datetime DEFAULT NULL,
  `archived_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_design_requests_requested_by_created_at` (`requested_by`,`created_at`,`id`),
  KEY `idx_design_requests_created_at` (`created_at`,`id`),
  KEY `idx_design_requests_status_created_at` (`status`,`created_at`,`id`),
  KEY `idx_design_requests_result_design_id` (`result_design_id`),
  KEY `idx_design_requests_archived_status_created_at` (`archived_at`,`status`,`created_at`,`id`),
  KEY `fk_design_requests_archived_by` (`archived_by`),
  CONSTRAINT `fk_design_requests_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_design_requests_archived_by` FOREIGN KEY (`archived_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `quote_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `quote_records` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `quote_token_hash` char(64) NOT NULL,
  `source_type` enum('upload','library','design_request','mmf') NOT NULL,
  `design_id` int unsigned DEFAULT NULL,
  `design_request_id` int unsigned DEFAULT NULL,
  `file_url` varchar(500) DEFAULT NULL,
  `file_original_name` varchar(255) DEFAULT NULL,
  `file_mime_type` varchar(120) DEFAULT NULL,
  `file_size` int unsigned DEFAULT NULL,
  `material` varchar(50) NOT NULL,
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
  KEY `idx_quote_records_expires_at` (`expires_at`),
  KEY `idx_quote_records_used_at` (`used_at`),
  CONSTRAINT `chk_quote_records_infill` CHECK (((`infill` >= 0) and (`infill` <= 100))),
  CONSTRAINT `chk_quote_records_quantity` CHECK ((`quantity` >= 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `print_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `print_requests` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `reference_number` varchar(40) NOT NULL,
  `client_id` int unsigned NOT NULL,
  `source_type` enum('upload','library','design_request','mmf') NOT NULL,
  `design_id` int DEFAULT NULL,
  `design_request_id` int DEFAULT NULL,
  `file_url` varchar(500) DEFAULT NULL,
  `file_original_name` varchar(255) DEFAULT NULL,
  `file_mime_type` varchar(120) DEFAULT NULL,
  `file_size` int unsigned DEFAULT NULL,
  `design_snapshot` json DEFAULT NULL,
  `quote_token` varchar(64) DEFAULT NULL,
  `quote_snapshot` json DEFAULT NULL,
  `material` varchar(50) NOT NULL,
  `print_quality` enum('draft','standard','fine') NOT NULL,
  `infill` decimal(5,2) NOT NULL,
  `quantity` int unsigned NOT NULL,
  `notes` text,
  `estimated_cost` decimal(10,2) DEFAULT NULL,
  `confirmed_cost` decimal(10,2) DEFAULT NULL,
  `payment_slip_url` varchar(500) DEFAULT NULL,
  `receipt_url` varchar(500) DEFAULT NULL,
  `receipt_original_name` varchar(255) DEFAULT NULL,
  `receipt_mime_type` varchar(120) DEFAULT NULL,
  `receipt_size` int unsigned DEFAULT NULL,
  `receipt_uploaded_at` datetime DEFAULT NULL,
  `terms_accepted_at` datetime DEFAULT NULL,
  `terms_version` varchar(50) DEFAULT NULL,
  `status` enum('pending_review','design_in_progress','approved','payment_slip_issued','payment_verified','printing','completed','rejected') NOT NULL DEFAULT 'pending_review',
  `rejection_reason` text,
  `archived_at` datetime DEFAULT NULL,
  `archived_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reference_number` (`reference_number`),
  KEY `fk_print_requests_local_design` (`design_id`),
  KEY `fk_print_requests_design_request` (`design_request_id`),
  KEY `idx_print_requests_client_id` (`client_id`),
  KEY `idx_print_requests_status` (`status`),
  KEY `idx_print_requests_source_type` (`source_type`),
  KEY `idx_print_requests_created_at` (`created_at`),
  KEY `idx_print_requests_archived_status_created_at` (`archived_at`,`status`,`created_at`,`id`),
  KEY `fk_print_requests_archived_by` (`archived_by`),
  CONSTRAINT `fk_print_requests_client` FOREIGN KEY (`client_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_print_requests_design_request` FOREIGN KEY (`design_request_id`) REFERENCES `design_requests` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_print_requests_local_design` FOREIGN KEY (`design_id`) REFERENCES `local_designs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_print_requests_archived_by` FOREIGN KEY (`archived_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_print_requests_infill` CHECK (((`infill` >= 0) and (`infill` <= 100))),
  CONSTRAINT `chk_print_requests_quantity` CHECK ((`quantity` >= 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `print_request_status_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `print_request_status_history` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `print_request_id` int unsigned NOT NULL,
  `status` enum('pending_review','design_in_progress','approved','payment_slip_issued','payment_verified','printing','completed','rejected') NOT NULL,
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


