/**
 * Contas.gs
 * ---------------------------------------------------------------------------
 * Saldo de conta corrente (e de quantas contas o usuario quiser: conta do
 * banco, carteira, conta digital...).
 *
 * COMO O SALDO E CALCULADO
 *   saldo = saldo informado + efeito dos lancamentos a partir da data em que
 *           o saldo foi informado
 *
 * O usuario informa o saldo REAL da conta numa data (a data de referencia).
 * Lancamentos ANTERIORES a essa data sao ignorados: o efeito deles ja esta
 * dentro do valor informado. E isso que permite lancar despesas antigas, para
 * o historico e as medias, sem descontar o mesmo dinheiro duas vezes.
 *
 * EFEITO DE CADA TIPO DE LANCAMENTO
 *   RECEITA        + na conta de destino
 *   DESPESA        - na conta de origem
 *   APORTE_META    - na conta de origem   (o dinheiro vai para a caixinha)
 *   RESGATE_META   + na conta de destino  (o dinheiro volta da caixinha)
 *   TRANSFERENCIA  - na origem, + no destino
 * Lancamento CANCELADO nao tem efeito. Lancamento sem conta informada conta
 * na conta padrao.
 *
 * SALDO ATUAL x PREVISTO
 *   atual    = so lancamentos com data ate hoje
 *   previsto = inclui lancamentos com data futura (contas ja agendadas)
 *
 * Os lancamentos guardam o ID da conta (colunas conta_origem/conta_destino),
 * nao o nome: renomear uma conta nao quebra nada.
 */

/** Nome da conta criada automaticamente. */
var NOME_CONTA_PADRAO = 'Conta corrente';

// ===========================================================================
// ESTRUTURA
// ===========================================================================

/**
 * Garante que a aba Contas exista e tenha cabecalhos. Planilhas criadas antes
 * desta funcionalidade nao tem a aba; ela nasce aqui, no primeiro uso, sem
 * precisar rodar o setup de novo.
 * @private
 */
function _garantirAbaContas() {
  var aba = obterAbaSegura(ABAS.CONTAS);
  if (obterMapaCabecalhos(aba).id_conta === undefined) {
    garantirCabecalhos(ABAS.CONTAS);
  }
}

/** @return {boolean} @private */
function _simNao(valor, padrao) {
  if (typeof valor === 'boolean') return valor;
  var texto = normalizarTexto(valor);
  if (texto === '') return padrao;
  return ['sim', 'true', '1', 'ativa', 'ativo'].indexOf(texto) !== -1;
}

// ===========================================================================
// CONSULTA
// ===========================================================================

/**
 * Lista as contas com saldo atual e previsto.
 * Cria a conta padrao se ainda nao houver nenhuma.
 *
 * @param {boolean=} incluirInativas Padrao false.
 * @return {Array<Object>}
 */
function listarContas(incluirInativas) {
  obterContaPadrao(); // garante a aba e ao menos uma conta
  var saldos = calcularSaldosDasContas();

  return lerTabela(ABAS.CONTAS).linhas
    .filter(function (c) {
      if (!String(c.id_conta || '').trim()) return false;
      return incluirInativas || _simNao(c.ativa, true);
    })
    .map(function (c) { return _enriquecerConta(c, saldos); })
    .sort(function (a, b) {
      // padrao primeiro, depois por nome
      if (a.ehPadrao !== b.ehPadrao) return a.ehPadrao ? -1 : 1;
      return String(a.nome).localeCompare(String(b.nome));
    });
}

/**
 * Anexa os campos calculados a uma linha da aba Contas.
 * @private
 */
function _enriquecerConta(conta, saldos) {
  var id = String(conta.id_conta).trim();
  var dados = saldos[id] || { atual: null, previsto: null };
  conta.ehPadrao = _simNao(conta.padrao, false);
  conta.ativaBool = _simNao(conta.ativa, true);
  conta.configurada = !!converterParaData(conta.data_referencia);
  conta.saldoAtual = dados.atual;
  conta.saldoPrevisto = dados.previsto;
  conta.temLancamentoFuturo = conta.configurada && dados.atual !== dados.previsto;
  return conta;
}

/**
 * Conta padrao: a marcada como padrao; senao a primeira ativa; senao cria
 * "Conta corrente". Lancamentos sem conta informada caem nela.
 *
 * @return {Object} Linha da conta (sem saldos calculados).
 */
