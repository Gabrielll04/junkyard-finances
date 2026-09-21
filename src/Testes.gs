/**
 * Testes.gs
 * ---------------------------------------------------------------------------
 * Bateria de testes executavel dentro da propria planilha.
 *
 * Como os testes funcionam:
 *  - funcoes puras (Previsoes.gs) sao testadas diretamente, sem tocar em dados;
 *  - funcoes de escrita criam registros marcados com origem "TESTE" e nome
 *    prefixado por "[TESTE]", e o proprio teste os remove no final;
 *  - se um teste falhar no meio, a limpeza ainda roda (bloco finally), para a
 *    planilha nunca ficar suja.
 *
 * Rode por "Financeiro > Dados > Executar testes" ou chamando
 * executarTodosOsTestes() no editor.
 */

/** Marcadores usados para identificar (e limpar) dados de teste. */
var MARCADOR_TESTE = 'TESTE';
var PREFIXO_NOME_TESTE = '[TESTE] ';

/** Tolerancia padrao das comparacoes de ponto flutuante. */
var TOLERANCIA_TESTE = 0.01;

// ===========================================================================
// INFRAESTRUTURA DE TESTE
// ===========================================================================

/**
 * Cria um contexto de teste com asserts e registro de limpeza.
 * @param {string} nome Nome do teste.
 * @return {Object}
 * @private
 */
function _novoContextoTeste(nome) {
  return {
    nome: nome,
    verificacoes: 0,
    metasCriadas: [],
    lancamentosCriados: [],
    movimentosCriados: [],

    /** Afirma que uma condicao e verdadeira. */
    afirmar: function (condicao, descricao) {
      this.verificacoes++;
      if (!condicao) {
        throw new Error('[' + this.nome + '] Falhou: ' + descricao);
      }
    },

    /** Afirma igualdade estrita. */
    afirmarIgual: function (obtido, esperado, descricao) {
      this.verificacoes++;
      if (obtido !== esperado) {
        throw new Error('[' + this.nome + '] ' + descricao +
          ' | esperado: ' + esperado + ' | obtido: ' + obtido);
      }
    },

    /** Afirma igualdade numerica com tolerancia. */
    afirmarProximo: function (obtido, esperado, descricao, tolerancia) {
      this.verificacoes++;
      var limite = tolerancia === undefined ? TOLERANCIA_TESTE : tolerancia;
      if (isNaN(obtido) || Math.abs(obtido - esperado) > limite) {
        throw new Error('[' + this.nome + '] ' + descricao +
          ' | esperado: ~' + esperado + ' | obtido: ' + obtido);
      }
    },

    /** Afirma que uma funcao lanca erro. */
    afirmarErro: function (funcao, descricao) {
      this.verificacoes++;
      var lancou = false;
      try { funcao(); } catch (e) { lancou = true; }
      if (!lancou) {
        throw new Error('[' + this.nome + '] Deveria ter lancado erro: ' + descricao);
      }
    },

    /** Remove tudo o que o teste criou. */
    limpar: function () {
      var contexto = this;
      try {
        // Movimentos primeiro, depois lancamentos, depois metas.
        _removerLinhasPorIds(ABAS.METAS_MOVIMENTOS, 'id_movimento', contexto.movimentosCriados);
        _removerLinhasPorIds(ABAS.LANCAMENTOS, 'id_lancamento', contexto.lancamentosCriados);
        // Lancamentos espelho gerados pelos aportes de teste.
        _removerLancamentosEspelhoOrfaos();
        _removerLinhasPorIds(ABAS.METAS, 'id_meta', contexto.metasCriadas);
        limparCache();
      } catch (e) {
        logErro('_novoContextoTeste.limpar',
                'Falha ao limpar dados do teste ' + contexto.nome, e.message);
      }
    }
  };
}

/**
 * Remove varias linhas por ID, de baixo para cima.
 * @param {string} nomeAba
 * @param {string} colunaId
 * @param {Array<string>} ids
 * @private
 */
function _removerLinhasPorIds(nomeAba, colunaId, ids) {
  if (!ids || !ids.length) return;
  var conjunto = {};
  ids.forEach(function (id) {
    if (id) conjunto[String(id).trim().toUpperCase()] = true;
  });

  var aba = obterAbaSegura(nomeAba);
  lerTabela(nomeAba).linhas
    .filter(function (linha) {
      return conjunto[String(linha[colunaId] || '').trim().toUpperCase()];
    })
    .map(function (linha) { return linha._linha; })
    .sort(function (a, b) { return b - a; })
    .forEach(function (numero) { aba.deleteRow(numero); });
}

/**
 * Remove lancamentos-espelho cujo movimento de meta ja nao existe.
 * @private
 */
function _removerLancamentosEspelhoOrfaos() {
  var existentes = {};
  lerTabela(ABAS.METAS_MOVIMENTOS).linhas.forEach(function (m) {
    existentes[String(m.id_movimento || '').trim()] = true;
  });

  var aba = obterAbaSegura(ABAS.LANCAMENTOS);
  lerTabela(ABAS.LANCAMENTOS).linhas
    .filter(function (l) {
      var origem = String(l.origem || '');
      return origem.indexOf('META:') === 0 && !existentes[origem.slice(5)];
    })
    .map(function (l) { return l._linha; })
    .sort(function (a, b) { return b - a; })
    .forEach(function (numero) { aba.deleteRow(numero); });
}

