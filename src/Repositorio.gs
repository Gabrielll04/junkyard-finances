/**
 * Repositorio.gs
 * ---------------------------------------------------------------------------
 * Camada de acesso a dados. Tudo o que fala diretamente com o Google Sheets
 * mora aqui: nomes de abas, cabecalhos, leitura/escrita em lote, geracao de
 * IDs, cache, lock, formatacao e log.
 *
 * Regra de ouro: nenhum outro arquivo deve chamar getRange/getValues direto
 * nas abas de dados. Use as funcoes deste arquivo.
 */

// ===========================================================================
// CONSTANTES DE ESTRUTURA
// ===========================================================================

/** Nomes das abas em um unico lugar (nada de nome de aba espalhado no codigo). */
var ABAS = {
  CONFIG: 'Config',
  DASHBOARD: 'Dashboard',
  METAS: 'Metas',
  LANCAMENTOS: 'Lancamentos',
  RECORRENTES: 'Recorrentes',
  METAS_MOVIMENTOS: 'Metas_Movimentos',
  CATEGORIAS: 'Categorias',
  ORCAMENTOS: 'Orcamentos',
  SIMULACOES: 'Simulacoes',
  LOGS: 'Logs',
  IMPORTACAO: 'Importacao_Futura',
  README: 'README'
};

/** Cabecalhos canonicos de cada aba. A ordem define a ordem das colunas. */
var CABECALHOS = {};
CABECALHOS[ABAS.CONFIG] = ['chave', 'valor', 'descricao'];
CABECALHOS[ABAS.METAS] = [
  'id_meta', 'nome', 'tipo', 'valor_alvo', 'saldo_inicial',
  'aporte_mensal_planejado', 'data_inicio', 'data_prazo', 'status',
  'taxa_mensal_personalizada', 'cor', 'descricao', 'criada_em', 'atualizada_em',
  'campo_calculado_saldo_atual', 'campo_calculado_progresso_percentual',
  'campo_calculado_valor_faltante', 'campo_calculado_previsao_meses_restantes'
];
CABECALHOS[ABAS.LANCAMENTOS] = [
  'id_lancamento', 'data', 'tipo', 'valor', 'categoria', 'meta_id',
  'conta_origem', 'conta_destino', 'descricao', 'origem', 'status',
  'criado_em', 'atualizado_em'
];
CABECALHOS[ABAS.RECORRENTES] = [
  'id_recorrente', 'descricao', 'tipo', 'valor', 'categoria', 'meta_id',
  'dia_do_mes', 'frequencia_meses', 'data_inicio', 'data_fim', 'ativo',
  'ultima_geracao', 'proxima_geracao', 'total_gerado', 'criado_em',
  'atualizado_em', 'observacoes'
];
CABECALHOS[ABAS.METAS_MOVIMENTOS] = [
  'id_movimento', 'data', 'meta_id', 'tipo_movimento', 'valor',
  'descricao', 'origem', 'criado_em'
];
CABECALHOS[ABAS.CATEGORIAS] = [
  'id_categoria', 'nome', 'tipo_categoria', 'grupo',
  'orcamento_mensal_padrao', 'ativa'
];
CABECALHOS[ABAS.ORCAMENTOS] = [
  'categoria', 'mes_referencia', 'valor_orcado', 'valor_realizado',
  'diferenca', 'status'
];
CABECALHOS[ABAS.SIMULACOES] = [
  'data_hora', 'meta_id', 'meta_nome', 'cenario', 'saldo_atual',
  'valor_alvo', 'aporte_mensal', 'taxa_mensal', 'meses', 'resultado',
  'observacao'
];
CABECALHOS[ABAS.LOGS] = ['data_hora', 'nivel', 'funcao', 'mensagem', 'detalhes'];
CABECALHOS[ABAS.IMPORTACAO] = [
  'id_importacao', 'data_upload', 'tipo_documento', 'arquivo_id_drive',
  'arquivo_url', 'nome_arquivo', 'status', 'dados_extraidos_json',
  'valor_extraido', 'data_documento', 'categoria_sugerida', 'meta_sugerida',
  'lancamento_id', 'observacoes'
];

