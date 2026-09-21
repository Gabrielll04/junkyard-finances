/**
 * Previsoes.gs
 * ---------------------------------------------------------------------------
 * Matematica financeira do sistema. Todas as funcoes deste arquivo sao puras:
 * recebem numeros, devolvem numeros/objetos e nao tocam na planilha. Isso as
 * torna faceis de testar (ver Testes.gs).
 *
 * Convencoes:
 *  - taxa mensal sempre em decimal (0.008 = 0,8% ao mes);
 *  - aportes considerados no final de cada mes (serie postecipada);
 *  - meses sempre inteiros quando representam prazo pratico.
 */

/** Teto de meses usado para evitar loops/valores absurdos (100 anos). */
var LIMITE_MESES_PREVISAO = 1200;

/**
 * Valor futuro de um saldo com aportes mensais constantes.
 * FV = PV * (1+i)^n + PMT * [((1+i)^n - 1) / i]      (i > 0)
 * FV = PV + PMT * n                                   (i = 0)
 *
 * @param {number} saldoAtual Valor presente (PV).
 * @param {number} aporteMensal Aporte mensal (PMT).
 * @param {number} taxaMensal Taxa mensal decimal (i).
 * @param {number} meses Numero de meses (n).
 * @return {number} Valor futuro arredondado em 2 casas.
 */
function calcularValorFuturo(saldoAtual, aporteMensal, taxaMensal, meses) {
  var pv = paraNumero(saldoAtual); if (isNaN(pv)) pv = 0;
  var pmt = paraNumero(aporteMensal); if (isNaN(pmt)) pmt = 0;
  var i = paraNumero(taxaMensal); if (isNaN(i)) i = 0;
  var n = paraNumero(meses); if (isNaN(n)) n = 0;

  if (n <= 0) return arredondar2(pv);
  if (i <= 0) return arredondar2(pv + pmt * n);

  var fator = Math.pow(1 + i, n);
  return arredondar2(pv * fator + pmt * ((fator - 1) / i));
}

/**
 * Quantos meses faltam para atingir a meta com o aporte informado.
 *
 * i = 0:  n = (meta - PV) / PMT
 * i > 0:  n = ln((meta*i + PMT) / (PV*i + PMT)) / ln(1+i)
 *
 * @param {number} valorAtual Saldo de partida.
 * @param {number} valorMeta Alvo.
 * @param {number} aporteMensal Aporte mensal.
 * @param {number} taxaMensal Taxa mensal decimal.
 * @return {{meses: number|null, atingivel: boolean, jaAtingida: boolean,
 *           mensagem: string}}
 */
function calcularMesesParaMeta(valorAtual, valorMeta, aporteMensal, taxaMensal) {
  var pv = paraNumero(valorAtual); if (isNaN(pv)) pv = 0;
  var meta = paraNumero(valorMeta); if (isNaN(meta)) meta = 0;
  var pmt = paraNumero(aporteMensal); if (isNaN(pmt)) pmt = 0;
  var i = paraNumero(taxaMensal); if (isNaN(i)) i = 0;

  if (meta <= 0) {
    return {
      meses: null, atingivel: false, jaAtingida: false,
      mensagem: 'Meta sem valor alvo definido.'
    };
  }
  if (pv >= meta) {
    return {
      meses: 0, atingivel: true, jaAtingida: true,
      mensagem: 'Meta ja atingida.'
    };
  }

  // Sem taxa: progressao linear simples.
  if (i <= 0) {
    if (pmt <= 0) {
      return {
        meses: null, atingivel: false, jaAtingida: false,
        mensagem: 'Sem aporte mensal e sem rendimento, a meta nao sera atingida.'
      };
    }
    var nSimples = Math.ceil((meta - pv) / pmt);
    if (nSimples > LIMITE_MESES_PREVISAO) {
      return {
        meses: null, atingivel: false, jaAtingida: false,
        mensagem: 'Com esse aporte, a meta levaria mais de 100 anos. Aumente o aporte.'
      };
    }
    return {
      meses: nSimples, atingivel: true, jaAtingida: false,
      mensagem: 'Previsao de ' + nSimples + ' mes(es) para atingir a meta.'
    };
  }

  // Com taxa: forma fechada da serie postecipada.
  var denominador = pv * i + pmt;
  var numerador = meta * i + pmt;
  if (denominador <= 0) {
    return {
      meses: null, atingivel: false, jaAtingida: false,
      mensagem: 'Sem saldo e sem aporte a meta nao evolui.'
    };
  }
  var razao = numerador / denominador;
  if (razao <= 1) {
    return {
      meses: 0, atingivel: true, jaAtingida: true,
      mensagem: 'Meta ja atingida.'
    };
  }
  var n = Math.log(razao) / Math.log(1 + i);
  if (!isFinite(n) || n < 0) {
    return {
      meses: null, atingivel: false, jaAtingida: false,
      mensagem: 'Nao foi possivel calcular o prazo com os parametros informados.'
    };
  }
  var meses = Math.ceil(n);
  if (meses > LIMITE_MESES_PREVISAO) {
    return {
      meses: null, atingivel: false, jaAtingida: false,
      mensagem: 'Com esses parametros, a meta levaria mais de 100 anos.'
    };
  }
  return {
    meses: meses, atingivel: true, jaAtingida: false,
    mensagem: 'Previsao de ' + meses + ' mes(es) para atingir a meta.'
  };
}

