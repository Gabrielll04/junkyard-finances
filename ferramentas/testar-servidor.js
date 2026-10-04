const { criarAmbiente } = require('./simulador-gas.js');
const { ctx } = criarAmbiente();
const r = (c) => require('vm').runInContext(c, ctx);
const s = r('setupFinanceiro({ criarDadosExemplo: true })');
if (!s.sucesso) { console.log('SETUP FALHOU:', s.mensagem); process.exit(1); }
const v = r('validarDados()');
console.log('validarDados apos setup: problemas=' + v.problemas.length + (v.problemas.length ? '\n  ' + v.problemas.slice(0,5).join('\n  ') : ''));
const res = r('executarTodosOsTestes()');
console.log(res.resumo); res.detalhes.forEach(d => console.log('  ' + d));
const v2 = r('validarDados()');
console.log('validarDados apos testes (sujeira?): problemas=' + v2.problemas.length + ', avisos=' + v2.avisos.length);
process.exit(res.sucesso ? 0 : 1);