/** Tipos de lancamento aceitos. */
var TIPOS_LANCAMENTO = {
  RECEITA: 'RECEITA',
  DESPESA: 'DESPESA',
  APORTE_META: 'APORTE_META',
  RESGATE_META: 'RESGATE_META',
  TRANSFERENCIA: 'TRANSFERENCIA'
};

/** Tipos de movimento de meta. */
var TIPOS_MOVIMENTO_META = {
  APORTE: 'APORTE',
  RESGATE: 'RESGATE',
  AJUSTE_POSITIVO: 'AJUSTE_POSITIVO',
  AJUSTE_NEGATIVO: 'AJUSTE_NEGATIVO'
};

/** Tipos de meta. */
var TIPOS_META = { META: 'META', RESERVA: 'RESERVA' };

/** Status de meta. */
var STATUS_META = { ATIVA: 'ATIVA', INATIVA: 'INATIVA', CONCLUIDA: 'CONCLUIDA' };

/** Prefixos de ID por entidade. */
var PREFIXOS_ID = {
  META: 'MET',
  LANCAMENTO: 'LAN',
  RECORRENTE: 'REC',
  MOVIMENTO: 'MOV',
  CATEGORIA: 'CAT',
  IMPORTACAO: 'IMP'
};

/** TTL curto de cache, em segundos. Leituras quentes, nunca fonte de verdade. */
var CACHE_TTL_SEGUNDOS = 30;

// ===========================================================================
// ACESSO A PLANILHA E ABAS
// ===========================================================================

/**
 * Retorna a planilha ativa. Isolado em funcao para facilitar testes e para
 * permitir, no futuro, abrir por ID.
 * @return {Spreadsheet}
 */
function obterPlanilha() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  if (!planilha) {
    throw new Error('Nenhuma planilha ativa. Abra a planilha e rode novamente.');
  }
  return planilha;
}

/**
 * Obtem uma aba pelo nome, criando-a se ainda nao existir.
 * @param {string} nomeAba Nome da aba.
 * @param {boolean=} criarSeNaoExistir Padrao true.
 * @return {Sheet}
 */
function obterAbaSegura(nomeAba, criarSeNaoExistir) {
  if (criarSeNaoExistir === undefined) criarSeNaoExistir = true;
  var planilha = obterPlanilha();
  var aba = planilha.getSheetByName(nomeAba);
  if (!aba) {
    if (!criarSeNaoExistir) {
      throw new Error('Aba "' + nomeAba + '" nao encontrada. Rode o setup do sistema.');
    }
    aba = planilha.insertSheet(nomeAba);
  }
  return aba;
}

/**
 * Garante que a primeira linha da aba contenha exatamente os cabecalhos
 * esperados. Colunas novas sao adicionadas ao final, preservando os dados.
 * @param {string} nomeAba Nome da aba.
 * @param {Array<string>=} cabecalhos Cabecalhos; se omitido usa CABECALHOS.
 * @return {Sheet}
 */
function garantirCabecalhos(nomeAba, cabecalhos) {
  var esperados = cabecalhos || CABECALHOS[nomeAba];
  if (!esperados) throw new Error('Cabecalhos nao definidos para a aba ' + nomeAba);

  var aba = obterAbaSegura(nomeAba);
  var totalColunas = Math.max(aba.getLastColumn(), 1);
  var atuais = aba.getRange(1, 1, 1, totalColunas).getValues()[0]
    .map(function (v) { return String(v || '').trim(); });

  // Monta a lista final: cabecalhos existentes na ordem atual + novos ao final.
  var finais = atuais.filter(function (h) { return h !== ''; });
  esperados.forEach(function (h) {
    if (finais.indexOf(h) === -1) finais.push(h);
  });

  // Nada mudou? Evita escrita desnecessaria.
  var precisaEscrever = finais.length !== atuais.filter(function (h) { return h !== ''; }).length;
  if (!precisaEscrever) {
    for (var i = 0; i < finais.length; i++) {
      if (atuais[i] !== finais[i]) { precisaEscrever = true; break; }
    }
  }
  if (precisaEscrever) {
    if (aba.getMaxColumns() < finais.length) {
      aba.insertColumnsAfter(aba.getMaxColumns(), finais.length - aba.getMaxColumns());
    }
    aba.getRange(1, 1, 1, finais.length).setValues([finais]);
  }

  // Formatacao padrao do cabecalho.
  aba.getRange(1, 1, 1, finais.length)
    .setFontWeight('bold')
    .setBackground('#1f3864')
    .setFontColor('#ffffff')
    .setVerticalAlignment('middle');
  aba.setFrozenRows(1);
  _limparCacheTabela(nomeAba);
  return aba;
}