/**
 * Aporte mensal necessario para atingir a meta em N meses.
 * PMT = (meta - PV*(1+i)^n) * i / ((1+i)^n - 1)    (i > 0)
 * PMT = (meta - PV) / n                             (i = 0)
 *
 * @param {number} valorAtual
 * @param {number} valorMeta
 * @param {number} meses
 * @param {number} taxaMensal
 * @return {{aporte: number|null, viavel: boolean, mensagem: string}}
 */
function calcularAporteNecessario(valorAtual, valorMeta, meses, taxaMensal) {
  var pv = paraNumero(valorAtual); if (isNaN(pv)) pv = 0;
  var meta = paraNumero(valorMeta); if (isNaN(meta)) meta = 0;
  var n = paraNumero(meses); if (isNaN(n)) n = 0;
  var i = paraNumero(taxaMensal); if (isNaN(i)) i = 0;

  if (meta <= 0) {
    return { aporte: null, viavel: false, mensagem: 'Meta sem valor alvo definido.' };
  }
  if (n <= 0) {
    if (pv >= meta) {
      return { aporte: 0, viavel: true, mensagem: 'Meta ja atingida.' };
    }
    return {
      aporte: null, viavel: false,
      mensagem: 'Prazo invalido: informe ao menos 1 mes.'
    };
  }

  var fator = i > 0 ? Math.pow(1 + i, n) : 1;
  var faltante = meta - (i > 0 ? pv * fator : pv);
  if (faltante <= 0) {
    return {
      aporte: 0, viavel: true,
      mensagem: 'O saldo atual ja alcanca a meta no prazo informado.'
    };
  }

  var aporte = (i > 0)
    ? faltante * i / (fator - 1)
    : faltante / n;

  return {
    aporte: arredondar2(aporte), viavel: true,
    mensagem: 'Aporte mensal necessario de ' + formatarMoeda(aporte) +
              ' por ' + n + ' mes(es).'
  };
}

/**
 * Converte taxa anual efetiva em taxa mensal equivalente.
 * i_mes = (1 + i_ano)^(1/12) - 1
 * @param {number} taxaAnual Decimal (0.12 = 12% ao ano).
 * @return {number} Taxa mensal decimal (8 casas para nao perder precisao).
 */
function calcularTaxaMensalEquivalente(taxaAnual) {
  var a = paraNumero(taxaAnual);
  if (isNaN(a) || a <= -1) return 0;
  var mensal = Math.pow(1 + a, 1 / 12) - 1;
  return Math.round(mensal * 1e8) / 1e8;
}

/**
 * Converte taxa mensal em taxa anual equivalente.
 * @param {number} taxaMensal
 * @return {number}
 */
function calcularTaxaAnualEquivalente(taxaMensal) {
  var m = paraNumero(taxaMensal);
  if (isNaN(m) || m <= -1) return 0;
  return Math.round((Math.pow(1 + m, 12) - 1) * 1e8) / 1e8;
}

/**
 * Progresso percentual de uma meta, limitado entre 0 e 100.
 * @param {number} saldoAtual
 * @param {number} valorMeta
 * @return {number} Percentual com 2 casas (ex.: 42.35).
 */
function calcularProgressoMeta(saldoAtual, valorMeta) {
  var saldo = paraNumero(saldoAtual); if (isNaN(saldo)) saldo = 0;
  var meta = paraNumero(valorMeta);
  if (isNaN(meta) || meta <= 0) return 0;
  var percentual = (saldo / meta) * 100;
  if (percentual < 0) percentual = 0;
  if (percentual > 100) percentual = 100;
  return arredondar2(percentual);
}

/**
 * Cobertura da reserva de emergencia em meses de despesa.
 * @param {number} saldoReserva
 * @param {number} despesaMediaMensal
 * @return {number} Meses com 2 casas; 0 quando nao ha base de despesa.
 */
