export function renderOverlay(canvas, reconstruction, highlightId = null) {
  const ctx = canvas.getContext("2d");
  const { width, height } = reconstruction;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(reconstruction.canvas, 0, 0);
  ctx.save();
  ctx.lineJoin = "round";
  for (const b of reconstruction.buildings) {
    const lime = b.className === "lowrise";
    const active = highlightId === b.id;
    ctx.beginPath();
    b.polygon.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = lime ? "rgba(212,255,0,0.28)" : "rgba(0,229,255,0.24)";
    if (active) ctx.fillStyle = "rgba(255,179,0,0.4)";
    ctx.fill();
    ctx.strokeStyle = active ? "#ffb300" : lime ? "#d4ff00" : "#00e5ff";
    ctx.lineWidth = active ? 3 : 2;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 8;
    ctx.stroke();
  }
  ctx.restore();
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export function buildingsToJson(reconstruction, params, meta) {
  return {
    type: "FeatureCollection",
    name: "sector-3d-footprints",
    meta,
    params,
    raster: { width: reconstruction.width, height: reconstruction.height },
    features: reconstruction.buildings.map((b) => ({
      type: "Feature",
      properties: {
        id: b.id,
        height: b.height,
        area: b.area,
        className: b.className,
      },
      geometry: {
        type: "Polygon",
        coordinates: [b.polygon.map((p) => [p.x, p.y]).concat([[b.polygon[0].x, b.polygon[0].y]])],
      },
    })),
  };
}
