// PARTICIPANTE-COPA-SC.JS - v2.0 (Módulo Completo 4 Abas)
// Substitui teaser quando status !== 'pre_sorteio'

if (window.Log) Log.info("PARTICIPANTE-COPA-SC", "Carregando módulo v2.0...");

function _esc(str) {
    if (str == null) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, '&#x27;');
}

let estadoCopaSC = { carregando:false, ligaId:null, timeId:null, participante:null, tabAtiva:"minha-copa", config:null };

const STATUS_LABELS = { pre_sorteio:"Em Breve", classificatorio:"Classificatória", grupos:"Fase de Grupos", oitavas:"Oitavas de Final", quartas:"Quartas de Final", semis:"Semifinal", final:"Final", encerrado:"Encerrado" };
const FASE_LABELS = { oitavas:"Oitavas de Final", quartas:"Quartas de Final", semis:"Semifinal", terceiro_lugar:"3° Lugar", final:"Final" };
const FASES_ORDEM = ["oitavas","quartas","semis","terceiro_lugar","final"];

export async function inicializarCopaTimesSC({ participante, ligaId, timeId }) {
    if (estadoCopaSC.carregando) return;
    estadoCopaSC.carregando = true;
    if (window.Log) Log.info("PARTICIPANTE-COPA-SC", "Inicializando ligaId="+ligaId+", timeId="+timeId);
    estadoCopaSC.ligaId=ligaId; estadoCopaSC.timeId=timeId; estadoCopaSC.participante=participante;
    const container=document.getElementById("copa-times-sc-container");
    if (!container) { if (window.Log) Log.error("PARTICIPANTE-COPA-SC","Container nao encontrado!"); estadoCopaSC.carregando=false; return; }
    let config=null;
    try {
        const resp=await fetch("/api/copa-sc/"+ligaId+"/config");
        if (!resp.ok) throw new Error("HTTP "+resp.status);
        config=await resp.json();
    } catch(err) { if (window.Log) Log.warn("PARTICIPANTE-COPA-SC","Falha ao buscar config.",err); estadoCopaSC.carregando=false; return; }
    if (!config||config.status==="pre_sorteio") { if (window.Log) Log.info("PARTICIPANTE-COPA-SC","Mantendo teaser."); estadoCopaSC.carregando=false; return; }
    try {
        estadoCopaSC.config=config;
        const statusLabel=_esc(STATUS_LABELS[config.status]||config.status||"");
        const strip=document.createElement("div"); strip.className="copa-module-strip";
        const ic=document.createElement("span"); ic.className="material-icons copa-strip-icon"; ic.textContent="emoji_events";
        const tit=document.createElement("span"); tit.className="copa-strip-title"; tit.textContent="Copa de Times SC";
        const bdg=document.createElement("span"); bdg.className="copa-strip-badge"; bdg.textContent=statusLabel;
        strip.appendChild(ic); strip.appendChild(tit); strip.appendChild(bdg);
        const tabsEl=document.createElement("div"); tabsEl.className="copa-tabs"; tabsEl.setAttribute("role","tablist");
        [["minha-copa","Minha Copa",true],["grupos","Grupos",false],["chaveamento","Chaveamento",false],["classificatorio","Classificatória",false]]
        .forEach(([id,label,ativo])=>{
            const btn=document.createElement("button");
            btn.className="copa-tab"+(ativo?" ativo":""); btn.dataset.tab=id;
            btn.setAttribute("role","tab"); btn.setAttribute("aria-selected",String(ativo));
            btn.textContent=label; tabsEl.appendChild(btn);
        });
        const contentEl=document.createElement("div"); contentEl.id="copa-tab-content"; contentEl.className="copa-tab-content";
        container.innerHTML="";
        container.appendChild(strip); container.appendChild(tabsEl); container.appendChild(contentEl);
        _setupTabs(ligaId,timeId);
        await _carregarTab("minha-copa",ligaId,timeId);
        if (window.Log) Log.info("PARTICIPANTE-COPA-SC","Módulo v2.0 carregado.");
    } finally {
        estadoCopaSC.carregando = false;
    }
}

