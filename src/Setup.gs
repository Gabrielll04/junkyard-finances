/**
 * Setup.gs
 * ---------------------------------------------------------------------------
 * Instalacao e manutencao da estrutura: abas, cabecalhos, formatos, validacoes,
 * dados padrao, dados de exemplo, verificacao de integridade e backup.
 *
 * O ponto de entrada e setupFinanceiro(). Ele e idempotente: pode ser rodado
 * quantas vezes forem necessarias sem duplicar nada nem apagar dados.
 */

/** Configuracoes padrao criadas no primeiro setup. */
var CONFIGURACOES_PADRAO = [
  ['moeda', 'BRL', 'Codigo da moeda usada nos valores (BRL, USD, EUR).'],
  ['fuso_horario', 'America/Sao_Paulo', 'Fuso horario usado em datas e relatorios.'],
  ['meta_meses_reserva', 6, 'Quantos meses de despesa a reserva de emergencia deve cobrir.'],
  ['meses_base_despesa_media', 6, 'Janela (3, 6 ou 12) usada para calcular a despesa media mensal.'],
  ['categoria_reserva_padrao', 'Reserva', 'Categoria usada nos aportes da reserva.'],
  ['categoria_metas_padrao', 'Investimentos', 'Categoria usada nos aportes das demais metas.'],
  ['categoria_transferencia_padrao', 'Outros', 'Categoria usada em transferencias entre contas.'],
  ['taxa_mensal_padrao', 0, 'Taxa de rendimento mensal em decimal (0.008 = 0,8% ao mes). 0 = sem rendimento.'],
  ['meses_projecao_padrao', 12, 'Horizonte padrao das simulacoes "quanto terei em N meses".'],
  ['permitir_saldo_negativo_meta', 'NAO', 'SIM permite resgatar mais do que o saldo da meta.'],
  ['bloquear_duplicados', 'SIM', 'SIM impede lancamentos identicos no mesmo dia.'],
  ['criar_categoria_automaticamente', 'SIM', 'SIM cria a categoria automaticamente ao lancar.'],
  ['dias_futuro_permitidos', 370, 'Quantos dias no futuro um lancamento pode ter.'],
  ['dias_alerta_prazo_meta', 60, 'A quantos dias do prazo uma meta entra em alerta.'],
  ['mostrar_graficos', 'SIM', 'SIM desenha os graficos nativos no painel.'],
  ['gerar_recorrentes_automaticamente', 'SIM', 'SIM gera os lancamentos recorrentes vencidos na rotina diaria.'],
  ['max_ocorrencias_por_execucao', 60, 'Teto de lancamentos recorrentes gerados por execucao.'],
  ['valor_alvo_reserva_inicial', 1000, 'Alvo inicial da reserva enquanto nao ha historico de despesas.'],
  ['provedor_ia', 'gemini', 'Provedor de IA: gemini ou groq. (A chave fica nas Script Properties.)'],
  ['modelo_ia', 'gemini-2.0-flash', 'Modelo usado no provedor escolhido.'],
  ['usar_ia', 'NAO', 'SIM ativa as sugestoes por IA. NAO usa apenas as regras internas.'],
  ['enviar_resumo_para_ia', 'NAO', 'SIM tambem envia a lista resumida de lancamentos do mes a IA.'],
  ['minutos_cache_ia', 60, 'Por quantos minutos a ultima resposta da IA e reaproveitada.'],
  ['minutos_minimos_entre_chamadas_ia', 5, 'Intervalo minimo entre chamadas a IA (protege o free tier).'],
  ['tentativas_ia', 3, 'Tentativas por chamada a IA antes de cair no fallback.'],
  ['pasta_importacao_drive', '', 'ID da pasta do Drive usada na futura importacao de documentos.'],
  ['observacoes', '', 'Campo livre para suas anotacoes de configuracao.']
];

/** Categorias criadas no primeiro setup. Grupo "Fixo" alimenta o KPI de gastos fixos. */
var CATEGORIAS_PADRAO = [
  ['Salario', 'RECEITA', 'Receita', ''],
  ['Freelance', 'RECEITA', 'Receita', ''],
  ['Rendimentos', 'RECEITA', 'Receita', ''],
  ['Moradia', 'DESPESA', 'Fixo', ''],
  ['Contas fixas', 'DESPESA', 'Fixo', ''],
  ['Alimentacao', 'DESPESA', 'Variavel', ''],
  ['Mercado', 'DESPESA', 'Variavel', ''],
  ['Transporte', 'DESPESA', 'Variavel', ''],
  ['Saude', 'DESPESA', 'Variavel', ''],
  ['Educacao', 'DESPESA', 'Fixo', ''],
  ['Lazer', 'DESPESA', 'Variavel', ''],
  ['Assinaturas', 'DESPESA', 'Fixo', ''],
  ['Impostos', 'DESPESA', 'Fixo', ''],
  ['Dividas', 'DESPESA', 'Fixo', ''],
  ['Investimentos', 'AMBOS', 'Investimento', ''],
  ['Reserva', 'AMBOS', 'Investimento', ''],
  ['Outros', 'AMBOS', 'Outros', '']
];

// ===========================================================================
// SETUP PRINCIPAL
// ===========================================================================

/**
 * Instala/atualiza todo o sistema. Seguro para rodar novamente a qualquer hora.
 *
 * @param {Object=} opcoes
 *   {boolean=} criarDadosExemplo  Padrao false.
 *   {boolean=} instalarTriggers   Padrao false (o usuario decide no menu).
 * @return {{sucesso: boolean, mensagem: string, detalhes: Object}}
 */