function calcularCoberturaReserva(saldoReserva, despesaMediaMensal) {
  var saldo = paraNumero(saldoReserva); if (isNaN(saldo)) saldo = 0;
  var despesa = paraNumero(despesaMediaMensal);
  if (isNaN(despesa) || despesa <= 0) return 0;
  return arredondar2(saldo / despesa);
}

/**
 * Projecao mes a mes, util para graficos e para a aba Simulacoes.
 * @param {number} saldoAtual
 * @param {number} aporteMensal
 * @param {number} taxaMensal
 * @param {number} meses
 * @return {Array<{mes: number, saldo: number, aportado: number, rendimento: number}>}
 */
function projetarSerieMensal(saldoAtual, aporteMensal, taxaMensal, meses) {
  var saldo = paraNumero(saldoAtual); if (isNaN(saldo)) saldo = 0;
  var pmt = paraNumero(aporteMensal); if (isNaN(pmt)) pmt = 0;
  var i = paraNumero(taxaMensal); if (isNaN(i)) i = 0;
  var n = Math.min(Math.max(parseInt(meses, 10) || 0, 0), 600);

  var serie = [];
  var acumuladoAportes = 0;
  var acumuladoRendimento = 0;
  for (var m = 1; m <= n; m++) {
    var rendimento = saldo * i;
    saldo = saldo + rendimento + pmt;
    acumuladoAportes += pmt;
    acumuladoRendimento += rendimento;
    serie.push({
      mes: m,
      saldo: arredondar2(saldo),
      aportado: arredondar2(acumuladoAportes),
      rendimento: arredondar2(acumuladoRendimento)
    });
  }
  return serie;
}

/**
 * Simulacao completa de uma meta: responde de uma vez as perguntas do painel.
 *
 * @param {Object} parametros
 *   {number} saldoAtual
 *   {number} valorAlvo
 *   {number} aporteMensal      aporte atual/planejado
 *   {number=} aporteSimulado   aporte alternativo a comparar
 *   {number=} taxaMensal
 *   {Date|string=} dataPrazo   prazo da meta, se houver
 *   {number=} mesesProjecao    horizonte do "quanto terei em N meses" (padrao 12)
 * @return {Object} Resultado consolidado, pronto para exibicao.
 */
function simularMeta(parametros) {
  var p = parametros || {};
  var saldo = paraNumero(p.saldoAtual); if (isNaN(saldo)) saldo = 0;
  var alvo = paraNumero(p.valorAlvo); if (isNaN(alvo)) alvo = 0;
  var aporte = paraNumero(p.aporteMensal); if (isNaN(aporte)) aporte = 0;
  var taxa = paraNumero(p.taxaMensal); if (isNaN(taxa)) taxa = 0;
  var mesesProjecao = parseInt(p.mesesProjecao, 10);
  if (isNaN(mesesProjecao) || mesesProjecao <= 0) mesesProjecao = 12;

  var faltante = arredondar2(Math.max(alvo - saldo, 0));
  var progresso = calcularProgressoMeta(saldo, alvo);
  var prazoAtual = calcularMesesParaMeta(saldo, alvo, aporte, taxa);

  var resultado = {
    saldoAtual: arredondar2(saldo),
    valorAlvo: arredondar2(alvo),
    aporteMensal: arredondar2(aporte),
    taxaMensal: taxa,
    valorFaltante: faltante,
    progressoPercentual: progresso,
    mesesRestantes: prazoAtual.meses,
    atingivel: prazoAtual.atingivel,
    jaAtingida: prazoAtual.jaAtingida,
    mensagemPrazo: prazoAtual.mensagem,
    projecao: {
      meses: mesesProjecao,
      valorFuturo: calcularValorFuturo(saldo, aporte, taxa, mesesProjecao)
    },
    alertas: []
  };

  // Data prevista de conclusao, quando houver prazo calculavel.
  if (prazoAtual.atingivel && prazoAtual.meses !== null) {
    var previsao = new Date();
    previsao.setMonth(previsao.getMonth() + prazoAtual.meses);
    resultado.dataPrevista = previsao;
    resultado.dataPrevistaFormatada = formatarData(previsao);
  }

  // Comparacao com aporte alternativo.
  var aporteSimulado = paraNumero(p.aporteSimulado);
  if (!isNaN(aporteSimulado) && aporteSimulado >= 0 &&
      arredondar2(aporteSimulado) !== arredondar2(aporte)) {
    var prazoSimulado = calcularMesesParaMeta(saldo, alvo, aporteSimulado, taxa);
    resultado.cenarioSimulado = {
      aporteMensal: arredondar2(aporteSimulado),
      meses: prazoSimulado.meses,
      atingivel: prazoSimulado.atingivel,
      mensagem: prazoSimulado.mensagem,
      valorFuturo: calcularValorFuturo(saldo, aporteSimulado, taxa, mesesProjecao)
    };
    if (prazoAtual.meses !== null && prazoSimulado.meses !== null) {
      var diferenca = prazoAtual.meses - prazoSimulado.meses;
      resultado.cenarioSimulado.diferencaMeses = diferenca;
      if (diferenca > 0) {
        resultado.cenarioSimulado.mensagemComparativa =
          'Com aporte de ' + formatarMoeda(aporteSimulado) + ', voce atinge a meta ' +
          diferenca + ' mes(es) antes.';
      } else if (diferenca < 0) {
        resultado.cenarioSimulado.mensagemComparativa =
          'Com aporte de ' + formatarMoeda(aporteSimulado) + ', voce levaria ' +
          Math.abs(diferenca) + ' mes(es) a mais.';
      } else {
        resultado.cenarioSimulado.mensagemComparativa =
          'O prazo praticamente nao muda com esse aporte.';
      }
    }
  }

  // Aporte necessario para cumprir o prazo declarado da meta.
  var dataPrazo = converterParaData(p.dataPrazo);
  if (dataPrazo && alvo > 0) {
    var mesesAteOPrazo = Math.ceil(mesesEntre(new Date(), dataPrazo));
    resultado.prazo = {
      data: dataPrazo,
      dataFormatada: formatarData(dataPrazo),
      mesesRestantesAteOPrazo: mesesAteOPrazo
    };
    if (mesesAteOPrazo <= 0) {
      if (saldo < alvo) {
        resultado.alertas.push(
          'O prazo da meta ja venceu e ainda faltam ' + formatarMoeda(faltante) + '.');
      }
      resultado.prazo.aporteNecessario = null;
      resultado.prazo.mensagem = 'Prazo vencido.';
    } else {
      var necessario = calcularAporteNecessario(saldo, alvo, mesesAteOPrazo, taxa);
      resultado.prazo.aporteNecessario = necessario.aporte;
      resultado.prazo.mensagem = necessario.mensagem;
      if (necessario.viavel && necessario.aporte !== null && necessario.aporte > aporte) {
        resultado.alertas.push(
          'Para cumprir o prazo seria preciso aportar ' + formatarMoeda(necessario.aporte) +
          ' por mes (hoje: ' + formatarMoeda(aporte) + ').');
      }
    }
  }

  if (!prazoAtual.atingivel && !prazoAtual.jaAtingida) {
    resultado.alertas.push(prazoAtual.mensagem);
  }

  return resultado;
}

