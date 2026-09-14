import { generateConsoleCode } from './codec/console-code.js';
import { fitWithinMaxSide } from './codec/source-utils.js';
import { withPreviewViewBox } from './codec/preview-svg.js';
import { resizeFitImage } from './codec/resample.js';
import { VERSION } from './version.js';

const $ = id => document.getElementById(id);
const els = Object.fromEntries([
  'importBtn','sampleBtn','fileInput','dropZone','fileMeta','runBtn','cancelBtn','budget','reserve','useStrips','useTiles','stripOrientation','precision','smoothing','edgeThreshold','edgeOut','maxRegions',
  'sourceCanvas','sourceEmpty','encodedSvg','encodedEmpty','encodedTag','runStatus','progressPct','progressBar','candidateLog','frontierChart',
  'scoreRing','qualityScore','payloadMetric','budgetMetric','layersMetric','encoderMetric','resMetric','bitsMetric','precisionMetric','generateBtn','copyBtn','svgBtn','reportBtn','consoleCode',
  'toast','appVersion'
].map(id=>[id,$(id)]));

let sourceImage = null;
let worker = null;
let best = null;
let lastSearch = null;
let recentCandidates = [];
let toastTimer = 0;

if (els.appVersion) els.appVersion.textContent = `RAGE Emblem Codec v${VERSION}`;

function formatBytes(n) {
  if (!Number.isFinite(n)) return '--';
  return `${Math.round(n).toLocaleString()} B`;
}

function showToast(message, kind='error') {
  if (!els.toast) return;
  els.toast.hidden = false;
  els.toast.dataset.kind = kind;
  els.toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 5200);
}

function setRunning(running) {
  document.body.classList.toggle('searching', running);
  els.runBtn.disabled = running || !sourceImage;
  els.cancelBtn.disabled = !running;
  els.importBtn.disabled = running;
  if (els.sampleBtn) els.sampleBtn.disabled = running;
  els.fileInput.disabled = running;
  els.runBtn.setAttribute('aria-busy', running ? 'true' : 'false');
}

function resetResult() {
  best = null; lastSearch = null; recentCandidates = [];
  els.encodedSvg.innerHTML = '';
  els.encodedEmpty.hidden = false;
  els.encodedTag.textContent = 'Waiting';
  els.qualityScore.textContent = '--';
  els.scoreRing.style.setProperty('--score', 0);
  for (const id of ['payloadMetric','budgetMetric','layersMetric','encoderMetric','resMetric','bitsMetric','precisionMetric']) els[id].textContent='--';
  for (const b of [els.generateBtn,els.copyBtn,els.svgBtn,els.reportBtn]) b.disabled=true;
  els.consoleCode.value='';
  els.frontierChart.innerHTML='<span>Run an optimization to build the frontier.</span>';
  els.candidateLog.innerHTML='<span>No candidates evaluated yet.</span>';
  els.progressBar.style.transform='scaleX(0)'; els.progressPct.textContent='0%'; els.runStatus.textContent='Idle';
}

function paintReferencePreview() {
  if (!sourceImage || !els.sourceCanvas) return;
  const smoothing = els.smoothing?.value !== 'false';
  const preview = resizeFitImage(sourceImage, 512, smoothing);
  const ctx = els.sourceCanvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, 512, 512);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(preview.data), 512, 512), 0, 0);
}

function drawSourceBitmap(bitmap, fileName) {
  // Keep the source at native resolution whenever practical. The old UI always
  // pre-smoothed everything to 512 first, which destroyed pixel-art edges before
  // the encoder's own smoothing option could do anything.
  const capped = fitWithinMaxSide(bitmap.width, bitmap.height, 2048);
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = capped.width; sourceCanvas.height = capped.height;
  const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently:true });
  sourceCtx.imageSmoothingEnabled = true;
  sourceCtx.imageSmoothingQuality = 'high';
  sourceCtx.drawImage(bitmap, 0, 0, capped.width, capped.height);
  const sourceData = sourceCtx.getImageData(0,0,capped.width,capped.height);
  sourceImage = { width:capped.width, height:capped.height, data:new Uint8ClampedArray(sourceData.data) };

  paintReferencePreview();
  els.sourceEmpty.hidden = true;
  const capNote = capped.scale < 1 ? ` · working source ${capped.width}×${capped.height}` : '';
  els.fileMeta.textContent = `${fileName} · ${bitmap.width}×${bitmap.height}${capNote}`;
  resetResult();
  els.runBtn.disabled = false;
}

async function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    if (file) showToast('That file is not a supported image.');
    return;
  }
  try {
    const bitmap = await createImageBitmap(file);
    drawSourceBitmap(bitmap, file.name);
    bitmap.close?.();
  } catch (error) {
    els.fileMeta.textContent = `Could not decode image: ${error.message}`;
    showToast(`Could not decode image: ${error.message}`);
  }
}