function _setupTabs(ligaId,timeId) {
    const tabs=document.querySelectorAll(".copa-tab");
    tabs.forEach(tab=>{
        tab.addEventListener("click",async()=>{
            tabs.forEach(t=>{t.classList.remove("ativo");t.setAttribute("aria-selected","false");});
            tab.classList.add("ativo"); tab.setAttribute("aria-selected","true");
            const nomeTab=tab.dataset.tab; estadoCopaSC.tabAtiva=nomeTab;
            await _carregarTab(nomeTab,ligaId,timeId);
        });
    });
}

async function _carregarTab(nomeTab,ligaId,timeId) {
    const content=document.getElementById("copa-tab-content"); if (!content) return;
    _mostrarLoading(content);
    try {
        let html="";
        switch(nomeTab) {
            case "minha-copa": html=await _renderMinhaCopa(ligaId,timeId); break;
            case "grupos": html=await _renderGrupos(ligaId); break;
            case "chaveamento": html=await _renderChaveamento(ligaId,timeId); break;
            case "classificatorio": html=await _renderClassificatorio(ligaId,timeId); break;
            default: html="<p class=\"copa-empty\">Aba não encontrada.</p>";
        }
        content.innerHTML=html;
    } catch(err) {
        if (window.Log) Log.error("PARTICIPANTE-COPA-SC","Erro aba "+nomeTab+":",err);
        content.innerHTML="<p class=\"copa-empty\">Nao foi possivel carregar.</p>";
    }
}

function _mostrarLoading(c) {
    c.innerHTML="<div class=\"copa-loading\"><span class=\"material-icons rotating\">refresh</span></div>";
}

async function _renderMinhaCopa(ligaId,timeId) {
    const resp=await fetch("/api/copa-sc/"+ligaId+"/minha-copa/"+timeId);
    if (!resp.ok) throw new Error("HTTP "+resp.status);
    const data=await resp.json();
    const matches=Array.isArray(data.matches)?data.matches:[];
    const faseAtualHtml="<div class=\"copa-fase-atual\"><span class=\"material-icons\">flag</span>"
        +"Fase atual: <strong>"+_esc(STATUS_LABELS[estadoCopaSC.config?.status]||estadoCopaSC.config?.status||"")+"</strong></div>";
    if (matches.length===0) {
        return faseAtualHtml+"<div class=\"copa-card\"><p class=\"copa-card-title\"><span class=\"material-icons\">person</span> Minha Copa</p>"
            +"<p class=\"copa-empty\">Nenhum confronto encontrado ainda.</p></div>";
    }
    const agendados=matches.filter(m=>m.status!=="finalizado");
    const finalizados=matches.filter(m=>m.status==="finalizado");
    let html=faseAtualHtml;
    if (agendados.length>0) {
        html+="<div class=\"copa-card\"><p class=\"copa-card-title\"><span class=\"material-icons\">upcoming</span> Próximo Confronto</p>"
            +renderConfrontoCard(agendados[0],timeId)+"</div>";
    }
    if (finalizados.length>0) {
        html+="<div class=\"copa-card\" style=\"margin-top:10px;\"><p class=\"copa-card-title\"><span class=\"material-icons\">history</span> Histórico</p>"
            +finalizados.map(m=>renderConfrontoCard(m,timeId)).join("")+"</div>";
    }
    return html;
}

function renderConfrontoCard(match,timeId) {
    const isMandante=match.mandante_id===timeId;
    const meuNome=_esc(isMandante?match.mandante_nome:match.visitante_nome);
    const adversarioNome=_esc(isMandante?match.visitante_nome:match.mandante_nome);
    let statusClass="copa-status-agendado",statusTexto="Agendado";
    if (match.status==="finalizado") {
        if (Number(match.vencedor_id)===Number(timeId)) { statusClass="copa-status-vitoria"; statusTexto="Vitória"; }
        else if (match.vencedor_id!=null) { statusClass="copa-status-derrota"; statusTexto="Derrota"; }
        else { statusTexto="Finalizado"; }
    }
    const faseLabel=_esc(FASE_LABELS[match.fase]||match.fase||"");
    const rodadas=Array.isArray(match.rodadas_cartola)?match.rodadas_cartola.join(", "):(match.rodadas_cartola||"");
    let placarHtml="";
    if (match.status==="finalizado"&&match.total!=null) {
        if (typeof match.total==="object") {
            const ptsMandante=match.total.mandante!=null?match.total.mandante:0;
            const ptsVisitante=match.total.visitante!=null?match.total.visitante:0;
            const ptsEu=_esc(String(isMandante?ptsMandante:ptsVisitante));
            const ptsAdv=_esc(String(isMandante?ptsVisitante:ptsMandante));
            placarHtml="<div class=\"copa-confronto-placar\"><span class=\"copa-pts\">"+ptsEu
                +"</span><span class=\"copa-confronto-vs\">vs</span><span class=\"copa-pts\">"+ptsAdv+"</span></div>";
        } else {
            placarHtml="<div class=\"copa-confronto-placar\"><span class=\"copa-pts\">"+_esc(String(match.total))+"</span></div>";
        }
    } else {
        placarHtml="<div class=\"copa-confronto-placar\"><span class=\"copa-matchup-label\">"+meuNome+" vs "+adversarioNome+"</span></div>";
    }
    return "<div class=\"copa-confronto-card "+statusClass+"\">"
        +"<div class=\"copa-confronto-fase\">"+faseLabel+(rodadas?" · Rods. "+_esc(String(rodadas)):"")+"</div>"
        +placarHtml
        +"<span class=\"copa-status-badge\">"+_esc(statusTexto)+"</span></div>";
}

