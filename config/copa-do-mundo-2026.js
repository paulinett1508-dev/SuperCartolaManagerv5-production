// config/copa-do-mundo-2026.js
// v1.0 - Configuração completa da Copa do Mundo FIFA 2026
//
// USO: Importar no routes/jogos-ao-vivo-routes.js e participante-jogos.js
//      para filtrar, exibir e categorizar jogos da Copa do Mundo.
//
// DADOS: Baseados no sorteio oficial FIFA (5/dez/2025, Washington D.C.)
//        Alguns classificados via playoff (março 2026) marcados como TBD.
//
// NOTA: Torneio expandido para 48 seleções em 12 grupos (A-L).
//       Top 2 + 8 melhores terceiros avançam (32 na fase eliminatória).

// ════════════════════════════════════════════════════════════════
// PERÍODO DO TORNEIO
// ════════════════════════════════════════════════════════════════
const PERIODO = {
  inicio: '2026-06-11',        // Abertura: México vs África do Sul
  fimFaseGrupos: '2026-06-27', // Último jogo da fase de grupos
  inicioMataMata: '2026-06-28', // Round of 32
  final: '2026-07-19',         // Final: MetLife Stadium, NJ
  // Período "informativo" pré-torneio (exibir agenda estática)
  inicioPreTorneio: '2026-02-15',
};

// ════════════════════════════════════════════════════════════════
// IDs DE LIGA NAS APIs
// ════════════════════════════════════════════════════════════════
const LEAGUE_IDS = {
  apiFootball: 1,         // FIFA World Cup na API-Football v3
  soccerDataApi: null,    // Verificar quando disponível (free tier)
};

// ════════════════════════════════════════════════════════════════
// BANDEIRAS (Emoji flags - universal, sem CDN)
// ════════════════════════════════════════════════════════════════
const BANDEIRAS = {
  // Grupo A
  'Mexico': '🇲🇽', 'South Korea': '🇰🇷', 'South Africa': '🇿🇦',
  'México': '🇲🇽', 'Coreia do Sul': '🇰🇷', 'África do Sul': '🇿🇦',
  // Grupo B
  'Canada': '🇨🇦', 'Canadá': '🇨🇦', 'Switzerland': '🇨🇭', 'Suíça': '🇨🇭',
  'Qatar': '🇶🇦', 'Catar': '🇶🇦',
  // Grupo C (BRASIL)
  'Brazil': '🇧🇷', 'Brasil': '🇧🇷', 'Morocco': '🇲🇦', 'Marrocos': '🇲🇦',
  'Haiti': '🇭🇹', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Escócia': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  // Grupo D
  'United States': '🇺🇸', 'USA': '🇺🇸', 'Estados Unidos': '🇺🇸', 'EUA': '🇺🇸',
  'Paraguay': '🇵🇾', 'Paraguai': '🇵🇾', 'Australia': '🇦🇺', 'Austrália': '🇦🇺',
  // Grupo E
  'Germany': '🇩🇪', 'Alemanha': '🇩🇪', 'Ivory Coast': '🇨🇮', 'Costa do Marfim': '🇨🇮',
  'Ecuador': '🇪🇨', 'Equador': '🇪🇨', 'Curacao': '🇨🇼', 'Curaçao': '🇨🇼',
  // Grupo F
  'Netherlands': '🇳🇱', 'Holanda': '🇳🇱', 'Países Baixos': '🇳🇱',
  'Japan': '🇯🇵', 'Japão': '🇯🇵', 'Tunisia': '🇹🇳', 'Tunísia': '🇹🇳',
  // Grupo G
  'Belgium': '🇧🇪', 'Bélgica': '🇧🇪', 'Egypt': '🇪🇬', 'Egito': '🇪🇬',
  'Iran': '🇮🇷', 'Irã': '🇮🇷', 'New Zealand': '🇳🇿', 'Nova Zelândia': '🇳🇿',
  // Grupo H
  'Spain': '🇪🇸', 'Espanha': '🇪🇸', 'Uruguay': '🇺🇾', 'Uruguai': '🇺🇾',
  'Saudi Arabia': '🇸🇦', 'Arábia Saudita': '🇸🇦', 'Cape Verde': '🇨🇻', 'Cabo Verde': '🇨🇻',
  // Grupo I
  'France': '🇫🇷', 'França': '🇫🇷', 'Senegal': '🇸🇳',
  'Norway': '🇳🇴', 'Noruega': '🇳🇴',
  // Grupo J
  'Argentina': '🇦🇷', 'Algeria': '🇩🇿', 'Argélia': '🇩🇿',
  'Austria': '🇦🇹', 'Áustria': '🇦🇹', 'Jordan': '🇯🇴', 'Jordânia': '🇯🇴',
  // Grupo K
  'Portugal': '🇵🇹', 'Colombia': '🇨🇴', 'Colômbia': '🇨🇴',
  'Uzbekistan': '🇺🇿', 'Uzbequistão': '🇺🇿',
  // Grupo L
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Inglaterra': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'Croatia': '🇭🇷', 'Croácia': '🇭🇷',
  'Ghana': '🇬🇭', 'Gana': '🇬🇭', 'Panama': '🇵🇦', 'Panamá': '🇵🇦',
  // Playoffs (TBD março 2026) - principais candidatos
  'Italy': '🇮🇹', 'Itália': '🇮🇹', 'Ukraine': '🇺🇦', 'Ucrânia': '🇺🇦',
  'Turkey': '🇹🇷', 'Turquia': '🇹🇷', 'Denmark': '🇩🇰', 'Dinamarca': '🇩🇰',
  'Poland': '🇵🇱', 'Polônia': '🇵🇱', 'Sweden': '🇸🇪', 'Suécia': '🇸🇪',
  'Wales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'País de Gales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
  'Romania': '🇷🇴', 'Romênia': '🇷🇴', 'Czech Republic': '🇨🇿', 'República Tcheca': '🇨🇿',
  'DR Congo': '🇨🇩', 'RD Congo': '🇨🇩', 'Jamaica': '🇯🇲',
  'Bolivia': '🇧🇴', 'Bolívia': '🇧🇴', 'Iraq': '🇮🇶', 'Iraque': '🇮🇶',
  // Fallback
  'TBD': '🏳️',
};

