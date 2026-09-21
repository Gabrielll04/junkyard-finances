/**
 * Indicadores.gs
 * ---------------------------------------------------------------------------
 * KPIs, medias, alertas e sugestoes baseadas em regras (sem IA).
 *
 * DEFINICOES ADOTADAS (documentadas de proposito, porque ha mais de uma
 * convencao possivel no mercado):
 *
 *  taxa_poupanca = (receitas - despesas) / receitas
 *      Mede quanto da renda sobrou no mes. Nao depende de o usuario ter
 *      lembrado de registrar o aporte.
 *
 *  percentual_guardado = aportes_em_metas / receitas
 *      Mede quanto da renda foi efetivamente para as caixinhas.
 *
 *  Aportes e resgates NAO entram em receitas/despesas: sao transferencias
 *  entre bolsos do mesmo dono e contariam duas vezes.
 */

// ===========================================================================
// MEDIAS E SERIES
// ===========================================================================

/**
 * Despesa media mensal dos ultimos N meses completos + mes atual.
 * Meses sem nenhum lancamento sao ignorados, para nao puxar a media para baixo
 * logo no inicio do uso do sistema.
 *
 * @param {number=} quantidadeMeses Padrao: config meses_base_despesa_media (6).
 * @return {number}
 */
function calcularDespesaMediaMensal(quantidadeMeses) {
  var meses = parseInt(quantidadeMeses, 10);
  if (isNaN(meses) || meses <= 0) {
    meses = obterConfigNumero('meses_base_despesa_media', 6);
  }
  var serie = obterSerieMensal(meses);
  var considerados = serie.filter(function (m) { return m.despesas > 0; });
  if (!considerados.length) return 0;
  var soma = considerados.reduce(function (acc, m) { return acc + m.despesas; }, 0);
  return arredondar2(soma / considerados.length);
}

/**
 * Serie mensal de receitas, despesas, aportes e resgates.
 * Uma unica leitura da aba Lancamentos para todos os meses pedidos.
 *
 * @param {number} quantidadeMeses Quantidade de meses, terminando no mes atual.
 * @return {Array<{mes: string, receitas: number, despesas: number,
 *                 aportes: number, resgates: number, saldo: number}>}
 */
function obterSerieMensal(quantidadeMeses) {
  var total = Math.max(parseInt(quantidadeMeses, 10) || 6, 1);
  var referencia = mesAtual();

  var chaves = [];
  var indicePorChave = {};
  for (var i = total - 1; i >= 0; i--) {
    var chave = deslocarMes(referencia, -i);
    indicePorChave[chave] = chaves.length;
    chaves.push(chave);
  }

  var serie = chaves.map(function (chave) {
    return { mes: chave, receitas: 0, despesas: 0, aportes: 0, resgates: 0, saldo: 0 };
  });

  lerTabela(ABAS.LANCAMENTOS).linhas.forEach(function (l) {
    if (String(l.status || '').toUpperCase() === STATUS_LANCAMENTO.CANCELADO) return;
    var chave = chaveMes(l.data);
    var indice = indicePorChave[chave];
    if (indice === undefined) return;

    var valor = paraNumero(l.valor);
    if (isNaN(valor)) return;
    var tipo = String(l.tipo || '').toUpperCase();

    if (tipo === TIPOS_LANCAMENTO.RECEITA) serie[indice].receitas += valor;
    else if (tipo === TIPOS_LANCAMENTO.DESPESA) serie[indice].despesas += valor;
    else if (tipo === TIPOS_LANCAMENTO.APORTE_META) serie[indice].aportes += valor;
    else if (tipo === TIPOS_LANCAMENTO.RESGATE_META) serie[indice].resgates += valor;
    // TRANSFERENCIA e neutra e nao entra em nenhum agregado.
  });

  serie.forEach(function (m) {
    m.receitas = arredondar2(m.receitas);
    m.despesas = arredondar2(m.despesas);
    m.aportes = arredondar2(m.aportes);
    m.resgates = arredondar2(m.resgates);
    m.saldo = arredondar2(m.receitas - m.despesas);
  });
  return serie;
}

