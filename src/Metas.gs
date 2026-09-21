/**
 * Metas.gs
 * ---------------------------------------------------------------------------
 * CRUD de metas ("caixinhas"), aportes, resgates e ajustes.
 *
 * DECISAO DE ARQUITETURA
 * A fonte de verdade do saldo de uma meta e a aba Metas_Movimentos:
 *   saldo = saldo_inicial + APORTES + AJUSTE_POSITIVO - RESGATES - AJUSTE_NEGATIVO
 * A aba Lancamentos recebe um espelho (APORTE_META / RESGATE_META) apenas para
 * manter o extrato unico e cronologico do usuario. Os indicadores sabem disso e
 * NUNCA somam esses tipos como receita/despesa, evitando contagem dupla.
 */

// ===========================================================================
// LEITURA
// ===========================================================================

/**
 * Calcula o saldo de todas as metas em uma unica varredura dos movimentos.
 * @return {Object<string, {saldo: number, aportes: number, resgates: number,
 *                          ajustes: number, movimentos: number}>}
 */
function calcularSaldosDeTodasAsMetas() {
  var movimentos = lerTabela(ABAS.METAS_MOVIMENTOS).linhas;
  var porMeta = {};

  movimentos.forEach(function (mov) {
    var idMeta = String(mov.meta_id || '').trim();
    if (!idMeta) return;
    if (!porMeta[idMeta]) {
      porMeta[idMeta] = {
        saldo: 0, aportes: 0, resgates: 0, ajustes: 0, movimentos: 0
      };
    }
    var valor = paraNumero(mov.valor);
    if (isNaN(valor)) valor = 0;
    var tipo = String(mov.tipo_movimento || '').trim().toUpperCase();
    var dados = porMeta[idMeta];
    dados.movimentos++;

    switch (tipo) {
      case TIPOS_MOVIMENTO_META.APORTE:
        dados.saldo += valor; dados.aportes += valor; break;
      case TIPOS_MOVIMENTO_META.RESGATE:
        dados.saldo -= valor; dados.resgates += valor; break;
      case TIPOS_MOVIMENTO_META.AJUSTE_POSITIVO:
        dados.saldo += valor; dados.ajustes += valor; break;
      case TIPOS_MOVIMENTO_META.AJUSTE_NEGATIVO:
        dados.saldo -= valor; dados.ajustes -= valor; break;
      default:
        // Tipo desconhecido: ignora o efeito, mas deixa registrado no log.
        logAviso('calcularSaldosDeTodasAsMetas',
                 'Tipo de movimento desconhecido ignorado',
                 { id_movimento: mov.id_movimento, tipo: tipo });
    }
  });

  Object.keys(porMeta).forEach(function (id) {
    var d = porMeta[id];
    d.saldo = arredondar2(d.saldo);
    d.aportes = arredondar2(d.aportes);
    d.resgates = arredondar2(d.resgates);
    d.ajustes = arredondar2(d.ajustes);
  });
  return porMeta;
}

/**
 * Lista metas com campos calculados anexados.
 * @param {boolean=} incluirInativas Padrao false.
 * @return {Array<Object>} Metas com saldoAtual, progresso, faltante e previsao.
 */
function listarMetas(incluirInativas) {
  var tabela = lerTabela(ABAS.METAS);
  var saldos = calcularSaldosDeTodasAsMetas();
  var taxaPadrao = obterConfigNumero('taxa_mensal_padrao', 0);

  return tabela.linhas
    .filter(function (meta) {
      if (!String(meta.id_meta || '').trim()) return false;
      if (incluirInativas) return true;
      return String(meta.status || '').toUpperCase() !== STATUS_META.INATIVA;
    })
    .map(function (meta) {
      return _enriquecerMeta(meta, saldos, taxaPadrao);
    });
}

