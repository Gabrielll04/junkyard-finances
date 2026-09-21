/**
 * ImportacaoFutura.gs
 * ---------------------------------------------------------------------------
 * Estrutura preparada para a futura importacao de holerites e comprovantes.
 *
 * O QUE EXISTE HOJE (funcional):
 *  - a aba Importacao_Futura, com todas as colunas de metadados;
 *  - o registro manual de um documento na fila (registrarDocumentoParaImportacao);
 *  - a criacao de um lancamento a partir de dados ja validados
 *    (criarLancamentoAPartirImportacao), que e o passo final do fluxo.
 *
 * O QUE AINDA NAO EXISTE (stubs explicitos):
 *  - extracao de texto do PDF/imagem (OCR);
 *  - interpretacao do holerite/comprovante por IA;
 *  - varredura automatica da pasta do Drive.
 *
 * Os stubs devolvem sempre um objeto com `implementado: false` e mensagem
 * clara. Nenhum deles lanca excecao que possa derrubar outra parte do sistema.
 */

/** Status possiveis de um item da fila de importacao. */
var STATUS_IMPORTACAO = {
  PENDENTE: 'PENDENTE',
  PROCESSADO: 'PROCESSADO',
  ERRO: 'ERRO',
  IGNORADO: 'IGNORADO'
};

/** Tipos de documento previstos. */
var TIPOS_DOCUMENTO = {
  HOLERITE: 'HOLERITE',
  COMPROVANTE: 'COMPROVANTE',
  EXTRATO: 'EXTRATO',
  NOTA_FISCAL: 'NOTA_FISCAL',
  OUTRO: 'OUTRO'
};

/** Mensagem unica usada por todos os stubs. */
var MENSAGEM_FUTURA = 'Funcionalidade futura nao implementada. ' +
  'A estrutura de dados ja esta pronta: veja a aba "' + 'Importacao_Futura' + '".';

// ===========================================================================
// PREPARACAO (funcional)
// ===========================================================================

/**
 * Garante a aba de importacao e informa o que ja esta pronto.
 * @return {{sucesso: boolean, mensagem: string, pastaConfigurada: boolean}}
 */
function prepararImportacaoDocumentos() {
  try {
    garantirCabecalhos(ABAS.IMPORTACAO);
    var pasta = String(obterConfig('pasta_importacao_drive', '')).trim();

    logInfo('prepararImportacaoDocumentos', 'Estrutura de importacao verificada');
    return {
      sucesso: true,
      pastaConfigurada: !!pasta,
      mensagem: 'Aba de importacao pronta. ' +
        (pasta
          ? 'Pasta do Drive configurada: ' + pasta + '.'
          : 'Defina "pasta_importacao_drive" na aba Config quando for usar.') +
        ' A leitura automatica de documentos ainda nao esta implementada.'
    };
  } catch (e) {
    logErro('prepararImportacaoDocumentos', 'Falha ao preparar importacao', e.message);
    return { sucesso: false, pastaConfigurada: false, mensagem: e.message };
  }
}

/**
 * Registra um documento na fila de importacao (metadados apenas).
 * Ja funciona hoje: permite acompanhar o que foi enviado, mesmo com a
 * extracao ainda manual.
 *
 * @param {Object} payload
 *   {string=} tipo_documento   HOLERITE|COMPROVANTE|EXTRATO|NOTA_FISCAL|OUTRO
 *   {string=} arquivo_id_drive
 *   {string=} arquivo_url
 *   {string=} nome_arquivo
 *   {string=} observacoes
 * @return {{sucesso: boolean, id: string, mensagem: string}}
 */
function registrarDocumentoParaImportacao(payload) {
  return comLock(function () {
    var dados = payload || {};
    var tipo = String(dados.tipo_documento || TIPOS_DOCUMENTO.OUTRO).toUpperCase();
    if (!TIPOS_DOCUMENTO[tipo]) tipo = TIPOS_DOCUMENTO.OUTRO;

    var id = gerarId(PREFIXOS_ID.IMPORTACAO);
    adicionarLinha(ABAS.IMPORTACAO, {
      id_importacao: id,
      data_upload: new Date(),
      tipo_documento: tipo,
      arquivo_id_drive: String(dados.arquivo_id_drive || ''),
      arquivo_url: String(dados.arquivo_url || ''),
      nome_arquivo: String(dados.nome_arquivo || ''),
      status: STATUS_IMPORTACAO.PENDENTE,
      dados_extraidos_json: '',
      valor_extraido: '',
      data_documento: '',
      categoria_sugerida: '',
      meta_sugerida: '',
      lancamento_id: '',
      observacoes: String(dados.observacoes || '')
    });

    logInfo('registrarDocumentoParaImportacao', 'Documento registrado na fila',
            { id: id, tipo: tipo });
    return {
      sucesso: true, id: id,
      mensagem: 'Documento registrado na fila com status PENDENTE. ' +
        'A extracao automatica sera implementada em uma versao futura.'
    };
  });
}