// ════════════════════════════════════════════════════════════════
// NOMES DE SELEÇÕES (API → Português)
// ════════════════════════════════════════════════════════════════
const NOMES_PT = {
  'Mexico': 'México', 'South Korea': 'Coreia do Sul', 'South Africa': 'África do Sul',
  'Canada': 'Canadá', 'Switzerland': 'Suíça', 'Qatar': 'Catar',
  'Brazil': 'Brasil', 'Morocco': 'Marrocos', 'Scotland': 'Escócia',
  'United States': 'Estados Unidos', 'USA': 'Estados Unidos',
  'Paraguay': 'Paraguai', 'Australia': 'Austrália',
  'Germany': 'Alemanha', 'Ivory Coast': 'Costa do Marfim',
  'Ecuador': 'Equador', 'Curacao': 'Curaçao',
  'Netherlands': 'Holanda', 'Japan': 'Japão', 'Tunisia': 'Tunísia',
  'Belgium': 'Bélgica', 'Egypt': 'Egito', 'Iran': 'Irã', 'New Zealand': 'Nova Zelândia',
  'Spain': 'Espanha', 'Uruguay': 'Uruguai',
  'Saudi Arabia': 'Arábia Saudita', 'Cape Verde': 'Cabo Verde',
  'France': 'França', 'Senegal': 'Senegal', 'Norway': 'Noruega',
  'Argentina': 'Argentina', 'Algeria': 'Argélia',
  'Austria': 'Áustria', 'Jordan': 'Jordânia',
  'Portugal': 'Portugal', 'Colombia': 'Colômbia', 'Uzbekistan': 'Uzbequistão',
  'England': 'Inglaterra', 'Croatia': 'Croácia', 'Ghana': 'Gana', 'Panama': 'Panamá',
  'Haiti': 'Haiti',
};

// ════════════════════════════════════════════════════════════════
// GRUPOS (Sorteio 5/dez/2025)
// ════════════════════════════════════════════════════════════════
const GRUPOS = {
  A: ['México', 'Coreia do Sul', 'África do Sul', 'TBD UEFA-D'],
  B: ['Canadá', 'Suíça', 'Catar', 'TBD UEFA-A'],
  C: ['Brasil', 'Marrocos', 'Haiti', 'Escócia'],
  D: ['Estados Unidos', 'Paraguai', 'Austrália', 'TBD UEFA-C'],
  E: ['Alemanha', 'Costa do Marfim', 'Equador', 'Curaçao'],
  F: ['Holanda', 'Japão', 'Tunísia', 'TBD UEFA-B'],
  G: ['Bélgica', 'Egito', 'Irã', 'Nova Zelândia'],
  H: ['Espanha', 'Uruguai', 'Arábia Saudita', 'Cabo Verde'],
  I: ['França', 'Senegal', 'Noruega', 'TBD IC-2'],
  J: ['Argentina', 'Argélia', 'Áustria', 'Jordânia'],
  K: ['Portugal', 'Colômbia', 'Uzbequistão', 'TBD IC-1'],
  L: ['Inglaterra', 'Croácia', 'Gana', 'Panamá'],
};