// ===========================================================================
// INDICADORES PRINCIPAIS
// ===========================================================================

/**
 * Gera o pacote completo de indicadores do sistema.
 * @param {string=} mesReferencia yyyy-MM. Padrao: mes atual.
 * @return {Object}
 */
function gerarIndicadores(mesReferencia) {
  var mes = mesReferencia || mesAtual();
  var serie12 = obterSerieMensal(12);
  var mesCorrente = serie12.filter(function (m) { return m.mes === mes; })[0];

  // Se o mes pedido estiver fora dos 12 meses da serie, calcula sob demanda.
  if (!mesCorrente) {
    mesCorrente = {
      mes: mes,
      receitas: somarPorTipoNoMes(TIPOS_LANCAMENTO.RECEITA, mes),
      despesas: somarPorTipoNoMes(TIPOS_LANCAMENTO.DESPESA, mes),
      aportes: somarPorTipoNoMes(TIPOS_LANCAMENTO.APORTE_META, mes),
      resgates: somarPorTipoNoMes(TIPOS_LANCAMENTO.RESGATE_META, mes)
    };
    mesCorrente.saldo = arredondar2(mesCorrente.receitas - mesCorrente.despesas);
  }

  var receitas = mesCorrente.receitas;
  var despesas = mesCorrente.despesas;
  var saldo = mesCorrente.saldo;

  var taxaPoupanca = receitas > 0 ? arredondar2(((receitas - despesas) / receitas) * 100) : 0;
  var percentualGuardado = receitas > 0
    ? arredondar2((mesCorrente.aportes / receitas) * 100) : 0;

  // --- metas ---------------------------------------------------------------
  var metas = listarMetas(false);
  var saldoTotalMetas = 0;
  var somaProgresso = 0;
  var metasComuns = [];
  metas.forEach(function (m) {
    saldoTotalMetas += m.saldoAtual;
    somaProgresso += m.progressoPercentual;
    if (String(m.tipo || '').toUpperCase() !== TIPOS_META.RESERVA) metasComuns.push(m);
  });
  var progressoMedioMetas = metas.length ? arredondar2(somaProgresso / metas.length) : 0;

  // --- reserva -------------------------------------------------------------
  var reserva = obterMetaReserva();
  var baseMeses = obterConfigNumero('meses_base_despesa_media', 6);
  var despesaMedia = calcularDespesaMediaMensal(baseMeses);
  var mesesReservaConfig = obterConfigNumero('meta_meses_reserva', 6);
  var saldoReserva = reserva ? reserva.saldoAtual : 0;
  var reservaRecomendada = arredondar2(despesaMedia * mesesReservaConfig);
  var coberturaReserva = calcularCoberturaReserva(saldoReserva, despesaMedia);

  // --- medias --------------------------------------------------------------
  var indicadores = {
    mes: mes,
    mesFormatado: _formatarMesExtenso(mes),
    receitas: receitas,
    despesas: despesas,
    saldo: saldo,
    taxaPoupanca: taxaPoupanca,
    percentualGuardado: percentualGuardado,
    totalAportado: mesCorrente.aportes,
    totalResgatado: mesCorrente.resgates,
    aporteLiquido: arredondar2(mesCorrente.aportes - mesCorrente.resgates),
    despesaMedia3: _mediaDespesas(serie12, 3),
    despesaMedia6: _mediaDespesas(serie12, 6),
    despesaMedia12: _mediaDespesas(serie12, 12),
    despesaMediaConfigurada: despesaMedia,
    baseMesesDespesaMedia: baseMeses,
    saldoTotalMetas: arredondar2(saldoTotalMetas),
    quantidadeMetas: metas.length,
    quantidadeMetasComuns: metasComuns.length,
    progressoMedioMetas: progressoMedioMetas,
    reserva: {
      existe: !!reserva,
      idMeta: reserva ? reserva.id_meta : '',
      nome: reserva ? reserva.nome : 'Reserva de Emergencia',
      saldo: saldoReserva,
      valorAlvo: reserva ? arredondar2(paraNumero(reserva.valor_alvo) || 0) : 0,
      valorRecomendado: reservaRecomendada,
      mesesRecomendados: mesesReservaConfig,
      coberturaMeses: coberturaReserva,
      progressoPercentual: reserva ? reserva.progressoPercentual : 0,
      abaixoDoRecomendado: coberturaReserva < mesesReservaConfig
    },
    topCategorias: agruparDespesasPorCategoria(mes).slice(0, 5),
    serieMensal: serie12,
    metas: metas.map(function (m) {
      return {
        id: m.id_meta, nome: m.nome, tipo: m.tipo, status: m.status,
        saldo: m.saldoAtual, alvo: arredondar2(paraNumero(m.valor_alvo) || 0),
        progresso: m.progressoPercentual, faltante: m.valorFaltante,
        mesesRestantes: m.mesesRestantes, prazo: formatarData(m.data_prazo),
        aporteMensal: arredondar2(paraNumero(m.aporte_mensal_planejado) || 0),
        cor: m.cor || '#1f6feb'
      };
    }),
    geradoEm: new Date()
  };

  // --- variacao mensal -----------------------------------------------------
  var mesAnterior = serie12.filter(function (m) {
    return m.mes === deslocarMes(mes, -1);
  })[0];
  indicadores.despesaMesAnterior = mesAnterior ? mesAnterior.despesas : 0;
  indicadores.variacaoDespesasPercentual =
    (mesAnterior && mesAnterior.despesas > 0)
      ? arredondar2(((despesas - mesAnterior.despesas) / mesAnterior.despesas) * 100)
      : 0;

  // --- fixos vs variaveis --------------------------------------------------
  indicadores.gastosFixosVariaveis = _separarFixosEVariaveis(mes);

  // --- orcamentos ----------------------------------------------------------
  indicadores.orcamentos = avaliarOrcamentos(mes);
  indicadores.orcamentosEstourados = indicadores.orcamentos.filter(function (o) {
    return o.status === 'ESTOUROU';
  });

  // --- situacao das metas --------------------------------------------------
  indicadores.metasAtrasadas = [];
  indicadores.metasProximasDoPrazo = [];
  indicadores.metasInatingiveis = [];

  var hoje = new Date();
  var diasAlerta = obterConfigNumero('dias_alerta_prazo_meta', 60);
  metas.forEach(function (m) {
    if (String(m.status || '').toUpperCase() === STATUS_META.CONCLUIDA) return;
    var prazo = converterParaData(m.data_prazo);
    if (prazo) {
      var diasRestantes = Math.ceil((prazo - hoje) / (1000 * 60 * 60 * 24));
      if (diasRestantes < 0 && m.valorFaltante > 0) {
        indicadores.metasAtrasadas.push({
          nome: m.nome, faltante: m.valorFaltante, prazo: formatarData(prazo)
        });
      } else if (diasRestantes >= 0 && diasRestantes <= diasAlerta && m.valorFaltante > 0) {
        var mesesAteOPrazo = Math.max(Math.ceil(diasRestantes / 30), 1);
        var necessario = calcularAporteNecessario(
          m.saldoAtual, paraNumero(m.valor_alvo) || 0, mesesAteOPrazo, m.taxaMensalEfetiva);
        indicadores.metasProximasDoPrazo.push({
          nome: m.nome, diasRestantes: diasRestantes, faltante: m.valorFaltante,
          aporteNecessario: necessario.aporte
        });
      }
    }
    if (!m.previsaoAtingivel && m.valorFaltante > 0) {
      indicadores.metasInatingiveis.push({
        nome: m.nome, motivo: m.mensagemPrevisao, faltante: m.valorFaltante
      });
    }
  });

  indicadores.alertas = _montarAlertas(indicadores);
  return indicadores;
}