function obterContaPadrao() {
  _garantirAbaContas();
  var contas = lerTabela(ABAS.CONTAS).linhas.filter(function (c) {
    return String(c.id_conta || '').trim() && _simNao(c.ativa, true);
  });

  var padrao = contas.filter(function (c) { return _simNao(c.padrao, false); })[0];
  if (padrao) return padrao;
  if (contas.length) return contas[0];

  // Nenhuma conta ainda: cria a conta corrente, sem saldo informado. O saldo
  // so passa a ser calculado depois que o usuario informar o valor real.
  var agora = new Date();
  var nova = {
    id_conta: gerarId(PREFIXOS_ID.CONTA),
    nome: NOME_CONTA_PADRAO,
    saldo_inicial: 0,
    data_referencia: '',
    ativa: 'SIM',
    padrao: 'SIM',
    criada_em: agora,
    atualizada_em: agora,
    observacoes: 'Criada automaticamente. Informe o saldo atual para comecar.'
  };
  adicionarLinha(ABAS.CONTAS, nova);
  logInfo('obterContaPadrao', 'Conta padrao criada', { id_conta: nova.id_conta });
  return buscarPorId(ABAS.CONTAS, 'id_conta', nova.id_conta);
}

/**
 * Encontra uma conta pelo ID ou pelo nome (sem diferenciar caixa e acento).
 * @param {string} referencia
 * @return {Object|null}
 */
function resolverConta(referencia) {
  var alvo = String(referencia || '').trim();
  if (!alvo) return null;
  _garantirAbaContas();
  var contas = lerTabela(ABAS.CONTAS).linhas;
  var porId = contas.filter(function (c) {
    return String(c.id_conta || '').trim().toUpperCase() === alvo.toUpperCase();
  })[0];
  if (porId) return porId;
  return contas.filter(function (c) {
    return normalizarTexto(c.nome) === normalizarTexto(alvo);
  })[0] || null;
}

/**
 * Efeito de um lancamento sobre as contas.
 * @param {Object} l Linha de Lancamentos.
 * @param {string} idPadrao Conta usada quando o lancamento nao informa conta.
 * @return {Array<{conta: string, delta: number}>}
 */
function efeitosNasContas(l, idPadrao) {
  if (String(l.status || '').toUpperCase() === STATUS_LANCAMENTO.CANCELADO) return [];
  var valor = paraNumero(l.valor);
  if (isNaN(valor) || valor === 0) return [];

  var origem = String(l.conta_origem || '').trim() || idPadrao;
  var destino = String(l.conta_destino || '').trim() || idPadrao;

  switch (String(l.tipo || '').toUpperCase()) {
    case TIPOS_LANCAMENTO.RECEITA:
    case TIPOS_LANCAMENTO.RESGATE_META:
      return [{ conta: destino, delta: valor }];
    case TIPOS_LANCAMENTO.DESPESA:
    case TIPOS_LANCAMENTO.APORTE_META:
      return [{ conta: origem, delta: -valor }];
    case TIPOS_LANCAMENTO.TRANSFERENCIA:
      if (origem === destino) return [];
      return [{ conta: origem, delta: -valor }, { conta: destino, delta: valor }];
    default:
      return [];
  }
}

/**
 * Saldo atual e previsto de todas as contas, numa unica passada pelos
 * lancamentos.
 *
 * @return {Object<string, {atual: number|null, previsto: number|null}>}
 *   null quando a conta ainda nao teve o saldo informado.
 */
function calcularSaldosDasContas() {
  var contas = lerTabela(ABAS.CONTAS).linhas.filter(function (c) {
    return String(c.id_conta || '').trim();
  });
  if (!contas.length) return {};

  var padrao = contas.filter(function (c) {
    return _simNao(c.padrao, false) && _simNao(c.ativa, true);
  })[0] || contas.filter(function (c) { return _simNao(c.ativa, true); })[0] || contas[0];
  var idPadrao = String(padrao.id_conta).trim();

  var fimDeHoje = new Date();
  fimDeHoje.setHours(23, 59, 59, 999);

  var resultado = {};
  var referencia = {};
  contas.forEach(function (c) {
    var id = String(c.id_conta).trim();
    var data = converterParaData(c.data_referencia);
    if (!data) {
      resultado[id] = { atual: null, previsto: null };
      return;
    }
    referencia[id] = new Date(data.getFullYear(), data.getMonth(), data.getDate());
    var inicial = paraNumero(c.saldo_inicial);
    if (isNaN(inicial)) inicial = 0;
    resultado[id] = { atual: inicial, previsto: inicial };
  });

  lerTabela(ABAS.LANCAMENTOS).linhas.forEach(function (l) {
    var data = converterParaData(l.data);
    if (!data) return;
    efeitosNasContas(l, idPadrao).forEach(function (efeito) {
      var ref = referencia[efeito.conta];
      if (!ref || data < ref) return; // conta sem saldo informado, ou ja embutido no saldo
      resultado[efeito.conta].previsto += efeito.delta;
      if (data <= fimDeHoje) resultado[efeito.conta].atual += efeito.delta;
    });
  });

  Object.keys(resultado).forEach(function (id) {
    if (resultado[id].atual === null) return;
    resultado[id].atual = arredondar2(resultado[id].atual);
    resultado[id].previsto = arredondar2(resultado[id].previsto);
  });
  return resultado;
}

