/**
 * IA.gs
 * ---------------------------------------------------------------------------
 * Integracao OPCIONAL com IA (Google Gemini ou Groq) para transformar os
 * indicadores em sugestoes escritas em linguagem natural.
 *
 * Principios inegociaveis deste arquivo:
 *  1. A IA NAO calcula nada. Ela recebe numeros ja calculados pelo sistema e
 *     apenas interpreta. A planilha continua sendo a fonte de verdade.
 *  2. As chaves ficam em Script Properties (GEMINI_API_KEY / GROQ_API_KEY).
 *     Nunca no codigo, nunca na planilha, nunca no log.
 *  3. Sem chave, sem internet ou com erro na API, o sistema cai no gerador de
 *     sugestoes por regras e segue funcionando normalmente.
 *  4. Vai para a API um resumo agregado e compacto. Descricoes de transacoes
 *     so sao enviadas se o usuario ligar explicitamente a opcao.
 */

/** Nomes das propriedades de script que guardam as chaves. */
var PROPRIEDADE_CHAVE_GEMINI = 'GEMINI_API_KEY';
var PROPRIEDADE_CHAVE_GROQ = 'GROQ_API_KEY';

/** Onde guardamos o ultimo resultado bem-sucedido (para o painel). */
var PROPRIEDADE_ULTIMOS_INSIGHTS = 'ULTIMOS_INSIGHTS_JSON';
var PROPRIEDADE_ULTIMA_CHAMADA_IA = 'ULTIMA_CHAMADA_IA';

/** Modelos padrao por provedor. */
var MODELOS_PADRAO_IA = {
  gemini: 'gemini-2.0-flash',
  groq: 'llama-3.3-70b-versatile'
};

/** Aviso obrigatorio em toda saida de IA. */
var AVISO_IA = 'Sugestoes geradas por IA, nao constituem aconselhamento ' +
  'financeiro profissional.';

// ===========================================================================
// PONTO DE ENTRADA
// ===========================================================================

/**
 * Gera insights usando IA quando possivel, com fallback automatico por regras.
 *
 * @param {Object=} opcoes
 *   {boolean=} forcar        ignora o cache
 *   {string=} mes            mes de referencia (yyyy-MM)
 * @return {{resumo: string, sugestoes: Array, alertas: Array,
 *           observacoes: string, fonte: string, erro: (string|undefined)}}
 */
function gerarInsightsIA(opcoes) {
  var config = opcoes || {};
  var indicadores = gerarIndicadores(config.mes);

  // IA desligada: nem tenta.
  if (!obterConfigBooleano('usar_ia', false)) {
    var porRegras = gerarInsightsAutomaticosSemIA(indicadores);
    porRegras.observacoes += ' (IA desativada na aba Config.)';
    _guardarInsights(porRegras);
    return porRegras;
  }

  // Cache: evita gastar cota a cada clique.
  if (!config.forcar) {
    var doCache = obterUltimosInsightsEmCache();
    if (doCache && doCache.fonte && doCache.fonte.indexOf('IA') === 0) {
      doCache.doCache = true;
      return doCache;
    }
  }

  // Limite simples de frequencia, para nao estourar free tier sem perceber.
  var intervaloMinimo = obterConfigNumero('minutos_minimos_entre_chamadas_ia', 5);
  if (!config.forcar && intervaloMinimo > 0) {
    var ultima = _obterTimestampUltimaChamada();
    if (ultima && (new Date() - ultima) < intervaloMinimo * 60 * 1000) {
      var recente = obterUltimosInsightsEmCache();
      if (recente) {
        recente.observacoes = (recente.observacoes || '') +
          ' (reaproveitado: intervalo minimo entre chamadas de IA nao decorrido.)';
        return recente;
      }
    }
  }

  var provedor = normalizarTexto(obterConfig('provedor_ia', 'gemini'));
  var resultado;

  try {
    var resumo = montarResumoParaIA(indicadores);
    var prompt = _montarPrompt(resumo);
    var textoResposta;

    if (provedor === 'groq') {
      textoResposta = chamarGroqIA(prompt);
    } else if (provedor === 'gemini') {
      textoResposta = chamarGeminiIA(prompt);
    } else {
      throw new Error('Provedor de IA desconhecido: "' + provedor +
                      '". Use "gemini" ou "groq" na aba Config.');
    }

    resultado = parseRespostaIA(textoResposta);
    resultado.fonte = 'IA:' + provedor;
    // A IA nao e fonte de verdade: os alertas continuam vindo do sistema.
    resultado.alertas = indicadores.alertas;
    resultado.observacoes = (resultado.observacoes ? resultado.observacoes + ' ' : '') + AVISO_IA;

    _registrarChamadaIA();
    _guardarInsights(resultado);
    logInfo('gerarInsightsIA', 'Insights gerados via IA', { provedor: provedor });
    return resultado;

  } catch (e) {
    // Qualquer falha cai para regras. O usuario nunca fica sem resposta.
    logErro('gerarInsightsIA', 'Falha na IA, usando fallback por regras', e.message);
    var fallback = gerarInsightsAutomaticosSemIA(indicadores);
    fallback.fonte = 'REGRAS (fallback)';
    fallback.erro = _mensagemAmigavelErroIA(e.message);
    fallback.observacoes += ' A IA nao respondeu nesta execucao: ' + fallback.erro;
    _guardarInsights(fallback);
    return fallback;
  }
}

