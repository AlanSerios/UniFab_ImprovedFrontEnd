import fs from "fs";
import path from "path";
import { PRINT_REQUEST_PAYMENT_SLIPS_ROOT } from "./print-request-storage.util.js";

function formatCurrency(amount, currency = "PHP") {
  return `${currency} ${Number(amount || 0).toFixed(2)}`;
}

function parseJsonSafely(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getSnapshotCurrency(printRequest) {
  const quoteSnapshot = parseJsonSafely(printRequest.quote_snapshot);
  return (
    quoteSnapshot?.pricingConfigSnapshot?.currency ||
    quoteSnapshot?.quote?.currency ||
    "PHP"
  );
}

function buildPaymentSlipFileName(printRequest) {
  const reference = String(
    printRequest.reference_number || `request-${printRequest.id}`,
  )
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${reference}-payment-slip.pdf`;
}

function escapePdfText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r?\n/g, " ");
}

function wrapPdfText(value, maxLength = 76) {
  const words = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length > maxLength && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = nextLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
}

function buildPaymentSlipPdfBuffer({ printRequest, items = [], adminId }) {
  const currency = getSnapshotCurrency(printRequest);
  const printableItems =
    items.length > 0
      ? items
      : [
          {
            file_original_name: printRequest.file_original_name,
            material: printRequest.material,
            material_color_name: printRequest.material_color_name,
            print_quality: printRequest.print_quality,
            quantity: printRequest.quantity,
            confirmed_cost: printRequest.confirmed_cost,
            estimated_cost: printRequest.estimated_cost,
          },
        ];
  const amount = printableItems.reduce(
    (sum, item) =>
      sum + Number(item.confirmed_cost ?? item.estimated_cost ?? 0),
    0,
  );
  const generatedAt = new Date().toLocaleString();

  const commands = [];
  let y = 780;

  function text({ value, x = 54, size = 11, leading = 16, font = "F1" }) {
    commands.push(
      `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfText(
        value,
      )}) Tj ET`,
    );
    y -= leading;
  }

  function line({ x1 = 54, y1 = y, x2 = 558, y2 = y }) {
    commands.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  }

  text({ value: "UNIFAB", size: 24, leading: 28, font: "F2" });
  text({
    value: "USTP-CDO FABRICATION LABORATORY",
    size: 10,
    leading: 14,
  });
  text({
    value: "C.M. Recto Avenue, Lapasan, Cagayan de Oro City",
    size: 9,
    leading: 20,
  });
  line({ y1: y, y2: y });
  y -= 28;

  text({ value: "PAYMENT SLIP", size: 18, leading: 24, font: "F2" });
  text({
    value: `Reference No.: ${printRequest.reference_number || `#${printRequest.id}`}`,
    size: 11,
  });
  text({ value: `Generated: ${generatedAt}`, size: 10, leading: 26 });

  text({ value: "REQUEST DETAILS", size: 12, leading: 20, font: "F2" });
  printableItems.forEach((item, index) => {
    const material = [item.material, item.material_color_name]
      .filter(Boolean)
      .join(" / ");
    const itemTotal = formatCurrency(
      item.confirmed_cost ?? item.estimated_cost ?? 0,
      currency,
    );
    const label = `${index + 1}. ${item.file_original_name || "3D Model Printing Service"} | ${material || "-"} | ${item.print_quality || "-"} | Qty ${Number(item.quantity || 1)} | ${itemTotal}`;
    for (const lineValue of wrapPdfText(label, 82)) {
      text({ value: lineValue, size: 9, leading: 13 });
    }
  });
  y -= 14;

  line({ y1: y, y2: y });
  y -= 24;
  text({
    value: `Amount Due: ${formatCurrency(amount, currency)}`,
    size: 18,
    leading: 32,
    font: "F2",
  });

  text({ value: "PAYMENT INSTRUCTIONS", size: 12, leading: 20, font: "F2" });
  [
    "1. Present this PDF payment slip to the University Cashier.",
    "2. Pay the exact amount shown above.",
    "3. Bring the official physical receipt to the FabLab for in-person verification.",
  ].forEach((instruction) => {
    for (const lineValue of wrapPdfText(instruction, 82)) {
      text({ value: lineValue, size: 10 });
    }
  });

  y -= 54;
  commands.push("90 220 m 250 220 l S");
  commands.push("340 220 m 500 220 l S");
  commands.push(
    `BT /F1 9 Tf 1 0 0 1 104 204 Tm (${escapePdfText(
      "Student / Client Signature",
    )}) Tj ET`,
  );
  commands.push(
    `BT /F1 9 Tf 1 0 0 1 378 204 Tm (${escapePdfText(
      "Cashier Verification",
    )}) Tj ET`,
  );
  commands.push(
    `BT /F1 8 Tf 1 0 0 1 54 72 Tm (${escapePdfText(
      `Generated by admin ID ${Number(adminId)} through UniFab.`,
    )}) Tj ET`,
  );

  const content = `q
0.08 0.09 0.12 RG
0.5 w
${commands.join("\n")}
Q`;

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${Buffer.byteLength(content, "utf-8")} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf-8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf-8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "utf-8");
}

async function generatePaymentSlipArtifact({ printRequest, items = [], adminId }) {
  await fs.promises.mkdir(PRINT_REQUEST_PAYMENT_SLIPS_ROOT, {
    recursive: true,
  });

  const fileName = buildPaymentSlipFileName(printRequest);
  const filePath = path.join(PRINT_REQUEST_PAYMENT_SLIPS_ROOT, fileName);
  const publicUrl = `/storage/print-requests/payment-slips/${fileName}`;

  await fs.promises.writeFile(
    filePath,
    buildPaymentSlipPdfBuffer({ printRequest, items, adminId }),
  );
  return publicUrl;
}

export { generatePaymentSlipArtifact };