function setupFinanceiro(opcoes) {
  var config = opcoes || {};
  var relatorio = { abasCriadas: [], acoes: [] };

  try {
    return comLock(function () {
      var planilha = obterPlanilha();

      // 1. Abas e cabecalhos.
      var ordem = [
        ABAS.DASHBOARD, ABAS.METAS, ABAS.LANCAMENTOS, ABAS.RECORRENTES,
        ABAS.METAS_MOVIMENTOS, ABAS.CATEGORIAS, ABAS.ORCAMENTOS, ABAS.SIMULACOES,
        ABAS.CONFIG, ABAS.IMPORTACAO, ABAS.LOGS, ABAS.README
      ];
      ordem.forEach(function (nome) {
        var existia = !!planilha.getSheetByName(nome);
        obterAbaSegura(nome);
        if (!existia) relatorio.abasCriadas.push(nome);
        if (CABECALHOS[nome]) garantirCabecalhos(nome);
      });

      // 2. Configuracoes padrao (nao sobrescreve o que o usuario ja ajustou).
      var criadas = _garantirConfiguracoesPadrao();
      if (criadas) relatorio.acoes.push(criadas + ' configuracao(oes) criada(s).');

      // 3. Categorias padrao.
      var categorias = _garantirCategoriasPadrao();
      if (categorias) relatorio.acoes.push(categorias + ' categoria(s) criada(s).');

      // 4. Formatacao e validacao de dados.
      aplicarFormatacoes();
      aplicarValidacoesDeDados();
      relatorio.acoes.push('Formatos e validacoes aplicados.');

      // 5. Meta de reserva de emergencia.
      if (!obterMetaReserva()) {
        var sugestao = sugerirValorReserva();
        var alvo = sugestao.valorRecomendado > 0
          ? sugestao.valorRecomendado
          : obterConfigNumero('valor_alvo_reserva_inicial', 1000);
        // Criada direto na aba para nao aninhar locks.
        var agora = new Date();
        adicionarLinha(ABAS.METAS, {
          id_meta: gerarId(PREFIXOS_ID.META),
          nome: 'Reserva de Emergencia',
          tipo: TIPOS_META.RESERVA,
          valor_alvo: arredondar2(alvo),
          saldo_inicial: 0,
          aporte_mensal_planejado: 0,
          data_inicio: agora,
          data_prazo: '',
          status: STATUS_META.ATIVA,
          taxa_mensal_personalizada: '',
          cor: '#c0392b',
          descricao: 'Meta especial: cobre ' +
                     obterConfigNumero('meta_meses_reserva', 6) +
                     ' meses de despesas. Alvo recalculavel pelo menu.',
          criada_em: agora,
          atualizada_em: agora
        });
        relatorio.acoes.push('Meta "Reserva de Emergencia" criada.');
      }

      // 6. Painel e README.
      montarLayoutDashboard();
      escreverInstrucoesReadme();
      relatorio.acoes.push('Painel e README montados.');

      // 7. Dados de exemplo, se pedido.
      if (config.criarDadosExemplo) {
        var exemplo = _criarDadosExemploInterno();
        relatorio.acoes.push(exemplo.mensagem);
      }

      // 8. Triggers, apenas se pedido.
      if (config.instalarTriggers) {
        instalarTriggers();
        relatorio.acoes.push('Gatilho diario de atualizacao instalado.');
      }

      atualizarCamposCalculadosMetas();
      logInfo('setupFinanceiro', 'Setup concluido', relatorio);

      return {
        sucesso: true,
        mensagem: 'Setup concluido. ' +
          (relatorio.abasCriadas.length
            ? 'Abas criadas: ' + relatorio.abasCriadas.join(', ') + '. '
            : 'Todas as abas ja existiam. ') +
          relatorio.acoes.join(' '),
        detalhes: relatorio
      };
    }, 60000);

  } catch (e) {
    logErro('setupFinanceiro', 'Falha no setup', e.message);
    return {
      sucesso: false,
      mensagem: 'Nao foi possivel concluir o setup: ' + e.message,
      detalhes: relatorio
    };
  }
}

/**
 * Cria as configuracoes padrao que ainda nao existem.
 * @return {number} Quantidade criada.
 * @private
 */
function _garantirConfiguracoesPadrao() {
  var existentes = {};
  lerTabela(ABAS.CONFIG).linhas.forEach(function (l) {
    var chave = String(l.chave || '').trim();
    if (chave) existentes[chave] = true;
  });

  var novas = CONFIGURACOES_PADRAO
    .filter(function (c) { return !existentes[c[0]]; })
    .map(function (c) {
      return { chave: c[0], valor: c[1], descricao: c[2] };
    });

  if (novas.length) adicionarLinhas(ABAS.CONFIG, novas);
  return novas.length;
}

/**
 * Cria as categorias padrao que ainda nao existem.
 * @return {number} Quantidade criada.
 * @private
 */
function _garantirCategoriasPadrao() {
  var existentes = {};
  lerTabela(ABAS.CATEGORIAS).linhas.forEach(function (l) {
    var nome = normalizarTexto(l.nome);
    if (nome) existentes[nome] = true;
  });

  var novas = CATEGORIAS_PADRAO
    .filter(function (c) { return !existentes[normalizarTexto(c[0])]; })
    .map(function (c) {
      return {
        id_categoria: gerarId(PREFIXOS_ID.CATEGORIA),
        nome: c[0],
        tipo_categoria: c[1],
        grupo: c[2],
        orcamento_mensal_padrao: c[3],
        ativa: 'SIM'
      };
    });

  if (novas.length) adicionarLinhas(ABAS.CATEGORIAS, novas);
  return novas.length;
}

// ===========================================================================
// FORMATACAO E VALIDACAO
// ===========================================================================

/**
 * Aplica formatos de data, moeda e percentual nas colunas relevantes.
 * Formatos sao aplicados a coluna inteira, valendo para linhas futuras.
 */