/**
 * Totais somando as contas ativas com saldo informado.
 * @return {{atual: number, previsto: number, configuradas: number, contas: Array<Object>}}
 */
function resumoDasContas() {
  var contas = listarContas(false);
  var configuradas = contas.filter(function (c) { return c.configurada; });
  return {
    atual: arredondar2(configuradas.reduce(function (a, c) { return a + c.saldoAtual; }, 0)),
    previsto: arredondar2(configuradas.reduce(function (a, c) { return a + c.saldoPrevisto; }, 0)),
    configuradas: configuradas.length,
    contas: contas
  };
}

// ===========================================================================
// ALTERACAO
// ===========================================================================

/**
 * Informa o saldo REAL da conta agora (o que aparece no app do banco).
 *
 * Funciona como reconciliacao: o sistema passa a mostrar exatamente esse
 * valor hoje, e dai em diante soma e subtrai os lancamentos. Lancamentos de
 * hoje que ja estavam lancados sao considerados JA INCLUIDOS no valor
 * informado - se o saldo do banco ainda nao reflete algum deles, basta
 * informar o saldo de novo depois que ele cair.
 *
 * @param {string} referenciaConta ID ou nome. Vazio = conta padrao.
 * @param {number|string} valor Pode ser negativo (cheque especial).
 * @return {Object} Conta atualizada, com saldos.
 */
function definirSaldoAtual(referenciaConta, valor) {
  return comLock(function () {
    var conta = referenciaConta ? resolverConta(referenciaConta) : obterContaPadrao();
    if (!conta) throw new Error('Conta nao encontrada: ' + referenciaConta);

    var saldoInformado = validarValorMonetario(valor, { permitirZero: true, permitirNegativo: true });

    // Efeito dos lancamentos de hoje nesta conta: o saldo inicial e montado
    // para que, somado a eles, o saldo de hoje de exatamente o valor informado.
    var hoje = new Date();
    var inicioDeHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    var fimDeHoje = new Date(inicioDeHoje.getTime() + 24 * 60 * 60 * 1000 - 1);
    var idConta = String(conta.id_conta).trim();
    var idPadrao = String(obterContaPadrao().id_conta).trim();

    var efeitoDeHoje = 0;
    lerTabela(ABAS.LANCAMENTOS).linhas.forEach(function (l) {
      var data = converterParaData(l.data);
      if (!data || data < inicioDeHoje || data > fimDeHoje) return;
      efeitosNasContas(l, idPadrao).forEach(function (e) {
        if (e.conta === idConta) efeitoDeHoje += e.delta;
      });
    });

    var anterior = { saldo_inicial: conta.saldo_inicial, data_referencia: conta.data_referencia };
    atualizarLinhaPorNumero(ABAS.CONTAS, conta._linha, {
      saldo_inicial: arredondar2(saldoInformado - efeitoDeHoje),
      data_referencia: inicioDeHoje,
      atualizada_em: new Date()
    });

    logInfo('definirSaldoAtual', 'Saldo informado para ' + conta.nome, {
      id_conta: idConta, saldo_informado: saldoInformado,
      anterior: { saldo_inicial: anterior.saldo_inicial,
                  data_referencia: formatarData(anterior.data_referencia) }
    });
    return _contaComSaldo(idConta);
  });
}

/**
 * Cria uma conta nova.
 * @param {Object} payload {nome, saldo_atual (opcional), padrao (opcional)}
 * @return {Object} Conta criada, com saldos.
 */
