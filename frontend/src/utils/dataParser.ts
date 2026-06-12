import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface ParseResult {
  data: Record<string, unknown>[];
  columns: string[];
}

export const parseFile = async (file: File, options?: { header?: boolean, sep?: string }): Promise<ParseResult> => {
  const fileExt = file.name.split('.').pop()?.toLowerCase();
  
  if (fileExt === 'csv' || fileExt === 'txt' || fileExt === 'tsv') {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: options?.header ?? true,
        delimiter: options?.sep, // let papaparse auto-detect if undefined
        dynamicTyping: true, // auto convert numbers
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length && !results.data.length) {
            reject(new Error(results.errors[0].message));
            return;
          }
          const data = results.data as Record<string, unknown>[];
          
          // Ensure valid column names and add .row_id
          if (data.length > 0) {
            const columns = Object.keys(data[0]);
            const sanitizedData = data.map((row, index) => {
               const newRow: Record<string, unknown> = { '.row_id': index + 1 };
               columns.forEach(col => {
                 const safeCol = String(col).replace(/[^a-zA-Z0-9_]/g, '_') || 'Column';
                 newRow[safeCol] = row[col];
               });
               return newRow;
            });
            resolve({ data: sanitizedData, columns: Object.keys(sanitizedData[0]) });
          } else {
            resolve({ data: [], columns: [] });
          }
        },
        error: (err) => reject(err)
      });
    });
  } else if (fileExt === 'xls' || fileExt === 'xlsx') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];
          
          if (json.length > 0) {
            const columns = Object.keys(json[0]);
            const sanitizedData = json.map((row, index) => {
              const newRow: Record<string, unknown> = { '.row_id': index + 1 };
              columns.forEach(col => {
                const safeCol = String(col).replace(/[^a-zA-Z0-9_]/g, '_') || 'Column';
                newRow[safeCol] = row[col];
              });
              return newRow;
            });
            resolve({ data: sanitizedData, columns: Object.keys(sanitizedData[0]) });
          } else {
            resolve({ data: [], columns: [] });
          }
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  }
  
  throw new Error(`Unsupported file type: ${fileExt}`);
};
