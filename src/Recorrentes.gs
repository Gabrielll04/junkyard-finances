/**
 * Recorrentes.gs
 * ---------------------------------------------------------------------------
 * Lancamentos recorrentes: o usuario cadastra uma regra ("aluguel, R$ 1.500,
 * todo dia 10") e o sistema gera as ocorrencias automaticamente.
 *
 * COMO A GERACAO E IDEMPOTENTE
 * Cada ocorrencia gerada carrega uma chave unica no campo `origem`:
 *     RECORRENTE:<id_recorrente>:<aaaa-MM>
 * Antes de gerar qualquer coisa, o sistema le todas as chaves ja existentes
 * (em Lancamentos E em Metas_Movimentos) e pula as que ja foram criadas.
 * Rodar a geracao dez vezes no mesmo dia produz o mesmo resultado que rodar
 * uma vez.
 *
 * TIPOS SUPORTADOS
 *  - RECEITA e DESPESA  -> viram lancamentos comuns;
 *  - APORTE_META        -> vira um movimento de meta de verdade (passa por
 *                          _movimentarMeta), preservando a invariante de que
 *                          o saldo da meta sempre vem de Metas_Movimentos.
 * RESGATE_META e TRANSFERENCIA ficam de fora de proposito: resgate recorrente
 * automatico e uma armadilha, e transferencia depende de contas, que ainda
 * nao existem como entidade.
 */

/** Tipos que podem ser recorrentes. */
var TIPOS_RECORRENTE = ['RECEITA', 'DESPESA', 'APORTE_META'];

/** Frequencias oferecidas, em meses. */
var FREQUENCIAS_RECORRENTE = {
  1: 'Mensal',
  2: 'Bimestral',
  3: 'Trimestral',
  6: 'Semestral',
  12: 'Anual'
};

/** Teto de ocorrencias avaliadas por regra, para nunca entrar em laco longo. */
var LIMITE_OCORRENCIAS_POR_REGRA = 600;

// ===========================================================================
// CRUD
// ===========================================================================

/**
 * Cria uma regra de recorrencia.
 *
 * @param {Object} payload
 *   {string} descricao          obrigatorio
 *   {string} tipo               RECEITA | DESPESA | APORTE_META
 *   {number} valor              obrigatorio, positivo
 *   {string=} categoria
 *   {string=} meta_id           obrigatorio para APORTE_META
 *   {number=} dia_do_mes        1..31 (padrao: dia da data de inicio)
 *   {number=} frequencia_meses  1, 2, 3, 6 ou 12 (padrao 1)
 *   {Date|string=} data_inicio  padrao hoje
 *   {Date|string=} data_fim     opcional
 *   {string=} observacoes
 * @return {Object} Regra criada, com os campos calculados.
 */