/**
 * Cria uma meta de teste ja registrada para limpeza.
 * @param {Object} contexto
 * @param {Object=} extras Campos adicionais para criarMeta.
 * @return {Object} Meta criada.
 * @private
 */
function _criarMetaDeTeste(contexto, extras) {
  var payload = {
    nome: PREFIXO_NOME_TESTE + contexto.nome + ' ' + Math.floor(Math.random() * 100000),
    tipo: TIPOS_META.META,
    valor_alvo: 1000,
    aporte_mensal_planejado: 100
  };
  Object.keys(extras || {}).forEach(function (chave) { payload[chave] = extras[chave]; });

  var meta = criarMeta(payload);
  contexto.metasCriadas.push(meta.id_meta);
  return meta;
}

// ===========================================================================
// TESTES: ESTRUTURA
// ===========================================================================

/**
 * Verifica se a estrutura da planilha esta completa.
 * @return {Object} Resultado do teste.
 */
function testSetup() {
  return _executarTeste('testSetup', function (t) {
    var planilha = obterPlanilha();

    Object.keys(ABAS).forEach(function (chave) {
      var nomeAba = ABAS[chave];
      t.afirmar(!!planilha.getSheetByName(nomeAba), 'aba "' + nomeAba + '" deve existir');
    });

    Object.keys(CABECALHOS).forEach(function (nomeAba) {
      var mapa = obterMapaCabecalhos(obterAbaSegura(nomeAba));
      CABECALHOS[nomeAba].forEach(function (coluna) {
        t.afirmar(mapa[coluna] !== undefined,
                  'coluna "' + coluna + '" deve existir em ' + nomeAba);
      });
    });

    // Configuracoes essenciais.
    ['moeda', 'fuso_horario', 'meta_meses_reserva', 'usar_ia'].forEach(function (chave) {
      t.afirmar(obterConfig(chave, null) !== null,
                'config "' + chave + '" deve estar definida');
    });

    // Categorias padrao.
    var nomes = listarCategorias(false).map(function (c) { return normalizarTexto(c.nome); });
    ['salario', 'mercado', 'moradia', 'reserva', 'outros'].forEach(function (nome) {
      t.afirmar(nomes.indexOf(nome) !== -1, 'categoria padrao "' + nome + '" deve existir');
    });

    // Reserva de emergencia.
    t.afirmar(!!obterMetaReserva(), 'deve existir uma meta do tipo RESERVA');
  });
}

// ===========================================================================
// TESTES: METAS
// ===========================================================================

/** Testa o ciclo de vida de uma meta. */
function testCriarMeta() {
  return _executarTeste('testCriarMeta', function (t) {
    var meta = _criarMetaDeTeste(t, { valor_alvo: 5000, aporte_mensal_planejado: 250 });

    t.afirmar(!!meta.id_meta, 'meta criada deve ter ID');
    t.afirmarIgual(String(meta.status).toUpperCase(), STATUS_META.ATIVA,
                   'meta nova deve nascer ATIVA');
    t.afirmarProximo(paraNumero(meta.valor_alvo), 5000, 'valor alvo gravado');
    t.afirmarProximo(meta.saldoAtual, 0, 'saldo inicial deve ser zero');
    t.afirmarProximo(meta.progressoPercentual, 0, 'progresso inicial deve ser zero');
    t.afirmarProximo(meta.valorFaltante, 5000, 'faltante inicial igual ao alvo');

    // Validacoes de entrada.
    t.afirmarErro(function () { criarMeta({ nome: '', valor_alvo: 100 }); },
                  'meta sem nome deve ser rejeitada');
    t.afirmarErro(function () { criarMeta({ nome: PREFIXO_NOME_TESTE + 'X', valor_alvo: 0 }); },
                  'meta com alvo zero deve ser rejeitada');
    t.afirmarErro(function () { criarMeta({ nome: meta.nome, valor_alvo: 100 }); },
                  'meta com nome duplicado deve ser rejeitada');

    // Edicao.
    var editada = editarMeta(meta.id_meta, { valor_alvo: 6000, aporte_mensal_planejado: 300 });
    t.afirmarProximo(paraNumero(editada.valor_alvo), 6000, 'alvo editado');

    // Desativar e reativar (soft delete).
    desativarMeta(meta.id_meta);
    var desativada = obterMeta(meta.id_meta);
    t.afirmarIgual(String(desativada.status).toUpperCase(), STATUS_META.INATIVA,
                   'meta deve ficar INATIVA');
    t.afirmar(listarMetas(false).every(function (m) { return m.id_meta !== meta.id_meta; }),
              'meta inativa nao deve aparecer na listagem padrao');
    t.afirmar(listarMetas(true).some(function (m) { return m.id_meta === meta.id_meta; }),
              'meta inativa deve aparecer quando pedimos inativas');

    ativarMeta(meta.id_meta);
    t.afirmarIgual(String(obterMeta(meta.id_meta).status).toUpperCase(), STATUS_META.ATIVA,
                   'meta deve voltar a ATIVA');

    // excluirMeta padrao = soft delete.
    var exclusao = excluirMeta(meta.id_meta);
    t.afirmarIgual(exclusao.modo, 'SOFT', 'exclusao padrao deve ser soft delete');
    t.afirmar(!!buscarPorId(ABAS.METAS, 'id_meta', meta.id_meta),
              'linha da meta deve continuar existindo apos soft delete');
  });
}