/**
 * Media de despesas dos ultimos N meses da serie, ignorando meses zerados.
 * @param {Array<Object>} serie
 * @param {number} meses
 * @return {number}
 * @private
 */
function _mediaDespesas(serie, meses) {
  var recorte = serie.slice(Math.max(serie.length - meses, 0));
  var comDados = recorte.filter(function (m) { return m.despesas > 0; });
  if (!comDados.length) return 0;
  var soma = comDados.reduce(function (acc, m) { return acc + m.despesas; }, 0);
  return arredondar2(soma / comDados.length);
}

/**
 * Separa despesas do mes entre fixas e variaveis usando o campo `grupo`
 * da aba Categorias. Categorias sem grupo definido contam como variaveis.
 * @param {string} mes
 * @return {{fixos: number, variaveis: number, percentualFixos: number}}
 * @private
 */
function _separarFixosEVariaveis(mes) {
  var grupoPorCategoria = {};
  listarCategorias(false).forEach(function (c) {
    grupoPorCategoria[normalizarTexto(c.nome)] = normalizarTexto(c.grupo);
  });

  var fixos = 0;
  var variaveis = 0;
  listarLancamentos({ mes: mes, tipo: TIPOS_LANCAMENTO.DESPESA }).forEach(function (l) {
    var valor = paraNumero(l.valor);
    if (isNaN(valor)) return;
    var grupo = grupoPorCategoria[normalizarTexto(l.categoria)] || '';
    if (grupo.indexOf('fixo') !== -1) fixos += valor;
    else variaveis += valor;
  });

  var total = fixos + variaveis;
  return {
    fixos: arredondar2(fixos),
    variaveis: arredondar2(variaveis),
    percentualFixos: total > 0 ? arredondar2((fixos / total) * 100) : 0
  };
}

