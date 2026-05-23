import pool from "../db/db.js";

function getExecutor(connection) {
  return connection || pool;
}

function encodeCursor(row) {
  if (!row?.created_at || !row?.id) return null;
  return Buffer.from(
    JSON.stringify({
      createdAt: new Date(row.created_at).toISOString(),
      id: Number(row.id),
    }),
  ).toString("base64url");
}

function decodeCursor(cursor) {
  if (!cursor) return null;

  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), "base64url").toString());
    const createdAt = new Date(parsed.createdAt);
    const id = Number(parsed.id);

    if (!Number.isFinite(createdAt.getTime()) || !Number.isInteger(id)) {
      return null;
    }

    return { createdAt, id };
  } catch {
    return null;
  }
}

function serializeJson(value) {
  if (value === undefined || value === null) {
    return null;
  }

  return JSON.stringify(value);
}

async function createPrintRequest(payload, connection = null) {
  const executor = getExecutor(connection);

  const sql = `
    INSERT INTO print_requests (
      reference_number,
      client_id,
      source_type,
      design_id,
      file_object_id,
      file_original_name,
      file_mime_type,
      file_size,
      requestor_name,
      contact_number,
      college_department,
      purpose,
      design_snapshot,
      quote_token,
      quote_snapshot,
      material,
      material_color_id,
      material_color_name,
      material_color_hex,
      print_quality,
      infill,
      quantity,
      notes,
      estimated_cost,
      confirmed_cost,
      payment_slip_file_object_id,
      payment_slip_generated_at,
      payment_slip_generated_by,
      receipt_original_name,
      receipt_mime_type,
      receipt_size,
      receipt_uploaded_at,
      receipt_reference_number,
      receipt_verified_at,
      receipt_verified_by,
      receipt_verification_note,
      terms_accepted_at,
      terms_version,
      status,
      rejection_reason
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const [result] = await executor.query(sql, [
    payload.referenceNumber,
    payload.clientId,
    payload.sourceType,
    payload.designId ?? null,
    payload.fileObjectId ?? null,
    payload.fileOriginalName ?? null,
    payload.fileMimeType ?? null,
    payload.fileSize ?? null,
    payload.requestorName ?? null,
    payload.contactNumber ?? null,
    payload.collegeDepartment ?? null,
    payload.purpose ?? null,
    serializeJson(payload.designSnapshot),
    payload.quoteToken ?? null,
    serializeJson(payload.quoteSnapshot),
    payload.material,
    payload.materialColorId ?? null,
    payload.materialColorName ?? null,
    payload.materialColorHex ?? null,
    payload.printQuality,
    payload.infill,
    payload.quantity,
    payload.notes ?? null,
    payload.estimatedCost ?? null,
    payload.confirmedCost ?? null,
    payload.paymentSlipFileObjectId ?? null,
    payload.paymentSlipGeneratedAt ?? null,
    payload.paymentSlipGeneratedBy ?? null,
    payload.receiptOriginalName ?? null,
    payload.receiptMimeType ?? null,
    payload.receiptSize ?? null,
    payload.receiptUploadedAt ?? null,
    payload.receiptReferenceNumber ?? null,
    payload.receiptVerifiedAt ?? null,
    payload.receiptVerifiedBy ?? null,
    payload.receiptVerificationNote ?? null,
    payload.termsAcceptedAt ?? null,
    payload.termsVersion ?? null,
    payload.status,
    payload.rejectionReason ?? null,
  ]);

  return getPrintRequestById(result.insertId, connection);
}

async function getPrintRequestById(requestId, connection = null) {
  const executor = getExecutor(connection);

  const sql = `
    SELECT
      id,
      reference_number,
      client_id,
      source_type,
      design_id,
      (SELECT public_path FROM file_objects WHERE id = print_requests.file_object_id) AS file_url,
      file_object_id,
      file_original_name,
      file_mime_type,
      file_size,
      requestor_name,
      contact_number,
      college_department,
      purpose,
      design_snapshot,
      quote_token,
      quote_snapshot,
      material,
      material_color_id,
      material_color_name,
      material_color_hex,
      print_quality,
      infill,
      quantity,
      notes,
      estimated_cost,
      confirmed_cost,
      (SELECT public_path FROM file_objects WHERE id = print_requests.payment_slip_file_object_id) AS payment_slip_url,
      payment_slip_file_object_id,
      payment_slip_generated_at,
      payment_slip_generated_by,
      NULL AS receipt_url,
      receipt_original_name,
      receipt_mime_type,
      receipt_size,
      receipt_uploaded_at,
      receipt_reference_number,
      receipt_verified_at,
      receipt_verified_by,
      receipt_verification_note,
      terms_accepted_at,
      terms_version,
      status,
      rejection_reason,
      archived_at,
      archived_by,
      created_at,
      updated_at,
      (SELECT first_name FROM users WHERE users.id = print_requests.client_id) AS client_first_name,
      (SELECT last_name FROM users WHERE users.id = print_requests.client_id) AS client_last_name,
      (SELECT email FROM users WHERE users.id = print_requests.client_id) AS client_email,
      (SELECT COUNT(*) FROM print_request_items WHERE print_request_items.print_request_id = print_requests.id) AS item_count
    FROM print_requests
    WHERE id = ?
    LIMIT 1
  `;

  const [rows] = await executor.query(sql, [requestId]);
  return rows[0] || null;
}

async function getPrintRequestByIdForOwner(
  requestId,
  clientId,
  connection = null,
) {
  const executor = getExecutor(connection);

  const sql = `
    SELECT
      id,
      reference_number,
      client_id,
      source_type,
      design_id,
      (SELECT public_path FROM file_objects WHERE id = print_requests.file_object_id) AS file_url,
      file_object_id,
      file_original_name,
      file_mime_type,
      file_size,
      requestor_name,
      contact_number,
      college_department,
      purpose,
      design_snapshot,
      quote_token,
      quote_snapshot,
      material,
      material_color_id,
      material_color_name,
      material_color_hex,
      print_quality,
      infill,
      quantity,
      notes,
      estimated_cost,
      confirmed_cost,
      (SELECT public_path FROM file_objects WHERE id = print_requests.payment_slip_file_object_id) AS payment_slip_url,
      payment_slip_file_object_id,
      payment_slip_generated_at,
      payment_slip_generated_by,
      NULL AS receipt_url,
      receipt_original_name,
      receipt_mime_type,
      receipt_size,
      receipt_uploaded_at,
      receipt_reference_number,
      receipt_verified_at,
      receipt_verified_by,
      receipt_verification_note,
      terms_accepted_at,
      terms_version,
      status,
      rejection_reason,
      archived_at,
      archived_by,
      created_at,
      updated_at,
      (SELECT first_name FROM users WHERE users.id = print_requests.client_id) AS client_first_name,
      (SELECT last_name FROM users WHERE users.id = print_requests.client_id) AS client_last_name,
      (SELECT email FROM users WHERE users.id = print_requests.client_id) AS client_email,
      (SELECT COUNT(*) FROM print_request_items WHERE print_request_items.print_request_id = print_requests.id) AS item_count
    FROM print_requests
    WHERE id = ? AND client_id = ? AND archived_at IS NULL
    LIMIT 1
  `;

  const [rows] = await executor.query(sql, [requestId, clientId]);
  return rows[0] || null;
}

async function getPaginatedPrintRequestsByOwner(
  clientId,
  { page = 1, limit = 20, status = null, cursor = null } = {},
) {
  const offset = (page - 1) * limit;

  const whereClauses = ["client_id = ?", "archived_at IS NULL"];
  const params = [clientId];
  const decodedCursor = decodeCursor(cursor);

  if (status) {
    whereClauses.push("status = ?");
    params.push(status);
  }

  if (decodedCursor) {
    whereClauses.push("(created_at < ? OR (created_at = ? AND id < ?))");
    params.push(decodedCursor.createdAt, decodedCursor.createdAt, decodedCursor.id);
  }

  const whereSql = `WHERE ${whereClauses.join(" AND ")}`;

  const countSql = `
    SELECT COUNT(*) AS total_count
    FROM print_requests
    ${whereSql}
  `;

  const dataSql = `
    SELECT
      id,
      reference_number,
      client_id,
      source_type,
      design_id,
      (SELECT public_path FROM file_objects WHERE id = print_requests.file_object_id) AS file_url,
      file_object_id,
      file_original_name,
      file_mime_type,
      file_size,
      requestor_name,
      contact_number,
      college_department,
      purpose,
      design_snapshot,
      quote_token,
      quote_snapshot,
      material,
      material_color_id,
      material_color_name,
      material_color_hex,
      print_quality,
      infill,
      quantity,
      notes,
      estimated_cost,
      confirmed_cost,
      (SELECT public_path FROM file_objects WHERE id = print_requests.payment_slip_file_object_id) AS payment_slip_url,
      payment_slip_file_object_id,
      payment_slip_generated_at,
      payment_slip_generated_by,
      NULL AS receipt_url,
      receipt_original_name,
      receipt_mime_type,
      receipt_size,
      receipt_uploaded_at,
      receipt_reference_number,
      receipt_verified_at,
      receipt_verified_by,
      receipt_verification_note,
      terms_accepted_at,
      terms_version,
      status,
      rejection_reason,
      archived_at,
      archived_by,
      created_at,
      updated_at,
      (SELECT first_name FROM users WHERE users.id = print_requests.client_id) AS client_first_name,
      (SELECT last_name FROM users WHERE users.id = print_requests.client_id) AS client_last_name,
      (SELECT email FROM users WHERE users.id = print_requests.client_id) AS client_email,
      (SELECT COUNT(*) FROM print_request_items WHERE print_request_items.print_request_id = print_requests.id) AS item_count
    FROM print_requests
    ${whereSql}
    ORDER BY created_at DESC, id DESC
    LIMIT ? OFFSET ?
  `;

  const [[countRows], [rows]] = await Promise.all([
    pool.query(countSql, params),
    pool.query(dataSql, [...params, limit, decodedCursor ? 0 : offset]),
  ]);

  return {
    rows,
    totalCount: Number(countRows[0]?.total_count || 0),
    page,
    limit,
    nextCursor: rows.length === limit ? encodeCursor(rows[rows.length - 1]) : null,
  };
}

async function getPaginatedAllPrintRequests({
  page = 1,
  limit = 20,
  status = null,
  sourceType = null,
  archived = false,
  search = null,
  cursor = null,
} = {}) {
  const offset = (page - 1) * limit;

  const whereClauses = [archived ? "archived_at IS NOT NULL" : "archived_at IS NULL"];
  const params = [];
  const countWhereClauses = [...whereClauses];
  const countParams = [];
  const decodedCursor = decodeCursor(cursor);

  if (search) {
    const searchPattern = `%${String(search).trim().toLowerCase()}%`;
    const searchSql = `(
      LOWER(reference_number) LIKE ?
      OR LOWER(file_original_name) LIKE ?
      OR EXISTS (
        SELECT 1
        FROM users u
        WHERE u.id = print_requests.client_id
          AND (
            LOWER(u.email) LIKE ?
            OR LOWER(u.first_name) LIKE ?
            OR LOWER(u.last_name) LIKE ?
          )
      )
    )`;
    whereClauses.push(searchSql);
    countWhereClauses.push(searchSql);
    params.push(
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
    );
    countParams.push(
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
    );
  }

  if (sourceType) {
    whereClauses.push("source_type = ?");
    countWhereClauses.push("source_type = ?");
    params.push(sourceType);
    countParams.push(sourceType);
  }

  if (status) {
    whereClauses.push("status = ?");
    params.push(status);
  }

  if (decodedCursor) {
    whereClauses.push("(created_at < ? OR (created_at = ? AND id < ?))");
    params.push(decodedCursor.createdAt, decodedCursor.createdAt, decodedCursor.id);
  }

  const whereSql =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const countWhereSql =
    countWhereClauses.length > 0
      ? `WHERE ${countWhereClauses.join(" AND ")}`
      : "";

  const countSql = `
    SELECT COUNT(*) AS total_count
    FROM print_requests
    ${whereSql}
  `;

  const dataSql = `
    SELECT
      id,
      reference_number,
      client_id,
      source_type,
      design_id,
      (SELECT public_path FROM file_objects WHERE id = print_requests.file_object_id) AS file_url,
      file_object_id,
      file_original_name,
      file_mime_type,
      file_size,
      requestor_name,
      contact_number,
      college_department,
      purpose,
      design_snapshot,
      quote_token,
      quote_snapshot,
      material,
      material_color_id,
      material_color_name,
      material_color_hex,
      print_quality,
      infill,
      quantity,
      notes,
      estimated_cost,
      confirmed_cost,
      (SELECT public_path FROM file_objects WHERE id = print_requests.payment_slip_file_object_id) AS payment_slip_url,
      payment_slip_file_object_id,
      payment_slip_generated_at,
      payment_slip_generated_by,
      NULL AS receipt_url,
      receipt_original_name,
      receipt_mime_type,
      receipt_size,
      receipt_uploaded_at,
      receipt_reference_number,
      receipt_verified_at,
      receipt_verified_by,
      receipt_verification_note,
      terms_accepted_at,
      terms_version,
      status,
      rejection_reason,
      archived_at,
      archived_by,
      created_at,
      updated_at,
      (SELECT first_name FROM users WHERE users.id = print_requests.client_id) AS client_first_name,
      (SELECT last_name FROM users WHERE users.id = print_requests.client_id) AS client_last_name,
      (SELECT email FROM users WHERE users.id = print_requests.client_id) AS client_email,
      (SELECT COUNT(*) FROM print_request_items WHERE print_request_items.print_request_id = print_requests.id) AS item_count
    FROM print_requests
    ${whereSql}
    ORDER BY created_at DESC, id DESC
    LIMIT ? OFFSET ?
  `;
  const statusCountsSql = `
    SELECT status, COUNT(*) AS count
    FROM print_requests
    ${countWhereSql}
    GROUP BY status
  `;

  const [[countRows], [rows], [statusCountRows]] = await Promise.all([
    pool.query(countSql, params),
    pool.query(dataSql, [...params, limit, decodedCursor ? 0 : offset]),
    pool.query(statusCountsSql, countParams),
  ]);

  return {
    rows,
    statusCounts: statusCountRows,
    totalCount: Number(countRows[0]?.total_count || 0),
    page,
    limit,
    nextCursor: rows.length === limit ? encodeCursor(rows[rows.length - 1]) : null,
  };
}

async function updatePrintRequestStatusById(
  requestId,
  payload,
  connection = null,
) {
  const executor = getExecutor(connection);

  const sql = `
    UPDATE print_requests
    SET
      status = ?,
      rejection_reason = ?,
      confirmed_cost = ?,
      payment_slip_file_object_id = ?,
      payment_slip_generated_at = ?,
      payment_slip_generated_by = ?,
      receipt_reference_number = ?,
      receipt_verified_at = ?,
      receipt_verified_by = ?,
      receipt_verification_note = ?
    WHERE id = ?
  `;

  const [result] = await executor.query(sql, [
    payload.status,
    payload.rejectionReason ?? null,
    payload.confirmedCost ?? null,
    payload.paymentSlipFileObjectId ?? null,
    payload.paymentSlipGeneratedAt ?? null,
    payload.paymentSlipGeneratedBy ?? null,
    payload.receiptReferenceNumber ?? null,
    payload.receiptVerifiedAt ?? null,
    payload.receiptVerifiedBy ?? null,
    payload.receiptVerificationNote ?? null,
    requestId,
  ]);

  if (result.affectedRows === 0) {
    return null;
  }

  return getPrintRequestById(requestId, connection);
}

async function restorePrintRequestStateById(
  requestId,
  snapshot,
  connection = null,
) {
  const executor = getExecutor(connection);

  const sql = `
    UPDATE print_requests
    SET
      status = ?,
      rejection_reason = ?,
      confirmed_cost = ?,
      payment_slip_file_object_id = ?,
      payment_slip_generated_at = ?,
      payment_slip_generated_by = ?,
      receipt_reference_number = ?,
      receipt_verified_at = ?,
      receipt_verified_by = ?,
      receipt_verification_note = ?
    WHERE id = ?
  `;

  const [result] = await executor.query(sql, [
    snapshot.status,
    snapshot.rejectionReason ?? null,
    snapshot.confirmedCost ?? null,
    snapshot.paymentSlipFileObjectId ?? null,
    snapshot.paymentSlipGeneratedAt ?? null,
    snapshot.paymentSlipGeneratedBy ?? null,
    snapshot.receiptReferenceNumber ?? null,
    snapshot.receiptVerifiedAt ?? null,
    snapshot.receiptVerifiedBy ?? null,
    snapshot.receiptVerificationNote ?? null,
    requestId,
  ]);

  if (result.affectedRows === 0) {
    return null;
  }

  return getPrintRequestById(requestId, connection);
}

async function createPrintRequestEvent(payload, connection = null) {
  const executor = getExecutor(connection);

  const sql = `
    INSERT INTO print_request_events (
      print_request_id,
      event_type,
      from_status,
      to_status,
      previous_state_snapshot,
      next_state_snapshot,
      changed_by,
      changed_by_role,
      note,
      reverted_by_event_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const [result] = await executor.query(sql, [
    payload.printRequestId,
    payload.eventType,
    payload.fromStatus ?? null,
    payload.toStatus ?? null,
    serializeJson(payload.previousStateSnapshot),
    serializeJson(payload.nextStateSnapshot),
    payload.changedBy,
    payload.changedByRole,
    payload.note ?? null,
    payload.revertedByEventId ?? null,
  ]);

  return getPrintRequestEventById(result.insertId, connection);
}

async function getPrintRequestEventById(eventId, connection = null) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `
      SELECT
        id,
        print_request_id,
        event_type,
        from_status,
        to_status,
        previous_state_snapshot,
        next_state_snapshot,
        changed_by,
        changed_by_role,
        note,
        reverted_at,
        reverted_by,
        reverted_by_event_id,
        created_at
      FROM print_request_events
      WHERE id = ?
      LIMIT 1
    `,
    [eventId],
  );

  return rows[0] || null;
}

