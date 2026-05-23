-- UniFab baseline system seed data.
-- User accounts are seeded by scripts/db-seed.js so passwords are hashed by Node.
-- This file intentionally avoids quote records, print requests, and design rows.

INSERT INTO materials (
  id,
  material_key,
  display_name,
  material_cost_per_gram,
  is_active
)
VALUES
  (1, 'PLA', 'PLA', 1.5000, TRUE),
  (2, 'PETG', 'PETG', 1.8000, TRUE),
  (3, 'TPU', 'TPU Flexible', 2.3500, FALSE)
ON DUPLICATE KEY UPDATE
  material_key = VALUES(material_key),
  display_name = VALUES(display_name),
  material_cost_per_gram = VALUES(material_cost_per_gram),
  is_active = VALUES(is_active);

INSERT INTO material_colors (
  id,
  material_id,
  color_name,
  hex_code,
  is_active,
  display_order
)
VALUES
  (1, 1, 'Natural White', '#F7F4E8', TRUE, 10),
  (2, 1, 'Matte Black', '#1F2933', TRUE, 20),
  (3, 1, 'Lab Blue', '#2563EB', TRUE, 30),
  (4, 2, 'Clear', '#DDEAF3', TRUE, 10),
  (5, 2, 'Black', '#111827', TRUE, 20),
  (6, 2, 'Orange', '#F97316', TRUE, 30),
  (7, 3, 'Black', '#111827', TRUE, 10),
  (8, 3, 'Natural', '#E5E7EB', TRUE, 20)
ON DUPLICATE KEY UPDATE
  material_id = VALUES(material_id),
  color_name = VALUES(color_name),
  hex_code = VALUES(hex_code),
  is_active = VALUES(is_active),
  display_order = VALUES(display_order);

INSERT INTO pricing_config (
  id,
  machine_hour_rate,
  base_fee,
  waste_factor,
  support_markup_factor,
  electricity_cost_per_kwh,
  power_consumption_watts,
  currency,
  updated_by
)
VALUES (
  1,
  13.00,
  20.00,
  0.1500,
  0.1000,
  13.0000,
  180.00,
  'PHP',
  NULL
)
ON DUPLICATE KEY UPDATE
  machine_hour_rate = VALUES(machine_hour_rate),
  base_fee = VALUES(base_fee),
  waste_factor = VALUES(waste_factor),
  support_markup_factor = VALUES(support_markup_factor),
  electricity_cost_per_kwh = VALUES(electricity_cost_per_kwh),
  power_consumption_watts = VALUES(power_consumption_watts),
  currency = VALUES(currency),
  updated_by = VALUES(updated_by);

INSERT INTO design_categories (
  id,
  name,
  slug,
  description,
  is_active,
  created_by,
  updated_by
)
VALUES
  (1, 'Engineering Parts', 'engineering-parts', 'Functional parts, brackets, mounts, and mechanical prototypes.', TRUE, NULL, NULL),
  (2, 'Architecture & Models', 'architecture-models', 'Architectural models, scale studies, and presentation pieces.', TRUE, NULL, NULL),
  (3, 'Classroom & Learning', 'classroom-learning', 'Educational models, teaching aids, and course materials.', TRUE, NULL, NULL),
  (4, 'Lab Fixtures', 'lab-fixtures', 'Fixtures, jigs, organizers, and fabrication lab utility items.', TRUE, NULL, NULL),
  (5, 'Art & Display', 'art-display', 'Display objects, visual studies, and non-commercial creative work.', TRUE, NULL, NULL)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  slug = VALUES(slug),
  description = VALUES(description),
  is_active = VALUES(is_active),
  updated_by = VALUES(updated_by);

INSERT INTO design_tags (
  id,
  name,
  slug,
  is_active,
  created_by,
  updated_by
)
VALUES
  (1, 'Educational', 'educational', TRUE, NULL, NULL),
  (2, 'Prototype', 'prototype', TRUE, NULL, NULL),
  (3, 'Functional', 'functional', TRUE, NULL, NULL),
  (4, 'Replacement Part', 'replacement-part', TRUE, NULL, NULL),
  (5, 'Organizer', 'organizer', TRUE, NULL, NULL),
  (6, 'Robotics', 'robotics', TRUE, NULL, NULL),
  (7, 'Architecture', 'architecture', TRUE, NULL, NULL),
  (8, 'Quick Print', 'quick-print', TRUE, NULL, NULL),
  (9, 'Support-Free', 'support-free', TRUE, NULL, NULL),
  (10, 'Official Lab', 'official-lab', TRUE, NULL, NULL)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  slug = VALUES(slug),
  is_active = VALUES(is_active),
  updated_by = VALUES(updated_by);

