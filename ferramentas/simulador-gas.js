// Simulador minimo do ambiente Google Apps Script para rodar o projeto em Node.
// Conta cada chamada que, no Google real, custaria uma ida ao servidor.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

function criarAmbiente() {
  const contagem = {};
  const conta = (k) => { contagem[k] = (contagem[k] || 0) + 1; };

  function colParaNum(l) { let n = 0; for (const ch of l) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
  function parseA1(a1) {
    const m = a1.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
    const c1 = colParaNum(m[1]), r1 = +m[2];
    const c2 = m[3] ? colParaNum(m[3]) : c1, r2 = m[4] ? +m[4] : r1;
    return [r1, c1, r2 - r1 + 1, c2 - c1 + 1];
  }

  class Sheet {
    constructor(nome) { this.nome = nome; this.dados = []; this.maxR = 1000; this.maxC = 26; this.charts = [];
      const px = new Proxy(this, { get: (t, k) => (k in t) ? (typeof t[k] === 'function' ? t[k].bind(px) : t[k]) : (() => px) });
      return px; }
    cel(r, c) { return (this.dados[r - 1] && this.dados[r - 1][c - 1] !== undefined) ? this.dados[r - 1][c - 1] : ''; }
    set(r, c, v) { while (this.dados.length < r) this.dados.push([]); this.dados[r - 1][c - 1] = v; }
    getName() { return this.nome; }
    getLastRow() { conta('sheet.getLastRow'); for (let r = this.dados.length; r >= 1; r--) { if ((this.dados[r - 1] || []).some(v => v !== '' && v !== undefined && v !== null)) return r; } return 0; }
    getLastColumn() { conta('sheet.getLastColumn'); let m = 0; this.dados.forEach(l => (l || []).forEach((v, i) => { if (v !== '' && v !== undefined && v !== null) m = Math.max(m, i + 1); })); return m; }
    getMaxRows() { return this.maxR; } getMaxColumns() { return this.maxC; }
    insertColumnsAfter(c, n) { this.maxC += n; } insertRowsAfter(r, n) { this.maxR += n; }
    getRange(a, b, c, d) {
      conta('sheet.getRange');
      let r, col, nr, nc;
      if (typeof a === 'string') [r, col, nr, nc] = parseA1(a); else { r = a; col = b; nr = c || 1; nc = d || 1; }
      return new Range(this, r, col, nr, nc);
    }
    getDataRange() { const lr = Math.max(this._ultimaLinha(), 1), lc = Math.max(this._ultimaColuna(), 1); return new Range(this, 1, 1, lr, lc); }
    _ultimaLinha() { for (let r = this.dados.length; r >= 1; r--) { if ((this.dados[r - 1] || []).some(v => v !== '' && v !== undefined && v !== null)) return r; } return 0; }
    _ultimaColuna() { let m = 0; this.dados.forEach(l => (l || []).forEach((v, i) => { if (v !== '' && v !== undefined && v !== null) m = Math.max(m, i + 1); })); return m; }
    deleteRow(r) { conta('sheet.deleteRow'); this.dados.splice(r - 1, 1); }
    deleteRows(r, n) { conta('sheet.deleteRows'); this.dados.splice(r - 1, n); }
    clear() { this.dados = []; }
    getCharts() { return this.charts.slice(); }
    removeChart(c) { this.charts = this.charts.filter(x => x !== c); }
    insertChart(c) { this.charts.push(c); }
    newChart() { const b = new Proxy({}, { get: (t, p) => p === 'build' ? () => ({}) : () => b }); return b; }
  }
  // Range com metodos de formatacao como no-op encadeavel.
  class Range {
    constructor(s, r, c, nr, nc) { this.s = s; this.r = r; this.c = c; this.nr = nr; this.nc = nc;
      const px = new Proxy(this, { get: (t, k) => (k in t) ? (typeof t[k] === 'function' ? t[k].bind(px) : t[k]) : (() => px) });
      return px; }
    getValues() { conta('range.getValues'); const out = []; for (let i = 0; i < this.nr; i++) { const l = []; for (let j = 0; j < this.nc; j++) l.push(this.s.cel(this.r + i, this.c + j)); out.push(l); } return out; }
    getValue() { conta('range.getValues'); return this.s.cel(this.r, this.c); }
    setValues(m) { conta('range.setValues'); if (m.length !== this.nr || m[0].length !== this.nc) throw new Error('setValues: dimensao ' + m.length + 'x' + m[0].length + ' != ' + this.nr + 'x' + this.nc); m.forEach((l, i) => l.forEach((v, j) => this.s.set(this.r + i, this.c + j, v))); return this; }
    setValue(v) { conta('range.setValues'); this.s.set(this.r, this.c, v); return this; }
    setFormula(f) { conta('range.setValues'); this.s.set(this.r, this.c, f); return this; }
    clear() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) if (this.s.dados[this.r + i - 1]) this.s.dados[this.r + i - 1][this.c + j - 1] = ''; return this; }
    clearContent() { return this.clear(); }
    getNumColumns() { return this.nc; }
  }
  class Spreadsheet {
    constructor() { this.abas = {}; }
    getSheetByName(n) { conta('ss.getSheetByName'); return this.abas[n] || null; }
    insertSheet(n) { this.abas[n] = new Sheet(n); return this.abas[n]; }
    getName() { return 'Simulada'; } getUrl() { return 'https://simulada'; } getId() { return 'ID'; }
  }
  const ss = new Spreadsheet();
  const mapa = () => { const m = {}; return { get: k => (k in m ? m[k] : null), put: (k, v) => { m[k] = v; }, remove: k => { delete m[k]; }, removeAll: ks => ks.forEach(k => delete m[k]) }; };
  const cache = mapa();
  const cacheContado = { get: k => { conta('cache.get'); return cache.get(k); }, put: (k, v) => { conta('cache.put'); cache.put(k, v); }, remove: k => { conta('cache.remove'); cache.remove(k); }, removeAll: ks => { conta('cache.remove'); cache.removeAll(ks); } };
  const props = () => { const m = {}; return { getProperty: k => m[k] || null, setProperty: (k, v) => { m[k] = v; }, getProperties: () => ({ ...m }) }; };
  const docProps = props(), scriptProps = props();
  const regra = new Proxy({}, { get: (t, p) => p === 'build' ? () => ({}) : () => regra });

  const pad = n => String(n).padStart(2, '0');
  const ctx = {
    console: { log() {}, error() {}, warn() {} },
    Logger: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, newDataValidation: () => regra, flush() {} },
    CacheService: { getDocumentCache: () => cacheContado },
    LockService: { getDocumentLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    PropertiesService: { getDocumentProperties: () => docProps, getScriptProperties: () => scriptProps },
    Utilities: { sleep() {}, formatDate: (d, tz, f) => f.replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate())).replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace('ss', pad(d.getSeconds())) },
    Charts: { ChartType: { COLUMN: 'COLUMN', PIE: 'PIE' } },
    HtmlService: { createHtmlOutputFromFile: () => ({ getContent: () => '' }) },
    ScriptApp: { getProjectTriggers: () => [], getScriptId: () => 'SCRIPT', getOAuthToken: () => 'x' },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'a@b' }) },
    UrlFetchApp: { fetch() { throw new Error('sem rede no simulador'); } },
  };
  vm.createContext(ctx);
  
  const dir = path.join(__dirname, '..', 'src');
  fs.readdirSync(dir).filter(f => f.endsWith('.gs')).sort().forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  });
  return { ctx, contagem, zerar: () => Object.keys(contagem).forEach(k => delete contagem[k]), ss };
}
module.exports = { criarAmbiente };
