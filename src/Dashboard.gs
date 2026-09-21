/**
 * Dashboard.gs
 * ---------------------------------------------------------------------------
 * Montagem e atualizacao da aba Dashboard.
 *
 * Estrategia hibrida, de proposito:
 *  - Os numeros basicos do mes (receitas, despesas, aportes, resgates) sao
 *    FORMULAS nativas (SUMIFS). Assim o painel continua correto mesmo que o
 *    usuario edite a aba Lancamentos a mao e nunca rode o script.
 *  - Os indicadores derivados (cobertura da reserva, previsoes, alertas,
 *    sugestoes) sao escritos pelo script, porque dependem de logica que a
 *    planilha nao expressa bem.
 *  - Abaixo da linha AREA_LIVRE o script nunca escreve: e espaco do usuario.
 */

/** A partir desta linha o script nao toca em nada. */
var DASHBOARD_AREA_LIVRE = 34;

/** Celula que guarda o mes de referencia (primeiro dia do mes). */
var DASHBOARD_CELULA_MES = 'F2';

/**
 * Cria/atualiza toda a estrutura visual do Dashboard.
 * Chamada pelo setup e sempre que o layout precisar ser refeito.
 */
function montarLayoutDashboard() {
  var aba = obterAbaSegura(ABAS.DASHBOARD);

  // Garante espaco minimo.
  if (aba.getMaxColumns() < 7) {
    aba.insertColumnsAfter(aba.getMaxColumns(), 7 - aba.getMaxColumns());
  }
  if (aba.getMaxRows() < 60) {
    aba.insertRowsAfter(aba.getMaxRows(), 60 - aba.getMaxRows());
  }

  // Limpa apenas a area gerenciada pelo script.
  aba.getRange(1, 1, DASHBOARD_AREA_LIVRE - 1, 7).clear();

  aba.setColumnWidth(1, 230);
  aba.setColumnWidth(2, 150);
  aba.setColumnWidth(3, 30);
  aba.setColumnWidth(4, 230);
  aba.setColumnWidth(5, 150);
  aba.setColumnWidth(6, 120);
  aba.setColumnWidth(7, 320);

  // --- cabecalho ----------------------------------------------------------
  aba.getRange('A1:G1').merge()
    .setValue('PAINEL FINANCEIRO PESSOAL')
    .setFontSize(16).setFontWeight('bold')
    .setBackground('#1f3864').setFontColor('#ffffff')
    .setHorizontalAlignment('center');

  aba.getRange('A2').setValue('Ultima atualizacao:').setFontWeight('bold');
  aba.getRange('D2').setValue('Mes de referencia:').setFontWeight('bold')
    .setHorizontalAlignment('right');
  aba.getRange(DASHBOARD_CELULA_MES)
    .setValue(_primeiroDiaDoMes(new Date()))
    .setNumberFormat('mm/yyyy')
    .setBackground('#fff2cc')
    .setNote('Altere este mes e rode "Financeiro > Atualizar painel" para ver outro periodo.');

  // --- blocos -------------------------------------------------------------
  _escreverTituloBloco(aba, 'A4:B4', 'RESULTADO DO MES');
  _escreverTituloBloco(aba, 'D4:E4', 'METAS E RESERVA');
  _escreverTituloBloco(aba, 'A13:B13', 'MAIORES GASTOS DO MES');
  _escreverTituloBloco(aba, 'D13:E13', 'ORCAMENTOS EM ATENCAO');
  _escreverTituloBloco(aba, 'A21:B21', 'ALERTAS');
  _escreverTituloBloco(aba, 'D21:E21', 'PREVISOES DAS METAS');

  // Rotulos fixos do bloco "RESULTADO DO MES".
  var rotulosResultado = [
    ['Receitas do mes'],
    ['Despesas do mes'],
    ['Saldo do mes'],
    ['Taxa de poupanca'],
    ['Total aportado em metas'],
    ['Total resgatado de metas'],
    ['Despesa media mensal']
  ];
  aba.getRange(5, 1, rotulosResultado.length, 1).setValues(rotulosResultado);

  var rotulosMetas = [
    ['Saldo total em metas'],
    ['Saldo da reserva'],
    ['Reserva recomendada'],
    ['Cobertura da reserva (meses)'],
    ['Progresso da reserva'],
    ['Progresso medio das metas'],
    ['Metas ativas']
  ];
  aba.getRange(5, 4, rotulosMetas.length, 1).setValues(rotulosMetas);

  // Formulas nativas: continuam valendo mesmo sem rodar o script.
  _aplicarFormulasDashboard(aba);

  // Formatos.
  aba.getRange('B5:B7').setNumberFormat('R$ #,##0.00');
  aba.getRange('B8').setNumberFormat('0.0%');
  aba.getRange('B9:B11').setNumberFormat('R$ #,##0.00');
  aba.getRange('E5:E7').setNumberFormat('R$ #,##0.00');
  aba.getRange('E8').setNumberFormat('0.00');
  aba.getRange('E9:E10').setNumberFormat('0.0%');
  aba.getRange('E11').setNumberFormat('0');
  aba.getRange('B14:B19').setNumberFormat('R$ #,##0.00');
  aba.getRange('E14:E19').setNumberFormat('0.0%');
  aba.getRange('A2').setFontWeight('bold');
  aba.getRange('B2').setNumberFormat('dd/mm/yyyy hh:mm:ss');

  aba.getRange('A5:A11').setFontWeight('bold');
  aba.getRange('D5:D11').setFontWeight('bold');

  // Area livre do usuario.
  aba.getRange(DASHBOARD_AREA_LIVRE, 1)
    .setValue('--- Area livre: o sistema nunca escreve daqui para baixo ---')
    .setFontStyle('italic').setFontColor('#888888');

  aba.setHiddenGridlines(true);
  return aba;
}