/**
 * Anexa os campos calculados a um registro bruto de meta.
 * @param {Object} meta Linha bruta da aba Metas.
 * @param {Object} saldos Mapa vindo de calcularSaldosDeTodasAsMetas().
 * @param {number} taxaPadrao Taxa mensal padrao do sistema.
 * @return {Object}
 * @private
 */
function _enriquecerMeta(meta, saldos, taxaPadrao) {
  var id = String(meta.id_meta || '').trim();
  var saldoInicial = paraNumero(meta.saldo_inicial);
  if (isNaN(saldoInicial)) saldoInicial = 0;

  var dadosMovimento = saldos[id] || { saldo: 0, aportes: 0, resgates: 0, ajustes: 0, movimentos: 0 };
  var saldoAtual = arredondar2(saldoInicial + dadosMovimento.saldo);

  var alvo = paraNumero(meta.valor_alvo);
  if (isNaN(alvo)) alvo = 0;
  var aporte = paraNumero(meta.aporte_mensal_planejado);
  if (isNaN(aporte)) aporte = 0;

  var taxa = paraNumero(meta.taxa_mensal_personalizada);
  if (isNaN(taxa) || String(meta.taxa_mensal_personalizada || '').trim() === '') {
    taxa = taxaPadrao;
  }

  var previsao = calcularMesesParaMeta(saldoAtual, alvo, aporte, taxa);

  meta.saldoAtual = saldoAtual;
  meta.totalAportado = dadosMovimento.aportes;
  meta.totalResgatado = dadosMovimento.resgates;
  meta.totalAjustes = dadosMovimento.ajustes;
  meta.quantidadeMovimentos = dadosMovimento.movimentos;
  meta.taxaMensalEfetiva = taxa;
  meta.progressoPercentual = calcularProgressoMeta(saldoAtual, alvo);
  meta.valorFaltante = arredondar2(Math.max(alvo - saldoAtual, 0));
  meta.mesesRestantes = previsao.meses;
  meta.previsaoAtingivel = previsao.atingivel;
  meta.mensagemPrevisao = previsao.mensagem;
  return meta;
}

/**
 * Obtem uma meta (ativa ou inativa) com campos calculados.
 * @param {string} metaId
 * @return {Object|null}
 */
function obterMeta(metaId) {
  var bruta = buscarPorId(ABAS.METAS, 'id_meta', metaId);
  if (!bruta) return null;
  return _enriquecerMeta(bruta, calcularSaldosDeTodasAsMetas(),
                         obterConfigNumero('taxa_mensal_padrao', 0));
}

/**
 * Retorna a meta do tipo RESERVA (a primeira ativa encontrada).
 * @return {Object|null}
 */
function obterMetaReserva() {
  var metas = listarMetas(true);
  var ativas = metas.filter(function (m) {
    return String(m.tipo || '').toUpperCase() === TIPOS_META.RESERVA &&
           String(m.status || '').toUpperCase() !== STATUS_META.INATIVA;
  });
  if (ativas.length) return ativas[0];
  var qualquer = metas.filter(function (m) {
    return String(m.tipo || '').toUpperCase() === TIPOS_META.RESERVA;
  });
  return qualquer.length ? qualquer[0] : null;
}

/**
 * Saldo atual de uma meta.
 * @param {string} metaId
 * @return {number}
 */
function calcularSaldoMeta(metaId) {
  var meta = obterMeta(metaId);
  return meta ? meta.saldoAtual : 0;
}

/**
 * Valor recomendado para a reserva de emergencia:
 *   despesa media mensal x meses configurados.
 * @return {{valorRecomendado: number, despesaMedia: number, meses: number,
 *           baseMeses: number}}
 */
function sugerirValorReserva() {
  var mesesReserva = obterConfigNumero('meta_meses_reserva', 6);
  var baseMeses = obterConfigNumero('meses_base_despesa_media', 6);
  var despesaMedia = calcularDespesaMediaMensal(baseMeses);
  return {
    valorRecomendado: arredondar2(despesaMedia * mesesReserva),
    despesaMedia: despesaMedia,
    meses: mesesReserva,
    baseMeses: baseMeses
  };
}

