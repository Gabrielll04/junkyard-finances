/**
 * Financeiro.gs
 * ---------------------------------------------------------------------------
 * Registro e consulta de lancamentos (receitas, despesas, aportes, resgates e
 * transferencias) e manutencao da aba Categorias.
 *
 * Todo lancamento tem valor POSITIVO. O efeito no caixa vem do tipo:
 *   RECEITA        -> entra
 *   DESPESA        -> sai
 *   APORTE_META    -> neutro no caixa do mes (dinheiro muda de bolso)
 *   RESGATE_META   -> neutro no caixa do mes
 *   TRANSFERENCIA  -> neutro (apenas move entre contas)
 */

/** Status possiveis de um lancamento. */
var STATUS_LANCAMENTO = {
  CONFIRMADO: 'CONFIRMADO',
  PENDENTE: 'PENDENTE',
  CANCELADO: 'CANCELADO'
};

// ===========================================================================
// REGISTRO DE LANCAMENTOS
// ===========================================================================

/**
 * Registra um lancamento generico (ponto de entrada publico, com lock).
 *
 * @param {Object} payload
 *   {Date|string} data           obrigatorio
 *   {string} tipo                RECEITA|DESPESA|APORTE_META|RESGATE_META|TRANSFERENCIA
 *   {number} valor               obrigatorio, positivo
 *   {string=} categoria
 *   {string=} meta_id            obrigatorio para APORTE_META/RESGATE_META
 *   {string=} conta               ID ou nome da conta afetada (padrao: conta padrao)
 *   {string=} conta_origem        so para TRANSFERENCIA
 *   {string=} conta_destino       so para TRANSFERENCIA
 *   {string=} descricao
 *   {string=} origem             padrao 'MANUAL'
 *   {string=} status             padrao 'CONFIRMADO'
 *   {string|Array=} tags         rotulos livres, ex.: "luz" ou "agua, apartamento"
 * @param {Object=} opcoes {permitirDuplicado: boolean}
 * @return {Object} Lancamento gravado.
 */
function registrarLancamento(payload, opcoes) {
  return comLock(function () {
    return _inserirLancamento(payload, opcoes);
  });
}

/**
 * Nucleo de insercao de lancamento. NAO usa lock (quem chama e responsavel),
 * para permitir composicao com aportes/resgates sem travar o proprio lock.
 * @param {Object} payload
 * @param {Object=} opcoes
 * @return {Object}
 * @private
 */