/**
 * Mapa {nomeColuna: indiceZeroBased} da aba informada.
 * @param {Sheet} aba
 * @return {Object<string, number>}
 */
function obterMapaCabecalhos(aba) {
  var totalColunas = Math.max(aba.getLastColumn(), 1);
  var linha = aba.getRange(1, 1, 1, totalColunas).getValues()[0];
  var mapa = {};
  for (var i = 0; i < linha.length; i++) {
    var nome = String(linha[i] || '').trim();
    if (nome) mapa[nome] = i;
  }
  return mapa;
}

/**
 * Numero da ultima linha com dados (0 se so houver cabecalho).
 * @param {string} nomeAba
 * @return {number}
 */
function obterUltimaLinha(nomeAba) {
  var aba = obterAbaSegura(nomeAba);
  return Math.max(aba.getLastRow() - 1, 0);
}

// ===========================================================================
// LEITURA E ESCRITA EM LOTE
// ===========================================================================

/**
 * Le a aba inteira de uma vez e devolve objetos por linha.
 * Cada objeto recebe a propriedade especial `_linha` com o numero real da
 * linha na planilha, usada para atualizacoes pontuais.
 * @param {string} nomeAba
 * @return {{cabecalhos: Array<string>, linhas: Array<Object>}}
 */
function lerTabela(nomeAba) {
  var aba = obterAbaSegura(nomeAba);
  var ultimaLinha = aba.getLastRow();
  var ultimaColuna = Math.max(aba.getLastColumn(), 1);
  var cabecalhos = aba.getRange(1, 1, 1, ultimaColuna).getValues()[0]
    .map(function (v) { return String(v || '').trim(); });

  if (ultimaLinha < 2) return { cabecalhos: cabecalhos, linhas: [] };

  // Uma unica chamada getValues para toda a tabela (nada de getRange em loop).
  var valores = aba.getRange(2, 1, ultimaLinha - 1, ultimaColuna).getValues();
  var linhas = [];
  for (var i = 0; i < valores.length; i++) {
    var bruto = valores[i];
    // Ignora linhas completamente vazias (restos de exclusao manual).
    var temConteudo = bruto.some(function (v) { return v !== '' && v !== null; });
    if (!temConteudo) continue;

    var objeto = { _linha: i + 2 };
    for (var c = 0; c < cabecalhos.length; c++) {
      if (cabecalhos[c]) objeto[cabecalhos[c]] = bruto[c];
    }
    linhas.push(objeto);
  }
  return { cabecalhos: cabecalhos, linhas: linhas };
}

/**
 * Acrescenta uma linha a partir de um objeto {coluna: valor}.
 * @param {string} nomeAba
 * @param {Object} objeto
 * @return {number} Numero da linha criada.
 */
function adicionarLinha(nomeAba, objeto) {
  return adicionarLinhas(nomeAba, [objeto])[0];
}

/**
 * Acrescenta varias linhas de uma vez (uma unica escrita).
 * @param {string} nomeAba
 * @param {Array<Object>} objetos
 * @return {Array<number>} Numeros das linhas criadas.
 */