/**
 * Nome do mes por extenso a partir da chave yyyy-MM.
 * @param {string} chave
 * @return {string}
 * @private
 */
function _formatarMesExtenso(chave) {
  var nomes = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
               'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var partes = String(chave).split('-');
  var indice = parseInt(partes[1], 10) - 1;
  if (isNaN(indice) || indice < 0 || indice > 11) return String(chave);
  return nomes[indice] + '/' + partes[0];
}

// ===========================================================================
// ORCAMENTOS
// ===========================================================================

/**
 * Compara o orcado com o realizado de cada categoria no mes e atualiza a aba
 * Orcamentos. Orcamentos sem mes_referencia valem como padrao para todo mes.
 *
 * @param {string=} mesReferencia yyyy-MM. Padrao: mes atual.
 * @return {Array<{categoria: string, orcado: number, realizado: number,
 *                 diferenca: number, percentual: number, status: string}>}
 */
function avaliarOrcamentos(mesReferencia) {
  var mes = mesReferencia || mesAtual();
  var realizadoPorCategoria = {};
  agruparDespesasPorCategoria(mes).forEach(function (item) {
    realizadoPorCategoria[normalizarTexto(item.categoria)] = item.total;
  });

  // Orcamentos explicitos da aba Orcamentos.
  var linhasOrcamento = lerTabela(ABAS.ORCAMENTOS).linhas;
  var orcados = {};

  linhasOrcamento.forEach(function (o) {
    var categoria = String(o.categoria || '').trim();
    if (!categoria) return;
    var referencia = String(o.mes_referencia || '').trim();
    if (referencia && referencia !== mes) return;
    var valor = paraNumero(o.valor_orcado);
    if (isNaN(valor) || valor <= 0) return;
    var chave = normalizarTexto(categoria);
    // Orcamento especifico do mes prevalece sobre o padrao.
    if (!orcados[chave] || referencia) {
      orcados[chave] = { categoria: categoria, valor: valor, linha: o._linha, especifico: !!referencia };
    }
  });

  // Orcamento padrao definido na propria categoria.
  listarCategorias(true).forEach(function (c) {
    var valor = paraNumero(c.orcamento_mensal_padrao);
    if (isNaN(valor) || valor <= 0) return;
    var chave = normalizarTexto(c.nome);
    if (!orcados[chave]) {
      orcados[chave] = { categoria: String(c.nome).trim(), valor: valor, linha: null, especifico: false };
    }
  });

  var resultado = Object.keys(orcados).map(function (chave) {
    var orcamento = orcados[chave];
    var realizado = realizadoPorCategoria[chave] || 0;
    var diferenca = arredondar2(orcamento.valor - realizado);
    var percentual = orcamento.valor > 0
      ? arredondar2((realizado / orcamento.valor) * 100) : 0;

    var status;
    if (realizado > orcamento.valor) status = 'ESTOUROU';
    else if (percentual >= 85) status = 'ATENCAO';
    else status = 'OK';

    return {
      categoria: orcamento.categoria,
      orcado: arredondar2(orcamento.valor),
      realizado: realizado,
      diferenca: diferenca,
      percentual: percentual,
      status: status,
      linha: orcamento.linha
    };
  }).sort(function (a, b) { return b.percentual - a.percentual; });

  // Atualiza colunas calculadas das linhas existentes da aba Orcamentos.
  resultado.forEach(function (item) {
    if (!item.linha) return;
    try {
      atualizarLinhaPorNumero(ABAS.ORCAMENTOS, item.linha, {
        valor_realizado: item.realizado,
        diferenca: item.diferenca,
        status: item.status
      });
    } catch (e) {
      logErro('avaliarOrcamentos', 'Falha ao atualizar linha de orcamento', e.message);
    }
  });

  return resultado;
}

