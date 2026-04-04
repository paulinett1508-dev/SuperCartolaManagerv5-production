import Gols from "../models/Gols.js";
import axios from "axios";
import logger from '../utils/logger.js';

// Exportando a função listarGols explicitamente
// ✅ v2.0: Adicionado filtro obrigatório por ligaId (multi-tenant fix)
export const listarGols = async function (req, res) {
  try {
    const { rodada, ligaId } = req.query;

    // ✅ v2.0: ligaId é OBRIGATÓRIO para isolamento multi-tenant
    if (!ligaId) {
      return res.status(400).json({
        error: "Parâmetro ligaId é obrigatório",
        message: "Informe o ID da liga para listar os gols"
      });
    }

    // Filtro base com ligaId obrigatório
    const filtro = { ligaId: ligaId };

    // Filtro adicional por rodada (opcional)
    if (rodada) {
      filtro.rodada = parseInt(rodada, 10);
    }

    // Buscar gols filtrados por liga
    const gols = await Gols.find(filtro)
      .sort({
        rodada: -1,
        gols: -1,
        nome: 1,
      })
      .lean();

    return res.status(200).json({
      status: "ok",
      data: gols,
      meta: {
        total: gols.length,
        ligaId: ligaId,
        rodada: rodada || "todas"
      }
    });
  } catch (err) {
    logger.error("Erro ao listar gols:", err);
    return res.status(500).json({
      error: "Erro ao listar gols",
      details: err.message,
    });
  }
};

