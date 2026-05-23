ALTER TABLE `file_references`
  MODIFY COLUMN `status` enum(
    'active',
    'replaced',
    'removed',
    'expired',
    'archived',
    'deleted',
    'owner_deleted'
  ) NOT NULL DEFAULT 'active';