function criarRecorrente(payload) {
  return comLock(function () {
    var dados = payload || {};

    var descricao = String(dados.descricao || '').trim();
    if (!descricao) throw new Error('Informe uma descricao para a recorrencia.');

    var tipo = String(dados.tipo || '').trim().toUpperCase();
    if (TIPOS_RECORRENTE.indexOf(tipo) === -1) {
      throw new Error('Tipo invalido para recorrencia. Use: ' +
                      TIPOS_RECORRENTE.join(', ') + '.');
    }

    var valor = validarValorMonetario(dados.valor);

    var metaId = String(dados.meta_id || '').trim();
    if (tipo === 'APORTE_META') {
      if (!metaId) throw new Error('Recorrencia de aporte exige uma meta.');
      var meta = buscarPorId(ABAS.METAS, 'id_meta', metaId);
      if (!meta) throw new Error('Meta nao encontrada: ' + metaId);
      if (String(meta.status || '').toUpperCase() === STATUS_META.INATIVA) {
        throw new Error('A meta "' + meta.nome + '" esta inativa.');
      }
    } else if (metaId) {
      throw new Error('Apenas recorrencias do tipo APORTE_META podem ter meta.');
    }

    var dataInicio = converterParaData(dados.data_inicio) || new Date();
    var dataFim = converterParaData(dados.data_fim);
    if (dataFim && dataFim < dataInicio) {
      throw new Error('A data final nao pode ser anterior a data de inicio.');
    }

    var frequencia = parseInt(paraNumero(dados.frequencia_meses), 10);
    if (isNaN(frequencia) || frequencia <= 0) frequencia = 1;
    if (!FREQUENCIAS_RECORRENTE[frequencia]) {
      throw new Error('Frequencia invalida. Use 1, 2, 3, 6 ou 12 meses.');
    }

    var dia = parseInt(paraNumero(dados.dia_do_mes), 10);
    if (isNaN(dia) || dia < 1 || dia > 31) dia = dataInicio.getDate();

    var categoria = String(dados.categoria || '').trim();
    if (!categoria) {
      categoria = (tipo === 'APORTE_META')
        ? String(obterConfig('categoria_metas_padrao', 'Investimentos'))
        : 'Outros';
    }
    categoria = garantirCategoria(categoria, tipo);

    var agora = new Date();
    var id = gerarId(PREFIXOS_ID.RECORRENTE);

    adicionarLinha(ABAS.RECORRENTES, {
      id_recorrente: id,
      descricao: descricao,
      tipo: tipo,
      valor: valor,
      categoria: categoria,
      meta_id: metaId,
      dia_do_mes: dia,
      frequencia_meses: frequencia,
      data_inicio: dataInicio,
      data_fim: dataFim || '',
      ativo: 'SIM',
      ultima_geracao: '',
      proxima_geracao: _proximaOcorrencia(dataInicio, dia, frequencia, dataFim, null),
      total_gerado: 0,
      criado_em: agora,
      atualizado_em: agora,
      observacoes: String(dados.observacoes || '')
    });

    logInfo('criarRecorrente', 'Recorrencia criada: ' + descricao,
            { id_recorrente: id, tipo: tipo, frequencia: frequencia });
    return obterRecorrente(id);
  });
}

/**
 * Lista as regras de recorrencia.
 * @param {boolean=} incluirInativas Padrao false.
 * @return {Array<Object>} Regras com os campos derivados anexados.
 */
function listarRecorrentes(incluirInativas) {
  return lerTabela(ABAS.RECORRENTES).linhas
    .filter(function (r) {
      if (!String(r.id_recorrente || '').trim()) return false;
      if (incluirInativas) return true;
      return _recorrenteEstaAtiva(r);
    })
    .map(_enriquecerRecorrente);
}

/**
 * Obtem uma regra pelo ID.
 * @param {string} id
 * @return {Object|null}
 */
function obterRecorrente(id) {
  var bruta = buscarPorId(ABAS.RECORRENTES, 'id_recorrente', id);
  return bruta ? _enriquecerRecorrente(bruta) : null;
}

/**
 * Diz se a regra esta marcada como ativa.
 * @param {Object} recorrente
 * @return {boolean}
 * @private
 */
function _recorrenteEstaAtiva(recorrente) {
  var ativo = recorrente.ativo;
  if (typeof ativo === 'boolean') return ativo;
  var texto = normalizarTexto(ativo);
  return texto === '' || ['sim', 'true', '1', 'ativo', 'ativa'].indexOf(texto) !== -1;
}

/**
 * Anexa campos derivados uteis para a interface.
 * @param {Object} recorrente
 * @return {Object}
 * @private
 */
function _enriquecerRecorrente(recorrente) {
  var frequencia = parseInt(paraNumero(recorrente.frequencia_meses), 10) || 1;
  recorrente.ativa = _recorrenteEstaAtiva(recorrente);
  recorrente.valorNumerico = arredondar2(paraNumero(recorrente.valor) || 0);
  recorrente.frequenciaTexto = FREQUENCIAS_RECORRENTE[frequencia] ||
    ('A cada ' + frequencia + ' meses');
  recorrente.nomeMeta = '';
  if (String(recorrente.meta_id || '').trim()) {
    var meta = buscarPorId(ABAS.METAS, 'id_meta', recorrente.meta_id);
    recorrente.nomeMeta = meta ? String(meta.nome) : '(meta removida)';
  }
  recorrente.resumo = recorrente.descricao + ' - ' + formatarMoeda(recorrente.valorNumerico) +
    ' - ' + recorrente.frequenciaTexto + ', dia ' + recorrente.dia_do_mes;
  return recorrente;
}

/**
 * Edita uma regra. Campos ausentes sao preservados.
 * @param {string} id
 * @param {Object} payload
 * @return {Object} Regra atualizada.
 */
