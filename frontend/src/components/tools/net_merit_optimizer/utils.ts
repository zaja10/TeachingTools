import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface DataRow {
  [key: string]: any;
}

export const parseFile = async (file: File): Promise<DataRow[]> => {
  const extension = file.name.split('.').pop()?.toLowerCase();

  return new Promise((resolve, reject) => {
    if (extension === 'csv') {
      Papa.parse(file, {
        header: true,
        dynamicTyping: true, // Automatically converts numbers
        skipEmptyLines: true,
        complete: (results) => {
          resolve(results.data as DataRow[]);
        },
        error: (error: any) => {
          reject(error);
        }
      });
    } else if (extension === 'xlsx' || extension === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          // We use defval: null so empty cells aren't just skipped, preserving structure if needed
          const json = XLSX.utils.sheet_to_json(worksheet, { defval: null }) as DataRow[];
          
          // Attempt to coerce to numbers where possible (similar to dynamicTyping in PapaParse)
          const coerced = json.map(row => {
            const newRow: DataRow = {};
            for (const key in row) {
              const val = row[key];
              if (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '') {
                newRow[key] = Number(val);
              } else {
                newRow[key] = val;
              }
            }
            return newRow;
          });
          resolve(coerced);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (error) => {
        reject(error);
      };
      reader.readAsBinaryString(file);
    } else {
      reject(new Error("Unsupported file format. Please upload a .csv or .xlsx file."));
    }
  });
};

export const extractNumericTraits = (data: DataRow[]): string[] => {
  if (!data || data.length === 0) return [];
  // Sample the first few rows to determine which columns are consistently numeric
  // Exclude common metadata columns explicitly just in case, though the prompt says
  // "excluding metadata columns like 'line' or 'cohort'".
  const excludeList = ['line', 'genotype', 'cohort', 'id', 'name', 'taxa', 'plot', 'rep', 'block', 'component', 'status', 'ped', ''];
  
  const sample = data.slice(0, Math.min(10, data.length));
  const keys = Object.keys(sample[0] || {});
  
  const numericKeys = keys.filter(key => {
    // If key is empty or in exclude list, skip
    if (!key || excludeList.includes(key.toLowerCase().trim())) return false;
    
    // Check if all non-null values in sample are numbers
    const isNumeric = sample.every(row => {
      const val = row[key];
      return val === null || val === undefined || typeof val === 'number';
    });
    return isNumeric;
  });
  
  return numericKeys;
};

export const findGenotypeColumn = (keys: string[]): string | undefined => {
  const possibleNames = ['line', 'genotype', 'id', 'name', 'taxa', 'ped'];
  return keys.find(key => possibleNames.includes(key.toLowerCase().trim()));
};