function adicionarLinhas(nomeAba, objetos) {
  if (!objetos || !objetos.length) return [];
  var aba = obterAbaSegura(nomeAba);
  var mapa = obterMapaCabecalhos(aba);
  var nomes = Object.keys(mapa);
  var largura = nomes.length;

  var matriz = objetos.map(function (obj) {
    var linha = new Array(largura).fill('');
    Object.keys(obj).forEach(function (chave) {
      if (chave === '_linha') return;
      if (mapa[chave] === undefined) return; // coluna inexistente e ignorada
      var valor = obj[chave];
      linha[mapa[chave]] = (valor === undefined || valor === null) ? '' : valor;
    });
    return linha;
  });

  var primeiraLinha = aba.getLastRow() + 1;
  aba.getRange(primeiraLinha, 1, matriz.length, largura).setValues(matriz);
  _limparCacheTabela(nomeAba);

  return matriz.map(function (_, i) { return primeiraLinha + i; });
}

/**
 * Busca uma linha pelo valor de uma coluna de ID.
 * @param {string} nomeAba
 * @param {string} colunaId Nome da coluna de identificacao.
 * @param {string} valorId Valor procurado (comparacao case-insensitive).
 * @return {Object|null} Objeto da linha ou null.
 */
function buscarPorId(nomeAba, colunaId, valorId) {
  if (!valorId) return null;
  var alvo = String(valorId).trim().toUpperCase();
  var tabela = lerTabela(nomeAba);
  for (var i = 0; i < tabela.linhas.length; i++) {
    if (String(tabela.linhas[i][colunaId] || '').trim().toUpperCase() === alvo) {
      return tabela.linhas[i];
    }
  }
  return null;
}

/**
 * Atualiza campos de uma linha identificada por ID.
 * Escreve apenas o intervalo continuo que cobre as colunas alteradas.
 * @param {string} nomeAba
 * @param {string} colunaId
 * @param {string} valorId
 * @param {Object} camposAtualizados
 * @return {boolean} true se atualizou.
 */
function atualizarLinhaPorId(nomeAba, colunaId, valorId, camposAtualizados) {
  var registro = buscarPorId(nomeAba, colunaId, valorId);
  if (!registro) return false;
  atualizarLinhaPorNumero(nomeAba, registro._linha, camposAtualizados);
  return true;
}

/**
 * Atualiza campos de uma linha pelo numero da linha.
 * @param {string} nomeAba
 * @param {number} numeroLinha
 * @param {Object} camposAtualizados
 */
function atualizarLinhaPorNumero(nomeAba, numeroLinha, camposAtualizados) {
  var aba = obterAbaSegura(nomeAba);
  var mapa = obterMapaCabecalhos(aba);
  var indices = [];
  Object.keys(camposAtualizados).forEach(function (chave) {
    if (mapa[chave] !== undefined) indices.push(mapa[chave]);
  });
  if (!indices.length) return;

  var menor = Math.min.apply(null, indices);
  var maior = Math.max.apply(null, indices);
  var largura = maior - menor + 1;
  var faixa = aba.getRange(numeroLinha, menor + 1, 1, largura);
  var atuais = faixa.getValues()[0];

  Object.keys(camposAtualizados).forEach(function (chave) {
    if (mapa[chave] === undefined) return;
    var valor = camposAtualizados[chave];
    atuais[mapa[chave] - menor] = (valor === undefined || valor === null) ? '' : valor;
  });

  faixa.setValues([atuais]);
  _limparCacheTabela(nomeAba);
}

/**
 * Remove fisicamente uma linha pelo ID. Use com muita parcimonia: o padrao do
 * sistema e desativar registros (soft delete), nao apagar.
 * @param {string} nomeAba
 * @param {string} colunaId
 * @param {string} valorId
 * @return {boolean}
 */
function removerLinhaPorId(nomeAba, colunaId, valorId) {
  var registro = buscarPorId(nomeAba, colunaId, valorId);
  if (!registro) return false;
  obterAbaSegura(nomeAba).deleteRow(registro._linha);
  _limparCacheTabela(nomeAba);
  return true;
}