async function _renderGrupos(ligaId) {
    const resp=await fetch("/api/copa-sc/"+ligaId+"/grupos");
    if (!resp.ok) throw new Error("HTTP "+resp.status);
    const data=await resp.json();
    const grupos=Array.isArray(data.grupos)?data.grupos:[];
    if (grupos.length===0) return "<p class=\"copa-empty\">Grupos ainda não definidos.</p>";
    const gruposHtml=grupos.map(grupo=>{
        const standings=Array.isArray(grupo.standings)?grupo.standings:[];
        const rowsHtml=standings.map((time,idx)=>{
            const cls=idx<2?"copa-classificado":"";
            return "<tr class=\""+ cls+"\"><td>"+(idx+1)+"</td>"
                +"<td class=\"copa-nome\" title=\""+_esc(time.nome)+"\">"+_esc(time.nome)+"</td>"
                +"<td>"+(time.jogos!=null?time.jogos:0)+"</td>"
                +"<td><strong>"+(time.pontos!=null?time.pontos:0)+"</strong></td>"
                +"<td>"+(time.vitorias!=null?time.vitorias:0)+"</td>"
                +"<td>"+(time.saldo!=null?time.saldo:0)+"</td>"
            +"<td>"+(time.pontos_marcados!=null?time.pontos_marcados:0)+"</td></tr>";
        }).join("");
        return "<div class=\"copa-grupo-card\"><p class=\"copa-grupo-nome\">"+_esc(grupo.nome)+"</p>"
            +"<table class=\"copa-standings-table\"><thead><tr>"
            +"<th>#</th><th class=\"copa-nome\" style=\"text-align:left;\">Time</th>"
            +"<th>J</th><th>Pts</th><th>V</th><th>Saldo</th><th>PM</th>"
            +"</tr></thead><tbody>"+rowsHtml+"</tbody></table></div>";
    }).join("");
    return "<div class=\"copa-grupos-grid\">"+gruposHtml+"</div>";
}