// Exportando a função com ambos os nomes para compatibilidade
// ✅ v2.0: Adicionado ligaId obrigatório (multi-tenant fix)
export const extrairGolsDaRodada = async function (req, res) {
  logger.log("=== INICIANDO EXTRAÇÃO DE GOLS ===");
  const { timeIds, rodada, reprocessar, ligaId } = req.body;
  logger.log("Parâmetros recebidos para extração:", {
    timeIds,
    rodada,
    reprocessar,
    ligaId,
  });

  // ✅ v2.0: ligaId é OBRIGATÓRIO para isolamento multi-tenant
  if (!ligaId) {
    logger.error("Erro: ligaId é obrigatório");
    return res.status(400).json({
      error: "Parâmetro ligaId é obrigatório",
      message: "Informe o ID da liga para extrair os gols"
    });
  }

  if (!Array.isArray(timeIds) || !rodada) {
    logger.error("Erro: Parâmetros inválidos", { timeIds, rodada });
    return res.status(400).json({ error: "Parâmetros inválidos (timeIds e rodada são obrigatórios)" });
  }

  // Contadores e arrays para rastreamento
  let totalCriados = 0;
  let totalErros = 0;
  let errosDetalhados = [];
  let atletasComGols = [];
  let duplicadosDetalhes = [];
  let timesSemGols = [];
  let totalAtualizados = 0;

  try {
    logger.log(
      `Iniciando processamento de ${timeIds.length} times para a rodada ${rodada}`,
    );

    for (const timeId of timeIds) {
      const url = `https://api.cartola.globo.com/time/id/${timeId}/${rodada}`;
      logger.log(`[Time ${timeId}] Consultando API: ${url}`);

      try {
        const { data } = await axios.get(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36",
          },
        });

        // Implementação da abordagem de fallback em cascata para o campo nome_cartola
        const nomeCartola =
          data.nome_cartola ?? data.time?.nome ?? "Cartoleiro Desconhecido";
        logger.log(`[Time ${timeId}] Nome do cartola: ${nomeCartola}`);

        if (
          !data.atletas ||
          !Array.isArray(data.atletas) ||
          data.atletas.length === 0
        ) {
          logger.log(
            `[Time ${timeId}] Nenhum atleta encontrado para o time ${nomeCartola}`,
          );
          timesSemGols.push({ timeId, nome_cartola: nomeCartola });
          continue;
        }

        logger.log(
          `[Time ${timeId}] Total de atletas encontrados: ${data.atletas.length}`,
        );
        let atletasComGolNoTime = 0;

        for (const atleta of data.atletas) {
          const atletaId = atleta.atleta_id;
          const apelido = atleta.apelido;

          // Melhorar a conversão dos campos G e GC para número
          let G = 0;
          let GC = 0; // ✅ Fix: Coletar golsContra (GC) que estava sendo ignorado
          try {
            // Verificação mais robusta para o campo G
            if (atleta.scout && atleta.scout.G !== undefined) {
              G = Number(atleta.scout.G);
              if (isNaN(G)) {
                logger.warn(
                  `[Time ${timeId}] Valor inválido para gols do atleta ${apelido}: ${atleta.scout.G}, definindo como 0`,
                );
                G = 0;
              }
            }
            // ✅ Fix: Coletar GC (golsContra)
            if (atleta.scout && atleta.scout.GC !== undefined) {
              GC = Number(atleta.scout.GC);
              if (isNaN(GC)) {
                logger.warn(
                  `[Time ${timeId}] Valor inválido para golsContra do atleta ${apelido}: ${atleta.scout.GC}, definindo como 0`,
                );
                GC = 0;
              }
            }
          } catch (convErr) {
            logger.error(
              `[Time ${timeId}] Erro ao converter gols para o atleta ${apelido}:`,
              convErr.message,
            );
            G = 0;
            GC = 0;
          }

          logger.log(
            `[Time ${timeId}] Atleta ${apelido} (ID: ${atletaId}) - Gols: ${G} (${typeof G})`,
          );

          if (G > 0 || GC > 0) { // ✅ Fix: Também registrar atletas com golsContra
            atletasComGolNoTime++;
            atletasComGols.push({
              atletaId,
              apelido,
              G,
              GC, // ✅ Fix: Incluir GC
              timeId,
              rodada,
              nome_cartola: nomeCartola,
            });

            try {
              // ✅ v2.0: Verificar duplicidade com ligaId (índice único do model)
              logger.log(
                `[Time ${timeId}] Verificando duplicidade para ${apelido} - Gols: ${G} - Rodada: ${rodada}`,
              );

              const jaExiste = await Gols.findOne({
                ligaId: ligaId,
                rodada: rodada,
                atletaId: atletaId,
              });

              if (jaExiste && !reprocessar) {
                logger.log(
                  `[Time ${timeId}] ⚠️ Registro duplicado para ${apelido} - Gols: ${G} - Rodada: ${rodada}`,
                );
                duplicadosDetalhes.push({
                  atletaId,
                  apelido,
                  gols: G,
                  rodada,
                  timeId,
                  ligaId,
                });
              } else if (jaExiste && reprocessar) {
                logger.log(
                  `[Time ${timeId}] 🔄 Atualizando registro existente para ${apelido} - Gols: ${G} - Rodada: ${rodada}`,
                );

                try {
                  // ✅ v2.0: Atualizar com campos corretos do model
                  await Gols.findOneAndUpdate(
                    {
                      ligaId: ligaId,
                      rodada: rodada,
                      atletaId: atletaId,
                    },
                    {
                      gols: G,
                      golsContra: GC, // ✅ Fix: Salvar GC
                      golsLiquidos: G - GC, // ✅ Fix: Calcular saldo
                      nome: apelido,
                      timeId: timeId,
                      pontos: atleta.pontos_num || 0,
                      posicao: atleta.posicao_id,
                      clube: atleta.clube_id,
                      clubeNome: atleta.clube?.nome || '',
                    },
                    { new: true },
                  );
                  totalAtualizados++;
                  logger.log(
                    `[Time ${timeId}] Registro atualizado com sucesso para ${apelido}`,
                  );
                } catch (dbErr) {
                  logger.error(
                    `[Time ${timeId}] Erro ao atualizar no banco de dados para ${apelido}:`,
                    dbErr.message,
                  );
                  errosDetalhados.push({
                    timeId,
                    atletaId,
                    apelido,
                    error: `Erro ao atualizar no banco: ${dbErr.message}`,
                  });
                  totalErros++;
                }
              } else {
                logger.log(
                  `[Time ${timeId}] ✅ Criando novo registro para ${apelido} - Gols: ${G} - Rodada: ${rodada}`,
                );

                try {
                  // ✅ v2.0: Incluir ligaId obrigatório + campos corretos do model
                  await Gols.create({
                    ligaId: ligaId,
                    rodada: rodada,
                    atletaId: atletaId,
                    nome: apelido,
                    timeId: timeId,
                    gols: G,
                    golsContra: GC, // ✅ Fix: Salvar GC (era hardcoded 0)
                    golsLiquidos: G - GC, // ✅ Fix: Calcular saldo
                    pontos: atleta.pontos_num || 0,
                    posicao: atleta.posicao_id,
                    clube: atleta.clube_id,
                    clubeNome: atleta.clube?.nome || '',
                  });
                  totalCriados++;
                  logger.log(
                    `[Time ${timeId}] Registro criado com sucesso para ${apelido}`,
                  );
                } catch (dbErr) {
                  logger.error(
                    `[Time ${timeId}] Erro ao salvar no banco de dados para ${apelido}:`,
                    dbErr.message,
                  );
                  errosDetalhados.push({
                    timeId,
                    atletaId,
                    apelido,
                    error: `Erro ao salvar no banco: ${dbErr.message}`,
                  });
                  totalErros++;
                }
              }
            } catch (dbQueryErr) {
              logger.error(
                `[Time ${timeId}] Erro ao consultar banco de dados para ${apelido}:`,
                dbQueryErr.message,
              );
              errosDetalhados.push({
                timeId,
                atletaId,
                apelido,
                error: `Erro na consulta ao banco: ${dbQueryErr.message}`,
              });
              totalErros++;
            }
          }
        }

        logger.log(
          `[Time ${timeId}] Atletas com gols neste time: ${atletasComGolNoTime}`,
        );
        if (atletasComGolNoTime === 0) {
          logger.log(
            `[Time ${timeId}] Nenhum atleta com gols encontrado para o time ${nomeCartola}`,
          );
        }
      } catch (apiErr) {
        logger.error(
          `[Time ${timeId}] ❌ Erro ao processar time:`,
          apiErr.message,
        );
        totalErros++;
        errosDetalhados.push({
          timeId,
          error: `Erro na API: ${apiErr.message}`,
        });
      }
    }

    // Resumo detalhado da extração
    logger.log("\n=== RESUMO DA EXTRAÇÃO DE GOLS ===");
    logger.log(`- Total de times processados: ${timeIds.length}`);
    logger.log(`- Atletas com gols encontrados: ${atletasComGols.length}`);
    if (atletasComGols.length > 0) {
      logger.log("- Lista de atletas com gols:");
      atletasComGols.forEach((a) => {
        logger.log(
          `  * ${a.apelido} (Time: ${a.nome_cartola}) - ${a.G} gol(s)`,
        );
      });
    }

    logger.log(`- Registros duplicados: ${duplicadosDetalhes.length}`);
    if (duplicadosDetalhes.length > 0) {
      logger.log("- Lista de registros duplicados:");
      duplicadosDetalhes.forEach((d) => {
        logger.log(
          `  * ${d.apelido} (Time: ${d.nome_cartola}) - ${d.G} gol(s)`,
        );
      });
    }

    logger.log(`- Novos registros criados: ${totalCriados}`);
    logger.log(`- Registros atualizados: ${totalAtualizados}`);
    logger.log(`- Erros encontrados: ${totalErros}`);
    if (totalErros > 0) {
      logger.log(
        "- Detalhes dos erros:",
        JSON.stringify(errosDetalhados, null, 2),
      );
    }
    logger.log("=== FIM DA EXTRAÇÃO DE GOLS ===");

    const mensagemFinal = reprocessar
      ? `Extração concluída. Registros criados: ${totalCriados}, atualizados: ${totalAtualizados}`
      : `Extração concluída. Registros criados: ${totalCriados}`;

    return res.status(200).json({
      status: "ok",
      message: mensagemFinal,
      totalCriados,
      totalAtualizados,
      totalErros,
      errosDetalhados,
      atletasComGols,
      duplicadosDetalhes,
      timesSemGols,
      reprocessar,
    });
  } catch (err) {
    logger.error("❌ ERRO GERAL NA EXTRAÇÃO:", err);
    logger.error("Stack trace:", err.stack);
    return res.status(500).json({
      error: "Erro ao extrair gols",
      details: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
};

// Adicionando um alias para a função extrairGolsDaRodada para compatibilidade com a importação
export const extrairGolsRodada = extrairGolsDaRodada;

// Implementação da função extrairGolsRodadaTime que chama extrairGolsDaRodada
export async function extrairGolsRodadaTime(rodada, time) {
  logger.log(
    `Chamando extrairGolsRodadaTime para rodada ${rodada} e time ${time}`,
  );
  // Cria um objeto de requisição e resposta simulados para chamar extrairGolsDaRodada
  const req = {
    body: {
      timeIds: Array.isArray(time) ? time : [time],
      rodada: rodada,
    },
  };

  // Objeto de resposta simulado
  const res = {
    status: function (statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json: function (data) {
      this.data = data;
      return this;
    },
  };

  // Chama a função extrairGolsDaRodada com os objetos simulados
  await extrairGolsDaRodada(req, res);

  // Retorna os dados da resposta
  return res.data;
}
