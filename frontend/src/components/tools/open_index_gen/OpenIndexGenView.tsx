import './OpenIndexGenView.css';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Database, MousePointerClick, Settings, Activity, HelpCircle, X, Upload, RefreshCw, FileSpreadsheet } from 'lucide-react';
import { InteractiveEllipse } from './InteractiveEllipse';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { OpenIndexGenEngine, type MethodType, type SimulationInput } from './OpenIndexGenEngine';
import type { PredictedCross } from '../../../engine/crossSelector/crossEngine';
import { CrossSelectorTable } from './CrossSelectorTable';
import ToolLayoutWrapper from '../../layout/ToolLayoutWrapper';
import './OpenIndexGenView.css';

function calculateCovarianceForTraits(data: Record<string, number[]>, traits: string[]): number[][] {
  const nTraits = traits.length;
  if (nTraits === 0) return [];

  let N = data[traits[0]].length;
  for (const t of traits) {
    if (data[t].length < N) N = data[t].length;
  }

  const validRows: number[][] = [];
  for (let k = 0; k < N; k++) {
    let isValid = true;
    const rowVals = [];
    for (const t of traits) {
      const val = data[t][k];
      if (val === undefined || val === null || isNaN(val)) {
        isValid = false;
        break;
      }
      rowVals.push(val);
    }
    if (isValid) validRows.push(rowVals);
  }

  const validN = validRows.length;
  if (validN <= 1) return Array.from({ length: nTraits }, () => Array(nTraits).fill(0));

  const cov = Array.from({ length: nTraits }, () => Array(nTraits).fill(0));
  const means = Array(nTraits).fill(0);
  for (let i = 0; i < nTraits; i++) {
    for (let k = 0; k < validN; k++) {
      means[i] += validRows[k][i];
    }
    means[i] /= validN;
  }

  const sds = Array(nTraits).fill(0);
  for (let i = 0; i < nTraits; i++) {
    let sumSq = 0;
    for (let k = 0; k < validN; k++) {
      sumSq += Math.pow(validRows[k][i] - means[i], 2);
    }
    sds[i] = Math.sqrt(sumSq / (validN - 1));
  }

  for (let i = 0; i < nTraits; i++) {
    for (let j = 0; j <= i; j++) {
      if (sds[i] === 0 || sds[j] === 0) {
        const c = i === j ? 1 : 0;
        cov[i][j] = c;
        cov[j][i] = c;
        continue;
      }
      let sum = 0;
      for (let k = 0; k < validN; k++) {
        sum += ((validRows[k][i] - means[i]) / sds[i]) * ((validRows[k][j] - means[j]) / sds[j]);
      }
      const c = sum / (validN - 1);
      cov[i][j] = c;
      cov[j][i] = c;
    }
  }

  // Add a tiny ridge to ensure strictly positive definite matrix (prevents SVD infinite loops)
  for (let i = 0; i < nTraits; i++) {
    cov[i][i] += 1e-6;
  }
  return cov;
}