/** Testa aporte em meta e sua repercussao. */
function testAporteMeta() {
  return _executarTeste('testAporteMeta', function (t) {
    var meta = _criarMetaDeTeste(t, { valor_alvo: 1000 });

    var resultado = aportarEmMeta(meta.id_meta, 250, new Date(), 'Aporte de teste', MARCADOR_TESTE);
    t.movimentosCriados.push(resultado.id_movimento);
    if (resultado.id_lancamento) t.lancamentosCriados.push(resultado.id_lancamento);

    t.afirmarProximo(resultado.saldoAtual, 250, 'saldo apos aporte');
    t.afirmarProximo(resultado.progressoPercentual, 25, 'progresso apos aporte');

    // O espelho deve existir em Lancamentos com o tipo correto.
    var espelho = buscarPorId(ABAS.LANCAMENTOS, 'id_lancamento', resultado.id_lancamento);
    t.afirmar(!!espelho, 'aporte deve gerar lancamento espelho');
    t.afirmarIgual(String(espelho.tipo).toUpperCase(), TIPOS_LANCAMENTO.APORTE_META,
                   'espelho deve ser do tipo APORTE_META');

    // O espelho nao pode contaminar receitas/despesas do mes.
    var mes = chaveMes(new Date());
    var receitasAntes = somarPorTipoNoMes(TIPOS_LANCAMENTO.RECEITA, mes);
    var despesasAntes = somarPorTipoNoMes(TIPOS_LANCAMENTO.DESPESA, mes);
    var segundo = aportarEmMeta(meta.id_meta, 100, new Date(), 'Segundo aporte', MARCADOR_TESTE);
    t.movimentosCriados.push(segundo.id_movimento);
    if (segundo.id_lancamento) t.lancamentosCriados.push(segundo.id_lancamento);

    t.afirmarProximo(somarPorTipoNoMes(TIPOS_LANCAMENTO.RECEITA, mes), receitasAntes,
                     'aporte nao pode virar receita');
    t.afirmarProximo(somarPorTipoNoMes(TIPOS_LANCAMENTO.DESPESA, mes), despesasAntes,
                     'aporte nao pode virar despesa');
    t.afirmarProximo(calcularSaldoMeta(meta.id_meta), 350, 'saldo acumulado dos dois aportes');

    // Validacoes.
    t.afirmarErro(function () { aportarEmMeta(meta.id_meta, 0); },
                  'aporte de valor zero deve ser rejeitado');
    t.afirmarErro(function () { aportarEmMeta(meta.id_meta, -50); },
                  'aporte negativo deve ser rejeitado');
    t.afirmarErro(function () { aportarEmMeta('META-INEXISTENTE', 10); },
                  'aporte em meta inexistente deve ser rejeitado');

    // Meta que atinge o alvo deve ser marcada como CONCLUIDA.
    var terceiro = aportarEmMeta(meta.id_meta, 650, new Date(), 'Aporte final', MARCADOR_TESTE);
    t.movimentosCriados.push(terceiro.id_movimento);
    if (terceiro.id_lancamento) t.lancamentosCriados.push(terceiro.id_lancamento);
    t.afirmarProximo(terceiro.saldoAtual, 1000, 'saldo final igual ao alvo');
    t.afirmarIgual(String(obterMeta(meta.id_meta).status).toUpperCase(), STATUS_META.CONCLUIDA,
                   'meta com alvo atingido deve ficar CONCLUIDA');
  });
}

/** Testa resgate de meta, inclusive saldo insuficiente. */
function testResgateMeta() {
  return _executarTeste('testResgateMeta', function (t) {
    var meta = _criarMetaDeTeste(t, { valor_alvo: 2000 });

    var aporte = aportarEmMeta(meta.id_meta, 500, new Date(), 'Aporte base', MARCADOR_TESTE);
    t.movimentosCriados.push(aporte.id_movimento);
    if (aporte.id_lancamento) t.lancamentosCriados.push(aporte.id_lancamento);

    var resgate = resgatarDaMeta(meta.id_meta, 200, new Date(), 'Resgate de teste', MARCADOR_TESTE);
    t.movimentosCriados.push(resgate.id_movimento);
    if (resgate.id_lancamento) t.lancamentosCriados.push(resgate.id_lancamento);

    t.afirmarProximo(resgate.saldoAtual, 300, 'saldo apos resgate');

    var espelho = buscarPorId(ABAS.LANCAMENTOS, 'id_lancamento', resgate.id_lancamento);
    t.afirmarIgual(String(espelho.tipo).toUpperCase(), TIPOS_LANCAMENTO.RESGATE_META,
                   'espelho de resgate deve ser RESGATE_META');

    // Saldo insuficiente (com a configuracao padrao).
    var permitirNegativo = obterConfigBooleano('permitir_saldo_negativo_meta', false);
    if (!permitirNegativo) {
      t.afirmarErro(function () { resgatarDaMeta(meta.id_meta, 10000); },
                    'resgate acima do saldo deve ser rejeitado');
    }
    t.afirmarProximo(calcularSaldoMeta(meta.id_meta), 300,
                     'saldo nao pode mudar apos resgate rejeitado');
  });
}

// ===========================================================================
// TESTES: LANCAMENTOS
// ===========================================================================