/**
 * Traduz erros tecnicos comuns em algo acionavel.
 * @param {string} mensagem
 * @return {string}
 * @private
 */
function _mensagemAmigavelErroIA(mensagem) {
  var texto = _mascararSegredos(String(mensagem || ''));
  var minuscula = texto.toLowerCase();
  if (minuscula.indexOf('chave') !== -1 || minuscula.indexOf('401') !== -1 ||
      minuscula.indexOf('403') !== -1) {
    return 'chave de API ausente ou invalida (verifique as Script Properties).';
  }
  if (minuscula.indexOf('429') !== -1 || minuscula.indexOf('quota') !== -1 ||
      minuscula.indexOf('rate') !== -1) {
    return 'limite de uso do provedor atingido. Tente novamente mais tarde.';
  }
  if (minuscula.indexOf('timeout') !== -1 || minuscula.indexOf('dns') !== -1) {
    return 'falha de rede ao contatar o provedor.';
  }
  return texto.slice(0, 200);
}

// ===========================================================================
// RESUMO ENVIADO A IA
// ===========================================================================

/**
 * Monta um resumo compacto e agregado dos indicadores.
 * Sem nomes de estabelecimento, sem descricoes de transacao e sem qualquer
 * identificacao pessoal, salvo se `enviar_resumo_para_ia` ampliar o escopo.
 *
 * @param {Object=} indicadores Reaproveita calculo existente.
 * @return {Object} Estrutura enxuta, segura para enviar.
 */
function montarResumoParaIA(indicadores) {
  var ind = indicadores || gerarIndicadores();
  var moeda = obterMoeda();

  var resumo = {
    moeda: moeda,
    mes_referencia: ind.mes,
    receitas: ind.receitas,
    despesas: ind.despesas,
    saldo: ind.saldo,
    taxa_poupanca_percentual: ind.taxaPoupanca,
    percentual_renda_guardado: ind.percentualGuardado,
    aportes_no_mes: ind.totalAportado,
    resgates_no_mes: ind.totalResgatado,
    despesa_media_mensal: ind.despesaMediaConfigurada,
    variacao_despesas_vs_mes_anterior_percentual: ind.variacaoDespesasPercentual,
    gastos_fixos_percentual: ind.gastosFixosVariaveis.percentualFixos,
    reserva: {
      existe: ind.reserva.existe,
      saldo: ind.reserva.saldo,
      valor_recomendado: ind.reserva.valorRecomendado,
      cobertura_meses: ind.reserva.coberturaMeses,
      meses_recomendados: ind.reserva.mesesRecomendados
    },
    top_categorias_despesa: ind.topCategorias.map(function (c) {
      return { categoria: c.categoria, total: c.total };
    }),
    metas: ind.metas
      .filter(function (m) { return String(m.tipo).toUpperCase() !== TIPOS_META.RESERVA; })
      .slice(0, 8)
      .map(function (m) {
        return {
          nome: m.nome,
          alvo: m.alvo,
          saldo: m.saldo,
          progresso_percentual: m.progresso,
          faltante: m.faltante,
          aporte_mensal: m.aporteMensal,
          meses_restantes_estimados: m.mesesRestantes,
          prazo: m.prazo || null
        };
      }),
    orcamentos_estourados: ind.orcamentosEstourados.map(function (o) {
      return { categoria: o.categoria, orcado: o.orcado, realizado: o.realizado };
    }),
    alertas_do_sistema: ind.alertas.slice(0, 10)
  };

  // Escopo ampliado apenas sob consentimento explicito na aba Config.
  if (obterConfigBooleano('enviar_resumo_para_ia', false)) {
    resumo.ultimos_lancamentos = listarLancamentos({ mes: ind.mes, limite: 20 })
      .map(function (l) {
        return {
          data: formatarData(l.data),
          tipo: l.tipo,
          valor: arredondar2(paraNumero(l.valor)),
          categoria: l.categoria
        };
      });
  }

  return resumo;
}

