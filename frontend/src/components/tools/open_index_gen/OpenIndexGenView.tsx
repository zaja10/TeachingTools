import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Database, MousePointerClick, Settings, Activity, HelpCircle, X, Upload, RefreshCw, FileSpreadsheet } from 'lucide-react';
import { InteractiveEllipse } from './InteractiveEllipse';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { OpenIndexGenEngine, type MethodType, type SimulationInput } from './OpenIndexGenEngine';

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

  // Backend Results State
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

    numericCols.forEach(col => { traitsMap[col] = []; });

    data.forEach(row => {
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
    return () => { mounted = false; };
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

  useEffect(() => {
    if (selectedTraits.length === 0) return;

    setDesiredGains(prev => {
      const next = { ...prev };
      let hasChanges = false;

      selectedTraits.forEach(trait => {
        // If the trait doesn't have a desired gain set yet, default it to 1
        if (next[trait] === undefined || next[trait] === 0) {
          next[trait] = 1; 
          hasChanges = true;
        }
      });

      return hasChanges ? next : prev;
    });
    
    // Optionally, default economic weights to 0 so they don't cause NaN if the user switches back
    setEconomicWeights(prev => {
      const next = { ...prev };
      let hasChanges = false;
      selectedTraits.forEach(trait => {
        if (next[trait] === undefined) {
          next[trait] = 0;
          hasChanges = true;
        }
      });
      return hasChanges ? next : prev;
    });

  }, [selectedTraits]);

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
        if (simData.status === 'error') throw new Error(simData.message);

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
        next[plotX] = revData.v[0] || 0;
        next[plotY] = revData.v[1] || 0;
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

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
    if (N < 2) return <div style={{ color: 'var(--text-muted)' }}>Select at least 2 traits.</div>;
    if (!redDot || Object.keys(ellipseDataMap).length === 0) return <div>Simulating...</div>;

    const pairs = [];
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const key = `${i}_${j}`;
        const ellipse = ellipseDataMap[key];
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
    <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <header style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', color: 'var(--text-primary)' }}>N-Trait Index & Ellipse Matrix</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Visualize all pairs of traits simultaneously!
          <br /><strong>Drag the red dot</strong> to smoothly dial in your Desired Gains targets.
          <br /><strong>Click "Snap to Limits"</strong> to auto-calculate the precise Unrestricted economic weights needed to push your selected direction to its theoretical maximum boundary!
        </p>
        <button onClick={() => setShowHelp(true)} style={{ marginTop: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '0.5rem 1rem', borderRadius: '100px', cursor: 'pointer', border: '1px solid rgba(59, 130, 246, 0.2)', fontSize: '0.85rem' }}>
          <HelpCircle size={16} /> How is the math calculated?
        </button>
      </header>

      {/* Dataset Management Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', padding: '1rem 1.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-primary)' }}>
          <FileSpreadsheet size={20} color="var(--color-accent)" />
          <span>Active Dataset: <strong style={{ fontFamily: 'monospace' }}>{datasetName}</strong></span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <input
            type="file"
            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
            ref={fileInputRef}
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'var(--color-accent)', color: 'white', borderRadius: '4px', cursor: isUploading ? 'not-allowed' : 'pointer', border: 'none', fontSize: '0.85rem' }}
          >
            <Upload size={16} /> {isUploading ? 'Uploading...' : 'Upload Custom BLUPs'}
          </button>

          {datasetName !== "Tested.parentSelectionFile07.09.2025.xlsx" && (
            <button
              onClick={handleResetDataset}
              disabled={isUploading}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', borderRadius: '4px', cursor: isUploading ? 'not-allowed' : 'pointer', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
            >
              <RefreshCw size={16} /> Reset to Example
            </button>
          )}
        </div>
      </div>

      {showHelp && (
        <div style={{ padding: '1.5rem', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '12px', position: 'relative' }}>
          <button onClick={() => setShowHelp(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
          <h2 style={{ margin: '0 0 1rem 0', color: '#3b82f6', fontSize: '1.25rem' }}>Index Formula Breakdown</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>1. Net Merit (Unrestricted)</strong><br />
              The standard Hazel (1943) index. Uses your manual economic weights (v).<br />
              <code style={{ background: 'rgba(0,0,0,0.2)', padding: '0.2rem 0.4rem', borderRadius: '4px', marginTop: '0.5rem', display: 'inline-block' }}>b = P⁻¹ G v</code><br />
              <code style={{ background: 'rgba(0,0,0,0.2)', padding: '0.2rem 0.4rem', borderRadius: '4px', marginTop: '0.2rem', display: 'inline-block' }}>ΔG = (G b) / σᵢ</code>
            </div>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>2. Restricted Traits (Standard Index)</strong><br />
              Uses the Kempthorne & Nordskog (1959) approach to force selected traits to have exactly zero genetic change (ΔG = 0).<br />
              <code style={{ background: 'rgba(0,0,0,0.2)', padding: '0.2rem 0.4rem', borderRadius: '4px', marginTop: '0.5rem', display: 'inline-block' }}>b = [I - P⁻¹ G_c (G_cᵀ P⁻¹ G_c)⁻¹ G_cᵀ] P⁻¹ G v</code>
            </div>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>3. Pure Desired Gains</strong><br />
              Uses the Brascamp (1984) approach. Ignores economic weights entirely. It derives the exact index weights (b) needed to reach your target delta (δ).<br />
              <code style={{ background: 'rgba(0,0,0,0.2)', padding: '0.2rem 0.4rem', borderRadius: '4px', marginTop: '0.5rem', display: 'inline-block' }}>b = P⁻¹ δ</code>
            </div>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>4. Hybrid Desired Gains</strong><br />
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>

        {/* LEFT PANEL: Multi-Trait Constraints */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-accent)', margin: '0 0 1rem 0' }}>
              <Database size={18} /> Select Traits
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
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
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-accent)', margin: '0 0 1rem 0' }}>
              <Settings size={18} /> Index Paradigm
            </h3>

            <select
              value={method}
              onChange={e => setMethod(e.target.value as MethodType)}
              style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-card)', border: '1px solid var(--border-light)', color: 'var(--text-primary)', borderRadius: '4px', marginBottom: '1rem' }}
            >
              <option value="desired_gains">Hybrid Desired Gains</option>
              <option value="pure_desired_gains">Pure Desired Gains</option>
              <option value="unrestricted">Net Merit (Unrestricted)</option>
              <option value="restricted">Restricted Traits</option>
            </select>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.5rem' }}>Trait</th>
                  {(method === 'restricted' || method === 'desired_gains') && <th style={{ padding: '0.5rem' }}>Restrict</th>}
                  {method !== 'pure_desired_gains' && <th style={{ padding: '0.5rem' }}>$v$</th>}
                  {(method === 'desired_gains' || method === 'pure_desired_gains') && <th style={{ padding: '0.5rem' }}>$\delta$</th>}
                </tr>
              </thead>
              <tbody>
                {selectedTraits.map(t => (
                  <tr key={t} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '0.5rem', color: 'var(--text-primary)' }}>{t}</td>

                    {(method === 'restricted' || method === 'desired_gains') && (
                      <td style={{ padding: '0.5rem' }}>
                        <input type="checkbox" checked={restrictedTraits[t]} onChange={e => setRestrictedTraits(r => ({ ...r, [t]: e.target.checked }))} />
                      </td>
                    )}

                    {method !== 'pure_desired_gains' && (
                      <td style={{ padding: '0.5rem' }}>
                        <input
                          type="number" step="0.1"
                          value={economicWeights[t]}
                          onChange={e => setEconomicWeights(w => ({ ...w, [t]: parseFloat(e.target.value) || 0 }))}
                          style={{ width: '60px', padding: '0.2rem', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', borderRadius: '4px' }}
                        />
                      </td>
                    )}

                    {(method === 'desired_gains' || method === 'pure_desired_gains') && (
                      <td style={{ padding: '0.5rem' }}>
                        <input
                          type="number" step="0.1"
                          value={desiredGains[t]}
                          onChange={e => setDesiredGains(w => ({ ...w, [t]: parseFloat(e.target.value) || 0 }))}
                          style={{ width: '60px', padding: '0.2rem', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', borderRadius: '4px' }}
                          disabled={method === 'desired_gains' && !restrictedTraits[t]}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {method === 'desired_gains' && (
              <div style={{ marginTop: '1rem' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                  Proportional Allocation ($\alpha$): {alpha.toFixed(2)}
                </label>
                <input
                  type="range" min="0" max="1" step="0.01"
                  value={alpha} onChange={e => setAlpha(parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
            )}
          </div>

          <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '1.5rem', borderRadius: '12px' }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#10b981', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Activity size={18} /> Global Index Weights ($b$)
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {selectedTraits.map((t, idx) => (
                <div key={t} style={{ background: 'rgba(0,0,0,0.1)', padding: '0.5rem', borderRadius: '4px', minWidth: '80px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t}</div>
                  <div style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{optimalB ? optimalB[idx]?.toFixed(4) : '-'}</div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* RIGHT PANEL: Ellipse Matrix */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px' }}>

          <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={showIsoeconomic} onChange={e => setShowIsoeconomic(e.target.checked)} />
              Show Isoeconomic Lines
            </label>
            <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <MousePointerClick size={14} /> Drag red dot or click "Snap to Limits"
            </div>
          </div>

          <div style={{ flex: 1, minHeight: '400px' }}>
            {renderMatrix()}
          </div>

        </div>
      </div>
    </div>
  );
}
