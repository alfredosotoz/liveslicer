const state = {
  file: null,
  arrayBuffer: null,
  audioBuffer: null,
  clipPlan: []
};

const els = {
  file: document.getElementById('audioFile'),
  fileMeta: document.getElementById('fileMeta'),
  bpm: document.getElementById('bpm'),
  beatsPerBar: document.getElementById('beatsPerBar'),
  sections: document.getElementById('sections'),
  sectionTemplate: document.getElementById('sectionTemplate'),
  addSection: document.getElementById('addSection'),
  analyzeBtn: document.getElementById('analyzeBtn'),
  exportBtn: document.getElementById('exportBtn'),
  status: document.getElementById('status'),
  clipList: document.getElementById('clipList')
};

const defaults = [
  { name: 'Intro', bars: 8 },
  { name: 'Break', bars: 16 },
  { name: 'Build up', bars: 16 },
  { name: 'Drop', bars: 16 }
];

defaults.forEach((item) => addSection(item.name, item.bars));

els.addSection.addEventListener('click', () => addSection('New section', 16));
els.analyzeBtn.addEventListener('click', analyzeLayout);
els.exportBtn.addEventListener('click', exportClips);
els.file.addEventListener('change', onFileSelected);

function addSection(name = '', bars = 16) {
  const node = els.sectionTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector('.section-name').value = name;
  node.querySelector('.section-bars').value = bars;
  node.querySelector('.remove-section').addEventListener('click', () => {
    node.remove();
  });
  els.sections.appendChild(node);
}

async function onFileSelected(event) {
  const file = event.target.files?.[0];
  state.file = null;
  state.arrayBuffer = null;
  state.audioBuffer = null;
  state.clipPlan = [];
  renderClipList();
  els.exportBtn.disabled = true;

  if (!file) {
    els.fileMeta.textContent = 'No track loaded.';
    return;
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const context = new AudioContext();
    const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));

    state.file = file;
    state.arrayBuffer = arrayBuffer;
    state.audioBuffer = audioBuffer;

    els.fileMeta.textContent = `${file.name} — ${formatSeconds(audioBuffer.duration)} (${audioBuffer.sampleRate} Hz)`;
    setStatus('Track loaded. Click “Analyze layout”.', 'ok');
  } catch (error) {
    setStatus(`Could not decode this file. ${error.message}`, 'error');
    els.fileMeta.textContent = 'No track loaded.';
  }
}

function getSections() {
  return [...els.sections.querySelectorAll('.section-row')]
    .map((row) => ({
      name: row.querySelector('.section-name').value.trim() || 'Section',
      bars: Number.parseInt(row.querySelector('.section-bars').value, 10)
    }))
    .filter((part) => Number.isFinite(part.bars) && part.bars > 0);
}

function analyzeLayout() {
  if (!state.audioBuffer) {
    setStatus('Load an audio file first.', 'error');
    return;
  }

  const bpm = Number.parseFloat(els.bpm.value);
  const beatsPerBar = Number.parseFloat(els.beatsPerBar.value);

  if (!Number.isFinite(bpm) || bpm <= 0 || !Number.isFinite(beatsPerBar) || beatsPerBar <= 0) {
    setStatus('BPM and beats/bar must be positive numbers.', 'error');
    return;
  }

  const sections = getSections();
  if (sections.length === 0) {
    setStatus('Add at least one section.', 'error');
    return;
  }

  const secondsPerBar = (60 / bpm) * beatsPerBar;
  const duration = state.audioBuffer.duration;

  let cursor = 0;
  const plan = [];

  for (const section of sections) {
    const clipDuration = section.bars * secondsPerBar;
    const end = cursor + clipDuration;
    if (end > duration + 0.001) {
      setStatus(
        `Section “${section.name}” exceeds song length. Reduce bars or raise BPM assumption.`,
        'error'
      );
      return;
    }

    plan.push({
      label: section.name,
      bars: section.bars,
      start: cursor,
      end
    });

    cursor = end;
  }

  if (cursor < duration) {
    plan.push({
      label: 'Remainder',
      bars: null,
      start: cursor,
      end: duration
    });
  }

  state.clipPlan = plan;
  renderClipList();
  els.exportBtn.disabled = false;

  const planned = plan.reduce((acc, p) => acc + (p.end - p.start), 0);
  setStatus(
    `Layout ready: ${plan.length} clip(s), ${formatSeconds(planned)} total = full track ${formatSeconds(duration)}.`,
    'ok'
  );
}

function renderClipList() {
  els.clipList.innerHTML = '';

  for (const [index, clip] of state.clipPlan.entries()) {
    const li = document.createElement('li');
    const barsLabel = clip.bars ? `${clip.bars} bars` : 'auto';
    li.textContent = `${index + 1}. ${clip.label} (${barsLabel}) — ${formatSeconds(clip.start)} to ${formatSeconds(clip.end)} (${formatSeconds(clip.end - clip.start)})`;
    els.clipList.appendChild(li);
  }
}

async function exportClips() {
  if (!state.audioBuffer || state.clipPlan.length === 0 || !state.file) {
    setStatus('Analyze layout first.', 'error');
    return;
  }

  setStatus('Exporting clips...', 'ok');

  for (const [index, clip] of state.clipPlan.entries()) {
    const clipBuffer = sliceAudioBuffer(state.audioBuffer, clip.start, clip.end);
    const wavBlob = audioBufferToWavBlob(clipBuffer);
    const safeName = clip.label.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '');
    downloadBlob(
      wavBlob,
      `${removeExtension(state.file.name)}_${String(index + 1).padStart(2, '0')}_${safeName || 'clip'}.wav`
    );
  }

  setStatus('Done. Clips downloaded as WAV files.', 'ok');
}

function sliceAudioBuffer(sourceBuffer, startSec, endSec) {
  const sampleRate = sourceBuffer.sampleRate;
  const start = Math.floor(startSec * sampleRate);
  const end = Math.floor(endSec * sampleRate);
  const frameCount = Math.max(1, end - start);
  const channels = sourceBuffer.numberOfChannels;

  const newBuffer = new AudioBuffer({
    length: frameCount,
    numberOfChannels: channels,
    sampleRate
  });

  for (let channel = 0; channel < channels; channel += 1) {
    const sourceData = sourceBuffer.getChannelData(channel);
    const targetData = newBuffer.getChannelData(channel);
    targetData.set(sourceData.subarray(start, end));
  }

  return newBuffer;
}

function audioBufferToWavBlob(audioBuffer) {
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const samples = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples; i += 1) {
    for (let ch = 0; ch < channels; ch += 1) {
      const sample = audioBuffer.getChannelData(ch)[i];
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i += 1) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function removeExtension(fileName) {
  return fileName.replace(/\.[^.]+$/, '');
}

function formatSeconds(sec) {
  const mins = Math.floor(sec / 60);
  const secs = sec % 60;
  return `${String(mins).padStart(2, '0')}:${secs.toFixed(2).padStart(5, '0')}`;
}

function setStatus(message, tone = 'ok') {
  els.status.textContent = message;
  els.status.style.color = tone === 'error' ? 'var(--danger)' : 'var(--muted)';
}