function _inserirLancamento(payload, opcoes) {
  var dados = payload || {};
  var config = opcoes || {};

  // --- tipo -----------------------------------------------------------------
  var tipo = String(dados.tipo || '').trim().toUpperCase();
  if (!TIPOS_LANCAMENTO[tipo]) {
    throw new Error('Tipo de lancamento invalido: "' + dados.tipo + '". ' +
      'Use: ' + Object.keys(TIPOS_LANCAMENTO).join(', ') + '.');
  }

  // --- data -----------------------------------------------------------------
  var data = converterParaData(dados.data);
  if (!data) {
    throw new Error('Data invalida. Use o formato dd/mm/aaaa.');
  }
  if (!dataPlausivel(data)) {
    throw new Error('Data fora de um intervalo plausivel (verifique o ano digitado).');
  }
  var limiteFuturo = obterConfigNumero('dias_futuro_permitidos', 370);
  var diasNoFuturo = (data - new Date()) / (1000 * 60 * 60 * 24);
  if (diasNoFuturo > limiteFuturo) {
    throw new Error('Data muito distante no futuro (' + formatarData(data) + ').');
  }

  // --- valor ----------------------------------------------------------------
  var valor = validarValorMonetario(dados.valor);

  // --- meta -----------------------------------------------------------------
  var metaId = String(dados.meta_id || '').trim();
  var exigeMeta = (tipo === TIPOS_LANCAMENTO.APORTE_META ||
                   tipo === TIPOS_LANCAMENTO.RESGATE_META);
  if (exigeMeta) {
    if (!metaId) {
      throw new Error('Lancamentos do tipo ' + tipo + ' exigem uma meta associada.');
    }
    if (!buscarPorId(ABAS.METAS, 'id_meta', metaId)) {
      throw new Error('Meta nao encontrada: ' + metaId);
    }
  } else if (metaId) {
    // Meta em receita/despesa e apenas informativa; valida se existir.
    if (!buscarPorId(ABAS.METAS, 'id_meta', metaId)) {
      throw new Error('Meta nao encontrada: ' + metaId);
    }
  }

  // --- categoria ------------------------------------------------------------
  var categoria = String(dados.categoria || '').trim();
  if (!categoria) {
    categoria = (tipo === TIPOS_LANCAMENTO.RECEITA) ? 'Outros' : 'Outros';
  }
  categoria = garantirCategoria(categoria, tipo);

  // --- duplicidade ----------------------------------------------------------
  if (!config.permitirDuplicado && obterConfigBooleano('bloquear_duplicados', true)) {
    var duplicado = _encontrarLancamentoSemelhante({
      data: data, tipo: tipo, valor: valor,
      categoria: categoria, descricao: String(dados.descricao || '')
    });
    if (duplicado) {
      throw new Error(
        'Lancamento parece duplicado (ja existe ' + duplicado.id_lancamento +
        ' em ' + formatarData(duplicado.data) + ' de ' + formatarMoeda(valor) +
        ' em "' + categoria + '"). Ajuste a descricao ou confirme como nao duplicado.');
    }
  }

  // --- status ---------------------------------------------------------------
  var status = String(dados.status || STATUS_LANCAMENTO.CONFIRMADO).trim().toUpperCase();
  if (!STATUS_LANCAMENTO[status]) status = STATUS_LANCAMENTO.CONFIRMADO;

  var contas = _resolverContasDoLancamento(tipo, dados);

  var agora = new Date();
  var id = gerarId(PREFIXOS_ID.LANCAMENTO);

  var registro = {
    id_lancamento: id,
    data: data,
    tipo: tipo,
    valor: valor,
    categoria: categoria,
    meta_id: metaId,
    conta_origem: contas.conta_origem,
    conta_destino: contas.conta_destino,
    descricao: String(dados.descricao || ''),
    origem: String(dados.origem || 'MANUAL'),
    tags: normalizarTags(dados.tags),
    status: status,
    criado_em: agora,
    atualizado_em: agora
  };

  adicionarLinha(ABAS.LANCAMENTOS, registro);
  logInfo('registrarLancamento', tipo + ' de ' + formatarMoeda(valor) + ' em ' + categoria,
          { id_lancamento: id, data: formatarData(data) });
  return registro;
}

/**
 * Decide quais contas um lancamento afeta e devolve os IDs para gravar.
 *
 *   RECEITA, RESGATE_META -> conta_destino
 *   DESPESA, APORTE_META  -> conta_origem
 *   TRANSFERENCIA         -> conta_origem e conta_destino, ambas obrigatorias
 *
 * Aceita ID ou nome. Sem conta informada, usa a conta padrao - e grava o ID
 * dela explicitamente, para que trocar a conta padrao depois nao "mude de
 * conta" os lancamentos antigos.
 *
 * @param {string} tipo
 * @param {Object} dados {conta, conta_origem, conta_destino}
 * @return {{conta_origem: string, conta_destino: string}}
 * @private
 */
function _resolverContasDoLancamento(tipo, dados) {
  function idDe(referencia, rotulo) {
    var conta = resolverConta(referencia);
    if (!conta) {
      throw new Error((rotulo || 'Conta') + ' nao encontrada: "' + referencia + '". ' +
        'Cadastre-a em Financeiro > Contas > Nova conta.');
    }
    return String(conta.id_conta).trim();
  }

  if (tipo === TIPOS_LANCAMENTO.TRANSFERENCIA) {
    var origem = String(dados.conta_origem || '').trim();
    var destino = String(dados.conta_destino || '').trim();
    if (!origem || !destino) {
      throw new Error('Transferencia exige conta de origem e conta de destino.');
    }
    var idOrigem = idDe(origem, 'Conta de origem');
    var idDestino = idDe(destino, 'Conta de destino');
    if (idOrigem === idDestino) throw new Error('Origem e destino sao a mesma conta.');
    return { conta_origem: idOrigem, conta_destino: idDestino };
  }

  var informada = String(dados.conta || '').trim() ||
    String((tipo === TIPOS_LANCAMENTO.RECEITA || tipo === TIPOS_LANCAMENTO.RESGATE_META)
      ? dados.conta_destino || '' : dados.conta_origem || '').trim();
  var id = informada ? idDe(informada) : String(obterContaPadrao().id_conta).trim();

  var entra = tipo === TIPOS_LANCAMENTO.RECEITA || tipo === TIPOS_LANCAMENTO.RESGATE_META;
  return { conta_origem: entra ? '' : id, conta_destino: entra ? id : '' };
}

