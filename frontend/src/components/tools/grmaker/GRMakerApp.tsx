import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Upload, Download, Dna, RefreshCw } from 'lucide-react';
import { parseFile } from '../../../utils/dataParser';
import { calculatePCA } from '../../../utils/mathUtils';
import PlotViewer from '../plotmaker/PlotViewer';

type TabType = 'qc' | 'grm' | 'pca' | 'match';

export default function GRMakerApp() {
  const [activeTab, setActiveTab] = useState<TabType>('qc');
  
  const [snpData, setSnpData] = useState<Record<string, any>[]>([]);
  const [snpCols, setSnpCols] = useState<string[]>([]);
  const [phenoData, setPhenoData] = useState<Record<string, any>[]>([]);
  const [phenoCols, setPhenoCols] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // QC Parameters
  const [markerCallRate, setMarkerCallRate] = useState(0.8);
  const [maf, setMaf] = useState(0.05);

  // GRM State
  const [grmMethod, setGrmMethod] = useState<'VanRaden' | 'Yang'>('VanRaden');
  const [tuneType, setTuneType] = useState<'None' | 'Bend' | 'Blend'>('Bend');
  const [isCalculatingGrm, setIsCalculatingGrm] = useState(false);
  const [grmResult, setGrmResult] = useState<{grm: number[][], grmInv: number[][]} | null>(null);

  // PCA State
  const [pcaResult, setPcaResult] = useState<any>(null);

  // Worker Ref
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    workerRef.current = new Worker(new URL('./grmWorker.ts', import.meta.url), { type: 'module' });
    workerRef.current.onmessage = (e) => {
      if (e.data.type === 'GRM_RESULT') {
        setGrmResult(e.data.payload);
        setIsCalculatingGrm(false);
      } else if (e.data.type === 'GRM_ERROR') {
        alert("Error calculating GRM: " + e.data.error);
        setIsCalculatingGrm(false);
      }
    };
    return () => workerRef.current?.terminate();
  }, []);

  const handleSnpUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const res = await parseFile(file, { sep: '\t' }); // typically TSV
      setSnpData(res.data);
      setSnpCols(res.columns);
    } catch (err) {
      alert("Error parsing SNP file. Make sure it is tab-separated.");
    }
    setLoading(false);
  };

  const handlePhenoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const res = await parseFile(file);
      setPhenoData(res.data);
      setPhenoCols(res.columns);
    } catch (err) {
      alert("Error parsing Pheno file.");
    }
    setLoading(false);
  };

  // Removed unused snpIds


  const markerCols = useMemo(() => snpCols.slice(1).filter(c => c !== '.row_id'), [snpCols]);

  // Derived filtered snp matrix based on QC
  const filteredMatrix = useMemo(() => {
    if (snpData.length === 0 || markerCols.length === 0) return null;
    
    // Convert to 2D array
    let matrix = snpData.map(row => markerCols.map(col => Number(row[col])));

    // Filter by Marker Call Rate and MAF
    const numInds = matrix.length;
    const numMarkers = markerCols.length;
    const keptMarkers = [];
    const finalMatrix: number[][] = Array(numInds).fill(0).map(() => []);

    for (let j = 0; j < numMarkers; j++) {
      let missingCount = 0;
      let alleleSum = 0;
      for (let i = 0; i < numInds; i++) {
        const val = matrix[i][j];
        if (isNaN(val) || val == null) {
          missingCount++;
        } else {
          alleleSum += val;
        }
      }

      const validCount = numInds - missingCount;
      const callRate = validCount / numInds;
      const p = validCount > 0 ? (alleleSum / validCount) / 2 : 0;
      const currentMaf = Math.min(p, 1 - p);

      if (callRate >= markerCallRate && currentMaf >= maf) {
        keptMarkers.push(j);
        for (let i = 0; i < numInds; i++) {
          finalMatrix[i].push(matrix[i][j]);
        }
      }
    }

    return { matrix: finalMatrix, keptMarkersCount: keptMarkers.length, originalCount: numMarkers };
  }, [snpData, markerCols, markerCallRate, maf]);

  const runGrm = () => {
    if (!filteredMatrix || filteredMatrix.matrix.length === 0) return alert("No valid SNP data to process.");
    setIsCalculatingGrm(true);
    setGrmResult(null);
    workerRef.current?.postMessage({
      type: 'CALCULATE_GRM',
      payload: { snpMatrix: filteredMatrix.matrix, method: grmMethod, tuneType: tuneType }
    });
  };

  const runPCA = () => {
    if (!grmResult) return alert("Calculate GRM first");
    // Run PCA on the GRM matrix
    const res = calculatePCA(grmResult.grm, false, 5);
    setPcaResult(res);
  };

  const downloadCSV = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  const exportGrm = () => {
    if (!grmResult) return;
    
    let matchedGrm = grmResult.grm;
    
    // Match phenotypes
    if (phenoData.length > 0 && phenoCols.length > 0 && snpData.length > 0 && snpCols.length > 0) {
      const pIds = phenoData.map(r => String(r[phenoCols[0]]));
      const sIds = snpData.map(r => String(r[snpCols[0]]));
      
      const matchedIndices: number[] = [];
      pIds.forEach(pid => {
        const idx = sIds.indexOf(pid);
        if (idx !== -1 && idx < grmResult.grm.length) {
          matchedIndices.push(idx);
        }
      });
      
      if (matchedIndices.length > 0) {
        matchedGrm = matchedIndices.map(i => matchedIndices.map(j => grmResult.grm[i][j]));
      } else {
        alert("Warning: No IDs matched between Phenotype and SNP data. Exporting full GRM.");
      }
    }

    const csvContent = matchedGrm.map(row => row.join(",")).join("\n");
    downloadCSV(`grm_matched_${grmMethod}_${tuneType}.csv`, csvContent);
  };

  return (
    <div style={{ display: 'flex', height: '100%', gap: '1rem' }}>
      {/* SIDEBAR */}
      <div className="glass-panel" style={{ width: '350px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
        <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Dna size={20} /> GRMaker
        </h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.9rem', fontWeight: 500 }}>Upload SNP Matrix (Tab Separated)</label>
          <label className="btn" style={{ background: 'var(--color-primary)', display: 'flex', justifyContent: 'center', cursor: 'pointer' }}>
            <Upload size={18} style={{ marginRight: '0.5rem' }} />
            Choose SNP File
            <input type="file" accept=".txt,.tsv,.dat" style={{ display: 'none' }} onChange={handleSnpUpload} />
          </label>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.9rem', fontWeight: 500 }}>Upload Phenotype Data (CSV)</label>
          <label className="btn" style={{ background: 'var(--color-primary)', display: 'flex', justifyContent: 'center', cursor: 'pointer' }}>
            <Upload size={18} style={{ marginRight: '0.5rem' }} />
            Choose Pheno File
            <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handlePhenoUpload} />
          </label>
          {phenoData.length > 0 && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loaded {phenoData.length} records with {phenoCols.length} columns.</span>}
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
          <button className={`btn ${activeTab === 'qc' ? 'active' : ''}`} onClick={() => setActiveTab('qc')} style={{ justifyContent: 'flex-start' }}>1. Input & QC</button>
          <button className={`btn ${activeTab === 'grm' ? 'active' : ''}`} onClick={() => setActiveTab('grm')} style={{ justifyContent: 'flex-start' }}>2. GRM & Diagnostics</button>
          <button className={`btn ${activeTab === 'pca' ? 'active' : ''}`} onClick={() => setActiveTab('pca')} style={{ justifyContent: 'flex-start' }}>3. Population Structure (PCA)</button>
          <button className={`btn ${activeTab === 'match' ? 'active' : ''}`} onClick={() => setActiveTab('match')} style={{ justifyContent: 'flex-start' }}>4. Match & Download</button>
        </nav>
      </div>

      {/* MAIN CONTENT */}
      <div className="glass-panel" style={{ flex: 1, padding: '2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        
        {loading && <div style={{ marginBottom: '1rem', color: '#8b5cf6' }}><RefreshCw className="spin" size={16} /> Loading data...</div>}

        {activeTab === 'qc' && (
          <div>
            <h3>Input & Quality Control</h3>
            <p style={{ color: 'var(--text-muted)' }}>Set parameters to filter the SNP matrix before computing the GRM.</p>
            
            <div style={{ display: 'flex', gap: '2rem', marginTop: '1.5rem' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <label>Min. Marker Call Rate ({markerCallRate})</label>
                <input type="range" min="0.5" max="1" step="0.05" value={markerCallRate} onChange={(e) => setMarkerCallRate(parseFloat(e.target.value))} />
                
                <label>Min. Minor Allele Frequency (MAF) ({maf})</label>
                <input type="range" min="0.01" max="0.5" step="0.01" value={maf} onChange={(e) => setMaf(parseFloat(e.target.value))} />
              </div>
              
              <div className="glass-panel" style={{ flex: 1, padding: '1rem' }}>
                <h4>QC Summary</h4>
                {filteredMatrix ? (
                  <>
                    <p>Original Markers: {filteredMatrix.originalCount}</p>
                    <p>Markers Retained: {filteredMatrix.keptMarkersCount}</p>
                    <p>Individuals: {filteredMatrix.matrix.length}</p>
                  </>
                ) : (
                  <p style={{ color: 'var(--text-muted)' }}>Upload SNP data to view QC summary.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'grm' && (
          <div>
            <h3>GRM Calculation</h3>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <select className="input-field" value={grmMethod} onChange={(e) => setGrmMethod(e.target.value as any)}>
                <option value="VanRaden">VanRaden</option>
                <option value="Yang">Yang</option>
              </select>
              <select className="input-field" value={tuneType} onChange={(e) => setTuneType(e.target.value as any)}>
                <option value="None">None</option>
                <option value="Bend">Bend</option>
                <option value="Blend">Blend</option>
              </select>
              <button className="btn btn-primary" onClick={runGrm} disabled={isCalculatingGrm || !filteredMatrix}>
                {isCalculatingGrm ? <><RefreshCw className="spin" size={16} /> Calculating...</> : 'Calculate GRM'}
              </button>
            </div>

            {grmResult && (
              <div style={{ marginTop: '1rem' }}>
                <div className="glass-panel" style={{ padding: '1rem', display: 'inline-block' }}>
                  <h4>GRM Generated Successfully</h4>
                  <p>Dimensions: {grmResult.grm.length} x {grmResult.grm[0].length}</p>
                  <p>Inverted GRM Dimensions: {grmResult.grmInv.length} x {grmResult.grmInv[0].length}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'pca' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <h3>Population Structure (PCA)</h3>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <button className="btn btn-primary" onClick={runPCA} disabled={!grmResult}>Run PCA on GRM</button>
            </div>
            <div style={{ flex: 1 }}>
              {pcaResult && (
                <PlotViewer 
                  data={[{ 
                    x: pcaResult.scores.map((r: any[]) => r[0]), 
                    y: pcaResult.scores.map((r: any[]) => r[1]), 
                    mode: 'markers', type: 'scatter', marker: { color: '#8b5cf6', size: 8 } 
                  }]} 
                  layout={{ title: `PCA Scatter (PC1 vs PC2)`, xaxis: { title: `PC1 (${pcaResult.varianceExplained[0].toFixed(1)}%)` }, yaxis: { title: `PC2 (${pcaResult.varianceExplained[1].toFixed(1)}%)` } }} 
                />
              )}
            </div>
          </div>
        )}

        {activeTab === 'match' && (
          <div>
            <h3>Download Results</h3>
            <p>Export the computed matrices.</p>
            {grmResult ? (
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button className="btn" onClick={exportGrm}><Download size={18} /> Download GRM (CSV)</button>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>Calculate GRM first.</p>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