// ════════════════════════════════════════════════════════════════
// SEDES E ESTÁDIOS
// ════════════════════════════════════════════════════════════════
const ESTADIOS = {
  'MetLife Stadium': {
    cidade: 'Nova York/Nova Jersey', pais: 'EUA', capacidade: 82500,
    foto: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Metlife_stadium_%28Aerial_view%29.jpg/640px-Metlife_stadium_%28Aerial_view%29.jpg'
  },
  'SoFi Stadium': {
    cidade: 'Los Angeles', pais: 'EUA', capacidade: 70000,
    foto: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/SoFi_Stadium_exterior_2.jpg/640px-SoFi_Stadium_exterior_2.jpg'
  },
  'AT&T Stadium': {
    cidade: 'Dallas', pais: 'EUA', capacidade: 94000,
    foto: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Cowboys_Stadium_full_view.jpg/640px-Cowboys_Stadium_full_view.jpg'
  },
  'Hard Rock Stadium': {
    cidade: 'Miami', pais: 'EUA', capacidade: 65000,
    foto: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Hard_Rock_Stadium_aerial_2023.jpg/640px-Hard_Rock_Stadium_aerial_2023.jpg'
  },
  'Mercedes-Benz Stadium': {
    cidade: 'Atlanta', pais: 'EUA', capacidade: 75000,
    foto: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Mercedes-Benz_Stadium%2C_October_2017.jpg/640px-Mercedes-Benz_Stadium%2C_October_2017.jpg'
  },
  'NRG Stadium': {
    cidade: 'Houston', pais: 'EUA', capacidade: 72000,
    foto: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/NRG_Stadium_-_Houston%2C_Texas.jpg/640px-NRG_Stadium_-_Houston%2C_Texas.jpg'
  },
  'Lumen Field': {
    cidade: 'Seattle', pais: 'EUA', capacidade: 69000,
    foto: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/CenturyLink_Field_-_MLS_Cup_2016.jpg/640px-CenturyLink_Field_-_MLS_Cup_2016.jpg'
  },
  'Lincoln Financial Field': {
    cidade: 'Filadélfia', pais: 'EUA', capacidade: 69000,
    foto: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Lincoln_Financial_Field_%28Aerial_view%29.jpg/640px-Lincoln_Financial_Field_%28Aerial_view%29.jpg'
  },
  'Arrowhead Stadium': {
    cidade: 'Kansas City', pais: 'EUA', capacidade: 73000,
    foto: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Arrowhead_Stadium_%2814586858494%29.jpg/640px-Arrowhead_Stadium_%2814586858494%29.jpg'
  },
  'Gillette Stadium': {
    cidade: 'Boston', pais: 'EUA', capacidade: 65000,
    foto: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Gillette_Stadium_%28Top_View%29.jpg/640px-Gillette_Stadium_%28Top_View%29.jpg'
  },
  "Levi's Stadium": {
    cidade: 'São Francisco', pais: 'EUA', capacidade: 71000,
    foto: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Levi%27s_Stadium_aerial.jpg/640px-Levi%27s_Stadium_aerial.jpg'
  },
  'Estadio Azteca': {
    cidade: 'Cidade do México', pais: 'MEX', capacidade: 83000,
    foto: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Azteca_Entrance.jpg/640px-Azteca_Entrance.jpg'
  },
  'Estadio BBVA': {
    cidade: 'Monterrey', pais: 'MEX', capacidade: 53500,
    foto: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/EstadioRayados.JPG/640px-EstadioRayados.JPG'
  },
  'Estadio Akron': {
    cidade: 'Guadalajara', pais: 'MEX', capacidade: 48000,
    foto: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Estadio_Chivas.jpg/640px-Estadio_Chivas.jpg'
  },
  'BC Place': {
    cidade: 'Vancouver', pais: 'CAN', capacidade: 54000,
    foto: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Interior_BC_Place_2015.jpg/640px-Interior_BC_Place_2015.jpg'
  },
  'BMO Field': {
    cidade: 'Toronto', pais: 'CAN', capacidade: 45000,
    foto: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/BMO_Field_2016_East_Stand.jpg/640px-BMO_Field_2016_East_Stand.jpg'
  },
};