// ===========================================================================
// CRUD
// ===========================================================================

/**
 * Cria uma nova meta.
 * @param {Object} payload
 *   {string} nome (obrigatorio)
 *   {number} valor_alvo (obrigatorio, exceto RESERVA com alvo automatico)
 *   {string=} tipo META|RESERVA (padrao META)
 *   {number=} saldo_inicial
 *   {number=} aporte_mensal_planejado
 *   {Date|string=} data_inicio
 *   {Date|string=} data_prazo
 *   {number=} taxa_mensal_personalizada
 *   {string=} cor
 *   {string=} descricao
 * @return {Object} Meta criada (com campos calculados).
 */
function criarMeta(payload) {
  return comLock(function () {
    var dados = payload || {};
    var nome = String(dados.nome || '').trim();
    if (!nome) throw new Error('Informe um nome para a meta.');

    var tipo = String(dados.tipo || TIPOS_META.META).trim().toUpperCase();
    if (tipo !== TIPOS_META.META && tipo !== TIPOS_META.RESERVA) {
      throw new Error('Tipo de meta invalido. Use META ou RESERVA.');
    }

    // Nome duplicado entre metas ativas atrapalha a leitura do painel.
    var existentes = listarMetas(true);
    var duplicada = existentes.filter(function (m) {
      return normalizarTexto(m.nome) === normalizarTexto(nome) &&
             String(m.status || '').toUpperCase() !== STATUS_META.INATIVA;
    });
    if (duplicada.length) {
      throw new Error('Ja existe uma meta ativa chamada "' + nome + '".');
    }

    // Alvo: obrigatorio, mas a RESERVA pode calcular sozinha.
    var alvo = paraNumero(dados.valor_alvo);
    if (isNaN(alvo) || alvo <= 0) {
      if (tipo === TIPOS_META.RESERVA) {
        var sugestao = sugerirValorReserva();
        alvo = sugestao.valorRecomendado;
        if (!alvo || alvo <= 0) {
          // Ainda nao ha historico de despesas: usa um alvo simbolico editavel.
          alvo = obterConfigNumero('valor_alvo_reserva_inicial', 1000);
        }
      } else {
        throw new Error('Informe um valor alvo maior que zero para a meta.');
      }
    }
    alvo = arredondar2(alvo);

    var saldoInicial = paraNumero(dados.saldo_inicial);
    if (isNaN(saldoInicial) || saldoInicial < 0) saldoInicial = 0;

    var aporteMensal = paraNumero(dados.aporte_mensal_planejado);
    if (isNaN(aporteMensal) || aporteMensal < 0) aporteMensal = 0;

    var dataInicio = converterParaData(dados.data_inicio) || new Date();
    var dataPrazo = converterParaData(dados.data_prazo);
    if (dataPrazo && dataPrazo < dataInicio) {
      throw new Error('A data limite nao pode ser anterior a data de inicio.');
    }

    var taxa = paraNumero(dados.taxa_mensal_personalizada);
    var taxaFinal = (isNaN(taxa) || String(dados.taxa_mensal_personalizada || '').trim() === '')
      ? '' : taxa;

    var agora = new Date();
    var id = gerarId(PREFIXOS_ID.META);

    adicionarLinha(ABAS.METAS, {
      id_meta: id,
      nome: nome,
      tipo: tipo,
      valor_alvo: alvo,
      saldo_inicial: arredondar2(saldoInicial),
      aporte_mensal_planejado: arredondar2(aporteMensal),
      data_inicio: dataInicio,
      data_prazo: dataPrazo || '',
      status: STATUS_META.ATIVA,
      taxa_mensal_personalizada: taxaFinal,
      cor: String(dados.cor || _corPadraoParaTipo(tipo)),
      descricao: String(dados.descricao || ''),
      criada_em: agora,
      atualizada_em: agora
    });

    // Saldo inicial vira um movimento de ajuste, para o extrato ficar completo.
    if (saldoInicial > 0) {
      logInfo('criarMeta', 'Meta criada com saldo inicial',
              { id_meta: id, saldo_inicial: saldoInicial });
    }

    logInfo('criarMeta', 'Meta criada: ' + nome, { id_meta: id, tipo: tipo, alvo: alvo });
    atualizarCamposCalculadosMetas();
    return obterMeta(id);
  });
}