/**
 * Lista os itens da fila de importacao.
 * @param {string=} status Filtra por status.
 * @return {Array<Object>}
 */
function listarFilaImportacao(status) {
  var alvo = status ? String(status).toUpperCase() : null;
  return lerTabela(ABAS.IMPORTACAO).linhas.filter(function (linha) {
    if (!String(linha.id_importacao || '').trim()) return false;
    if (!alvo) return true;
    return String(linha.status || '').toUpperCase() === alvo;
  });
}

// ===========================================================================
// STUBS (nao implementados de proposito)
// ===========================================================================

/**
 * STUB. Importara um holerite a partir de um arquivo do Drive.
 *
 * Fluxo previsto:
 *   1. baixar o arquivo do Drive;
 *   2. extrairDadosDocumentoStub -> texto + campos;
 *   3. identificar salario bruto, descontos, salario liquido e competencia;
 *   4. propor um lancamento de RECEITA (liquido) e, opcionalmente, despesas
 *      para os descontos;
 *   5. aguardar a confirmacao do usuario antes de gravar.
 *
 * @param {string} fileId ID do arquivo no Drive.
 * @return {{implementado: boolean, mensagem: string, fileId: string}}
 */
function importarHoleriteStub(fileId) {
  logInfo('importarHoleriteStub', 'Stub acionado', { fileId: String(fileId || '') });
  return {
    implementado: false,
    fileId: String(fileId || ''),
    mensagem: MENSAGEM_FUTURA + ' Previsto: extrair bruto, descontos, liquido e competencia ' +
      'do holerite e propor os lancamentos correspondentes.'
  };
}

/**
 * STUB. Importara um comprovante (nota, recibo, transferencia).
 *
 * @param {string} fileId ID do arquivo no Drive.
 * @return {{implementado: boolean, mensagem: string, fileId: string}}
 */
function importarComprovanteStub(fileId) {
  logInfo('importarComprovanteStub', 'Stub acionado', { fileId: String(fileId || '') });
  return {
    implementado: false,
    fileId: String(fileId || ''),
    mensagem: MENSAGEM_FUTURA + ' Previsto: extrair data, valor, estabelecimento e ' +
      'sugerir a categoria da despesa.'
  };
}

/**
 * STUB. Extraira o texto e os campos estruturados de um documento.
 *
 * Caminho tecnico previsto (todos viaveis no Apps Script):
 *   a) Drive API avancada: converter PDF/imagem em Google Doc, que aplica OCR;
 *   b) enviar o texto resultante para a IA ja integrada em IA.gs, pedindo JSON;
 *   c) validar o JSON com validarDadosExtraidosStub antes de qualquer gravacao.
 *
 * @param {string} fileId ID do arquivo no Drive.
 * @return {{implementado: boolean, mensagem: string, dados: null}}
 */
function extrairDadosDocumentoStub(fileId) {
  logInfo('extrairDadosDocumentoStub', 'Stub acionado', { fileId: String(fileId || '') });
  return {
    implementado: false,
    dados: null,
    mensagem: MENSAGEM_FUTURA + ' Previsto: OCR via Drive API (conversao para Google Doc) ' +
      'seguido de interpretacao por IA devolvendo JSON estruturado.'
  };
}

/**
 * STUB parcialmente util: ja valida a FORMA dos dados extraidos.
 * Esta validacao e sincera e funciona hoje, o que permite testar o restante
 * do fluxo sem OCR.
 *
 * @param {Object} payload Dados extraidos (ou digitados a mao).
 * @return {{valido: boolean, erros: Array<string>, normalizado: Object|null}}
 */