async function getPrintRequestEventsByRequestId(requestId, connection = null) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `
      SELECT
        id,
        print_request_id,
        event_type,
        from_status,
        to_status,
        previous_state_snapshot,
        next_state_snapshot,
        changed_by,
        changed_by_role,
        note,
        reverted_at,
        reverted_by,
        reverted_by_event_id,
        created_at
      FROM print_request_events
      WHERE print_request_id = ?
      ORDER BY created_at ASC, id ASC
    `,
    [requestId],
  );

  return rows;
}

async function getLatestReversiblePrintRequestEvent(
  requestId,
  connection = null,
) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `
      SELECT
        id,
        print_request_id,
        event_type,
        from_status,
        to_status,
        previous_state_snapshot,
        next_state_snapshot,
        changed_by,
        changed_by_role,
        note,
        reverted_at,
        reverted_by,
        reverted_by_event_id,
        created_at
      FROM print_request_events
      WHERE print_request_id = ?
        AND event_type = 'transition'
        AND reverted_at IS NULL
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [requestId],
  );

  return rows[0] || null;
}

async function markPrintRequestEventReverted(
  eventId,
  { revertedBy, revertedByEventId },
  connection = null,
) {
  const executor = getExecutor(connection);
  const [result] = await executor.query(
    `
      UPDATE print_request_events
      SET
        reverted_at = NOW(),
        reverted_by = ?,
        reverted_by_event_id = ?
      WHERE id = ? AND reverted_at IS NULL
    `,
    [revertedBy, revertedByEventId, eventId],
  );

  return result.affectedRows > 0;
}

async function createPrintRequestStatusHistory(payload, connection = null) {
  const executor = getExecutor(connection);

  const sql = `
    INSERT INTO print_request_status_history (
      print_request_id,
      status,
      changed_by,
      changed_by_role,
      note
    )
    VALUES (?, ?, ?, ?, ?)
  `;

  const [result] = await executor.query(sql, [
    payload.printRequestId,
    payload.status,
    payload.changedBy,
    payload.changedByRole,
    payload.note ?? null,
  ]);

  return getPrintRequestStatusHistoryById(result.insertId, connection);
}

async function getPrintRequestStatusHistoryById(historyId, connection = null) {
  const executor = getExecutor(connection);

  const sql = `
    SELECT
      id,
      print_request_id,
      status,
      changed_by,
      changed_by_role,
      note,
      created_at
    FROM print_request_status_history
    WHERE id = ?
    LIMIT 1
  `;

  const [rows] = await executor.query(sql, [historyId]);
  return rows[0] || null;
}

async function getPrintRequestStatusHistoryByRequestId(
  requestId,
  connection = null,
) {
  const executor = getExecutor(connection);

  const sql = `
    SELECT
      id,
      print_request_id,
      status,
      changed_by,
      changed_by_role,
      note,
      created_at
    FROM print_request_status_history
    WHERE print_request_id = ?
    ORDER BY created_at ASC, id ASC
  `;

  const [rows] = await executor.query(sql, [requestId]);
  return rows;
}

async function archivePrintRequestById(requestId, archivedBy) {
  const sql = `
    UPDATE print_requests
    SET
      archived_at = NOW(),
      archived_by = ?
    WHERE id = ? AND archived_at IS NULL
  `;

  const [result] = await pool.query(sql, [archivedBy, requestId]);

  if (result.affectedRows === 0) {
    return null;
  }

  return getPrintRequestById(requestId);
}

async function deletePrintRequestById(requestId, connection = null) {
  const executor = getExecutor(connection);
  const sql = `
    DELETE FROM print_requests
    WHERE id = ?
  `;

  const [result] = await executor.query(sql, [requestId]);
  return result.affectedRows > 0;
}

export {
  createPrintRequest,
  getPrintRequestById,
  getPrintRequestByIdForOwner,
  getPaginatedPrintRequestsByOwner,
  getPaginatedAllPrintRequests,
  updatePrintRequestStatusById,
  restorePrintRequestStateById,
  archivePrintRequestById,
  deletePrintRequestById,
  createPrintRequestStatusHistory,
  getPrintRequestStatusHistoryById,
  getPrintRequestStatusHistoryByRequestId,
  createPrintRequestEvent,
  getPrintRequestEventsByRequestId,
  getLatestReversiblePrintRequestEvent,
  markPrintRequestEventReverted,
};