// ════════════════════════════════════════════════════════════════
// CALENDÁRIO COMPLETO DA FASE DE GRUPOS
// ════════════════════════════════════════════════════════════════
const JOGOS_FASE_GRUPOS = [
  // ── GRUPO A ──
  { id: 'wc-a1', grupo: 'A', rodada: 1, data: '2026-06-11', horario: '13:00', mandante: 'México', visitante: 'África do Sul', estadio: 'Estadio Azteca', horarioBR: '14:00' },
  { id: 'wc-a2', grupo: 'A', rodada: 1, data: '2026-06-11', horario: '16:00', mandante: 'Coreia do Sul', visitante: 'TBD UEFA-D', estadio: 'Estadio Akron', horarioBR: '17:00' },
  { id: 'wc-a3', grupo: 'A', rodada: 2, data: '2026-06-18', horario: '13:00', mandante: 'México', visitante: 'Coreia do Sul', estadio: 'Estadio Akron', horarioBR: '14:00' },
  { id: 'wc-a4', grupo: 'A', rodada: 2, data: '2026-06-18', horario: '16:00', mandante: 'TBD UEFA-D', visitante: 'África do Sul', estadio: 'Mercedes-Benz Stadium', horarioBR: '17:00' },
  { id: 'wc-a5', grupo: 'A', rodada: 3, data: '2026-06-24', horario: '16:00', mandante: 'TBD UEFA-D', visitante: 'México', estadio: 'Estadio Azteca', horarioBR: '17:00' },
  { id: 'wc-a6', grupo: 'A', rodada: 3, data: '2026-06-24', horario: '16:00', mandante: 'África do Sul', visitante: 'Coreia do Sul', estadio: 'Estadio BBVA', horarioBR: '17:00' },

  // ── GRUPO B ──
  { id: 'wc-b1', grupo: 'B', rodada: 1, data: '2026-06-12', horario: '17:00', mandante: 'Canadá', visitante: 'TBD UEFA-A', estadio: 'BMO Field', horarioBR: '18:00' },
  { id: 'wc-b2', grupo: 'B', rodada: 1, data: '2026-06-13', horario: '13:00', mandante: 'Catar', visitante: 'Suíça', estadio: "Levi's Stadium", horarioBR: '17:00' },
  { id: 'wc-b3', grupo: 'B', rodada: 2, data: '2026-06-18', horario: '19:00', mandante: 'Suíça', visitante: 'TBD UEFA-A', estadio: 'SoFi Stadium', horarioBR: '23:00' },
  { id: 'wc-b4', grupo: 'B', rodada: 2, data: '2026-06-18', horario: '19:00', mandante: 'Canadá', visitante: 'Catar', estadio: 'BC Place', horarioBR: '23:00' },
  { id: 'wc-b5', grupo: 'B', rodada: 3, data: '2026-06-24', horario: '19:00', mandante: 'Suíça', visitante: 'Canadá', estadio: 'BC Place', horarioBR: '23:00' },
  { id: 'wc-b6', grupo: 'B', rodada: 3, data: '2026-06-24', horario: '19:00', mandante: 'Catar', visitante: 'TBD UEFA-A', estadio: 'BMO Field', horarioBR: '23:00' },

  // ── GRUPO C (BRASIL) ──
  { id: 'wc-c1', grupo: 'C', rodada: 1, data: '2026-06-13', horario: '18:00', mandante: 'Brasil', visitante: 'Marrocos', estadio: 'MetLife Stadium', horarioBR: '19:00' },
  { id: 'wc-c2', grupo: 'C', rodada: 1, data: '2026-06-13', horario: '15:00', mandante: 'Haiti', visitante: 'Escócia', estadio: 'Gillette Stadium', horarioBR: '16:00' },
  { id: 'wc-c3', grupo: 'C', rodada: 2, data: '2026-06-19', horario: '15:00', mandante: 'Escócia', visitante: 'Marrocos', estadio: 'Gillette Stadium', horarioBR: '16:00' },
  { id: 'wc-c4', grupo: 'C', rodada: 2, data: '2026-06-19', horario: '21:00', mandante: 'Brasil', visitante: 'Haiti', estadio: 'Lincoln Financial Field', horarioBR: '22:00' },
  { id: 'wc-c5', grupo: 'C', rodada: 3, data: '2026-06-24', horario: '18:00', mandante: 'Escócia', visitante: 'Brasil', estadio: 'Hard Rock Stadium', horarioBR: '19:00' },
  { id: 'wc-c6', grupo: 'C', rodada: 3, data: '2026-06-24', horario: '18:00', mandante: 'Marrocos', visitante: 'Haiti', estadio: 'Mercedes-Benz Stadium', horarioBR: '19:00' },

  // ── GRUPO D ──
  { id: 'wc-d1', grupo: 'D', rodada: 1, data: '2026-06-12', horario: '21:00', mandante: 'Estados Unidos', visitante: 'Paraguai', estadio: 'SoFi Stadium', horarioBR: '01:00' },
  { id: 'wc-d2', grupo: 'D', rodada: 1, data: '2026-06-13', horario: '19:00', mandante: 'Austrália', visitante: 'TBD UEFA-C', estadio: 'BC Place', horarioBR: '23:00' },
  { id: 'wc-d3', grupo: 'D', rodada: 2, data: '2026-06-19', horario: '19:00', mandante: 'Estados Unidos', visitante: 'Austrália', estadio: 'Lumen Field', horarioBR: '23:00' },
  { id: 'wc-d4', grupo: 'D', rodada: 2, data: '2026-06-19', horario: '13:00', mandante: 'TBD UEFA-C', visitante: 'Paraguai', estadio: "Levi's Stadium", horarioBR: '17:00' },
  { id: 'wc-d5', grupo: 'D', rodada: 3, data: '2026-06-25', horario: '21:00', mandante: 'TBD UEFA-C', visitante: 'Estados Unidos', estadio: 'SoFi Stadium', horarioBR: '01:00' },
  { id: 'wc-d6', grupo: 'D', rodada: 3, data: '2026-06-25', horario: '13:00', mandante: 'Paraguai', visitante: 'Austrália', estadio: "Levi's Stadium", horarioBR: '17:00' },

  // ── GRUPO E ──
  { id: 'wc-e1', grupo: 'E', rodada: 1, data: '2026-06-14', horario: '13:00', mandante: 'Alemanha', visitante: 'Curaçao', estadio: 'NRG Stadium', horarioBR: '15:00' },
  { id: 'wc-e2', grupo: 'E', rodada: 1, data: '2026-06-14', horario: '15:00', mandante: 'Costa do Marfim', visitante: 'Equador', estadio: 'Lincoln Financial Field', horarioBR: '16:00' },
  { id: 'wc-e3', grupo: 'E', rodada: 2, data: '2026-06-20', horario: '17:00', mandante: 'Alemanha', visitante: 'Costa do Marfim', estadio: 'BMO Field', horarioBR: '18:00' },
  { id: 'wc-e4', grupo: 'E', rodada: 2, data: '2026-06-20', horario: '13:00', mandante: 'Equador', visitante: 'Curaçao', estadio: 'Arrowhead Stadium', horarioBR: '15:00' },
  { id: 'wc-e5', grupo: 'E', rodada: 3, data: '2026-06-25', horario: '16:00', mandante: 'Equador', visitante: 'Alemanha', estadio: 'MetLife Stadium', horarioBR: '17:00' },
  { id: 'wc-e6', grupo: 'E', rodada: 3, data: '2026-06-25', horario: '16:00', mandante: 'Curaçao', visitante: 'Costa do Marfim', estadio: 'Lincoln Financial Field', horarioBR: '17:00' },

  // ── GRUPO F ──
  { id: 'wc-f1', grupo: 'F', rodada: 1, data: '2026-06-14', horario: '19:00', mandante: 'Holanda', visitante: 'Japão', estadio: 'AT&T Stadium', horarioBR: '21:00' },
  { id: 'wc-f2', grupo: 'F', rodada: 1, data: '2026-06-14', horario: '21:00', mandante: 'TBD UEFA-B', visitante: 'Tunísia', estadio: 'NRG Stadium', horarioBR: '23:00' },
  { id: 'wc-f3', grupo: 'F', rodada: 2, data: '2026-06-20', horario: '19:00', mandante: 'Holanda', visitante: 'TBD UEFA-B', estadio: 'NRG Stadium', horarioBR: '21:00' },
  { id: 'wc-f4', grupo: 'F', rodada: 2, data: '2026-06-20', horario: '15:00', mandante: 'Tunísia', visitante: 'Japão', estadio: 'AT&T Stadium', horarioBR: '17:00' },
  { id: 'wc-f5', grupo: 'F', rodada: 3, data: '2026-06-25', horario: '19:00', mandante: 'Tunísia', visitante: 'Holanda', estadio: 'Arrowhead Stadium', horarioBR: '21:00' },
  { id: 'wc-f6', grupo: 'F', rodada: 3, data: '2026-06-25', horario: '19:00', mandante: 'Japão', visitante: 'TBD UEFA-B', estadio: 'AT&T Stadium', horarioBR: '21:00' },

  // ── GRUPO G ──
  { id: 'wc-g1', grupo: 'G', rodada: 1, data: '2026-06-15', horario: '13:00', mandante: 'Bélgica', visitante: 'Egito', estadio: 'Lumen Field', horarioBR: '17:00' },
  { id: 'wc-g2', grupo: 'G', rodada: 1, data: '2026-06-15', horario: '16:00', mandante: 'Irã', visitante: 'Nova Zelândia', estadio: 'SoFi Stadium', horarioBR: '20:00' },
  { id: 'wc-g3', grupo: 'G', rodada: 2, data: '2026-06-21', horario: '16:00', mandante: 'Bélgica', visitante: 'Irã', estadio: 'SoFi Stadium', horarioBR: '20:00' },
  { id: 'wc-g4', grupo: 'G', rodada: 2, data: '2026-06-21', horario: '13:00', mandante: 'Nova Zelândia', visitante: 'Egito', estadio: 'Lumen Field', horarioBR: '17:00' },
  { id: 'wc-g5', grupo: 'G', rodada: 3, data: '2026-06-26', horario: '16:00', mandante: 'Nova Zelândia', visitante: 'Bélgica', estadio: 'Lumen Field', horarioBR: '20:00' },
  { id: 'wc-g6', grupo: 'G', rodada: 3, data: '2026-06-26', horario: '16:00', mandante: 'Egito', visitante: 'Irã', estadio: 'SoFi Stadium', horarioBR: '20:00' },

  // ── GRUPO H ──
  { id: 'wc-h1', grupo: 'H', rodada: 1, data: '2026-06-15', horario: '18:00', mandante: 'Espanha', visitante: 'Cabo Verde', estadio: 'Mercedes-Benz Stadium', horarioBR: '19:00' },
  { id: 'wc-h2', grupo: 'H', rodada: 1, data: '2026-06-15', horario: '21:00', mandante: 'Arábia Saudita', visitante: 'Uruguai', estadio: 'Hard Rock Stadium', horarioBR: '22:00' },
  { id: 'wc-h3', grupo: 'H', rodada: 2, data: '2026-06-21', horario: '18:00', mandante: 'Espanha', visitante: 'Arábia Saudita', estadio: 'Mercedes-Benz Stadium', horarioBR: '19:00' },
  { id: 'wc-h4', grupo: 'H', rodada: 2, data: '2026-06-21', horario: '21:00', mandante: 'Uruguai', visitante: 'Cabo Verde', estadio: 'Hard Rock Stadium', horarioBR: '22:00' },
  { id: 'wc-h5', grupo: 'H', rodada: 3, data: '2026-06-26', horario: '13:00', mandante: 'Uruguai', visitante: 'Espanha', estadio: 'Estadio Akron', horarioBR: '15:00' },
  { id: 'wc-h6', grupo: 'H', rodada: 3, data: '2026-06-26', horario: '13:00', mandante: 'Cabo Verde', visitante: 'Arábia Saudita', estadio: 'NRG Stadium', horarioBR: '15:00' },

  // ── GRUPO I ──
  { id: 'wc-i1', grupo: 'I', rodada: 1, data: '2026-06-16', horario: '18:00', mandante: 'França', visitante: 'Senegal', estadio: 'MetLife Stadium', horarioBR: '19:00' },
  { id: 'wc-i2', grupo: 'I', rodada: 1, data: '2026-06-16', horario: '15:00', mandante: 'TBD IC-2', visitante: 'Noruega', estadio: 'Gillette Stadium', horarioBR: '16:00' },
  { id: 'wc-i3', grupo: 'I', rodada: 2, data: '2026-06-22', horario: '15:00', mandante: 'França', visitante: 'TBD IC-2', estadio: 'Lincoln Financial Field', horarioBR: '16:00' },
  { id: 'wc-i4', grupo: 'I', rodada: 2, data: '2026-06-22', horario: '18:00', mandante: 'Noruega', visitante: 'Senegal', estadio: 'MetLife Stadium', horarioBR: '19:00' },
  { id: 'wc-i5', grupo: 'I', rodada: 3, data: '2026-06-26', horario: '18:00', mandante: 'Noruega', visitante: 'França', estadio: 'Gillette Stadium', horarioBR: '19:00' },
  { id: 'wc-i6', grupo: 'I', rodada: 3, data: '2026-06-26', horario: '18:00', mandante: 'Senegal', visitante: 'TBD IC-2', estadio: 'BMO Field', horarioBR: '19:00' },

  // ── GRUPO J ──
  { id: 'wc-j1', grupo: 'J', rodada: 1, data: '2026-06-16', horario: '13:00', mandante: 'Argentina', visitante: 'Argélia', estadio: 'Arrowhead Stadium', horarioBR: '15:00' },
  { id: 'wc-j2', grupo: 'J', rodada: 1, data: '2026-06-16', horario: '13:00', mandante: 'Áustria', visitante: 'Jordânia', estadio: "Levi's Stadium", horarioBR: '17:00' },
  { id: 'wc-j3', grupo: 'J', rodada: 2, data: '2026-06-22', horario: '21:00', mandante: 'Argentina', visitante: 'Áustria', estadio: 'AT&T Stadium', horarioBR: '22:00' },
  { id: 'wc-j4', grupo: 'J', rodada: 2, data: '2026-06-22', horario: '13:00', mandante: 'Jordânia', visitante: 'Argélia', estadio: "Levi's Stadium", horarioBR: '17:00' },
  { id: 'wc-j5', grupo: 'J', rodada: 3, data: '2026-06-27', horario: '21:00', mandante: 'Jordânia', visitante: 'Argentina', estadio: 'AT&T Stadium', horarioBR: '22:00' },
  { id: 'wc-j6', grupo: 'J', rodada: 3, data: '2026-06-27', horario: '13:00', mandante: 'Argélia', visitante: 'Áustria', estadio: 'Arrowhead Stadium', horarioBR: '15:00' },

  // ── GRUPO K ──
  { id: 'wc-k1', grupo: 'K', rodada: 1, data: '2026-06-17', horario: '13:00', mandante: 'Portugal', visitante: 'TBD IC-1', estadio: 'NRG Stadium', horarioBR: '15:00' },
  { id: 'wc-k2', grupo: 'K', rodada: 1, data: '2026-06-17', horario: '13:00', mandante: 'Uzbequistão', visitante: 'Colômbia', estadio: 'Estadio Azteca', horarioBR: '15:00' },
  { id: 'wc-k3', grupo: 'K', rodada: 2, data: '2026-06-23', horario: '13:00', mandante: 'Portugal', visitante: 'Uzbequistão', estadio: 'NRG Stadium', horarioBR: '15:00' },
  { id: 'wc-k4', grupo: 'K', rodada: 2, data: '2026-06-23', horario: '16:00', mandante: 'Colômbia', visitante: 'TBD IC-1', estadio: 'Estadio Akron', horarioBR: '18:00' },
  { id: 'wc-k5', grupo: 'K', rodada: 3, data: '2026-06-27', horario: '18:00', mandante: 'Colômbia', visitante: 'Portugal', estadio: 'Hard Rock Stadium', horarioBR: '19:00' },
  { id: 'wc-k6', grupo: 'K', rodada: 3, data: '2026-06-27', horario: '18:00', mandante: 'TBD IC-1', visitante: 'Uzbequistão', estadio: 'Mercedes-Benz Stadium', horarioBR: '19:00' },

  // ── GRUPO L ──
  { id: 'wc-l1', grupo: 'L', rodada: 1, data: '2026-06-17', horario: '19:00', mandante: 'Inglaterra', visitante: 'Croácia', estadio: 'AT&T Stadium', horarioBR: '21:00' },
  { id: 'wc-l2', grupo: 'L', rodada: 1, data: '2026-06-17', horario: '17:00', mandante: 'Gana', visitante: 'Panamá', estadio: 'BMO Field', horarioBR: '18:00' },
  { id: 'wc-l3', grupo: 'L', rodada: 2, data: '2026-06-23', horario: '19:00', mandante: 'Inglaterra', visitante: 'Gana', estadio: 'Gillette Stadium', horarioBR: '20:00' },
  { id: 'wc-l4', grupo: 'L', rodada: 2, data: '2026-06-23', horario: '17:00', mandante: 'Panamá', visitante: 'Croácia', estadio: 'BMO Field', horarioBR: '18:00' },
  { id: 'wc-l5', grupo: 'L', rodada: 3, data: '2026-06-27', horario: '16:00', mandante: 'Panamá', visitante: 'Inglaterra', estadio: 'MetLife Stadium', horarioBR: '17:00' },
  { id: 'wc-l6', grupo: 'L', rodada: 3, data: '2026-06-27', horario: '16:00', mandante: 'Croácia', visitante: 'Gana', estadio: 'Lincoln Financial Field', horarioBR: '17:00' },
];