/**
 * Cor padrao por tipo de meta (usada na sidebar e na formatacao).
 * @param {string} tipo
 * @return {string}
 * @private
 */
function _corPadraoParaTipo(tipo) {
  return tipo === TIPOS_META.RESERVA ? '#c0392b' : '#1f6feb';
}

/**
 * Edita campos de uma meta existente. Campos ausentes sao preservados.
 * @param {string} metaId
 * @param {Object} payload Campos a alterar.
 * @return {Object} Meta atualizada.
 */
function editarMeta(metaId, payload) {
  return comLock(function () {
    var meta = buscarPorId(ABAS.METAS, 'id_meta', metaId);
    if (!meta) throw new Error('Meta nao encontrada: ' + metaId);
    var dados = payload || {};
    var campos = {};

    if (dados.nome !== undefined && String(dados.nome).trim() !== '') {
      campos.nome = String(dados.nome).trim();
    }
    if (dados.tipo !== undefined && String(dados.tipo).trim() !== '') {
      var tipo = String(dados.tipo).trim().toUpperCase();
      if (tipo !== TIPOS_META.META && tipo !== TIPOS_META.RESERVA) {
        throw new Error('Tipo de meta invalido. Use META ou RESERVA.');
      }
      campos.tipo = tipo;
    }
    if (dados.valor_alvo !== undefined && String(dados.valor_alvo).trim() !== '') {
      var alvo = paraNumero(dados.valor_alvo);
      if (isNaN(alvo) || alvo <= 0) throw new Error('Valor alvo deve ser maior que zero.');
      campos.valor_alvo = arredondar2(alvo);
    }
    if (dados.saldo_inicial !== undefined && String(dados.saldo_inicial).trim() !== '') {
      var saldoInicial = paraNumero(dados.saldo_inicial);
      if (isNaN(saldoInicial) || saldoInicial < 0) {
        throw new Error('Saldo inicial invalido.');
      }
      campos.saldo_inicial = arredondar2(saldoInicial);
    }
    if (dados.aporte_mensal_planejado !== undefined &&
        String(dados.aporte_mensal_planejado).trim() !== '') {
      var aporte = paraNumero(dados.aporte_mensal_planejado);
      if (isNaN(aporte) || aporte < 0) throw new Error('Aporte mensal invalido.');
      campos.aporte_mensal_planejado = arredondar2(aporte);
    }
    if (dados.data_inicio !== undefined && String(dados.data_inicio).trim() !== '') {
      var inicio = converterParaData(dados.data_inicio);
      if (!inicio) throw new Error('Data de inicio invalida.');
      campos.data_inicio = inicio;
    }
    if (dados.data_prazo !== undefined) {
      if (String(dados.data_prazo).trim() === '') {
        campos.data_prazo = '';
      } else {
        var prazo = converterParaData(dados.data_prazo);
        if (!prazo) throw new Error('Data limite invalida.');
        campos.data_prazo = prazo;
      }
    }
    if (dados.taxa_mensal_personalizada !== undefined) {
      if (String(dados.taxa_mensal_personalizada).trim() === '') {
        campos.taxa_mensal_personalizada = '';
      } else {
        var taxa = paraNumero(dados.taxa_mensal_personalizada);
        if (isNaN(taxa)) throw new Error('Taxa mensal invalida.');
        campos.taxa_mensal_personalizada = taxa;
      }
    }
    if (dados.status !== undefined && String(dados.status).trim() !== '') {
      var status = String(dados.status).trim().toUpperCase();
      if ([STATUS_META.ATIVA, STATUS_META.INATIVA, STATUS_META.CONCLUIDA]
          .indexOf(status) === -1) {
        throw new Error('Status invalido. Use ATIVA, INATIVA ou CONCLUIDA.');
      }
      campos.status = status;
    }
    if (dados.cor !== undefined) campos.cor = String(dados.cor);
    if (dados.descricao !== undefined) campos.descricao = String(dados.descricao);

    if (!Object.keys(campos).length) {
      throw new Error('Nenhum campo valido para atualizar.');
    }
    campos.atualizada_em = new Date();

    atualizarLinhaPorNumero(ABAS.METAS, meta._linha, campos);
    logInfo('editarMeta', 'Meta atualizada', { id_meta: metaId, campos: Object.keys(campos) });
    atualizarCamposCalculadosMetas();
    return obterMeta(metaId);
  });
}