/** Testa o registro de despesa. */
function testRegistrarDespesa() {
  return _executarTeste('testRegistrarDespesa', function (t) {
    var mes = chaveMes(new Date());
    var antes = somarPorTipoNoMes(TIPOS_LANCAMENTO.DESPESA, mes);

    var lancamento = registrarLancamento({
      data: new Date(), tipo: TIPOS_LANCAMENTO.DESPESA, valor: '123,45',
      categoria: 'Mercado', descricao: 'Despesa de teste', origem: MARCADOR_TESTE
    });
    t.lancamentosCriados.push(lancamento.id_lancamento);

    t.afirmarProximo(lancamento.valor, 123.45, 'valor pt-BR deve ser convertido');
    t.afirmarIgual(lancamento.tipo, TIPOS_LANCAMENTO.DESPESA, 'tipo gravado');
    t.afirmarIgual(String(lancamento.status).toUpperCase(), STATUS_LANCAMENTO.CONFIRMADO,
                   'status padrao CONFIRMADO');
    t.afirmarProximo(somarPorTipoNoMes(TIPOS_LANCAMENTO.DESPESA, mes), antes + 123.45,
                     'total de despesas do mes deve subir');

    // Bloqueio de duplicado (quando a configuracao esta ligada).
    if (obterConfigBooleano('bloquear_duplicados', true)) {
      t.afirmarErro(function () {
        registrarLancamento({
          data: lancamento.data, tipo: TIPOS_LANCAMENTO.DESPESA, valor: 123.45,
          categoria: 'Mercado', descricao: 'Despesa de teste', origem: MARCADOR_TESTE
        });
      }, 'lancamento identico no mesmo dia deve ser bloqueado');
    }

    // Validacoes de entrada.
    t.afirmarErro(function () {
      registrarLancamento({ data: 'data-invalida', tipo: TIPOS_LANCAMENTO.DESPESA,
                            valor: 10, categoria: 'Mercado' });
    }, 'data invalida deve ser rejeitada');

    t.afirmarErro(function () {
      registrarLancamento({ data: new Date(), tipo: 'INVENTADO',
                            valor: 10, categoria: 'Mercado' });
    }, 'tipo invalido deve ser rejeitado');

    t.afirmarErro(function () {
      registrarLancamento({ data: new Date(), tipo: TIPOS_LANCAMENTO.DESPESA,
                            valor: -10, categoria: 'Mercado' });
    }, 'valor negativo deve ser rejeitado');

    t.afirmarErro(function () {
      registrarLancamento({ data: new Date(), tipo: TIPOS_LANCAMENTO.APORTE_META,
                            valor: 10, categoria: 'Reserva' });
    }, 'APORTE_META sem meta deve ser rejeitado');

    // Cancelamento preserva a linha.
    var cancelado = cancelarLancamento(lancamento.id_lancamento, 'teste');
    t.afirmarIgual(String(cancelado.status).toUpperCase(), STATUS_LANCAMENTO.CANCELADO,
                   'lancamento deve ficar CANCELADO');
    t.afirmarProximo(somarPorTipoNoMes(TIPOS_LANCAMENTO.DESPESA, mes), antes,
                     'lancamento cancelado nao entra nos totais');
  });
}

/** Testa o registro de receita e a criacao automatica de categoria. */
function testRegistrarReceita() {
  return _executarTeste('testRegistrarReceita', function (t) {
    var mes = chaveMes(new Date());
    var antes = somarPorTipoNoMes(TIPOS_LANCAMENTO.RECEITA, mes);

    var receita = registrarLancamento({
      data: new Date(), tipo: TIPOS_LANCAMENTO.RECEITA, valor: 3000,
      categoria: 'Salario', descricao: 'Receita de teste', origem: MARCADOR_TESTE
    });
    t.lancamentosCriados.push(receita.id_lancamento);

    t.afirmarProximo(receita.valor, 3000, 'valor da receita');
    t.afirmarProximo(somarPorTipoNoMes(TIPOS_LANCAMENTO.RECEITA, mes), antes + 3000,
                     'total de receitas do mes deve subir');

    // Categoria canonica: "salario" deve casar com "Salario" ja cadastrado.
    var comCaixaDiferente = registrarLancamento({
      data: new Date(), tipo: TIPOS_LANCAMENTO.RECEITA, valor: 11.11,
      categoria: 'salario', descricao: 'Receita de teste 2', origem: MARCADOR_TESTE
    });
    t.lancamentosCriados.push(comCaixaDiferente.id_lancamento);
    t.afirmarIgual(comCaixaDiferente.categoria, 'Salario',
                   'categoria deve ser normalizada para o nome cadastrado');

    // Atalho registrarReceita.
    var atalho = registrarReceita(new Date(), 55.5, 'Freelance', 'Receita de teste 3');
    t.lancamentosCriados.push(atalho.id_lancamento);
    t.afirmarIgual(atalho.tipo, TIPOS_LANCAMENTO.RECEITA, 'atalho deve criar RECEITA');
  });
}

// ===========================================================================
// TESTES: PREVISOES (funcoes puras)
// ===========================================================================