function aplicarFormatacoes() {
  var formatoData = 'dd/mm/yyyy';
  var formatoDataHora = 'dd/mm/yyyy hh:mm:ss';
  var formatoMoeda = 'R$ #,##0.00';
  var moeda = obterMoeda();
  if (moeda === 'USD') formatoMoeda = '$ #,##0.00';
  if (moeda === 'EUR') formatoMoeda = '€ #,##0.00';

  var regras = [
    [ABAS.LANCAMENTOS, { data: formatoData, valor: formatoMoeda,
                         criado_em: formatoDataHora, atualizado_em: formatoDataHora }],
    [ABAS.METAS, { valor_alvo: formatoMoeda, saldo_inicial: formatoMoeda,
                   aporte_mensal_planejado: formatoMoeda,
                   data_inicio: formatoData, data_prazo: formatoData,
                   criada_em: formatoDataHora, atualizada_em: formatoDataHora,
                   taxa_mensal_personalizada: '0.00000%',
                   campo_calculado_saldo_atual: formatoMoeda,
                   campo_calculado_progresso_percentual: '0.0%',
                   campo_calculado_valor_faltante: formatoMoeda,
                   campo_calculado_previsao_meses_restantes: '0' }],
    [ABAS.RECORRENTES, { valor: formatoMoeda, data_inicio: formatoData,
                         data_fim: formatoData, ultima_geracao: formatoData,
                         proxima_geracao: formatoData, dia_do_mes: '0',
                         frequencia_meses: '0', total_gerado: '0',
                         criado_em: formatoDataHora, atualizado_em: formatoDataHora }],
    [ABAS.METAS_MOVIMENTOS, { data: formatoData, valor: formatoMoeda,
                              criado_em: formatoDataHora }],
    [ABAS.CATEGORIAS, { orcamento_mensal_padrao: formatoMoeda }],
    [ABAS.ORCAMENTOS, { valor_orcado: formatoMoeda, valor_realizado: formatoMoeda,
                        diferenca: formatoMoeda }],
    [ABAS.SIMULACOES, { data_hora: formatoDataHora, saldo_atual: formatoMoeda,
                        valor_alvo: formatoMoeda, aporte_mensal: formatoMoeda,
                        resultado: formatoMoeda }],
    [ABAS.LOGS, { data_hora: formatoDataHora }],
    [ABAS.IMPORTACAO, { data_upload: formatoDataHora, data_documento: formatoData,
                        valor_extraido: formatoMoeda }]
  ];

  regras.forEach(function (regra) {
    var nomeAba = regra[0];
    var colunas = regra[1];
    try {
      var aba = obterAbaSegura(nomeAba);
      var mapa = obterMapaCabecalhos(aba);
      var totalLinhas = Math.max(aba.getMaxRows() - 1, 1);
      Object.keys(colunas).forEach(function (nomeColuna) {
        if (mapa[nomeColuna] === undefined) return;
        aba.getRange(2, mapa[nomeColuna] + 1, totalLinhas, 1)
          .setNumberFormat(colunas[nomeColuna]);
      });
      aba.autoResizeColumns(1, Math.min(aba.getLastColumn(), 20));
    } catch (e) {
      logErro('aplicarFormatacoes', 'Falha ao formatar a aba ' + nomeAba, e.message);
    }
  });
}

/**
 * Aplica validacao de dados (listas suspensas) nas colunas de dominio fechado.
 * Evita a maior fonte de sujeira: tipo digitado errado na mao.
 */
function aplicarValidacoesDeDados() {
  var validacoes = [
    [ABAS.LANCAMENTOS, 'tipo', Object.keys(TIPOS_LANCAMENTO)],
    [ABAS.LANCAMENTOS, 'status', Object.keys(STATUS_LANCAMENTO)],
    [ABAS.METAS, 'tipo', [TIPOS_META.META, TIPOS_META.RESERVA]],
    [ABAS.METAS, 'status', [STATUS_META.ATIVA, STATUS_META.INATIVA, STATUS_META.CONCLUIDA]],
    [ABAS.RECORRENTES, 'tipo', TIPOS_RECORRENTE],
    [ABAS.RECORRENTES, 'ativo', ['SIM', 'NAO']],
    // A lista precisa ser numerica: a coluna guarda numeros, e strings ali
    // fariam o Sheets marcar toda linha valida como invalida.
    [ABAS.RECORRENTES, 'frequencia_meses',
     Object.keys(FREQUENCIAS_RECORRENTE).map(Number)],
    [ABAS.METAS_MOVIMENTOS, 'tipo_movimento', Object.keys(TIPOS_MOVIMENTO_META)],
    [ABAS.CATEGORIAS, 'tipo_categoria', ['RECEITA', 'DESPESA', 'AMBOS']],
    [ABAS.CATEGORIAS, 'ativa', ['SIM', 'NAO']],
    [ABAS.IMPORTACAO, 'status', ['PENDENTE', 'PROCESSADO', 'ERRO', 'IGNORADO']]
  ];

  validacoes.forEach(function (item) {
    var nomeAba = item[0], coluna = item[1], valores = item[2];
    try {
      var aba = obterAbaSegura(nomeAba);
      var mapa = obterMapaCabecalhos(aba);
      if (mapa[coluna] === undefined) return;
      var regra = SpreadsheetApp.newDataValidation()
        .requireValueInList(valores, true)
        .setAllowInvalid(false)
        .setHelpText('Valores aceitos: ' + valores.join(', '))
        .build();
      aba.getRange(2, mapa[coluna] + 1, Math.max(aba.getMaxRows() - 1, 1), 1)
        .setDataValidation(regra);
    } catch (e) {
      logErro('aplicarValidacoesDeDados',
              'Falha ao validar ' + nomeAba + '.' + coluna, e.message);
    }
  });

  // Protecao leve nas colunas calculadas da aba Metas: aviso, nao bloqueio,
  // para o usuario nao se frustrar tentando editar algo que sera reescrito.
  try {
    var abaMetas = obterAbaSegura(ABAS.METAS);
    var mapaMetas = obterMapaCabecalhos(abaMetas);
    var primeira = mapaMetas['campo_calculado_saldo_atual'];
    if (primeira !== undefined) {
      abaMetas.getRange(1, primeira + 1, abaMetas.getMaxRows(), 4)
        .setNote('Coluna calculada pelo sistema. Alteracoes manuais sao sobrescritas.');
    }
  } catch (e) { /* nota e cosmetica */ }
}

// ===========================================================================
// README
// ===========================================================================

