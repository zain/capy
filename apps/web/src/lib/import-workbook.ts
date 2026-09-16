import type { Cell, ImportSheet } from "@capy/equity/import";
import { parsePulleySheets } from "@capy/equity/import";

export async function readWorkbookSheets(buffer: ArrayBuffer) {
  if (buffer.byteLength > 20 * 1024 * 1024)
    throw new Error("This file exceeds the 20 MB import limit.");
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  const sheets: ImportSheet[] = [];
  for (const sheet of book.worksheets) {
    if (sheet.rowCount > 25000 || sheet.columnCount > 250)
      throw new Error(`“${sheet.name}” exceeds the supported sheet size.`);
    const rows: Cell[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const cells: Cell[] = [];
      for (let i = 1; i <= sheet.columnCount; i++) {
        const value = row.getCell(i).value;
        if (value instanceof Date) cells.push(value.toISOString().slice(0, 10));
        else if (typeof value === "number" || typeof value === "string") cells.push(value);
        else if (value && typeof value === "object") {
          if ("formula" in value || "sharedFormula" in value)
            cells.push(
              typeof value.result === "string" || typeof value.result === "number"
                ? value.result
                : null,
            );
          else if ("richText" in value) cells.push(value.richText.map((v) => v.text).join(""));
          else if ("text" in value) cells.push(value.text);
          else cells.push(null);
        } else cells.push(null);
      }
      rows.push(cells);
    });
    sheets.push({ name: sheet.name, rows });
  }
  return sheets;
}
export async function readPulleyWorkbook(buffer: ArrayBuffer, filename: string) {
  return parsePulleySheets(await readWorkbookSheets(buffer), filename.replace(/\.[^.]+$/, ""));
}