// ===========================================================================
// IDS
// ===========================================================================

/**
 * Gera um ID legivel e praticamente unico: PREFIXO-AAAAMMDD-HHMMSS-XXXX.
 * @param {string} prefixo
 * @return {string}
 */
function gerarId(prefixo) {
  var agora = new Date();
  var carimbo = Utilities.formatDate(agora, obterFusoHorario(), 'yyyyMMdd-HHmmss');
  var aleatorio = Math.floor(Math.random() * 9000 + 1000);
  return prefixo + '-' + carimbo + '-' + aleatorio;
}

// ===========================================================================
// CONFIGURACAO (aba Config)
// ===========================================================================

/**
 * Le todas as configuracoes como mapa {chave: valor}. Usa cache curto.
 * @return {Object<string, string>}
 */
function obterConfigTodas() {
  var cache = CacheService.getDocumentCache();
  var chaveCache = 'config_todas';
  if (cache) {
    try {
      var bruto = cache.get(chaveCache);
      if (bruto) return JSON.parse(bruto);
    } catch (e) { /* cache e opcional; segue para leitura direta */ }
  }

  var mapa = {};
  try {
    var tabela = lerTabela(ABAS.CONFIG);
    tabela.linhas.forEach(function (linha) {
      var chave = String(linha.chave || '').trim();
      if (chave) mapa[chave] = linha.valor;
    });
  } catch (e) {
    // Aba ainda nao existe (pre-setup). Retorna vazio e deixa os padroes agirem.
    return {};
  }

  if (cache) {
    try { cache.put(chaveCache, JSON.stringify(mapa), CACHE_TTL_SEGUNDOS); } catch (e) {}
  }
  return mapa;
}

/**
 * Le uma configuracao com valor padrao.
 * @param {string} chave
 * @param {*=} padrao
 * @return {*}
 */
function obterConfig(chave, padrao) {
  var todas = obterConfigTodas();
  var valor = todas[chave];
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    return padrao;
  }
  return valor;
}

/**
 * Le uma configuracao numerica.
 * @param {string} chave
 * @param {number} padrao
 * @return {number}
 */
function obterConfigNumero(chave, padrao) {
  var valor = obterConfig(chave, null);
  if (valor === null) return padrao;
  var numero = _paraNumero(valor);
  return isNaN(numero) ? padrao : numero;
}

/**
 * Le uma configuracao booleana (SIM/NAO, true/false, 1/0).
 * @param {string} chave
 * @param {boolean} padrao
 * @return {boolean}
 */
function obterConfigBooleano(chave, padrao) {
  var valor = obterConfig(chave, null);
  if (valor === null) return padrao;
  var texto = normalizarTexto(String(valor));
  return ['sim', 'true', '1', 'yes', 'y', 's'].indexOf(texto) !== -1;
}

/**
 * Grava (ou cria) uma configuracao.
 * @param {string} chave
 * @param {*} valor
 * @param {string=} descricao
 */
function definirConfig(chave, valor, descricao) {
  var existente = buscarPorId(ABAS.CONFIG, 'chave', chave);
  if (existente) {
    var campos = { valor: valor };
    if (descricao) campos.descricao = descricao;
    atualizarLinhaPorNumero(ABAS.CONFIG, existente._linha, campos);
  } else {
    adicionarLinha(ABAS.CONFIG, {
      chave: chave, valor: valor, descricao: descricao || ''
    });
  }
  var cache = CacheService.getDocumentCache();
  if (cache) { try { cache.remove('config_todas'); } catch (e) {} }
}

/** @return {string} Fuso horario configurado (padrao America/Sao_Paulo). */
function obterFusoHorario() {
  try {
    return String(obterConfig('fuso_horario', 'America/Sao_Paulo'));
  } catch (e) {
    return 'America/Sao_Paulo';
  }
}

/** @return {string} Codigo da moeda configurada (padrao BRL). */
function obterMoeda() {
  try {
    return String(obterConfig('moeda', 'BRL'));
  } catch (e) {
    return 'BRL';
  }
}