/**
 * Procura um lancamento praticamente identico ja registrado.
 * Criterio: mesma data, mesmo tipo, mesmo valor, mesma categoria e mesma
 * descricao normalizada, com status diferente de CANCELADO.
 * @param {Object} candidato
 * @return {Object|null}
 * @private
 */
function _encontrarLancamentoSemelhante(candidato) {
  var diaAlvo = formatarData(candidato.data);
  var descricaoAlvo = normalizarTexto(candidato.descricao);
  var lancamentos = lerTabela(ABAS.LANCAMENTOS).linhas;

  for (var i = lancamentos.length - 1; i >= 0; i--) {
    var l = lancamentos[i];
    if (String(l.status || '').toUpperCase() === STATUS_LANCAMENTO.CANCELADO) continue;
    if (String(l.tipo || '').toUpperCase() !== candidato.tipo) continue;
    if (arredondar2(paraNumero(l.valor)) !== candidato.valor) continue;
    if (formatarData(l.data) !== diaAlvo) continue;
    if (normalizarTexto(l.categoria) !== normalizarTexto(candidato.categoria)) continue;
    if (normalizarTexto(l.descricao) !== descricaoAlvo) continue;
    return l;
  }
  return null;
}

/**
 * Atalho para registrar receita.
 * @param {Date|string} data
 * @param {number} valor
 * @param {string} categoria
 * @param {string=} descricao
 * @return {Object}
 */
function registrarReceita(data, valor, categoria, descricao) {
  return registrarLancamento({
    data: data, tipo: TIPOS_LANCAMENTO.RECEITA, valor: valor,
    categoria: categoria, descricao: descricao
  });
}

/**
 * Atalho para registrar despesa.
 * @param {Date|string} data
 * @param {number} valor
 * @param {string} categoria
 * @param {string=} descricao
 * @return {Object}
 */
function registrarDespesa(data, valor, categoria, descricao) {
  return registrarLancamento({
    data: data, tipo: TIPOS_LANCAMENTO.DESPESA, valor: valor,
    categoria: categoria, descricao: descricao
  });
}

/**
 * Registra uma transferencia entre contas (neutra no resultado do mes).
 * @param {Date|string} data
 * @param {number} valor
 * @param {string} contaOrigem
 * @param {string} contaDestino
 * @param {string=} descricao
 * @return {Object}
 */
function registrarTransferencia(data, valor, contaOrigem, contaDestino, descricao) {
  if (!String(contaOrigem || '').trim() || !String(contaDestino || '').trim()) {
    throw new Error('Informe conta de origem e conta de destino da transferencia.');
  }
  // _inserirLancamento resolve os nomes/IDs das contas e recusa conta inexistente.
  return registrarLancamento({
    data: data, tipo: TIPOS_LANCAMENTO.TRANSFERENCIA, valor: valor,
    categoria: String(obterConfig('categoria_transferencia_padrao', 'Outros')),
    conta_origem: contaOrigem, conta_destino: contaDestino, descricao: descricao
  });
}

/**
 * Cancela um lancamento sem apagar o historico.
 * @param {string} idLancamento
 * @param {string=} motivo
 * @return {Object} Lancamento atualizado.
 */
function cancelarLancamento(idLancamento, motivo) {
  return comLock(function () {
    return _cancelarLancamentoInterno(idLancamento, motivo);
  });
}

/**
 * Nucleo do cancelamento, sem lock.
 * @param {string} idLancamento
 * @param {string=} motivo
 * @return {Object}
 * @private
 */