/**
 * Monta o prompt final enviado ao modelo.
 * @param {Object} resumo
 * @return {string}
 * @private
 */
function _montarPrompt(resumo) {
  return [
    'Voce e um assistente de organizacao financeira pessoal, falando em portugues do Brasil.',
    '',
    'REGRAS:',
    '- Os numeros abaixo ja foram calculados e estao corretos. NAO recalcule nada.',
    '- Nao invente valores, datas ou categorias que nao estejam nos dados.',
    '- Sugestoes curtas, praticas e educativas. Sem promessa de retorno e sem',
    '  recomendar produtos financeiros especificos.',
    '- Tom preventivo e respeitoso, nunca alarmista nem culpabilizador.',
    '- Maximo de 5 sugestoes, priorizando reserva de emergencia e equilibrio do mes.',
    '',
    'RESPONDA APENAS COM UM JSON VALIDO, sem texto antes ou depois, neste formato:',
    '{',
    '  "resumo": "2 a 3 frases sobre o mes",',
    '  "sugestoes": [{"titulo": "...", "descricao": "...", "prioridade": "alta|media|baixa"}],',
    '  "alertas": ["..."],',
    '  "observacoes": "..."',
    '}',
    '',
    'DADOS (moeda ' + resumo.moeda + '):',
    JSON.stringify(resumo)
  ].join('\n');
}

// ===========================================================================
// CHAMADAS AOS PROVEDORES
// ===========================================================================

/**
 * Le uma chave de API das Script Properties.
 * @param {string} nomePropriedade
 * @return {string}
 * @throws {Error} Se nao estiver configurada.
 * @private
 */
function _obterChaveApi(nomePropriedade) {
  var chave = '';
  try {
    chave = PropertiesService.getScriptProperties().getProperty(nomePropriedade) || '';
  } catch (e) {
    throw new Error('Nao foi possivel ler as Script Properties: ' + e.message);
  }
  chave = String(chave).trim();
  if (!chave) {
    throw new Error('Chave de API ausente. Cadastre "' + nomePropriedade +
      '" em Configuracoes do projeto > Propriedades do script.');
  }
  return chave;
}

/**
 * Chama a API do Google Gemini.
 * @param {string} prompt
 * @return {string} Texto bruto devolvido pelo modelo.
 */
function chamarGeminiIA(prompt) {
  var chave = _obterChaveApi(PROPRIEDADE_CHAVE_GEMINI);
  var modelo = String(obterConfig('modelo_ia', MODELOS_PADRAO_IA.gemini)).trim() ||
    MODELOS_PADRAO_IA.gemini;

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(modelo) + ':generateContent';

  var corpo = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 1200,
      responseMimeType: 'application/json'
    }
  };

  var resposta = _requisicaoComRetry(url, {
    method: 'post',
    contentType: 'application/json',
    // A chave vai em header, nunca na URL (URLs acabam em logs).
    headers: { 'x-goog-api-key': chave },
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true
  }, 'Gemini');

  var dados = JSON.parse(resposta);
  if (dados.promptFeedback && dados.promptFeedback.blockReason) {
    throw new Error('Conteudo bloqueado pelo provedor: ' + dados.promptFeedback.blockReason);
  }
  var candidatos = dados.candidates || [];
  if (!candidatos.length || !candidatos[0].content || !candidatos[0].content.parts) {
    throw new Error('Resposta do Gemini sem conteudo utilizavel.');
  }
  return candidatos[0].content.parts.map(function (p) { return p.text || ''; }).join('');
}