/** Testa o calculo de valor futuro. */
function testPrevisaoValorFuturo() {
  return _executarTeste('testPrevisaoValorFuturo', function (t) {
    // Sem taxa: soma simples.
    t.afirmarProximo(calcularValorFuturo(1000, 100, 0, 12), 2200, 'FV sem taxa');
    t.afirmarProximo(calcularValorFuturo(0, 500, 0, 6), 3000, 'FV sem saldo inicial');
    t.afirmarProximo(calcularValorFuturo(1000, 0, 0, 12), 1000, 'FV sem aporte e sem taxa');

    // Com taxa: PV*(1+i)^n + PMT*((1+i)^n - 1)/i
    // i=1%, n=12: fator = 1.12682503
    // 1000*1.12682503 = 1126.825 ; 100*(0.12682503/0.01) = 1268.2503 -> 2395.08
    t.afirmarProximo(calcularValorFuturo(1000, 100, 0.01, 12), 2395.08, 'FV com taxa de 1%', 0.05);

    // Somente juros compostos.
    t.afirmarProximo(calcularValorFuturo(1000, 0, 0.01, 12), 1126.83, 'juros sobre saldo', 0.05);

    // Casos de borda.
    t.afirmarProximo(calcularValorFuturo(1000, 100, 0.01, 0), 1000, 'n = 0 devolve o saldo');
    t.afirmarProximo(calcularValorFuturo(0, 0, 0, 12), 0, 'tudo zero devolve zero');
    t.afirmarProximo(calcularValorFuturo('1.000,00', '100', 0, 12), 2200,
                     'FV aceita numeros em texto pt-BR');

    // Taxa equivalente.
    t.afirmarProximo(calcularTaxaMensalEquivalente(0.12), 0.009489, 'taxa mensal equivalente',
                     0.00001);
    t.afirmarProximo(calcularTaxaAnualEquivalente(calcularTaxaMensalEquivalente(0.12)), 0.12,
                     'ida e volta entre taxas', 0.0001);

    // Serie mensal.
    var serie = projetarSerieMensal(0, 100, 0, 3);
    t.afirmarIgual(serie.length, 3, 'serie deve ter 3 meses');
    t.afirmarProximo(serie[2].saldo, 300, 'saldo no terceiro mes');
  });
}

/** Testa o calculo de tempo ate a meta. */
function testTempoParaMeta() {
  return _executarTeste('testTempoParaMeta', function (t) {
    // Sem taxa.
    var simples = calcularMesesParaMeta(0, 1000, 100, 0);
    t.afirmar(simples.atingivel, 'meta com aporte deve ser atingivel');
    t.afirmarIgual(simples.meses, 10, 'meses sem taxa');

    // Arredondamento para cima.
    t.afirmarIgual(calcularMesesParaMeta(0, 1000, 300, 0).meses, 4,
                   'meses devem ser arredondados para cima');

    // Meta ja atingida.
    var atingida = calcularMesesParaMeta(1500, 1000, 100, 0);
    t.afirmar(atingida.jaAtingida, 'meta ja atingida deve ser sinalizada');
    t.afirmarIgual(atingida.meses, 0, 'meta atingida leva 0 meses');

    // Sem aporte e sem taxa: inatingivel.
    var impossivel = calcularMesesParaMeta(100, 1000, 0, 0);
    t.afirmar(!impossivel.atingivel, 'sem aporte e sem juros a meta e inatingivel');
    t.afirmar(impossivel.meses === null, 'meta inatingivel nao tem prazo');
    t.afirmar(impossivel.mensagem.length > 0, 'deve haver mensagem explicativa');

    // Com taxa, o prazo nunca pode ser maior que sem taxa.
    var comTaxa = calcularMesesParaMeta(0, 1000, 100, 0.01);
    t.afirmar(comTaxa.atingivel, 'meta com taxa deve ser atingivel');
    t.afirmar(comTaxa.meses <= simples.meses, 'com rendimento o prazo nao aumenta');

    // So com juros, sem aporte: e possivel, mas demora.
    var soJuros = calcularMesesParaMeta(500, 1000, 0, 0.01);
    t.afirmar(soJuros.atingivel, 'com juros e saldo inicial a meta e atingivel');
    t.afirmarIgual(soJuros.meses, 70, 'prazo so com juros (ln2/ln1.01 ~ 69.66)');

    // Meta sem valor alvo.
    t.afirmar(!calcularMesesParaMeta(0, 0, 100, 0).atingivel,
              'meta sem alvo nao e calculavel');

    // Coerencia entre as duas funcoes: o FV no prazo previsto cobre a meta.
    var fv = calcularValorFuturo(0, 100, 0.01, comTaxa.meses);
    t.afirmar(fv >= 1000 - TOLERANCIA_TESTE,
              'valor futuro no prazo previsto deve alcancar a meta');
  });
}

/** Testa o calculo de aporte necessario. */
function testAporteNecessario() {
  return _executarTeste('testAporteNecessario', function (t) {
    // Sem taxa.
    var simples = calcularAporteNecessario(0, 1200, 12, 0);
    t.afirmar(simples.viavel, 'caso simples deve ser viavel');
    t.afirmarProximo(simples.aporte, 100, 'aporte necessario sem taxa');

    // Com saldo inicial.
    t.afirmarProximo(calcularAporteNecessario(600, 1200, 12, 0).aporte, 50,
                     'saldo inicial reduz o aporte');

    // Meta ja atingida.
    var atingida = calcularAporteNecessario(2000, 1000, 12, 0);
    t.afirmarProximo(atingida.aporte, 0, 'meta atingida dispensa aporte');

    // Prazo invalido.
    t.afirmar(!calcularAporteNecessario(0, 1000, 0, 0).viavel,
              'prazo zero deve ser sinalizado como inviavel');

    // Com taxa, o aporte necessario e menor.
    var comTaxa = calcularAporteNecessario(0, 1200, 12, 0.01);
    t.afirmar(comTaxa.aporte < simples.aporte, 'com rendimento o aporte necessario cai');

    // Coerencia: aportando o valor calculado, chega-se a meta.
    t.afirmarProximo(calcularValorFuturo(0, comTaxa.aporte, 0.01, 12), 1200,
                     'aporte calculado deve alcancar a meta', 0.5);

    // Progresso e cobertura.
    t.afirmarProximo(calcularProgressoMeta(250, 1000), 25, 'progresso 25%');
    t.afirmarProximo(calcularProgressoMeta(2000, 1000), 100, 'progresso limitado a 100%');
    t.afirmarProximo(calcularProgressoMeta(100, 0), 0, 'progresso com alvo zero');
    t.afirmarProximo(calcularCoberturaReserva(6000, 2000), 3, 'cobertura de 3 meses');
    t.afirmarProximo(calcularCoberturaReserva(6000, 0), 0, 'cobertura sem despesa media');
  });
}