// ════════════════════════════════════════════════════════════════
// FASE ELIMINATÓRIA (datas fixas, confrontos definidos em jogo)
// ════════════════════════════════════════════════════════════════
const FASE_ELIMINATORIA = {
  'Round of 32': { inicio: '2026-06-28', fim: '2026-07-03', jogos: 16 },
  'Oitavas': { inicio: '2026-07-04', fim: '2026-07-07', jogos: 8 },
  'Quartas': { inicio: '2026-07-09', fim: '2026-07-11', jogos: 4 },
  'Semifinais': { inicio: '2026-07-14', fim: '2026-07-15', jogos: 2 },
  'Terceiro Lugar': { data: '2026-07-18', estadio: 'Hard Rock Stadium', jogos: 1 },
  'Final': { data: '2026-07-19', estadio: 'MetLife Stadium', jogos: 1 },
};

// ════════════════════════════════════════════════════════════════
// NOMES DE COMPETIÇÃO NAS APIs → NOME PADRÃO
// ════════════════════════════════════════════════════════════════
const NOMES_COPA_APIS = [
  'FIFA World Cup',
  'World Cup',
  'Copa do Mundo',
  'Copa do Mundo FIFA',
  'FIFA World Cup 2026',
  'WC Qualification',  // Não incluir - são eliminatórias
];

