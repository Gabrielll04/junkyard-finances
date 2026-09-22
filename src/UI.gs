/**
 * UI.gs
 * ---------------------------------------------------------------------------
 * Menu personalizado, dialogos nativos e as funcoes expostas para a sidebar
 * HTML via google.script.run.
 *
 * Tudo o que a interface chama passa por aqui e devolve objetos simples
 * (serializaveis), com mensagens de erro em linguagem humana.
 */

// ===========================================================================
// MENU
// ===========================================================================

/**
 * Gatilho simples do Google Sheets: monta o menu ao abrir a planilha.
 */
function onOpen() {
  try {
    criarMenu();
  } catch (e) {
    console.error('Falha ao montar o menu: ' + e.message);
  }
}

/** Monta o menu "Financeiro". */
function criarMenu() {
  var ui = SpreadsheetApp.getUi();

  var menuRecorrentes = ui.createMenu('Recorrentes')
    .addItem('Nova recorrencia', 'menuNovaRecorrencia')
    .addItem('Ver recorrencias', 'menuVerRecorrencias')
    .addSeparator()
    .addItem('Gerar agora', 'menuGerarRecorrentes')
    .addSeparator()
    .addItem('Ativar/desativar', 'menuAlternarRecorrencia')
    .addItem('Excluir recorrencia', 'menuExcluirRecorrencia');

  var menuLancamentos = ui.createMenu('Lancamentos')
    .addItem('Registrar receita', 'menuRegistrarReceita')
    .addItem('Registrar despesa', 'menuRegistrarDespesa')
    .addSeparator()
    .addItem('Ver ultimos lancamentos', 'menuVerLancamentos')
    .addItem('Editar lancamento', 'menuEditarLancamento')
    .addItem('Excluir lancamento', 'menuExcluirLancamento')
    .addSeparator()
    .addSubMenu(menuRecorrentes);

  var menuMetas = ui.createMenu('Metas')
    .addItem('Nova meta', 'menuNovaMeta')
    .addItem('Ver metas', 'menuListarMetas')
    .addItem('Editar meta', 'menuEditarMeta')
    .addSeparator()
    .addItem('Aportar em meta', 'menuAportarEmMeta')
    .addItem('Resgatar de meta', 'menuResgatarDaMeta')
    .addSeparator()
    .addItem('Ativar meta', 'menuAtivarMeta')
    .addItem('Desativar meta', 'menuDesativarMeta')
    .addItem('Excluir meta', 'menuExcluirMeta')
    .addSeparator()
    .addItem('Recalcular alvo da reserva', 'menuRecalcularReserva');

  var menuSimulacoes = ui.createMenu('Simulacoes')
    .addItem('Simular uma meta', 'menuSimularMeta')
    .addItem('Simular todas as metas', 'menuSimularTodas')
    .addItem('Quanto terei em N meses?', 'menuSimularValorFuturo');

  var menuConfiguracao = ui.createMenu('Configuracao')
    .addItem('Executar setup', 'menuExecutarSetup')
    .addItem('Reaplicar formatos e validacoes', 'menuReaplicarFormatos')
    .addSeparator()
    .addItem('Mostrar/ocultar graficos', 'menuAlternarGraficos')
    .addSeparator()
    .addItem('Status da IA', 'menuStatusIA')
    .addItem('Configurar IA', 'menuConfigurarIA')
    .addItem('Testar conexao com a IA', 'menuTestarIA')
    .addSeparator()
    .addItem('Instalar atualizacao diaria', 'menuInstalarTriggers')
    .addItem('Remover atualizacao diaria', 'menuRemoverTriggers');

  var menuDados = ui.createMenu('Dados')
    .addItem('Verificar instalacao', 'menuVerificarInstalacao')
    .addItem('Validar dados', 'menuValidarDados')
    .addItem('Recalcular tudo', 'menuRecalcularTudo')
    .addSeparator()
    .addItem('Criar dados de exemplo', 'menuCriarDadosExemplo')
    .addItem('Remover dados de exemplo', 'menuRemoverDadosExemplo')
    .addSeparator()
    .addItem('Backup / exportar', 'menuBackup')
    .addItem('Executar testes', 'menuExecutarTestes');

  ui.createMenu('Financeiro')
    .addItem('Abrir painel', 'abrirSidebar')
    .addItem('Atualizar painel', 'menuAtualizarDashboard')
    .addSeparator()
    .addItem('Registrar receita', 'menuRegistrarReceita')
    .addItem('Registrar despesa', 'menuRegistrarDespesa')
    .addSeparator()
    .addSubMenu(menuLancamentos)
    .addSubMenu(menuMetas)
    .addSubMenu(menuSimulacoes)
    .addSeparator()
    .addItem('Gerar indicadores', 'menuGerarIndicadores')
    .addItem('Gerar insights (IA ou regras)', 'menuGerarInsights')
    .addSeparator()
    .addSubMenu(menuConfiguracao)
    .addSubMenu(menuDados)
    .addToUi();
}

/** Abre a sidebar HTML. */
function abrirSidebar() {
  try {
    var html = HtmlService.createTemplateFromFile('Sidebar')
      .evaluate()
      .setTitle('Financas Pessoais')
      .setWidth(420);
    SpreadsheetApp.getUi().showSidebar(html);
  } catch (e) {
    _alerta('Nao foi possivel abrir o painel: ' + e.message);
  }
}

// ===========================================================================
// AUXILIARES DE DIALOGO
// ===========================================================================

/**
 * Exibe um alerta simples.
 * @param {string} mensagem
 * @param {string=} titulo
 * @private
 */