function _cancelarLancamentoInterno(idLancamento, motivo) {
  var lancamento = buscarPorId(ABAS.LANCAMENTOS, 'id_lancamento', idLancamento);
  if (!lancamento) throw new Error('Lancamento nao encontrado: ' + idLancamento);

  _recusarSeForEspelhoDeMeta(lancamento, 'cancelar');

  if (String(lancamento.status || '').toUpperCase() === STATUS_LANCAMENTO.CANCELADO) {
    return lancamento;
  }

  var descricao = String(lancamento.descricao || '');
  if (motivo) descricao += ' [CANCELADO: ' + motivo + ']';

  atualizarLinhaPorNumero(ABAS.LANCAMENTOS, lancamento._linha, {
    status: STATUS_LANCAMENTO.CANCELADO,
    descricao: descricao,
    atualizado_em: new Date()
  });
  logAviso('cancelarLancamento', 'Lancamento cancelado',
           { id_lancamento: idLancamento, motivo: motivo || '' });
  return buscarPorId(ABAS.LANCAMENTOS, 'id_lancamento', idLancamento);
}

/**
 * Impede mexer direto num lancamento que e espelho de um movimento de meta.
 * O saldo da meta vem de Metas_Movimentos; editar o espelho daria a impressao
 * de ter mudado algo que na verdade nao mudou.
 *
 * @param {Object} lancamento
 * @param {string} acao Verbo usado na mensagem de erro.
 * @private
 */
function _recusarSeForEspelhoDeMeta(lancamento, acao) {
  if (String(lancamento.origem || '').indexOf('META:') === 0) {
    throw new Error(
      'Este lancamento e o espelho de um movimento de meta e nao pode ser ' +
      acao + ' diretamente. Para reverter, registre um resgate ou aporte ' +
      'compensatorio na meta.');
  }
}

/**
 * Obtem um lancamento pelo ID.
 * @param {string} idLancamento
 * @return {Object|null}
 */
function obterLancamento(idLancamento) {
  return buscarPorId(ABAS.LANCAMENTOS, 'id_lancamento', idLancamento);
}

/**
 * Edita um lancamento existente. Campos ausentes sao preservados.
 *
 * Nao e permitido editar espelhos de meta, nem transformar um lancamento
 * comum em APORTE_META/RESGATE_META: esses tipos so nascem de um movimento
 * real de meta, senao o saldo da meta e o extrato divergiriam.
 *
 * @param {string} idLancamento
 * @param {Object} payload Campos a alterar (data, tipo, valor, categoria,
 *                         descricao, status, conta_origem, conta_destino).
 * @return {Object} Lancamento atualizado.
 */