function editarRecorrente(id, payload) {
  return comLock(function () {
    var regra = buscarPorId(ABAS.RECORRENTES, 'id_recorrente', id);
    if (!regra) throw new Error('Recorrencia nao encontrada: ' + id);

    var dados = payload || {};
    var campos = {};

    if (dados.descricao !== undefined && String(dados.descricao).trim() !== '') {
      campos.descricao = String(dados.descricao).trim();
    }
    if (dados.valor !== undefined && String(dados.valor).trim() !== '') {
      campos.valor = validarValorMonetario(dados.valor);
    }
    if (dados.categoria !== undefined && String(dados.categoria).trim() !== '') {
      campos.categoria = garantirCategoria(String(dados.categoria).trim(),
                                           String(regra.tipo || ''));
    }
    if (dados.dia_do_mes !== undefined && String(dados.dia_do_mes).trim() !== '') {
      var dia = parseInt(paraNumero(dados.dia_do_mes), 10);
      if (isNaN(dia) || dia < 1 || dia > 31) {
        throw new Error('Dia do mes invalido. Use um numero de 1 a 31.');
      }
      campos.dia_do_mes = dia;
    }
    if (dados.frequencia_meses !== undefined &&
        String(dados.frequencia_meses).trim() !== '') {
      var frequencia = parseInt(paraNumero(dados.frequencia_meses), 10);
      if (!FREQUENCIAS_RECORRENTE[frequencia]) {
        throw new Error('Frequencia invalida. Use 1, 2, 3, 6 ou 12 meses.');
      }
      campos.frequencia_meses = frequencia;
    }
    if (dados.data_fim !== undefined) {
      if (String(dados.data_fim).trim() === '' || String(dados.data_fim).trim() === '-') {
        campos.data_fim = '';
      } else {
        var fim = converterParaData(dados.data_fim);
        if (!fim) throw new Error('Data final invalida.');
        campos.data_fim = fim;
      }
    }
    if (dados.ativo !== undefined) {
      campos.ativo = (dados.ativo === true ||
                      ['sim', 'true', '1'].indexOf(normalizarTexto(dados.ativo)) !== -1)
        ? 'SIM' : 'NAO';
    }
    if (dados.observacoes !== undefined) campos.observacoes = String(dados.observacoes);

    if (!Object.keys(campos).length) {
      throw new Error('Nenhum campo valido para atualizar.');
    }
    campos.atualizado_em = new Date();

    atualizarLinhaPorNumero(ABAS.RECORRENTES, regra._linha, campos);

    // Recalcula a proxima ocorrencia com os novos parametros.
    _recalcularProximaOcorrencia(id);

    logInfo('editarRecorrente', 'Recorrencia atualizada',
            { id_recorrente: id, campos: Object.keys(campos) });
    return obterRecorrente(id);
  });
}

/**
 * Ativa uma regra.
 * @param {string} id
 * @return {Object}
 */
function ativarRecorrente(id) { return editarRecorrente(id, { ativo: 'SIM' }); }

/**
 * Desativa uma regra. As ocorrencias ja geradas permanecem.
 * @param {string} id
 * @return {Object}
 */
function desativarRecorrente(id) { return editarRecorrente(id, { ativo: 'NAO' }); }

/**
 * Exclui uma regra.
 *
 * modo SOFT (padrao): apenas desativa.
 * modo HARD: remove a linha da regra. Os lancamentos ja gerados por ela NAO
 *            sao apagados - eles sao historico financeiro real.
 *
 * @param {string} id
 * @param {string=} modo 'SOFT' | 'HARD'
 * @return {{sucesso: boolean, modo: string, mensagem: string}}
 */
function excluirRecorrente(id, modo) {
  var modoFinal = String(modo || 'SOFT').trim().toUpperCase();

  if (modoFinal !== 'HARD') {
    desativarRecorrente(id);
    return {
      sucesso: true, modo: 'SOFT',
      mensagem: 'Recorrencia desativada. Nenhuma nova ocorrencia sera gerada e ' +
                'os lancamentos anteriores foram preservados.'
    };
  }

  return comLock(function () {
    var regra = buscarPorId(ABAS.RECORRENTES, 'id_recorrente', id);
    if (!regra) throw new Error('Recorrencia nao encontrada: ' + id);

    logAviso('excluirRecorrente', 'Exclusao definitiva de recorrencia (backup no log)', {
      id_recorrente: regra.id_recorrente,
      descricao: regra.descricao,
      tipo: regra.tipo,
      valor: regra.valor,
      total_gerado: regra.total_gerado
    });

    removerLinhaPorId(ABAS.RECORRENTES, 'id_recorrente', id);
    return {
      sucesso: true, modo: 'HARD',
      mensagem: 'Recorrencia excluida. Os lancamentos ja gerados continuam na ' +
                'aba Lancamentos, como deve ser.'
    };
  });
}

