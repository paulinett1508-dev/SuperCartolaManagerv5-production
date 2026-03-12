# GitHub Profile

Busca e exibe o perfil completo de um usuario do GitHub.

## Argumento recebido: `$ARGUMENTS`

## Instrucoes

1. **Interprete o argumento** `$ARGUMENTS` como o username do GitHub.
   - Se vazio, pergunte ao usuario qual username deseja consultar.

2. **Execute o script** `scripts/github-profile/fetch-profile.sh`:
   ```bash
   bash scripts/github-profile/fetch-profile.sh <username>
   ```

3. **Apresente o resultado** formatado em markdown para o usuario, incluindo:
   - Dados do perfil (nome, bio, empresa, localizacao)
   - Estatisticas (repos, followers, etc.)
   - Top repositorios recentes
   - Atividade publica recente

4. **Se o script falhar** (usuario inexistente, rate limit, etc.):
   - Mostre a mensagem de erro
   - Sugira verificar se o username esta correto
   - Se rate limit, sugira definir `GITHUB_TOKEN` como variavel de ambiente

## Regras
- NUNCA exponha tokens GitHub no output para o usuario
- Se o argumento contiver `@`, remova-o (ex: `@octocat` → `octocat`)
- Se o argumento contiver URL GitHub, extraia apenas o username