/**
 * Chama a API da Groq (formato compativel com OpenAI chat/completions).
 * @param {string} prompt
 * @return {string} Texto bruto devolvido pelo modelo.
 */
function chamarGroqIA(prompt) {
  var chave = _obterChaveApi(PROPRIEDADE_CHAVE_GROQ);
  var modelo = String(obterConfig('modelo_ia', MODELOS_PADRAO_IA.groq)).trim() ||
    MODELOS_PADRAO_IA.groq;

  var corpo = {
    model: modelo,
    temperature: 0.4,
    max_tokens: 1200,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'Voce responde exclusivamente com JSON valido, em portugues do Brasil.'
      },
      { role: 'user', content: prompt }
    ]
  };

  var resposta = _requisicaoComRetry('https://api.groq.com/openai/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + chave },
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true
  }, 'Groq');

  var dados = JSON.parse(resposta);
  var escolhas = dados.choices || [];
  if (!escolhas.length || !escolhas[0].message) {
    throw new Error('Resposta da Groq sem conteudo utilizavel.');
  }
  return String(escolhas[0].message.content || '');
}

/**
 * Executa a requisicao HTTP com retry limitado e backoff simples.
 * Trata 429/5xx como temporarios; 4xx restantes falham de imediato.
 *
 * @param {string} url
 * @param {Object} opcoes Opcoes de UrlFetchApp.
 * @param {string} nomeProvedor Usado apenas em mensagens de erro.
 * @return {string} Corpo da resposta.
 * @private
 */
function _requisicaoComRetry(url, opcoes, nomeProvedor) {
  var tentativasMaximas = Math.max(obterConfigNumero('tentativas_ia', 3), 1);
  var ultimoErro = '';

  for (var tentativa = 1; tentativa <= tentativasMaximas; tentativa++) {
    try {
      var resposta = UrlFetchApp.fetch(url, opcoes);
      var codigo = resposta.getResponseCode();
      var corpo = resposta.getContentText();

      if (codigo >= 200 && codigo < 300) return corpo;

      // Nunca logamos o corpo inteiro: pode conter eco de cabecalhos.
      var trecho = _mascararSegredos(String(corpo)).slice(0, 300);

      if (codigo === 429 || codigo >= 500) {
        ultimoErro = nomeProvedor + ' retornou HTTP ' + codigo + ': ' + trecho;
        if (tentativa < tentativasMaximas) {
          // Backoff: 1s, 2s, 4s... com um jitter pequeno.
          Utilities.sleep(Math.pow(2, tentativa - 1) * 1000 + Math.floor(Math.random() * 300));
          continue;
        }
        if (codigo === 429) {
          throw new Error('Limite de requisicoes (429) do provedor ' + nomeProvedor +
            ' atingido. Aguarde alguns minutos e tente novamente.');
        }
        throw new Error(ultimoErro);
      }

      throw new Error(nomeProvedor + ' retornou HTTP ' + codigo + ': ' + trecho);

    } catch (e) {
      ultimoErro = e.message;
      var temporario = /Address unavailable|Timeout|timed out|DNS|Service invoked too many/i
        .test(String(e.message));
      if (temporario && tentativa < tentativasMaximas) {
        Utilities.sleep(Math.pow(2, tentativa - 1) * 1000);
        continue;
      }
      throw new Error(_mascararSegredos(ultimoErro));
    }
  }
  throw new Error(_mascararSegredos(ultimoErro || 'Falha desconhecida ao chamar ' + nomeProvedor));
}

// ===========================================================================
// PARSING TOLERANTE
// ===========================================================================

/**
 * Converte a resposta do modelo em objeto estruturado.
 * Aceita JSON puro, JSON dentro de blocos markdown e, em ultimo caso, texto
 * livre (que vira o campo `resumo`).
 *
 * @param {string} texto
 * @return {{resumo: string, sugestoes: Array, alertas: Array, observacoes: string}}
 */