// ===========================================================================
// GERACAO DAS OCORRENCIAS
// ===========================================================================

/**
 * Gera todas as ocorrencias vencidas ate a data informada.
 *
 * @param {Object=} opcoes
 *   {Date|string=} ate      Data limite (padrao: hoje).
 *   {string=} idRecorrente  Gera apenas uma regra especifica.
 * @return {{criados: number, pulados: number, erros: Array<string>,
 *           detalhes: Array<Object>, mensagem: string}}
 */
function gerarLancamentosRecorrentes(opcoes) {
  return comLock(function () {
    return _gerarRecorrentesInterno(opcoes);
  }, 60000);
}

/**
 * Implementacao da geracao, sem lock (quem chama e responsavel).
 * @param {Object=} opcoes
 * @return {Object}
 * @private
 */
function _gerarRecorrentesInterno(opcoes) {
  var config = opcoes || {};
  var ateData = converterParaData(config.ate) || new Date();
  var limiteTotal = obterConfigNumero('max_ocorrencias_por_execucao', 60);

  // Chaves ja geradas: olha nas DUAS abas que podem receber a ocorrencia.
  var jaGeradas = _coletarChavesGeradas();

  var criados = [];
  var pulados = 0;
  var erros = [];

  var regras = listarRecorrentes(false);
  if (config.idRecorrente) {
    var alvo = String(config.idRecorrente).trim().toUpperCase();
    regras = regras.filter(function (r) {
      return String(r.id_recorrente).trim().toUpperCase() === alvo;
    });
  }

  regras.forEach(function (regra) {
    try {
      var ocorrencias = _listarOcorrenciasDevidas(regra, ateData);
      var geradasNestaRegra = 0;

      ocorrencias.forEach(function (ocorrencia) {
        if (criados.length >= limiteTotal) return;

        var chave = 'RECORRENTE:' + regra.id_recorrente + ':' + chaveMes(ocorrencia);
        if (jaGeradas[chave]) { pulados++; return; }

        var resultado = _gerarUmaOcorrencia(regra, ocorrencia, chave);
        jaGeradas[chave] = true;
        geradasNestaRegra++;
        criados.push(resultado);
      });

      if (geradasNestaRegra > 0) {
        var total = (parseInt(paraNumero(regra.total_gerado), 10) || 0) + geradasNestaRegra;
        atualizarLinhaPorId(ABAS.RECORRENTES, 'id_recorrente', regra.id_recorrente, {
          ultima_geracao: ocorrencias[ocorrencias.length - 1],
          total_gerado: total,
          atualizado_em: new Date()
        });
      }
      _recalcularProximaOcorrencia(regra.id_recorrente, ateData);

    } catch (e) {
      // Uma regra com problema nunca pode impedir as demais de rodar.
      erros.push('"' + regra.descricao + '": ' + e.message);
      logErro('gerarLancamentosRecorrentes', 'Falha na regra ' + regra.id_recorrente,
              e.message);
    }
  });

  if (criados.length) {
    atualizarCamposCalculadosMetas();
    logInfo('gerarLancamentosRecorrentes', criados.length + ' ocorrencia(s) gerada(s)',
            { pulados: pulados, erros: erros.length });
  }

  var mensagem;
  if (!regras.length) {
    mensagem = 'Nenhuma recorrencia ativa cadastrada.';
  } else if (!criados.length) {
    mensagem = 'Nada a gerar: todas as ocorrencias vencidas ja estavam lancadas.';
  } else {
    mensagem = criados.length + ' lancamento(s) gerado(s) a partir de ' +
      regras.length + ' recorrencia(s) ativa(s).';
  }
  if (erros.length) mensagem += ' ' + erros.length + ' regra(s) com erro.';

  return {
    criados: criados.length,
    pulados: pulados,
    erros: erros,
    detalhes: criados,
    mensagem: mensagem
  };
}

/**
 * Mapa de todas as chaves de recorrencia ja materializadas.
 * Olha em Lancamentos (receita/despesa) e em Metas_Movimentos (aporte).
 * @return {Object<string, boolean>}
 * @private
 */