/** Escreve as instrucoes de uso na aba README. */
function escreverInstrucoesReadme() {
  var aba = obterAbaSegura(ABAS.README);
  aba.clear();

  var linhas = [
    ['SISTEMA DE FINANCAS PESSOAIS - COMO USAR'],
    [''],
    ['1. MENU'],
    ['   Use o menu "Financeiro" na barra superior. Se ele nao aparecer,'],
    ['   recarregue a pagina da planilha.'],
    [''],
    ['2. PRIMEIROS PASSOS'],
    ['   a) Financeiro > Configuracao > Executar setup (ja feito se voce ve esta aba).'],
    ['   b) Ajuste a aba Config (meses de reserva, moeda, taxa de rendimento).'],
    ['   c) Crie suas metas em Financeiro > Metas > Nova meta.'],
    ['   d) Registre receitas e despesas em Financeiro > Lancamentos.'],
    ['   e) Atualize o painel em Financeiro > Atualizar painel.'],
    [''],
    ['3. ABAS'],
    ['   Dashboard ........... painel com KPIs, alertas e sugestoes.'],
    ['   Metas ............... suas caixinhas (metas comuns e a reserva).'],
    ['   Lancamentos ......... extrato completo: receitas, despesas, aportes, resgates.'],
    ['   Recorrentes ......... regras de lancamento automatico (aluguel, salario, aportes).'],
    ['   Metas_Movimentos .... historico auditavel do saldo de cada meta.'],
    ['   Categorias .......... categorias de receita/despesa e orcamento padrao.'],
    ['   Orcamentos .......... limites mensais por categoria.'],
    ['   Simulacoes .......... historico das simulacoes de metas.'],
    ['   Config .............. parametros do sistema (SEM chaves de API).'],
    ['   Importacao_Futura ... estrutura pronta para holerites/comprovantes.'],
    ['   Logs ................ registro de operacoes e erros.'],
    [''],
    ['4. IA OPCIONAL (nao obrigatoria)'],
    ['   O sistema funciona 100% sem IA, usando sugestoes por regras.'],
    ['   Para ativar:'],
    ['   a) No editor do Apps Script: Configuracoes do projeto >'],
    ['      Propriedades do script > Adicionar propriedade.'],
    ['   b) Crie GEMINI_API_KEY ou GROQ_API_KEY com a sua chave.'],
    ['   c) Na aba Config: usar_ia = SIM, provedor_ia = gemini ou groq,'],
    ['      e modelo_ia com o modelo desejado.'],
    ['   IMPORTANTE: nunca coloque a chave na planilha nem no codigo.'],
    [''],
    ['5. LANCAMENTOS RECORRENTES'],
    ['   Cadastre em Financeiro > Lancamentos > Recorrentes > Nova recorrencia,'],
    ['   ou marque "repetir" ao lancar pela sidebar.'],
    ['   O sistema gera as ocorrencias vencidas sozinho (rotina diaria) ou sob'],
    ['   demanda em "Gerar agora".'],
    ['   Cada ocorrencia recebe uma chave unica, entao rodar a geracao varias'],
    ['   vezes nunca duplica lancamento.'],
    [''],
    ['6. SALDO DAS METAS'],
    ['   saldo = saldo_inicial + aportes + ajustes positivos'],
    ['           - resgates - ajustes negativos'],
    ['   Aportes e resgates aparecem tambem na aba Lancamentos, mas NAO contam'],
    ['   como receita nem despesa do mes (senao o dinheiro seria contado duas vezes).'],
    [''],
    ['7. EXCLUSAO DE METAS E LANCAMENTOS'],
    ['   O padrao e desativar (soft delete): o historico e sempre preservado.'],
    ['   A exclusao definitiva exige confirmacao explicita e mesmo assim mantem'],
    ['   os movimentos e lancamentos na planilha.'],
    ['   Lancamentos seguem a mesma logica: o padrao e cancelar (sai dos totais,'],
    ['   a linha fica); apagar de vez exige confirmacao explicita.'],
    [''],
    ['8. AVISO'],
    ['   Este sistema e uma ferramenta de organizacao pessoal.'],
    ['   As sugestoes, com ou sem IA, nao constituem aconselhamento financeiro'],
    ['   profissional.'],
    [''],
    ['Ultima atualizacao deste README: ' + formatarDataHora(new Date())]
  ];

  aba.getRange(1, 1, linhas.length, 1).setValues(linhas);
  aba.getRange('A1').setFontSize(14).setFontWeight('bold')
    .setBackground('#1f3864').setFontColor('#ffffff');
  aba.setColumnWidth(1, 700);
  aba.setHiddenGridlines(true);
}

// ===========================================================================
// DADOS DE EXEMPLO
// ===========================================================================

/**
 * Cria dados de exemplo (com lock) para o usuario ver o sistema funcionando.
 * @return {{sucesso: boolean, mensagem: string}}
 */
function criarDadosExemplo() {
  return comLock(function () {
    return _criarDadosExemploInterno();
  });
}

/**
 * Implementacao dos dados de exemplo, sem lock.
 * Lancamentos sao marcados com origem EXEMPLO para poderem ser removidos.
 * @return {{sucesso: boolean, mensagem: string}}
 * @private
 */