function criarConta(payload) {
  var dados = payload || {};
  var id = comLock(function () {
    var nome = String(dados.nome || '').trim();
    if (!nome) throw new Error('Informe o nome da conta.');
    _garantirAbaContas();

    var existe = lerTabela(ABAS.CONTAS).linhas.some(function (c) {
      return normalizarTexto(c.nome) === normalizarTexto(nome);
    });
    if (existe) throw new Error('Ja existe uma conta chamada "' + nome + '".');

    var tornarPadrao = _simNao(dados.padrao, false);
    if (tornarPadrao) _desmarcarPadroes();

    var agora = new Date();
    var novoId = gerarId(PREFIXOS_ID.CONTA);
    adicionarLinha(ABAS.CONTAS, {
      id_conta: novoId,
      nome: nome,
      saldo_inicial: 0,
      data_referencia: '',
      ativa: 'SIM',
      padrao: tornarPadrao ? 'SIM' : 'NAO',
      criada_em: agora,
      atualizada_em: agora,
      observacoes: String(dados.observacoes || '')
    });
    logInfo('criarConta', 'Conta criada: ' + nome, { id_conta: novoId });
    return novoId;
  });

  // Fora do lock acima: definirSaldoAtual pega o proprio lock.
  if (dados.saldo_atual !== undefined && String(dados.saldo_atual).trim() !== '') {
    return definirSaldoAtual(id, dados.saldo_atual);
  }
  return _contaComSaldo(id);
}

/**
 * Edita nome, ativa ou padrao de uma conta.
 * @param {string} referenciaConta ID ou nome.
 * @param {Object} payload {nome, ativa, padrao}
 * @return {Object}
 */
function editarConta(referenciaConta, payload) {
  return comLock(function () {
    var conta = resolverConta(referenciaConta);
    if (!conta) throw new Error('Conta nao encontrada: ' + referenciaConta);
    var dados = payload || {};
    var campos = {};

    if (dados.nome !== undefined && String(dados.nome).trim()) {
      var nome = String(dados.nome).trim();
      var conflito = lerTabela(ABAS.CONTAS).linhas.some(function (c) {
        return c.id_conta !== conta.id_conta && normalizarTexto(c.nome) === normalizarTexto(nome);
      });
      if (conflito) throw new Error('Ja existe uma conta chamada "' + nome + '".');
      campos.nome = nome;
    }
    if (dados.ativa !== undefined) {
      var ativa = _simNao(dados.ativa, true);
      if (!ativa && _simNao(conta.padrao, false)) {
        throw new Error('A conta padrao nao pode ser desativada. Escolha outra conta padrao antes.');
      }
      campos.ativa = ativa ? 'SIM' : 'NAO';
    }
    if (dados.padrao !== undefined && _simNao(dados.padrao, false)) {
      _desmarcarPadroes();
      campos.padrao = 'SIM';
      campos.ativa = 'SIM';
    }
    if (!Object.keys(campos).length) throw new Error('Nenhum campo valido para atualizar.');
    campos.atualizada_em = new Date();
    atualizarLinhaPorNumero(ABAS.CONTAS, conta._linha, campos);
    return _contaComSaldo(conta.id_conta);
  });
}

/** Tira a marca de padrao de todas as contas. @private */
function _desmarcarPadroes() {
  lerTabela(ABAS.CONTAS).linhas.forEach(function (c) {
    if (_simNao(c.padrao, false)) {
      atualizarLinhaPorNumero(ABAS.CONTAS, c._linha, { padrao: 'NAO' });
    }
  });
}

/** Conta com os saldos calculados. @private */
function _contaComSaldo(idConta) {
  var conta = buscarPorId(ABAS.CONTAS, 'id_conta', idConta);
  return conta ? _enriquecerConta(conta, calcularSaldosDasContas()) : null;
}

/**
 * Grava o saldo atual na coluna calculada da aba Contas, para quem olha a
 * planilha direto. So escreve o que mudou.
 */
function atualizarSaldosNaAbaContas() {
  try {
    var saldos = calcularSaldosDasContas();
    lerTabela(ABAS.CONTAS).linhas.forEach(function (c) {
      var dados = saldos[String(c.id_conta || '').trim()];
      if (!dados) return;
      var novo = dados.atual === null ? '' : dados.atual;
      var atual = c.campo_calculado_saldo_atual;
      if (String(atual) === String(novo)) return;
      atualizarLinhaPorNumero(ABAS.CONTAS, c._linha, { campo_calculado_saldo_atual: novo });
    });
  } catch (e) {
    logErro('atualizarSaldosNaAbaContas', 'Falha ao gravar saldos', e.message);
  }
}