function _coletarChavesGeradas() {
  var chaves = {};

  lerTabela(ABAS.LANCAMENTOS).linhas.forEach(function (l) {
    var origem = String(l.origem || '');
    if (origem.indexOf('RECORRENTE:') === 0) chaves[origem] = true;
  });

  lerTabela(ABAS.METAS_MOVIMENTOS).linhas.forEach(function (m) {
    var origem = String(m.origem || '');
    if (origem.indexOf('RECORRENTE:') === 0) chaves[origem] = true;
  });

  return chaves;
}

/**
 * Datas de ocorrencia devidas de uma regra ate a data limite.
 * @param {Object} regra
 * @param {Date} ateData
 * @return {Array<Date>}
 * @private
 */
function _listarOcorrenciasDevidas(regra, ateData) {
  var inicio = converterParaData(regra.data_inicio);
  if (!inicio) return [];
  var fim = converterParaData(regra.data_fim);

  var dia = parseInt(paraNumero(regra.dia_do_mes), 10) || inicio.getDate();
  var frequencia = parseInt(paraNumero(regra.frequencia_meses), 10) || 1;

  var ocorrencias = [];
  var ano = inicio.getFullYear();
  var mes = inicio.getMonth();

  for (var passo = 0; passo < LIMITE_OCORRENCIAS_POR_REGRA; passo++) {
    var data = _dataDaOcorrencia(ano, mes, dia);

    if (data > ateData) break;
    if (fim && data > fim) break;
    // A primeira ocorrencia pode cair antes do inicio (ex.: inicio dia 20,
    // recorrencia todo dia 5). Nesse caso ela e simplesmente ignorada.
    if (data >= _zerarHoras(inicio)) ocorrencias.push(data);

    mes += frequencia;
    ano += Math.floor(mes / 12);
    mes = mes % 12;
  }

  return ocorrencias;
}

/**
 * Data de uma ocorrencia, com o dia limitado ao ultimo dia do mes.
 * Dia 31 em fevereiro vira 28 (ou 29 em ano bissexto).
 * @param {number} ano
 * @param {number} mes 0..11
 * @param {number} dia 1..31
 * @return {Date}
 * @private
 */
function _dataDaOcorrencia(ano, mes, dia) {
  var ultimoDia = new Date(ano, mes + 1, 0).getDate();
  return new Date(ano, mes, Math.min(dia, ultimoDia));
}

/**
 * Zera horas/minutos de uma data, para comparacoes por dia.
 * @param {Date} data
 * @return {Date}
 * @private
 */
function _zerarHoras(data) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

/**
 * Materializa uma ocorrencia: lancamento comum ou movimento de meta.
 * @param {Object} regra
 * @param {Date} data
 * @param {string} chave Chave de idempotencia (vai no campo origem).
 * @return {Object} Resumo do que foi criado.
 * @private
 */
function _gerarUmaOcorrencia(regra, data, chave) {
  var tipo = String(regra.tipo || '').toUpperCase();
  var valor = arredondar2(paraNumero(regra.valor) || 0);
  var descricao = String(regra.descricao || 'Lancamento recorrente');

  if (tipo === 'APORTE_META') {
    // Passa pelo caminho oficial da meta: grava em Metas_Movimentos e deixa o
    // espelho em Lancamentos ser criado por _movimentarMeta.
    var movimento = _movimentarMeta(
      regra.meta_id, valor, data, descricao,
      TIPOS_MOVIMENTO_META.APORTE, chave);

    return {
      tipo: tipo,
      data: formatarData(data),
      valor: valor,
      descricao: descricao,
      id: movimento.id_movimento,
      chave: chave
    };
  }

  var lancamento = _inserirLancamento({
    data: data,
    tipo: tipo,
    valor: valor,
    categoria: regra.categoria,
    descricao: descricao,
    origem: chave,
    status: STATUS_LANCAMENTO.CONFIRMADO
  }, { permitirDuplicado: true }); // a chave de origem ja garante a unicidade

  return {
    tipo: tipo,
    data: formatarData(data),
    valor: valor,
    descricao: descricao,
    id: lancamento.id_lancamento,
    chave: chave
  };
}

/**
 * Recalcula e grava a proxima ocorrencia prevista de uma regra.
 * @param {string} id
 * @param {Date=} referencia Padrao hoje.
 * @private
 */