function _criarDadosExemploInterno() {
  var jaExiste = lerTabela(ABAS.LANCAMENTOS).linhas.some(function (l) {
    return String(l.origem || '') === 'EXEMPLO';
  });
  if (jaExiste) {
    return { sucesso: true, mensagem: 'Dados de exemplo ja existiam (nada duplicado).' };
  }

  var hoje = new Date();
  var lancamentos = [];

  // Tres meses de historico plausivel.
  for (var recuo = 2; recuo >= 0; recuo--) {
    var base = new Date(hoje.getFullYear(), hoje.getMonth() - recuo, 5);
    var variacao = 1 + (recuo * 0.03);

    lancamentos.push({
      data: base, tipo: TIPOS_LANCAMENTO.RECEITA, valor: 5200,
      categoria: 'Salario', descricao: 'Salario mensal (exemplo)'
    });
    lancamentos.push({
      data: new Date(base.getFullYear(), base.getMonth(), 10),
      tipo: TIPOS_LANCAMENTO.DESPESA, valor: arredondar2(1500 * 1),
      categoria: 'Moradia', descricao: 'Aluguel (exemplo)'
    });
    lancamentos.push({
      data: new Date(base.getFullYear(), base.getMonth(), 12),
      tipo: TIPOS_LANCAMENTO.DESPESA, valor: arredondar2(420 * variacao),
      categoria: 'Contas fixas', descricao: 'Luz, agua e internet (exemplo)'
    });
    lancamentos.push({
      data: new Date(base.getFullYear(), base.getMonth(), 15),
      tipo: TIPOS_LANCAMENTO.DESPESA, valor: arredondar2(850 * variacao),
      categoria: 'Mercado', descricao: 'Compras do mes (exemplo)'
    });
    lancamentos.push({
      data: new Date(base.getFullYear(), base.getMonth(), 18),
      tipo: TIPOS_LANCAMENTO.DESPESA, valor: arredondar2(310 * variacao),
      categoria: 'Transporte', descricao: 'Combustivel e transporte (exemplo)'
    });
    lancamentos.push({
      data: new Date(base.getFullYear(), base.getMonth(), 22),
      tipo: TIPOS_LANCAMENTO.DESPESA, valor: arredondar2(260 * variacao),
      categoria: 'Lazer', descricao: 'Lazer e restaurantes (exemplo)'
    });
    lancamentos.push({
      data: new Date(base.getFullYear(), base.getMonth(), 23),
      tipo: TIPOS_LANCAMENTO.DESPESA, valor: 89.9,
      categoria: 'Assinaturas', descricao: 'Streaming e apps (exemplo)'
    });
  }

  lancamentos.forEach(function (l) {
    try {
      _inserirLancamento({
        data: l.data, tipo: l.tipo, valor: l.valor, categoria: l.categoria,
        descricao: l.descricao, origem: 'EXEMPLO'
      }, { permitirDuplicado: true });
    } catch (e) {
      logAviso('_criarDadosExemploInterno', 'Lancamento de exemplo ignorado', e.message);
    }
  });

  // Uma meta comum de exemplo, alem da reserva criada no setup.
  var jaTemViagem = lerTabela(ABAS.METAS).linhas.some(function (m) {
    return normalizarTexto(m.nome) === normalizarTexto('Viagem (exemplo)');
  });
  var idViagem = '';
  if (!jaTemViagem) {
    var agora = new Date();
    idViagem = gerarId(PREFIXOS_ID.META);
    var prazo = new Date(agora.getFullYear() + 1, agora.getMonth(), 1);
    adicionarLinha(ABAS.METAS, {
      id_meta: idViagem, nome: 'Viagem (exemplo)', tipo: TIPOS_META.META,
      valor_alvo: 8000, saldo_inicial: 0, aporte_mensal_planejado: 500,
      data_inicio: agora, data_prazo: prazo, status: STATUS_META.ATIVA,
      taxa_mensal_personalizada: '', cor: '#1f6feb',
      descricao: 'Meta de exemplo criada pelo setup.',
      criada_em: agora, atualizada_em: agora
    });
  }

  // Alguns aportes: um na reserva, um na meta de exemplo.
  var reserva = obterMetaReserva();
  try {
    if (reserva) {
      _movimentarMeta(reserva.id_meta, 600,
        new Date(hoje.getFullYear(), hoje.getMonth() - 1, 25),
        'Aporte de exemplo', TIPOS_MOVIMENTO_META.APORTE, 'EXEMPLO');
      _movimentarMeta(reserva.id_meta, 600,
        new Date(hoje.getFullYear(), hoje.getMonth(), 25),
        'Aporte de exemplo', TIPOS_MOVIMENTO_META.APORTE, 'EXEMPLO');
    }
    if (idViagem) {
      _movimentarMeta(idViagem, 500,
        new Date(hoje.getFullYear(), hoje.getMonth(), 26),
        'Aporte de exemplo', TIPOS_MOVIMENTO_META.APORTE, 'EXEMPLO');
    }
  } catch (e) {
    logAviso('_criarDadosExemploInterno', 'Aporte de exemplo ignorado', e.message);
  }

  // Uma recorrencia de exemplo, comecando no proximo mes para o usuario ver
  // a geracao automatica acontecer sem sujar o historico ja criado acima.
  var temRecorrente = lerTabela(ABAS.RECORRENTES).linhas.some(function (r) {
    return String(r.observacoes || '').indexOf('EXEMPLO') !== -1;
  });
  if (!temRecorrente) {
    var agoraRec = new Date();
    var inicioRec = new Date(agoraRec.getFullYear(), agoraRec.getMonth() + 1, 1);
    adicionarLinha(ABAS.RECORRENTES, {
      id_recorrente: gerarId(PREFIXOS_ID.RECORRENTE),
      descricao: 'Aluguel (exemplo)',
      tipo: 'DESPESA',
      valor: 1500,
      categoria: 'Moradia',
      meta_id: '',
      dia_do_mes: 10,
      frequencia_meses: 1,
      data_inicio: inicioRec,
      data_fim: '',
      ativo: 'SIM',
      ultima_geracao: '',
      proxima_geracao: new Date(inicioRec.getFullYear(), inicioRec.getMonth(), 10),
      total_gerado: 0,
      criado_em: agoraRec,
      atualizado_em: agoraRec,
      observacoes: 'EXEMPLO - criada pelo setup; desative ou exclua quando quiser.'
    });
  }

  // Um orcamento de exemplo.
  var temOrcamento = lerTabela(ABAS.ORCAMENTOS).linhas.length > 0;
  if (!temOrcamento) {
    adicionarLinhas(ABAS.ORCAMENTOS, [
      { categoria: 'Mercado', mes_referencia: '', valor_orcado: 800,
        valor_realizado: '', diferenca: '', status: '' },
      { categoria: 'Lazer', mes_referencia: '', valor_orcado: 300,
        valor_realizado: '', diferenca: '', status: '' }
    ]);
  }

  logInfo('criarDadosExemplo', 'Dados de exemplo criados');
  return {
    sucesso: true,
    mensagem: 'Dados de exemplo criados (3 meses de lancamentos, 1 meta, aportes e orcamentos). ' +
              'Use "Remover dados de exemplo" quando quiser limpar.'
  };
}

/**
 * Remove tudo que foi criado com origem EXEMPLO.
 * @return {{sucesso: boolean, mensagem: string}}
 */