// ===========================================================================
// ALERTAS E SUGESTOES SEM IA
// ===========================================================================

/**
 * Monta a lista de alertas objetivos a partir dos indicadores.
 * @param {Object} ind
 * @return {Array<string>}
 * @private
 */
function _montarAlertas(ind) {
  var alertas = [];

  if (ind.receitas === 0 && ind.despesas === 0) {
    alertas.push('Nenhum lancamento registrado em ' + ind.mesFormatado + '.');
  }
  if (ind.receitas > 0 && ind.saldo < 0) {
    alertas.push('Voce gastou ' + formatarMoeda(Math.abs(ind.saldo)) +
                 ' a mais do que recebeu neste mes.');
  }
  if (ind.receitas > 0 && ind.taxaPoupanca < 10 && ind.saldo >= 0) {
    alertas.push('Taxa de poupanca de ' + ind.taxaPoupanca +
                 '% neste mes, abaixo dos 10% de referencia.');
  }
  if (ind.reserva.existe && ind.reserva.coberturaMeses < ind.reserva.mesesRecomendados) {
    alertas.push('A reserva cobre ' + ind.reserva.coberturaMeses +
                 ' mes(es) de gastos (recomendado: ' + ind.reserva.mesesRecomendados + ').');
  }
  if (!ind.reserva.existe) {
    alertas.push('Nenhuma meta do tipo RESERVA cadastrada.');
  }
  ind.orcamentosEstourados.forEach(function (o) {
    alertas.push('Orcamento de "' + o.categoria + '" estourado: ' +
                 formatarMoeda(o.realizado) + ' de ' + formatarMoeda(o.orcado) + '.');
  });
  if (ind.variacaoDespesasPercentual >= 25 && ind.despesaMesAnterior > 0) {
    alertas.push('Despesas ' + ind.variacaoDespesasPercentual +
                 '% acima do mes anterior.');
  }
  ind.metasAtrasadas.forEach(function (m) {
    alertas.push('Meta "' + m.nome + '" venceu em ' + m.prazo + ' e ainda faltam ' +
                 formatarMoeda(m.faltante) + '.');
  });
  ind.metasProximasDoPrazo.forEach(function (m) {
    alertas.push('Meta "' + m.nome + '" vence em ' + m.diasRestantes + ' dia(s); faltam ' +
                 formatarMoeda(m.faltante) + '.');
  });
  ind.metasInatingiveis.forEach(function (m) {
    alertas.push('Meta "' + m.nome + '": ' + m.motivo);
  });

  return alertas;
}