// Nomes que indicam jogo de Copa do Mundo (para filtro)
const COPA_LIGA_PATTERNS = [
  /world\s*cup/i,
  /copa\s*do\s*mundo/i,
  /fifa\s*world/i,
  /coupe\s*du\s*monde/i,
];

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════

/**
 * Verifica se a Copa está no período ativo (pré-torneio ou torneio)
 * @param {string} [dataRef] - Data de referência (YYYY-MM-DD). Default: hoje SP timezone
 * @returns {{ ativo: boolean, fase: string }}
 */
function getStatusCopa(dataRef) {
  const hoje = dataRef || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  if (hoje < PERIODO.inicioPreTorneio) {
    return { ativo: false, fase: 'inativo' };
  }
  if (hoje < PERIODO.inicio) {
    return { ativo: true, fase: 'pre-torneio' };
  }
  if (hoje <= PERIODO.fimFaseGrupos) {
    return { ativo: true, fase: 'fase-grupos' };
  }
  if (hoje <= PERIODO.final) {
    return { ativo: true, fase: 'mata-mata' };
  }
  return { ativo: false, fase: 'encerrado' };
}

/**
 * Retorna bandeira emoji de uma seleção
 * @param {string} nome - Nome da seleção (PT ou EN)
 * @returns {string} Emoji flag ou '🏳️' se não encontrado
 */