function removerDadosExemplo() {
  return comLock(function () {
    var removidos = 0;

    // Apaga de baixo para cima, para os numeros de linha nao se deslocarem.
    [[ABAS.LANCAMENTOS, 'origem'], [ABAS.METAS_MOVIMENTOS, 'origem']]
      .forEach(function (par) {
        var aba = obterAbaSegura(par[0]);
        var linhas = lerTabela(par[0]).linhas
          .filter(function (l) { return String(l[par[1]] || '').indexOf('EXEMPLO') !== -1; })
          .map(function (l) { return l._linha; })
          .sort(function (a, b) { return b - a; });
        linhas.forEach(function (numero) { aba.deleteRow(numero); removidos++; });
      });

    // Aportes de exemplo geram lancamentos com origem META:<id>; limpa os orfaos.
    var abaLancamentos = obterAbaSegura(ABAS.LANCAMENTOS);
    var movimentosExistentes = {};
    lerTabela(ABAS.METAS_MOVIMENTOS).linhas.forEach(function (m) {
      movimentosExistentes[String(m.id_movimento || '').trim()] = true;
    });
    lerTabela(ABAS.LANCAMENTOS).linhas
      .filter(function (l) {
        var origem = String(l.origem || '');
        if (origem.indexOf('META:') !== 0) return false;
        return !movimentosExistentes[origem.slice(5)];
      })
      .map(function (l) { return l._linha; })
      .sort(function (a, b) { return b - a; })
      .forEach(function (numero) { abaLancamentos.deleteRow(numero); removidos++; });

    // Recorrencias de exemplo e tudo o que elas geraram.
    var abaRecorrentes = obterAbaSegura(ABAS.RECORRENTES);
    var idsRecorrentesExemplo = {};
    lerTabela(ABAS.RECORRENTES).linhas
      .filter(function (r) {
        return String(r.observacoes || '').indexOf('EXEMPLO') !== -1;
      })
      .forEach(function (r) {
        idsRecorrentesExemplo[String(r.id_recorrente || '').trim()] = true;
      });

    if (Object.keys(idsRecorrentesExemplo).length) {
      var abaLancamentosRec = obterAbaSegura(ABAS.LANCAMENTOS);
      lerTabela(ABAS.LANCAMENTOS).linhas
        .filter(function (l) {
          var origem = String(l.origem || '');
          if (origem.indexOf('RECORRENTE:') !== 0) return false;
          return !!idsRecorrentesExemplo[origem.split(':')[1]];
        })
        .map(function (l) { return l._linha; })
        .sort(function (a, b) { return b - a; })
        .forEach(function (numero) { abaLancamentosRec.deleteRow(numero); removidos++; });

      lerTabela(ABAS.RECORRENTES).linhas
        .filter(function (r) {
          return !!idsRecorrentesExemplo[String(r.id_recorrente || '').trim()];
        })
        .map(function (r) { return r._linha; })
        .sort(function (a, b) { return b - a; })
        .forEach(function (numero) { abaRecorrentes.deleteRow(numero); removidos++; });
    }

    // Meta de exemplo.
    var metaExemplo = lerTabela(ABAS.METAS).linhas.filter(function (m) {
      return normalizarTexto(m.nome) === normalizarTexto('Viagem (exemplo)');
    })[0];
    if (metaExemplo) {
      obterAbaSegura(ABAS.METAS).deleteRow(metaExemplo._linha);
      removidos++;
    }

    limparCache();
    atualizarCamposCalculadosMetas();
    logInfo('removerDadosExemplo', 'Dados de exemplo removidos', { linhas: removidos });
    return { sucesso: true, mensagem: removidos + ' linha(s) de exemplo removida(s).' };
  });
}

// ===========================================================================
// INTEGRIDADE
// ===========================================================================

/**
 * Verifica a consistencia da planilha e devolve problemas encontrados.
 * Nao corrige nada sozinha: apenas relata.
 *
 * @return {{ok: boolean, problemas: Array<string>, avisos: Array<string>,
 *           resumo: Object}}
 */
