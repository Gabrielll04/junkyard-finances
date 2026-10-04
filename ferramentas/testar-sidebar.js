// Teste de ponta a ponta da sidebar: navegador simulado (jsdom) + servidor simulado.
const fs = require('fs'); const vm = require('vm');
const { JSDOM } = require('jsdom');
const { criarAmbiente } = require('./simulador-gas.js');
const { ctx } = criarAmbiente();
const srv = (c) => vm.runInContext(c, ctx);
srv('setupFinanceiro({ criarDadosExemplo: true })');

let ok = 0, falhas = 0;
const conferir = (cond, desc) => { if (cond) { ok++; console.log('  ok   ' + desc); } else { falhas++; console.log('  FALHA ' + desc); } };
const temDate = (v) => v instanceof Date || (v && typeof v === 'object' && Object.values(v).some(temDate));

const chamadas = [];
let falharProxima = null;
function ponte(win) {
  // Imita google.script.run: assincrono, e com as regras de serializacao do Google.
  const criar = (sucesso, falha) => new Proxy({}, { get: (t, nome) => {
    if (nome === 'withSuccessHandler') return (f) => criar(f, falha);
    if (nome === 'withFailureHandler') return (f) => criar(sucesso, f);
    return (arg) => setTimeout(() => {
      chamadas.push(nome);
      if (falharProxima) { const e = falharProxima; falharProxima = null; return falha && falha(new win.Error(e)); }
      srv('_invalidarMemoria()'); // cada chamada e uma execucao nova no Google
      let res;
      try { res = ctx[nome](arg === undefined ? undefined : JSON.parse(JSON.stringify(arg))); }
      catch (e) { return falha && falha(new win.Error(e.message)); }
      // Regra do Google: Date na resposta faz o handler receber null.
      if (temDate(res)) { console.log('  !! resposta de ' + nome + ' contem Date'); res = null; }
      sucesso && sucesso(res === undefined ? undefined : JSON.parse(JSON.stringify(res)));
    }, 0);
  }});
  return criar(null, null);
}

const html = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'Sidebar.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', beforeParse(win) {
  win.google = { script: { get run() { return ponte(win); } } };
  win.Element.prototype.scrollIntoView = () => {};  // jsdom nao implementa; navegadores sim
  win.confirm = () => true;
}});
const w = dom.window, d = w.document, $ = (id) => d.getElementById(id);
const esperar = (ms = 30) => new Promise(r => setTimeout(r, ms));
const clicar = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

(async () => {
  await esperar();
  console.log('CARGA INICIAL');
  conferir(/atualizado em/.test($('cabecalhoSub').textContent), 'estado carregou: ' + $('cabecalhoSub').textContent);
  conferir(/Nenhuma despesa com tag/.test($('listaTags').textContent), 'sem tags ainda, painel explica como usar');

  console.log('LANCAR COM TAGS');
  chamadas.length = 0;
  $('lancTipo').value = 'DESPESA'; $('lancValor').value = '150,00';
  $('lancCategoria').value = 'Contas fixas'; $('lancDescricao').value = 'Conta de luz';
  $('lancTags').value = 'luz, apartamento';
  $('formLancamento').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await esperar();
  conferir(/Registrado/.test($('msgLancamento').textContent), 'mensagem de sucesso: ' + $('msgLancamento').textContent.split('\n')[0]);
  conferir(chamadas.join(',') === 'uiRegistrarLancamento', 'UMA unica chamada ao servidor (antes eram duas): ' + chamadas.join(','));
  conferir($('lancTags').value === '', 'campo de tags limpo apos lancar');
  conferir(/luz/.test($('listaTags').textContent) && /apartamento/.test($('listaTags').textContent), 'painel mostra as duas tags');
  conferir(/R\$ 150,00/.test($('listaTags').textContent), 'painel mostra o valor da tag');

  console.log('CHIPS DE SUGESTAO');
  const chips = () => [...$('sugestoesTagsLanc').querySelectorAll('[data-alternar-tag]')];
  conferir(chips().map(c => c.dataset.alternarTag).sort().join(',') === 'apartamento,luz', 'chips sugerem as tags ja usadas');
  clicar(chips().find(c => c.dataset.alternarTag === 'luz'));
  conferir($('lancTags').value === 'luz', 'clicar no chip adiciona a tag ao campo');
  clicar(chips().find(c => c.dataset.alternarTag === 'apartamento'));
  conferir($('lancTags').value === 'luz, apartamento', 'segundo chip acrescenta com virgula');
  clicar(chips().find(c => c.dataset.alternarTag === 'luz'));
  conferir($('lancTags').value === 'apartamento', 'clicar de novo remove a tag');
  $('lancTags').value = '';

  console.log('HISTORICO DA TAG NO PAINEL');
  clicar(d.querySelector('[data-consultar-tag="luz"]'));
  await esperar();
  conferir($('detalheTag').querySelectorAll('.barra-mes').length === 6, 'mostra 6 meses');
  conferir(/Total: R\$ 150,00/.test($('detalheTag').textContent), 'total da tag no periodo');

  console.log('EXTRATO: FILTRO POR TAG');
  const itens = () => [...$('listaExtrato').querySelectorAll('.item')];
  const chipNoExtrato = $('listaExtrato').querySelector('[data-filtrar-tag="luz"]');
  conferir(!!chipNoExtrato, 'lancamento exibe suas tags no extrato');
  clicar(chipNoExtrato); await esperar();
  conferir($('filtroTag').value === 'luz', 'clicar na tag do extrato liga o filtro');
  conferir(itens().length === 1, 'extrato filtrado mostra so o lancamento com a tag (' + itens().length + ')');

  console.log('EDITAR TAGS COM FILTRO ATIVO');
  clicar($('listaExtrato').querySelector('[data-acao="editar"]')); await esperar(5);
  conferir($('edTags').value === 'luz, apartamento', 'formulario de edicao traz as tags atuais');
  $('edTags').value = 'luz';
  chamadas.length = 0;
  clicar(d.querySelector('[data-acao="salvar"]')); await esperar();
  conferir(/Atualizado/.test($('msgExtrato').textContent), 'edicao salva: ' + $('msgExtrato').textContent);
  conferir($('filtroTag').value === 'luz' && itens().length === 1, 'filtro continua aplicado depois de editar (bug antigo corrigido)');
  conferir(!/apartamento/.test($('listaTags').textContent), 'tag removida sai do painel');

  console.log('ERRO DE MULTIPLAS CONTAS');
  falharProxima = 'Ocorreu um erro no servidor durante a leitura do armazenamento. Código do erro: PERMISSION_DENIED.';
  $('lancValor').value = '10'; $('lancCategoria').value = 'Mercado';
  $('formLancamento').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await esperar();
  conferir(/MAIS DE UMA conta Google/.test($('msgLancamento').textContent), 'erro do Google vira explicacao com solucao');

  console.log('\n' + ok + ' ok, ' + falhas + ' falha(s)');
  process.exit(falhas ? 1 : 0);
})();