function editarLancamento(idLancamento, payload) {
  return comLock(function () {
    var lancamento = buscarPorId(ABAS.LANCAMENTOS, 'id_lancamento', idLancamento);
    if (!lancamento) throw new Error('Lancamento nao encontrado: ' + idLancamento);

    _recusarSeForEspelhoDeMeta(lancamento, 'editado');

    var tipoAtual = String(lancamento.tipo || '').toUpperCase();
    if (tipoAtual === TIPOS_LANCAMENTO.APORTE_META ||
        tipoAtual === TIPOS_LANCAMENTO.RESGATE_META) {
      throw new Error('Lancamentos ligados a metas sao editados pela propria meta.');
    }

    var dados = payload || {};
    var campos = {};

    if (dados.data !== undefined && String(dados.data).trim() !== '') {
      var data = converterParaData(dados.data);
      if (!data) throw new Error('Data invalida. Use o formato dd/mm/aaaa.');
      if (!dataPlausivel(data)) {
        throw new Error('Data fora de um intervalo plausivel.');
      }
      campos.data = data;
    }

    if (dados.tipo !== undefined && String(dados.tipo).trim() !== '') {
      var tipo = String(dados.tipo).trim().toUpperCase();
      if (!TIPOS_LANCAMENTO[tipo]) {
        throw new Error('Tipo de lancamento invalido: "' + dados.tipo + '".');
      }
      if (tipo === TIPOS_LANCAMENTO.APORTE_META ||
          tipo === TIPOS_LANCAMENTO.RESGATE_META) {
        throw new Error('Para registrar aporte ou resgate, use a tela de metas. ' +
          'Assim o saldo da meta e o extrato continuam consistentes.');
      }
      campos.tipo = tipo;
    }

    if (dados.valor !== undefined && String(dados.valor).trim() !== '') {
      campos.valor = validarValorMonetario(dados.valor);
    }

    if (dados.categoria !== undefined && String(dados.categoria).trim() !== '') {
      var tipoParaCategoria = campos.tipo || tipoAtual;
      campos.categoria = garantirCategoria(String(dados.categoria).trim(),
                                           tipoParaCategoria);
    }

    if (dados.descricao !== undefined) campos.descricao = String(dados.descricao);
    // Conta: recalculada se mudou a conta OU o tipo (receita entra no destino,
    // despesa sai da origem - trocar o tipo troca a coluna que importa).
    var mudouConta = dados.conta !== undefined && String(dados.conta).trim() !== '';
    var mudouContaTransf = dados.conta_origem !== undefined || dados.conta_destino !== undefined;
    if (mudouConta || mudouContaTransf || campos.tipo) {
      var tipoFinal = campos.tipo || tipoAtual;
      var contaAtual = tipoAtual === TIPOS_LANCAMENTO.RECEITA
        ? lancamento.conta_destino : lancamento.conta_origem;
      var novas = _resolverContasDoLancamento(tipoFinal, {
        conta: mudouConta ? dados.conta : (tipoFinal === TIPOS_LANCAMENTO.TRANSFERENCIA ? '' : contaAtual),
        conta_origem: dados.conta_origem !== undefined ? dados.conta_origem : lancamento.conta_origem,
        conta_destino: dados.conta_destino !== undefined ? dados.conta_destino : lancamento.conta_destino
      });
      campos.conta_origem = novas.conta_origem;
      campos.conta_destino = novas.conta_destino;
    }
    // Tags vazias sao um valor valido: e assim que se remove todas.
    if (dados.tags !== undefined) campos.tags = normalizarTags(dados.tags);

    if (dados.status !== undefined && String(dados.status).trim() !== '') {
      var status = String(dados.status).trim().toUpperCase();
      if (!STATUS_LANCAMENTO[status]) {
        throw new Error('Status invalido. Use CONFIRMADO, PENDENTE ou CANCELADO.');
      }
      campos.status = status;
    }

    if (!Object.keys(campos).length) {
      throw new Error('Nenhum campo valido para atualizar.');
    }
    campos.atualizado_em = new Date();

    atualizarLinhaPorNumero(ABAS.LANCAMENTOS, lancamento._linha, campos);
    logInfo('editarLancamento', 'Lancamento atualizado',
            { id_lancamento: idLancamento, campos: Object.keys(campos) });
    return buscarPorId(ABAS.LANCAMENTOS, 'id_lancamento', idLancamento);
  });
}

/**
 * Exclui um lancamento.
 *
 * modo SOFT (padrao): marca como CANCELADO. Sai dos totais, mas a linha fica,
 *                     e a operacao e reversivel.
 * modo HARD: remove a linha de vez. Exige confirmacao explicita.
 *
 * @param {string} idLancamento
 * @param {string=} modo 'SOFT' | 'HARD'
 * @param {boolean=} confirmacao Obrigatoria no modo HARD.
 * @return {{sucesso: boolean, modo: string, mensagem: string}}
 */
function excluirLancamento(idLancamento, modo, confirmacao) {
  return comLock(function () {
    var lancamento = buscarPorId(ABAS.LANCAMENTOS, 'id_lancamento', idLancamento);
    if (!lancamento) throw new Error('Lancamento nao encontrado: ' + idLancamento);

    _recusarSeForEspelhoDeMeta(lancamento, 'excluido');

    var modoFinal = String(modo || 'SOFT').trim().toUpperCase();

    if (modoFinal !== 'HARD') {
      _cancelarLancamentoInterno(idLancamento, 'excluido pelo usuario');
      return {
        sucesso: true, modo: 'SOFT',
        mensagem: 'Lancamento cancelado. Ele saiu dos totais mas continua na ' +
                  'planilha, e pode ser reativado mudando o status para CONFIRMADO.'
      };
    }

    if (!confirmacao) {
      throw new Error('A exclusao definitiva exige confirmacao explicita. ' +
        'Recomendado: cancelar o lancamento em vez de apaga-lo.');
    }

    // Retrato no log antes de sumir com a linha.
    logAviso('excluirLancamento', 'Exclusao definitiva de lancamento (backup no log)', {
      id_lancamento: lancamento.id_lancamento,
      data: formatarData(lancamento.data),
      tipo: lancamento.tipo,
      valor: lancamento.valor,
      categoria: lancamento.categoria,
      descricao: lancamento.descricao,
      origem: lancamento.origem
    });

    removerLinhaPorId(ABAS.LANCAMENTOS, 'id_lancamento', idLancamento);
    return {
      sucesso: true, modo: 'HARD',
      mensagem: 'Lancamento excluido definitivamente. Um retrato dele ficou na aba Logs.'
    };
  });
}