function validarDados() {
  var problemas = [];
  var avisos = [];
  var resumo = {};

  try {
    // 1. Abas obrigatorias e cabecalhos.
    Object.keys(CABECALHOS).forEach(function (nomeAba) {
      var aba = obterPlanilha().getSheetByName(nomeAba);
      if (!aba) {
        problemas.push('Aba ausente: ' + nomeAba + '. Rode o setup.');
        return;
      }
      var mapa = obterMapaCabecalhos(aba);
      CABECALHOS[nomeAba].forEach(function (coluna) {
        if (mapa[coluna] === undefined) {
          problemas.push('Coluna "' + coluna + '" ausente na aba ' + nomeAba + '.');
        }
      });
    });
    if (problemas.length) {
      return { ok: false, problemas: problemas, avisos: avisos, resumo: resumo };
    }

    // 2. Lancamentos.
    var lancamentos = lerTabela(ABAS.LANCAMENTOS).linhas;
    var idsLancamento = {};
    var metasExistentes = {};
    lerTabela(ABAS.METAS).linhas.forEach(function (m) {
      var id = String(m.id_meta || '').trim();
      if (id) metasExistentes[id.toUpperCase()] = String(m.nome || '');
    });

    lancamentos.forEach(function (l) {
      var referencia = 'linha ' + l._linha + ' de ' + ABAS.LANCAMENTOS;
      var id = String(l.id_lancamento || '').trim();

      if (!id) { problemas.push('Lancamento sem ID na ' + referencia + '.'); }
      else if (idsLancamento[id]) { problemas.push('ID duplicado "' + id + '" na ' + referencia + '.'); }
      else { idsLancamento[id] = true; }

      if (!converterParaData(l.data)) {
        problemas.push('Data invalida na ' + referencia + '.');
      }
      var tipo = String(l.tipo || '').toUpperCase();
      if (!TIPOS_LANCAMENTO[tipo]) {
        problemas.push('Tipo invalido "' + l.tipo + '" na ' + referencia + '.');
      }
      var valor = paraNumero(l.valor);
      if (isNaN(valor)) problemas.push('Valor nao numerico na ' + referencia + '.');
      else if (valor < 0) problemas.push('Valor negativo na ' + referencia + '.');
      else if (valor === 0) avisos.push('Valor zerado na ' + referencia + '.');

      var metaId = String(l.meta_id || '').trim();
      if ((tipo === TIPOS_LANCAMENTO.APORTE_META || tipo === TIPOS_LANCAMENTO.RESGATE_META)
          && !metaId) {
        problemas.push('Lancamento ' + tipo + ' sem meta na ' + referencia + '.');
      }
      if (metaId && !metasExistentes[metaId.toUpperCase()]) {
        problemas.push('Meta inexistente "' + metaId + '" referenciada na ' + referencia + '.');
      }
    });

    // 3. Movimentos de meta.
    var movimentos = lerTabela(ABAS.METAS_MOVIMENTOS).linhas;
    var idsMovimento = {};
    movimentos.forEach(function (m) {
      var referencia = 'linha ' + m._linha + ' de ' + ABAS.METAS_MOVIMENTOS;
      var id = String(m.id_movimento || '').trim();
      if (!id) { problemas.push('Movimento sem ID na ' + referencia + '.'); }
      else if (idsMovimento[id]) { problemas.push('ID de movimento duplicado "' + id + '".'); }
      else { idsMovimento[id] = true; }

      var metaId = String(m.meta_id || '').trim();
      if (!metaId) {
        problemas.push('Movimento sem meta na ' + referencia + '.');
      } else if (!metasExistentes[metaId.toUpperCase()]) {
        avisos.push('Movimento orfao (meta "' + metaId + '" nao existe mais) na ' +
                    referencia + '. O historico foi mantido de proposito.');
      }
      if (!TIPOS_MOVIMENTO_META[String(m.tipo_movimento || '').toUpperCase()]) {
        problemas.push('Tipo de movimento invalido na ' + referencia + '.');
      }
      var valorMovimento = paraNumero(m.valor);
      if (isNaN(valorMovimento) || valorMovimento < 0) {
        problemas.push('Valor invalido de movimento na ' + referencia + '.');
      }
    });

    // 4. Metas.
    var saldos = calcularSaldosDeTodasAsMetas();
    var metas = lerTabela(ABAS.METAS).linhas;
    var nomesVistos = {};
    var reservas = 0;

    metas.forEach(function (m) {
      var referencia = 'linha ' + m._linha + ' de ' + ABAS.METAS;
      if (!String(m.id_meta || '').trim()) {
        problemas.push('Meta sem ID na ' + referencia + '.');
      }
      if (!String(m.nome || '').trim()) {
        problemas.push('Meta sem nome na ' + referencia + '.');
      }
      var chaveNome = normalizarTexto(m.nome);
      if (chaveNome && String(m.status || '').toUpperCase() !== STATUS_META.INATIVA) {
        if (nomesVistos[chaveNome]) {
          avisos.push('Duas metas ativas com o nome "' + m.nome + '".');
        }
        nomesVistos[chaveNome] = true;
      }
      var alvo = paraNumero(m.valor_alvo);
      if (isNaN(alvo) || alvo <= 0) {
        problemas.push('Valor alvo invalido na ' + referencia + '.');
      }
      if (String(m.tipo || '').toUpperCase() === TIPOS_META.RESERVA &&
          String(m.status || '').toUpperCase() !== STATUS_META.INATIVA) {
        reservas++;
      }

      var saldoInicial = paraNumero(m.saldo_inicial) || 0;
      var dados = saldos[String(m.id_meta || '').trim()] || { saldo: 0 };
      var saldoFinal = arredondar2(saldoInicial + dados.saldo);
      if (saldoFinal < 0) {
        avisos.push('Meta "' + m.nome + '" com saldo negativo (' +
                    formatarMoeda(saldoFinal) + ').');
      }
      var prazo = converterParaData(m.data_prazo);
      var inicio = converterParaData(m.data_inicio);
      if (prazo && inicio && prazo < inicio) {
        problemas.push('Data limite anterior ao inicio na ' + referencia + '.');
      }
    });

    if (reservas === 0) avisos.push('Nenhuma meta ativa do tipo RESERVA.');
    if (reservas > 1) avisos.push(reservas + ' metas ativas do tipo RESERVA. ' +
      'O sistema usara a primeira; considere desativar as demais.');

    // 5. Recorrencias.
    var recorrentes = lerTabela(ABAS.RECORRENTES).linhas;
    var idsRecorrente = {};
    recorrentes.forEach(function (r) {
      var referencia = 'linha ' + r._linha + ' de ' + ABAS.RECORRENTES;
      var id = String(r.id_recorrente || '').trim();

      if (!id) { problemas.push('Recorrencia sem ID na ' + referencia + '.'); }
      else if (idsRecorrente[id]) {
        problemas.push('ID de recorrencia duplicado "' + id + '".');
      } else { idsRecorrente[id] = true; }

      if (!String(r.descricao || '').trim()) {
        problemas.push('Recorrencia sem descricao na ' + referencia + '.');
      }
      var tipoRecorrente = String(r.tipo || '').toUpperCase();
      if (TIPOS_RECORRENTE.indexOf(tipoRecorrente) === -1) {
        problemas.push('Tipo invalido "' + r.tipo + '" na ' + referencia + '.');
      }
      var valorRecorrente = paraNumero(r.valor);
      if (isNaN(valorRecorrente) || valorRecorrente <= 0) {
        problemas.push('Valor invalido de recorrencia na ' + referencia + '.');
      }
      var dia = parseInt(paraNumero(r.dia_do_mes), 10);
      if (isNaN(dia) || dia < 1 || dia > 31) {
        problemas.push('Dia do mes invalido na ' + referencia + '.');
      }
      var frequencia = parseInt(paraNumero(r.frequencia_meses), 10);
      if (!FREQUENCIAS_RECORRENTE[frequencia]) {
        problemas.push('Frequencia invalida na ' + referencia + '.');
      }
      if (!converterParaData(r.data_inicio)) {
        problemas.push('Data de inicio invalida na ' + referencia + '.');
      }
      var fimRecorrente = converterParaData(r.data_fim);
      var inicioRecorrente = converterParaData(r.data_inicio);
      if (fimRecorrente && inicioRecorrente && fimRecorrente < inicioRecorrente) {
        problemas.push('Data final anterior ao inicio na ' + referencia + '.');
      }
      var metaRecorrente = String(r.meta_id || '').trim();
      if (tipoRecorrente === 'APORTE_META') {
        if (!metaRecorrente) {
          problemas.push('Recorrencia de aporte sem meta na ' + referencia + '.');
        } else if (!metasExistentes[metaRecorrente.toUpperCase()]) {
          avisos.push('Recorrencia aponta para meta inexistente na ' + referencia + '.');
        }
      }
    });

    // Ocorrencias duplicadas: a chave de origem tem de ser unica.
    var chavesRecorrencia = {};
    lancamentos.concat(movimentos).forEach(function (registro) {
      var origem = String(registro.origem || '');
      if (origem.indexOf('RECORRENTE:') !== 0) return;
      if (chavesRecorrencia[origem]) {
        problemas.push('Ocorrencia recorrente duplicada: ' + origem + '.');
      }
      chavesRecorrencia[origem] = true;
    });

    // 6. Espelhos de meta em Lancamentos.
    var espelhosEsperados = movimentos.filter(function (m) {
      var tipo = String(m.tipo_movimento || '').toUpperCase();
      return tipo === TIPOS_MOVIMENTO_META.APORTE || tipo === TIPOS_MOVIMENTO_META.RESGATE;
    }).length;
    var espelhosEncontrados = lancamentos.filter(function (l) {
      return String(l.origem || '').indexOf('META:') === 0;
    }).length;
    if (espelhosEncontrados !== espelhosEsperados) {
      avisos.push('Espelhos de meta em Lancamentos (' + espelhosEncontrados +
        ') diferem dos movimentos de aporte/resgate (' + espelhosEsperados +
        '). O saldo das metas continua correto: ele vem de Metas_Movimentos.');
    }

    // 7. Categorias usadas mas nao cadastradas.
    var categoriasCadastradas = {};
    listarCategorias(false).forEach(function (c) {
      categoriasCadastradas[normalizarTexto(c.nome)] = true;
    });
    var faltando = {};
    lancamentos.forEach(function (l) {
      var chave = normalizarTexto(l.categoria);
      if (chave && !categoriasCadastradas[chave]) faltando[String(l.categoria)] = true;
    });
    Object.keys(faltando).forEach(function (nome) {
      avisos.push('Categoria "' + nome + '" usada em lancamentos mas nao cadastrada.');
    });

    resumo = {
      lancamentos: lancamentos.length,
      movimentos: movimentos.length,
      metas: metas.length,
      recorrentes: recorrentes.length,
      categorias: Object.keys(categoriasCadastradas).length
    };

  } catch (e) {
    problemas.push('Erro durante a validacao: ' + e.message);
    logErro('validarDados', 'Falha na validacao', e.message);
  }

  var ok = problemas.length === 0;
  logInfo('validarDados', ok ? 'Validacao sem problemas' : 'Problemas encontrados',
          { problemas: problemas.length, avisos: avisos.length });
  return { ok: ok, problemas: problemas, avisos: avisos, resumo: resumo };
}

