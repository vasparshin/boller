const input = document.getElementById('logoInput');
const display = document.getElementById('logoDisplay');

input.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'svg') {
    const url = URL.createObjectURL(file);
    display.src = url;
    return;
  }

  if (ext === 'dxf' || ext === 'dwg') {
    try {
      const text = await file.text();
      const svg = dxfToSvg(text);
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      display.src = url;
    } catch (err) {
      console.error(err);
      alert('Unable to convert file to SVG.');
    }
    return;
  }

  alert('Unsupported file type. Please upload an SVG, DXF, or DWG file.');
  input.value = '';
});

function dxfToSvg(contents) {
  const lines = contents.split(/\r?\n/);
  let i = 0;
  const elements = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function updateBounds(x, y) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  while (i < lines.length) {
    const code = lines[i++];
    const value = lines[i++];
    if (code === '0') {
      const type = value.trim();
      if (type === 'LINE') {
        let x1, y1, x2, y2;
        while (i < lines.length) {
          const c = lines[i++];
          const v = lines[i++];
          if (c === '0') { i -= 2; break; }
          if (c === '10') x1 = parseFloat(v);
          if (c === '20') y1 = parseFloat(v);
          if (c === '11') x2 = parseFloat(v);
          if (c === '21') y2 = parseFloat(v);
        }
        updateBounds(x1, y1);
        updateBounds(x2, y2);
        elements.push(`<line x1="${x1}" y1="${-y1}" x2="${x2}" y2="${-y2}" stroke="black" fill="none" />`);
      } else if (type === 'LWPOLYLINE' || type === 'POLYLINE') {
        const pts = [];
        while (i < lines.length) {
          const c = lines[i++];
          const v = lines[i++];
          if (c === '0') { i -= 2; break; }
          if (c === '10') {
            const x = parseFloat(v);
            const c2 = lines[i++];
            const v2 = lines[i++];
            const y = parseFloat(v2);
            pts.push(`${x},${-y}`);
            updateBounds(x, y);
          }
        }
        elements.push(`<polyline points="${pts.join(' ')}" stroke="black" fill="none" />`);
      } else if (type === 'CIRCLE') {
        let cx, cy, r;
        while (i < lines.length) {
          const c = lines[i++];
          const v = lines[i++];
          if (c === '0') { i -= 2; break; }
          if (c === '10') cx = parseFloat(v);
          if (c === '20') cy = parseFloat(v);
          if (c === '40') r = parseFloat(v);
        }
        updateBounds(cx - r, cy - r);
        updateBounds(cx + r, cy + r);
        elements.push(`<circle cx="${cx}" cy="${-cy}" r="${r}" stroke="black" fill="none" />`);
      }
    }
  }

  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    throw new Error('No drawable entities found');
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const viewBox = `${minX} ${-maxY} ${width} ${height}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${elements.join('')}</svg>`;
}