/**
 * Reativa uma meta.
 * @param {string} metaId
 * @return {Object}
 */
function ativarMeta(metaId) {
  return editarMeta(metaId, { status: STATUS_META.ATIVA });
}

/**
 * Desativa uma meta (soft delete). Historico preservado.
 * @param {string} metaId
 * @return {Object}
 */
function desativarMeta(metaId) {
  return editarMeta(metaId, { status: STATUS_META.INATIVA });
}

/**
 * Exclui uma meta.
 *
 * modo = 'SOFT' (padrao): apenas marca como INATIVA. Nada e perdido.
 * modo = 'HARD': remove a linha da aba Metas. Exige que a meta nao possua
 *                movimentos; se possuir, o chamador precisa passar
 *                confirmacaoTotal = true, e ainda assim os movimentos e
 *                lancamentos NAO sao apagados (ficam orfaos, mas auditaveis).
 *
 * @param {string} metaId
 * @param {string=} modo 'SOFT' | 'HARD'
 * @param {boolean=} confirmacaoTotal Confirmacao explicita para HARD com historico.
 * @return {{sucesso: boolean, modo: string, mensagem: string}}
 */
function excluirMeta(metaId, modo, confirmacaoTotal) {
  return comLock(function () {
    var meta = buscarPorId(ABAS.METAS, 'id_meta', metaId);
    if (!meta) throw new Error('Meta nao encontrada: ' + metaId);

    var modoFinal = String(modo || 'SOFT').trim().toUpperCase();
    var saldos = calcularSaldosDeTodasAsMetas();
    var dados = saldos[String(meta.id_meta).trim()] || { movimentos: 0, saldo: 0 };

    if (modoFinal !== 'HARD') {
      atualizarLinhaPorNumero(ABAS.METAS, meta._linha, {
        status: STATUS_META.INATIVA,
        atualizada_em: new Date()
      });
      logInfo('excluirMeta', 'Meta desativada (soft delete)', { id_meta: metaId });
      atualizarCamposCalculadosMetas();
      return {
        sucesso: true, modo: 'SOFT',
        mensagem: 'Meta desativada. O historico foi preservado e ela pode ser reativada.'
      };
    }

    // A partir daqui e exclusao definitiva da linha da meta.
    if (dados.movimentos > 0 && !confirmacaoTotal) {
      throw new Error(
        'Esta meta possui ' + dados.movimentos + ' movimento(s) registrado(s). ' +
        'A exclusao definitiva exige confirmacao explicita. ' +
        'Recomendado: desativar a meta em vez de excluir.');
    }

    // Salvaguarda: guarda um retrato da meta no log antes de sumir com a linha.
    logAviso('excluirMeta', 'Exclusao definitiva de meta (backup no log)', {
      id_meta: meta.id_meta,
      nome: meta.nome,
      tipo: meta.tipo,
      valor_alvo: meta.valor_alvo,
      saldo_inicial: meta.saldo_inicial,
      movimentos: dados.movimentos,
      saldo_movimentos: dados.saldo
    });

    removerLinhaPorId(ABAS.METAS, 'id_meta', metaId);
    atualizarCamposCalculadosMetas();
    return {
      sucesso: true, modo: 'HARD',
      mensagem: 'Meta excluida. Os movimentos e lancamentos historicos foram mantidos ' +
                'para auditoria e um retrato da meta ficou na aba Logs.'
    };
  });
}