/**
 * Recalcula tudo que e derivado: campos calculados, orcamentos e painel.
 * @return {Object} Indicadores atualizados.
 */
function recalcularTudo() {
  atualizarCamposCalculadosMetas();
  avaliarOrcamentos(mesAtual());
  limparCache();
  return atualizarDashboard();
}

// ===========================================================================
// TRIGGERS
// ===========================================================================

/** Nome da funcao chamada pelo gatilho diario. */
var FUNCAO_TRIGGER_DIARIO = 'rotinaDiaria';

/**
 * Instala o gatilho diario de atualizacao (idempotente).
 * Exige autorizacao do usuario; por isso nunca roda sozinho no setup.
 * @return {{sucesso: boolean, mensagem: string}}
 */
function instalarTriggers() {
  try {
    var existentes = ScriptApp.getProjectTriggers().filter(function (t) {
      return t.getHandlerFunction() === FUNCAO_TRIGGER_DIARIO;
    });
    if (existentes.length) {
      return { sucesso: true, mensagem: 'O gatilho diario ja estava instalado.' };
    }
    ScriptApp.newTrigger(FUNCAO_TRIGGER_DIARIO)
      .timeBased().atHour(7).everyDays(1).create();
    logInfo('instalarTriggers', 'Gatilho diario instalado');
    return { sucesso: true, mensagem: 'Gatilho diario instalado (por volta das 7h).' };
  } catch (e) {
    logErro('instalarTriggers', 'Falha ao instalar gatilho', e.message);
    return { sucesso: false, mensagem: 'Nao foi possivel instalar o gatilho: ' + e.message };
  }
}

/**
 * Remove os gatilhos criados por este sistema.
 * @return {{sucesso: boolean, mensagem: string}}
 */
function removerTriggers() {
  try {
    var removidos = 0;
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === FUNCAO_TRIGGER_DIARIO) {
        ScriptApp.deleteTrigger(t);
        removidos++;
      }
    });
    return { sucesso: true, mensagem: removidos + ' gatilho(s) removido(s).' };
  } catch (e) {
    return { sucesso: false, mensagem: 'Falha ao remover gatilhos: ' + e.message };
  }
}

/** Rotina executada pelo gatilho diario. Nunca deve lancar excecao. */
function rotinaDiaria() {
  try {
    // Gera as ocorrencias recorrentes vencidas ANTES de recalcular, para o
    // painel do dia ja nascer com elas.
    if (obterConfigBooleano('gerar_recorrentes_automaticamente', true)) {
      var geracao = gerarLancamentosRecorrentes();
      if (geracao.criados > 0) {
        logInfo('rotinaDiaria', 'Recorrencias geradas', { criados: geracao.criados });
      }
    }
    recalcularTudo();
    podarLogs(5000);
    logInfo('rotinaDiaria', 'Rotina diaria concluida');
  } catch (e) {
    logErro('rotinaDiaria', 'Falha na rotina diaria', e.message);
  }
}

// ===========================================================================
// BACKUP
// ===========================================================================

/**
 * Cria uma copia completa da planilha no Drive, como backup.
 * @return {{sucesso: boolean, mensagem: string, url: (string|undefined)}}
 */
function exportarBackup() {
  try {
    var planilha = obterPlanilha();
    var nome = planilha.getName() + ' - backup ' +
      Utilities.formatDate(new Date(), obterFusoHorario(), 'yyyy-MM-dd HH:mm');
    var copia = planilha.copy(nome);
    logInfo('exportarBackup', 'Backup criado', { nome: nome });
    return {
      sucesso: true,
      mensagem: 'Backup criado no seu Drive: "' + nome + '".',
      url: copia.getUrl()
    };
  } catch (e) {
    logErro('exportarBackup', 'Falha ao criar backup', e.message);
    return {
      sucesso: false,
      mensagem: 'Nao foi possivel criar o backup: ' + e.message +
                ' (verifique se o script tem permissao de acesso ao Drive).'
    };
  }
}