/**
 * Simula todas as metas ativas e, opcionalmente, grava o resultado na aba
 * Simulacoes para consulta posterior.
 * @param {boolean=} registrarNaPlanilha Padrao false.
 * @return {Array<Object>} Lista de simulacoes por meta.
 */
function simularTodasAsMetas(registrarNaPlanilha) {
  var metas = listarMetas(false);
  var taxaPadrao = obterConfigNumero('taxa_mensal_padrao', 0);
  var horizonte = obterConfigNumero('meses_projecao_padrao', 12);

  var resultados = metas.map(function (meta) {
    var taxa = (meta.taxa_mensal_personalizada === '' ||
                meta.taxa_mensal_personalizada === null ||
                meta.taxa_mensal_personalizada === undefined)
      ? taxaPadrao
      : paraNumero(meta.taxa_mensal_personalizada);
    if (isNaN(taxa)) taxa = taxaPadrao;

    var simulacao = simularMeta({
      saldoAtual: meta.saldoAtual,
      valorAlvo: meta.valor_alvo,
      aporteMensal: meta.aporte_mensal_planejado,
      taxaMensal: taxa,
      dataPrazo: meta.data_prazo,
      mesesProjecao: horizonte
    });
    simulacao.idMeta = meta.id_meta;
    simulacao.nomeMeta = meta.nome;
    simulacao.tipoMeta = meta.tipo;
    return simulacao;
  });

  if (registrarNaPlanilha && resultados.length) {
    var agora = new Date();
    adicionarLinhas(ABAS.SIMULACOES, resultados.map(function (r) {
      return {
        data_hora: agora,
        meta_id: r.idMeta,
        meta_nome: r.nomeMeta,
        cenario: 'Aporte atual',
        saldo_atual: r.saldoAtual,
        valor_alvo: r.valorAlvo,
        aporte_mensal: r.aporteMensal,
        taxa_mensal: r.taxaMensal,
        meses: r.mesesRestantes === null ? '' : r.mesesRestantes,
        resultado: r.projecao.valorFuturo,
        observacao: r.mensagemPrazo
      };
    }));
    logInfo('simularTodasAsMetas', 'Simulacoes registradas', { total: resultados.length });
  }

  return resultados;
}