INSERT INTO printers (
  id,
  name,
  model,
  technology,
  build_volume,
  nozzle_size,
  status,
  is_public,
  display_order,
  notes
)
VALUES (
  1,
  'Fabrication Lab FDM Printer',
  'Creality Ender 3 V3 SE',
  'FDM',
  '220 x 220 x 250 mm',
  '0.4mm',
  'active',
  TRUE,
  10,
  'Used for standard student and faculty print requests.'
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  model = VALUES(model),
  technology = VALUES(technology),
  build_volume = VALUES(build_volume),
  nozzle_size = VALUES(nozzle_size),
  status = VALUES(status),
  is_public = VALUES(is_public),
  display_order = VALUES(display_order),
  notes = VALUES(notes);

INSERT INTO printer_materials (printer_id, material_id)
VALUES
  (1, 1),
  (1, 2)
ON DUPLICATE KEY UPDATE
  printer_id = VALUES(printer_id),
  material_id = VALUES(material_id);

INSERT INTO file_objects (
  id,
  storage_provider,
  storage_key,
  public_path,
  original_file_name,
  mime_type,
  extension,
  visibility,
  storage_status,
  created_by
)
VALUES
  (1, 'local', 'slicer-profiles/library/ender3v3se-pla-draft.ini', NULL, 'ender3v3se-pla-draft.ini', 'text/plain', '.ini', 'private', 'present', NULL),
  (2, 'local', 'slicer-profiles/library/ender3v3se-pla-standard.ini', NULL, 'ender3v3se-pla-standard.ini', 'text/plain', '.ini', 'private', 'present', NULL),
  (3, 'local', 'slicer-profiles/library/ender3v3se-pla-fine.ini', NULL, 'ender3v3se-pla-fine.ini', 'text/plain', '.ini', 'private', 'present', NULL),
  (4, 'local', 'slicer-profiles/library/ender3v3se-petg-draft.ini', NULL, 'ender3v3se-petg-draft.ini', 'text/plain', '.ini', 'private', 'present', NULL),
  (5, 'local', 'slicer-profiles/library/ender3v3se-petg-standard.ini', NULL, 'ender3v3se-petg-standard.ini', 'text/plain', '.ini', 'private', 'present', NULL),
  (6, 'local', 'slicer-profiles/library/ender3v3se-petg-fine.ini', NULL, 'ender3v3se-petg-fine.ini', 'text/plain', '.ini', 'private', 'present', NULL),
  (7, 'local', 'slicer-profiles/library/pla-standard-v2-4d2566a0.ini', NULL, 'pla-standard-v2-4d2566a0.ini', 'text/plain', '.ini', 'private', 'present', NULL),
  (8, 'local', 'slicer-profiles/library/tpu-standard-v1-f08e0e89.ini', NULL, 'tpu-standard-v1-f08e0e89.ini', 'text/plain', '.ini', 'private', 'present', NULL),
  (9, 'local', 'slicer-profiles/library/tpu-standard-v2-e39ccc9b.ini', NULL, 'tpu-standard-v2-e39ccc9b.ini', 'text/plain', '.ini', 'private', 'present', NULL),
  (10, 'local', 'slicer-profiles/library/tpu-standard-v3-f7819d5f.ini', NULL, 'tpu-standard-v3-f7819d5f.ini', 'text/plain', '.ini', 'private', 'present', NULL)
ON DUPLICATE KEY UPDATE
  storage_provider = VALUES(storage_provider),
  public_path = VALUES(public_path),
  original_file_name = VALUES(original_file_name),
  mime_type = VALUES(mime_type),
  extension = VALUES(extension),
  visibility = VALUES(visibility),
  storage_status = VALUES(storage_status),
  created_by = VALUES(created_by);

INSERT INTO slicer_profiles (
  id,
  material_id,
  quality,
  printer_name,
  nozzle,
  support_rule,
  orientation_rule,
  profile_filename,
  file_object_id,
  version_number,
  is_active,
  validation_status,
  uploaded_by
)
VALUES
  (1, 1, 'draft', 'Creality Ender 3 V3 SE', '0.4mm', 'auto', 'original', 'ender3v3se-pla-draft.ini', 1, 1, TRUE, 'passed', NULL),
  (2, 1, 'standard', 'Creality Ender 3 V3 SE', '0.4mm', 'auto', 'original', 'ender3v3se-pla-standard.ini', 2, 1, FALSE, 'passed', NULL),
  (3, 1, 'fine', 'Creality Ender 3 V3 SE', '0.4mm', 'auto', 'original', 'ender3v3se-pla-fine.ini', 3, 1, TRUE, 'passed', NULL),
  (4, 2, 'draft', 'Creality Ender 3 V3 SE', '0.4mm', 'auto', 'original', 'ender3v3se-petg-draft.ini', 4, 1, TRUE, 'passed', NULL),
  (5, 2, 'standard', 'Creality Ender 3 V3 SE', '0.4mm', 'auto', 'original', 'ender3v3se-petg-standard.ini', 5, 1, TRUE, 'passed', NULL),
  (6, 2, 'fine', 'Creality Ender 3 V3 SE', '0.4mm', 'auto', 'original', 'ender3v3se-petg-fine.ini', 6, 1, TRUE, 'passed', NULL),
  (7, 1, 'standard', 'Creality Ender 3 V3 SE', '0.4mm', 'auto', 'original', 'pla-standard-v2-4d2566a0.ini', 7, 2, TRUE, 'passed', NULL),
  (8, 3, 'standard', 'Creality Ender 3 V3 SE', '0.4mm', 'auto', 'original', 'tpu-standard-v1-f08e0e89.ini', 8, 1, FALSE, 'passed', NULL),
  (9, 3, 'standard', 'Creality Ender 3 V3 SE', '0.4mm', 'auto', 'original', 'tpu-standard-v2-e39ccc9b.ini', 9, 2, FALSE, 'passed', NULL),
  (10, 3, 'standard', 'Creality Ender 3 V3 SE', '0.4mm', 'auto', 'original', 'tpu-standard-v3-f7819d5f.ini', 10, 3, TRUE, 'passed', NULL)
ON DUPLICATE KEY UPDATE
  material_id = VALUES(material_id),
  quality = VALUES(quality),
  printer_name = VALUES(printer_name),
  nozzle = VALUES(nozzle),
  support_rule = VALUES(support_rule),
  orientation_rule = VALUES(orientation_rule),
  profile_filename = VALUES(profile_filename),
  file_object_id = VALUES(file_object_id),
  version_number = VALUES(version_number),
  is_active = VALUES(is_active),
  validation_status = VALUES(validation_status),
  uploaded_by = VALUES(uploaded_by);
