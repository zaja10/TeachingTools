import React, { useState, useMemo } from 'react';
import { Upload, FileBarChart, RefreshCw, BarChart2, Activity, ScatterChart, Download } from 'lucide-react';
import { parseFile } from '../../../utils/dataParser';
import { applyTransform, calculatePCA } from '../../../utils/mathUtils';
import { calculateSummaryStats, fitLinearModel, performAnova, performTTest } from '../../../utils/statsUtils';
import PlotViewer from './PlotViewer';
import { exportElementToPDF } from './PdfReportGenerator';

type TabType = 'preprocessing' | 'summary' | 'histogram' | 'scatter' | 'boxplot' | 'correlation' | 'pca';

export default function PlotmakerApp() {
  const [activeTab, setActiveTab] = useState<TabType>('preprocessing');
  const [data, setData] = useState<Record<string, any>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [pcaResult, setPcaResult] = useState<any>(null);
  const [pcaCols, setPcaCols] = useState<string[]>([]);
  
  // Exclude .row_id from usable columns
  const usableCols = useMemo(() => columns.filter(c => c !== '.row_id'), [columns]);
  const numericCols = useMemo(() => usableCols.filter(c => data.length > 0 && typeof data[0][c] === 'number'), [usableCols, data]);
  const categoricalCols = useMemo(() => usableCols.filter(c => data.length > 0 && typeof data[0][c] === 'string'), [usableCols, data]);

  // Preprocessing
  const [naAction, setNaAction] = useState('none');
  const processedData = useMemo(() => {
    if (naAction === 'none') return data;
    if (naAction === 'na.omit') {
      return data.filter(row => usableCols.every(col => row[col] != null && row[col] !== ''));
    }
    // Simple mean impute for numeric
    if (naAction === 'mean_impute') {
      const means: Record<string, number> = {};
      numericCols.forEach(col => {
        const vals = data.map(r => r[col]).filter(v => typeof v === 'number');
        means[col] = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
      });
      return data.map(row => {
        const newRow = { ...row };
        numericCols.forEach(col => {
          if (newRow[col] == null || isNaN(newRow[col])) newRow[col] = means[col];
        });
        return newRow;
      });
    }
    return data;
  }, [data, naAction, usableCols, numericCols]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const res = await parseFile(file);
      setData(res.data);
      setColumns(res.columns);
    } catch (err) {
      alert("Error parsing file");
      console.error(err);
    }
    setLoading(false);
  };

  // Histogram state
  const [histVar, setHistVar] = useState('');
  const [histBins, setHistBins] = useState(30);
  const [histTrans, setHistTrans] = useState('None');
  
  // Scatter state
  const [scatX, setScatX] = useState('');
  const [scatY, setScatY] = useState('');
  const [scatTransX, setScatTransX] = useState('None');
  const [scatTransY, setScatTransY] = useState('None');

  // Boxplot state
  const [boxCat, setBoxCat] = useState('');
  const [boxNum, setBoxNum] = useState('');
  const [boxTrans, setBoxTrans] = useState('None');

  // PCA state
  const [pcaX, setPcaX] = useState('PC1');
  const [pcaY, setPcaY] = useState('PC2');

  // Fallbacks
  React.useEffect(() => {
    if (!histVar && numericCols.length > 0) setHistVar(numericCols[0]);
    if (!scatX && numericCols.length > 0) setScatX(numericCols[0]);
    if (!scatY && numericCols.length > 1) setScatY(numericCols[1]);
    if (!boxCat && categoricalCols.length > 0) setBoxCat(categoricalCols[0]);
    if (!boxNum && numericCols.length > 0) setBoxNum(numericCols[0]);
    if (pcaCols.length === 0 && numericCols.length > 0) setPcaCols(numericCols);
  }, [numericCols, categoricalCols]);

  const togglePcaCol = (col: string) => {
    setPcaCols(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);
  };

  const runPCA = () => {
    if (pcaCols.length < 2) return alert("Select at least 2 columns for PCA.");
    if (processedData.length === 0) return alert("No valid rows available after NA filtering.");
    const matrixData = processedData.map(row => pcaCols.map(col => row[col] as number));
    // Check for NAs
    if (matrixData.some(row => row.some(v => v == null || isNaN(v)))) {
      return alert("NAs present in selected columns. Please impute or omit NAs in preprocessing before PCA.");
    }
    const res = calculatePCA(matrixData, true, 3); // top 5
    setPcaResult(res);
  };

  return (
    <div style={{ display: 'flex', height: '100%', gap: '1rem' }}>
      {/* SIDEBAR */}
      <div className="glass-panel" style={{ width: '300px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
        <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileBarChart size={20} /> Plotmaker
        </h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.9rem', fontWeight: 500 }}>Upload Data (CSV/XLSX)</label>
          <label className="btn" style={{ background: 'var(--color-primary)', display: 'flex', justifyContent: 'center', cursor: 'pointer' }}>
            {loading ? <RefreshCw className="spin" size={18} /> : <Upload size={18} style={{ marginRight: '0.5rem' }} />}
            {loading ? 'Processing...' : 'Choose File'}
            <input type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleFileUpload} />
          </label>
        </div>

        {data.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 500 }}>NA Handling</label>
            <select className="input-field" value={naAction} onChange={e => setNaAction(e.target.value)}>
              <option value="none">Keep NAs</option>
              <option value="na.omit">Remove rows with NA</option>
              <option value="mean_impute">Mean Impute (Numeric)</option>
            </select>
          </div>
        )}

        {data.length > 0 && (
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
            <button className={`btn ${activeTab === 'summary' ? 'active' : ''}`} onClick={() => setActiveTab('summary')} style={{ justifyContent: 'flex-start' }}><Activity size={16} /> Summary & Structure</button>
            <button className={`btn ${activeTab === 'histogram' ? 'active' : ''}`} onClick={() => setActiveTab('histogram')} style={{ justifyContent: 'flex-start' }}><BarChart2 size={16} /> Histogram</button>
            <button className={`btn ${activeTab === 'scatter' ? 'active' : ''}`} onClick={() => setActiveTab('scatter')} style={{ justifyContent: 'flex-start' }}><ScatterChart size={16} /> Scatter Plot</button>
            <button className={`btn ${activeTab === 'boxplot' ? 'active' : ''}`} onClick={() => setActiveTab('boxplot')} style={{ justifyContent: 'flex-start' }}><FileBarChart size={16} /> Box Plot</button>
            <button className={`btn ${activeTab === 'pca' ? 'active' : ''}`} onClick={() => setActiveTab('pca')} style={{ justifyContent: 'flex-start' }}><Activity size={16} /> PCA Analysis</button>
            <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '0.5rem 0' }} />
            <button className="btn" onClick={() => exportElementToPDF('plotmaker-report', 'EDA_Report.pdf')} style={{ justifyContent: 'flex-start' }}><Download size={16} /> Export View as PDF</button>
          </nav>
        )}
      </div>

      {/* MAIN CONTENT */}
      <div className="glass-panel" id="plotmaker-report" style={{ flex: 1, padding: '2rem', overflowY: 'auto', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column' }}>
        {data.length === 0 ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            Upload a dataset to begin exploratory data analysis.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            {activeTab === 'summary' && (
              <div>
                <h3>Data Summary</h3>
                <p>Rows: {processedData.length} | Columns: {usableCols.length}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                  {numericCols.map(col => {
                    const stats = calculateSummaryStats(processedData.map(r => r[col]));
                    if (!stats) return null;
                    return (
                      <div key={col} className="glass-panel" style={{ padding: '1rem', fontSize: '0.85rem' }}>
                        <strong>{col}</strong>
                        <div style={{ marginTop: '0.5rem' }}>Mean: {stats.mean.toFixed(2)}</div>
                        <div>Median: {stats.median.toFixed(2)}</div>
                        <div>SD: {stats.sd.toFixed(2)}</div>
                        <div>NAs: {stats.nas}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'histogram' && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                  <select className="input-field" value={histVar} onChange={e => setHistVar(e.target.value)}>{numericCols.map(c => <option key={c} value={c}>{c}</option>)}</select>
                  <select className="input-field" value={histTrans} onChange={e => setHistTrans(e.target.value)}>
                    <option value="None">None</option><option value="Log (log1p)">Log</option><option value="Sqrt">Sqrt</option>
                  </select>
                  <input type="number" className="input-field" value={histBins} onChange={e => setHistBins(Number(e.target.value))} min={1} style={{ width: '80px' }} title="Bins" />
                </div>
                <div style={{ flex: 1 }}>
                  {histVar && processedData.length > 0 ? (
                    <PlotViewer 
                      data={[{ 
                        x: applyTransform(processedData.map(r => r[histVar]), histTrans).filter(v => !isNaN(v)), 
                        type: 'histogram', nbinsx: Math.max(1, histBins || 1), marker: { color: '#8b5cf6' } 
                      }]} 
                      layout={{ title: `Histogram of ${histVar}`, xaxis: { title: histVar }, yaxis: { title: 'Frequency' } }} 
                    />
                  ) : (
                    <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Not enough data to plot. Try changing NA handling.</div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'scatter' && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                  <select className="input-field" value={scatX} onChange={e => setScatX(e.target.value)}>{numericCols.map(c => <option key={c} value={c}>{c}</option>)}</select>
                  <select className="input-field" value={scatTransX} onChange={e => setScatTransX(e.target.value)}><option value="None">None</option><option value="Log (log1p)">Log</option><option value="Sqrt">Sqrt</option></select>
                  <span style={{ alignSelf: 'center' }}>vs</span>
                  <select className="input-field" value={scatY} onChange={e => setScatY(e.target.value)}>{numericCols.map(c => <option key={c} value={c}>{c}</option>)}</select>
                  <select className="input-field" value={scatTransY} onChange={e => setScatTransY(e.target.value)}><option value="None">None</option><option value="Log (log1p)">Log</option><option value="Sqrt">Sqrt</option></select>
                </div>
                <div style={{ flex: 1, display: 'flex' }}>
                  {processedData.length > 0 ? (
                    <>
                      <div style={{ flex: 1 }}>
                        {scatX && scatY && (
                          <PlotViewer 
                            data={[{ 
                              x: applyTransform(processedData.map(r => r[scatX]), scatTransX), 
                              y: applyTransform(processedData.map(r => r[scatY]), scatTransY), 
                              mode: 'markers', type: 'scatter', marker: { color: '#3b82f6', opacity: 0.6 } 
                            }]} 
                            layout={{ title: `Scatter: ${scatY} vs ${scatX}`, xaxis: { title: scatX }, yaxis: { title: scatY } }} 
                          />
                        )}
                      </div>
                      {/* Linear Model Summary */}
                      <div className="glass-panel" style={{ width: '250px', marginLeft: '1rem', padding: '1rem', fontSize: '0.85rem' }}>
                        <h4 style={{ marginBottom: '0.5rem' }}>Linear Model</h4>
                        {(() => {
                          if (!scatX || !scatY) return null;
                          const xData = applyTransform(processedData.map(r => r[scatX]), scatTransX);
                          const yData = applyTransform(processedData.map(r => r[scatY]), scatTransY);
                          const lm = fitLinearModel(xData, yData);
                          if (!lm) return <div>Not enough data points.</div>;
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <div><strong>Slope:</strong> {lm.slope.toFixed(4)}</div>
                              <div><strong>Intercept:</strong> {lm.intercept.toFixed(4)}</div>
                              <div><strong>R-squared:</strong> {lm.rsq.toFixed(4)}</div>
                              <div><strong>N:</strong> {lm.n}</div>
                            </div>
                          );
                        })()}
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Not enough data to plot. Try changing NA handling.</div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'boxplot' && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                  <select className="input-field" value={boxCat} onChange={e => setBoxCat(e.target.value)}>
                    <option value="">-- Group (Cat) --</option>
                    {categoricalCols.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select className="input-field" value={boxNum} onChange={e => setBoxNum(e.target.value)}>
                    <option value="">-- Value (Num) --</option>
                    {numericCols.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select className="input-field" value={boxTrans} onChange={e => setBoxTrans(e.target.value)}><option value="None">None</option><option value="Log (log1p)">Log</option><option value="Sqrt">Sqrt</option></select>
                </div>
                <div style={{ flex: 1, display: 'flex' }}>
                  {processedData.length > 0 ? (
                    <>
                      <div style={{ flex: 1 }}>
                        {boxCat && boxNum && (() => {
                          const groups = Array.from(new Set(processedData.map(r => r[boxCat])));
                          const plotData = groups.map(g => {
                            const vals = applyTransform(processedData.filter(r => r[boxCat] === g).map(r => r[boxNum]), boxTrans);
                            return { y: vals.filter(v => !isNaN(v)), type: 'box', name: String(g) };
                          });
                          return <PlotViewer data={plotData} layout={{ title: `Box Plot of ${boxNum} by ${boxCat}`, xaxis: { title: boxCat }, yaxis: { title: boxNum } }} />;
                        })()}
                      </div>
                      <div className="glass-panel" style={{ width: '250px', marginLeft: '1rem', padding: '1rem', fontSize: '0.85rem', overflowY: 'auto' }}>
                        <h4 style={{ marginBottom: '0.5rem' }}>Statistical Tests</h4>
                        {(() => {
                          if (!boxCat || !boxNum) return null;
                          const groups = Array.from(new Set(processedData.map(r => r[boxCat])));
                          const groupData = groups.map(g => 
                            applyTransform(processedData.filter(r => r[boxCat] === g).map(r => r[boxNum]), boxTrans)
                              .filter(v => !isNaN(v))
                          ).filter(arr => arr.length > 0);
                          
                          if (groupData.length < 2) return <div>Need at least 2 valid groups.</div>;
                          
                          if (groupData.length === 2) {
                            const ttest = performTTest(groupData[0], groupData[1]);
                            return (
                              <div>
                                <div><strong>T-Test (2 groups):</strong></div>
                                <div>p-value: {ttest.toExponential(4)}</div>
                                <div style={{ marginTop: '0.5rem', fontStyle: 'italic' }}>
                                  {ttest < 0.05 ? "Significant difference" : "No significant difference"}
                                </div>
                              </div>
                            );
                          } else {
                            const anovaP = performAnova(groupData);
                            return (
                              <div>
                                <div><strong>ANOVA F-Test:</strong></div>
                                <div>p-value: {anovaP.toExponential(4)}</div>
                                <div style={{ marginTop: '0.5rem', fontStyle: 'italic' }}>
                                  {anovaP < 0.05 ? "Significant difference between means" : "No significant difference"}
                                </div>
                              </div>
                            );
                          }
                        })()}
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Not enough data to plot. Try changing NA handling.</div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'pca' && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.9rem', fontWeight: 500 }}>Select Columns for PCA:</label>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem', maxHeight: '150px', overflowY: 'auto', padding: '1rem', background: 'rgba(0,0,0,0.1)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      {numericCols.map(c => (
                        <label key={c} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                          <input type="checkbox" checked={pcaCols.includes(c)} onChange={() => togglePcaCol(c)} />
                          {c}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn btn-primary" onClick={runPCA}>Run PCA Analysis</button>
                    {pcaResult && (
                      <button className="btn" onClick={() => setPcaResult(null)}>Clear PCA</button>
                    )}
                  </div>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {pcaResult && (
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                      <select className="input-field" value={pcaX} onChange={e => setPcaX(e.target.value)}>
                        {pcaResult.scores[0].map((_: any, i: number) => <option key={i} value={`PC${i+1}`}>PC{i+1}</option>)}
                      </select>
                      <select className="input-field" value={pcaY} onChange={e => setPcaY(e.target.value)}>
                        {pcaResult.scores[0].map((_: any, i: number) => <option key={i} value={`PC${i+1}`}>PC{i+1}</option>)}
                      </select>
                    </div>
                  )}
                  <div style={{ flex: 1, position: 'relative' }}>
                  {pcaResult && (() => {
                    const xIdx = parseInt(pcaX.replace('PC', '')) - 1;
                    const yIdx = parseInt(pcaY.replace('PC', '')) - 1;
                    const xData = pcaResult.scores.map((r: any[]) => r[xIdx]);
                    const yData = pcaResult.scores.map((r: any[]) => r[yIdx]);
                    const varX = pcaResult.varianceExplained[xIdx]?.toFixed(1);
                    const varY = pcaResult.varianceExplained[yIdx]?.toFixed(1);

                    return (
                      <PlotViewer 
                        data={[{ x: xData, y: yData, mode: 'markers', type: 'scatter', marker: { color: '#ec4899', size: 8, opacity: 0.7 } }]} 
                        layout={{ title: `PCA Biplot`, xaxis: { title: `${pcaX} (${varX}%)` }, yaxis: { title: `${pcaY} (${varY}%)` } }} 
                      />
                    );
                  })()}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