// ===========================================================================
// TESTES: INDICADORES E IA
// ===========================================================================

/** Testa a geracao de indicadores. */
function testIndicadores() {
  return _executarTeste('testIndicadores', function (t) {
    var mes = chaveMes(new Date());

    var receita = registrarLancamento({
      data: new Date(), tipo: TIPOS_LANCAMENTO.RECEITA, valor: 4000,
      categoria: 'Salario', descricao: 'Indicadores teste receita', origem: MARCADOR_TESTE
    });
    t.lancamentosCriados.push(receita.id_lancamento);

    var despesa = registrarLancamento({
      data: new Date(), tipo: TIPOS_LANCAMENTO.DESPESA, valor: 1000,
      categoria: 'Mercado', descricao: 'Indicadores teste despesa', origem: MARCADOR_TESTE
    });
    t.lancamentosCriados.push(despesa.id_lancamento);

    var ind = gerarIndicadores(mes);

    t.afirmarIgual(ind.mes, mes, 'mes de referencia');
    t.afirmar(ind.receitas >= 4000, 'receitas devem incluir o lancamento de teste');
    t.afirmar(ind.despesas >= 1000, 'despesas devem incluir o lancamento de teste');
    t.afirmarProximo(ind.saldo, ind.receitas - ind.despesas, 'saldo = receitas - despesas');

    var taxaEsperada = ind.receitas > 0
      ? arredondar2(((ind.receitas - ind.despesas) / ind.receitas) * 100) : 0;
    t.afirmarProximo(ind.taxaPoupanca, taxaEsperada, 'formula da taxa de poupanca');

    t.afirmar(Array.isArray(ind.topCategorias), 'topCategorias deve ser lista');
    t.afirmar(ind.topCategorias.length <= 5, 'no maximo 5 categorias no topo');
    t.afirmar(Array.isArray(ind.alertas), 'alertas deve ser lista');
    t.afirmar(Array.isArray(ind.serieMensal), 'serie mensal deve ser lista');
    t.afirmarIgual(ind.serieMensal.length, 12, 'serie deve ter 12 meses');
    t.afirmar(ind.reserva !== undefined, 'bloco de reserva deve existir');
    t.afirmar(ind.gastosFixosVariaveis !== undefined, 'bloco fixos/variaveis deve existir');

    // A soma das categorias nao pode passar do total de despesas do mes.
    var somaCategorias = ind.topCategorias.reduce(function (acc, c) { return acc + c.total; }, 0);
    t.afirmar(somaCategorias <= ind.despesas + TOLERANCIA_TESTE,
              'soma das categorias nao pode exceder as despesas');

    // Despesa media deve ser positiva quando ha despesas.
    t.afirmar(calcularDespesaMediaMensal(6) > 0, 'despesa media deve ser maior que zero');

    // Orcamentos.
    t.afirmar(Array.isArray(avaliarOrcamentos(mes)), 'avaliarOrcamentos deve devolver lista');
  });
}

