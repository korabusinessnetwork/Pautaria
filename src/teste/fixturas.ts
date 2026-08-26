/**
 * Fixturas dos testes de componente.
 *
 * Espelham a forma que a camada de serviços entrega, já em camelCase, depois
 * do `transform` do Zod. Testar com o formato do banco (snake_case) passaria
 * verde enquanto o app real quebra, porque nenhum componente vê aquele formato.
 *
 * Os valores vêm dos ofícios do sistema (`supabase/seeds/0001_oficios.sql`) para
 * que um teste que quebra aponte para um dado plausível, e não para um
 * "Lorem ipsum" que ninguém reconhece.
 */

import type { Membro, Oficio, Pauta } from '@/lib/tipos';

export function oficioMarketing(sobrescrever: Partial<Oficio> = {}): Oficio {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workspaceId: null,
    doSistema: true,
    chave: 'mkt',
    nome: 'Marketing',
    descricao: 'Da ideia ao publicado, cada canal no seu ritmo.',
    glifo: '▲',
    hue: 45,
    chroma: 0.16,
    tituloQuadro: 'Pauta de conteúdo',
    campo1Label: 'Canal',
    campo2Label: 'Campanha',
    mono: false,
    solo: false,
    ordem: 1,
    etapas: [
      { id: 'e1', nome: 'Ideias', ordem: 0 },
      { id: 'e2', nome: 'Roteiro', ordem: 1 },
      { id: 'e3', nome: 'Publicado', ordem: 2 },
    ],
    templates: [],
    ...sobrescrever,
  };
}

/** Ofício de TI: chips monoespaçados. */
export function oficioTi(sobrescrever: Partial<Oficio> = {}): Oficio {
  return oficioMarketing({
    id: '22222222-2222-4222-8222-222222222222',
    chave: 'ti',
    nome: 'TI · Dev',
    glifo: '■',
    hue: 160,
    chroma: 0.13,
    tituloQuadro: 'Pauta do time',
    campo1Label: 'Sprint',
    campo2Label: 'Estimativa',
    mono: true,
    ...sobrescrever,
  });
}

/** Ofício de Produtividade: quadro de uma pessoa só, sem responsável. */
export function oficioSolo(sobrescrever: Partial<Oficio> = {}): Oficio {
  return oficioMarketing({
    id: '33333333-3333-4333-8333-333333333333',
    chave: 'prod',
    nome: 'Produtividade',
    glifo: '●',
    hue: 265,
    chroma: 0.13,
    tituloQuadro: 'Minha semana',
    campo1Label: 'Contexto',
    campo2Label: 'Energia',
    solo: true,
    ...sobrescrever,
  });
}

export function pauta(sobrescrever: Partial<Pauta> = {}): Pauta {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    workspaceId: 'wwwwwwww-wwww-4www-8www-wwwwwwwwwwww',
    quadroId: 'qqqqqqqq-qqqq-4qqq-8qqq-qqqqqqqqqqqq',
    oficioId: '11111111-1111-4111-8111-111111111111',
    etapaId: 'e1',
    titulo: 'Série: bastidores do estúdio',
    campo1: 'Instagram',
    campo2: 'Marca · mensal',
    prazo: null,
    responsavelId: null,
    posicao: 1000,
    arquivadaEm: null,
    ...sobrescrever,
  };
}

export function membro(sobrescrever: Partial<Membro> = {}): Membro {
  return {
    workspaceId: 'wwwwwwww-wwww-4www-8www-wwwwwwwwwwww',
    userId: 'uuuuuuuu-uuuu-4uuu-8uuu-uuuuuuuuuuuu',
    papel: 'membro',
    nome: 'Marina Alves',
    iniciais: 'MA',
    hue: 45,
    email: 'marina@exemplo.test',
    ...sobrescrever,
  };
}

/** Data em ISO relativa a hoje, para testar prazo sem congelar o relógio. */
export function emDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}