// ===========================================================================
// APORTES, RESGATES E AJUSTES
// ===========================================================================

/**
 * Registra um aporte em uma meta.
 * @param {string} metaId
 * @param {number} valor
 * @param {Date|string=} data Padrao hoje.
 * @param {string=} descricao
 * @param {string=} origem Padrao 'MANUAL'.
 * @return {{id_movimento: string, id_lancamento: string, saldoAtual: number,
 *           progressoPercentual: number, meta: Object}}
 */
function aportarEmMeta(metaId, valor, data, descricao, origem) {
  return comLock(function () {
    return _movimentarMeta(metaId, valor, data, descricao,
                           TIPOS_MOVIMENTO_META.APORTE, origem);
  });
}

/**
 * Registra um resgate de uma meta.
 * @param {string} metaId
 * @param {number} valor
 * @param {Date|string=} data
 * @param {string=} descricao
 * @param {string=} origem
 * @return {Object}
 */
function resgatarDaMeta(metaId, valor, data, descricao, origem) {
  return comLock(function () {
    return _movimentarMeta(metaId, valor, data, descricao,
                           TIPOS_MOVIMENTO_META.RESGATE, origem);
  });
}

/**
 * Ajuste manual de saldo (ex.: rendimento creditado, correcao de erro).
 * @param {string} metaId
 * @param {number} valor Sempre positivo; o sentido vem de `positivo`.
 * @param {boolean} positivo true = AJUSTE_POSITIVO, false = AJUSTE_NEGATIVO.
 * @param {string=} descricao
 * @return {Object}
 */
function ajustarSaldoMeta(metaId, valor, positivo, descricao) {
  return comLock(function () {
    var tipo = positivo
      ? TIPOS_MOVIMENTO_META.AJUSTE_POSITIVO
      : TIPOS_MOVIMENTO_META.AJUSTE_NEGATIVO;
    return _movimentarMeta(metaId, valor, new Date(),
                           descricao || 'Ajuste manual de saldo', tipo, 'AJUSTE');
  });
}

/**
 * Nucleo comum de aporte/resgate/ajuste. NAO usa lock: quem chama e responsavel.
 * @param {string} metaId
 * @param {number} valor
 * @param {Date|string} data
 * @param {string} descricao
 * @param {string} tipoMovimento
 * @param {string=} origem
 * @return {Object}
 * @private
 */