function validarDadosExtraidosStub(payload) {
  var dados = payload || {};
  var erros = [];

  var data = converterParaData(dados.data);
  if (!data) erros.push('Data do documento ausente ou invalida.');

  var valor = paraNumero(dados.valor);
  if (isNaN(valor)) erros.push('Valor ausente ou nao numerico.');
  else if (valor <= 0) erros.push('Valor deve ser maior que zero.');

  var tipo = String(dados.tipo || '').toUpperCase();
  if (tipo && !TIPOS_LANCAMENTO[tipo]) {
    erros.push('Tipo de lancamento invalido: "' + dados.tipo + '".');
  }

  if (erros.length) {
    return { valido: false, erros: erros, normalizado: null };
  }

  return {
    valido: true,
    erros: [],
    normalizado: {
      data: data,
      valor: arredondar2(valor),
      tipo: tipo || TIPOS_LANCAMENTO.DESPESA,
      categoria: String(dados.categoria || 'Outros'),
      descricao: String(dados.descricao || ''),
      meta_id: String(dados.meta_id || '')
    }
  };
}

/**
 * Cria um lancamento a partir de dados de importacao ja validados e
 * confirmados pelo usuario. Esta parte do fluxo JA FUNCIONA: e o ponto de
 * chegada de qualquer extracao futura.
 *
 * @param {Object} payload Dados do lancamento (mesmo formato de registrarLancamento)
 *                         com o campo extra `id_importacao`.
 * @return {{sucesso: boolean, mensagem: string, id_lancamento: (string|undefined)}}
 */
function criarLancamentoAPartirImportacao(payload) {
  try {
    var dados = payload || {};
    var validacao = validarDadosExtraidosStub(dados);
    if (!validacao.valido) {
      return {
        sucesso: false,
        mensagem: 'Dados invalidos: ' + validacao.erros.join(' ')
      };
    }

    var normalizado = validacao.normalizado;
    normalizado.origem = 'IMPORTACAO';
    var lancamento = registrarLancamento(normalizado, { permitirDuplicado: false });

    // Fecha o item da fila, se ele foi informado.
    var idImportacao = String(dados.id_importacao || '').trim();
    if (idImportacao) {
      atualizarLinhaPorId(ABAS.IMPORTACAO, 'id_importacao', idImportacao, {
        status: STATUS_IMPORTACAO.PROCESSADO,
        valor_extraido: normalizado.valor,
        data_documento: normalizado.data,
        categoria_sugerida: normalizado.categoria,
        lancamento_id: lancamento.id_lancamento,
        dados_extraidos_json: JSON.stringify({
          data: formatarData(normalizado.data),
          valor: normalizado.valor,
          tipo: normalizado.tipo,
          categoria: normalizado.categoria
        })
      });
    }

    logInfo('criarLancamentoAPartirImportacao', 'Lancamento criado a partir de importacao',
            { id_lancamento: lancamento.id_lancamento, id_importacao: idImportacao });

    return {
      sucesso: true,
      id_lancamento: lancamento.id_lancamento,
      mensagem: 'Lancamento criado: ' + lancamento.tipo + ' de ' +
        formatarMoeda(lancamento.valor) + ' em ' + formatarData(lancamento.data) + '.'
    };

  } catch (e) {
    logErro('criarLancamentoAPartirImportacao', 'Falha ao criar lancamento', e.message);
    var idFalha = String((payload || {}).id_importacao || '').trim();
    if (idFalha) {
      try {
        atualizarLinhaPorId(ABAS.IMPORTACAO, 'id_importacao', idFalha, {
          status: STATUS_IMPORTACAO.ERRO,
          observacoes: e.message.slice(0, 500)
        });
      } catch (erroInterno) { /* nao piora a situacao */ }
    }
    return { sucesso: false, mensagem: e.message };
  }
}

/**
 * STUB. Varrera a pasta configurada no Drive em busca de documentos novos.
 *
 * @return {{implementado: boolean, mensagem: string}}
 */
function varrerPastaDriveStub() {
  var pasta = String(obterConfig('pasta_importacao_drive', '')).trim();
  logInfo('varrerPastaDriveStub', 'Stub acionado', { pasta: pasta });
  return {
    implementado: false,
    mensagem: MENSAGEM_FUTURA +
      (pasta
        ? ' Pasta configurada: ' + pasta + '.'
        : ' Nenhuma pasta configurada em "pasta_importacao_drive".') +
      ' Previsto: listar arquivos novos, registrar cada um na fila e disparar a extracao.'
  };
}