// ===========================================================================
// CONSULTAS
// ===========================================================================

/**
 * Lista lancamentos com filtros simples.
 * @param {Object=} filtros
 *   {string=} mes        yyyy-MM
 *   {string=} tipo
 *   {string=} categoria
 *   {string=} metaId
 *   {string=} tag        so lancamentos que tenham esta tag
 *   {boolean=} incluirCancelados
 *   {number=} limite
 * @return {Array<Object>} Do mais recente para o mais antigo.
 */
function listarLancamentos(filtros) {
  var f = filtros || {};
  var lista = lerTabela(ABAS.LANCAMENTOS).linhas.filter(function (l) {
    if (!String(l.id_lancamento || '').trim()) return false;
    if (!f.incluirCancelados &&
        String(l.status || '').toUpperCase() === STATUS_LANCAMENTO.CANCELADO) {
      return false;
    }
    if (f.mes && chaveMes(l.data) !== f.mes) return false;
    if (f.tipo && String(l.tipo || '').toUpperCase() !== String(f.tipo).toUpperCase()) {
      return false;
    }
    if (f.categoria &&
        normalizarTexto(l.categoria) !== normalizarTexto(f.categoria)) {
      return false;
    }
    if (f.tag && !possuiTag(l.tags, f.tag)) return false;
    if (f.metaId &&
        String(l.meta_id || '').trim().toUpperCase() !== String(f.metaId).trim().toUpperCase()) {
      return false;
    }
    return true;
  });

  lista.sort(function (a, b) {
    var da = converterParaData(a.data) || new Date(0);
    var db = converterParaData(b.data) || new Date(0);
    if (db - da !== 0) return db - da;
    return String(b.id_lancamento).localeCompare(String(a.id_lancamento));
  });

  return f.limite ? lista.slice(0, f.limite) : lista;
}

/**
 * Soma lancamentos confirmados de um tipo em um mes.
 * @param {string} tipo
 * @param {string} mes yyyy-MM
 * @return {number}
 */
function somarPorTipoNoMes(tipo, mes) {
  var total = 0;
  listarLancamentos({ mes: mes, tipo: tipo }).forEach(function (l) {
    var valor = paraNumero(l.valor);
    if (!isNaN(valor)) total += valor;
  });
  return arredondar2(total);
}

// ===========================================================================
// TAGS
// ===========================================================================

/**
 * Agrupa as despesas do mes por tag, em ordem decrescente.
 *
 * Um lancamento com varias tags conta inteiro em cada uma delas ("luz" e
 * "apartamento" recebem os R$ 120 da conta de luz). Por isso a soma das
 * tags pode passar do total de despesas - tag e um corte transversal, nao
 * uma particao como a categoria.
 *
 * @param {string} mes yyyy-MM
 * @param {string=} tipo Padrao DESPESA.
 * @return {Array<{tag: string, total: number, quantidade: number}>}
 */
function agruparPorTag(mes, tipo) {
  var acumulado = {};
  listarLancamentos({ mes: mes, tipo: tipo || TIPOS_LANCAMENTO.DESPESA }).forEach(function (l) {
    var valor = paraNumero(l.valor);
    if (isNaN(valor)) return;
    listarTags(l.tags).forEach(function (tag) {
      var chave = chaveTag(tag);
      if (!acumulado[chave]) acumulado[chave] = { tag: tag, total: 0, quantidade: 0 };
      acumulado[chave].total += valor;
      acumulado[chave].quantidade++;
    });
  });
  return Object.keys(acumulado)
    .map(function (k) {
      var item = acumulado[k];
      return { tag: item.tag, total: arredondar2(item.total), quantidade: item.quantidade };
    })
    .sort(function (a, b) { return b.total - a.total; });
}

/**
 * Historico de uma tag: total por mes nos ultimos N meses, total geral,
 * media mensal e os lancamentos mais recentes.
 *
 * Responde perguntas como "quanto eu gastei de luz nos ultimos 6 meses?".
 *
 * @param {string} tag
 * @param {Object=} opcoes {meses: number (padrao 6), tipo: string (padrao DESPESA)}
 * @return {{tag: string, meses: Array<{mes: string, total: number, quantidade: number}>,
 *           total: number, mediaMensal: number, mesesComGasto: number,
 *           lancamentos: Array<Object>}}
 */