function parseRespostaIA(texto) {
  var bruto = String(texto || '').trim();
  if (!bruto) {
    return {
      resumo: 'A IA nao retornou conteudo.',
      sugestoes: [], alertas: [], observacoes: ''
    };
  }

  var candidato = bruto;

  // Remove cercas de markdown do tipo ```json ... ```
  var cerca = candidato.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (cerca) candidato = cerca[1].trim();

  // Recorta do primeiro "{" ao ultimo "}".
  var inicio = candidato.indexOf('{');
  var fim = candidato.lastIndexOf('}');
  if (inicio !== -1 && fim > inicio) {
    candidato = candidato.slice(inicio, fim + 1);
  }

  var dados = null;
  try {
    dados = JSON.parse(candidato);
  } catch (e) {
    logAviso('parseRespostaIA', 'Resposta nao era JSON valido; tratada como texto livre');
  }

  if (!dados || typeof dados !== 'object') {
    return {
      resumo: bruto.slice(0, 1500),
      sugestoes: [],
      alertas: [],
      observacoes: 'A IA respondeu em texto livre; o conteudo foi exibido sem estruturacao.'
    };
  }

  return {
    resumo: String(dados.resumo || dados.summary || '').slice(0, 2000),
    sugestoes: _normalizarSugestoes(dados.sugestoes || dados.suggestions),
    alertas: _normalizarListaTexto(dados.alertas || dados.alerts),
    observacoes: String(dados.observacoes || dados.notes || '').slice(0, 1000)
  };
}

/**
 * Normaliza a lista de sugestoes vinda do modelo.
 * @param {*} lista
 * @return {Array<{titulo: string, descricao: string, prioridade: string}>}
 * @private
 */
function _normalizarSugestoes(lista) {
  if (!Array.isArray(lista)) return [];
  var prioridadesValidas = ['alta', 'media', 'baixa'];

  return lista.slice(0, 8).map(function (item) {
    if (typeof item === 'string') {
      return { titulo: item.slice(0, 120), descricao: '', prioridade: 'media' };
    }
    if (!item || typeof item !== 'object') {
      return { titulo: '', descricao: '', prioridade: 'media' };
    }
    var prioridade = normalizarTexto(item.prioridade || item.priority || 'media');
    if (prioridadesValidas.indexOf(prioridade) === -1) prioridade = 'media';
    return {
      titulo: String(item.titulo || item.title || '').slice(0, 160),
      descricao: String(item.descricao || item.description || '').slice(0, 600),
      prioridade: prioridade
    };
  }).filter(function (s) { return s.titulo || s.descricao; });
}

/**
 * Normaliza uma lista de strings.
 * @param {*} lista
 * @return {Array<string>}
 * @private
 */
function _normalizarListaTexto(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.slice(0, 12)
    .map(function (item) { return String(item || '').slice(0, 400); })
    .filter(function (item) { return item.trim() !== ''; });
}

// ===========================================================================
// CACHE E PERSISTENCIA DO ULTIMO RESULTADO
// ===========================================================================

/**
 * Guarda o ultimo pacote de insights em cache e em propriedades do documento.
 * @param {Object} insights
 * @private
 */
function _guardarInsights(insights) {
  var pacote = JSON.stringify({
    dados: insights,
    geradoEm: new Date().toISOString()
  });

  try {
    var cache = CacheService.getDocumentCache();
    if (cache) {
      var ttl = Math.min(Math.max(obterConfigNumero('minutos_cache_ia', 60), 1), 360) * 60;
      cache.put('insights_ia', pacote, ttl);
    }
  } catch (e) { /* cache e opcional */ }

  try {
    PropertiesService.getDocumentProperties()
      .setProperty(PROPRIEDADE_ULTIMOS_INSIGHTS, pacote.slice(0, 9000));
  } catch (e) {
    logAviso('_guardarInsights', 'Nao foi possivel persistir os insights', e.message);
  }
}

/**
 * Recupera os ultimos insights (cache curto ou propriedade do documento).
 * @return {Object|null}
 */