function searchOptions() {
  const preset = document.querySelector('input[name="preset"]:checked')?.value || 'fast';
  const families=[];
  if (els.useStrips.checked) families.push('strips');
  if (els.useTiles.checked) families.push('tiles');
  return {
    preset,
    budget:Number(els.budget.value) || 1280000,
    reserve:Number(els.reserve.value) || 0,
    encoderFamilies:families.length ? families : ['strips'],
    stripOrientations: els.stripOrientation?.value === 'columns' ? ['columns']
      : els.stripOrientation?.value === 'rows' ? ['rows']
      : ['rows', 'columns'],
    precision:els.precision.value === 'auto' ? 'auto' : Number(els.precision.value),
    smoothing:els.smoothing.value === 'true',
    edgeThreshold:Number(els.edgeThreshold.value),
    maxRegions:Number(els.maxRegions.value) || 4500
  };
}

function candidateChip(c, effectiveBudget) {
  if (!c || c.skipped || !Number.isFinite(c.quality) || !Number.isFinite(c.payloadBytes)) return '';
  const fit = c.payloadBytes <= effectiveBudget;
  return `<div class="candidate-chip ${fit?'fit':''}" title="${c.variant}">${c.encoder} · ${c.resolution}px · ${c.bits}b · ${c.quality.toFixed(2)} · ${Math.round(c.payloadBytes/1000)}k</div>`;
}

function onProgress(p, opts) {
  const pct = Math.min(99, Math.round((p.evaluated / p.maxCandidates) * 100));
  els.progressBar.style.transform=`scaleX(${pct/100})`; els.progressPct.textContent=`${pct}%`;
  els.runStatus.textContent = p.best && Number.isFinite(p.best.quality)
    ? `Best ${p.best.quality.toFixed(2)} quality at ${formatBytes(p.best.payloadBytes)}`
    : `Evaluated ${p.evaluated} candidates`;
  if (p.candidate && !p.candidate.skipped && Number.isFinite(p.candidate.quality)) recentCandidates.unshift(p.candidate);
  recentCandidates = recentCandidates.slice(0,10);
  const effective=(opts.budget-opts.reserve);
  els.candidateLog.innerHTML = recentCandidates.map(c=>candidateChip(c,effective)).join('') || '<span>Searching…</span>';
}