function consultarTag(tag, opcoes) {
  var config = opcoes || {};
  var alvo = chaveTag(tag);
  if (!alvo) throw new Error('Informe a tag que deseja consultar.');

  var quantidadeMeses = Math.max(parseInt(config.meses, 10) || 6, 1);
  var tipo = config.tipo || TIPOS_LANCAMENTO.DESPESA;
  var referencia = mesAtual();

  var porMes = {};
  var ordem = [];
  for (var i = quantidadeMeses - 1; i >= 0; i--) {
    var chave = deslocarMes(referencia, -i);
    porMes[chave] = { mes: chave, total: 0, quantidade: 0 };
    ordem.push(chave);
  }

  var grafiaUsada = '';
  var encontrados = listarLancamentos({ tag: tag, tipo: tipo });
  encontrados.forEach(function (l) {
    if (!grafiaUsada) {
      grafiaUsada = listarTags(l.tags).filter(function (t) {
        return chaveTag(t) === alvo;
      })[0] || '';
    }
    var mes = chaveMes(l.data);
    if (!porMes[mes]) return; // fora da janela pedida
    var valor = paraNumero(l.valor);
    if (isNaN(valor)) return;
    porMes[mes].total += valor;
    porMes[mes].quantidade++;
  });

  var meses = ordem.map(function (k) {
    return { mes: k, total: arredondar2(porMes[k].total), quantidade: porMes[k].quantidade };
  });
  var total = arredondar2(meses.reduce(function (acc, m) { return acc + m.total; }, 0));
  var comGasto = meses.filter(function (m) { return m.total > 0; }).length;

  return {
    tag: grafiaUsada || String(tag).replace(/^#+/, '').trim(),
    meses: meses,
    total: total,
    // Media sobre os meses em que houve gasto: conta de luz que ainda nao
    // venceu este mes nao deve puxar a media para baixo.
    mediaMensal: comGasto ? arredondar2(total / comGasto) : 0,
    mesesComGasto: comGasto,
    lancamentos: encontrados.slice(0, 10)
  };
}

/**
 * Todas as tags ja usadas, da mais frequente para a menos frequente.
 * Alimenta as sugestoes na hora de lancar.
 * @param {number=} limite Padrao 30.
 * @return {Array<string>}
 */
function listarTagsUsadas(limite) {
  var contagem = {};
  lerTabela(ABAS.LANCAMENTOS).linhas.forEach(function (l) {
    listarTags(l.tags).forEach(function (tag) {
      var chave = chaveTag(tag);
      if (!contagem[chave]) contagem[chave] = { tag: tag, vezes: 0 };
      contagem[chave].vezes++;
    });
  });
  return Object.keys(contagem)
    .map(function (k) { return contagem[k]; })
    .sort(function (a, b) { return b.vezes - a.vezes || a.tag.localeCompare(b.tag); })
    .slice(0, limite || 30)
    .map(function (item) { return item.tag; });
}

/**
 * Agrupa despesas do mes por categoria, em ordem decrescente.
 * @param {string} mes yyyy-MM
 * @return {Array<{categoria: string, total: number}>}
 */
function agruparDespesasPorCategoria(mes) {
  var acumulado = {};
  listarLancamentos({ mes: mes, tipo: TIPOS_LANCAMENTO.DESPESA }).forEach(function (l) {
    var categoria = String(l.categoria || 'Outros').trim() || 'Outros';
    var valor = paraNumero(l.valor);
    if (isNaN(valor)) return;
    acumulado[categoria] = (acumulado[categoria] || 0) + valor;
  });
  return Object.keys(acumulado)
    .map(function (c) { return { categoria: c, total: arredondar2(acumulado[c]) }; })
    .sort(function (a, b) { return b.total - a.total; });
}

// ===========================================================================
// CATEGORIAS
// ===========================================================================

/**
 * Lista categorias cadastradas.
 * @param {boolean=} apenasAtivas Padrao true.
 * @return {Array<Object>}
 */
function listarCategorias(apenasAtivas) {
  if (apenasAtivas === undefined) apenasAtivas = true;
  return lerTabela(ABAS.CATEGORIAS).linhas.filter(function (c) {
    if (!String(c.nome || '').trim()) return false;
    if (!apenasAtivas) return true;
    var ativa = c.ativa;
    if (typeof ativa === 'boolean') return ativa;
    var texto = normalizarTexto(ativa);
    return texto === '' || ['sim', 'true', '1', 'ativa'].indexOf(texto) !== -1;
  });
}

/**
 * Nomes de categorias compativeis com um tipo de lancamento.
 * @param {string} tipoLancamento
 * @return {Array<string>}
 */
function listarNomesCategorias(tipoLancamento) {
  var tipoAlvo = String(tipoLancamento || '').toUpperCase();
  var mapaTipo = {
    RECEITA: 'RECEITA',
    DESPESA: 'DESPESA'
  };
  var tipoCategoria = mapaTipo[tipoAlvo];

  return listarCategorias(true)
    .filter(function (c) {
      if (!tipoCategoria) return true;
      var tipo = String(c.tipo_categoria || 'AMBOS').toUpperCase();
      return tipo === tipoCategoria || tipo === 'AMBOS';
    })
    .map(function (c) { return String(c.nome).trim(); });
}

/**
 * Garante que a categoria exista, criando-a se a configuracao permitir.
 * @param {string} nome
 * @param {string=} tipoLancamento Usado para definir o tipo da nova categoria.
 * @return {string} Nome canonico da categoria (respeitando o cadastro).
 */
function garantirCategoria(nome, tipoLancamento) {
  var procurado = normalizarTexto(nome);
  if (!procurado) return 'Outros';

  var existentes = listarCategorias(false);
  for (var i = 0; i < existentes.length; i++) {
    if (normalizarTexto(existentes[i].nome) === procurado) {
      return String(existentes[i].nome).trim();
    }
  }

  if (!obterConfigBooleano('criar_categoria_automaticamente', true)) {
    throw new Error('Categoria "' + nome + '" nao cadastrada. ' +
      'Cadastre-a na aba Categorias ou ative a criacao automatica na aba Config.');
  }

  var tipoCategoria = 'AMBOS';
  var tipo = String(tipoLancamento || '').toUpperCase();
  if (tipo === TIPOS_LANCAMENTO.RECEITA) tipoCategoria = 'RECEITA';
  if (tipo === TIPOS_LANCAMENTO.DESPESA) tipoCategoria = 'DESPESA';

  var nomeLimpo = String(nome).trim();
  adicionarLinha(ABAS.CATEGORIAS, {
    id_categoria: gerarId(PREFIXOS_ID.CATEGORIA),
    nome: nomeLimpo,
    tipo_categoria: tipoCategoria,
    grupo: 'Outros',
    orcamento_mensal_padrao: '',
    ativa: 'SIM'
  });
  logInfo('garantirCategoria', 'Categoria criada automaticamente', { nome: nomeLimpo });
  return nomeLimpo;
}

/**
 * Cria uma categoria explicitamente.
 * @param {Object} payload {nome, tipo_categoria, grupo, orcamento_mensal_padrao}
 * @return {Object}
 */
function criarCategoria(payload) {
  return comLock(function () {
    var dados = payload || {};
    var nome = String(dados.nome || '').trim();
    if (!nome) throw new Error('Informe o nome da categoria.');

    var jaExiste = listarCategorias(false).some(function (c) {
      return normalizarTexto(c.nome) === normalizarTexto(nome);
    });
    if (jaExiste) throw new Error('Categoria "' + nome + '" ja existe.');

    var tipo = String(dados.tipo_categoria || 'AMBOS').trim().toUpperCase();
    if (['RECEITA', 'DESPESA', 'AMBOS'].indexOf(tipo) === -1) {
      throw new Error('Tipo de categoria invalido. Use RECEITA, DESPESA ou AMBOS.');
    }

    var orcamento = paraNumero(dados.orcamento_mensal_padrao);
    var registro = {
      id_categoria: gerarId(PREFIXOS_ID.CATEGORIA),
      nome: nome,
      tipo_categoria: tipo,
      grupo: String(dados.grupo || 'Outros'),
      orcamento_mensal_padrao: isNaN(orcamento) ? '' : arredondar2(orcamento),
      ativa: 'SIM'
    };
    adicionarLinha(ABAS.CATEGORIAS, registro);
    logInfo('criarCategoria', 'Categoria criada', { nome: nome });
    return registro;
  });
}
