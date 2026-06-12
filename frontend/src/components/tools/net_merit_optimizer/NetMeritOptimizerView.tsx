import React, { useState, useMemo, useRef } from 'react';
import PlotLib from 'react-plotly.js';
const Plot = (PlotLib as unknown as { default: typeof PlotLib }).default || PlotLib;
import ToolLayoutWrapper from '../../layout/ToolLayoutWrapper';
import { parseFile, extractNumericTraits, findGenotypeColumn, type DataRow } from './utils';

const NetMeritOptimizerView: React.FC = () => {
  const [data, setData] = useState<DataRow[]>([]);
  const [traits, setTraits] = useState<string[]>([]);
  
  const [selectedTraits, setSelectedTraits] = useState<Set<string>>(new Set());
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [selectionIntensity, setSelectionIntensity] = useState<number>(10);
  const [error, setError] = useState<string | null>(null);
  
  // UI States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isTopLinesOpen, setIsTopLinesOpen] = useState<boolean>(true);
  const [isDataIngestionOpen, setIsDataIngestionOpen] = useState<boolean>(true);
  const [isIntensityOpen, setIsIntensityOpen] = useState<boolean>(true);
  const [isTraitSelectionOpen, setIsTraitSelectionOpen] = useState<boolean>(true);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState<boolean>(false);
  const [plotMode, setPlotMode] = useState<'deltaG' | 'netMerit'>('deltaG');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setError(null);
    try {
      const parsedData = await parseFile(file);
      if (parsedData.length === 0) {
        throw new Error("The uploaded file is empty.");
      }
      
      const numericTraits = extractNumericTraits(parsedData);
      
      setData(parsedData);
      setTraits(numericTraits);
      
      // Reset selections
      setSelectedTraits(new Set());
      setWeights({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse file.");
    }
    
    // Reset file input so same file can be uploaded again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleTraitToggle = (trait: string) => {
    const newSelected = new Set(selectedTraits);
    if (newSelected.has(trait)) {
      newSelected.delete(trait);
      const newWeights = { ...weights };
      delete newWeights[trait];
      setWeights(newWeights);
    } else {
      newSelected.add(trait);
      setWeights({ ...weights, [trait]: 0 }); // Default weight of 0
    }
    setSelectedTraits(newSelected);
  };

  const handleWeightChange = (trait: string, value: number) => {
    setWeights({ ...weights, [trait]: value });
  };

  // Compute Net Merit Index, sort, and calculate delta G
  const results = useMemo(() => {
    if (data.length === 0 || selectedTraits.size === 0) {
      return { topLines: [], deltaG: {}, baseVariance: 0, indexVariance: 0 };
    }

    const traitsArray = Array.from(selectedTraits);
    
    // Calculate population means and standard deviations for each trait (handling missing values)
    const popMeans: Record<string, number> = {};
    const popStdDevs: Record<string, number> = {};
    
    traitsArray.forEach(t => {
      let sum = 0;
      let count = 0;
      data.forEach(row => {
        const val = row[t];
        if (typeof val === 'number') {
          sum += val;
          count++;
        }
      });
      const mean = count > 0 ? sum / count : 0;
      popMeans[t] = mean;
      
      let sumSqDiff = 0;
      data.forEach(row => {
        const val = row[t];
        if (typeof val === 'number') {
          sumSqDiff += Math.pow(val - mean, 2);
        }
      });
      // Sample standard deviation (n-1)
      const variance = count > 1 ? sumSqDiff / (count - 1) : 0;
      popStdDevs[t] = Math.sqrt(variance) || 1; // Fallback to 1 to avoid division by zero
    });

    // Compute Net Merit Index for each line using standardized values (Z-scores)
    const scoredData = data.map((row, index) => {
      let score = 0;
      let equalWeightScore = 0;
      traitsArray.forEach(t => {
        let val = row[t];
        // If missing, impute with mean (which makes stdVal = 0, contributing 0 to the sum)
        if (typeof val !== 'number') {
          val = popMeans[t];
        }
        const stdVal = (val - popMeans[t]) / popStdDevs[t];
        score += stdVal * (weights[t] || 0);
        equalWeightScore += stdVal * 1; // equal weights for RE baseline
      });
      return { ...row, _originalIndex: index, _netMeritScore: score, _equalWeightScore: equalWeightScore };
    });

    // Sort descending by score
    scoredData.sort((a, b) => b._netMeritScore - a._netMeritScore);

    // Select top N%
    const numToSelect = Math.max(1, Math.round((selectionIntensity / 100) * data.length));
    const topLines = scoredData.slice(0, numToSelect);

    // Calculate Delta G for each trait (in standard deviation units)
    const deltaG: Record<string, number> = {};
    traitsArray.forEach(t => {
      let selectedSum = 0;
      let count = 0;
      topLines.forEach(row => {
        const val = (row as DataRow)[t];
        if (typeof val === 'number') {
          selectedSum += val;
          count++;
        }
      });
      const selectedMean = count > 0 ? selectedSum / count : popMeans[t];
      const rawDeltaG = selectedMean - popMeans[t];
      deltaG[t] = rawDeltaG / popStdDevs[t];
    });

    // Relative Efficiency Calculation
    // Comparing variance of custom index vs equal-weight index.
    // RE^2 = Var(Custom) / Var(EqualWeight)
    const indexMean = scoredData.reduce((acc, row) => acc + row._netMeritScore, 0) / scoredData.length;
    const equalWeightMean = scoredData.reduce((acc, row) => acc + row._equalWeightScore, 0) / scoredData.length;
    
    const indexVariance = scoredData.reduce((acc, row) => acc + Math.pow(row._netMeritScore - indexMean, 2), 0) / scoredData.length;
    const baseVariance = scoredData.reduce((acc, row) => acc + Math.pow(row._equalWeightScore - equalWeightMean, 2), 0) / scoredData.length;

    return { topLines, deltaG, baseVariance, indexVariance };
  }, [data, selectedTraits, weights, selectionIntensity]);

  const filteredTopLines = useMemo(() => {
    if (!searchQuery) return results.topLines;
    return results.topLines.filter(row => {
      const genoCol = findGenotypeColumn(Object.keys(row));
      const displayId = genoCol ? String((row as DataRow)[genoCol]) : String(row._originalIndex);
      return displayId.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [results.topLines, searchQuery]);

  // Prepare plot data
  const plotData = useMemo(() => {
    if (plotMode === 'deltaG') {
      const traitsArray = Array.from(selectedTraits);
      const xVals = traitsArray.map(t => results.deltaG[t] || 0);
      const colors = xVals.map(val => val >= 0 ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)');

      return [
        {
          type: 'bar',
          x: xVals,
          y: traitsArray,
          orientation: 'h',
          marker: { color: colors }
        }
      ];
    } else {
      // Net Merit mode
      // Limit to top 100 max to avoid freezing plotly on huge populations, though filteredTopLines usually smaller
      const linesToPlot = filteredTopLines.slice(0, 100).reverse(); 
      const xVals = linesToPlot.map(row => row._netMeritScore);
      const yVals = linesToPlot.map(row => {
        const genoCol = findGenotypeColumn(Object.keys(row));
        return genoCol ? String((row as DataRow)[genoCol]) : String(row._originalIndex);
      });

      return [
        {
          type: 'bar',
          x: xVals,
          y: yVals,
          orientation: 'h',
          marker: { color: 'rgba(99, 102, 241, 0.8)' }
        }
      ];
    }
  }, [results.deltaG, selectedTraits, plotMode, filteredTopLines]);

  const relativeEfficiency = results.baseVariance > 0 
    ? (results.indexVariance / results.baseVariance).toFixed(2) 
    : '0.00';

  const handleExportCSV = () => {
    if (results.topLines.length === 0) return;

    const traitsArray = Array.from(selectedTraits);
    const lines: string[] = [];
    
    // Metadata section
    lines.push("--- WEIGHTS AND DELTA G (STD DEV UNITS) ---");
    lines.push(["Trait", "Weight", "Delta G"].join(","));
    traitsArray.forEach(t => {
      lines.push([
        `"${t}"`, 
        weights[t] || 0, 
        (results.deltaG[t] || 0).toFixed(4)
      ].join(","));
    });
    
    lines.push("");
    lines.push("--- TOP SELECTED LINES ---");
    
    // Headers for the lines
    const lineHeaders = ["Line ID", "Net Merit Score", ...traitsArray];
    lines.push(lineHeaders.map(h => `"${h}"`).join(","));
    
    // Rows
    filteredTopLines.forEach(row => {
      const genoCol = findGenotypeColumn(Object.keys(row));
      const displayId = genoCol ? String((row as DataRow)[genoCol]) : String(row._originalIndex);
      
      const rowData = [
        `"${displayId}"`,
        row._netMeritScore.toFixed(4),
        ...traitsArray.map(t => Number((row as DataRow)[t] || 0).toFixed(4))
      ];
      lines.push(rowData.join(","));
    });
    
    // Trigger download
    const csvContent = lines.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "optimized_selection_results.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
    <ToolLayoutWrapper 
      header={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h1 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--color-accent)' }}>Interactive Net Merit Index Optimizer</h1>
              <button 
                onClick={() => setIsInfoModalOpen(true)}
                style={{ 
                  background: 'var(--bg-surface)', 
                  border: '1px solid var(--border-light)', 
                  color: 'var(--text-secondary)', 
                  borderRadius: '50%', 
                  width: '24px', 
                  height: '24px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '0.9rem'
                }}
                title="View Formulas"
              >?</button>
            </div>
            <p style={{ margin: '0.5rem 0 0', color: 'var(--text-muted)' }}>Dynamically select traits and optimize genetic gain through customizable index weights.</p>
          </div>
        </div>
      }
      controls={
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h3 
              onClick={() => setIsDataIngestionOpen(!isDataIngestionOpen)}
              style={{ margin: 0, color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <span style={{ fontSize: '0.8rem' }}>{isDataIngestionOpen ? '▼' : '▶'}</span>
              Data Ingestion
            </h3>
            {isDataIngestionOpen && (
              <>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <label className="btn-primary" style={{ textAlign: 'center', cursor: 'pointer', flex: 1 }}>
                    Upload .csv / .xlsx
                    <input 
                      type="file" 
                      accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
                      style={{ display: 'none' }} 
                      onChange={handleFileUpload}
                      ref={fileInputRef}
                    />
                  </label>
                  <button
                    style={{ 
                      flex: 1, 
                      background: 'var(--bg-surface)', 
                      border: '1px solid var(--border-light)', 
                      color: 'var(--text-primary)', 
                      borderRadius: '4px', 
                      cursor: 'pointer', 
                      fontWeight: 'bold', 
                      padding: '0.5rem' 
                    }}
                    onClick={async () => {
                      setError(null);
                      try {
                        const response = await fetch('./Tested.parentSelectionFile07.09.2025.xlsx');
                        if (!response.ok) throw new Error("Failed to fetch example file");
                        const blob = await response.blob();
                        const file = new File([blob], "Tested.parentSelectionFile07.09.2025.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                        const parsedData = await parseFile(file);
                        if (parsedData.length === 0) throw new Error("The example file is empty.");
                        const numericTraits = extractNumericTraits(parsedData);
                        setData(parsedData);
                        setTraits(numericTraits);
                        setSelectedTraits(new Set());
                        setWeights({});
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Failed to load example file.");
                      }
                    }}
                  >
                    Load Example
                  </button>
                </div>
                {error && <span style={{ color: 'var(--color-danger)', fontSize: '0.875rem' }}>{error}</span>}
                {data.length > 0 && <span style={{ color: 'var(--color-success)', fontSize: '0.875rem' }}>Loaded {data.length} lines.</span>}
              </>
            )}
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', color: 'var(--text-secondary)' }}>
            <div 
              style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer', alignItems: 'center' }}
              onClick={() => setIsIntensityOpen(!isIntensityOpen)}
            >
               <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontWeight: 'bold' }}>
                 <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>{isIntensityOpen ? '▼' : '▶'}</span>
                 Selection Intensity
               </span>
               <span style={{ color: 'var(--color-accent)' }}>Top {selectionIntensity}%</span>
            </div>
            {isIntensityOpen && (
              <input 
                type="range" min="1" max="100" 
                value={selectionIntensity} 
                onChange={e => setSelectionIntensity(parseInt(e.target.value))} 
                style={{ accentColor: 'var(--color-accent)' }}
              />
            )}
          </label>

          {traits.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h3 
                onClick={() => setIsTraitSelectionOpen(!isTraitSelectionOpen)}
                style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <span style={{ fontSize: '0.8rem' }}>{isTraitSelectionOpen ? '▼' : '▶'}</span>
                Trait Selection
              </h3>
              {isTraitSelectionOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border-light)', padding: '0.5rem', borderRadius: '4px' }}>
                  {traits.map(trait => (
                    <label key={trait} className="checkbox-container">
                      <input 
                        type="checkbox" 
                        checked={selectedTraits.has(trait)} 
                        onChange={() => handleTraitToggle(trait)} 
                      />
                      {trait}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedTraits.size > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem' }}>Dynamic Weights</h3>
                <button 
                  onClick={() => {
                    const newWeights = { ...weights };
                    Object.keys(newWeights).forEach(k => newWeights[k] = 0);
                    setWeights(newWeights);
                  }}
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                  Reset All
                </button>
              </div>
              {Array.from(selectedTraits).map(trait => (
                <label key={trait} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                     <span>{trait}</span>
                     <span style={{ color: 'var(--color-accent)' }}>{weights[trait] || 0}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button 
                      type="button"
                      onClick={() => handleWeightChange(trait, parseFloat(((weights[trait] || 0) - 0.01).toFixed(2)))}
                      style={{ background: 'transparent', border: '1px solid var(--border-light)', color: 'var(--text-primary)', cursor: 'pointer', padding: '0 6px', borderRadius: '4px' }}
                    >-</button>
                    <input 
                      type="range" min="-10" max="10" step="0.01"
                      value={weights[trait] || 0} 
                      onChange={e => handleWeightChange(trait, parseFloat(e.target.value))} 
                      style={{ accentColor: 'var(--color-accent)', flex: 1 }}
                    />
                    <button 
                      type="button"
                      onClick={() => handleWeightChange(trait, parseFloat(((weights[trait] || 0) + 0.01).toFixed(2)))}
                      style={{ background: 'transparent', border: '1px solid var(--border-light)', color: 'var(--text-primary)', cursor: 'pointer', padding: '0 6px', borderRadius: '4px' }}
                    >+</button>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      }
      canvas={
        <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', padding: '1rem', gap: '1rem' }}>
          
          <div className="glass-panel" style={{ flex: 1, minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1rem 1rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: 'var(--text-secondary)' }}>
                {plotMode === 'deltaG' ? 'Genetic Gain (ΔG)' : 'Net Merit Scores'}
              </h3>
              {selectedTraits.size > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    onClick={() => setPlotMode('deltaG')}
                    style={{ 
                      background: plotMode === 'deltaG' ? 'var(--color-accent)' : 'transparent',
                      color: plotMode === 'deltaG' ? 'white' : 'var(--text-secondary)',
                      border: '1px solid ' + (plotMode === 'deltaG' ? 'var(--color-accent)' : 'var(--border-light)'),
                      padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.875rem'
                    }}
                  >
                    ΔG per Trait
                  </button>
                  <button 
                    onClick={() => setPlotMode('netMerit')}
                    style={{ 
                      background: plotMode === 'netMerit' ? 'var(--color-accent)' : 'transparent',
                      color: plotMode === 'netMerit' ? 'white' : 'var(--text-secondary)',
                      border: '1px solid ' + (plotMode === 'netMerit' ? 'var(--color-accent)' : 'var(--border-light)'),
                      padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.875rem'
                    }}
                  >
                    Net Merit
                  </button>
                </div>
              )}
            </div>
            
            <div style={{ flex: 1, position: 'relative' }}>
              {selectedTraits.size > 0 ? (
                <Plot
                  data={plotData as React.ComponentProps<typeof Plot>['data']}
                  layout={{
                    autosize: true,
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    font: { color: '#475569' },
                    xaxis: { 
                      title: { text: plotMode === 'deltaG' ? 'ΔG (Standard Deviation Units)' : 'Net Merit Score' }, 
                      gridcolor: '#e2e8f0', 
                      zerolinecolor: '#94a3b8' 
                    },
                    yaxis: { automargin: true, type: 'category' },
                    margin: { l: 100, r: 20, t: 20, b: 50 },
                    showlegend: false,
                  }}
                  useResizeHandler={true}
                  style={{ width: '100%', height: '100%', position: 'absolute' }}
                  config={{ responsive: true, displayModeBar: false }}
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                  Upload data and select traits to view gain.
                </div>
              )}
            </div>
          </div>

          <div className="glass-panel" style={{ flex: isTopLinesOpen ? 1 : 'none', minHeight: isTopLinesOpen ? '300px' : 'auto', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: isTopLinesOpen ? '1px solid var(--border-light)' : 'none' }}>
              <h3 
                onClick={() => setIsTopLinesOpen(!isTopLinesOpen)}
                style={{ margin: 0, color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <span style={{ fontSize: '0.8rem' }}>{isTopLinesOpen ? '▼' : '▶'}</span>
                Top Selected Lines
              </h3>
              {filteredTopLines.length > 0 && (
                <button 
                  onClick={handleExportCSV}
                  style={{ background: 'var(--color-accent)', color: 'white', border: 'none', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 'bold' }}
                  title="Export results to CSV"
                >
                  Export CSV
                </button>
              )}
            </div>
            {isTopLinesOpen && (
              <>
                {filteredTopLines.length > 0 && Array.from(selectedTraits).every(t => !weights[t]) && (
                  <div style={{ padding: '0.5rem 1rem', color: '#fbbf24', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>⚠️</span> 
                    All trait weights are 0. Lines are tied, so the top selected lines are simply chosen based on their original order in the uploaded file.
                  </div>
                )}
                <div style={{ padding: '0 1rem 0.5rem' }}>
                  <input 
                    type="text" 
                    placeholder="Search for a line..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)', background: 'rgba(0,0,0,0.1)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div style={{ flex: 1, overflow: 'auto' }}>
                  {filteredTopLines.length > 0 ? (
                    <table className="anova-table">
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-surface)', zIndex: 1 }}>
                    <tr>
                      <th>{findGenotypeColumn(Object.keys(data[0] || {})) || 'Line Index'}</th>
                      <th>Net Merit Score</th>
                      {Array.from(selectedTraits).map(t => <th key={t}>{t}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTopLines.map((row, i) => {
                      const genoCol = findGenotypeColumn(Object.keys(row));
                      const displayId = genoCol ? (row as DataRow)[genoCol] : row._originalIndex;
                      return (
                      <tr key={i}>
                        <td>{displayId}</td>
                        <td style={{ fontWeight: 'bold' }}>{row._netMeritScore.toFixed(2)}</td>
                        {Array.from(selectedTraits).map(t => <td key={t}>{Number((row as DataRow)[t] || 0).toFixed(2)}</td>)}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                  No lines to display.
                </div>
              )}
            </div>
          </>
        )}
      </div>

        </div>
      }
      metrics={
        <div style={{ display: 'flex', justifyContent: 'space-around', color: 'var(--text-secondary)', width: '100%' }}>
          <span>Total Population: <strong style={{ color: '#4ade80' }}>{data.length}</strong></span>
          <span>Selected Lines: <strong style={{ color: '#fbbf24' }}>{results.topLines.length}</strong></span>
          <span title="Variance relative to an equal-weights baseline">Relative Efficiency (RE²): <strong style={{ color: '#60a5fa' }}>{relativeEfficiency}</strong></span>
        </div>
      }
    />
    
    {isInfoModalOpen && (
      <div style={{ 
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
        backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <div className="glass-panel" style={{ width: '600px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto', padding: '2rem', position: 'relative' }}>
          <button 
            onClick={() => setIsInfoModalOpen(false)}
            style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.5rem', cursor: 'pointer' }}
          >
            ×
          </button>
          <h2 style={{ color: 'var(--text-primary)', marginTop: 0 }}>Formulas & Logic</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1.5rem' }}>
            <div>
              <h4 style={{ color: 'var(--color-accent)', margin: '0 0 0.5rem 0' }}>1. Trait Standardization (Z-Score)</h4>
              <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                <code>Z_i = (X_i - μ) / σ</code><br />
                Traits are standardized using their population mean (<code>μ</code>) and sample standard deviation (<code>σ</code>). Missing values are safely imputed with the population mean so they yield a neutral Z-score of 0. This ensures that traits measured in different units (e.g., thousands vs decimals) are scaled equally.
              </p>
            </div>

            <div>
              <h4 style={{ color: 'var(--color-accent)', margin: '0 0 0.5rem 0' }}>2. Net Merit Index (I)</h4>
              <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                <code>I = Σ (Z_i × Weight_i)</code><br />
                The score calculated for each individual line by summing the product of each selected trait's standardized value (<code>Z_i</code>) and its user-defined relative weight.
              </p>
            </div>
            
            <div>
              <h4 style={{ color: 'var(--color-accent)', margin: '0 0 0.5rem 0' }}>3. Selection Intensity</h4>
              <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Determines the top percentage of lines to retain based on their Net Merit Index.<br />
                <em>Note: If you are uploading a dataset containing lines that are <strong>already selected</strong>, you can set this slider to 100% to evaluate the entire uploaded cohort without filtering any out.</em>
              </p>
            </div>
            
            <div>
              <h4 style={{ color: 'var(--color-accent)', margin: '0 0 0.5rem 0' }}>4. Genetic Gain (ΔG)</h4>
              <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                <code>ΔG = (μ_selected - μ_population) / σ_population</code><br />
                The expected response to selection, representing the difference between the mean of the selected lines and the mean of the entire uploaded population. This is calculated and expressed in standard deviation units to allow direct comparison of gain across all traits.
              </p>
            </div>

            <div>
              <h4 style={{ color: 'var(--color-accent)', margin: '0 0 0.5rem 0' }}>5. Relative Efficiency (RE²)</h4>
              <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                <code>RE² = Variance(Custom Index) / Variance(Equal-Weights Index)</code><br />
                Measures how much the variance of your custom-weighted index differs from a baseline model where all selected traits are given an equal weight of 1.
              </p>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default NetMeritOptimizerView;