function _alerta(mensagem, titulo) {
  try {
    SpreadsheetApp.getUi().alert(titulo || 'Financeiro', String(mensagem),
                                 SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    console.log(mensagem);
  }
}

/**
 * Pergunta algo ao usuario.
 * @param {string} pergunta
 * @param {string=} titulo
 * @return {string|null} Texto digitado, ou null se cancelado.
 * @private
 */
function _perguntar(pergunta, titulo) {
  var ui = SpreadsheetApp.getUi();
  var resposta = ui.prompt(titulo || 'Financeiro', pergunta, ui.ButtonSet.OK_CANCEL);
  if (resposta.getSelectedButton() !== ui.Button.OK) return null;
  return String(resposta.getResponseText() || '').trim();
}

/**
 * Pergunta sim/nao.
 * @param {string} pergunta
 * @return {boolean}
 * @private
 */
function _confirmar(pergunta) {
  var ui = SpreadsheetApp.getUi();
  return ui.alert('Confirmacao', pergunta, ui.ButtonSet.YES_NO) === ui.Button.YES;
}

/**
 * Executa uma acao de menu tratando erros de forma amigavel.
 * @param {string} nome Nome da acao (usado no log).
 * @param {function(): string} acao Deve devolver a mensagem de sucesso.
 * @private
 */
function _executarAcaoDeMenu(nome, acao) {
  try {
    var mensagem = acao();
    if (mensagem) _alerta(mensagem);
  } catch (e) {
    logErro(nome, 'Erro em acao de menu', e.message);
    _alerta('Ops: ' + e.message);
  }
}

/**
 * Monta uma lista numerada de metas para escolha por numero.
 * @param {boolean=} incluirInativas
 * @return {{metas: Array<Object>, texto: string}}
 * @private
 */
function _listaDeMetasParaEscolha(incluirInativas) {
  var metas = listarMetas(incluirInativas);
  var texto = metas.map(function (m, i) {
    return (i + 1) + ') ' + m.nome + ' [' + m.tipo + '] - ' +
      formatarMoeda(m.saldoAtual) + ' de ' + formatarMoeda(paraNumero(m.valor_alvo) || 0) +
      ' (' + m.progressoPercentual + '%)';
  }).join('\n');
  return { metas: metas, texto: texto };
}

/**
 * Pede ao usuario que escolha uma meta pelo numero.
 * @param {string} titulo
 * @param {boolean=} incluirInativas
 * @return {Object|null} Meta escolhida.
 * @private
 */
function _escolherMeta(titulo, incluirInativas) {
  var lista = _listaDeMetasParaEscolha(incluirInativas);
  if (!lista.metas.length) {
    _alerta('Nenhuma meta cadastrada. Use "Metas > Nova meta" primeiro.');
    return null;
  }
  var resposta = _perguntar(
    lista.texto + '\n\nDigite o numero da meta:', titulo);
  if (resposta === null) return null;

  var indice = parseInt(resposta, 10) - 1;
  if (isNaN(indice) || indice < 0 || indice >= lista.metas.length) {
    _alerta('Numero invalido.');
    return null;
  }
  return lista.metas[indice];
}

// ===========================================================================
// ACOES DO MENU - LANCAMENTOS
// ===========================================================================

/** Registra uma receita via dialogos. */
function menuRegistrarReceita() {
  _registrarLancamentoViaDialogo(TIPOS_LANCAMENTO.RECEITA, 'Registrar receita');
}

/** Registra uma despesa via dialogos. */
function menuRegistrarDespesa() {
  _registrarLancamentoViaDialogo(TIPOS_LANCAMENTO.DESPESA, 'Registrar despesa');
}

/**
 * Fluxo comum de registro por prompts.
 * @param {string} tipo
 * @param {string} titulo
 * @private
 */
function _registrarLancamentoViaDialogo(tipo, titulo) {
  _executarAcaoDeMenu('menuRegistrarLancamento', function () {
    var valorTexto = _perguntar('Valor (ex.: 1250,90):', titulo);
    if (valorTexto === null) return '';

    var categorias = listarNomesCategorias(tipo);
    var categoria = _perguntar(
      'Categoria:\n' + categorias.join(', ') + '\n\n(Pode digitar uma nova.)', titulo);
    if (categoria === null) return '';

    var dataTexto = _perguntar('Data (dd/mm/aaaa). Deixe vazio para hoje:', titulo);
    if (dataTexto === null) return '';
    var data = dataTexto ? converterParaData(dataTexto) : new Date();
    if (!data) throw new Error('Data invalida: "' + dataTexto + '".');

    var descricao = _perguntar('Descricao (opcional):', titulo);
    if (descricao === null) return '';

    var lancamento = registrarLancamento({
      data: data, tipo: tipo, valor: valorTexto,
      categoria: categoria, descricao: descricao
    });

    atualizarDashboard();
    return (tipo === TIPOS_LANCAMENTO.RECEITA ? 'Receita' : 'Despesa') +
      ' de ' + formatarMoeda(lancamento.valor) + ' registrada em ' +
      formatarData(lancamento.data) + ' (' + lancamento.categoria + ').';
  });
}

/**
 * Pede ao usuario que escolha um lancamento recente pelo numero.
 * @param {string} titulo
 * @param {number=} limite Padrao 15.
 * @return {Object|null}
 * @private
 */
function _escolherLancamento(titulo, limite) {
  var lista = listarLancamentos({ limite: limite || 15, incluirCancelados: true });
  if (!lista.length) {
    _alerta('Nenhum lancamento registrado ainda.');
    return null;
  }

  var texto = lista.map(function (l, i) {
    var marca = String(l.status || '').toUpperCase() === STATUS_LANCAMENTO.CANCELADO
      ? ' [CANCELADO]' : '';
    return (i + 1) + ') ' + formatarData(l.data) + ' - ' + l.tipo + ' - ' +
      formatarMoeda(paraNumero(l.valor) || 0) + ' - ' + l.categoria +
      (l.descricao ? ' - ' + l.descricao : '') + marca;
  }).join('\n');

  var resposta = _perguntar(texto + '\n\nDigite o numero do lancamento:', titulo);
  if (resposta === null) return null;

  var indice = parseInt(resposta, 10) - 1;
  if (isNaN(indice) || indice < 0 || indice >= lista.length) {
    _alerta('Numero invalido.');
    return null;
  }
  return lista[indice];
}

/** Mostra os ultimos lancamentos. */
function menuVerLancamentos() {
  _executarAcaoDeMenu('menuVerLancamentos', function () {
    var lista = listarLancamentos({ limite: 20, incluirCancelados: true });
    if (!lista.length) return 'Nenhum lancamento registrado ainda.';

    return 'ULTIMOS LANCAMENTOS\n\n' + lista.map(function (l) {
      var marca = String(l.status || '').toUpperCase() === STATUS_LANCAMENTO.CANCELADO
        ? ' [CANCELADO]' : '';
      return formatarData(l.data) + '  ' + l.tipo + '  ' +
        formatarMoeda(paraNumero(l.valor) || 0) + '  ' + l.categoria +
        (l.descricao ? '\n    ' + l.descricao : '') + marca;
    }).join('\n');
  });
}

/** Edita um lancamento pelo menu. */
function menuEditarLancamento() {
  _executarAcaoDeMenu('menuEditarLancamento', function () {
    var lancamento = _escolherLancamento('Editar lancamento');
    if (!lancamento) return '';

    var campos = {};

    var valor = _perguntar('Novo valor (vazio mantem ' +
      formatarMoeda(paraNumero(lancamento.valor) || 0) + '):', 'Editar lancamento');
    if (valor === null) return '';
    if (valor) campos.valor = valor;

    var categoria = _perguntar('Nova categoria (vazio mantem "' +
      lancamento.categoria + '"):', 'Editar lancamento');
    if (categoria === null) return '';
    if (categoria) campos.categoria = categoria;

    var data = _perguntar('Nova data dd/mm/aaaa (vazio mantem ' +
      formatarData(lancamento.data) + '):', 'Editar lancamento');
    if (data === null) return '';
    if (data) campos.data = data;

    var descricao = _perguntar('Nova descricao (vazio mantem; "-" limpa):',
                               'Editar lancamento');
    if (descricao === null) return '';
    if (descricao === '-') campos.descricao = '';
    else if (descricao) campos.descricao = descricao;

    if (!Object.keys(campos).length) return 'Nada foi alterado.';

    var atualizado = editarLancamento(lancamento.id_lancamento, campos);
    atualizarDashboard();
    return 'Lancamento atualizado: ' + formatarData(atualizado.data) + ' - ' +
      atualizado.tipo + ' - ' + formatarMoeda(paraNumero(atualizado.valor) || 0) +
      ' - ' + atualizado.categoria + '.';
  });
}

/** Exclui (cancela ou apaga) um lancamento pelo menu. */
function menuExcluirLancamento() {
  _executarAcaoDeMenu('menuExcluirLancamento', function () {
    var lancamento = _escolherLancamento('Excluir lancamento');
    if (!lancamento) return '';

    var definitiva = _confirmar(
      formatarData(lancamento.data) + ' - ' + lancamento.tipo + ' - ' +
      formatarMoeda(paraNumero(lancamento.valor) || 0) + ' - ' +
      lancamento.categoria + '\n\n' +
      'SIM = apagar a linha DEFINITIVAMENTE.\n' +
      'NAO = cancelar (sai dos totais, a linha fica). Recomendado.');

    if (!definitiva) {
      var resultado = excluirLancamento(lancamento.id_lancamento, 'SOFT');
      atualizarDashboard();
      return resultado.mensagem;
    }

    if (!_confirmar('Tem certeza? Esta acao nao pode ser desfeita.')) {
      return 'Operacao cancelada.';
    }
    var apagado = excluirLancamento(lancamento.id_lancamento, 'HARD', true);
    atualizarDashboard();
    return apagado.mensagem;
  });
}

// ===========================================================================
// ACOES DO MENU - RECORRENTES
// ===========================================================================

/**
 * Pede ao usuario que escolha uma recorrencia pelo numero.
 * @param {string} titulo
 * @return {Object|null}
 * @private
 */
function _escolherRecorrencia(titulo) {
  var lista = listarRecorrentes(true);
  if (!lista.length) {
    _alerta('Nenhuma recorrencia cadastrada. Use "Nova recorrencia" primeiro.');
    return null;
  }

  var texto = lista.map(function (r, i) {
    return (i + 1) + ') ' + r.resumo + ' [' + (r.ativa ? 'ATIVA' : 'INATIVA') + ']';
  }).join('\n');

  var resposta = _perguntar(texto + '\n\nDigite o numero da recorrencia:', titulo);
  if (resposta === null) return null;

  var indice = parseInt(resposta, 10) - 1;
  if (isNaN(indice) || indice < 0 || indice >= lista.length) {
    _alerta('Numero invalido.');
    return null;
  }
  return lista[indice];
}

/** Cria uma recorrencia via dialogos. */
function menuNovaRecorrencia() {
  _executarAcaoDeMenu('menuNovaRecorrencia', function () {
    var titulo = 'Nova recorrencia';

    var descricao = _perguntar('Descricao (ex.: Aluguel, Salario, Aporte da reserva):',
                               titulo);
    if (descricao === null) return '';
    if (!descricao) throw new Error('A descricao e obrigatoria.');

    var tipo = _perguntar('Tipo:\n' + TIPOS_RECORRENTE.join(' / '), titulo);
    if (tipo === null) return '';
    var tipoNormalizado = String(tipo).trim().toUpperCase();
    if (TIPOS_RECORRENTE.indexOf(tipoNormalizado) === -1) {
      throw new Error('Tipo invalido. Use: ' + TIPOS_RECORRENTE.join(', ') + '.');
    }

    var valor = _perguntar('Valor:', titulo);
    if (valor === null) return '';

    var metaId = '';
    var categoria = '';
    if (tipoNormalizado === 'APORTE_META') {
      var meta = _escolherMeta('Recorrencia: escolha a meta', false);
      if (!meta) return '';
      metaId = meta.id_meta;
    } else {
      var categorias = listarNomesCategorias(tipoNormalizado);
      categoria = _perguntar('Categoria:\n' + categorias.join(', '), titulo);
      if (categoria === null) return '';
    }

    var dia = _perguntar('Dia do mes (1 a 31). Vazio = hoje:', titulo);
    if (dia === null) return '';

    var frequencia = _perguntar(
      'Frequencia em meses:\n' +
      Object.keys(FREQUENCIAS_RECORRENTE).map(function (f) {
        return f + ' = ' + FREQUENCIAS_RECORRENTE[f];
      }).join('\n') + '\n\nVazio = 1 (mensal):', titulo);
    if (frequencia === null) return '';

    var inicio = _perguntar('Data de inicio dd/mm/aaaa. Vazio = hoje:', titulo);
    if (inicio === null) return '';

    var fim = _perguntar('Data final dd/mm/aaaa (opcional, vazio = sem fim):', titulo);
    if (fim === null) return '';

    var regra = criarRecorrente({
      descricao: descricao,
      tipo: tipoNormalizado,
      valor: valor,
      categoria: categoria,
      meta_id: metaId,
      dia_do_mes: dia,
      frequencia_meses: frequencia,
      data_inicio: inicio,
      data_fim: fim
    });

    var gerar = _confirmar('Recorrencia criada.\n\n' + regra.resumo +
      '\n\nGerar agora as ocorrencias ja vencidas?');
    var complemento = '';
    if (gerar) {
      var geracao = gerarLancamentosRecorrentes({ idRecorrente: regra.id_recorrente });
      complemento = '\n\n' + geracao.mensagem;
      atualizarDashboard();
    }

    return 'Recorrencia "' + regra.descricao + '" criada.\n' +
      'Proxima ocorrencia: ' + (formatarData(regra.proxima_geracao) || 'a definir') +
      complemento;
  });
}

/** Lista as recorrencias cadastradas. */
function menuVerRecorrencias() {
  _executarAcaoDeMenu('menuVerRecorrencias', function () {
    var lista = listarRecorrentes(true);
    if (!lista.length) return 'Nenhuma recorrencia cadastrada.';

    var texto = lista.map(function (r) {
      var linha = '- ' + r.resumo + ' [' + (r.ativa ? 'ATIVA' : 'INATIVA') + ']';
      if (r.nomeMeta) linha += '\n  Meta: ' + r.nomeMeta;
      linha += '\n  Proxima: ' + (formatarData(r.proxima_geracao) || 'nenhuma') +
        ' | Ja geradas: ' + (paraNumero(r.total_gerado) || 0);
      return linha;
    }).join('\n\n');

    var comprometimento = calcularComprometimentoMensal();
    texto += '\n\nCOMPROMETIMENTO MENSAL (equivalente)\n' +
      'Receitas fixas: ' + formatarMoeda(comprometimento.receitas) + '\n' +
      'Despesas fixas: ' + formatarMoeda(comprometimento.despesas) + '\n' +
      'Aportes fixos: ' + formatarMoeda(comprometimento.aportes) + '\n' +
      'Sobra prevista: ' + formatarMoeda(comprometimento.liquidoMensal);
    return texto;
  });
}

/** Gera as ocorrencias vencidas sob demanda. */
function menuGerarRecorrentes() {
  _executarAcaoDeMenu('menuGerarRecorrentes', function () {
    var resultado = gerarLancamentosRecorrentes();
    if (resultado.criados > 0) atualizarDashboard();

    var texto = resultado.mensagem;
    if (resultado.detalhes.length) {
      texto += '\n\n' + resultado.detalhes.slice(0, 15).map(function (d) {
        return '- ' + d.data + ' ' + d.tipo + ' ' + formatarMoeda(d.valor) +
          ' - ' + d.descricao;
      }).join('\n');
    }
    if (resultado.erros.length) {
      texto += '\n\nERROS:\n- ' + resultado.erros.join('\n- ');
    }
    return texto;
  });
}

/** Ativa ou desativa uma recorrencia. */
function menuAlternarRecorrencia() {
  _executarAcaoDeMenu('menuAlternarRecorrencia', function () {
    var regra = _escolherRecorrencia('Ativar/desativar recorrencia');
    if (!regra) return '';

    if (regra.ativa) {
      desativarRecorrente(regra.id_recorrente);
      return 'Recorrencia "' + regra.descricao + '" desativada. ' +
             'Nenhuma nova ocorrencia sera gerada.';
    }
    ativarRecorrente(regra.id_recorrente);
    return 'Recorrencia "' + regra.descricao + '" ativada.';
  });
}

/** Exclui uma recorrencia. */
function menuExcluirRecorrencia() {
  _executarAcaoDeMenu('menuExcluirRecorrencia', function () {
    var regra = _escolherRecorrencia('Excluir recorrencia');
    if (!regra) return '';

    var definitiva = _confirmar(
      regra.resumo + '\n' +
      'Ocorrencias ja geradas: ' + (paraNumero(regra.total_gerado) || 0) + '\n\n' +
      'SIM = apagar a regra DEFINITIVAMENTE.\n' +
      'NAO = apenas desativar (recomendado, reversivel).\n\n' +
      'Em qualquer caso os lancamentos ja gerados sao preservados.');

    var resultado = excluirRecorrente(regra.id_recorrente, definitiva ? 'HARD' : 'SOFT');
    return resultado.mensagem;
  });
}

// ===========================================================================
// ACOES DO MENU - METAS
// ===========================================================================

/** Cria uma meta via dialogos. */
function menuNovaMeta() {
  _executarAcaoDeMenu('menuNovaMeta', function () {
    var nome = _perguntar('Nome da meta:', 'Nova meta');
    if (nome === null) return '';
    if (!nome) throw new Error('O nome da meta e obrigatorio.');

    var tipo = TIPOS_META.META;
    if (_confirmar('Esta meta e a sua RESERVA DE EMERGENCIA?')) {
      tipo = TIPOS_META.RESERVA;
    }

    var alvoTexto = '';
    if (tipo === TIPOS_META.RESERVA) {
      var sugestao = sugerirValorReserva();
      alvoTexto = _perguntar(
        'Valor alvo. Sugestao com base nos seus gastos: ' +
        formatarMoeda(sugestao.valorRecomendado) +
        ' (' + sugestao.meses + ' meses x ' + formatarMoeda(sugestao.despesaMedia) + ').' +
        '\n\nDeixe vazio para usar a sugestao:', 'Nova meta');
    } else {
      alvoTexto = _perguntar('Valor alvo (ex.: 10000):', 'Nova meta');
    }
    if (alvoTexto === null) return '';

    var aporteTexto = _perguntar('Aporte mensal planejado (opcional):', 'Nova meta');
    if (aporteTexto === null) return '';

    var prazoTexto = _perguntar('Data limite dd/mm/aaaa (opcional):', 'Nova meta');
    if (prazoTexto === null) return '';

    var saldoTexto = _perguntar('Saldo inicial ja guardado (opcional):', 'Nova meta');
    if (saldoTexto === null) return '';

    var meta = criarMeta({
      nome: nome, tipo: tipo,
      valor_alvo: alvoTexto,
      aporte_mensal_planejado: aporteTexto,
      data_prazo: prazoTexto,
      saldo_inicial: saldoTexto
    });

    atualizarDashboard();
    return 'Meta "' + meta.nome + '" criada com alvo de ' +
      formatarMoeda(paraNumero(meta.valor_alvo)) + '.\nID: ' + meta.id_meta;
  });
}

/** Mostra a lista de metas com progresso. */
function menuListarMetas() {
  _executarAcaoDeMenu('menuListarMetas', function () {
    var metas = listarMetas(true);
    if (!metas.length) return 'Nenhuma meta cadastrada.';

    var texto = metas.map(function (m) {
      var linha = '- ' + m.nome + ' [' + m.tipo + '/' + m.status + ']\n' +
        '  ' + formatarMoeda(m.saldoAtual) + ' de ' +
        formatarMoeda(paraNumero(m.valor_alvo) || 0) +
        ' (' + m.progressoPercentual + '%)';
      if (m.valorFaltante > 0) {
        linha += '\n  Faltam ' + formatarMoeda(m.valorFaltante) + '. ' + m.mensagemPrevisao;
      }
      return linha;
    }).join('\n\n');
    return texto;
  });
}

/** Edita campos de uma meta. */
function menuEditarMeta() {
  _executarAcaoDeMenu('menuEditarMeta', function () {
    var meta = _escolherMeta('Editar meta', true);
    if (!meta) return '';

    var campos = {};
    var nome = _perguntar('Novo nome (vazio mantem "' + meta.nome + '"):', 'Editar meta');
    if (nome === null) return '';
    if (nome) campos.nome = nome;

    var alvo = _perguntar('Novo valor alvo (vazio mantem ' +
      formatarMoeda(paraNumero(meta.valor_alvo) || 0) + '):', 'Editar meta');
    if (alvo === null) return '';
    if (alvo) campos.valor_alvo = alvo;

    var aporte = _perguntar('Novo aporte mensal (vazio mantem ' +
      formatarMoeda(paraNumero(meta.aporte_mensal_planejado) || 0) + '):', 'Editar meta');
    if (aporte === null) return '';
    if (aporte) campos.aporte_mensal_planejado = aporte;

    var prazo = _perguntar('Nova data limite dd/mm/aaaa (vazio mantem; digite "-" para remover):',
                           'Editar meta');
    if (prazo === null) return '';
    if (prazo === '-') campos.data_prazo = '';
    else if (prazo) campos.data_prazo = prazo;

    if (!Object.keys(campos).length) return 'Nada foi alterado.';

    var atualizada = editarMeta(meta.id_meta, campos);
    atualizarDashboard();
    return 'Meta "' + atualizada.nome + '" atualizada.';
  });
}

/** Aporta em uma meta. */
function menuAportarEmMeta() {
  _movimentarMetaViaDialogo('APORTE');
}

/** Resgata de uma meta. */
function menuResgatarDaMeta() {
  _movimentarMetaViaDialogo('RESGATE');
}

/**
 * Fluxo comum de aporte/resgate por prompts.
 * @param {string} operacao 'APORTE' ou 'RESGATE'
 * @private
 */
function _movimentarMetaViaDialogo(operacao) {
  var ehAporte = operacao === 'APORTE';
  var titulo = ehAporte ? 'Aportar em meta' : 'Resgatar de meta';

  _executarAcaoDeMenu('menu' + operacao, function () {
    var meta = _escolherMeta(titulo, false);
    if (!meta) return '';

    var valor = _perguntar(
      'Meta: ' + meta.nome + '\nSaldo atual: ' + formatarMoeda(meta.saldoAtual) +
      (ehAporte && meta.valorFaltante > 0
        ? '\nFaltam ' + formatarMoeda(meta.valorFaltante)
        : '') +
      '\n\nValor do ' + (ehAporte ? 'aporte' : 'resgate') + ':', titulo);
    if (valor === null) return '';

    var dataTexto = _perguntar('Data (dd/mm/aaaa). Vazio = hoje:', titulo);
    if (dataTexto === null) return '';
    var data = dataTexto ? converterParaData(dataTexto) : new Date();
    if (!data) throw new Error('Data invalida: "' + dataTexto + '".');

    var descricao = _perguntar('Descricao (opcional):', titulo);
    if (descricao === null) return '';

    var resultado = ehAporte
      ? aportarEmMeta(meta.id_meta, valor, data, descricao)
      : resgatarDaMeta(meta.id_meta, valor, data, descricao);

    atualizarDashboard();
    return (ehAporte ? 'Aporte' : 'Resgate') + ' registrado.\n' +
      'Novo saldo de "' + meta.nome + '": ' + formatarMoeda(resultado.saldoAtual) +
      ' (' + resultado.progressoPercentual + '% da meta).';
  });
}

/** Reativa uma meta. */
function menuAtivarMeta() {
  _executarAcaoDeMenu('menuAtivarMeta', function () {
    var meta = _escolherMeta('Ativar meta', true);
    if (!meta) return '';
    ativarMeta(meta.id_meta);
    atualizarDashboard();
    return 'Meta "' + meta.nome + '" ativada.';
  });
}

/** Desativa uma meta. */
function menuDesativarMeta() {
  _executarAcaoDeMenu('menuDesativarMeta', function () {
    var meta = _escolherMeta('Desativar meta', false);
    if (!meta) return '';
    desativarMeta(meta.id_meta);
    atualizarDashboard();
    return 'Meta "' + meta.nome + '" desativada. O historico foi preservado.';
  });
}

/** Exclui (soft ou hard) uma meta, sempre com confirmacao. */
function menuExcluirMeta() {
  _executarAcaoDeMenu('menuExcluirMeta', function () {
    var meta = _escolherMeta('Excluir meta', true);
    if (!meta) return '';

    var querDefinitiva = _confirmar(
      'Meta: "' + meta.nome + '"\n' +
      'Saldo: ' + formatarMoeda(meta.saldoAtual) + ' em ' +
      meta.quantidadeMovimentos + ' movimento(s).\n\n' +
      'SIM = exclusao DEFINITIVA da linha da meta.\n' +
      'NAO = apenas desativar (recomendado, reversivel).');

    if (!querDefinitiva) {
      var resultado = excluirMeta(meta.id_meta, 'SOFT');
      atualizarDashboard();
      return resultado.mensagem;
    }

    if (!_confirmar('Tem certeza? Esta acao nao pode ser desfeita.\n' +
        'Os movimentos e lancamentos historicos continuarao na planilha.')) {
      return 'Operacao cancelada.';
    }
    var definitiva = excluirMeta(meta.id_meta, 'HARD', true);
    atualizarDashboard();
    return definitiva.mensagem;
  });
}

/** Recalcula o alvo da reserva com base na despesa media atual. */
function menuRecalcularReserva() {
  _executarAcaoDeMenu('menuRecalcularReserva', function () {
    var reserva = obterMetaReserva();
    if (!reserva) throw new Error('Nenhuma meta do tipo RESERVA encontrada.');

    var sugestao = sugerirValorReserva();
    if (sugestao.valorRecomendado <= 0) {
      return 'Ainda nao ha despesas suficientes para calcular a reserva recomendada. ' +
             'Registre alguns meses de gastos primeiro.';
    }

    if (!_confirmar(
        'Alvo atual: ' + formatarMoeda(paraNumero(reserva.valor_alvo) || 0) + '\n' +
        'Alvo sugerido: ' + formatarMoeda(sugestao.valorRecomendado) + '\n' +
        '(' + sugestao.meses + ' meses x despesa media de ' +
        formatarMoeda(sugestao.despesaMedia) + ')\n\nAtualizar?')) {
      return 'Operacao cancelada.';
    }

    editarMeta(reserva.id_meta, { valor_alvo: sugestao.valorRecomendado });
    atualizarDashboard();
    return 'Alvo da reserva atualizado para ' + formatarMoeda(sugestao.valorRecomendado) + '.';
  });
}

// ===========================================================================
// ACOES DO MENU - SIMULACOES E INDICADORES
// ===========================================================================

/** Simula uma meta com aporte alternativo. */
function menuSimularMeta() {
  _executarAcaoDeMenu('menuSimularMeta', function () {
    var meta = _escolherMeta('Simular meta', false);
    if (!meta) return '';

    var aporteTexto = _perguntar(
      'Aporte mensal a simular (atual: ' +
      formatarMoeda(paraNumero(meta.aporte_mensal_planejado) || 0) + '):', 'Simular meta');
    if (aporteTexto === null) return '';

    var simulacao = simularMeta({
      saldoAtual: meta.saldoAtual,
      valorAlvo: meta.valor_alvo,
      aporteMensal: meta.aporte_mensal_planejado,
      aporteSimulado: aporteTexto,
      taxaMensal: meta.taxaMensalEfetiva,
      dataPrazo: meta.data_prazo,
      mesesProjecao: obterConfigNumero('meses_projecao_padrao', 12)
    });

    var texto = 'META: ' + meta.nome + '\n' +
      'Saldo: ' + formatarMoeda(simulacao.saldoAtual) + ' de ' +
      formatarMoeda(simulacao.valorAlvo) + ' (' + simulacao.progressoPercentual + '%)\n' +
      'Faltam: ' + formatarMoeda(simulacao.valorFaltante) + '\n' +
      'Com o aporte atual: ' + simulacao.mensagemPrazo + '\n' +
      'Em ' + simulacao.projecao.meses + ' meses voce teria ' +
      formatarMoeda(simulacao.projecao.valorFuturo) + '.';

    if (simulacao.dataPrevistaFormatada) {
      texto += '\nPrevisao de conclusao: ' + simulacao.dataPrevistaFormatada + '.';
    }
    if (simulacao.cenarioSimulado) {
      texto += '\n\nCENARIO SIMULADO (' +
        formatarMoeda(simulacao.cenarioSimulado.aporteMensal) + '/mes):\n' +
        simulacao.cenarioSimulado.mensagem;
      if (simulacao.cenarioSimulado.mensagemComparativa) {
        texto += '\n' + simulacao.cenarioSimulado.mensagemComparativa;
      }
    }
    if (simulacao.prazo && simulacao.prazo.aporteNecessario !== null &&
        simulacao.prazo.aporteNecessario !== undefined) {
      texto += '\n\nPRAZO DECLARADO (' + simulacao.prazo.dataFormatada + '):\n' +
        simulacao.prazo.mensagem;
    }
    if (simulacao.alertas.length) {
      texto += '\n\nATENCAO:\n- ' + simulacao.alertas.join('\n- ');
    }
    return texto;
  });
}

/** Simula todas as metas e grava na aba Simulacoes. */
function menuSimularTodas() {
  _executarAcaoDeMenu('menuSimularTodas', function () {
    var resultados = simularTodasAsMetas(true);
    if (!resultados.length) return 'Nenhuma meta ativa para simular.';
    var texto = resultados.map(function (r) {
      return '- ' + r.nomeMeta + ': ' + formatarMoeda(r.saldoAtual) + ' de ' +
        formatarMoeda(r.valorAlvo) + ' (' + r.progressoPercentual + '%). ' + r.mensagemPrazo;
    }).join('\n');
    return texto + '\n\nAs simulacoes tambem foram gravadas na aba "' +
      ABAS.SIMULACOES + '".';
  });
}

/** Calculadora avulsa de valor futuro. */
function menuSimularValorFuturo() {
  _executarAcaoDeMenu('menuSimularValorFuturo', function () {
    var saldo = _perguntar('Saldo inicial:', 'Quanto terei em N meses?');
    if (saldo === null) return '';
    var aporte = _perguntar('Aporte mensal:', 'Quanto terei em N meses?');
    if (aporte === null) return '';
    var meses = _perguntar('Em quantos meses?', 'Quanto terei em N meses?');
    if (meses === null) return '';
    var taxaTexto = _perguntar(
      'Taxa mensal em % (ex.: 0,8). Vazio = usar a taxa padrao da aba Config:',
      'Quanto terei em N meses?');
    if (taxaTexto === null) return '';

    var taxa = taxaTexto
      ? paraNumero(taxaTexto) / 100
      : obterConfigNumero('taxa_mensal_padrao', 0);
    if (isNaN(taxa)) taxa = 0;

    var n = parseInt(paraNumero(meses), 10);
    if (isNaN(n) || n <= 0) throw new Error('Informe um numero de meses maior que zero.');

    var futuro = calcularValorFuturo(saldo, aporte, taxa, n);
    var totalAportado = arredondar2(paraNumero(aporte) * n);
    var inicial = arredondar2(paraNumero(saldo) || 0);
    var rendimento = arredondar2(futuro - inicial - totalAportado);

    return 'Em ' + n + ' meses voce teria ' + formatarMoeda(futuro) + '.\n\n' +
      'Saldo inicial: ' + formatarMoeda(inicial) + '\n' +
      'Total aportado: ' + formatarMoeda(totalAportado) + '\n' +
      'Rendimento estimado: ' + formatarMoeda(rendimento) +
      ' (taxa de ' + arredondar2(taxa * 100) + '% ao mes)';
  });
}

/** Mostra os indicadores do mes. */
function menuGerarIndicadores() {
  _executarAcaoDeMenu('menuGerarIndicadores', function () {
    var ind = gerarIndicadores();
    var texto = 'INDICADORES DE ' + ind.mesFormatado.toUpperCase() + '\n\n' +
      'Receitas: ' + formatarMoeda(ind.receitas) + '\n' +
      'Despesas: ' + formatarMoeda(ind.despesas) + '\n' +
      'Saldo: ' + formatarMoeda(ind.saldo) + '\n' +
      'Taxa de poupanca: ' + ind.taxaPoupanca + '%\n' +
      'Renda guardada em metas: ' + ind.percentualGuardado + '%\n' +
      'Aportes: ' + formatarMoeda(ind.totalAportado) +
      ' | Resgates: ' + formatarMoeda(ind.totalResgatado) + '\n\n' +
      'Despesa media (3m/6m/12m): ' + formatarMoeda(ind.despesaMedia3) + ' / ' +
      formatarMoeda(ind.despesaMedia6) + ' / ' + formatarMoeda(ind.despesaMedia12) + '\n' +
      'Gastos fixos: ' + ind.gastosFixosVariaveis.percentualFixos + '% do total\n\n' +
      'Total em metas: ' + formatarMoeda(ind.saldoTotalMetas) + '\n' +
      'Reserva: ' + formatarMoeda(ind.reserva.saldo) + ' (cobre ' +
      ind.reserva.coberturaMeses + ' de ' + ind.reserva.mesesRecomendados + ' meses)\n' +
      'Progresso medio das metas: ' + ind.progressoMedioMetas + '%';

    if (ind.topCategorias.length) {
      texto += '\n\nMAIORES GASTOS:\n' + ind.topCategorias.map(function (c) {
        return '- ' + c.categoria + ': ' + formatarMoeda(c.total);
      }).join('\n');
    }
    if (ind.alertas.length) {
      texto += '\n\nALERTAS:\n- ' + ind.alertas.join('\n- ');
    }
    return texto;
  });
}

/** Gera insights (IA quando configurada, regras caso contrario). */
function menuGerarInsights() {
  _executarAcaoDeMenu('menuGerarInsights', function () {
    var insights = gerarInsightsIA({ forcar: true });
    var texto = 'SUGESTOES (' + insights.fonte + ')\n\n' + insights.resumo + '\n';

    (insights.sugestoes || []).forEach(function (s) {
      texto += '\n[' + String(s.prioridade).toUpperCase() + '] ' + s.titulo +
        (s.descricao ? '\n' + s.descricao : '') + '\n';
    });
    if (insights.alertas && insights.alertas.length) {
      texto += '\nALERTAS:\n- ' + insights.alertas.join('\n- ') + '\n';
    }
    if (insights.erro) texto += '\nObs.: ' + insights.erro;
    texto += '\n\n' + (insights.observacoes || '');

    atualizarDashboard();
    return texto;
  });
}

/** Atualiza o painel. */
function menuAtualizarDashboard() {
  _executarAcaoDeMenu('menuAtualizarDashboard', function () {
    var ind = atualizarDashboard();
    return 'Painel atualizado para ' + ind.mesFormatado + '.';
  });
}

// ===========================================================================
// ACOES DO MENU - CONFIGURACAO E DADOS
// ===========================================================================

/** Roda o setup pelo menu. */
function menuExecutarSetup() {
  _executarAcaoDeMenu('menuExecutarSetup', function () {
    var comExemplo = _confirmar('Deseja criar tambem dados de exemplo?\n' +
      '(Podem ser removidos depois em Dados > Remover dados de exemplo.)');
    var resultado = setupFinanceiro({ criarDadosExemplo: comExemplo });
    if (resultado.sucesso) atualizarDashboard();
    return resultado.mensagem;
  });
}

/** Reaplica formatos e validacoes. */
function menuReaplicarFormatos() {
  _executarAcaoDeMenu('menuReaplicarFormatos', function () {
    aplicarFormatacoes();
    aplicarValidacoesDeDados();
    return 'Formatos e validacoes reaplicados.';
  });
}

/** Liga ou desliga os graficos nativos do painel. */
function menuAlternarGraficos() {
  _executarAcaoDeMenu('menuAlternarGraficos', function () {
    var ativos = obterConfigBooleano('mostrar_graficos', true);
    definirConfig('mostrar_graficos', ativos ? 'NAO' : 'SIM');

    if (ativos) {
      removerGraficosDashboard();
      return 'Graficos ocultados. Ative novamente por este mesmo menu.';
    }
    atualizarDashboard();
    return 'Graficos ativados e desenhados no painel.';
  });
}

/** Mostra o status da IA sem revelar chaves. */
function menuStatusIA() {
  _executarAcaoDeMenu('menuStatusIA', function () {
    var status = obterStatusIA();
    return 'STATUS DA IA\n\n' + status.mensagem + '\n\n' +
      'usar_ia: ' + (status.usarIa ? 'SIM' : 'NAO') + '\n' +
      'provedor_ia: ' + status.provedor + '\n' +
      'modelo_ia: ' + status.modelo + '\n' +
      'GEMINI_API_KEY cadastrada: ' + (status.chaveGeminiConfigurada ? 'sim' : 'nao') + '\n' +
      'GROQ_API_KEY cadastrada: ' + (status.chaveGroqConfigurada ? 'sim' : 'nao') + '\n' +
      'Enviar lancamentos resumidos: ' + (status.enviarResumoDetalhado ? 'SIM' : 'NAO') + '\n\n' +
      'As chaves ficam apenas em Script Properties e nunca aparecem na planilha.';
  });
}

/** Configura provedor, modelo e flags da IA (sem tocar em chaves). */
function menuConfigurarIA() {
  _executarAcaoDeMenu('menuConfigurarIA', function () {
    var provedor = _perguntar(
      'Provedor de IA: digite "gemini" ou "groq".\n\n' +
      'A CHAVE de API nao e digitada aqui. Ela vai em:\n' +
      'Extensoes > Apps Script > Configuracoes do projeto >\n' +
      'Propriedades do script > GEMINI_API_KEY ou GROQ_API_KEY.',
      'Configurar IA');
    if (provedor === null) return '';

    var provedorNormalizado = normalizarTexto(provedor);
    if (['gemini', 'groq'].indexOf(provedorNormalizado) === -1) {
      throw new Error('Provedor invalido. Use "gemini" ou "groq".');
    }

    var modelo = _perguntar(
      'Modelo (vazio usa o padrao "' + MODELOS_PADRAO_IA[provedorNormalizado] + '"):',
      'Configurar IA');
    if (modelo === null) return '';

    var ativar = _confirmar('Ativar as sugestoes por IA agora?\n' +
      '(Sem IA, o sistema continua gerando sugestoes por regras.)');
    var enviarDetalhes = ativar && _confirmar(
      'Enviar tambem a lista resumida de lancamentos do mes (data, tipo, valor, categoria)?\n\n' +
      'NAO = envia apenas totais agregados (mais privado, recomendado).');

    definirConfig('provedor_ia', provedorNormalizado);
    definirConfig('modelo_ia', modelo || MODELOS_PADRAO_IA[provedorNormalizado]);
    definirConfig('usar_ia', ativar ? 'SIM' : 'NAO');
    definirConfig('enviar_resumo_para_ia', enviarDetalhes ? 'SIM' : 'NAO');

    var status = obterStatusIA();
    return 'Configuracao salva.\n\n' + status.mensagem;
  });
}

/** Testa a conexao com o provedor de IA. */
function menuTestarIA() {
  _executarAcaoDeMenu('menuTestarIA', function () {
    var resultado = testarConexaoIA();
    return (resultado.sucesso ? 'OK: ' : 'Falhou: ') + resultado.mensagem;
  });
}

/** Instala o gatilho diario. */
function menuInstalarTriggers() {
  _executarAcaoDeMenu('menuInstalarTriggers', function () {
    if (!_confirmar('Instalar uma atualizacao automatica diaria do painel?\n' +
        'Isso exige autorizacao adicional do Google.')) {
      return 'Operacao cancelada.';
    }
    return instalarTriggers().mensagem;
  });
}

/** Remove o gatilho diario. */
function menuRemoverTriggers() {
  _executarAcaoDeMenu('menuRemoverTriggers', function () {
    return removerTriggers().mensagem;
  });
}

/** Confere se todos os arquivos do projeto foram copiados. */
function menuVerificarInstalacao() {
  _executarAcaoDeMenu('menuVerificarInstalacao', function () {
    return verificarInstalacao().mensagem;
  });
}

/** Valida os dados e mostra o relatorio. */
function menuValidarDados() {
  _executarAcaoDeMenu('menuValidarDados', function () {
    var resultado = validarDados();
    var texto = resultado.ok
      ? 'Nenhum problema critico encontrado.\n'
      : 'PROBLEMAS (' + resultado.problemas.length + '):\n- ' +
        resultado.problemas.slice(0, 20).join('\n- ') + '\n';

    if (resultado.avisos.length) {
      texto += '\nAVISOS (' + resultado.avisos.length + '):\n- ' +
        resultado.avisos.slice(0, 20).join('\n- ') + '\n';
    }
    if (resultado.resumo && resultado.resumo.lancamentos !== undefined) {
      texto += '\nRESUMO: ' + resultado.resumo.lancamentos + ' lancamento(s), ' +
        resultado.resumo.movimentos + ' movimento(s), ' +
        resultado.resumo.metas + ' meta(s), ' +
        resultado.resumo.categorias + ' categoria(s).';
    }
    return texto;
  });
}

/** Recalcula campos derivados e painel. */
function menuRecalcularTudo() {
  _executarAcaoDeMenu('menuRecalcularTudo', function () {
    recalcularTudo();
    return 'Campos calculados, orcamentos e painel atualizados.';
  });
}

/** Cria dados de exemplo. */
function menuCriarDadosExemplo() {
  _executarAcaoDeMenu('menuCriarDadosExemplo', function () {
    var resultado = criarDadosExemplo();
    atualizarDashboard();
    return resultado.mensagem;
  });
}

/** Remove dados de exemplo. */
function menuRemoverDadosExemplo() {
  _executarAcaoDeMenu('menuRemoverDadosExemplo', function () {
    if (!_confirmar('Remover todos os lancamentos, movimentos e a meta marcados como EXEMPLO?')) {
      return 'Operacao cancelada.';
    }
    var resultado = removerDadosExemplo();
    atualizarDashboard();
    return resultado.mensagem;
  });
}

/** Cria um backup da planilha. */
function menuBackup() {
  _executarAcaoDeMenu('menuBackup', function () {
    var resultado = exportarBackup();
    return resultado.mensagem + (resultado.url ? '\n\n' + resultado.url : '');
  });
}

/** Executa a bateria de testes. */
function menuExecutarTestes() {
  _executarAcaoDeMenu('menuExecutarTestes', function () {
    if (!_confirmar('Rodar os testes automatizados?\n' +
        'Eles criam e removem dados marcados como TESTE na propria planilha.')) {
      return 'Operacao cancelada.';
    }
    var resultado = executarTodosOsTestes();
    return resultado.resumo + '\n\n' + resultado.detalhes.join('\n');
  });
}

// ===========================================================================
// FUNCOES EXPOSTAS PARA A SIDEBAR (google.script.run)
// ===========================================================================

/**
 * Inclui um arquivo HTML dentro de outro (usado pelo template da sidebar).
 * @param {string} nomeArquivo
 * @return {string}
 */
function incluirHtml(nomeArquivo) {
  return HtmlService.createHtmlOutputFromFile(nomeArquivo).getContent();
}

/**
 * Envelopa uma chamada da sidebar em um resultado padronizado.
 * @param {string} nome
 * @param {function(): *} acao
 * @return {{sucesso: boolean, dados: *, mensagem: string}}
 * @private
 */
function _respostaSidebar(nome, acao) {
  try {
    var dados = acao();
    return { sucesso: true, dados: dados, mensagem: '' };
  } catch (e) {
    logErro(nome, 'Erro em chamada da sidebar', e.message);
    return { sucesso: false, dados: null, mensagem: e.message };
  }
}

/**
 * Estado completo para a sidebar: KPIs, metas, categorias e sugestoes.
 * @param {string=} mes
 * @return {Object}
 */
function uiObterEstado(mes) {
  return _respostaSidebar('uiObterEstado', function () {
    var ind = gerarIndicadores(mes);
    var insights = obterUltimosInsightsEmCache() || gerarInsightsAutomaticosSemIA(ind);

    return {
      mes: ind.mes,
      mesFormatado: ind.mesFormatado,
      kpis: {
        receitas: formatarMoeda(ind.receitas),
        despesas: formatarMoeda(ind.despesas),
        saldo: formatarMoeda(ind.saldo),
        saldoNegativo: ind.saldo < 0,
        taxaPoupanca: ind.taxaPoupanca,
        aportes: formatarMoeda(ind.totalAportado),
        resgates: formatarMoeda(ind.totalResgatado),
        totalMetas: formatarMoeda(ind.saldoTotalMetas),
        reservaSaldo: formatarMoeda(ind.reserva.saldo),
        reservaRecomendada: formatarMoeda(ind.reserva.valorRecomendado),
        coberturaReserva: ind.reserva.coberturaMeses,
        mesesRecomendados: ind.reserva.mesesRecomendados,
        reservaEmRisco: ind.reserva.abaixoDoRecomendado,
        progressoMedio: ind.progressoMedioMetas
      },
      metas: ind.metas,
      topCategorias: ind.topCategorias.map(function (c) {
        return { categoria: c.categoria, total: formatarMoeda(c.total) };
      }),
      alertas: ind.alertas,
      insights: insights,
      categoriasReceita: listarNomesCategorias(TIPOS_LANCAMENTO.RECEITA),
      categoriasDespesa: listarNomesCategorias(TIPOS_LANCAMENTO.DESPESA),
      recorrentes: _recorrentesParaInterface(),
      comprometimento: _comprometimentoParaInterface(),
      ultimosLancamentos: _lancamentosParaInterface({ limite: 25 }),
      statusIa: obterStatusIA(),
      atualizadoEm: formatarDataHora(new Date())
    };
  });
}

/**
 * Registra um lancamento vindo da sidebar.
 * @param {Object} payload
 * @return {Object}
 */
function uiRegistrarLancamento(payload) {
  return _respostaSidebar('uiRegistrarLancamento', function () {
    var dados = payload || {};
    var lancamento = registrarLancamento(dados);

    // "Repetir este lancamento": cria a regra a partir do que acabou de ser
    // lancado, comecando no proximo periodo (o deste mes ja foi feito agora).
    var recorrencia = null;
    if (dados.repetir) {
      try {
        recorrencia = criarRecorrenteAPartirDeLancamento(
          lancamento, parseInt(dados.frequencia_meses, 10) || 1);
      } catch (e) {
        // O lancamento ja foi gravado; a recorrencia e um extra.
        logErro('uiRegistrarLancamento', 'Lancamento salvo, recorrencia falhou', e.message);
        recorrencia = { erro: e.message };
      }
    }

    atualizarDashboard();
    return {
      id: lancamento.id_lancamento,
      texto: lancamento.tipo + ' de ' + formatarMoeda(lancamento.valor) +
             ' em ' + formatarData(lancamento.data) + ' (' + lancamento.categoria + ')',
      recorrencia: recorrencia
        ? (recorrencia.erro
            ? { erro: recorrencia.erro }
            : { id: recorrencia.id_recorrente, resumo: recorrencia.resumo })
        : null
    };
  });
}

/**
 * Cria uma meta a partir da sidebar.
 * @param {Object} payload
 * @return {Object}
 */
function uiCriarMeta(payload) {
  return _respostaSidebar('uiCriarMeta', function () {
    var meta = criarMeta(payload);
    atualizarDashboard();
    return { id: meta.id_meta, nome: meta.nome };
  });
}

/**
 * Aporta ou resgata a partir da sidebar.
 * @param {Object} payload {metaId, valor, data, descricao, operacao}
 * @return {Object}
 */
function uiMovimentarMeta(payload) {
  return _respostaSidebar('uiMovimentarMeta', function () {
    var dados = payload || {};
    var operacao = String(dados.operacao || 'APORTE').toUpperCase();
    var resultado = (operacao === 'RESGATE')
      ? resgatarDaMeta(dados.metaId, dados.valor, dados.data, dados.descricao)
      : aportarEmMeta(dados.metaId, dados.valor, dados.data, dados.descricao);

    atualizarDashboard();
    return {
      saldo: formatarMoeda(resultado.saldoAtual),
      progresso: resultado.progressoPercentual,
      nome: resultado.meta ? resultado.meta.nome : ''
    };
  });
}

/**
 * Simula uma meta a partir da sidebar.
 * @param {Object} payload {metaId, aporteSimulado, mesesProjecao}
 * @return {Object}
 */
function uiSimularMeta(payload) {
  return _respostaSidebar('uiSimularMeta', function () {
    var dados = payload || {};
    var meta = obterMeta(dados.metaId);
    if (!meta) throw new Error('Meta nao encontrada.');

    var simulacao = simularMeta({
      saldoAtual: meta.saldoAtual,
      valorAlvo: meta.valor_alvo,
      aporteMensal: meta.aporte_mensal_planejado,
      aporteSimulado: dados.aporteSimulado,
      taxaMensal: meta.taxaMensalEfetiva,
      dataPrazo: meta.data_prazo,
      mesesProjecao: dados.mesesProjecao
    });

    return {
      nome: meta.nome,
      saldo: formatarMoeda(simulacao.saldoAtual),
      alvo: formatarMoeda(simulacao.valorAlvo),
      faltante: formatarMoeda(simulacao.valorFaltante),
      progresso: simulacao.progressoPercentual,
      mensagemPrazo: simulacao.mensagemPrazo,
      dataPrevista: simulacao.dataPrevistaFormatada || '',
      projecaoMeses: simulacao.projecao.meses,
      projecaoValor: formatarMoeda(simulacao.projecao.valorFuturo),
      cenario: simulacao.cenarioSimulado ? {
        aporte: formatarMoeda(simulacao.cenarioSimulado.aporteMensal),
        mensagem: simulacao.cenarioSimulado.mensagem,
        comparativo: simulacao.cenarioSimulado.mensagemComparativa || '',
        valorFuturo: formatarMoeda(simulacao.cenarioSimulado.valorFuturo)
      } : null,
      prazo: simulacao.prazo ? {
        data: simulacao.prazo.dataFormatada,
        mensagem: simulacao.prazo.mensagem
      } : null,
      alertas: simulacao.alertas
    };
  });
}

/**
 * Gera insights sob demanda a partir da sidebar.
 * @return {Object}
 */
function uiGerarInsights() {
  return _respostaSidebar('uiGerarInsights', function () {
    var insights = gerarInsightsIA({ forcar: true });
    atualizarDashboard();
    return insights;
  });
}

/**
 * Atualiza o painel a partir da sidebar.
 * @return {Object}
 */
function uiAtualizarDashboard() {
  return _respostaSidebar('uiAtualizarDashboard', function () {
    var ind = atualizarDashboard();
    return { mes: ind.mesFormatado };
  });
}

/**
 * Lista metas em formato leve para os seletores da sidebar.
 * @return {Object}
 */
function uiListarMetas() {
  return _respostaSidebar('uiListarMetas', function () {
    return listarMetas(false).map(function (m) {
      return {
        id: m.id_meta, nome: m.nome, tipo: m.tipo,
        saldo: formatarMoeda(m.saldoAtual),
        progresso: m.progressoPercentual
      };
    });
  });
}

// ===========================================================================
// SIDEBAR - EXTRATO E RECORRENCIAS
// ===========================================================================

/**
 * Converte lancamentos para o formato leve consumido pela sidebar.
 * @param {Object=} filtros Repassados a listarLancamentos().
 * @return {Array<Object>}
 * @private
 */
function _lancamentosParaInterface(filtros) {
  return listarLancamentos(filtros || { limite: 25 }).map(function (l) {
    var origem = String(l.origem || '');
    return {
      id: l.id_lancamento,
      data: formatarData(l.data),
      dataIso: Utilities.formatDate(
        converterParaData(l.data) || new Date(), obterFusoHorario(), 'yyyy-MM-dd'),
      tipo: String(l.tipo || ''),
      valor: formatarMoeda(paraNumero(l.valor) || 0),
      valorNumerico: arredondar2(paraNumero(l.valor) || 0),
      categoria: String(l.categoria || ''),
      descricao: String(l.descricao || ''),
      status: String(l.status || ''),
      cancelado: String(l.status || '').toUpperCase() === STATUS_LANCAMENTO.CANCELADO,
      // Espelhos de meta e ocorrencias recorrentes sao somente leitura aqui.
      editavel: origem.indexOf('META:') !== 0,
      origem: origem
    };
  });
}

/**
 * Converte recorrencias para o formato leve da sidebar.
 * @return {Array<Object>}
 * @private
 */
function _recorrentesParaInterface() {
  return listarRecorrentes(true).map(function (r) {
    return {
      id: r.id_recorrente,
      descricao: String(r.descricao || ''),
      tipo: String(r.tipo || ''),
      valor: formatarMoeda(r.valorNumerico),
      categoria: String(r.categoria || ''),
      meta: r.nomeMeta,
      diaDoMes: paraNumero(r.dia_do_mes) || 1,
      frequencia: r.frequenciaTexto,
      frequenciaMeses: parseInt(paraNumero(r.frequencia_meses), 10) || 1,
      proxima: formatarData(r.proxima_geracao),
      totalGerado: paraNumero(r.total_gerado) || 0,
      ativa: r.ativa
    };
  });
}

/**
 * Comprometimento mensal formatado para exibicao.
 * @return {Object}
 * @private
 */
function _comprometimentoParaInterface() {
  var totais = calcularComprometimentoMensal();
  return {
    receitas: formatarMoeda(totais.receitas),
    despesas: formatarMoeda(totais.despesas),
    aportes: formatarMoeda(totais.aportes),
    liquido: formatarMoeda(totais.liquidoMensal),
    liquidoNegativo: totais.liquidoMensal < 0,
    quantidade: totais.quantidade
  };
}

/**
 * Lista lancamentos para a aba Extrato.
 * @param {Object=} filtros {mes, tipo, categoria, limite, incluirCancelados}
 * @return {Object}
 */
function uiListarLancamentos(filtros) {
  return _respostaSidebar('uiListarLancamentos', function () {
    var f = filtros || {};
    return _lancamentosParaInterface({
      mes: f.mes || null,
      tipo: f.tipo || null,
      categoria: f.categoria || null,
      incluirCancelados: f.incluirCancelados !== false,
      limite: parseInt(f.limite, 10) || 25
    });
  });
}

/**
 * Edita um lancamento a partir da sidebar.
 * @param {Object} payload {id, data, tipo, valor, categoria, descricao}
 * @return {Object}
 */
function uiEditarLancamento(payload) {
  return _respostaSidebar('uiEditarLancamento', function () {
    var dados = payload || {};
    if (!dados.id) throw new Error('Lancamento nao informado.');

    var atualizado = editarLancamento(dados.id, {
      data: dados.data,
      tipo: dados.tipo,
      valor: dados.valor,
      categoria: dados.categoria,
      descricao: dados.descricao
    });

    atualizarDashboard();
    return {
      id: atualizado.id_lancamento,
      texto: formatarData(atualizado.data) + ' - ' + atualizado.tipo + ' - ' +
             formatarMoeda(paraNumero(atualizado.valor) || 0) + ' - ' +
             atualizado.categoria
    };
  });
}

/**
 * Exclui (cancela ou apaga) um lancamento a partir da sidebar.
 * @param {Object} payload {id, modo: 'SOFT'|'HARD', confirmacao: boolean}
 * @return {Object}
 */
function uiExcluirLancamento(payload) {
  return _respostaSidebar('uiExcluirLancamento', function () {
    var dados = payload || {};
    if (!dados.id) throw new Error('Lancamento nao informado.');

    var resultado = excluirLancamento(dados.id, dados.modo || 'SOFT',
                                      dados.confirmacao === true);
    atualizarDashboard();
    return resultado;
  });
}

/**
 * Reativa um lancamento cancelado (volta para CONFIRMADO).
 * @param {Object} payload {id}
 * @return {Object}
 */
function uiReativarLancamento(payload) {
  return _respostaSidebar('uiReativarLancamento', function () {
    var dados = payload || {};
    if (!dados.id) throw new Error('Lancamento nao informado.');

    var atualizado = editarLancamento(dados.id, { status: STATUS_LANCAMENTO.CONFIRMADO });
    atualizarDashboard();
    return { id: atualizado.id_lancamento, status: atualizado.status };
  });
}

/**
 * Lista as recorrencias para a sidebar.
 * @return {Object}
 */
function uiListarRecorrentes() {
  return _respostaSidebar('uiListarRecorrentes', function () {
    return {
      regras: _recorrentesParaInterface(),
      comprometimento: _comprometimentoParaInterface()
    };
  });
}

/**
 * Cria uma recorrencia a partir da sidebar.
 * @param {Object} payload
 * @return {Object}
 */
function uiCriarRecorrente(payload) {
  return _respostaSidebar('uiCriarRecorrente', function () {
    var regra = criarRecorrente(payload);
    return { id: regra.id_recorrente, resumo: regra.resumo };
  });
}

/**
 * Ativa ou desativa uma recorrencia.
 * @param {Object} payload {id, ativa}
 * @return {Object}
 */
function uiAlternarRecorrente(payload) {
  return _respostaSidebar('uiAlternarRecorrente', function () {
    var dados = payload || {};
    if (!dados.id) throw new Error('Recorrencia nao informada.');

    var regra = dados.ativa
      ? ativarRecorrente(dados.id)
      : desativarRecorrente(dados.id);
    return { id: regra.id_recorrente, ativa: regra.ativa };
  });
}

/**
 * Exclui uma recorrencia a partir da sidebar.
 * @param {Object} payload {id, modo}
 * @return {Object}
 */
function uiExcluirRecorrente(payload) {
  return _respostaSidebar('uiExcluirRecorrente', function () {
    var dados = payload || {};
    if (!dados.id) throw new Error('Recorrencia nao informada.');
    return excluirRecorrente(dados.id, dados.modo || 'SOFT');
  });
}

/**
 * Gera as ocorrencias recorrentes vencidas, sob demanda.
 * @param {Object=} payload {idRecorrente}
 * @return {Object}
 */
function uiGerarRecorrentes(payload) {
  return _respostaSidebar('uiGerarRecorrentes', function () {
    var dados = payload || {};
    var resultado = gerarLancamentosRecorrentes({ idRecorrente: dados.idRecorrente });
    if (resultado.criados > 0) atualizarDashboard();
    return resultado;
  });
}