// ===========================================================================
// CACHE
// ===========================================================================

/**
 * Invalida o cache associado a uma aba.
 * @param {string} nomeAba
 * @private
 */
function _limparCacheTabela(nomeAba) {
  var cache = CacheService.getDocumentCache();
  if (!cache) return;
  try {
    if (nomeAba === ABAS.CONFIG) cache.remove('config_todas');
    if (nomeAba === ABAS.CATEGORIAS) cache.remove('categorias_nomes');
    cache.remove('indicadores');
  } catch (e) { /* cache e best-effort */ }
}

/** Limpa todo o cache conhecido do documento. */
function limparCache() {
  var cache = CacheService.getDocumentCache();
  if (!cache) return;
  try {
    cache.removeAll(['config_todas', 'categorias_nomes', 'indicadores', 'insights_ia']);
  } catch (e) {}
}

// ===========================================================================
// LOCK
// ===========================================================================

/**
 * Executa uma funcao sob lock do documento, evitando escritas concorrentes
 * (sidebar + menu + trigger ao mesmo tempo).
 * @param {function(): *} funcao
 * @param {number=} timeoutMs Padrao 20000.
 * @return {*} Retorno da funcao.
 */
function comLock(funcao, timeoutMs) {
  var lock = LockService.getDocumentLock();
  var obtido = false;
  try {
    obtido = lock.tryLock(timeoutMs || 20000);
    if (!obtido) {
      throw new Error('Sistema ocupado com outra operacao. Tente novamente em alguns segundos.');
    }
    return funcao();
  } finally {
    if (obtido) {
      try { lock.releaseLock(); } catch (e) {}
    }
  }
}

// ===========================================================================
// FORMATACAO E VALIDACAO
// ===========================================================================

/**
 * Formata um numero como moeda configurada.
 * @param {number} valor
 * @return {string} Ex.: "R$ 1.234,56"
 */
function formatarMoeda(valor) {
  var numero = _paraNumero(valor);
  if (isNaN(numero)) numero = 0;
  var simbolos = { BRL: 'R$', USD: 'US$', EUR: 'EUR ' };
  var moeda = obterMoeda();
  var simbolo = simbolos[moeda] || (moeda + ' ');

  var negativo = numero < 0;
  var absoluto = Math.abs(numero).toFixed(2);
  var partes = absoluto.split('.');
  // Separador de milhar no padrao pt-BR.
  partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  var texto = simbolo + ' ' + partes[0] + ',' + partes[1];
  return negativo ? '-' + texto : texto;
}

/**
 * Formata uma data como dd/MM/yyyy.
 * @param {Date|string|number} data
 * @return {string} String vazia se a data for invalida.
 */
function formatarData(data) {
  var d = converterParaData(data);
  if (!d) return '';
  return Utilities.formatDate(d, obterFusoHorario(), 'dd/MM/yyyy');
}

/**
 * Formata data e hora como dd/MM/yyyy HH:mm:ss.
 * @param {Date|string|number} data
 * @return {string}
 */
function formatarDataHora(data) {
  var d = converterParaData(data);
  if (!d) return '';
  return Utilities.formatDate(d, obterFusoHorario(), 'dd/MM/yyyy HH:mm:ss');
}

/**
 * Converte diversos formatos para Date, aceitando dd/mm/yyyy e yyyy-mm-dd.
 * @param {*} valor
 * @return {Date|null} null se nao for uma data valida.
 */
