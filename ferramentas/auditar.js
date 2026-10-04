// Auditoria estatica: sintaxe de todos os .gs, funcoes privadas cruzando
// arquivos e sentinelas de verificarInstalacao() apontando para funcoes reais.
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const dir = path.join(__dirname, '..', 'src');
const arqs = fs.readdirSync(dir).filter(f => f.endsWith('.gs')).sort();
const txt = Object.fromEntries(arqs.map(f => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
let falhas = 0;
const falha = (m) => { falhas++; console.log('  FALHA ' + m); };

// 1. Sintaxe (Apps Script V8 == JavaScript moderno)
arqs.forEach(f => { try { new vm.Script(txt[f], { filename: f }); } catch (e) { falha(f + ': ' + e.message); } });
try { new vm.Script(fs.readFileSync(path.join(dir, 'Sidebar.html'), 'utf8').match(/<script>([\s\S]*)<\/script>/)[1]); }
catch (e) { falha('Sidebar.html: ' + e.message); }
console.log('sintaxe: ' + (arqs.length + 1) + ' arquivos verificados');

// 2. Funcoes privadas (_nome) usadas fora do arquivo onde nascem. No Apps Script
// tudo e global, entao isso "funciona" - ate o arquivo de origem faltar no
// projeto e virar "X is not defined" no meio de uma operacao.
const DELIBERADAS = new Set(['_inserirLancamento', '_movimentarMeta', '_mascararSegredos']);
const definidas = {};
arqs.forEach(f => { for (const m of txt[f].matchAll(/^function (_[\w$]*)\s*\(/gm)) definidas[m[1]] = f; });
Object.entries(definidas).forEach(([nome, origem]) => {
  if (DELIBERADAS.has(nome)) return;
  arqs.filter(f => f !== origem && f !== 'Testes.gs').forEach(f => {
    if (new RegExp('(?<![.\\w$])' + nome.replace('$', '\\$') + '\\s*\\(').test(txt[f])) falha(nome + ' (de ' + origem + ') usada em ' + f);
  });
});
console.log('privadas cruzando arquivos: verificado');

// 3. Sentinelas de verificarInstalacao()
const todas = new Set(); arqs.forEach(f => { for (const m of txt[f].matchAll(/^function ([\w$]+)/gm)) todas.add(m[1]); });
const bloco = txt['Setup.gs'].slice(txt['Setup.gs'].indexOf('var SENTINELAS = ['), txt['Setup.gs'].indexOf('function verificarInstalacao'));
let qtd = 0;
for (const m of bloco.matchAll(/return \[([^\]]+)\]/g)) m[1].split(',').map(s => s.trim()).filter(Boolean).forEach(n => { qtd++; if (!todas.has(n)) falha('sentinela inexistente: ' + n); });
console.log('sentinelas: ' + qtd + ' verificadas');

console.log(falhas ? '\n' + falhas + ' problema(s)' : '\nauditoria limpa');
process.exit(falhas ? 1 : 0);