/**
 * Escreve um titulo de bloco com fundo.
 * @private
 */
function _escreverTituloBloco(aba, intervalo, texto) {
  var faixa = aba.getRange(intervalo);
  if (faixa.getNumColumns() > 1) faixa.merge();
  faixa.setValue(texto).setFontWeight('bold')
    .setBackground('#d9e2f3').setFontColor('#1f3864');
}

/**
 * Aplica as formulas nativas do painel (SUMIFS sobre a aba Lancamentos).
 * Colunas de Lancamentos: B=data, C=tipo, D=valor, K=status.
 * @param {Sheet} aba
 * @private
 */
function _aplicarFormulasDashboard(aba) {
  var L = "'" + ABAS.LANCAMENTOS + "'";
  var mes = '$' + DASHBOARD_CELULA_MES.charAt(0) + '$' + DASHBOARD_CELULA_MES.slice(1);

  /** Monta um SUMIFS para um tipo de lancamento no mes de referencia. */
  function somaTipo(tipo) {
    return '=IFERROR(SUMIFS(' + L + '!$D:$D,' +
      L + '!$C:$C,"' + tipo + '",' +
      L + '!$B:$B,">="&' + mes + ',' +
      L + '!$B:$B,"<="&EOMONTH(' + mes + ',0),' +
      L + '!$K:$K,"<>CANCELADO"),0)';
  }

  aba.getRange('B5').setFormula(somaTipo(TIPOS_LANCAMENTO.RECEITA));
  aba.getRange('B6').setFormula(somaTipo(TIPOS_LANCAMENTO.DESPESA));
  aba.getRange('B7').setFormula('=B5-B6');
  aba.getRange('B8').setFormula('=IFERROR(IF(B5=0,0,(B5-B6)/B5),0)');
  aba.getRange('B9').setFormula(somaTipo(TIPOS_LANCAMENTO.APORTE_META));
  aba.getRange('B10').setFormula(somaTipo(TIPOS_LANCAMENTO.RESGATE_META));
  // B11 (despesa media) e escrito pelo script: depende da regra de meses base.
}

/**
 * Atualiza os valores calculados do painel.
 * Nao mexe em formulas nem na area livre do usuario.
 *
 * @param {string=} mesReferencia yyyy-MM. Se omitido, usa a celula do painel.
 * @return {Object} Indicadores usados na atualizacao.
 */
