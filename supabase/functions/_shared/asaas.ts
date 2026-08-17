/**
 * Cliente da API da Asaas (v3).
 *
 * Decisão que define este arquivo: **não implementamos checkout.** Criamos a
 * assinatura e mandamos o usuário para a fatura hospedada pela Asaas. Nenhum
 * número de cartão, CVV ou token de cartão entra na nossa infraestrutura, em
 * momento algum.
 *
 * Isso custa uma navegação a mais no fluxo e nos mantém no SAQ-A do PCI-DSS —
 * o escopo mais raso que existe. Um checkout próprio economizaria esse clique e
 * traria junto: campo de cartão sob nossa responsabilidade, auditoria de PCI,
 * e o pior tipo de incidente possível para um SaaS pequeno. O clique é barato.
 *
 * Referência: https://docs.asaas.com/reference
 */

import { asaasAmbiente, asaasApiKey } from './ambiente.ts';
import { ErroApi } from './http.ts';

const BASES: Record<string, string> = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  producao: 'https://api.asaas.com/v3',
};

/** Estoura se a Asaas demorar demais — não penduramos o usuário indefinidamente. */
const TIMEOUT_MS = 15_000;

interface RespostaErroAsaas {
  errors?: Array<{ code?: string; description?: string }>;
}

async function chamar<T>(
  caminho: string,
  init: { method: 'GET' | 'POST' | 'DELETE'; body?: unknown } = { method: 'GET' },
): Promise<T> {
  const base = BASES[asaasAmbiente()];
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TIMEOUT_MS);

  let resposta: Response;
  try {
    resposta = await fetch(`${base}${caminho}`, {
      method: init.method,
      headers: {
        access_token: asaasApiKey(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // A Asaas pede identificação do integrador nos logs dela.
        'User-Agent': 'Pautaria/1.0',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controle.signal,
    });
  } catch (erro) {
    // Log sem corpo e sem chave: o que interessa é o caminho e o motivo.
    console.error('[asaas] falha de rede', init.method, caminho, String(erro));
    throw new ErroApi(
      'erro_no_provedor',
      'Não conseguimos falar com o processador de pagamento. Tente de novo em instantes.',
    );
  } finally {
    clearTimeout(timer);
  }

  const texto = await resposta.text();
  const corpo = texto ? JSON.parse(texto) : {};

  if (!resposta.ok) {
    const detalhe = (corpo as RespostaErroAsaas).errors?.[0];
    // O código da Asaas vai para o log; ao usuário vai a descrição, que a
    // Asaas escreve em português e costuma ser acionável ("CPF inválido").
    console.error('[asaas] erro', resposta.status, caminho, detalhe?.code ?? 'sem_codigo');
    throw new ErroApi(
      'erro_no_provedor',
      detalhe?.description ?? 'O processador de pagamento recusou a operação.',
      { status: resposta.status, code: detalhe?.code },
    );
  }

  return corpo as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Clientes
// ─────────────────────────────────────────────────────────────────────────────

export interface ClienteAsaas {
  id: string;
  name: string;
  email: string;
  cpfCnpj: string;
}

export function criarCliente(entrada: {
  name: string;
  email: string;
  cpfCnpj: string;
  mobilePhone?: string;
  externalReference: string;
  notificationDisabled?: boolean;
}): Promise<ClienteAsaas> {
  return chamar<ClienteAsaas>('/customers', { method: 'POST', body: entrada });
}

export async function buscarClientePorDocumento(
  cpfCnpj: string,
): Promise<ClienteAsaas | null> {
  const resposta = await chamar<{ data: ClienteAsaas[] }>(
    `/customers?cpfCnpj=${encodeURIComponent(cpfCnpj)}&limit=1`,
  );
  return resposta.data?.[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Assinaturas
// ─────────────────────────────────────────────────────────────────────────────

export interface AssinaturaAsaas {
  id: string;
  customer: string;
  value: number;
  cycle: string;
  status: string;
  nextDueDate: string;
  description?: string;
}

export function criarAssinatura(entrada: {
  customer: string;
  billingType: 'UNDEFINED' | 'BOLETO' | 'CREDIT_CARD' | 'PIX';
  value: number;
  nextDueDate: string;
  cycle: 'MONTHLY' | 'YEARLY';
  description: string;
  externalReference: string;
}): Promise<AssinaturaAsaas> {
  return chamar<AssinaturaAsaas>('/subscriptions', { method: 'POST', body: entrada });
}

export function cancelarAssinatura(id: string): Promise<{ deleted: boolean; id: string }> {
  return chamar(`/subscriptions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export interface CobrancaAsaas {
  id: string;
  customer: string;
  subscription?: string | null;
  value: number;
  status: string;
  dueDate: string;
  billingType?: string;
  invoiceUrl?: string;
  paymentDate?: string | null;
}

export async function cobrancasDaAssinatura(id: string): Promise<CobrancaAsaas[]> {
  const resposta = await chamar<{ data: CobrancaAsaas[] }>(
    `/subscriptions/${encodeURIComponent(id)}/payments?limit=20`,
  );
  return resposta.data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversões
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Centavos ↔ reais.
 *
 * O banco guarda inteiro em centavos e a Asaas fala em decimal de reais. A
 * conversão vive aqui, num lugar só, porque dinheiro em ponto flutuante
 * espalhado pelo código é como se perde R$ 0,01 por transação até alguém
 * reclamar. `Math.round` fecha a borda de arredondamento na volta.
 */
export const centavosParaReais = (centavos: number): number => centavos / 100;
export const reaisParaCentavos = (reais: number): number => Math.round(reais * 100);

/** Data no formato que a Asaas espera (YYYY-MM-DD), em horário de Brasília. */
export function dataAsaas(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/** Primeira cobrança: hoje. O acesso só é liberado quando ela for confirmada. */
export function primeiroVencimento(): string {
  return dataAsaas(new Date());
}

export const CICLO_ASAAS: Record<'mensal' | 'anual', 'MONTHLY' | 'YEARLY'> = {
  mensal: 'MONTHLY',
  anual: 'YEARLY',
};

/** Avança uma data em um ciclo de cobrança. Usado para calcular o fim do período. */
export function avancarCiclo(base: Date, ciclo: 'mensal' | 'anual'): Date {
  const fim = new Date(base.getTime());
  if (ciclo === 'anual') fim.setUTCFullYear(fim.getUTCFullYear() + 1);
  else fim.setUTCMonth(fim.getUTCMonth() + 1);
  return fim;
}