/** Testa o fallback de IA e o parsing tolerante. */
function testFallbackIA() {
  return _executarTeste('testFallbackIA', function (t) {
    // Sugestoes por regras sempre funcionam.
    var regras = gerarInsightsAutomaticosSemIA();
    t.afirmar(!!regras.resumo, 'insights por regras devem ter resumo');
    t.afirmar(Array.isArray(regras.sugestoes), 'sugestoes devem ser lista');
    t.afirmar(regras.sugestoes.length > 0, 'deve haver ao menos uma sugestao');
    t.afirmarIgual(regras.fonte, 'REGRAS', 'fonte deve ser REGRAS');
    t.afirmar(regras.observacoes.indexOf('aconselhamento financeiro') !== -1,
              'deve conter o aviso de nao aconselhamento');

    // Parsing: JSON puro.
    var puro = parseRespostaIA('{"resumo":"ok","sugestoes":[' +
      '{"titulo":"T","descricao":"D","prioridade":"alta"}],' +
      '"alertas":["a1"],"observacoes":"obs"}');
    t.afirmarIgual(puro.resumo, 'ok', 'resumo do JSON puro');
    t.afirmarIgual(puro.sugestoes.length, 1, 'uma sugestao no JSON puro');
    t.afirmarIgual(puro.sugestoes[0].prioridade, 'alta', 'prioridade preservada');
    t.afirmarIgual(puro.alertas.length, 1, 'alertas do JSON puro');

    // Parsing: JSON cercado por markdown e texto.
    var cercado = parseRespostaIA(
      'Claro! Segue:\n```json\n{"resumo":"com cerca","sugestoes":[]}\n```\nAbraco.');
    t.afirmarIgual(cercado.resumo, 'com cerca', 'JSON dentro de bloco markdown');

    // Parsing: texto livre vira resumo.
    var livre = parseRespostaIA('Apenas um texto sem json nenhum.');
    t.afirmar(livre.resumo.indexOf('Apenas um texto') === 0, 'texto livre vira resumo');
    t.afirmarIgual(livre.sugestoes.length, 0, 'texto livre nao gera sugestoes');

    // Parsing: vazio e lixo nao quebram.
    t.afirmar(!!parseRespostaIA('').resumo, 'resposta vazia deve ter mensagem');
    t.afirmar(!!parseRespostaIA('{quebrado').resumo, 'JSON quebrado nao pode lancar erro');

    // Prioridade invalida cai para "media".
    var prioridadeEstranha = parseRespostaIA(
      '{"resumo":"x","sugestoes":[{"titulo":"T","prioridade":"urgentissima"}]}');
    t.afirmarIgual(prioridadeEstranha.sugestoes[0].prioridade, 'media',
                   'prioridade invalida vira media');

    // Status da IA nunca expoe chave.
    var status = obterStatusIA();
    t.afirmar(typeof status.chaveGeminiConfigurada === 'boolean',
              'status deve informar apenas se a chave existe');
    t.afirmar(JSON.stringify(status).indexOf('AIza') === -1,
              'status nao pode conter chave de API');

    // Resumo enviado a IA nao pode levar descricoes por padrao.
    var resumo = montarResumoParaIA();
    t.afirmar(resumo.receitas !== undefined, 'resumo deve conter receitas');
    if (!obterConfigBooleano('enviar_resumo_para_ia', false)) {
      t.afirmar(resumo.ultimos_lancamentos === undefined,
                'sem consentimento, lancamentos nao vao para a IA');
    }
    t.afirmar(JSON.stringify(resumo).indexOf('descricao') === -1,
              'descricoes de transacao nunca vao para a IA');

    // Com a IA desligada, gerarInsightsIA precisa cair nas regras.
    if (!obterConfigBooleano('usar_ia', false)) {
      var semIa = gerarInsightsIA();
      t.afirmar(semIa.fonte.indexOf('REGRAS') !== -1,
                'com usar_ia = NAO a fonte deve ser REGRAS');
    }

    // Mascaramento de segredos no log.
    var mascarado = _mascararSegredos('key=AIzaSyABCDEFGHIJKLMNOPQRS token: gsk_abcdefghijklm');
    t.afirmar(mascarado.indexOf('AIzaSy') === -1, 'chave Gemini deve ser mascarada');
    t.afirmar(mascarado.indexOf('gsk_abcdefghijklm') === -1, 'chave Groq deve ser mascarada');
  });
}

// ===========================================================================
// TESTES: INTEGRIDADE E UTILITARIOS
// ===========================================================================

/** Testa a validacao de integridade e os utilitarios de base. */
function testIntegridadeDados() {
  return _executarTeste('testIntegridadeDados', function (t) {
    var resultado = validarDados();
    t.afirmar(typeof resultado.ok === 'boolean', 'validarDados deve devolver ok booleano');
    t.afirmar(Array.isArray(resultado.problemas), 'problemas deve ser lista');
    t.afirmar(Array.isArray(resultado.avisos), 'avisos deve ser lista');
    t.afirmarIgual(resultado.problemas.length, 0,
                   'a planilha nao deve ter problemas criticos: ' +
                   resultado.problemas.slice(0, 3).join(' | '));

    // Conversao de numeros.
    t.afirmarProximo(paraNumero('1.234,56'), 1234.56, 'numero pt-BR com milhar');
    t.afirmarProximo(paraNumero('1234.56'), 1234.56, 'numero em formato en-US');
    t.afirmarProximo(paraNumero('R$ 99,90'), 99.9, 'numero com simbolo de moeda');
    t.afirmarProximo(paraNumero(42), 42, 'numero ja numerico');
    t.afirmar(isNaN(paraNumero('abc')), 'texto invalido deve virar NaN');
    t.afirmarProximo(arredondar2(0.1 + 0.2), 0.3, 'arredondamento evita ruido binario');

    // Conversao de datas.
    var dataBr = converterParaData('31/12/2024');
    t.afirmarIgual(dataBr.getFullYear(), 2024, 'ano de dd/mm/yyyy');
    t.afirmarIgual(dataBr.getMonth(), 11, 'mes de dd/mm/yyyy');
    t.afirmarIgual(dataBr.getDate(), 31, 'dia de dd/mm/yyyy');
    t.afirmar(converterParaData('31/02/2024') === null, 'data impossivel deve ser rejeitada');
    t.afirmar(converterParaData('') === null, 'texto vazio nao e data');
    t.afirmar(converterParaData('abc') === null, 'texto invalido nao e data');
    var dataIso = converterParaData('2024-03-05');
    t.afirmarIgual(dataIso.getMonth(), 2, 'mes de yyyy-mm-dd');
    t.afirmarIgual(dataIso.getDate(), 5, 'dia de yyyy-mm-dd sem deslocamento de fuso');
    t.afirmarIgual(formatarData(dataBr), '31/12/2024', 'formatacao dd/mm/yyyy');

    // Texto e moeda.
    t.afirmarIgual(normalizarTexto('  Alimentação '), 'alimentacao', 'normalizacao de texto');
    t.afirmar(formatarMoeda(1234.5).indexOf('1.234,50') !== -1, 'formatacao de moeda');
    t.afirmar(formatarMoeda(-10).indexOf('-') === 0, 'moeda negativa mantem o sinal');

    // Validacao monetaria.
    t.afirmarProximo(validarValorMonetario('10,50'), 10.5, 'valor monetario valido');
    t.afirmarErro(function () { validarValorMonetario(0); }, 'zero deve ser rejeitado');
    t.afirmarErro(function () { validarValorMonetario(-1); }, 'negativo deve ser rejeitado');
    t.afirmarErro(function () { validarValorMonetario('abc'); }, 'texto deve ser rejeitado');

    // Periodos.
    t.afirmarIgual(deslocarMes('2024-01', -1), '2023-12', 'deslocamento para tras vira o ano');
    t.afirmarIgual(deslocarMes('2024-12', 1), '2025-01', 'deslocamento para frente vira o ano');
    t.afirmarIgual(chaveMes(new Date(2024, 4, 15)), '2024-05', 'chave do mes');

    // Saldos das metas batem com os movimentos.
    var saldos = calcularSaldosDeTodasAsMetas();
    listarMetas(true).forEach(function (meta) {
      var dados = saldos[String(meta.id_meta).trim()] || { saldo: 0 };
      var esperado = arredondar2((paraNumero(meta.saldo_inicial) || 0) + dados.saldo);
      t.afirmarProximo(meta.saldoAtual, esperado,
                       'saldo da meta "' + meta.nome + '" deve bater com os movimentos');
    });
  });
}

