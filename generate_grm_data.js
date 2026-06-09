const fs = require('fs');
const path = require('path');

// Configuration
const numInds = 100;
const numSnps = 500;
const snpOutputFile = path.join(__dirname, 'frontend', 'public', 'grm_example_snps.tsv');
const phenoOutputFile = path.join(__dirname, 'frontend', 'public', 'grm_example_pheno.csv');

// Generate SNP Matrix
console.log(`Generating ${numInds} individuals with ${numSnps} SNPs...`);
let snpHeader = ['.row_id'];
for (let i = 1; i <= numSnps; i++) {
  snpHeader.push(`SNP_${i}`);
}

let snpRows = [snpHeader.join('\t')];
let individualIds = [];

for (let i = 1; i <= numInds; i++) {
  const id = `IND_${String(i).padStart(3, '0')}`;
  individualIds.push(id);
  
  let row = [id];
  for (let j = 1; j <= numSnps; j++) {
    // Generate 0, 1, 2 with some probability, or NA (empty)
    const rand = Math.random();
    let val = '';
    if (rand < 0.05) val = ''; // 5% missing
    else if (rand < 0.4) val = '0';
    else if (rand < 0.8) val = '1';
    else val = '2';
    
    row.push(val);
  }
  snpRows.push(row.join('\t'));
}

fs.writeFileSync(snpOutputFile, snpRows.join('\n'));
console.log(`Saved SNP data to ${snpOutputFile}`);

// Generate Phenotype Data
let phenoHeader = ['ID', 'Trait1_Yield', 'Trait2_Height'];
let phenoRows = [phenoHeader.join(',')];

for (const id of individualIds) {
  // Generate some random continuous phenotypes
  const yield = (Math.random() * 5 + 5).toFixed(2); // 5 to 10
  const height = (Math.random() * 40 + 60).toFixed(2); // 60 to 100
  phenoRows.push([id, yield, height].join(','));
}

fs.writeFileSync(phenoOutputFile, phenoRows.join('\n'));
console.log(`Saved Phenotype data to ${phenoOutputFile}`);
