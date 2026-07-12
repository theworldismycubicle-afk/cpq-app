import { useMemo, useState } from 'react';
import { useQuoteStore } from '../store/quoteStore';
import { usePriceListStore } from '../store/priceListStore';
import { useLaborRatesStore } from '../store/laborRatesStore';
import { useAssemblerStore } from '../store/assemblerStore';
import { newQuote } from '../../shared/types';
import { sizePipe } from '../../shared/pipeSizing';
import { sizeH2sVessel, DEFAULT_H2S_PARAMS } from '../../shared/h2sVesselSizing';
import { generateH2sSystem, vesselCount, type Arrangement } from '../../shared/h2sSystem';
import { generateSteps, type AssemblerContext } from '../../shared/assembler';
import { readAssemblerConfigBuffer, writeAssemblerConfigBuffer, writeAssemblerTemplateBuffer } from '../lib/excelAssembler';
import { readH2sConfigBuffer, writeH2sConfigBuffer } from '../lib/excelH2s';
import { pickFile, downloadBlob } from '../lib/browserFileIO';

interface Props {
  open: boolean;
  onClose: () => void;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function AssemblerModal({ open, onClose }: Props) {
  const setQuote = useQuoteStore((s) => s.setQuote);
  const lookup = usePriceListStore((s) => s.lookup);
  const rateForCode = useLaborRatesStore((s) => s.rateForCode);
  const config = useAssemblerStore((s) => s.config);
  const setConfig = useAssemblerStore((s) => s.setConfig);
  const h2sConfig = useAssemblerStore((s) => s.h2sConfig);
  const setH2sConfigStore = useAssemblerStore((s) => s.setH2sConfig);

  // Gas composition (dry %) and operating conditions (US units in the form).
  const [ch4, setCh4] = useState(60);
  const [co2, setCo2] = useState(38);
  const [n2, setN2] = useState(1);
  const [o2, setO2] = useState(1);
  const [tempF, setTempF] = useState(95);
  const [rh, setRh] = useState(100);
  const [pressureInWc, setPressureInWc] = useState(10);
  const [flowCfm, setFlowCfm] = useState(200);
  const [params, setParams] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');

  // H2S vessel system inputs.
  const [h2sPpmv, setH2sPpmv] = useState(1000);
  const [mediaLoadingPct, setMediaLoadingPct] = useState(15); // media H2S capacity, % by weight
  const [arrangement, setArrangement] = useState<Arrangement>('leadlag');
  const [grade, setGrade] = useState('304SS');
  const [vesselKey, setVesselKey] = useState<string>(''); // '' = use recommended

  const h2sSizing = useMemo(() => {
    return sizeH2sVessel(
      { flowScfm: flowCfm, inletPressureInWc: pressureInWc, inletTempF: tempF, h2sPpmv },
      { ...DEFAULT_H2S_PARAMS, mediaCapacityFraction: mediaLoadingPct / 100 },
    );
  }, [flowCfm, pressureInWc, tempF, h2sPpmv, mediaLoadingPct]);

  const sizing = useMemo(() => {
    const cond = {
      temperatureC: (tempF - 32) * (5 / 9),
      relativeHumidityPct: rh,
      pressureGaugeKpa: pressureInWc * 0.249089, // "WC → kPa
    };
    return sizePipe({ ch4, co2, n2, o2 }, cond, flowCfm, config.sizing);
  }, [ch4, co2, n2, o2, tempF, rh, pressureInWc, flowCfm, config.sizing]);

  // Preview counts (kept above the early return to satisfy the Rules of Hooks).
  const preview = useMemo(() => {
    if (config.components.length === 0) return null;
    const steps = generateSteps(
      config,
      (() => {
        const ctx: AssemblerContext = {};
        if (sizing.selected) ctx.pipeSize = sizing.selected.size.label;
        for (const p of config.parameters) ctx[p.key] = params[p.key] ?? p.default ?? '';
        return ctx;
      })(),
      (pn) => {
        const e = lookup(pn);
        return e ? { unitPrice: e.unitPrice, description: e.description, lastUpdated: e.lastUpdated } : undefined;
      },
      rateForCode,
    );
    const subs = steps.reduce((n, s) => n + s.subcomponents.length, 0);
    const parts = steps.reduce((n, s) => n + s.subcomponents.reduce((m, sub) => m + sub.parts.length, 0), 0);
    const flagged = steps.reduce(
      (n, s) => n + s.subcomponents.reduce((m, sub) => m + sub.parts.filter((p) => p.requiresInput).length, 0),
      0,
    );
    return { steps: steps.length, subs, parts, flagged };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, sizing.selected, params, lookup, rateForCode]);

  if (!open) return null;

  const paramValue = (key: string, def?: string) => params[key] ?? def ?? '';

  const selectedVessel =
    h2sSizing.valid.find((c) => `${c.diameterFt}x${c.straightSideFt}` === vesselKey) ?? h2sSizing.recommended;

  const handleGenerateH2s = () => {
    if (!selectedVessel) {
      alert('No vessel size meets the velocity/contact-time criteria for these conditions. Adjust flow or criteria.');
      return;
    }
    const steps = generateH2sSystem(
      {
        arrangement,
        grade,
        vessel: selectedVessel,
        mediaBagsPerVessel: selectedVessel.bags,
        lineSize: sizing.selected?.size.label,
      },
      h2sConfig,
      (pn) => {
        const e = lookup(pn);
        return e ? { unitPrice: e.unitPrice, description: e.description, lastUpdated: e.lastUpdated } : undefined;
      },
    );
    const q = newQuote();
    q.steps = steps;
    setQuote(q);
    onClose();
  };

  const handleExportH2sRules = async () => {
    downloadBlob(await writeH2sConfigBuffer(h2sConfig), 'h2s-system-rules.xlsx', XLSX_MIME);
  };

  const handleImportH2sRules = async () => {
    try {
      const file = await pickFile('.xlsx');
      if (!file) return;
      const cfg = await readH2sConfigBuffer(await file.arrayBuffer());
      setH2sConfigStore(cfg);
      setStatus(`Loaded H2S rules: ${cfg.materialSteps.length} material steps, ${cfg.laborActivities.length} labor activities`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed.';
      setStatus(`H2S import error: ${msg}`);
      alert(`H2S rules import failed.\n\n${msg}`);
    }
  };

  const buildContext = (): AssemblerContext => {
    const ctx: AssemblerContext = {};
    if (sizing.selected) ctx.pipeSize = sizing.selected.size.label;
    for (const p of config.parameters) ctx[p.key] = paramValue(p.key, p.default);
    return ctx;
  };

  const handleGenerate = () => {
    if (config.components.length === 0) {
      alert('No assembler rules loaded. Import a rules workbook first (or download the template).');
      return;
    }
    const ctx = buildContext();
    const steps = generateSteps(
      config,
      ctx,
      (pn) => {
        const e = lookup(pn);
        return e ? { unitPrice: e.unitPrice, description: e.description, lastUpdated: e.lastUpdated } : undefined;
      },
      rateForCode,
    );
    const q = newQuote();
    q.steps = steps;
    setQuote(q);
    onClose();
  };

  const handleImportRules = async () => {
    try {
      const file = await pickFile('.xlsx');
      if (!file) return;
      const cfg = await readAssemblerConfigBuffer(await file.arrayBuffer());
      setConfig(cfg);
      setStatus(`Loaded rules: ${cfg.components.length} components, ${cfg.parameters.length} params`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed.';
      setStatus(`Import error: ${msg}`);
      alert(`Rules import failed.\n\n${msg}`);
    }
  };

  const handleExportRules = async () => {
    downloadBlob(await writeAssemblerConfigBuffer(config), 'assembler-rules.xlsx', XLSX_MIME);
  };

  const handleTemplate = async () => {
    downloadBlob(await writeAssemblerTemplateBuffer(), 'assembler-rules-template.xlsx', XLSX_MIME);
  };

  const sel = sizing.selected;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="assembler-modal" onClick={(e) => e.stopPropagation()}>
        <div className="parts-modal-head">
          <h3>BOM Assembler</h3>
          <div className="parts-modal-sub">
            Enter gas quality &amp; conditions → pipe size is calculated → a draft BOM is generated into a new quote.
          </div>
        </div>

        <div className="assembler-body">
          <div className="assembler-inputs">
            <fieldset>
              <legend>Gas Composition (dry %)</legend>
              <label>CH₄ <input type="number" value={ch4} onChange={(e) => setCh4(Number(e.target.value))} /></label>
              <label>CO₂ <input type="number" value={co2} onChange={(e) => setCo2(Number(e.target.value))} /></label>
              <label>N₂ <input type="number" value={n2} onChange={(e) => setN2(Number(e.target.value))} /></label>
              <label>O₂ <input type="number" value={o2} onChange={(e) => setO2(Number(e.target.value))} /></label>
            </fieldset>

            <fieldset>
              <legend>Conditions</legend>
              <label>Flow (SCFM) <input type="number" value={flowCfm} onChange={(e) => setFlowCfm(Number(e.target.value))} /></label>
              <label>Pressure (″WC) <input type="number" value={pressureInWc} onChange={(e) => setPressureInWc(Number(e.target.value))} /></label>
              <label>Temp (°F) <input type="number" value={tempF} onChange={(e) => setTempF(Number(e.target.value))} /></label>
              <label>Rel. Humidity (%) <input type="number" value={rh} onChange={(e) => setRh(Number(e.target.value))} /></label>
            </fieldset>

            {config.parameters.length > 0 && (
              <fieldset>
                <legend>Options</legend>
                {config.parameters.map((p) => (
                  <label key={p.key}>
                    {p.label}
                    {p.type === 'choice' ? (
                      <select value={paramValue(p.key, p.default)} onChange={(e) => setParams({ ...params, [p.key]: e.target.value })}>
                        {(p.choices ?? []).map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    ) : (
                      <input type="number" value={paramValue(p.key, p.default)} onChange={(e) => setParams({ ...params, [p.key]: e.target.value })} />
                    )}
                  </label>
                ))}
              </fieldset>
            )}
          </div>

          <div className="assembler-results">
            <h4>Calculated</h4>
            <div className="calc-row"><span>Pipe size</span><strong>{sel ? sel.size.label : '— (over limit)'}</strong></div>
            <div className="calc-row"><span>ΔP at size</span><strong>{sel ? `${sel.dpInWcPer100ft.toFixed(2)}″ wc/100ft` : '—'}</strong></div>
            <div className="calc-row"><span>Velocity</span><strong>{sel ? `${sel.velocityFtS.toFixed(1)} ft/s` : '—'}</strong></div>
            <div className="calc-row"><span>Actual flow</span><strong>{sizing.actualFlowCfm.toFixed(1)} ACFM</strong></div>
            <div className="calc-row"><span>Density</span><strong>{(sizing.props.densityKgM3 * 0.062428).toFixed(4)} lb/ft³</strong></div>
            <div className="calc-row"><span>Mol. weight</span><strong>{sizing.props.molecularWeight.toFixed(2)}</strong></div>
            <div className="calc-row"><span>Limit</span><strong>{config.sizing.allowableInWcPer100ft}″ wc/100ft</strong></div>

            {preview && (
              <div className="assembler-preview">
                Draft: {preview.steps} steps · {preview.subs} subcomponents · {preview.parts} parts
                {preview.flagged > 0 && <div className="req-note">{preview.flagged} line(s) need manual input (vendor lookup)</div>}
              </div>
            )}
          </div>
        </div>

        <div className="h2s-panel">
          <div className="h2s-panel-head">
            <h4>H2S Vessel System</h4>
            <span className="parts-modal-sub">Uses the gas conditions above + H2S sizing to generate the full system BOM.</span>
            <div className="h2s-rules-btns">
              <button onClick={handleExportH2sRules}>Export H2S Rules</button>
              <button onClick={handleImportH2sRules}>Import H2S Rules</button>
            </div>
          </div>
          <div className="h2s-panel-body">
            <div className="h2s-inputs">
              <label>H2S (ppmv) <input type="number" value={h2sPpmv} onChange={(e) => setH2sPpmv(Number(e.target.value))} /></label>
              <label>Media Loading (%) <input type="number" step="0.1" value={mediaLoadingPct} onChange={(e) => setMediaLoadingPct(Number(e.target.value))} /></label>
              <label>
                Vessel / Piping
                <select value={arrangement} onChange={(e) => { setArrangement(e.target.value as Arrangement); setVesselKey(''); }}>
                  <option value="single">Single Vessel</option>
                  <option value="parallel">Parallel Piping — 2 vessels</option>
                  <option value="leadlag">Lead/Lag Piping — 2 vessels</option>
                </select>
              </label>
              <label>
                Grade
                <select value={grade} onChange={(e) => setGrade(e.target.value)}>
                  <option value="304SS">304SS</option>
                  <option value="316SS">316SS</option>
                </select>
              </label>
              <label>
                Vessel Size
                <select value={vesselKey} onChange={(e) => setVesselKey(e.target.value)}>
                  <option value="">Recommended</option>
                  {h2sSizing.valid.map((c) => (
                    <option key={`${c.diameterFt}x${c.straightSideFt}`} value={`${c.diameterFt}x${c.straightSideFt}`}>
                      {c.diameterFt}′×{c.straightSideFt}′ — {c.mediaLifeDays.toFixed(0)}d life
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="h2s-readout">
              {selectedVessel ? (
                <>
                  <div className="calc-row"><span>Vessel</span><strong>{selectedVessel.diameterFt}′×{selectedVessel.straightSideFt}′ {grade} × {vesselCount(arrangement)}</strong></div>
                  <div className="calc-row"><span>Velocity</span><strong>{selectedVessel.velocityFtMin.toFixed(1)} ft/min</strong></div>
                  <div className="calc-row"><span>Contact time</span><strong>{selectedVessel.contactTimeMin.toFixed(2)} min</strong></div>
                  <div className="calc-row"><span>Media life</span><strong>{selectedVessel.mediaLifeDays.toFixed(0)} days</strong></div>
                  <div className="calc-row"><span>Media</span><strong>{selectedVessel.bags * vesselCount(arrangement)} bags ({(selectedVessel.mediaLbs * vesselCount(arrangement)).toLocaleString()} lbs)</strong></div>
                </>
              ) : (
                <div className="req-note">No vessel size meets criteria — adjust flow, H2S, or sizing limits.</div>
              )}
              <button className="primary h2s-gen" onClick={handleGenerateH2s} disabled={!selectedVessel}>Generate H2S System →</button>
            </div>
          </div>
        </div>

        <div className="assembler-footer">
          <div className="assembler-rules-btns">
            <span className="parts-modal-sub">Pipe assembler rules:</span>
            <button onClick={handleImportRules}>Import</button>
            <button onClick={handleExportRules}>Export</button>
            <button onClick={handleTemplate}>Template</button>
            <span className="parts-modal-sub">{status || `${config.components.length} pipe rules loaded`}</span>
          </div>
          <div className="assembler-actions">
            <button className="secondary" onClick={onClose}>Cancel</button>
            <button className="primary" onClick={handleGenerate}>Generate Draft BOM →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