function _movimentarMeta(metaId, valor, data, descricao, tipoMovimento, origem) {
  var metaBruta = buscarPorId(ABAS.METAS, 'id_meta', metaId);
  if (!metaBruta) throw new Error('Meta nao encontrada: ' + metaId);

  var status = String(metaBruta.status || '').toUpperCase();
  if (status === STATUS_META.INATIVA) {
    throw new Error('A meta "' + metaBruta.nome + '" esta inativa. Reative-a antes de movimentar.');
  }

  var valorValidado = validarValorMonetario(valor);
  var dataMovimento = converterParaData(data) || new Date();
  if (!_dataDentroDeLimitesRazoaveis(dataMovimento)) {
    throw new Error('Data do movimento fora de um intervalo plausivel.');
  }

  var saidas = [TIPOS_MOVIMENTO_META.RESGATE, TIPOS_MOVIMENTO_META.AJUSTE_NEGATIVO];
  if (saidas.indexOf(tipoMovimento) !== -1) {
    var permitirNegativo = obterConfigBooleano('permitir_saldo_negativo_meta', false);
    var saldoAtual = calcularSaldoMeta(metaId);
    if (!permitirNegativo && valorValidado > saldoAtual + 0.001) {
      throw new Error(
        'Saldo insuficiente na meta "' + metaBruta.nome + '". ' +
        'Saldo atual: ' + formatarMoeda(saldoAtual) +
        ', solicitado: ' + formatarMoeda(valorValidado) + '.');
    }
  }

  var agora = new Date();
  var idMovimento = gerarId(PREFIXOS_ID.MOVIMENTO);
  var textoDescricao = String(descricao || '').trim() ||
    (tipoMovimento === TIPOS_MOVIMENTO_META.APORTE ? 'Aporte na meta' : 'Movimento na meta');

  adicionarLinha(ABAS.METAS_MOVIMENTOS, {
    id_movimento: idMovimento,
    data: dataMovimento,
    meta_id: metaBruta.id_meta,
    tipo_movimento: tipoMovimento,
    valor: valorValidado,
    descricao: textoDescricao,
    origem: String(origem || 'MANUAL'),
    criado_em: agora
  });

  // Espelho no extrato geral, apenas para aporte e resgate.
  var idLancamento = '';
  var mapaEspelho = {};
  mapaEspelho[TIPOS_MOVIMENTO_META.APORTE] = TIPOS_LANCAMENTO.APORTE_META;
  mapaEspelho[TIPOS_MOVIMENTO_META.RESGATE] = TIPOS_LANCAMENTO.RESGATE_META;
  var tipoLancamento = mapaEspelho[tipoMovimento];

  if (tipoLancamento) {
    var categoriaReserva = String(obterConfig('categoria_reserva_padrao', 'Reserva'));
    var categoria = (String(metaBruta.tipo || '').toUpperCase() === TIPOS_META.RESERVA)
      ? categoriaReserva
      : String(obterConfig('categoria_metas_padrao', 'Investimentos'));

    var lancamento = _inserirLancamento({
      data: dataMovimento,
      tipo: tipoLancamento,
      valor: valorValidado,
      categoria: categoria,
      meta_id: metaBruta.id_meta,
      descricao: textoDescricao + ' - ' + metaBruta.nome,
      origem: 'META:' + idMovimento,
      status: 'CONFIRMADO'
    }, { permitirDuplicado: true });
    idLancamento = lancamento.id_lancamento;
  }

  logInfo('_movimentarMeta', tipoMovimento + ' registrado', {
    id_meta: metaBruta.id_meta, valor: valorValidado, id_movimento: idMovimento
  });

  var metaAtualizada = obterMeta(metaId);

  // Marca automaticamente como CONCLUIDA quando o alvo e alcancado.
  if (metaAtualizada && metaAtualizada.valorFaltante === 0 &&
      String(metaAtualizada.status).toUpperCase() === STATUS_META.ATIVA &&
      paraNumero(metaAtualizada.valor_alvo) > 0) {
    atualizarLinhaPorId(ABAS.METAS, 'id_meta', metaId, {
      status: STATUS_META.CONCLUIDA, atualizada_em: agora
    });
    metaAtualizada.status = STATUS_META.CONCLUIDA;
    logInfo('_movimentarMeta', 'Meta atingiu o valor alvo', { id_meta: metaId });
  }

  atualizarCamposCalculadosMetas();

  return {
    id_movimento: idMovimento,
    id_lancamento: idLancamento,
    saldoAtual: metaAtualizada ? metaAtualizada.saldoAtual : 0,
    progressoPercentual: metaAtualizada ? metaAtualizada.progressoPercentual : 0,
    meta: metaAtualizada
  };
}

/**
 * Lista os movimentos de uma meta, do mais recente para o mais antigo.
 * @param {string} metaId
 * @param {number=} limite Padrao 50.
 * @return {Array<Object>}
 */