function converterParaData(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (Object.prototype.toString.call(valor) === '[object Date]') {
    return isNaN(valor.getTime()) ? null : valor;
  }
  if (typeof valor === 'number') {
    var porNumero = new Date(valor);
    return isNaN(porNumero.getTime()) ? null : porNumero;
  }

  var texto = String(valor).trim();
  if (!texto) return null;

  // dd/mm/yyyy ou dd-mm-yyyy
  var brasileira = texto.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (brasileira) {
    var dia = parseInt(brasileira[1], 10);
    var mes = parseInt(brasileira[2], 10);
    var ano = parseInt(brasileira[3], 10);
    var dataBr = new Date(ano, mes - 1, dia);
    // Valida overflow do tipo 31/02.
    if (dataBr.getFullYear() !== ano || dataBr.getMonth() !== mes - 1 || dataBr.getDate() !== dia) {
      return null;
    }
    return dataBr;
  }

  // yyyy-mm-dd (ISO simples, sem fuso, para nao "voltar" um dia)
  var iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    var anoIso = parseInt(iso[1], 10);
    var mesIso = parseInt(iso[2], 10);
    var diaIso = parseInt(iso[3], 10);
    var dataIso = new Date(anoIso, mesIso - 1, diaIso);
    if (dataIso.getFullYear() !== anoIso || dataIso.getMonth() !== mesIso - 1 ||
        dataIso.getDate() !== diaIso) {
      return null;
    }
    return dataIso;
  }

  var generica = new Date(texto);
  return isNaN(generica.getTime()) ? null : generica;
}

/**
 * Valida e normaliza um valor monetario.
 * Aceita "1.234,56", "1234.56" e numeros.
 * @param {*} valor
 * @param {Object=} opcoes {permitirZero: boolean, permitirNegativo: boolean}
 * @return {number} Valor normalizado com 2 casas.
 * @throws {Error} Se o valor for invalido.
 */
function validarValorMonetario(valor, opcoes) {
  opcoes = opcoes || {};
  var numero = _paraNumero(valor);
  if (isNaN(numero)) {
    throw new Error('Valor monetario invalido: "' + valor + '".');
  }
  if (!opcoes.permitirNegativo && numero < 0) {
    throw new Error('O valor deve ser positivo. O sinal e definido pelo tipo do lancamento.');
  }
  if (!opcoes.permitirZero && numero === 0) {
    throw new Error('O valor deve ser maior que zero.');
  }
  return arredondar2(numero);
}

/**
 * Converte texto/numero para number, tolerando formato pt-BR.
 * @param {*} valor
 * @return {number} NaN se nao converter.
 * @private
 */
function _paraNumero(valor) {
  if (typeof valor === 'number') return valor;
  if (valor === null || valor === undefined) return NaN;
  var texto = String(valor).trim();
  if (!texto) return NaN;

  // Remove simbolos de moeda e espacos.
  texto = texto.replace(/[R$\s ]/gi, '').replace(/US\$/gi, '').replace(/EUR/gi, '');

  var temVirgula = texto.indexOf(',') !== -1;
  var temPonto = texto.indexOf('.') !== -1;
  if (temVirgula && temPonto) {
    // O separador decimal e o ultimo que aparecer.
    if (texto.lastIndexOf(',') > texto.lastIndexOf('.')) {
      texto = texto.replace(/\./g, '').replace(',', '.');
    } else {
      texto = texto.replace(/,/g, '');
    }
  } else if (temVirgula) {
    texto = texto.replace(',', '.');
  }
  var numero = Number(texto);
  return isNaN(numero) ? NaN : numero;
}

/** Alias publico de _paraNumero, util para outros arquivos e testes. */
function paraNumero(valor) { return _paraNumero(valor); }

/**
 * Arredonda para 2 casas decimais evitando ruido de ponto flutuante.
 * @param {number} valor
 * @return {number}
 */
function arredondar2(valor) {
  var numero = _paraNumero(valor);
  if (isNaN(numero)) return 0;
  return Math.round((numero + Number.EPSILON) * 100) / 100;
}

/**
 * Normaliza texto para comparacao: minusculo, sem acento, sem espaco extra.
 * @param {string} texto
 * @return {string}
 */