function atualizarDashboard(mesReferencia) {
  return comLock(function () {
    var aba = obterAbaSegura(ABAS.DASHBOARD);

    // Garante que o layout exista (primeira execucao ou aba apagada).
    if (String(aba.getRange('A1').getValue() || '').indexOf('PAINEL') === -1) {
      montarLayoutDashboard();
      aba = obterAbaSegura(ABAS.DASHBOARD);
    }

    // Mes: parametro > celula do painel > mes atual.
    var mes = mesReferencia;
    if (!mes) {
      var valorCelula = aba.getRange(DASHBOARD_CELULA_MES).getValue();
      var data = converterParaData(valorCelula);
      mes = data ? chaveMes(data) : mesAtual();
    }
    aba.getRange(DASHBOARD_CELULA_MES)
      .setValue(_primeiroDiaDoMes(converterParaData(mes + '-01') || new Date()));

    var ind = gerarIndicadores(mes);

    // --- bloco metas e reserva ---------------------------------------------
    aba.getRange('E5:E11').setValues([
      [ind.saldoTotalMetas],
      [ind.reserva.saldo],
      [ind.reserva.valorRecomendado],
      [ind.reserva.coberturaMeses],
      [ind.reserva.progressoPercentual / 100],
      [ind.progressoMedioMetas / 100],
      [ind.quantidadeMetas]
    ]);

    // Despesa media (regra do sistema, nao formula).
    aba.getRange('B11').setValue(ind.despesaMediaConfigurada);

    // Destaque visual quando a reserva esta abaixo do recomendado.
    aba.getRange('E8').setBackground(
      ind.reserva.abaixoDoRecomendado ? '#f8cbad' : '#c6efce');
    aba.getRange('B8').setBackground(
      ind.taxaPoupanca < 10 ? '#f8cbad' : '#c6efce');

    // --- maiores gastos ----------------------------------------------------
    aba.getRange(14, 1, 6, 2).clearContent();
    var topo = ind.topCategorias.slice(0, 5).map(function (c) {
      return [c.categoria, c.total];
    });
    while (topo.length < 5) topo.push(['', '']);
    topo.push(['Fixos x variaveis',
               ind.gastosFixosVariaveis.percentualFixos + '% fixos']);
    aba.getRange(14, 1, topo.length, 2).setValues(topo);
    aba.getRange('B19').setNumberFormat('@'); // ultima linha e texto

    // --- orcamentos em atencao ---------------------------------------------
    aba.getRange(14, 4, 6, 2).clearContent();
    var orcamentos = ind.orcamentos.filter(function (o) {
      return o.status !== 'OK';
    }).slice(0, 6).map(function (o) {
      return [o.categoria + ' (' + o.status.toLowerCase() + ')', o.percentual / 100];
    });
    if (!orcamentos.length) orcamentos = [['Nenhum orcamento em risco', '']];
    while (orcamentos.length < 6) orcamentos.push(['', '']);
    aba.getRange(14, 4, orcamentos.length, 2).setValues(orcamentos);

    // --- alertas -----------------------------------------------------------
    aba.getRange(22, 1, 10, 2).clearContent();
    var alertas = ind.alertas.slice(0, 10).map(function (a) { return [a, '']; });
    if (!alertas.length) alertas = [['Nenhum alerta no momento.', '']];
    aba.getRange(22, 1, alertas.length, 2).setValues(alertas);
    aba.getRange(22, 1, Math.max(alertas.length, 1), 1).setWrap(true);

    // --- previsoes das metas -----------------------------------------------
    aba.getRange(22, 4, 10, 2).clearContent();
    var previsoes = ind.metas.slice(0, 10).map(function (m) {
      var texto = m.nome + ': ' + formatarMoeda(m.saldo) + ' de ' + formatarMoeda(m.alvo);
      if (m.faltante <= 0) texto += ' (concluida)';
      else if (m.mesesRestantes === null) texto += ' (sem previsao)';
      else texto += ' (~' + m.mesesRestantes + ' mes(es))';
      return [texto, m.progresso / 100];
    });
    if (!previsoes.length) previsoes = [['Nenhuma meta cadastrada.', '']];
    aba.getRange(22, 4, previsoes.length, 2).setValues(previsoes);
    aba.getRange(22, 5, Math.max(previsoes.length, 1), 1).setNumberFormat('0.0%');

    // --- sugestoes (IA ou regras) ------------------------------------------
    _escreverBlocoSugestoes(aba, ind);

    aba.getRange('B2').setValue(new Date());
    logInfo('atualizarDashboard', 'Painel atualizado', { mes: mes });
    return ind;
  });
}

/**
 * Escreve na coluna G o ultimo resumo disponivel (IA em cache ou regras).
 * @param {Sheet} aba
 * @param {Object} ind
 * @private
 */
function _escreverBlocoSugestoes(aba, ind) {
  var insights;
  try {
    // Reaproveita o ultimo resultado de IA em cache; nunca chama a API aqui,
    // para o painel nunca depender de rede.
    insights = obterUltimosInsightsEmCache() || gerarInsightsAutomaticosSemIA(ind);
  } catch (e) {
    logErro('_escreverBlocoSugestoes', 'Falha ao montar sugestoes', e.message);
    insights = {
      resumo: 'Nao foi possivel gerar sugestoes agora.',
      sugestoes: [], observacoes: '', fonte: 'ERRO'
    };
  }

  var linhas = [];
  linhas.push(['SUGESTOES (' + (insights.fonte || 'REGRAS') + ')']);
  linhas.push([insights.resumo || '']);
  (insights.sugestoes || []).slice(0, 6).forEach(function (s) {
    linhas.push(['[' + String(s.prioridade || 'media').toUpperCase() + '] ' +
                 s.titulo + ' - ' + s.descricao]);
  });
  linhas.push([insights.observacoes ||
    'Sugestoes automaticas. Nao constituem aconselhamento financeiro profissional.']);

  var maximo = DASHBOARD_AREA_LIVRE - 2; // deixa a area livre intacta
  aba.getRange(2, 7, maximo - 1, 1).clearContent();
  var recorte = linhas.slice(0, maximo - 1);
  aba.getRange(2, 7, recorte.length, 1).setValues(recorte).setWrap(true)
    .setVerticalAlignment('top');
  aba.getRange(2, 7).setFontWeight('bold').setBackground('#d9e2f3');
}

/**
 * Primeiro dia do mes de uma data.
 * @param {Date} data
 * @return {Date}
 * @private
 */
function _primeiroDiaDoMes(data) {
  var d = converterParaData(data) || new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
