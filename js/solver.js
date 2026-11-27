// Résolution d'un système linéaire complexe A·x = b (élimination de Gauss avec pivot partiel).
// Les matrices sont stockées à plat (Float64Array) : partie réelle et partie imaginaire séparées.
export function solveComplex(N, Are, Aim, bre, bim) {
  for (let k = 0; k < N; k++) {
    let p = k, best = -1;
    for (let r = k; r < N; r++) {
      const m = Math.abs(Are[r * N + k]) + Math.abs(Aim[r * N + k]);
      if (m > best) { best = m; p = r; }
    }
    if (best < 1e-20) continue;
    if (p !== k) {
      for (let c = 0; c < N; c++) {
        let t = Are[k * N + c]; Are[k * N + c] = Are[p * N + c]; Are[p * N + c] = t;
        t = Aim[k * N + c]; Aim[k * N + c] = Aim[p * N + c]; Aim[p * N + c] = t;
      }
      let t = bre[k]; bre[k] = bre[p]; bre[p] = t;
      t = bim[k]; bim[k] = bim[p]; bim[p] = t;
    }
    const pr = Are[k * N + k], pi = Aim[k * N + k];
    const den = pr * pr + pi * pi;
    for (let r = k + 1; r < N; r++) {
      const ar = Are[r * N + k], ai = Aim[r * N + k];
      if (ar === 0 && ai === 0) continue;
      const fr = (ar * pr + ai * pi) / den, fi = (ai * pr - ar * pi) / den;
      for (let c = k; c < N; c++) {
        const xr = Are[k * N + c], xi = Aim[k * N + c];
        if (xr === 0 && xi === 0) continue;
        Are[r * N + c] -= fr * xr - fi * xi;
        Aim[r * N + c] -= fr * xi + fi * xr;
      }
      bre[r] -= fr * bre[k] - fi * bim[k];
      bim[r] -= fr * bim[k] + fi * bre[k];
    }
  }
  const xr = new Float64Array(N), xi = new Float64Array(N);
  for (let k = N - 1; k >= 0; k--) {
    let sr = bre[k], si = bim[k];
    for (let c = k + 1; c < N; c++) {
      const ar = Are[k * N + c], ai = Aim[k * N + c];
      if (ar === 0 && ai === 0) continue;
      sr -= ar * xr[c] - ai * xi[c];
      si -= ar * xi[c] + ai * xr[c];
    }
    const pr = Are[k * N + k], pi = Aim[k * N + k];
    const den = pr * pr + pi * pi;
    if (den < 1e-40) { xr[k] = 0; xi[k] = 0; continue; }
    xr[k] = (sr * pr + si * pi) / den;
    xi[k] = (si * pr - sr * pi) / den;
  }
  return [xr, xi];
}

export const cabs = (z) => Math.hypot(z[0], z[1]);
export const carg = (z) => Math.atan2(z[1], z[0]) * 180 / Math.PI;
export const csub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export function cdiv(a, b) {
  const d = b[0] * b[0] + b[1] * b[1] || 1e-30;
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
}