async function _renderChaveamento(ligaId,timeId) {
    const resp=await fetch("/api/copa-sc/"+ligaId+"/bracket");
    if (!resp.ok) throw new Error("HTTP "+resp.status);
    const data=await resp.json();
    const matches=Array.isArray(data.matches)?data.matches:[];
    if (matches.length===0) return "<p class=\"copa-empty\">Chaveamento ainda não disponível.</p>";
    const porFase={};
    matches.forEach(m=>{
        const fase=m.fase||"sem_fase";
        if (!porFase[fase]) porFase[fase]=[];
        porFase[fase].push(m);
    });
    const fasesPresentes=FASES_ORDEM.filter(f=>porFase[f]);
    const fasesExtras=Object.keys(porFase).filter(f=>!FASES_ORDEM.includes(f));
    const fasesRender=fasesPresentes.concat(fasesExtras);
    const fasesHtml=fasesRender.map(fase=>{
        const faseMatches=porFase[fase];
        const faseLabel=_esc(FASE_LABELS[fase]||fase);
        const matchesHtml=faseMatches.map(m=>{
            const mandanteVenceu=m.status==="finalizado"&&Number(m.vencedor_id)===Number(m.mandante_id);
            const visitanteVenceu=m.status==="finalizado"&&Number(m.vencedor_id)===Number(m.visitante_id);
            let ptsMandante="",ptsVisitante="";
            if (m.status==="finalizado"&&m.total!=null) {
                if (typeof m.total==="object") {
                    ptsMandante=m.total.mandante!=null?_esc(String(m.total.mandante)):"";
                    ptsVisitante=m.total.visitante!=null?_esc(String(m.total.visitante)):"";
                } else { ptsMandante=_esc(String(m.total)); }
            }
            return "<div class=\"copa-bracket-match\">"
                +"<div class=\"copa-bracket-time "+(mandanteVenceu?"vencedor":"")+"\">"
                +"<span>"+_esc(m.mandante_nome||"A definir")+"</span>"
                +"<span>"+ptsMandante+"</span></div>"
                +"<div class=\"copa-bracket-time "+(visitanteVenceu?"vencedor":"")+"\">"
                +"<span>"+_esc(m.visitante_nome||"A definir")+"</span>"
                +"<span>"+ptsVisitante+"</span></div></div>";
        }).join("");
        return "<div class=\"copa-bracket-fase\"><p class=\"copa-bracket-fase-nome\">"+faseLabel+"</p>"+matchesHtml+"</div>";
    }).join("");
    return "<div class=\"copa-bracket\">"+fasesHtml+"</div>";
}

async function _renderClassificatorio(ligaId,timeId) {
    const resp=await fetch("/api/copa-sc/"+ligaId+"/classificatorio");
    if (!resp.ok) throw new Error("HTTP "+resp.status);
    const data=await resp.json();
    const matches=Array.isArray(data.matches)?data.matches:[];
    const descricao="<p class=\"copa-classificatorio-desc\">A Fase Classificatória envolve os times em posições inferiores do Pontos Corridos. Os sobreviventes avançam para a Fase de Grupos.</p>";
    if (matches.length===0) {
        return "<div class=\"copa-classificatorio\">"+descricao+"<p class=\"copa-empty\">Nenhum confronto disponível.</p></div>";
    }
    const confrontosHtml=matches.map(m=>{
        const rodadas=Array.isArray(m.rodadas_cartola)?m.rodadas_cartola.join(", "):(m.rodadas_cartola||"");
        let ptsMandante="",ptsVisitante="";
        if (m.status==="finalizado"&&m.total!=null) {
            if (typeof m.total==="object") {
                ptsMandante=m.total.mandante!=null?_esc(String(m.total.mandante)):0;
                ptsVisitante=m.total.visitante!=null?_esc(String(m.total.visitante)):0;
            } else { ptsMandante=_esc(String(m.total)); }
        }
        const statusTexto=m.status==="finalizado"?"Finalizado":(m.status==="em_andamento"?"Em andamento":"Agendado");
        const statusClass="copa-status-"+(m.status||"agendado");
        const ptsMandanteHtml=ptsMandante!==""?"<div class=\"copa-pts\">"+ptsMandante+"</div>":"";
        const ptsVisitanteHtml=ptsVisitante!==""?"<div class=\"copa-pts\">"+ptsVisitante+"</div>":"";
        return "<div class=\"copa-confronto-card "+statusClass+"\""+">"
            +"<div class=\"copa-confronto-fase\">Classificatória"+(rodadas?" · Rods. "+_esc(String(rodadas)):"")+"</div>"
            +"<div class=\"copa-confronto-placar\">"
            +"<div style=\"text-align:center;\"><div class=\"copa-nome\">"+_esc(m.mandante_nome||"A definir")+"</div>"+ptsMandanteHtml+"</div>"
            +"<span class=\"copa-confronto-vs\">vs</span>"
            +"<div style=\"text-align:center;\"><div class=\"copa-nome\">"+_esc(m.visitante_nome||"A definir")+"</div>"+ptsVisitanteHtml+"</div>"
            +"</div>"
            +"<span class=\"copa-status-badge\">"+_esc(statusTexto)+"</span></div>";
    }).join("");
    return "<div class=\"copa-classificatorio\">"+descricao+confrontosHtml+"</div>";
}

export function getEstadoCopaSC() { return estadoCopaSC; }

if (window.Log) Log.info("PARTICIPANTE-COPA-SC", "Módulo v2.0 carregado!");