function normalizarTexto(texto) {
  return String(texto === null || texto === undefined ? '' : texto)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// ===========================================================================
// AJUDANTES DE PERIODO
// ===========================================================================

/**
 * Chave de mes no formato yyyy-MM.
 * @param {Date|string} data
 * @return {string}
 */
function chaveMes(data) {
  var d = converterParaData(data) || new Date();
  return Utilities.formatDate(d, obterFusoHorario(), 'yyyy-MM');
}

/** @return {string} Chave do mes corrente. */
function mesAtual() { return chaveMes(new Date()); }

/**
 * Chave do mes deslocada em N meses (negativo = passado).
 * @param {string} chave yyyy-MM
 * @param {number} deslocamento
 * @return {string}
 */
function deslocarMes(chave, deslocamento) {
  var partes = String(chave).split('-');
  var ano = parseInt(partes[0], 10);
  var mes = parseInt(partes[1], 10) - 1 + deslocamento;
  var data = new Date(ano, mes, 1);
  return Utilities.formatDate(data, obterFusoHorario(), 'yyyy-MM');
}

/**
 * Diferenca aproximada em meses entre duas datas (pode ser fracionaria).
 * @param {Date} inicio
 * @param {Date} fim
 * @return {number}
 */
function mesesEntre(inicio, fim) {
  var a = converterParaData(inicio);
  var b = converterParaData(fim);
  if (!a || !b) return 0;
  var meses = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  meses += (b.getDate() - a.getDate()) / 30;
  return meses;
}

// ===========================================================================
// LOG
// ===========================================================================

/**
 * Registra uma linha na aba Logs. Nunca deve derrubar a operacao principal.
 * @param {string} nivel INFO | AVISO | ERRO
 * @param {string} funcao Nome da funcao de origem.
 * @param {string} mensagem
 * @param {*=} detalhes Serializado como JSON quando possivel.
 * @private
 */
function _registrarLog(nivel, funcao, mensagem, detalhes) {
  try {
    var textoDetalhes = '';
    if (detalhes !== undefined && detalhes !== null) {
      textoDetalhes = (typeof detalhes === 'string')
        ? detalhes
        : JSON.stringify(detalhes);
    }
    // Guarda-chuva final: nunca deixar segredo cair no log.
    textoDetalhes = _mascararSegredos(String(textoDetalhes)).slice(0, 4000);

    adicionarLinha(ABAS.LOGS, {
      data_hora: new Date(),
      nivel: nivel,
      funcao: String(funcao || ''),
      mensagem: _mascararSegredos(String(mensagem || '')).slice(0, 1000),
      detalhes: textoDetalhes
    });
  } catch (e) {
    // Ultimo recurso: console do Apps Script.
    console.error('Falha ao gravar log: ' + e.message);
  }
}

/**
 * Remove de um texto qualquer coisa que se pareca com chave de API.
 * @param {string} texto
 * @return {string}
 * @private
 */
function _mascararSegredos(texto) {
  return String(texto)
    .replace(/AIza[0-9A-Za-z\-_]{10,}/g, '[CHAVE_OCULTA]')
    .replace(/gsk_[0-9A-Za-z]{10,}/g, '[CHAVE_OCULTA]')
    .replace(/(key|apikey|api_key|token|authorization|bearer)\s*[:=]\s*[^\s,&"}]+/gi,
             '$1=[CHAVE_OCULTA]');
}

/** Log informativo. */
function logInfo(funcao, mensagem, detalhes) {
  _registrarLog('INFO', funcao, mensagem, detalhes);
}

/** Log de aviso. */
function logAviso(funcao, mensagem, detalhes) {
  _registrarLog('AVISO', funcao, mensagem, detalhes);
}

/** Log de erro. */
function logErro(funcao, mensagem, detalhes) {
  _registrarLog('ERRO', funcao, mensagem, detalhes);
}

/**
 * Mantem a aba Logs em tamanho saudavel, apagando as linhas mais antigas.
 * @param {number=} maximoLinhas Padrao 5000.
 */
function podarLogs(maximoLinhas) {
  var limite = maximoLinhas || 5000;
  var aba = obterAbaSegura(ABAS.LOGS);
  var total = aba.getLastRow() - 1;
  if (total <= limite) return;
  var excedente = total - limite;
  aba.deleteRows(2, excedente);
}
