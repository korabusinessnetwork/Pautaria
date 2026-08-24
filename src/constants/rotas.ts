/**
 * Rotas — um lugar só.
 *
 * Existe por causa de um problema concreto que surgiu ao acrescentar a landing.
 * Antes, `/` era o app: `Entrar` e `CriarConta` mandavam para lá depois do
 * login, e `NaoEncontrado` oferecia "voltar para as minhas pautas" apontando
 * para `/`. Com a landing pública ocupando `/`, esses mesmos redirecionamentos
 * passariam a devolver o usuário autenticado para a página de vendas — e, no
 * caso de `Entrar`, para um laço: entra, volta para a landing, clica em entrar,
 * é redirecionado de novo.
 *
 * Espalhar `'/app'` por sete arquivos consertaria hoje e quebraria de novo na
 * próxima vez que a raiz mudasse de dono. As constantes abaixo tornam a troca
 * uma edição de uma linha.
 */

/** Porta de entrada pública. Vende o produto; não exige sessão. */
export const ROTA_LANDING = '/';

/**
 * Entrada do aplicativo. Não renderiza tela: `Destino` decide para onde ir —
 * sem workspace vai para a abertura, com workspace vai para o quadro. É para
 * cá que todo fluxo autenticado aponta quando não tem um destino específico.
 */
export const ROTA_DO_APP = '/app';

export const ROTA_ABERTURA = '/comecar';
export const ROTA_ENTRAR = '/entrar';
export const ROTA_CRIAR_CONTA = '/criar-conta';
export const ROTA_RECUPERAR = '/recuperar-senha';
export const ROTA_NOVA_SENHA = '/nova-senha';
export const ROTA_PRECOS = '/precos';
export const ROTA_CONVITE = '/convite';
export const ROTA_TERMOS = '/termos';
export const ROTA_PRIVACIDADE = '/privacidade';

/** Rotas de dentro de um workspace, montadas a partir do slug. */
export const rotaWorkspace = {
  quadro: (slug: string) => `/w/${slug}`,
  plano: (slug: string) => `/w/${slug}/plano`,
  equipe: (slug: string) => `/w/${slug}/equipe`,
  configuracoes: (slug: string) => `/w/${slug}/configuracoes`,
  arquivadas: (slug: string) => `/w/${slug}/arquivadas`,
  atividade: (slug: string) => `/w/${slug}/atividade`,
} as const;