// ===========================================================================
// EXECUCAO
// ===========================================================================

/**
 * Executa um teste isolado, garantindo limpeza e log.
 * @param {string} nome
 * @param {function(Object)} corpo
 * @return {{nome: string, sucesso: boolean, verificacoes: number,
 *           mensagem: string, duracaoMs: number}}
 * @private
 */
function _executarTeste(nome, corpo) {
  var contexto = _novoContextoTeste(nome);
  var inicio = new Date();
  var resultado = { nome: nome, sucesso: true, verificacoes: 0, mensagem: '', duracaoMs: 0 };

  try {
    corpo(contexto);
    resultado.verificacoes = contexto.verificacoes;
    resultado.mensagem = contexto.verificacoes + ' verificacao(oes) OK';
    logInfo('testes', nome + ': OK', { verificacoes: contexto.verificacoes });
  } catch (e) {
    resultado.sucesso = false;
    resultado.verificacoes = contexto.verificacoes;
    resultado.mensagem = e.message;
    logErro('testes', nome + ': FALHOU', e.message);
  } finally {
    // A limpeza roda mesmo quando o teste falha.
    contexto.limpar();
    resultado.duracaoMs = new Date() - inicio;
  }
  return resultado;
}

/**
 * Executa toda a bateria de testes.
 * @return {{sucesso: boolean, total: number, aprovados: number,
 *           reprovados: number, resumo: string, detalhes: Array<string>,
 *           resultados: Array<Object>}}
 */
function executarTodosOsTestes() {
  var testes = [
    testSetup,
    testPrevisaoValorFuturo,
    testTempoParaMeta,
    testAporteNecessario,
    testCriarMeta,
    testRegistrarDespesa,
    testRegistrarReceita,
    testAporteMeta,
    testResgateMeta,
    testIndicadores,
    testFallbackIA,
    testIntegridadeDados
  ];

  var resultados = testes.map(function (teste) {
    try {
      return teste();
    } catch (e) {
      // Nenhuma falha pode interromper a bateria.
      return {
        nome: teste.name || 'teste', sucesso: false, verificacoes: 0,
        mensagem: 'Erro inesperado: ' + e.message, duracaoMs: 0
      };
    }
  });

  var aprovados = resultados.filter(function (r) { return r.sucesso; }).length;
  var reprovados = resultados.length - aprovados;
  var verificacoes = resultados.reduce(function (acc, r) { return acc + r.verificacoes; }, 0);

  var detalhes = resultados.map(function (r) {
    return (r.sucesso ? '[OK]   ' : '[FALHA]') + ' ' + r.nome +
      ' - ' + r.mensagem + ' (' + r.duracaoMs + 'ms)';
  });

  var resumo = reprovados === 0
    ? 'Todos os ' + resultados.length + ' testes passaram (' +
      verificacoes + ' verificacoes).'
    : reprovados + ' de ' + resultados.length + ' teste(s) falharam (' +
      verificacoes + ' verificacoes executadas).';

  logInfo('executarTodosOsTestes', resumo,
          { aprovados: aprovados, reprovados: reprovados });

  return {
    sucesso: reprovados === 0,
    total: resultados.length,
    aprovados: aprovados,
    reprovados: reprovados,
    verificacoes: verificacoes,
    resumo: resumo,
    detalhes: detalhes,
    resultados: resultados
  };
}

/**
 * Executa apenas os testes de funcoes puras (rapidos, nao tocam na planilha).
 * Util durante o desenvolvimento.
 * @return {Object}
 */
function executarTestesRapidos() {
  var resultados = [testPrevisaoValorFuturo(), testTempoParaMeta(), testAporteNecessario()];
  var reprovados = resultados.filter(function (r) { return !r.sucesso; }).length;
  return {
    sucesso: reprovados === 0,
    resumo: (resultados.length - reprovados) + '/' + resultados.length + ' testes puros OK',
    detalhes: resultados.map(function (r) {
      return (r.sucesso ? '[OK]   ' : '[FALHA]') + ' ' + r.nome + ' - ' + r.mensagem;
    })
  };
}