export default function OpenIndexGenView() {
  const [fullData, setFullData] = useState<Record<string, number[]>>({});
  const [lineNames, setLineNames] = useState<string[]>([]);
  const [availableTraits, setAvailableTraits] = useState<string[]>([]);

  // N-Trait Multi-Select State
  const [selectedTraits, setSelectedTraits] = useState<string[]>([]);
  const [method, setMethod] = useState<MethodType>('desired_gains');
  const [economicWeights, setEconomicWeights] = useState<Record<string, number>>({});
  const [desiredGains, setDesiredGains] = useState<Record<string, number>>({});
  const [restrictedTraits, setRestrictedTraits] = useState<Record<string, boolean>>({});
  const [alpha, setAlpha] = useState<number>(0.5);
  const cycles = 1;

  // Dataset State
  const [datasetName, setDatasetName] = useState<string>("Tested.parentSelectionFile07.09.2025.xlsx");
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Visualization State
  const [showIsoeconomic, setShowIsoeconomic] = useState<boolean>(false);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [activePair, setActivePair] = useState<[string, string] | null>(null);

  // Web Worker state
  const [crossRankings, setCrossRankings] = useState<PredictedCross[]>([]);
  const [isCalculatingCrosses, setIsCalculatingCrosses] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  // Hardcoded default fallback file
  const [GMatrix, setGMatrix] = useState<number[][] | null>(null);
  const [redDot, setRedDot] = useState<number[] | null>(null);
  const [optimalB, setOptimalB] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const processParsedData = useCallback((data: Record<string, unknown>[], filename: string) => {
    if (data.length === 0) throw new Error("Dataset is empty");
    const traitsMap: Record<string, number[]> = {};
    const exclude = ['Unnamed: 0', 'cohort'];

    const firstRow = data[0];
    const numericCols = Object.keys(firstRow).filter(k =>
      !exclude.includes(k) && (typeof firstRow[k] === 'number' || !isNaN(parseFloat(firstRow[k] as string)))
    );

    // Try to find a column that holds line names (often Geno, Line_ID, Taxa, Name)
    const possibleNameCols = ['Line_ID', 'Geno', 'Taxa', 'Name', 'id'];
    const stringCols = Object.keys(firstRow).filter(k => !numericCols.includes(k) && !exclude.includes(k));
    const nameCol = possibleNameCols.find(col => Object.keys(firstRow).includes(col)) || stringCols[0];

    numericCols.forEach(col => { traitsMap[col] = []; });
    const extractedNames: string[] = [];

    data.forEach((row, idx) => {
      extractedNames.push(nameCol && row[nameCol] ? String(row[nameCol]) : `Line_${idx + 1}`);

      numericCols.forEach(col => {
        const val = row[col];
        if (typeof val === 'number') {
          traitsMap[col].push(val);
        } else if (val !== undefined && val !== null && !isNaN(parseFloat(val as string))) {
          traitsMap[col].push(parseFloat(val as string));
        } else {
          traitsMap[col].push(NaN); // Will be filtered out in calculateCovarianceForTraits
        }
      });
    });

    setFullData(traitsMap);
    setLineNames(extractedNames);
    setDatasetName(filename);

    const available = Object.keys(traitsMap);
    setAvailableTraits(available);

    const numDefaults = Math.min(available.length, 4);
    if (numDefaults > 0) {
      const initial = available.slice(0, numDefaults);
      setSelectedTraits(initial);

      const initW: Record<string, number> = {};
      const initD: Record<string, number> = {};
      const initR: Record<string, boolean> = {};
      initial.forEach(t => {
        initW[t] = 1.0;
        initD[t] = 1.0;
        initR[t] = false;
      });
      setEconomicWeights(initW);
      setDesiredGains(initD);
      setRestrictedTraits(initR);
    } else {
      setSelectedTraits([]);
    }
  }, []);

  const loadDatasetFile = useCallback(async (fileOrBlob: File | Blob, filename: string) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          let parsedData: Record<string, unknown>[] = [];

          if (filename.toLowerCase().endsWith('.csv')) {
            const text = new TextDecoder().decode(data as ArrayBuffer);
            Papa.parse(text, {
              header: true,
              skipEmptyLines: true,
              dynamicTyping: true,
              complete: (results) => {
                parsedData = results.data as Record<string, unknown>[];
                processParsedData(parsedData, filename);
                resolve();
              },
              error: (err: Error) => reject(new Error(err.message))
            });
          } else {
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            parsedData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];
            processParsedData(parsedData, filename);
            resolve();
          }
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("File read error"));
      reader.readAsArrayBuffer(fileOrBlob);
    });
  }, [processParsedData]);

  const loadDefaultDataset = useCallback(async () => {
    try {
      const response = await fetch('./Tested.parentSelectionFile07.09.2025.xlsx');
      if (!response.ok) throw new Error("Failed to fetch default dataset");
      const blob = await response.blob();
      await loadDatasetFile(blob, "Tested.parentSelectionFile07.09.2025.xlsx");
    } catch (e) {
      setError("Failed to load default dataset: " + (e instanceof Error ? e.message : String(e)));
    }
  }, [loadDatasetFile]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      if (mounted) {
        await loadDefaultDataset();
      }
    };
    init();

    // Initialize Worker
    workerRef.current = new Worker(new URL('../../../engine/crossSelector/crossWorker.ts', import.meta.url), { type: 'module' });
    workerRef.current.onmessage = (e) => {
      if (e.data.success) {
        setCrossRankings(e.data.crosses);
      } else {
        console.error("Worker error:", e.data.error);
      }
      setIsCalculatingCrosses(false);
    };

    return () => { 
      mounted = false; 
      workerRef.current?.terminate();
    };
  }, [loadDefaultDataset]);

  // Handle Dataset Upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      await loadDatasetFile(file, file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleResetDataset = async () => {
    setIsUploading(true);
    setError(null);
    try {
      await loadDefaultDataset();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsUploading(false);
    }
  };

  const handleTraitToggle = (t: string) => {
    setSelectedTraits(prev => {
      let next = [...prev];
      if (next.includes(t)) {
        next = next.filter(x => x !== t);
      } else {
        if (next.length >= 10) return prev; // Limit to 10
        next.push(t);
      }

      setEconomicWeights(w => ({ ...w, [t]: w[t] ?? 1.0 }));
      setDesiredGains(d => ({ ...d, [t]: d[t] ?? 1.0 }));
      setRestrictedTraits(r => ({ ...r, [t]: r[t] ?? false }));

      return next;
    });
  };

  // 2. Simulate when N-Trait state changes
  useEffect(() => {
    if (selectedTraits.length < 2) return;

    const runSimulation = () => {
      try {
        setError(null);

        // Compute Covariance Matrix locally!
        const G = calculateCovarianceForTraits(fullData, selectedTraits);
        setGMatrix(G);

        const restrictIdx: number[] = [];
        selectedTraits.forEach((t, i) => {
          if (restrictedTraits[t]) restrictIdx.push(i);
        });

        let finalMethod = method;

        if (method === 'restricted' && restrictIdx.length === 0) {
          finalMethod = 'unrestricted';
        }
        if (method === 'desired_gains' && restrictIdx.length === 0) {
          throw new Error("Hybrid Desired Gains requires at least 1 restricted trait. Please check a 'Restrict' box to set a target.");
        }

        const simPayload: SimulationInput = {
          method: finalMethod,
          P: G,
          G: G,
          v: selectedTraits.map(t => economicWeights[t] || 0),
          cycles
        };

        if (finalMethod === 'restricted' || finalMethod === 'desired_gains') {
          simPayload.restrict_idx = restrictIdx;
        }

        if (finalMethod === 'desired_gains' || finalMethod === 'pure_desired_gains') {
          if (finalMethod === 'pure_desired_gains') {
            simPayload.delta = selectedTraits.map(t => desiredGains[t] || 0);
          } else {
            simPayload.delta = restrictIdx.map(idx => desiredGains[selectedTraits[idx]] || 0);
          }
          simPayload.alpha_proportion = alpha;
        }

        const simData = OpenIndexGenEngine.simulate(simPayload);
        if (simData.status === 'error') throw new Error(simData.message as string);

        setRedDot(simData.predicted_genetic_change as number[]);
        setOptimalB(simData.weights as number[]);

      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    };

    // Smooth zero-latency updates!
    runSimulation();
  }, [fullData, selectedTraits, method, economicWeights, desiredGains, restrictedTraits, alpha, cycles]);

  // 3. Generate Ellipse Map for all pairs
  const ellipseDataMap = useMemo(() => {
    if (!GMatrix || selectedTraits.length < 2) return {};
    try {
      const data = OpenIndexGenEngine.generateGenupEllipse(GMatrix);
      if (selectedTraits.length === 2) {
        return { "0_1": data };
      } else {
        return data;
      }
    } catch (e) {
      console.error(e);
      return {};
    }
  }, [GMatrix, selectedTraits]);

  // Handle clicking boundary (Reverse Engineer v)
  const handleBoundaryClick = (idxX: number, idxY: number, clickX: number, clickY: number) => {
    if (!GMatrix) return;
    const G2x2 = [
      [GMatrix[idxX][idxX], GMatrix[idxX][idxY]],
      [GMatrix[idxY][idxX], GMatrix[idxY][idxY]]
    ];

    try {
      const revData = OpenIndexGenEngine.reverseGenupEllipse(G2x2, clickX, clickY);
      if (!revData.v || !Array.isArray(revData.v)) return;

      const plotX = selectedTraits[idxX];
      const plotY = selectedTraits[idxY];

      setMethod('unrestricted');
      setEconomicWeights(prev => {
        const next = { ...prev };
        next[plotX] = (revData.v as number[])[0] || 0;
        next[plotY] = (revData.v as number[])[1] || 0;
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    if (!optimalB || selectedTraits.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCrossRankings([]);
      return;
    }
    
    setIsCalculatingCrosses(true);
    // Fallback if lineNames is somehow empty
    const names = lineNames.length > 0 
      ? lineNames 
      : Array.from({length: fullData[selectedTraits[0]]?.length || 0}, (_, i) => `Line_${i+1}`);
      
    workerRef.current?.postMessage({
      fullData,
      selectedTraits,
      optimalB,
      lineNames: names
    });
  }, [fullData, selectedTraits, optimalB, lineNames]);

  // Handle dragging red dot (Pure Desired Gains)
  const handleRedDotDrag = (idxX: number, idxY: number, newX: number, newY: number) => {
    const plotX = selectedTraits[idxX];
    const plotY = selectedTraits[idxY];

    setMethod('pure_desired_gains');
    setDesiredGains(prev => {
      const next = { ...prev };
      next[plotX] = newX;
      next[plotY] = newY;
      return next;
    });
  };

  // Generate Matrix Grid
  const renderMatrix = () => {
    const N = selectedTraits.length;
    if (N < 2) return <div className="oig-style-1">Select at least 2 traits.</div>;
    if (!redDot || Object.keys(ellipseDataMap).length === 0) return <div>Simulating...</div>;

    const pairs = [];
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const key = `${i}_${j}`;
        const ellipse = (ellipseDataMap as Record<string, { x: number[], y: number[] }>)[key];
        if (!ellipse) continue;

        pairs.push(
          <InteractiveEllipse
            key={key}
            traitX={selectedTraits[i]}
            traitY={selectedTraits[j]}
            ellipse={ellipse}
            redDot={{ x: redDot[i], y: redDot[j] }}
            vX={economicWeights[selectedTraits[i]] || 0}
            vY={economicWeights[selectedTraits[j]] || 0}
            showIsoeconomic={showIsoeconomic}
            onBoundaryClick={(x, y) => handleBoundaryClick(i, j, x, y)}
            onRedDotDrag={(x, y) => handleRedDotDrag(i, j, x, y)}
            onHover={(hovered) => setActivePair(hovered ? [selectedTraits[i], selectedTraits[j]] : null)}
          />
        );
      }
    }

    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '1rem',
        width: '100%'
      }}>
        {pairs}
      </div>
    );
  };

  return (
    <ToolLayoutWrapper
      header={
        <div>
          <h1 className="oig-style-5">N-Trait Index & Ellipse Matrix</h1>
          <p className="oig-style-6">
            Visualize all pairs of traits simultaneously!
            <br /><strong>Drag the red dot</strong> to smoothly dial in your Desired Gains targets.
            <br /><strong>Click "Snap to Limits"</strong> to auto-calculate the precise Unrestricted economic weights needed to push your selected direction to its theoretical maximum boundary!
          </p>
          <button onClick={() => setShowHelp(true)} style={{ marginTop: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '0.5rem 1rem', borderRadius: '100px', cursor: 'pointer', border: '1px solid rgba(59, 130, 246, 0.2)', fontSize: '0.85rem' }}>
            <HelpCircle size={16} /> How is the math calculated?
          </button>
        </div>
      }
      controls={
        <div className="oig-style-15">
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px' }}>
            <h3 className="oig-style-16">
              <Database size={18} /> Select Traits
            </h3>
            <div className="oig-style-17">
              {availableTraits.map(t => {
                const isActive = selectedTraits.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => handleTraitToggle(t)}
                    style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '100px',
                      border: `1px solid ${isActive ? 'var(--color-accent)' : 'var(--border-light)'}`,
                      background: isActive ? 'rgba(var(--color-accent-rgb), 0.1)' : 'transparent',
                      color: isActive ? 'var(--color-accent)' : 'var(--text-muted)',
                      cursor: 'pointer'
                    }}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px' }}>
            <h3 className="oig-style-18">
              <Settings size={18} /> Index Paradigm
            </h3>

            <select
              value={method}
              onChange={e => setMethod(e.target.value as MethodType)}
              title="Index Paradigm"
              aria-label="Index Paradigm"
              className="oig-style-19"
            >
              <option value="desired_gains">Hybrid Desired Gains</option>
              <option value="pure_desired_gains">Pure Desired Gains</option>
              <option value="unrestricted">Net Merit (Unrestricted)</option>
              <option value="restricted">Restricted Traits</option>
            </select>

            {method === 'unrestricted' && selectedTraits.length > 0 && Object.values(economicWeights).every(v => v === 0 || !v) && (
              <div className="badge-warning oig-style-20">
                Please enter economic weights below to activate this paradigm.
              </div>
            )}

            <div className="oig-style-21">
              <table className="oig-style-22">
                <thead className="table-sticky-header">
                  <tr className="oig-style-23">
                    <th className="oig-style-24">Trait</th>
                    {(method === 'restricted' || method === 'desired_gains') && <th className="oig-style-25">Restrict</th>}
                    {method !== 'pure_desired_gains' && <th className="oig-style-26">{method === 'desired_gains' ? 'Weight ($v$)' : 'Economic Weight ($v$)'}</th>}
                    {(method === 'desired_gains' || method === 'pure_desired_gains') && <th className="oig-style-27">Target Response ($\Delta G$)</th>}
                  </tr>
                </thead>
                <tbody>
                  {selectedTraits.map(t => {
                    const isActive = activePair?.includes(t);
                    return (
                      <tr key={t} className={isActive ? 'table-row-active' : ''} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', transition: 'background-color 0.2s' }}>
                    <td className="oig-style-28">{t}</td>

                    {(method === 'restricted' || method === 'desired_gains') && (
                      <td className="oig-style-29">
                        <input type="checkbox" title={`Restrict trait ${t}`} aria-label={`Restrict trait ${t}`} checked={restrictedTraits[t]} onChange={e => setRestrictedTraits(r => ({ ...r, [t]: e.target.checked }))} />
                      </td>
                    )}

                    {method !== 'pure_desired_gains' && (
                      <td className="oig-style-30">
                        <input
                          type="number" step="0.1"
                          title={`Economic Weight for ${t}`}
                          aria-label={`Economic Weight for ${t}`}
                          placeholder="0"
                          value={economicWeights[t]}
                          onChange={e => setEconomicWeights(w => ({ ...w, [t]: parseFloat(e.target.value) || 0 }))}
                          className="oig-style-31"
                        />
                      </td>
                    )}

                    {(method === 'desired_gains' || method === 'pure_desired_gains') && (
                      <td className="oig-style-32">
                        <input
                          type="number" step="0.1"
                          title={`Target Response for ${t}`}
                          aria-label={`Target Response for ${t}`}
                          placeholder="0"
                          value={desiredGains[t]}
                          onChange={e => setDesiredGains(w => ({ ...w, [t]: parseFloat(e.target.value) || 0 }))}
                          className="oig-style-33"
                          disabled={method === 'desired_gains' && !restrictedTraits[t]}
                        />
                      </td>
                    )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {method === 'desired_gains' && (
              <div className="oig-style-34">
                <label className="oig-style-35">
                  Proportional Allocation ($\alpha$): {alpha.toFixed(2)}
                </label>
                <input
                  type="range" min="0" max="1" step="0.01"
                  title="Proportional Allocation"
                  aria-label="Proportional Allocation"
                  value={alpha} onChange={e => setAlpha(parseFloat(e.target.value))}
                  className="oig-style-36"
                />
              </div>
            )}
          </div>

          <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '1.5rem', borderRadius: '12px' }}>
            <h3 className="oig-style-37">
              <Activity size={18} /> Global Index Weights ($b$)
            </h3>
            <div className="oig-style-38">
              {selectedTraits.map((t, idx) => (
                <div key={t} style={{ background: 'rgba(0,0,0,0.1)', padding: '0.5rem', borderRadius: '4px', minWidth: '80px' }}>
                  <div className="oig-style-39">{t}</div>
                  <div className="oig-style-40">{optimalB ? optimalB[idx]?.toFixed(4) : '-'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      }
      canvas={
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%', overflowY: 'auto' }}>

      {showHelp && (
        <div style={{ padding: '1.5rem', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '12px', position: 'relative' }}>
          <button title="Close help" aria-label="Close help" onClick={() => setShowHelp(false)} className="oig-style-7"><X size={20} /></button>
          <h2 className="oig-style-8">Index Formula Breakdown</h2>
          <div className="oig-style-9">
            <div>
              <strong className="oig-style-10">1. Net Merit (Unrestricted)</strong><br />
              The standard Hazel (1943) index. Uses your manual economic weights (v).<br />
              <code style={{ background: 'rgba(0,0,0,0.2)', padding: '0.2rem 0.4rem', borderRadius: '4px', marginTop: '0.5rem', display: 'inline-block' }}>b = P⁻¹ G v</code><br />
              <code style={{ background: 'rgba(0,0,0,0.2)', padding: '0.2rem 0.4rem', borderRadius: '4px', marginTop: '0.2rem', display: 'inline-block' }}>ΔG = (G b) / σᵢ</code>
            </div>
            <div>
              <strong className="oig-style-11">2. Restricted Traits (Standard Index)</strong><br />
              Uses the Kempthorne & Nordskog (1959) approach to force selected traits to have exactly zero genetic change (ΔG = 0).<br />
              <code style={{ background: 'rgba(0,0,0,0.2)', padding: '0.2rem 0.4rem', borderRadius: '4px', marginTop: '0.5rem', display: 'inline-block' }}>b = [I - P⁻¹ G_c (G_cᵀ P⁻¹ G_c)⁻¹ G_cᵀ] P⁻¹ G v</code>
            </div>
            <div>
              <strong className="oig-style-12">3. Pure Desired Gains</strong><br />
              Uses the Brascamp (1984) approach. Ignores economic weights entirely. It derives the exact index weights (b) needed to reach your target delta (δ).<br />
              <code style={{ background: 'rgba(0,0,0,0.2)', padding: '0.2rem 0.4rem', borderRadius: '4px', marginTop: '0.5rem', display: 'inline-block' }}>b = P⁻¹ δ</code>
            </div>
            <div>
              <strong className="oig-style-13">4. Hybrid Desired Gains</strong><br />
              Combines both approaches! It restricts some traits to hit a target (δ) while optimizing the remaining traits using your economic weights (v). The proportion (α) blends the solutions.<br />
              <code style={{ background: 'rgba(0,0,0,0.2)', padding: '0.2rem 0.4rem', borderRadius: '4px', marginTop: '0.5rem', display: 'inline-block' }}>b = (1 - α) b_unrestricted + α b_desired</code>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderLeft: '4px solid #ef4444', color: '#ef4444' }}>
          <strong>Error:</strong> {error}
        </div>
      )}




          <div className="oig-style-41">
            <label className="oig-style-42">
              <input type="checkbox" checked={showIsoeconomic} onChange={e => setShowIsoeconomic(e.target.checked)} />
              Show Isoeconomic Lines
            </label>
            <div className="oig-style-43">
              <MousePointerClick size={14} /> Drag red dot or click "Snap to Limits"
            </div>
          </div>

          <div className="oig-style-44">
            {renderMatrix()}
          </div>
        </div>
      }
      metrics={
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {isCalculatingCrosses && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-accent)' }}>
              <RefreshCw className="spin" size={16} /> Calculating cross rankings...
            </div>
          )}
          {crossRankings.length > 0 && !isCalculatingCrosses && (
            <div className="oig-style-45">
              <CrossSelectorTable 
                crosses={crossRankings} 
                selectedTraits={selectedTraits} 
              />
            </div>
          )}
          
          <div className="bottom-actions-tray">
            <div className="oig-style-46">
              <FileSpreadsheet size={20} color="var(--color-accent)" />
              <span>Active Dataset: <strong className="oig-style-47">{datasetName}</strong></span>
            </div>
            <div className="oig-style-48">
              <input
                type="file"
                title="Upload Custom BLUPs dataset"
                aria-label="Upload Custom BLUPs dataset"
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="oig-style-49"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: isUploading ? 0.7 : 1, cursor: isUploading ? 'not-allowed' : 'pointer' }}
              >
                <Upload size={16} /> {isUploading ? 'Uploading...' : 'Upload Custom BLUPs'}
              </button>

              {datasetName !== "Tested.parentSelectionFile07.09.2025.xlsx" && (
                <button
                  onClick={handleResetDataset}
                  disabled={isUploading}
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <RefreshCw size={16} /> Reset to Example
                </button>
              )}
            </div>
          </div>
        </div>
      }
    />
  );
}