function renderFrontier(frontier, budget) {
  if (!frontier?.length) { els.frontierChart.innerHTML='<span>No feasible Pareto candidates.</span>'; return; }
  const W=720,H=150,pad=20;
  const minB=Math.min(...frontier.map(c=>c.payloadBytes));
  const maxB=Math.max(budget,...frontier.map(c=>c.payloadBytes));
  const minQ=Math.max(0,Math.min(...frontier.map(c=>c.quality))-1);
  const maxQ=100;
  const x=b=>pad+(b-minB)/Math.max(1,maxB-minB)*(W-pad*2);
  const y=q=>H-pad-(q-minQ)/Math.max(.01,maxQ-minQ)*(H-pad*2);
  const pts=frontier.map(c=>`${x(c.payloadBytes).toFixed(1)},${y(c.quality).toFixed(1)}`).join(' ');
  const dots=frontier.map(c=>`<circle cx="${x(c.payloadBytes)}" cy="${y(c.quality)}" r="3.5"><title>${c.quality.toFixed(3)} · ${Math.round(c.payloadBytes).toLocaleString()} B · ${c.encoder}</title></circle>`).join('');
  els.frontierChart.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Quality versus payload Pareto frontier"><line x1="${pad}" y1="${H-pad}" x2="${W-pad}" y2="${H-pad}" class="axis"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${H-pad}" class="axis"/><polyline points="${pts}" class="frontier-line"/>${dots}<text x="${W-pad}" y="${H-3}" text-anchor="end">payload →</text><text x="${pad+3}" y="${pad-4}">quality ↑</text></svg>`;
}

function showBest(result, opts) {
  lastSearch=result; best=result.best;
  setRunning(false);
  els.progressBar.style.transform='scaleX(1)'; els.progressPct.textContent='100%';
  if (!best) {
    els.runStatus.textContent='No candidate fit the configured payload ceiling.';
    els.encodedTag.textContent='No fit';
    renderFrontier(result.frontier,result.effectiveBudget);
    showToast('No candidate fit the configured payload ceiling.');
    return;
  }
  els.runStatus.textContent=`Complete · ${result.evaluated} candidate attempts${result.stoppedAtLimit?' · search cap reached':''}`;
  els.encodedSvg.innerHTML=withPreviewViewBox(best.result.svg);
  els.encodedEmpty.hidden=true;
  els.encodedTag.textContent=`${best.encoder} / ${best.variant}`;
  els.qualityScore.textContent=best.quality.toFixed(2);
  els.scoreRing.style.setProperty('--score', Math.max(0,Math.min(100,best.quality)));
  els.payloadMetric.textContent=formatBytes(best.payloadBytes);
  els.budgetMetric.textContent=`${(best.payloadBytes / result.effectiveBudget * 100).toFixed(2)}%`;
  els.layersMetric.textContent=best.layers.toLocaleString();
  els.encoderMetric.textContent=best.encoder;
  els.resMetric.textContent=`${best.resolution} × ${best.resolution}`;
  els.bitsMetric.textContent=`${best.bits}-bit RGB`;
  els.precisionMetric.textContent=`${best.settings?.precision ?? '?'} decimals`;
  els.generateBtn.disabled=false; els.svgBtn.disabled=false; els.reportBtn.disabled=false;
  renderFrontier(result.frontier,result.effectiveBudget);
}

function startSearch() {
  if (!sourceImage) return;
  if (worker) worker.terminate();
  worker = new Worker(new URL('./worker.js', import.meta.url), { type:'module' });
  const opts=searchOptions();
  recentCandidates=[]; resetResult(); setRunning(true);
  els.runStatus.textContent=`${opts.preset === 'deep' ? 'Deep' : 'Fast'} search running…`;
  worker.onmessage=e=>{
    const msg=e.data;
    if(msg.type==='progress') onProgress(msg.progress,opts);
    else if(msg.type==='done') { worker.terminate(); worker=null; showBest(msg.result,opts); }
    else if(msg.type==='error') {
      worker.terminate(); worker=null; setRunning(false);
      els.runStatus.textContent='Search error';
      showToast(msg.message || 'Search worker failed.');
      console.error(msg.message);
    }
  };
  worker.onerror=e=>{
    setRunning(false);
    els.runStatus.textContent='Worker error';
    showToast(e.message || 'Search worker failed.');
    console.error(e);
  };
  const buffer=sourceImage.data.slice().buffer;
  worker.postMessage({type:'search',width:sourceImage.width,height:sourceImage.height,buffer,options:opts},[buffer]);
}

function cancelSearch() {
  worker?.terminate(); worker=null; setRunning(false); els.runStatus.textContent='Search cancelled';
}

function download(name, content, type='text/plain') {
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([content],{type})); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

els.importBtn.onclick=()=>els.fileInput.click();
els.sampleBtn?.addEventListener('click', async () => {
  try {
    const res = await fetch('./assets/sample-crew-emblem.png');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    await loadFile(new File([blob], 'sample-crew-emblem.png', { type: blob.type || 'image/png' }));
  } catch (error) {
    showToast(`Could not load sample emblem: ${error.message}`);
  }
});
els.fileInput.onchange=e=>loadFile(e.target.files?.[0]);
els.dropZone.addEventListener('click',()=>els.fileInput.click());
els.dropZone.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();els.fileInput.click();}});
for(const type of ['dragenter','dragover']) els.dropZone.addEventListener(type,e=>{e.preventDefault();els.dropZone.classList.add('drag');});
for(const type of ['dragleave','drop']) els.dropZone.addEventListener(type,e=>{e.preventDefault();els.dropZone.classList.remove('drag');});
els.dropZone.addEventListener('drop',e=>loadFile(e.dataTransfer.files?.[0]));
els.runBtn.onclick=startSearch; els.cancelBtn.onclick=cancelSearch;
els.edgeThreshold.oninput=()=>els.edgeOut.textContent=els.edgeThreshold.value;
els.smoothing?.addEventListener('change', () => { if (sourceImage) paintReferencePreview(); });

document.addEventListener('keydown', e => {
  const tag = e.target?.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    if (!els.importBtn.disabled) els.fileInput.click();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    if (!els.runBtn.disabled) startSearch();
  }
  if (e.key === 'Escape' && !els.cancelBtn.disabled) {
    e.preventDefault();
    cancelSearch();
  }
  if (typing) return;
});

els.generateBtn.onclick=()=>{
  if(!best) return;
  els.consoleCode.value=generateConsoleCode({svg:best.result.svg,layersJson:best.result.layersJson,budget:Number(els.budget.value)||1280000});
  els.copyBtn.disabled=false;
  showToast('Console code generated. Paste it into the Social Club emblem editor.', 'ok');
};
els.copyBtn.onclick=async()=>{
  try { await navigator.clipboard.writeText(els.consoleCode.value); els.copyBtn.textContent='Copied'; setTimeout(()=>els.copyBtn.textContent='Copy console code',1200); }
  catch { els.consoleCode.select(); document.execCommand('copy'); }
};
els.svgBtn.onclick=()=>best&&download('rage-emblem.svg',best.result.svg,'image/svg+xml');
els.reportBtn.onclick=()=>{
  if(!best||!lastSearch)return;
  const report={
    generatedAt:new Date().toISOString(), version:VERSION, budget:lastSearch.budget, reserve:lastSearch.reserve, effectiveBudget:lastSearch.effectiveBudget,
    winner:{id:best.id,encoder:best.encoder,resolution:best.resolution,bits:best.bits,variant:best.variant,quality:best.quality,mse:best.mse,payloadBytes:best.payloadBytes,base64DataBytes:best.base64DataBytes,layers:best.layers,settings:best.settings,payload:best.result.payload},
    frontier:lastSearch.frontier
  };
  download('rage-emblem-report.json',JSON.stringify(report,null,2),'application/json');
};

resetResult();