function getBandeira(nome) {
  if (!nome) return '🏳️';
  return BANDEIRAS[nome] || BANDEIRAS[nome.trim()] || '🏳️';
}

/**
 * Traduz nome de seleção para português
 * @param {string} nomeEN - Nome em inglês
 * @returns {string} Nome em português ou original
 */
function traduzirNome(nomeEN) {
  if (!nomeEN) return nomeEN;
  return NOMES_PT[nomeEN] || nomeEN;
}

/**
 * Verifica se nome de liga corresponde a Copa do Mundo
 * @param {string} nomeLiga - Nome da liga/competição
 * @returns {boolean}
 */
function isCopaDoMundo(nomeLiga) {
  if (!nomeLiga) return false;
  return COPA_LIGA_PATTERNS.some(pattern => pattern.test(nomeLiga));
}

/**
 * Retorna jogos do dia da Copa (dados estáticos)
 * @param {string} data - Data YYYY-MM-DD
 * @returns {Array} Jogos formatados no padrão do sistema
 */
function getJogosDoDia(data) {
  return JOGOS_FASE_GRUPOS
    .filter(j => j.data === data)
    .map(j => ({
      id: j.id,
      mandante: j.mandante,
      visitante: j.visitante,
      logoMandante: null,
      logoVisitante: null,
      bandeirasMandante: getBandeira(j.mandante),
      bandeirasVisitante: getBandeira(j.visitante),
      golsMandante: 0,
      golsVisitante: 0,
      placar: 'vs',
      placarHT: null,
      tempo: '',
      tempoExtra: null,
      status: 'Agendado',
      statusRaw: 'NS',
      liga: `Copa do Mundo - Grupo ${j.grupo}`,
      ligaId: LEAGUE_IDS.apiFootball,
      ligaOriginal: 'FIFA World Cup 2026',
      ligaLogo: null,
      estadio: j.estadio,
      cidade: ESTADIOS[j.estadio]?.cidade || null,
      horario: j.horarioBR,
      timestamp: new Date(`${j.data}T${j.horario}:00-05:00`).getTime(),
      fonte: 'copa-static',
      grupo: j.grupo,
      rodada: j.rodada,
      isCopa: true,
    }));
}