/**
 * Sugestoes em linguagem natural geradas por regras, sem depender de IA.
 * Curtas, praticas e sem promessa de retorno.
 *
 * @param {Object=} indicadores Reaproveita indicadores ja calculados.
 * @return {{resumo: string, sugestoes: Array<Object>, alertas: Array<string>,
 *           observacoes: string, fonte: string}}
 */
function gerarInsightsAutomaticosSemIA(indicadores) {
  var ind = indicadores || gerarIndicadores();
  var sugestoes = [];

  // 1. Reserva de emergencia em primeiro lugar.
  if (!ind.reserva.existe) {
    sugestoes.push({
      titulo: 'Crie sua reserva de emergencia',
      descricao: 'Ainda nao ha uma meta do tipo RESERVA. Com base nos seus gastos, ' +
                 'um alvo inicial seria ' + formatarMoeda(ind.reserva.valorRecomendado) + '.',
      prioridade: 'alta'
    });
  } else if (ind.reserva.coberturaMeses < 3) {
    sugestoes.push({
      titulo: 'Priorize a reserva de emergencia',
      descricao: 'Sua reserva cobre ' + ind.reserva.coberturaMeses +
                 ' mes(es) de gastos. Considere priorizar aportes ate chegar a ' +
                 ind.reserva.mesesRecomendados + ' meses (' +
                 formatarMoeda(ind.reserva.valorRecomendado) + ').',
      prioridade: 'alta'
    });
  } else if (ind.reserva.coberturaMeses < ind.reserva.mesesRecomendados) {
    sugestoes.push({
      titulo: 'Reserva a caminho do alvo',
      descricao: 'A reserva ja cobre ' + ind.reserva.coberturaMeses +
                 ' mes(es). Faltam ' + formatarMoeda(
                   Math.max(ind.reserva.valorRecomendado - ind.reserva.saldo, 0)) +
                 ' para os ' + ind.reserva.mesesRecomendados + ' meses recomendados.',
      prioridade: 'media'
    });
  }

  // 2. Resultado do mes.
  if (ind.receitas > 0 && ind.saldo < 0) {
    sugestoes.push({
      titulo: 'Mes no vermelho',
      descricao: 'As despesas superaram as receitas em ' +
                 formatarMoeda(Math.abs(ind.saldo)) +
                 '. Vale revisar as maiores categorias antes de fazer novos aportes.',
      prioridade: 'alta'
    });
  } else if (ind.receitas > 0 && ind.taxaPoupanca < 10) {
    sugestoes.push({
      titulo: 'Aumente a folga do mes',
      descricao: 'Sua taxa de poupanca foi de ' + ind.taxaPoupanca +
                 '%. Um passo pequeno e viavel e mirar 10% da renda, ou ' +
                 formatarMoeda(ind.receitas * 0.1) + ' neste mes.',
      prioridade: 'media'
    });
  } else if (ind.receitas > 0 && ind.percentualGuardado < 5 && ind.saldo > 0) {
    sugestoes.push({
      titulo: 'Sobrou dinheiro, mas pouco foi guardado',
      descricao: 'O mes fechou com ' + formatarMoeda(ind.saldo) +
                 ' de folga, e apenas ' + ind.percentualGuardado +
                 '% da renda foi para as metas. Considere aportar parte dessa sobra.',
      prioridade: 'media'
    });
  }

  // 3. Categorias fora da curva.
  if (ind.topCategorias.length) {
    var maior = ind.topCategorias[0];
    var participacao = ind.despesas > 0
      ? arredondar2((maior.total / ind.despesas) * 100) : 0;
    if (participacao >= 35) {
      sugestoes.push({
        titulo: 'Concentracao de gastos em "' + maior.categoria + '"',
        descricao: 'Essa categoria representa ' + participacao +
                   '% das despesas do mes (' + formatarMoeda(maior.total) +
                   '). Vale olhar os gastos recorrentes dela.',
        prioridade: 'media'
      });
    }
  }
  ind.orcamentosEstourados.slice(0, 3).forEach(function (o) {
    sugestoes.push({
      titulo: 'Orcamento estourado: ' + o.categoria,
      descricao: 'Gasto de ' + formatarMoeda(o.realizado) + ' contra ' +
                 formatarMoeda(o.orcado) + ' planejados (' + o.percentual +
                 '%). Vale revisar ou ajustar o orcamento.',
      prioridade: 'media'
    });
  });

  // 4. Variacao de gastos.
  if (ind.variacaoDespesasPercentual >= 25 && ind.despesaMesAnterior > 0) {
    sugestoes.push({
      titulo: 'Gastos subiram em relacao ao mes passado',
      descricao: 'As despesas cresceram ' + ind.variacaoDespesasPercentual +
                 '% frente ao mes anterior. Se nao foi algo pontual, vale entender a causa.',
      prioridade: 'media'
    });
  }

  // 5. Metas em risco.
  ind.metasProximasDoPrazo.slice(0, 3).forEach(function (m) {
    var texto = 'Faltam ' + formatarMoeda(m.faltante) + ' e ' + m.diasRestantes + ' dia(s).';
    if (m.aporteNecessario) {
      texto += ' Seria preciso aportar cerca de ' + formatarMoeda(m.aporteNecessario) +
               ' por mes para cumprir o prazo.';
    }
    sugestoes.push({
      titulo: 'Meta "' + m.nome + '" perto do prazo',
      descricao: texto,
      prioridade: 'alta'
    });
  });
  ind.metasInatingiveis.slice(0, 3).forEach(function (m) {
    sugestoes.push({
      titulo: 'Meta "' + m.nome + '" sem previsao de conclusao',
      descricao: m.motivo + ' Considere aumentar o aporte mensal ou estender o prazo.',
      prioridade: 'media'
    });
  });

  // 6. Ganho concreto de acelerar um pouco.
  var metaEmAndamento = ind.metas.filter(function (m) {
    return m.faltante > 0 && m.aporteMensal > 0 && m.mesesRestantes;
  })[0];
  if (metaEmAndamento) {
    var acrescimo = 100;
    var simulado = calcularMesesParaMeta(
      metaEmAndamento.saldo, metaEmAndamento.alvo,
      metaEmAndamento.aporteMensal + acrescimo, 0);
    if (simulado.meses !== null && simulado.meses < metaEmAndamento.mesesRestantes) {
      sugestoes.push({
        titulo: 'Pequeno aumento, prazo menor',
        descricao: 'Se voce aumentar o aporte da meta "' + metaEmAndamento.nome +
                   '" em ' + formatarMoeda(acrescimo) + ' por mes, pode atingi-la cerca de ' +
                   (metaEmAndamento.mesesRestantes - simulado.meses) + ' mes(es) antes.',
        prioridade: 'baixa'
      });
    }
  }

  if (!sugestoes.length) {
    sugestoes.push({
      titulo: 'Situacao equilibrada',
      descricao: 'Nenhum ponto critico identificado neste mes. Manter o ritmo de ' +
                 'aportes e registrar os lancamentos em dia ja e um bom plano.',
      prioridade: 'baixa'
    });
  }

  var resumo = 'Em ' + ind.mesFormatado + ': receitas de ' + formatarMoeda(ind.receitas) +
    ', despesas de ' + formatarMoeda(ind.despesas) + ', saldo de ' + formatarMoeda(ind.saldo) +
    ' e taxa de poupanca de ' + ind.taxaPoupanca + '%. ' +
    (ind.reserva.existe
      ? 'A reserva cobre ' + ind.reserva.coberturaMeses + ' mes(es) de gastos.'
      : 'Ainda nao ha reserva de emergencia cadastrada.');

  return {
    resumo: resumo,
    sugestoes: sugestoes,
    alertas: ind.alertas,
    observacoes: 'Sugestoes geradas por regras internas do sistema, com base nos seus ' +
                 'proprios lancamentos. Nao constituem aconselhamento financeiro profissional.',
    fonte: 'REGRAS'
  };
}