function listarMovimentosDaMeta(metaId, limite) {
  var alvo = String(metaId || '').trim().toUpperCase();
  var movimentos = lerTabela(ABAS.METAS_MOVIMENTOS).linhas.filter(function (m) {
    return String(m.meta_id || '').trim().toUpperCase() === alvo;
  });
  movimentos.sort(function (a, b) {
    var da = converterParaData(a.data) || new Date(0);
    var db = converterParaData(b.data) || new Date(0);
    return db - da;
  });
  return movimentos.slice(0, limite || 50);
}

// ===========================================================================
// CAMPOS CALCULADOS NA ABA METAS
// ===========================================================================

/**
 * Regrava as colunas "campo_calculado_*" da aba Metas em uma unica escrita.
 * Mantem a planilha util mesmo para quem olha so a aba, sem abrir a sidebar.
 */
function atualizarCamposCalculadosMetas() {
  try {
    var aba = obterAbaSegura(ABAS.METAS);
    var tabela = lerTabela(ABAS.METAS);
    if (!tabela.linhas.length) return;

    var mapa = obterMapaCabecalhos(aba);
    var colunas = [
      'campo_calculado_saldo_atual',
      'campo_calculado_progresso_percentual',
      'campo_calculado_valor_faltante',
      'campo_calculado_previsao_meses_restantes'
    ];
    for (var c = 0; c < colunas.length; c++) {
      if (mapa[colunas[c]] === undefined) return; // planilha ainda sem setup
    }

    var saldos = calcularSaldosDeTodasAsMetas();
    var taxaPadrao = obterConfigNumero('taxa_mensal_padrao', 0);

    var primeiraColuna = mapa[colunas[0]] + 1;
    var contiguas = colunas.every(function (nome, indice) {
      return mapa[nome] === mapa[colunas[0]] + indice;
    });

    var valoresPorLinha = {};
    tabela.linhas.forEach(function (bruta) {
      var meta = _enriquecerMeta(bruta, saldos, taxaPadrao);
      valoresPorLinha[meta._linha] = [
        meta.saldoAtual,
        meta.progressoPercentual / 100, // gravado como fracao para formato %
        meta.valorFaltante,
        meta.mesesRestantes === null ? '' : meta.mesesRestantes
      ];
    });

    var linhas = Object.keys(valoresPorLinha).map(Number).sort(function (a, b) { return a - b; });
    if (!linhas.length) return;

    if (contiguas) {
      // Escrita em bloco unico: da primeira ate a ultima linha de meta.
      var inicio = linhas[0];
      var fim = linhas[linhas.length - 1];
      var bloco = [];
      for (var linha = inicio; linha <= fim; linha++) {
        bloco.push(valoresPorLinha[linha] || ['', '', '', '']);
      }
      aba.getRange(inicio, primeiraColuna, bloco.length, colunas.length).setValues(bloco);
    } else {
      // Layout alterado pelo usuario: cai para atualizacao por linha.
      linhas.forEach(function (numeroLinha) {
        var v = valoresPorLinha[numeroLinha];
        var campos = {};
        colunas.forEach(function (nome, indice) { campos[nome] = v[indice]; });
        atualizarLinhaPorNumero(ABAS.METAS, numeroLinha, campos);
      });
    }
  } catch (e) {
    logErro('atualizarCamposCalculadosMetas', 'Falha ao atualizar campos calculados', e.message);
  }
}

/**
 * Sanidade de datas: evita digitacao do tipo ano 0202 ou 9999.
 * @param {Date} data
 * @return {boolean}
 * @private
 */
function _dataDentroDeLimitesRazoaveis(data) {
  if (!data) return false;
  var ano = data.getFullYear();
  var anoAtual = new Date().getFullYear();
  return ano >= 1990 && ano <= anoAtual + 50;
}