/**
 * Retorna próximos jogos da Copa (a partir de hoje)
 * @param {number} [limite=10] - Máximo de jogos a retornar
 * @returns {Array} Jogos formatados
 */
function getProximosJogos(limite = 10) {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  return JOGOS_FASE_GRUPOS
    .filter(j => j.data >= hoje)
    .sort((a, b) => {
      if (a.data !== b.data) return a.data.localeCompare(b.data);
      return a.horario.localeCompare(b.horario);
    })
    .slice(0, limite)
    .map(j => ({
      id: j.id,
      mandante: j.mandante,
      visitante: j.visitante,
      bandeirasMandante: getBandeira(j.mandante),
      bandeirasVisitante: getBandeira(j.visitante),
      golsMandante: 0,
      golsVisitante: 0,
      placar: 'vs',
      status: 'Agendado',
      statusRaw: 'NS',
      liga: `Copa do Mundo - Grupo ${j.grupo}`,
      estadio: j.estadio,
      cidade: ESTADIOS[j.estadio]?.cidade || null,
      horario: j.horarioBR,
      data: j.data,
      timestamp: new Date(`${j.data}T${j.horario}:00-05:00`).getTime(),
      fonte: 'copa-static',
      grupo: j.grupo,
      rodada: j.rodada,
      isCopa: true,
    }));
}

/**
 * Retorna jogos do Brasil na Copa
 * @returns {Array} Jogos do Brasil formatados
 */
function getJogosBrasil() {
  return JOGOS_FASE_GRUPOS
    .filter(j => j.mandante === 'Brasil' || j.visitante === 'Brasil')
    .map(j => ({
      id: j.id,
      mandante: j.mandante,
      visitante: j.visitante,
      bandeirasMandante: getBandeira(j.mandante),
      bandeirasVisitante: getBandeira(j.visitante),
      golsMandante: 0,
      golsVisitante: 0,
      placar: 'vs',
      status: 'Agendado',
      statusRaw: 'NS',
      liga: `Copa do Mundo - Grupo ${j.grupo}`,
      estadio: j.estadio,
      cidade: ESTADIOS[j.estadio]?.cidade || null,
      horario: j.horarioBR,
      data: j.data,
      timestamp: new Date(`${j.data}T${j.horario}:00-05:00`).getTime(),
      fonte: 'copa-static',
      grupo: j.grupo,
      rodada: j.rodada,
      isCopa: true,
    }));
}

// ════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════
export default {
  PERIODO,
  LEAGUE_IDS,
  BANDEIRAS,
  NOMES_PT,
  GRUPOS,
  ESTADIOS,
  JOGOS_FASE_GRUPOS,
  FASE_ELIMINATORIA,
  COPA_LIGA_PATTERNS,
  getStatusCopa,
  getBandeira,
  traduzirNome,
  isCopaDoMundo,
  getJogosDoDia,
  getProximosJogos,
  getJogosBrasil,
};

export {
  PERIODO,
  LEAGUE_IDS,
  BANDEIRAS,
  NOMES_PT,
  GRUPOS,
  ESTADIOS,
  JOGOS_FASE_GRUPOS,
  FASE_ELIMINATORIA,
  COPA_LIGA_PATTERNS,
  getStatusCopa,
  getBandeira,
  traduzirNome,
  isCopaDoMundo,
  getJogosDoDia,
  getProximosJogos,
  getJogosBrasil,
};