function obterUltimosInsightsEmCache() {
  var pacote = null;
  try {
    var cache = CacheService.getDocumentCache();
    if (cache) pacote = cache.get('insights_ia');
  } catch (e) { /* segue para as propriedades */ }

  if (!pacote) {
    try {
      pacote = PropertiesService.getDocumentProperties()
        .getProperty(PROPRIEDADE_ULTIMOS_INSIGHTS);
    } catch (e) { return null; }
  }
  if (!pacote) return null;

  try {
    var objeto = JSON.parse(pacote);
    var dados = objeto.dados || null;
    if (dados) dados.geradoEm = objeto.geradoEm;
    return dados;
  } catch (e) {
    return null;
  }
}

/** Registra o instante da ultima chamada efetiva a IA. @private */
function _registrarChamadaIA() {
  try {
    PropertiesService.getDocumentProperties()
      .setProperty(PROPRIEDADE_ULTIMA_CHAMADA_IA, new Date().toISOString());
  } catch (e) { /* nao critico */ }
}

/** @return {Date|null} Instante da ultima chamada a IA. @private */
function _obterTimestampUltimaChamada() {
  try {
    var texto = PropertiesService.getDocumentProperties()
      .getProperty(PROPRIEDADE_ULTIMA_CHAMADA_IA);
    return texto ? new Date(texto) : null;
  } catch (e) {
    return null;
  }
}

// ===========================================================================
// DIAGNOSTICO
// ===========================================================================

/**
 * Diz o que esta configurado, sem revelar nenhuma chave.
 * @return {{usarIa: boolean, provedor: string, modelo: string,
 *           chaveGeminiConfigurada: boolean, chaveGroqConfigurada: boolean,
 *           enviarResumoDetalhado: boolean, pronto: boolean, mensagem: string}}
 */
function obterStatusIA() {
  var propriedades = {};
  try {
    propriedades = PropertiesService.getScriptProperties().getProperties() || {};
  } catch (e) { /* segue com o que der */ }

  var provedor = normalizarTexto(obterConfig('provedor_ia', 'gemini'));
  var temGemini = !!String(propriedades[PROPRIEDADE_CHAVE_GEMINI] || '').trim();
  var temGroq = !!String(propriedades[PROPRIEDADE_CHAVE_GROQ] || '').trim();
  var usarIa = obterConfigBooleano('usar_ia', false);

  var chaveDoProvedor = (provedor === 'groq') ? temGroq : temGemini;
  var pronto = usarIa && chaveDoProvedor;

  var mensagem;
  if (!usarIa) {
    mensagem = 'IA desativada (usar_ia = NAO na aba Config). ' +
               'O sistema usa sugestoes por regras.';
  } else if (!chaveDoProvedor) {
    mensagem = 'IA ativada, mas a chave do provedor "' + provedor +
               '" nao esta cadastrada nas Script Properties.';
  } else {
    mensagem = 'IA pronta para uso com o provedor "' + provedor + '".';
  }

  return {
    usarIa: usarIa,
    provedor: provedor,
    modelo: String(obterConfig('modelo_ia', MODELOS_PADRAO_IA[provedor] || '')),
    chaveGeminiConfigurada: temGemini,
    chaveGroqConfigurada: temGroq,
    enviarResumoDetalhado: obterConfigBooleano('enviar_resumo_para_ia', false),
    pronto: pronto,
    mensagem: mensagem
  };
}

/**
 * Faz uma chamada minima ao provedor para validar chave e modelo.
 * @return {{sucesso: boolean, mensagem: string}}
 */
function testarConexaoIA() {
  var status = obterStatusIA();
  if (!status.usarIa) {
    return { sucesso: false, mensagem: status.mensagem };
  }
  try {
    var prompt = 'Responda apenas com este JSON: ' +
      '{"resumo":"ok","sugestoes":[],"alertas":[],"observacoes":"teste"}';
    var texto = (status.provedor === 'groq')
      ? chamarGroqIA(prompt)
      : chamarGeminiIA(prompt);
    var analisado = parseRespostaIA(texto);
    _registrarChamadaIA();
    return {
      sucesso: true,
      mensagem: 'Conexao com ' + status.provedor + ' (' + status.modelo +
                ') funcionando. Resposta: "' + (analisado.resumo || '').slice(0, 80) + '".'
    };
  } catch (e) {
    logErro('testarConexaoIA', 'Teste de conexao falhou', e.message);
    return { sucesso: false, mensagem: _mensagemAmigavelErroIA(e.message) };
  }
}
