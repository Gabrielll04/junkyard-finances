const { criarAmbiente } = require('./simulador-gas.js');
const { ctx, contagem, zerar } = criarAmbiente();
const r = (code) => require('vm').runInContext(code, ctx);

const setup = r('setupFinanceiro({ criarDadosExemplo: true })');
console.log('SETUP:', setup.sucesso ? 'OK' : 'FALHOU -> ' + setup.mensagem);

// Mais historico, para a medicao refletir uso real (~3 meses, ~150 lancamentos)
r(`(function(){ var h=new Date(); for (var i=0;i<130;i++){ var d=new Date(h.getFullYear(), h.getMonth()-(i%3), 1+(i%27));
   _inserirLancamento({data:d, tipo:'DESPESA', valor: 10+i, categoria: ['Mercado','Lazer','Transporte','Contas fixas'][i%4], descricao:'carga '+i, origem:'CARGA'}, {permitirDuplicado:true}); } })()`);

// cada chamada da sidebar e uma execucao nova no Google: memoria zerada
const novaExecucao = () => { try { r('_invalidarMemoria()'); } catch (e) {} };
novaExecucao(); zerar();
const t0 = Date.now();
const res = r(`uiRegistrarLancamento({ tipo:'DESPESA', valor: 87.5, data: new Date(), categoria:'Contas fixas', descricao:'Conta de luz' })`);
const ms = Date.now() - t0;
console.log('\nLANCAMENTO RAPIDO:', res.sucesso ? 'OK' : 'FALHOU -> ' + res.mensagem);
const c1 = { ...contagem };
novaExecucao(); zerar();
if (!process.argv.includes('--sem-recarga')) r('uiObterEstado()');  // a sidebar faz essa 2a chamada logo depois
const c2 = { ...contagem };

function resumo(c) { const leituras = (c['range.getValues']||0)+(c['sheet.getLastRow']||0)+(c['sheet.getLastColumn']||0)+(c['ss.getSheetByName']||0);
  const cache = (c['cache.get']||0)+(c['cache.put']||0)+(c['cache.remove']||0); const escritas = (c['range.setValues']||0)+(c['sheet.deleteRow']||0);
  return { leituras, cache, escritas }; }
const a = resumo(c1), b = resumo(c2);
console.log('  chamada 1 (registrar + painel):', a);
console.log('  chamada 2 (sidebar recarrega)  :', b);
const est = (x) => x.leituras * 60 + x.cache * 15 + x.escritas * 30;
console.log('  estimativa no Google (60ms/leitura, 15ms/cache, 30ms/escrita): ~' + ((est(a)+est(b))/1000).toFixed(1) + ' s');
console.log('  detalhe chamada 1:', JSON.stringify(c1));