function _recalcularProximaOcorrencia(id, referencia) {
  var regra = buscarPorId(ABAS.RECORRENTES, 'id_recorrente', id);
  if (!regra) return;

  var base = converterParaData(referencia) || new Date();
  var proxima = _proximaOcorrencia(
    converterParaData(regra.data_inicio) || new Date(),
    parseInt(paraNumero(regra.dia_do_mes), 10) || 1,
    parseInt(paraNumero(regra.frequencia_meses), 10) || 1,
    converterParaData(regra.data_fim),
    base);

  atualizarLinhaPorNumero(ABAS.RECORRENTES, regra._linha, {
    proxima_geracao: proxima
  });
}

/**
 * Primeira ocorrencia estritamente posterior a data de referencia.
 * @param {Date} inicio
 * @param {number} dia
 * @param {number} frequencia
 * @param {Date|null} fim
 * @param {Date|null} referencia Se null, devolve a primeira ocorrencia de todas.
 * @return {Date|string} Data, ou '' quando nao ha proxima.
 * @private
 */
function _proximaOcorrencia(inicio, dia, frequencia, fim, referencia) {
  var ano = inicio.getFullYear();
  var mes = inicio.getMonth();
  var corte = referencia ? _zerarHoras(referencia) : null;

  for (var passo = 0; passo < LIMITE_OCORRENCIAS_POR_REGRA; passo++) {
    var data = _dataDaOcorrencia(ano, mes, dia);

    if (fim && data > fim) return '';
    if (data >= _zerarHoras(inicio) && (!corte || data > corte)) return data;

    mes += frequencia;
    ano += Math.floor(mes / 12);
    mes = mes % 12;
  }
  return '';
}

// ===========================================================================
// APOIO A INTERFACE
// ===========================================================================

/**
 * Cria uma recorrencia a partir de um lancamento ja registrado.
 * E o caminho do "marcar este lancamento como mensal" na sidebar: o usuario
 * lanca normalmente e, se marcou a caixinha, a regra nasce a partir dele.
 *
 * @param {Object} lancamento Objeto devolvido por registrarLancamento().
 * @param {number=} frequenciaMeses Padrao 1.
 * @return {Object} Regra criada.
 */
function criarRecorrenteAPartirDeLancamento(lancamento, frequenciaMeses) {
  var origem = lancamento || {};
  var data = converterParaData(origem.data) || new Date();

  return criarRecorrente({
    descricao: String(origem.descricao || '').trim() ||
               (String(origem.tipo || '') + ' recorrente'),
    tipo: origem.tipo,
    valor: origem.valor,
    categoria: origem.categoria,
    dia_do_mes: data.getDate(),
    frequencia_meses: frequenciaMeses || 1,
    // Comeca no proximo periodo: o lancamento deste mes ja foi feito a mao.
    data_inicio: new Date(data.getFullYear(),
                          data.getMonth() + (frequenciaMeses || 1),
                          1),
    observacoes: 'Criada a partir do lancamento ' + (origem.id_lancamento || '')
  });
}

/**
 * Total mensal comprometido com recorrencias ativas, por tipo.
 * Serve ao indicador "quanto do meu mes ja esta comprometido".
 *
 * @return {{receitas: number, despesas: number, aportes: number,
 *           liquidoMensal: number, quantidade: number}}
 */
function calcularComprometimentoMensal() {
  var totais = { receitas: 0, despesas: 0, aportes: 0, quantidade: 0 };

  listarRecorrentes(false).forEach(function (regra) {
    var frequencia = parseInt(paraNumero(regra.frequencia_meses), 10) || 1;
    // Normaliza tudo para um equivalente mensal.
    var mensal = regra.valorNumerico / frequencia;
    totais.quantidade++;

    var tipo = String(regra.tipo || '').toUpperCase();
    if (tipo === 'RECEITA') totais.receitas += mensal;
    else if (tipo === 'DESPESA') totais.despesas += mensal;
    else if (tipo === 'APORTE_META') totais.aportes += mensal;
  });

  totais.receitas = arredondar2(totais.receitas);
  totais.despesas = arredondar2(totais.despesas);
  totais.aportes = arredondar2(totais.aportes);
  totais.liquidoMensal = arredondar2(totais.receitas - totais.despesas - totais.aportes);
  return totais;
}
